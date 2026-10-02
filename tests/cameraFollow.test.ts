import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOLLOW_CONFIG,
  FOLLOW_LIMITS,
  MAX_DAMP_ALPHA,
  clampFollowConfig,
  damp,
  dampAlpha,
  dampPivot,
  dampRigidPose,
  dampVec3,
  describeFollowTarget,
  isFollowable,
  pivotTarget,
  rigidPose,
  sameFollowConfig,
} from '../lib/core/cameraFollow';

/**
 * `cameraFollow.ts` est volontairement sans Three.js ni moteur : c'est de la
 * géométrie et de l'interpolation pures, testables en node.
 */

// =========================================================================
// Validation de la configuration
// =========================================================================

describe('core/cameraFollow — clampFollowConfig', () => {
  it('complète les champs manquants avec les défauts', () => {
    expect(clampFollowConfig({})).toEqual(DEFAULT_FOLLOW_CONFIG);
    expect(clampFollowConfig()).toEqual(DEFAULT_FOLLOW_CONFIG);
    expect(clampFollowConfig(null)).toEqual(DEFAULT_FOLLOW_CONFIG);
  });

  it('conserve les valeurs valides', () => {
    const cfg = clampFollowConfig({
      distance: 12,
      height: 3,
      offsetX: -2,
      lookAtHeight: 2.5,
      smoothing: 15,
      followRotation: false,
    });
    expect(cfg.distance).toBe(12);
    expect(cfg.height).toBe(3);
    expect(cfg.offsetX).toBe(-2);
    expect(cfg.lookAtHeight).toBe(2.5);
    expect(cfg.smoothing).toBe(15);
    expect(cfg.followRotation).toBe(false);
  });

  it('remplace les valeurs corrompues par le défaut (jamais de NaN)', () => {
    const cfg = clampFollowConfig({
      distance: NaN,
      height: Infinity,
      offsetX: undefined,
      smoothing: 'rapide' as unknown as number,
      lookAtHeight: null as unknown as number,
    });
    expect(cfg.distance).toBe(DEFAULT_FOLLOW_CONFIG.distance);
    expect(cfg.height).toBe(DEFAULT_FOLLOW_CONFIG.height);
    expect(cfg.offsetX).toBe(DEFAULT_FOLLOW_CONFIG.offsetX);
    expect(cfg.smoothing).toBe(DEFAULT_FOLLOW_CONFIG.smoothing);
    expect(cfg.lookAtHeight).toBe(DEFAULT_FOLLOW_CONFIG.lookAtHeight);
  });

  it('borne chaque champ dans les limites de l’inspecteur', () => {
    const cfg = clampFollowConfig({
      distance: 9999,
      height: 9999,
      offsetX: -9999,
      lookAtHeight: -9999,
      smoothing: 9999,
    });
    expect(cfg.distance).toBeLessThanOrEqual(FOLLOW_LIMITS.distance.max);
    expect(cfg.height).toBeLessThanOrEqual(FOLLOW_LIMITS.height.max);
    expect(cfg.offsetX).toBeGreaterThanOrEqual(FOLLOW_LIMITS.offsetX.min);
    expect(cfg.lookAtHeight).toBeGreaterThanOrEqual(FOLLOW_LIMITS.lookAtHeight.min);
    expect(cfg.smoothing).toBeLessThanOrEqual(FOLLOW_LIMITS.smoothing.max);
  });

  it('remonte smoothing à un minimum (0 figerait la caméra)', () => {
    expect(clampFollowConfig({ smoothing: 0 }).smoothing).toBe(FOLLOW_LIMITS.smoothing.min);
    expect(clampFollowConfig({ smoothing: -5 }).smoothing).toBe(FOLLOW_LIMITS.smoothing.min);
  });

  it('garantit maxDistance >= minDistance', () => {
    const cfg = clampFollowConfig({ minDistance: 50, maxDistance: 5 });
    expect(cfg.maxDistance).toBeGreaterThanOrEqual(cfg.minDistance);
  });

  it('n.Accepte pas un followRotation non booléen', () => {
    expect(clampFollowConfig({ followRotation: 'oui' as unknown as boolean }).followRotation).toBe(
      DEFAULT_FOLLOW_CONFIG.followRotation
    );
  });
});

