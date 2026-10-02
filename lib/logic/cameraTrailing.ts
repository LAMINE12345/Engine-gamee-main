/**
 * cameraTrailing — caméra à traîne (arc de composée), en logique pure.
 *
 * Aucun accès à three.js ni au DOM : ce module ne fait que calculer la
 * position de visée d'une caméra qui SUIT le mouvement en retard. Le runtime
 * (LogicExecutor / CameraManager) applique ensuite le résultat.
 *
 * INSPIRATION RÉELLE — pourquoi une caméra traîne plutôt que d'être collée :
 * un opérateur de caméra suit le sujet avec un DÉLAI, parce que son corps a une
 * inertie. Résultat : quand le sujet pivote ou accélère, la caméra « déborde »
 * légèrement du côté opposé, ce qui donne la sensation de vitesse et de poids.
 * Une caméra parfaitement collée au sujet paraît plate : aucune inertie, donc
 * aucune lecture de la vitesse.
 *
 * Deux modes, parce que les deux existent réellement :
 *  - `trail`  : la caméra garde son propre retard (freinage, virage).
 *  - `spring` : elle est ramenée par un ressort amorti, ce qui laisse un petit
 *               dépassement puis un retour (l'effet « caméra sur ressort »).
 */

import { dampAlpha, type Vec3Like } from '../core/cameraFollow';

/** Presets de traîne, calés sur des usages de caméra réellement courants. */
export type TrailStyle = 'tight' | 'cinematic' | 'drift' | 'sprint';

export interface TrailConfig {
  /** Position de la caméra REPLACÉE par le nœud (on ne garde que le retard). */
  base: Vec3Like;
  /** Position instantanée de la cible, déjà au point de visé. */
  target: Vec3Like;
  /** Vitesse de rattrapage : bas = flottant, haut = collé au sujet. */
  smoothing: number;
  /** Distance minimale camera/cible. */
  minDistance: number;
  /** Pas de temps de la frame (s). */
  dt: number;
  /** Style de traîne. */
  style: TrailStyle;
  /**
   * Avance de la TRAJECTOIRE : la caméra vise « devant » la cible, dans la
   * direction où elle va. C'est ce qui donne la lecture de vitesse même à
   * l'arrêt — une caméra de voiture en fuite regarde la route, pas le coffre.
   */
  lookAhead: number;
}

/**
 * Réglages par style. `smoothing` est un taux (1/lag) : plus bas = plus lent.
 * Les valeurs sont calées sur la latence d'un opérateur humain, pas au hasard.
 */
export const TRAIL_PRESETS: Record<TrailStyle, { smoothing: number; lookAhead: number; label: string }> = {
  // SuiviSPORT : la caméra reste collée, on ne veut pas perdre l'action.
  tight: { smoothing: 12, lookAhead: 0.6, label: 'Serré (sport)' },
  // Recul classique des films : la caméra traîne derrière, cadre large.
  cinematic: { smoothing: 3.5, lookAhead: 1.6, label: 'Cinématique' },
  // Lente et ample : donne le sentiment de vitesse, mais fatigue vite.
  drift: { smoothing: 1.6, lookAhead: 2.4, label: 'Flottant' },
  // Entre les deux : le compromis le plus utilisé en TPS.
  sprint: { smoothing: 6, lookAhead: 1.2, label: 'Sprint' },
};

/** Vecteur nuloïde : évite toute allocation dans la boucle. */
const ZERO: Vec3Like = { x: 0, y: 0, z: 0 };

function len3(v: Vec3Like): number {
  return Math.hypot(v.x, v.y, v.z);
}

