/**
 * cameraFollow — logique pure du suivi caméra.
 * =========================================================================
 * Permet d'assigner la caméra à un objet 3D quelconque (joueur, ennemi,
 * véhicule, objet décoratif…) et de la paramétrer. Ce module ne dépend
 * NI de Three.js NI du moteur : il ne fait que des maths sur des nombres,
 * ce qui le rend entièrement testable sous vitest (environnement node).
 *
 * Deux modes de suivi cohabitent :
 *
 *  - **pivot** (mode édition, par défaut) : seul le point de visée des
 *    OrbitControls suit l'objet. L'utilisateur garde la main sur l'orbite,
 *    le zoom et le pan — c'est le comportement « doux » d'un éditeur.
 *  - **rigide** (mode Play) : la caméra est placée à un offset fixe derrière
 *    l'objet, comme la caméra 3ᵉ personne existante du joueur.
 *
 * Lissage par exponentielle : `1 - exp(-k·dt)`, indépendant du framerate
 * (un lerp linéaire donne un suivi plus rapide sur un 144 Hz que sur un 30 Hz).
 */

// =========================================================================
// Types
// =========================================================================

export interface CameraFollowConfig {
  /** Distance caméra ↔ cible, en mètres. */
  distance: number;
  /** Décalage vertical du point de visé. */
  height: number;
  /** Décalage latéral (axe X local de l'objet). */
  offsetX: number;
  /** Hauteur visée, au-dessus de la position de l'objet. */
  lookAtHeight: number;
  /** Vitesse de rattrapage (1/lag). Bas = flottant, haut = collé. */
  smoothing: number;
  /** En mode rigide : la caméra se place-t-elle derrière l'orientation de l'objet ? */
  followRotation: boolean;
  /** Borne basse de la distance (évite de passer dans l'objet). */
  minDistance: number;
  /** Borne haute de la distance. */
  maxDistance: number;
}

export const DEFAULT_FOLLOW_CONFIG: CameraFollowConfig = {
  distance: 7,
  height: 0.6,
  offsetX: 0,
  lookAtHeight: 1.4,
  smoothing: 6,
  followRotation: true,
  minDistance: 0.5,
  maxDistance: 80,
};

export type FollowMode = 'pivot' | 'rigid';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface FollowPose {
  position: Vec3Like;
  lookAt: Vec3Like;
}

/** Bornes de l'inspecteur — partagées par l'UI et la validation. */
export const FOLLOW_LIMITS = {
  distance: { min: 0.5, max: 200, step: 0.1 },
  height: { min: -20, max: 50, step: 0.1 },
  offsetX: { min: -50, max: 50, step: 0.1 },
  lookAtHeight: { min: -10, max: 30, step: 0.1 },
  smoothing: { min: 0.1, max: 40, step: 0.1 },
} as const;

// =========================================================================
// Validation
// =========================================================================

const finite = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Complète et borne une config partielle.
 *
 * Une donnée corrompue (import JSON, sauvegarde ancienne) ne doit pas
 * produire une caméra à NaN : chaque champ retombe sur son défaut.
 */
export function clampFollowConfig(
  partial?: Partial<CameraFollowConfig> | null
): CameraFollowConfig {
  const d = DEFAULT_FOLLOW_CONFIG;
  const src = partial ?? {};

  const minDistance = Math.max(0.1, finite(src.minDistance, d.minDistance));
  const maxDistance = Math.max(minDistance, finite(src.maxDistance, d.maxDistance));

  return {
    distance: clamp(finite(src.distance, d.distance), FOLLOW_LIMITS.distance.min, maxDistance),
    height: clamp(finite(src.height, d.height), FOLLOW_LIMITS.height.min, FOLLOW_LIMITS.height.max),
    offsetX: clamp(
      finite(src.offsetX, d.offsetX),
      FOLLOW_LIMITS.offsetX.min,
      FOLLOW_LIMITS.offsetX.max
    ),
    lookAtHeight: clamp(
      finite(src.lookAtHeight, d.lookAtHeight),
      FOLLOW_LIMITS.lookAtHeight.min,
      FOLLOW_LIMITS.lookAtHeight.max
    ),
    // smoothing = 0 rendrait la caméra figée (1-exp(0)=0) : on la ramène
    // au minimum, sinon « suivre » ne suit plus rien.
    smoothing: clamp(
      finite(src.smoothing, d.smoothing),
      FOLLOW_LIMITS.smoothing.min,
      FOLLOW_LIMITS.smoothing.max
    ),
    followRotation: typeof src.followRotation === 'boolean' ? src.followRotation : d.followRotation,
    minDistance,
    maxDistance,
  };
}

/** Deux configs décrivent-elles le même réglage ? (indicateur « ≠ » multi-sélection) */
export function sameFollowConfig(
  a: CameraFollowConfig,
  b: CameraFollowConfig
): boolean {
  return (
    a.distance === b.distance &&
    a.height === b.height &&
    a.offsetX === b.offsetX &&
    a.lookAtHeight === b.lookAtHeight &&
    a.smoothing === b.smoothing &&
    a.followRotation === b.followRotation
  );
}

// =========================================================================
// Lissage
// =========================================================================

/**
 * Facteur d'interpolation stable quel que soit le framerate.
 * `smoothing` est un taux (1/lag) : 6 ≈ rattrapage en ~1/6 s.
 */
