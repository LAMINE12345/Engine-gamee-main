/**
 * surfaceLogic — matières et propriétés physiques, en logique pure.
 *
 * Aucun accès au DOM, à three.js ou à Rapier : ce module ne fait que
 * traduire un nom de matière (« glace », « boue »…) en valeurs numériques et
 * en caractéristiques de jeu. Le runtime (LogicExecutor) applique ensuite ces
 * valeurs au corps Rapier via `PhysicsManager.setSurfaceProperties`.
 *
 * Les valeurs sont calibrées sur des ordres de grandeur réels, pas tirées au
 * hasard : un sol de glace a une friction de l'ordre de 0,02, le caoutchouc
 * dépasse 1 (coefficient de frottement statique mesuré > 1), etc.
 *
 * Import de type uniquement : ce module reste pur (pas d'AudioContext), il se
 * contente d'annoncer quel son de la bibliothèque le moteur devra jouer.
 */
import type { SFXType } from '../SoundManager';

/** Identifiants de matières. Le nom est la clé publique utilisée par le graphe. */
export type SurfaceId =
  | 'default'
  | 'ice'
  | 'rubber'
  | 'mud'
  | 'sand'
  | 'metal'
  | 'wood'
  | 'stone'
  | 'sponge'
  | 'ice_cream';

export interface SurfaceData {
  id: SurfaceId;
  /** Libellé affiché dans le menu déroulant du nœud. */
  label: string;
  friction: number;
  restitution: number;
  /** Amortissement linéaire — simule la résistance interne du matériau. */
  linearDamping: number;
  angularDamping: number;
  /**
   * Son de pas : identifiant SFX du moteur (`SoundManager.SFXType`).
   * On réutilise la bibliothèque existante plutôt que d'inventer des noms :
   * chaque matière est mappée sur le timbre réel le plus proche.
   */
  stepSound: SFXType;
  /** Preset de particules déclenché quand on court dessus. */
  impactParticles: string;
  /**
   * Traction du personnage : multiplicateur appliqué à la vitesse quand il se
   * déplace sur cette matière. La boue freine, la glace ne freine pas.
   */
  traction: number;
  /** Vrai si le matériau conduit l'électricité (futur nœud foudre). */
  conductive: boolean;
  /** Vrai si la matière retient l'eau (transition sec/mouillé). */
  absorbsWater: boolean;
}

/**
 * Ordres de grandeur réels :
 *  - friction statique : glace ~0,02 ; métal gras ~0,2 ; bois ~0,4 ;
 *    caoutchouc ~1,0-1,4 ; boue > 1 car elle accroche.
 *  - rebond : pâte à modeler ~0 ; caoutchouc ~0,8 ; balle de golf ~0,7.
 */
