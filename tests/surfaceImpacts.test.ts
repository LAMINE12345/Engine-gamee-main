import { describe, expect, it } from 'vitest';
import {
  RippleField,
  GroundHeightSampler,
  rainImpactsThisFrame,
  rainRipple,
  splashDroplets,
  splashRipple,
  splashStrength,
  DEFAULT_RAIN_TUNING,
  DEFAULT_SPLASH_TUNING,
} from '../lib/vfx/surfaceImpacts';

/**
 * `surfaceImpacts.ts` est volontairement sans Three.js : toute la physique
 * d'impact (rayons, opacités, cadences, échantillonnage du sol) est testable
 * ici en environnement node, sans canvas ni WebGL.
 */

// =========================================================================
// RippleField
// =========================================================================

const baseRipple = (over: Partial<Parameters<RippleField['spawn']>[0]> = {}) => ({
  x: 1,
  y: 0,
  z: 2,
  maxRadius: 2,
  lifetime: 1,
  ...over,
});

describe('vfx/surfaceImpacts — RippleField', () => {
  it('expanse une onde du rayon initial au rayon max', () => {
    const f = new RippleField(4);
    f.spawn(baseRipple({ startRadius: 0, maxRadius: 3, lifetime: 1 }));

    expect(f.collect()[0].radius).toBeCloseTo(0, 5);

    f.update(0.5);
    // easeOutCubic à t=0.5 → 1-(0.5)³ = 0.875
    expect(f.collect()[0].radius).toBeCloseTo(3 * 0.875, 4);

    f.update(0.5);
    // Le second update cumulatif doit passer la durée de vie : l'onde meurt.
    expect(f.activeCount).toBe(0);
  });

  it('part du rayon initial quand il est fourni', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple({ startRadius: 0.5, maxRadius: 3, lifetime: 1 }));
    expect(f.collect()[0].radius).toBeCloseTo(0.5, 5);
  });

  it('atténue l’opacité en quadratique jusqu’à zéro', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple({ strength: 1, lifetime: 1 }));
    expect(f.collect()[0].opacity).toBeCloseTo(1, 5);

    f.update(0.5);
    // (1-t)² = 0.25
    expect(f.collect()[0].opacity).toBeCloseTo(0.25, 5);
  });

  it('respecte la force demandée (opacité max = strength)', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple({ strength: 0.4, lifetime: 1 }));
    expect(f.collect()[0].opacity).toBeCloseTo(0.4, 5);
  });

  it('libère un slot après la durée de vie', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple({ lifetime: 0.5 }));
    expect(f.activeCount).toBe(1);
    f.update(0.6);
    expect(f.activeCount).toBe(0);
  });

  it('ne fait rien sur un dt nul ou négatif (pause / onglet figé)', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple({ lifetime: 1 }));
    f.update(0);
    f.update(-1);
    expect(f.activeCount).toBe(1);
    expect(f.collect()[0].radius).toBeCloseTo(0, 5);
  });

  it('ne déborde jamais de sa capacité', () => {
    const f = new RippleField(3);
    for (let i = 0; i < 50; i++) f.spawn(baseRipple({ lifetime: 10 }));
    expect(f.activeCount).toBe(3);
    expect(f.collect().length).toBe(3);
  });

  it('recycle le plus vieux quand le pool est saturé', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple({ x: 1, lifetime: 10 }));
    f.update(0.5);
    f.spawn(baseRipple({ x: 2, lifetime: 10 }));
    f.update(0.5);
    // Le premier slot est maintenant plus âgé : il doit être réutilisé.
    f.spawn(baseRipple({ x: 3, lifetime: 10 }));

    const xs = f.collect().map((r) => r.x).sort((a, b) => a - b);
    expect(xs).toEqual([2, 3]);
  });

  it('marque la saturation quand toutes les places sont prises', () => {
    const f = new RippleField(2);
    expect(f.saturated).toBe(false);
    f.spawn(baseRipple({ lifetime: 10 }));
    f.spawn(baseRipple({ lifetime: 10 }));
    expect(f.saturated).toBe(true);
  });

  it('conserve la normale et la teinte fournies', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple({ nx: 0, ny: 0.7, nz: 0.7, tint: [0.2, 0.4, 0.6] }));
    const r = f.collect()[0];
    expect([r.nx, r.ny, r.nz]).toEqual([0, 0.7, 0.7]);
    expect([r.r, r.g, r.b]).toEqual([0.2, 0.4, 0.6]);
  });

  it('défaut : normale verticale unitaire, teinte blanche', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple());
    const r = f.collect()[0];
    expect([r.nx, r.ny, r.nz]).toEqual([0, 1, 0]);
    expect([r.r, r.g, r.b]).toEqual([1, 1, 1]);
  });

  it('clear() vide tout le pool', () => {
    const f = new RippleField(4);
    f.spawn(baseRipple());
    f.spawn(baseRipple());
    f.clear();
    expect(f.activeCount).toBe(0);
    expect(f.collect()).toEqual([]);
  });

  it('garantit une capacité >= 1 même avec une entrée absurde', () => {
    const f = new RippleField(0);
    expect(f.capacity).toBeGreaterThanOrEqual(1);
    expect(f.spawn(baseRipple())).toBeGreaterThanOrEqual(0);
  });

  it('borne les paramètres invalides (rayon nul, durée nulle, force hors bornes)', () => {
    const f = new RippleField(2);
    f.spawn(baseRipple({ maxRadius: 0, lifetime: 0, strength: 5, startRadius: -3 }));
    const r = f.collect()[0];
    expect(r.maxRadius).toBeGreaterThan(0);
    expect(r.lifetime).toBeGreaterThan(0);
    expect(r.strength).toBe(1);
    expect(r.startRadius).toBe(0);
  });
});