export function dampAlpha(smoothing: number, dt: number): number {
  const s = Math.max(0, smoothing);
  const step = Math.max(0, dt);
  if (s === 0 || step === 0) return 0;
  return 1 - Math.exp(-s * step);
}

/** Interpole `current` vers `target`. `alpha` ∈ [0,1] (0 = immobile). */
export function damp(current: number, target: number, alpha: number): number {
  return current + (target - current) * clamp01(alpha);
}

export function dampVec3(
  current: Vec3Like,
  target: Vec3Like,
  alpha: number
): Vec3Like {
  return {
    x: damp(current.x, target.x, alpha),
    y: damp(current.y, target.y, alpha),
    z: damp(current.z, target.z, alpha),
  };
}

// =========================================================================
// Poses
// =========================================================================

/**
 * Point de visée du mode « pivot » : la position de l'objet, relevée de
 * `lookAtHeight`. La caméra n'est PAS déplacée ici — l'orbite de
 * l'utilisateur s'appuie dessus.
 */
export function pivotTarget(
  objectPos: Vec3Like,
  config: CameraFollowConfig
): Vec3Like {
  return { x: objectPos.x, y: objectPos.y + config.lookAtHeight, z: objectPos.z };
}

/**
 * Pivot lissé, avec garde-fou sur les grands sauts.
 *
 * Un `dt` énorme (onglet en arrière-plan) donnerait `alpha ≈ 1` : la caméra
 * téléporterait d'un coup. On borne le rattrapage par frame, sinon un retour
 * sur l'onglet produit un saut de caméra très visible.
 */
export const MAX_DAMP_ALPHA = 0.5;
const TELEPORT_DISTANCE = 50;

export function dampPivot(
  current: Vec3Like,
  objectPos: Vec3Like,
  config: CameraFollowConfig,
  dt: number
): Vec3Like {
  const target = pivotTarget(objectPos, config);
  const gap = Math.hypot(target.x - current.x, target.y - current.y, target.z - current.z);
  if (gap > TELEPORT_DISTANCE) return target;
  const alpha = Math.min(dampAlpha(config.smoothing, dt), MAX_DAMP_ALPHA);
  return dampVec3(current, target, alpha);
}

/**
 * Pose du mode « rigide » : la caméra se tient à `distance` derrière l'objet,
 * à `height` au-dessus, décalée de `offsetX` sur son axe latéral.
 *
 * `yaw` est l'orientation monde de l'objet ; elle n'est prise en compte que
 * si `followRotation` est actif (sinon la caméra garde un cap fixe en −Z).
 */
export function rigidPose(
  objectPos: Vec3Like,
  yaw: number,
  config: CameraFollowConfig
): FollowPose {
  const distance = clamp(config.distance, config.minDistance, config.maxDistance);
  const yawRad = config.followRotation ? yaw : 0;
  const sin = Math.sin(yawRad);
  const cos = Math.cos(yawRad);

  // Repère local de l'objet : -Z est « devant », +X est la droite.
  const lateral = config.offsetX;
  const position = {
    x: objectPos.x + lateral * cos - distance * sin,
    y: objectPos.y + config.height,
    z: objectPos.z - lateral * sin - distance * cos,
  };

  return { position, lookAt: pivotTarget(objectPos, config) };
}

/**
 * Pose rigide lissée. Comme `dampPivot`, la position est recalee sans lissage
 * au-delà d'un grand saut.
 */
export function dampRigidPose(
  currentPos: Vec3Like,
  objectPos: Vec3Like,
  yaw: number,
  config: CameraFollowConfig,
  dt: number
): FollowPose {
  const desired = rigidPose(objectPos, yaw, config);
  const gap = Math.hypot(
    desired.position.x - currentPos.x,
    desired.position.y - currentPos.y,
    desired.position.z - currentPos.z
  );
  if (gap > TELEPORT_DISTANCE) return desired;

  const alpha = Math.min(dampAlpha(config.smoothing, dt), MAX_DAMP_ALPHA);
  return {
    position: dampVec3(currentPos, desired.position, alpha),
    lookAt: desired.lookAt,
  };
}

// =========================================================================
// Utilitaires
// =========================================================================

/**
 * Une cible de suivi est-elle exploitable ?
 *
 * On refuse les objets retirés de la scène et ceux qui sont cachés : suivre
 * un objet invisible n'a pas de sens et laisserait la caméra flottant dans le
 * vide. `visible` est testé sur toute la chaîne de parents.
 */
export function isFollowable(obj: {
  visible: boolean;
  parent: unknown;
  userData?: Record<string, unknown>;
} | null): boolean {
  if (!obj) return false;
  if ((obj.userData?.noFollow as boolean | undefined) === true) return false;
  // Les rails de caméra ne suivent rien.
  if (obj.userData?.subType === 'water' || obj.userData?.subType === 'river') return false;
  let node: { visible: boolean; parent: unknown } | null = obj;
  while (node) {
    if (!node.visible) return false;
    node = (node.parent as { visible: boolean; parent: unknown } | null) ?? null;
  }
  return true;
}

/** Résume la cible pour l'UI (« Joueur », « Cube_3 », rien). */
export function describeFollowTarget(
  obj: { name: string; userData?: Record<string, unknown> } | null
): string | null {
  if (!obj) return null;
  const subType = obj.userData?.subType;
  if (subType === 'player') return 'Joueur';
  return obj.name || null;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number): number => clamp(v, 0, 1);
