/**
 * tests/cameraTrailing.test.ts — mathématique pure de la caméra à traîne.
 *
 * Aucun three.js, aucun DOM : le module est vérifiable seul, comme inputLogic.
 */

import { describe, it, expect } from 'vitest';
import {
  applyLookAhead,
  computeTrail,
  speedFov,
  TRAIL_PRESETS,
} from '../lib/logic/cameraTrailing';

const DT = 1 / 60;
const V = (x: number, y: number, z: number) => ({ x, y, z });

describe('cameraTrailing — applyLookAhead', () => {
  it('avance la visée dans le sens du déplacement', () => {
    const out = applyLookAhead(V(10, 0, 0), V(9, 0, 0), 1.2);
    expect(out.x).toBeGreaterThan(10);
  });

  it('ne bouge PAS une cible à l\'arrêt', () => {
    // C'est le cas qui manque de repère sans look-ahead : à l'arrêt, on ne
    // doit rien inventer.
    const out = applyLookAhead(V(5, 0, 0), V(5, 0, 0), 1.2);
    expect(out).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('avance de zéro si le réglage vaut zéro', () => {
    const out = applyLookAhead(V(10, 0, 0), V(9, 0, 0), 0);
    expect(out.x).toBeCloseTo(10, 6);
  });

  it('borne l\'avance après un téléport', () => {
    // Un respawn déplace la cible de 500 m : sans borne, la caméra partirait
    // à des centaines de mètres et le retour serait visible.
    const out = applyLookAhead(V(500, 0, 0), V(0, 0, 0), 5);
    expect(out.x).toBeLessThan(510);
  });
});

describe('cameraTrailing — computeTrail', () => {
  const base = V(0, 3, 6);
  const target = V(0, 0, 0);

  it('converge vers la position idéale sans la dépasser', () => {
    // Lissage exponentiel : jamais d'oscillation, contrairement à un ressort.
    let current = V(0, 0, 0);
    let previous = { ...target };
    for (let i = 0; i < 240; i++) {
      const r = computeTrail(current, previous, {
        base, target, smoothing: 6, minDistance: 1, dt: DT, style: 'sprint', lookAhead: 0,
      });
      current = r.position;
      previous = { ...target };
      expect(current.z).toBeLessThanOrEqual(6.0001);
    }
    expect(current.z).toBeCloseTo(6, 1);
  });

  it('un fort retard met plus de temps à rattraper', () => {
    const step = (smoothing: number) => {
      const r = computeTrail(V(0, 0, 0), { ...target }, {
        base, target, smoothing, minDistance: 1, dt: DT, style: 'sprint', lookAhead: 0,
      });
      return r.position.z;
    };
    // smoothing est un taux (1/lag) : plus bas = plus lent.
    expect(step(1)).toBeLessThan(step(6));
    expect(step(6)).toBeLessThan(step(20));
  });

  it('conserve la distance minimale : la caméra ne traverse pas la cible', () => {
    // Base posée SUR la cible : sans minDistance, l'offset valant zéro, la
    // caméra resterait collée au sujet. On vérifie la convergence : après
    // quelques frames elle s'est éloignée jusqu'à la distance plancher.
    let current = { ...target };
    let distance = 0;
    for (let i = 0; i < 120; i++) {
      const r = computeTrail(current, { ...target }, {
        base: target, target, smoothing: 20, minDistance: 3, dt: DT, style: 'tight', lookAhead: 0,
      });
      current = r.position;
      distance = r.distance;
    }
    expect(distance).toBeGreaterThanOrEqual(2.99);
    expect(distance).toBeLessThan(3.1);
  });

  it('signale un retard non nul juste après un déplacement', () => {
    const r = computeTrail(V(0, 0, 0), V(-1, 0, 0), {
      base: V(1, 3, 6), target: V(0, 0, 0), smoothing: 2, minDistance: 1, dt: DT,
      style: 'cinematic', lookAhead: 0,
    });
    expect(r.lag).toBeGreaterThan(0);
  });

  it('vise toujours la cible, jamais un point décalé', () => {
    const r = computeTrail(V(0, 0, 0), V(-1, 0, 0), {
      base, target: V(9, 2, 9), smoothing: 3, minDistance: 1, dt: DT, style: 'drift', lookAhead: 2,
    });
    expect(r.lookAt).toEqual({ x: 9, y: 2, z: 9 });
  });

  it('reste stable avec un dt aberrant (0, négatif, énorme, NaN)', () => {
    // Un dt de frame corrompu ne doit JAMAIS produire une caméra à NaN.
    for (const dt of [0, -1, 10, Number.NaN]) {
      const r = computeTrail(V(0, 0, 0), { ...target }, {
        base, target, smoothing: 6, minDistance: 1, dt, style: 'sprint', lookAhead: 0,
      });
      expect(Number.isFinite(r.position.x), `dt=${dt}`).toBe(true);
      expect(Number.isFinite(r.position.y), `dt=${dt}`).toBe(true);
      expect(Number.isFinite(r.position.z), `dt=${dt}`).toBe(true);
      expect(Number.isFinite(r.distance), `dt=${dt}`).toBe(true);
    }
  });

  it('reste stable avec un smoothing aberrant', () => {
    for (const s of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = computeTrail(V(0, 0, 0), { ...target }, {
        base, target, smoothing: s, minDistance: 1, dt: DT, style: 'sprint', lookAhead: 0,
      });
      expect(Number.isFinite(r.position.x), `smoothing=${s}`).toBe(true);
    }
  });

  it('les quatre styles existent et sont ordonnés du plus collé au plus lent', () => {
    const s = TRAIL_PRESETS;
    expect(s.tight.smoothing).toBeGreaterThan(s.sprint.smoothing);
    expect(s.sprint.smoothing).toBeGreaterThan(s.cinematic.smoothing);
    expect(s.cinematic.smoothing).toBeGreaterThan(s.drift.smoothing);
    for (const p of Object.values(s)) expect(p.label).toBeTruthy();
  });
});

describe('cameraTrailing — speedFov', () => {
  it('ouvre le champ avec la vitesse', () => {
    expect(speedFov(60, 0, 30, 20)).toBeCloseTo(60, 6);
    expect(speedFov(60, 30, 30, 20)).toBeGreaterThan(speedFov(60, 10, 30, 20));
  });

  it('borne le champ dans une plage visuellement acceptable', () => {
    // Sous ~20° c'est déformant, au-delà de ~110° l'effet de bord gêne.
    expect(speedFov(60, 9999, 30, 200)).toBeLessThanOrEqual(110);
    expect(speedFov(60, -50, 30, 20)).toBeGreaterThanOrEqual(20);
  });

  it('ne produit jamais de NaN', () => {
    for (const s of [0, -1, Number.NaN, 1e9]) {
      expect(Number.isFinite(speedFov(60, s, 30, 20))).toBe(true);
    }
  });
});