export const SURFACES: Record<SurfaceId, SurfaceData> = {
  default: {
    id: 'default',
    label: 'Standard',
    friction: 0.5,
    restitution: 0.4,
    linearDamping: 0.05,
    angularDamping: 0.05,
    stepSound: 'footstep',
    impactParticles: 'dust',
    traction: 1,
    conductive: false,
    absorbsWater: false,
  },
  ice: {
    id: 'ice',
    label: 'Glacier',
    friction: 0.02,
    restitution: 0.1,
    linearDamping: 0.0,
    angularDamping: 0.02,
    stepSound: 'footstep',
    impactParticles: 'ice_shards',
    traction: 0.15,
    conductive: false,
    absorbsWater: false,
  },
  rubber: {
    id: 'rubber',
    label: 'Caoutchouc',
    friction: 1.1,
    restitution: 0.85,
    linearDamping: 0.2,
    angularDamping: 0.4,
    stepSound: 'footstep',
    impactParticles: 'none',
    traction: 1.1,
    conductive: false,
    absorbsWater: false,
  },
  mud: {
    id: 'mud',
    label: 'Boue',
    friction: 0.9,
    restitution: 0.0,
    linearDamping: 3.5,
    angularDamping: 3.0,
    stepSound: 'footstep',
    impactParticles: 'mud_splash',
    traction: 0.45,
    conductive: false,
    absorbsWater: true,
  },
  sand: {
    id: 'sand',
    label: 'Sable',
    friction: 0.95,
    restitution: 0.0,
    linearDamping: 2.2,
    angularDamping: 1.8,
    stepSound: 'footstep',
    impactParticles: 'sand_burst',
    traction: 0.55,
    conductive: false,
    absorbsWater: true,
  },
  metal: {
    id: 'metal',
    label: 'Métal',
    friction: 0.25,
    restitution: 0.3,
    linearDamping: 0.05,
    angularDamping: 0.1,
    stepSound: 'engine',
    impactParticles: 'sparks',
    traction: 0.9,
    conductive: true,
    absorbsWater: false,
  },
  wood: {
    id: 'wood',
    label: 'Bois',
    friction: 0.45,
    restitution: 0.35,
    linearDamping: 0.1,
    angularDamping: 0.15,
    stepSound: 'footstep',
    impactParticles: 'wood_chips',
    traction: 1,
    conductive: false,
    absorbsWater: true,
  },
  stone: {
    id: 'stone',
    label: 'Pierre',
    friction: 0.7,
    restitution: 0.2,
    linearDamping: 0.08,
    angularDamping: 0.12,
    stepSound: 'footstep',
    impactParticles: 'dust',
    traction: 1,
    conductive: false,
    absorbsWater: false,
  },
  sponge: {
    id: 'sponge',
    label: 'Éponge',
    friction: 0.9,
    restitution: 0.0,
    linearDamping: 6.0,
    angularDamping: 5.0,
    stepSound: 'footstep',
    impactParticles: 'none',
    traction: 0.4,
    conductive: false,
    absorbsWater: true,
  },
  ice_cream: {
    id: 'ice_cream',
    label: 'Glace (souple)',
    friction: 0.15,
    restitution: 0.0,
    linearDamping: 4.0,
    angularDamping: 3.5,
    stepSound: 'footstep',
    impactParticles: 'splash',
    traction: 0.35,
    conductive: false,
    absorbsWater: true,
  },
};

export const SURFACE_ORDER: SurfaceId[] = [
  'default',
  'ice',
  'rubber',
  'mud',
  'sand',
  'metal',
  'wood',
  'stone',
  'sponge',
  'ice_cream',
];

/** Résout un identifiant de matière, avec repli sûr sur `default`. */
export function getSurface(id: unknown): SurfaceData {
  const key = String(id ?? 'default') as SurfaceId;
  return SURFACES[key] ?? SURFACES.default;
}

/**
 * Applique des surcharges manuelles (les curseurs du nœud) par-dessus un preset.
 * `null`/`undefined` = ne pas toucher ce champ (on conserve le preset).
 */
export function resolveSurfaceProperties(
  id: unknown,
  overrides: {
    friction?: number | null;
    restitution?: number | null;
    linearDamping?: number | null;
    mass?: number | null;
  } = {}
): {
  friction: number;
  restitution: number;
  linearDamping: number;
  mass: number | null;
} {
  const base = getSurface(id);
  const pick = (o: number | null | undefined, fallback: number): number =>
    typeof o === 'number' && Number.isFinite(o) ? o : fallback;

  return {
    friction: Math.max(0, pick(overrides.friction, base.friction)),
    restitution: Math.max(0, pick(overrides.restitution, base.restitution)),
    linearDamping: Math.max(0, pick(overrides.linearDamping, base.linearDamping)),
    mass: typeof overrides.mass === 'number' && Number.isFinite(overrides.mass)
      ? Math.max(0.001, overrides.mass)
      : null,
  };
}

// ==========================================
// LECTURE DE L'IMPACT (capteurs)
// ==========================================

/**
 * Convertit une vitesse d'impact en intensité 0..1.
 *
 * Référence réelle : au-delà de ~30 km/h (~8,3 m/s) un choc fait vraiment mal.
 * On sature donc à 12 m/s, valeur où l'effet « impact » est déjà maximal.
 */
export function impactStrength(speed: number, maxSpeed = 12): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  return Math.min(1, speed / Math.max(0.001, maxSpeed));
}

/**
 * Volume d'un son d'impact, suivant la loi réelle d'atténuation en
 * distance : l'intensité décroît en 1/d². On borne pour éviter le
 * silence total à distance.
 */
export function distanceAttenuation(
  distance: number,
  maxDistance = 40,
  minGain = 0.08
): number {
  if (!Number.isFinite(distance) || distance <= 0) return 1;
  if (distance >= maxDistance) return minGain;
  const linear = 1 - distance / maxDistance;
  // Racine carrée du modèle physique : audible mais non criard au contact.
  return Math.max(minGain, Math.sqrt(linear));
}
