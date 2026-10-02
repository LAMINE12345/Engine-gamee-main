/**
 * surfaceImpacts — logique pure des impacts de surface.
 * =========================================================================
 * Deux effets demandés par l'éditeur :
 *   1. un objet qui touche l'eau → éclaboussure (anneau d'écume + gouttelettes) ;
 *   2. la pluie qui tombe sur le sol → impacts (ondes circulaires + éclaboussures).
 *
 * Ce module ne connaît PAS Three.js : il ne produit que des données
 * (positions, rayons, opacités, forces). Le rendu est assuré par
 * `lib/vfx/SurfaceImpactFX.ts`, qui lit ces données. Conséquence : toute la
 * physique d'impact est testable sous vitest en environnement node.
 */

// =========================================================================
// Ondes circulaires (ripples)
// =========================================================================

export interface RippleSpawn {
  x: number;
  y: number;
  z: number;
  /** Normale de la surface (pour poser l'anneau à plat sur l'eau). */
  nx?: number;
  ny?: number;
  nz?: number;
  /** Rayon final de l'anneau, en mètres. */
  maxRadius: number;
  /** Durée de vie, en secondes. */
  lifetime: number;
  /** Opacité de départ, 0..1. */
  strength?: number;
  /** Rayon initial (0 = point d'impact). */
  startRadius?: number;
  /** Teinte linéaire (RVB, 0..1). */
  tint?: [number, number, number];
}

export interface ActiveRipple {
  index: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  startRadius: number;
  maxRadius: number;
  lifetime: number;
  strength: number;
  age: number;
  /** Rayon courant en mètres. */
  radius: number;
  /** Opacité courante, 0..1. */
  opacity: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Pool d'ondes circulaires à taille fixe.
 *
 * Aucun `new` par impact : le rendu alloue une fois `capacity` anneaux et
 * recycle les plus vieux quand le pool est saturé. Un pool saturé est un
 * symptôme (trop d'impacts par frame), pas une raison de_allouer — on
 * recycle donc le plus aged plutôt que d'échouer.
 */
export class RippleField {
  public readonly capacity: number;
  private readonly slots: Array<ActiveRipple | null>;

  constructor(capacity = 128) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.slots = new Array<ActiveRipple | null>(this.capacity).fill(null);
  }

  get activeCount(): number {
    let n = 0;
    for (const s of this.slots) if (s) n++;
    return n;
  }

  /** Nombre d'impactsSpawn refusés faute de place (pool saturé). */
  get saturated(): boolean {
    return this.activeCount >= this.capacity;
  }

  /**
   * Fait apparaître une onde. Retourne l'index du slot utilisé, ou -1 si le
   * champ est vide (capacité nulle — impossible en pratique).
   */
  spawn(opts: RippleSpawn): number {
    const index = this.claimSlot();
    if (index < 0) return -1;

    this.slots[index] = {
      index,
      x: opts.x,
      y: opts.y,
      z: opts.z,
      nx: opts.nx ?? 0,
      ny: opts.ny ?? 1,
      nz: opts.nz ?? 0,
      startRadius: Math.max(0, opts.startRadius ?? 0),
      maxRadius: Math.max(0.01, opts.maxRadius),
      lifetime: Math.max(0.05, opts.lifetime),
      strength: clamp01(opts.strength ?? 0.8),
      age: 0,
      radius: 0,
      opacity: 0,
      r: opts.tint?.[0] ?? 1,
      g: opts.tint?.[1] ?? 1,
      b: opts.tint?.[2] ?? 1,
    };
    this.refresh(index);
    return index;
  }

  /** Avance toutes les ondes et recycle celles qui sont mortes. */
  update(dt: number): void {
    if (dt <= 0) return;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s) continue;
      s.age += dt;
      if (s.age >= s.lifetime) {
        this.slots[i] = null;
        continue;
      }
      this.refresh(i);
    }
  }

  /** Snapshot des ondes actives (allocation proportionnelle, appelée une fois par frame). */
  collect(): ActiveRipple[] {
    const out: ActiveRipple[] = [];
    for (const s of this.slots) if (s) out.push(s);
    return out;
  }

  clear(): void {
    this.slots.fill(null);
  }

  /**
   * @private
   * Recalcule rayon/opacité d'un slot à partir de son âge.
   * Expansion en easeOutCubic (l'onde jaillit vite puis ralentit) et fondu
   * quadratique — c'est ce qui donne l'impression d'une onde physique.
   */
  private refresh(i: number): void {
    const s = this.slots[i];
    if (!s) return;
    const t = clamp01(s.age / s.lifetime);
    const eased = 1 - Math.pow(1 - t, 3);
    s.radius = s.startRadius + (s.maxRadius - s.startRadius) * eased;
    s.opacity = s.strength * (1 - t) * (1 - t);
  }

  /** @private Trouve un slot libre, sinon recycle le plus vieux. */
  private claimSlot(): number {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.slots[i]) return i;
    }
    let oldest = 0;
    for (let i = 1; i < this.capacity; i++) {
      const a = this.slots[i]!.age;
      const b = this.slots[oldest]!.age;
      if (a > b) oldest = i;
    }
    return oldest;
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// =========================================================================
// Paramètres d'impact (tunables, exposés pour l'inspecteur et les tests)
// =========================================================================