// =========================================================================
// splashStrength
// =========================================================================

describe('vfx/surfaceImpacts — splashStrength', () => {
  const { minImpactSpeed, maxImpactSpeed } = DEFAULT_SPLASH_TUNING;

  it('ne déclenche rien sous la vitesse minimale', () => {
    expect(splashStrength(0)).toBe(0);
    expect(splashStrength(minImpactSpeed)).toBe(0);
    expect(splashStrength(minImpactSpeed - 1)).toBe(0);
  });

  it('sature à la vitesse maximale', () => {
    expect(splashStrength(maxImpactSpeed)).toBe(1);
    expect(splashStrength(maxImpactSpeed * 3)).toBe(1);
  });

  it('interpole linéairement entre les deux bornes', () => {
    const mid = (minImpactSpeed + maxImpactSpeed) / 2;
    expect(splashStrength(mid)).toBeCloseTo(0.5, 5);
  });

  it('prend la valeur absolue (sortie de l’eau = vitesse négative)', () => {
    const mid = (minImpactSpeed + maxImpactSpeed) / 2;
    expect(splashStrength(-(maxImpactSpeed + 2))).toBe(1);
    expect(splashStrength(-mid)).toBeCloseTo(0.5, 5);
  });

  it('reste unitaire même avec un tuning incohérent', () => {
    const broken = { ...DEFAULT_SPLASH_TUNING, minImpactSpeed: 5, maxImpactSpeed: 5 };
    expect(splashStrength(10, broken)).toBe(0);
  });
});

// =========================================================================
// Paramètres d'éclaboussure
// =========================================================================