describe('core/cameraFollow — sameFollowConfig', () => {
  it('distingue deux configs identiques', () => {
    expect(sameFollowConfig(clampFollowConfig({}), clampFollowConfig({}))).toBe(true);
  });

  it('détecte un écart sur un seul champ', () => {
    const a = clampFollowConfig({ distance: 5 });
    const b = clampFollowConfig({ distance: 6 });
    expect(sameFollowConfig(a, b)).toBe(false);
  });

  it('détecte un écart sur followRotation', () => {
    const a = clampFollowConfig({ followRotation: true });
    const b = clampFollowConfig({ followRotation: false });
    expect(sameFollowConfig(a, b)).toBe(false);
  });
});

// =========================================================================
// Lissage
// =========================================================================

describe('core/cameraFollow — dampAlpha', () => {
  it('vaut 0 sans mouvement ou sans vitesse', () => {
    expect(dampAlpha(6, 0)).toBe(0);
    expect(dampAlpha(0, 0.016)).toBe(0);
    expect(dampAlpha(-3, 0.016)).toBe(0);
  });

  it('reste dans [0,1] et croît avec dt', () => {
    const small = dampAlpha(6, 1 / 120);
    const big = dampAlpha(6, 1 / 30);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(1);
  });

  it('reste borné à 1 pour une durée absurde', () => {
    expect(dampAlpha(6, 1e6)).toBeCloseTo(1, 6);
  });

  it('reste borné à 0 pour une durée négative', () => {
    expect(dampAlpha(6, -1)).toBe(0);
  });
});