export interface SplashTuning {
  /** Vitesse (m/s) en dessous de laquelle l'entrée dans l'eau est ignorée. */
  minImpactSpeed: number;
  /** Vitesse (m/s) qui sature la force de l'éclaboussure. */
  maxImpactSpeed: number;
  /** Rayon de l'anneau d'écume pour une entrée à vitesse maximale. */
  maxRadius: number;
  /** Durée de vie de l'anneau d'écume. */
  ringLifetime: number;
  /** Nombre de gouttelettes à vitesse maximale. */
  maxDroplets: number;
  /** Vitesse verticale initiale des gouttelettes (m/s). */
  dropletSpeed: number;
  /** Durée de vie d'une gouttelette. */
  dropletLifetime: number;
}

export const DEFAULT_SPLASH_TUNING: SplashTuning = {
  minImpactSpeed: 1.2,
  maxImpactSpeed: 9,
  maxRadius: 2.6,
  ringLifetime: 0.85,
  maxDroplets: 26,
  dropletSpeed: 4.2,
  dropletLifetime: 0.7,
};

export interface RainTuning {
  /** Impacts par seconde à intensité 1.0. */
  impactsPerSecond: number;
  /** Rayon d'un impact de pluie. */
  radius: number;
  /** Durée de vie d'un impact de pluie. */
  lifetime: number;
  /** Amplitude de la projection des gouttes (0..1). */
  splashHeight: number;
  /** Impacts maxi déclenchés sur une seule frame (garde-fou). */
  maxPerFrame: number;
}

export const DEFAULT_RAIN_TUNING: RainTuning = {
  impactsPerSecond: 26,
  radius: 0.34,
  lifetime: 0.42,
  splashHeight: 0.5,
  maxPerFrame: 28,
};

/**
 * Force d'éclaboussure normalisée à partir de la vitesse d'entrée.
 * En dessous de `min` → 0 (une simple intersection ne doit pas éclabousser),
 * au-dessus de `max` → 1 (saturé).
 */
export function splashStrength(
  impactSpeed: number,
  tuning: SplashTuning = DEFAULT_SPLASH_TUNING
): number {
  const span = tuning.maxImpactSpeed - tuning.minImpactSpeed;
  if (span <= 0) return 0;
  return clamp01((Math.abs(impactSpeed) - tuning.minImpactSpeed) / span);
}

/** Partie « aspect » d'une onde, sans la position : ce que fabriquent les presets. */
export type RippleLook = Omit<RippleSpawn, 'x' | 'y' | 'z' | 'strength' | 'startRadius' | 'tint'> &
  Required<Pick<RippleSpawn, 'strength' | 'startRadius'>> & { tint: [number, number, number] };

/** Anneau d'écume pour une éclaboussure de force `strength` (0..1). */
export function splashRipple(
  strength: number,
  tuning: SplashTuning = DEFAULT_SPLASH_TUNING
): RippleLook {
  const s = clamp01(strength);
  return {
    maxRadius: tuning.maxRadius * (0.35 + 0.65 * s),
    lifetime: tuning.ringLifetime * (0.6 + 0.4 * s),
    // Un impact faible = un simple clapotis, pas un anneau d'écume opaque.
    strength: 0.25 + 0.6 * s,
    startRadius: 0.12,
    tint: [0.88, 0.95, 1],
  };
}

/** Gouttelettes projetées pour une éclaboussure de force `strength` (0..1). */
export function splashDroplets(
  strength: number
): { count: number; speed: number; lifetime: number } {
  const s = clamp01(strength);
  return {
    count: Math.round(DEFAULT_SPLASH_TUNING.maxDroplets * (0.25 + 0.75 * s)),
    speed: DEFAULT_SPLASH_TUNING.dropletSpeed * (0.45 + 0.55 * s),
    lifetime: DEFAULT_SPLASH_TUNING.dropletLifetime * (0.7 + 0.3 * s),
  };
}