describe('vfx/surfaceImpacts — splashRipple / splashDroplets', () => {
  it('grossit le rayon et l’opacité avec la force', () => {
    const weak = splashRipple(0);
    const strong = splashRipple(1);
    expect(strong.maxRadius).toBeGreaterThan(weak.maxRadius);
    expect(strong.strength).toBeGreaterThan(weak.strength);
    expect(strong.lifetime).toBeGreaterThan(weak.lifetime);
  });

  it('reste sous le rayon max de tuning même à force 1', () => {
    expect(splashRipple(1).maxRadius).toBeLessThanOrEqual(DEFAULT_SPLASH_TUNING.maxRadius + 1e-9);
  });

  it('brille toujours un peu (un clapotis reste visible)', () => {
    expect(splashRipple(0).strength).toBeGreaterThan(0);
  });

  it('scale le nombre de gouttelettes avec la force', () => {
    expect(splashDroplets(1).count).toBeGreaterThan(splashDroplets(0.1).count);
    expect(splashDroplets(1).count).toBeLessThanOrEqual(DEFAULT_SPLASH_TUNING.maxDroplets);
  });

  it('augmente la vitesse de projection avec la force', () => {
    expect(splashDroplets(1).speed).toBeGreaterThan(splashDroplets(0).speed);
  });

  it('borne les forces hors intervalle [0,1]', () => {
    expect(splashDroplets(9).count).toBe(splashDroplets(1).count);
    expect(splashDroplets(-3).count).toBe(splashDroplets(0).count);
    expect(splashRipple(9).maxRadius).toBe(splashRipple(1).maxRadius);
  });
});

// =========================================================================
// Budget d'impacts de pluie
// =========================================================================

describe('vfx/surfaceImpacts — rainImpactsThisFrame', () => {
  it('proportionne le budget à l’intensité', () => {
    expect(rainImpactsThisFrame(1, 1 / 60)).toBeGreaterThan(rainImpactsThisFrame(0.2, 1 / 60));
  });

  it('ne produit rien sans pluie', () => {
    expect(rainImpactsThisFrame(0, 1 / 60)).toBe(0);
    expect(rainImpactsThisFrame(0.5, 0)).toBe(0);
    expect(rainImpactsThisFrame(0.5, -0.1)).toBe(0);
  });

  it('reste fractionnaire : une frame à 60 fps vaut moins d’un impact', () => {
    // 26 impacts/s ÷ 60 fps ≈ 0,43. C'est l'accumulateur de l'appelant qui
    // déclenche un impact une frame sur deux ou trois ; un arrondi ici
    // vaudrait 0 à chaque frame et supprimerait la pluie.
    const perFrame = rainImpactsThisFrame(1, 1 / 60);
    expect(perFrame).toBeGreaterThan(0);
    expect(perFrame).toBeLessThan(1);
  });

  it('donne le bon débit cumulé sur une seconde', () => {
    let total = 0;
    for (let i = 0; i < 60; i++) total += rainImpactsThisFrame(1, 1 / 60);
    expect(total).toBeCloseTo(DEFAULT_RAIN_TUNING.impactsPerSecond, 1);
  });

  it('bride le dt pour survivre à un onglet en arrière-plan', () => {
    // Un dt de 30 s est ramené au plafond de 0,1 s : le budget d'une seule
    // frame, pas 30 secondes d'impacts d'un coup.
    expect(rainImpactsThisFrame(1, 30)).toBeCloseTo(DEFAULT_RAIN_TUNING.impactsPerSecond * 0.1, 5);
    expect(rainImpactsThisFrame(1, 30)).toBeLessThanOrEqual(DEFAULT_RAIN_TUNING.maxPerFrame);
  });

  it('ne dépasse jamais maxPerFrame', () => {
    for (const intensity of [0.5, 1, 2, 10]) {
      expect(rainImpactsThisFrame(intensity, 1)).toBeLessThanOrEqual(DEFAULT_RAIN_TUNING.maxPerFrame);
    }
  });
});

describe('vfx/surfaceImpacts — rainRipple', () => {
  it('reste petit par rapport à une éclaboussure', () => {
    expect(rainRipple(1).maxRadius).toBeLessThan(splashRipple(1).maxRadius);
  });

  it('scale avec l’intensité de la pluie', () => {
    expect(rainRipple(1).maxRadius).toBeGreaterThan(rainRipple(0.1).maxRadius);
  });
});