describe('core/cameraFollow — damp / dampVec3', () => {
  it('laisse la valeur inchangée à alpha = 0', () => {
    expect(damp(10, 20, 0)).toBe(10);
    expect(dampVec3({ x: 1, y: 2, z: 3 }, { x: 9, y: 9, z: 9 }, 0)).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it('atteint exactement la cible à alpha = 1', () => {
    expect(damp(10, 20, 1)).toBe(20);
    expect(dampVec3({ x: 1, y: 2, z: 3 }, { x: 9, y: 8, z: 7 }, 1)).toEqual({
      x: 9,
      y: 8,
      z: 7,
    });
  });

  it('bride alpha hors [0,1] au lieu d’extrapoler', () => {
    expect(damp(0, 10, -1)).toBe(0);
    expect(damp(0, 10, 2)).toBe(10);
  });
});

// =========================================================================
// Pivot
// =========================================================================

describe('core/cameraFollow — pivotTarget', () => {
  it('relève la position de l’objet de lookAtHeight', () => {
    const cfg = clampFollowConfig({ lookAtHeight: 2 });
    expect(pivotTarget({ x: 1, y: 5, z: -3 }, cfg)).toEqual({ x: 1, y: 7, z: -3 });
  });

  it('accepte une hauteur négative (cible sous les pieds)', () => {
    const cfg = clampFollowConfig({ lookAtHeight: -1 });
    expect(pivotTarget({ x: 0, y: 3, z: 0 }, cfg).y).toBe(2);
  });
});

describe('core/cameraFollow — dampPivot', () => {
  const cfg = () => clampFollowConfig({ lookAtHeight: 0, smoothing: 6 });

  it('progresse vers l’objet sans l’atteindre d’un coup', () => {
    const next = dampPivot({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, cfg(), 1 / 60);
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(10);
  });

  it('converge vers l’objet après plusieurs frames', () => {
    let pivot = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 200; i++) {
      pivot = dampPivot(pivot, { x: 10, y: 0, z: 0 }, cfg(), 1 / 60);
    }
    expect(pivot.x).toBeCloseTo(10, 3);
  });

  it('bride le rattrapage par frame (retour d’onglet)', () => {
    // dt énorme : sans le garde-fou, alpha ≈ 1 et la caméra téléporterait.
    const next = dampPivot({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, cfg(), 30);
    const alpha = next.x / 5;
    expect(alpha).toBeLessThanOrEqual(MAX_DAMP_ALPHA + 1e-9);
  });

  it('recalage immédiatement sur un téléport (undo / reset de scène)', () => {
    const next = dampPivot({ x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, cfg(), 1 / 60);
    expect(next.x).toBe(500);
  });

  it('ne bouge pas sur un dt nul', () => {
    expect(dampPivot({ x: 3, y: 3, z: 3 }, { x: 9, y: 9, z: 9 }, cfg(), 0)).toEqual({
      x: 3,
      y: 3,
      z: 3,
    });
  });
});

// =========================================================================
// Pose rigide
// =========================================================================

describe('core/cameraFollow — rigidPose', () => {
  it('place la caméra dans le dos de l’objet (yaw 0 → caméra en −Z)', () => {
    const cfg = clampFollowConfig({ distance: 8, height: 2, offsetX: 0, followRotation: true });
    // Convention du moteur : à yaw = 0 l'objet regarde −Z, donc « derrière »
    // est −Z. La caméra ne doit pas se retrouver en face de l'objet.
    const pose = rigidPose({ x: 0, y: 0, z: 0 }, 0, cfg);
    expect(pose.position.z).toBeCloseTo(-8, 5);
    expect(pose.position.x).toBeCloseTo(0, 5);
    expect(pose.position.y).toBeCloseTo(2, 5);
  });

  it('tourne avec le yaw de l’objet', () => {
    const cfg = clampFollowConfig({ distance: 8, height: 0, followRotation: true });
    const pose = rigidPose({ x: 0, y: 0, z: 0 }, Math.PI / 2, cfg);
    // yaw = +90° : l'objet regarde −X, la caméra passe en −X.
    expect(pose.position.x).toBeCloseTo(-8, 5);
    expect(pose.position.z).toBeCloseTo(0, 5);
  });

  it('ignore le yaw quand followRotation est désactivé', () => {
    const a = rigidPose({ x: 0, y: 0, z: 0 }, 0, clampFollowConfig({ followRotation: false }));
    const b = rigidPose({ x: 0, y: 0, z: 0 }, Math.PI, clampFollowConfig({ followRotation: false }));
    expect(a.position).toEqual(b.position);
  });

  it('applique le décalage latéral sur l’axe X local', () => {
    const cfg = clampFollowConfig({ distance: 0, height: 0, offsetX: 3, followRotation: true });
    const pose = rigidPose({ x: 0, y: 0, z: 0 }, 0, cfg);
    expect(pose.position.x).toBeCloseTo(3, 5);
  });

  it('vise l’objet à lookAtHeight', () => {
    const cfg = clampFollowConfig({ lookAtHeight: 1.5 });
    expect(rigidPose({ x: 2, y: 3, z: 4 }, 0, cfg).lookAt).toEqual({ x: 2, y: 4.5, z: 4 });
  });

  it('respecte minDistance : la caméra ne traverse pas l’objet', () => {
    const cfg = clampFollowConfig({ distance: 0.01, minDistance: 3, followRotation: true });
    const pose = rigidPose({ x: 0, y: 0, z: 0 }, 0, cfg);
    expect(Math.abs(pose.position.z)).toBeCloseTo(3, 5);
  });

  it('respecte maxDistance', () => {
    const cfg = clampFollowConfig({ distance: 999, maxDistance: 12, followRotation: true });
    const pose = rigidPose({ x: 0, y: 0, z: 0 }, 0, cfg);
    expect(Math.abs(pose.position.z)).toBeCloseTo(12, 5);
  });

  it('suit l’objet en translation', () => {
    const cfg = clampFollowConfig({ distance: 5, height: 1, followRotation: true });
    const pose = rigidPose({ x: 100, y: 7, z: -40 }, 0, cfg);
    expect(pose.position.x).toBeCloseTo(100, 5);
    expect(pose.position.y).toBeCloseTo(8, 5);
    expect(pose.position.z).toBeCloseTo(-45, 5);
  });
});

describe('core/cameraFollow — dampRigidPose', () => {
  const cfg = () => clampFollowConfig({ distance: 6, height: 0, smoothing: 6, followRotation: true });

  it('rapproche la caméra sans téléportation', () => {
    const pose = dampRigidPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0, cfg(), 1 / 60);
    // La pose désirée est en −Z, la caméra converge donc vers les z négatifs.
    expect(pose.position.z).toBeLessThan(0);
    expect(pose.position.z).toBeGreaterThan(-6);
  });

  it('converge vers la pose désirée', () => {
    let pos = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 240; i++) {
      pos = dampRigidPose(pos, { x: 0, y: 0, z: 0 }, 0, cfg(), 1 / 60).position;
    }
    expect(pos.z).toBeCloseTo(-6, 2);
  });

  it('recalage sur un saut même quand une seule frame est loin d’y arriver', () => {
    // Régression : le garde-fou doit regarder l'écart à la cible, pas la
    // distance parcourue. Ici une frame à 60 fps ne fait que ~9 % du chemin,
    // donc un seuil sur la distance parcourue ne se déclencherait jamais.
    const pose = dampPivot({ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }, cfg(), 1 / 60);
    expect(pose.x).toBe(200);
  });

  it('recalage immédiatement sur un grand saut', () => {
    const pose = dampRigidPose({ x: 0, y: 0, z: 0 }, { x: 900, y: 0, z: 0 }, 0, cfg(), 1 / 60);
    // Cible à x=900 : la caméra doit s'y recaler sans rattrapage progressif.
    expect(pose.position.x).toBeCloseTo(900, 5);
  });

  it('vise toujours l’objet courant, relevé de lookAtHeight', () => {
    const c = clampFollowConfig({ distance: 6, height: 0, lookAtHeight: 1.4, followRotation: true });
    const pose = dampRigidPose({ x: 0, y: 0, z: 0 }, { x: 5, y: 1, z: 2 }, 0, c, 1 / 60);
    expect(pose.lookAt).toEqual({ x: 5, y: 2.4, z: 2 });
  });

  it('ne bouge pas sur un dt nul', () => {
    const pose = dampRigidPose({ x: 1, y: 2, z: 3 }, { x: 9, y: 9, z: 9 }, 0, cfg(), 0);
    expect(pose.position).toEqual({ x: 1, y: 2, z: 3 });
  });
});

// =========================================================================
// Cibles valides
// =========================================================================

describe('core/cameraFollow — isFollowable', () => {
  const visible = { visible: true, parent: null };

  it('accepte un objet visible à la racine', () => {
    expect(isFollowable(visible)).toBe(true);
  });

  it('refuse null', () => {
    expect(isFollowable(null)).toBe(false);
  });

  it('refuse un objet masqué', () => {
    expect(isFollowable({ visible: false, parent: null })).toBe(false);
  });

  it('refuse un objet dont un parent est masqué', () => {
    const hiddenParent = { visible: false, parent: null };
    const child = { visible: true, parent: hiddenParent };
    expect(isFollowable(child)).toBe(false);
  });

  it('accepte un enfant dont toute la chaîne est visible', () => {
    const p1 = { visible: true, parent: null };
    const p2 = { visible: true, parent: p1 };
    const child = { visible: true, parent: p2 };
    expect(isFollowable(child)).toBe(true);
  });

  it('refuse le plan d’eau et les rivières (rien à suivre)', () => {
    expect(isFollowable({ ...visible, userData: { subType: 'water' } })).toBe(false);
    expect(isFollowable({ ...visible, userData: { subType: 'river' } })).toBe(false);
  });

  it('respecte l’opt-out noFollow', () => {
    expect(isFollowable({ ...visible, userData: { noFollow: true } })).toBe(false);
  });
});

describe('core/cameraFollow — describeFollowTarget', () => {
  it('nomme le joueur explicitement', () => {
    expect(describeFollowTarget({ name: 'Cube_1', userData: { subType: 'player' } })).toBe('Joueur');
  });

  it('utilise le nom de l’objet sinon', () => {
    expect(describeFollowTarget({ name: 'Ennemi_3' })).toBe('Ennemi_3');
  });

  it('renvoie null sans cible', () => {
    expect(describeFollowTarget(null)).toBeNull();
  });

  it('renvoie null si le nom est vide', () => {
    expect(describeFollowTarget({ name: '' })).toBeNull();
  });
});