/** Onde d'impact au sol pour une goutte de pluie. */
export function rainRipple(
  strength: number,
  tuning: RainTuning = DEFAULT_RAIN_TUNING
): RippleLook {
  const s = clamp01(strength);
  return {
    maxRadius: tuning.radius * (0.7 + 0.6 * s),
    lifetime: tuning.lifetime * (0.75 + 0.5 * s),
    strength: 0.2 + 0.45 * s,
    startRadius: 0.02,
    tint: [0.7, 0.86, 1],
  };
}

/**
 * Budget d'impacts de pluie à ajouter à la frame (fractionnaire).
 *
 * La valeur returned est **fractionnaire** : à 26 impacts/s et 60 fps, une
 * frame « vaut » 0,43 impact. Un arrondi ici ferait disparaître la pluie
 * (0 à chaque frame). C'est à l'appelant d'accumuler puis de convertir en
 * nombre entier — voir `EnvironmentalPhysicsManager.updateRain`.
 *
 * `dt` est bridé : après un onglet en arrière-plan, un `dt` énorme ne doit pas
 * produire des milliers d'impacts d'un coup.
 */
export function rainImpactsThisFrame(
  intensity: number,
  dt: number,
  tuning: RainTuning = DEFAULT_RAIN_TUNING
): number {
  if (intensity <= 0 || dt <= 0) return 0;
  const clampedDt = Math.min(dt, 0.1);
  return Math.min(tuning.maxPerFrame, tuning.impactsPerSecond * intensity * clampedDt);
}

// =========================================================================
// Échantillonnage du sol
// =========================================================================

export type HeightFn = (x: number, z: number) => number;

/**
 * Grille de hauteurs mise en cache autour de la caméra.
 *
 * Sonder le terrain pour chacune des ~3 500 gouttes de pluie et par frame est
 * hors de budget ; on échantillonne une grille grossière une fois par
 * «Refresh» et on interpole. La grille se ré-échantillonne quand la caméra a
 * bougé de plus de `rebuildDistance` (ou après `maxAge` secondes).
 */
export class GroundHeightSampler {
  private readonly n: number;
  private readonly extent: number;
  private readonly rebuildDistance: number;
  private readonly maxAge: number;
  private readonly sample: HeightFn;
  private grid = new Float32Array(0);
  private originX = NaN;
  private originZ = NaN;
  private age = Infinity;

  constructor(
    sample: HeightFn,
    opts: { resolution?: number; extent?: number; rebuildDistance?: number; maxAge?: number } = {}
  ) {
    this.sample = sample;
    this.n = Math.max(2, Math.floor(opts.resolution ?? 9));
    this.extent = Math.max(1, opts.extent ?? 70);
    this.rebuildDistance = Math.max(0.5, opts.rebuildDistance ?? 4);
    this.maxAge = Math.max(0, opts.maxAge ?? 0.5);
  }

  /** Hauteur du sol en (x, z), interpolée depuis la grille. */
  heightAt(x: number, z: number): number {
    if (this.grid.length === 0) return this.sample(x, z);
    const half = this.extent / 2;
    const step = this.extent / (this.n - 1);
    const fx = (x - this.originX + half) / step;
    const fz = (z - this.originZ + half) / step;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const cx0 = clampInt(x0, 0, this.n - 1);
    const cz0 = clampInt(z0, 0, this.n - 1);
    const cx1 = clampInt(x0 + 1, 0, this.n - 1);
    const cz1 = clampInt(z0 + 1, 0, this.n - 1);
    const h00 = this.grid[cz0 * this.n + cx0];
    const h10 = this.grid[cz0 * this.n + cx1];
    const h01 = this.grid[cz1 * this.n + cx0];
    const h11 = this.grid[cz1 * this.n + cx1];
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  /** Reconstruit la grille si la caméra a assez bougé (ou si elle est périmée). */
  refresh(centerX: number, centerZ: number, dt: number): boolean {
    this.age += dt;
    const movedFar =
      !Number.isFinite(this.originX) ||
      Math.abs(centerX - this.originX) > this.rebuildDistance ||
      Math.abs(centerZ - this.originZ) > this.rebuildDistance;
    if (!movedFar && this.age < this.maxAge) return false;
    this.rebuild(centerX, centerZ);
    return true;
  }

  dispose(): void {
    this.grid = new Float32Array(0);
  }

  private rebuild(centerX: number, centerZ: number): void {
    this.grid = new Float32Array(this.n * this.n);
    this.originX = centerX;
    this.originZ = centerZ;
    this.age = 0;
    const step = this.extent / (this.n - 1);
    const half = this.extent / 2;
    for (let j = 0; j < this.n; j++) {
      const z = centerZ - half + j * step;
      for (let i = 0; i < this.n; i++) {
        const x = centerX - half + i * step;
        const h = this.sample(x, z);
        this.grid[j * this.n + i] = Number.isFinite(h) ? h : 0;
      }
    }
  }
}

const clampInt = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