// =========================================================================
// GroundHeightSampler
// =========================================================================

describe('vfx/surfaceImpacts — GroundHeightSampler', () => {
  const flat = () => 3;
  const slope = (x: number) => x * 0.5;

  it('sonde la source tant que la grille n’est pas bâtie', () => {
    const s = new GroundHeightSampler(flat);
    expect(s.heightAt(10, 10)).toBe(3);
  });

  it('reconstruit la grille au premier refresh', () => {
    const s = new GroundHeightSampler(flat, { resolution: 5, extent: 20 });
    expect(s.refresh(0, 0, 0.016)).toBe(true);
    expect(s.heightAt(0, 0)).toBeCloseTo(3, 5);
  });

  it('interpole une pente linéaire', () => {
    const s = new GroundHeightSampler(slope, { resolution: 9, extent: 40 });
    s.refresh(0, 0, 0.016);
    // Au centre x=0 → h=0 ; interpolation doit rester proche de la vraie pente.
    expect(s.heightAt(0, 0)).toBeCloseTo(0, 1);
    expect(s.heightAt(2, 0)).toBeCloseTo(1, 1);
  });

  it('reconstruit quand la caméra dépasse la distance de rafraîchissement', () => {
    let calls = 0;
    const s = new GroundHeightSampler(
      (x) => {
        calls++;
        return x;
      },
      { resolution: 4, extent: 10, rebuildDistance: 5, maxAge: 999 }
    );
    s.refresh(0, 0, 0.016);
    const afterFirst = calls;
    s.refresh(1, 0, 0.016);
    expect(calls).toBe(afterFirst); // pas encore bougé
    s.refresh(20, 0, 0.016);
    expect(calls).toBeGreaterThan(afterFirst);
  });

  it('reconstruit après maxAge même sans mouvement', () => {
    let calls = 0;
    const s = new GroundHeightSampler(
      (x) => {
        calls++;
        return x;
      },
      { resolution: 3, extent: 10, rebuildDistance: 999, maxAge: 0.2 }
    );
    s.refresh(0, 0, 0.016);
    const afterFirst = calls;
    s.refresh(0, 0, 0.016); // pas périmé
    expect(calls).toBe(afterFirst);
    s.refresh(0, 0, 0.5); // périmé
    expect(calls).toBeGreaterThan(afterFirst);
  });

  it('borne les requêtes hors de la grille (pas de NaN)', () => {
    const s = new GroundHeightSampler(flat, { resolution: 5, extent: 20 });
    s.refresh(0, 0, 0.016);
    for (const [x, z] of [
      [9999, 9999],
      [-9999, -9999],
      [0, 9999],
      [-9999, 0],
    ]) {
      expect(Number.isFinite(s.heightAt(x, z))).toBe(true);
    }
  });

  it('traite une hauteur NaN comme zéro (terrain non généré)', () => {
    const s = new GroundHeightSampler(() => NaN, { resolution: 3, extent: 10 });
    s.refresh(0, 0, 0.016);
    expect(s.heightAt(0, 0)).toBe(0);
  });

  it('rebuild() direct reconstruit sans condition de distance', () => {
    const s = new GroundHeightSampler(() => 7, { resolution: 3, extent: 10, rebuildDistance: 999 });
    s.refresh(0, 0, 0.016);
    expect(s.heightAt(0, 0)).toBe(7);
  });

  it('dispose() retombe sur la sonde directe', () => {
    const s = new GroundHeightSampler(() => 42, { resolution: 3, extent: 10 });
    s.refresh(0, 0, 0.016);
    s.dispose();
    expect(s.heightAt(1, 1)).toBe(42);
  });

  it('force une résolution minimale de 2', () => {
    const s = new GroundHeightSampler(() => 0, { resolution: 1 });
    expect(s.heightAt(0, 0)).toBe(0);
  });
});