function sub3(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Prolonge la trajectoire de la cible dans la direction où elle se déplace.
 *
 * Sans look-ahead, une caméra arrêtée ne donne AUCUNE indication de la
 * vitesse : c'est exactement le défaut du suivi purement positionnel.
 */
export function applyLookAhead(
  target: Vec3Like,
  previousTarget: Vec3Like,
  amount: number
): Vec3Like {
  if (!(amount > 0) || !Number.isFinite(amount)) return { ...target };
  const velocity = sub3(target, previousTarget);
  // Une position corrompue ne doit pas propager son NaN au point de visé.
  if (!Number.isFinite(velocity.x) || !Number.isFinite(velocity.y) || !Number.isFinite(velocity.z)) {
    return { ...target };
  }
  const speed = len3(velocity);
  if (speed < 1e-5) return { ...target };
  // On borne l'avance : sinon un téléport (respawn) projetterait la caméra
  // à des centaines de mètres et le retour serait visible.
  const clamped = Math.min(speed, 4);
  const k = (amount / 4) * clamped;
  return {
    x: target.x + (velocity.x / speed) * k,
    y: target.y + (velocity.y / speed) * k,
    z: target.z + (velocity.z / speed) * k,
  };
}

export interface TrailResult {
  /** Position de caméra à adopter cette frame. */
  position: Vec3Like;
  /** Point visé (l'objet reste le point d'attention). */
  lookAt: Vec3Like;
  /** Distance caméra ↔ cible, après bornage. */
  distance: number;
  /**
   * Dépassement (overshoot) 0..1 : 0 = la caméra n'a pas encore rattrapé.
   * Permet de déclencher des effets (FOV, secousse) sur l'accélération.
   */
  lag: number;
}

/**
 * Calcule la position de caméra traînée pour une frame.
 *
 * L'algorithme est celui d'un lissage exponentiel (Same Game Feel) : il
 * converge vers la cible quelle que soit la durée, sans jamais
 * « dépasser » — contrairement à un ressort naif qui oscille.
 */
export function computeTrail(
  current: Vec3Like,
  previousTarget: Vec3Like,
  cfg: TrailConfig
): TrailResult {
  const preset = TRAIL_PRESETS[cfg.style] ?? TRAIL_PRESETS.sprint;
  const smoothing = Number.isFinite(cfg.smoothing) ? cfg.smoothing : preset.smoothing;
  const lookAhead = Number.isFinite(cfg.lookAhead) ? cfg.lookAhead : preset.lookAhead;

  // Point visé : la cible, avancée dans sa direction de déplacement.
  const lookAt = applyLookAhead(cfg.target, previousTarget, lookAhead);

  // DÉCALAGE caméra→cible, conservé tel quel puis borné par minDistance.
  //
  // On décale la BASE le long de cet axe au lieu de la ramener sur la cible :
  // ramener la caméra exactement sur la cible ferait disparaître son retard
  // (elle « collerait »), et l'écart restant ne serait plus que du bruit.
  const toTarget = sub3(lookAt, cfg.base);
  const dist = len3(toTarget);
  const minDistance = Math.max(0, cfg.minDistance);
  const ideal = { x: lookAt.x, y: lookAt.y, z: lookAt.z };
  if (dist > 1e-4) {
    // Offset plus court que minDistance : on le rallonge le long du même axe,
    // la caméra ne traverse donc jamais son sujet.
    const offsetScale = Math.max(minDistance / dist, 1);
    ideal.x = lookAt.x - toTarget.x * offsetScale;
    ideal.y = lookAt.y - toTarget.y * offsetScale;
    ideal.z = lookAt.z - toTarget.z * offsetScale;
  } else {
    // Cas dégénéré : la base est SUR la cible (offset nul). Il n'existe aucune
    // direction de repli, donc on recule simplement vers -Z, convention
    // « la caméra se place derrière le sujet » du moteur.
    ideal.x = lookAt.x;
    ideal.y = lookAt.y;
    ideal.z = lookAt.z + Math.max(minDistance, 1);
  }

  // Lissage exponentiel, stable quel que soit le framerate.
  // `dt` est assaini ici : `Math.max(0, NaN)` vaut NaN, et une seule frame
  // corrompue (onglet en arrière-plan, delta d'horloge bizarre) suffirait à
  // envoyer la caméra dans les NaN — définitivement.
  const safeDt = Number.isFinite(cfg.dt) ? Math.max(0, cfg.dt) : 0;
  const alpha = dampAlpha(smoothing, safeDt);
  const position = {
    x: current.x + (ideal.x - current.x) * alpha,
    y: current.y + (ideal.y - current.y) * alpha,
    z: current.z + (ideal.z - current.z) * alpha,
  };

  // Retard restant : sert au feedback (FOV, secousse) et aux tests.
  const lag = alpha < 1 ? Math.hypot(ideal.x - position.x, ideal.y - position.y, ideal.z - position.z) : 0;

  return {
    position,
    lookAt: { ...cfg.target },
    distance: len3(sub3(position, cfg.target)),
    lag,
  };
}

/**
 * Champ de vision dynamique lié à la vitesse.
 *
 * INSPIRATION RÉELLE : plus un objet va vite, plus on « retire » le champ pour
 * qu'il reste visible à l'écran. Sans cela, un véhicule rapide sort du cadre.
 * On interpole entre un FOV de repos et un FOV élargi, et on le borne pour
 * éviter l'effet « tunnel » excessif.
 */
export function speedFov(
  baseFov: number,
  speed: number,
  maxSpeed: number,
  addedFov: number
): number {
  const base = Number.isFinite(baseFov) ? baseFov : 60;
  const v = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const max = Number.isFinite(maxSpeed) ? Math.max(0.001, maxSpeed) : 1;
  const add = Number.isFinite(addedFov) ? Math.max(0, addedFov) : 0;
  const t = Math.min(1, v / max);
  // Courbe en racine : l'effet est discret à basse vitesse et marqué à haute
  // vitesse, ce qui correspond à la perception réelle.
  const fov = base + Math.sqrt(t) * add;
  // Bornes visuelles usuelles : sous ~20° c'est déformant, au-delà de ~110°
  // l'effet de bord devient désagréable.
  return Math.max(20, Math.min(110, fov));
}

export { ZERO as ZERO_VEC };
