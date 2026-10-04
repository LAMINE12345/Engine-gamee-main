/**
 * Regression tests for the logic extracted out of SceneManager into
 * lib/scene/*.
 *
 * These modules are only importable in a plain Node environment precisely
 * because they never touch `this` / WebGL / DOM — which is what made them
 * worth extracting in the first place. The assertions pin the behaviour that
 * was moved verbatim, so a future edit to the scene factories cannot silently
 * change physics profiles or the generated car.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createVehicleGroup, createVehiclePhysics } from '../lib/scene/vehicleFactory';
import { assignDefaultPhysics } from '../lib/scene/defaultPhysics';
import { ensurePBRMaterial } from '../lib/scene/materialFactory';
import { buildSimpleNode, needsNodeRestorer } from '../lib/scene/nodeBuilder';
import { Entity } from '../lib/ecs/ECS';

function makeMesh(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
}

let entitySeq = 0;
/** Entity's constructor requires an explicit id. */
function makeEntity(): Entity {
  entitySeq += 1;
  return new Entity(`test-entity-${entitySeq}`);
}

function componentTypes(entity: Entity): string[] {
  return ['Rigidbody', 'Collider', 'CharacterController'].filter((t) => entity.hasComponent(t));
}

describe('scene/vehicleFactory — createVehicleGroup', () => {
  it('places the group at the requested XZ with the chassis y offset', () => {
    const v = createVehicleGroup(3, -7);
    expect(v.position.x).toBe(3);
    expect(v.position.z).toBe(-7);
    expect(v.position.y).toBe(0.45);
  });

  it('builds a chassis, four named wheels and no extra top-level children', () => {
    const v = createVehicleGroup(0, 0);
    const chassis = v.children.find((c) => c.name === 'ChassisBody');
    expect(chassis).toBeDefined();

    const wheels = v.children.filter((c) => c.name.startsWith('Wheel_')).map((c) => c.name);
    expect(wheels.sort()).toEqual(['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']);
    expect(v.children.length).toBe(5);
  });

  it('attaches the vehicle subType and the shared physics profile', () => {
    const v = createVehicleGroup(0, 0);
    expect(v.userData.subType).toBe('vehicle');
    expect(v.userData.physics).toEqual(createVehiclePhysics());
  });

  it('returns an independent physics object per vehicle (no shared mutation)', () => {
    const a = createVehicleGroup(0, 0);
    const b = createVehicleGroup(0, 0);
    a.userData.physics.rigidbody.mass = 1;
    expect(b.userData.physics.rigidbody.mass).toBe(1200);
  });
});

describe('scene/defaultPhysics — assignDefaultPhysics', () => {
  it('skips objects explicitly flagged as non-physical', () => {
    const mesh = makeMesh();
    mesh.userData = { noPhysics: true };
    const entity = makeEntity();
    assignDefaultPhysics(mesh, entity);
    expect(mesh.userData.physics).toBeUndefined();
    expect(componentTypes(entity)).toEqual([]);
  });

  it('gives ground-like objects a static box rigidbody', () => {
    const mesh = makeMesh();
    mesh.name = 'Base Pedestal';
    const entity = makeEntity();
    assignDefaultPhysics(mesh, entity);
    expect(mesh.userData.physics.rigidbody.type).toBe('static');
    expect(mesh.userData.physics.rigidbody.mass).toBe(0);
    expect(mesh.userData.physics.collider.shape).toBe('box');
  });

  it('detects ground/floor by name, case-insensitively', () => {
    const mesh = makeMesh();
    mesh.name = 'Level_Floor';
    const entity = makeEntity();
    assignDefaultPhysics(mesh, entity);
    expect(mesh.userData.physics.rigidbody.type).toBe('static');
  });

  it('gives the player a kinematic capsule plus a character controller', () => {
    const mesh = makeMesh();
    mesh.userData = { subType: 'player' };
    const entity = makeEntity();
    assignDefaultPhysics(mesh, entity);
    expect(mesh.userData.physics.collider.shape).toBe('capsule');
    expect(componentTypes(entity)).toContain('CharacterController');
    expect(componentTypes(entity)).toContain('Rigidbody');
  });

  it('reuses an existing physics payload on a vehicle instead of overwriting it', () => {
    const mesh = makeMesh();
    const custom = createVehiclePhysics();
    custom.rigidbody.mass = 42;
    mesh.userData = { subType: 'vehicle', physics: custom };
    const entity = makeEntity();
    assignDefaultPhysics(mesh, entity);
    expect(mesh.userData.physics.rigidbody.mass).toBe(42);
  });

  it('falls back to the shared vehicle profile when none is set', () => {
    const mesh = makeMesh();
    mesh.userData = { subType: 'vehicle' };
    const entity = makeEntity();
    assignDefaultPhysics(mesh, entity);
    expect(mesh.userData.physics).toEqual(createVehiclePhysics());
  });

  it('maps sphere / cylinder / model sub-types to their collider shapes', () => {
    const cases: Array<[string, string]> = [
      ['sphere', 'sphere'],
      ['cylinder', 'cylinder'],
      ['model', 'trimesh'],
      ['cube', 'auto'],
    ];
    for (const [subType, shape] of cases) {
      const mesh = makeMesh();
      mesh.userData = { subType };
      const entity = makeEntity();
      assignDefaultPhysics(mesh, entity);
      expect(mesh.userData.physics.collider.shape).toBe(shape);
      expect(mesh.userData.physics.rigidbody.type).toBe('dynamic');
    }
  });

  it('leaves non-mesh, non-group objects (e.g. lights) without physics', () => {
    const light = new THREE.PointLight();
    const entity = makeEntity();
    assignDefaultPhysics(light, entity);
    expect(light.userData.physics).toBeUndefined();
    expect(componentTypes(entity)).toEqual([]);
  });
});

describe('scene/materialFactory — ensurePBRMaterial', () => {
  it('returns an existing MeshStandardMaterial untouched', () => {
    const mat = new THREE.MeshStandardMaterial();
    expect(ensurePBRMaterial(mat)).toBe(mat);
  });

  it('converts other materials, preserving colour', () => {
    const basic = new THREE.MeshBasicMaterial({ color: 0x112233 });
    const converted = ensurePBRMaterial(basic);
    expect(converted).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(converted.color.getHex()).toBe(0x112233);
    expect(converted.roughness).toBe(0.4);
    expect(converted.metalness).toBe(0.1);
  });

  it('always carries a colour: Three.js materials expose .color even when unset', () => {
    // The `|| 0x94a3b8` fallback in ensurePBRMaterial is unreachable for any
    // THREE.Material, because .color is always defined (white by default).
    // Pinned here so the behaviour is a documented decision, not a surprise.
    const converted = ensurePBRMaterial(new THREE.MeshBasicMaterial());
    expect(converted.color.getHex()).toBe(0xffffff);
  });
});

// ---------------------------------------------------------------------------
// scene/nodeBuilder
//
// Ce module existait en double exemplaire, verbatim, dans `importScene` et
// `instantiatePrefab`. Aucun test ne couvrait le bloc inline : une divergence
// entre les deux chemins n'aurait été visible qu'à l'écran, comme un nœud
// reconstruit différemment selon qu'il vient d'un prefab ou d'un rechargement.
// Les assertions ci-dessous pinnent le comportement repris tel quel, défauts
// compris — ce sont les scènes déjà sauvegardées qui le dictent.
// ---------------------------------------------------------------------------

describe('scene/nodeBuilder — géométrie par subType', () => {
  /** dimension caractéristique de chaque géométrie, pour les distinguer. */
  const dims = (g: THREE.BufferGeometry): { w: number; h: number; d: number } => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    return {
      w: b.max.x - b.min.x,
      h: b.max.y - b.min.y,
      d: b.max.z - b.min.z,
    };
  };

  // Three.js travaille en float32 : comparer à 1e-4 près évite un échec
  // sur 1.7999999523162842 contre 1.8.
  const expectDims = (
    g: THREE.BufferGeometry,
    expected: { w: number; h: number; d: number }
  ) => {
    const actual = dims(g);
    expect(actual.w).toBeCloseTo(expected.w, 4);
    expect(actual.h).toBeCloseTo(expected.h, 4);
    expect(actual.d).toBeCloseTo(expected.d, 4);
  };

  it('construit un cube de 1,5 unité de côté', () => {
    const o = buildSimpleNode({ type: 'mesh' }, 'cube') as THREE.Mesh;
    expect(o).toBeInstanceOf(THREE.Mesh);
    expectDims(o.geometry, { w: 1.5, h: 1.5, d: 1.5 });
  });

  it('retombe sur le cube pour un subType inconnu', () => {
    // Un `subType` corrompu ou issu d'une version future ne doit pas produire
    // un objet sans géométrie : le cube est le filet de sécurité historique.
    const o = buildSimpleNode({ type: 'mesh' }, 'truc-qui-nexiste-pas') as THREE.Mesh;
    expectDims(o.geometry, { w: 1.5, h: 1.5, d: 1.5 });
  });

  it('respecte les dimensions figées de chaque primitive', () => {
    // Les scènes ne stockent PAS les dimensions : un cube fait donc toujours
    // 1,5 unité, quelle que soit l'échelle appliquée ensuite.
    expectDims(
      (buildSimpleNode({ type: 'mesh' }, 'sphere') as THREE.Mesh).geometry,
      { w: 1.8, h: 1.8, d: 1.8 }
    );
    expectDims(
      (buildSimpleNode({ type: 'mesh' }, 'plane') as THREE.Mesh).geometry,
      { w: 3, h: 3, d: 0 }
    );
    expectDims(
      (buildSimpleNode({ type: 'mesh' }, 'cylinder') as THREE.Mesh).geometry,
      { w: 1.5, h: 1.8, d: 1.5 }
    );
    expectDims(
      (buildSimpleNode({ type: 'mesh' }, 'cone') as THREE.Mesh).geometry,
      { w: 1.8, h: 1.8, d: 1.8 }
    );
    // Tore : il est construit dans le plan XY, donc 2 × (rayon + tube) en largeur
    // ET en hauteur, et 2 × tube en profondeur.
    expectDims(
      (buildSimpleNode({ type: 'mesh' }, 'torus') as THREE.Mesh).geometry,
      { w: 2.1, h: 2.1, d: 0.5 }
    );
    expectDims(
      (buildSimpleNode({ type: 'mesh' }, 'postProcessVolume') as THREE.Mesh).geometry,
      { w: 8, h: 5, d: 8 }
    );
  });
});

describe('scene/nodeBuilder — matériau', () => {
  it('applique les valeurs par défaut quand la scène n\'en porte pas', () => {
    const o = buildSimpleNode({ type: 'mesh' }, 'cube') as THREE.Mesh;
    const m = o.material as THREE.MeshStandardMaterial;
    expect(m.color.getHexString()).toBe('3b82f6');
    expect(m.roughness).toBe(0.35);
    expect(m.metalness).toBe(0.2);
    expect(m.opacity).toBe(1);
    expect(m.transparent).toBe(false);
    expect(m.emissive.getHex()).toBe(0x000000);
  });

  it('respecte les valeurs portées par la scène', () => {
    const o = buildSimpleNode(
      {
        type: 'mesh',
        material: {
          color: '#ff0000',
          roughness: 0.9,
          metalness: 0.05,
          wireframe: true,
          opacity: 0.25,
          transparent: true,
        },
      },
      'cube'
    ) as THREE.Mesh;
    const m = o.material as THREE.MeshStandardMaterial;
    expect(m.color.getHexString()).toBe('ff0000');
    expect(m.roughness).toBe(0.9);
    expect(m.metalness).toBe(0.05);
    expect(m.wireframe).toBe(true);
    expect(m.opacity).toBe(0.25);
    expect(m.transparent).toBe(true);
  });

  it('force le volume de post-traitement en filaire translucide', () => {
    // Sans matière déclarée, le volume est mauve, filaire, à 55 % — sinon il
    // apparaîtrait comme un cube bleu opaque et masquerait la scène.
    const o = buildSimpleNode({ type: 'mesh' }, 'postProcessVolume') as THREE.Mesh;
    const m = o.material as THREE.MeshStandardMaterial;
    expect(m.wireframe).toBe(true);
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBe(0.55);
    expect(m.color.getHexString()).toBe('d946ef');
  });

  it('laisse la matière de la scène gagner sur le volume', () => {
    const o = buildSimpleNode(
      { type: 'mesh', material: { color: '#00ff00', opacity: 0.1, wireframe: false } },
      'postProcessVolume'
    ) as THREE.Mesh;
    const m = o.material as THREE.MeshStandardMaterial;
    expect(m.color.getHexString()).toBe('00ff00');
    expect(m.opacity).toBe(0.1);
    expect(m.wireframe).toBe(false);
  });

  it('n\'accroche aucune normal map pour le preset « none »', () => {
    const o = buildSimpleNode(
      { type: 'mesh', material: { texturePreset: 'none' } },
      'cube'
    ) as THREE.Mesh;
    expect((o.material as THREE.MeshStandardMaterial).normalMap).toBeNull();
  });
});

describe('scene/nodeBuilder — lumières', () => {
  it('construit une directionnelle avec les valeurs de la scène', () => {
    // `LightData.color` est une chaîne CSS : c'est ce que le format persisté
    // contient et ce que l'Inspecteur produit.
    const o = buildSimpleNode(
      { type: 'light', light: { color: '#ff0000', intensity: 4 } },
      'directional'
    );
    expect(o).toBeInstanceOf(THREE.DirectionalLight);
    const l = o as THREE.DirectionalLight;
    expect(l.color.getHex()).toBe(0xff0000);
    expect(l.intensity).toBe(4);
    expect(l.userData).toEqual({ subType: 'directional' });
  });

  it('repli sur blanc pour une directionnelle sans couleur', () => {
    const o = buildSimpleNode({ type: 'light', light: {} }, 'directional') as THREE.DirectionalLight;
    expect(o.color.getHex()).toBe(0xffffff);
    expect(o.intensity).toBe(2.0);
  });

  it('repli sur cyan pour une ponctuelle sans couleur', () => {
    const o = buildSimpleNode({ type: 'light', light: {} }, 'point') as THREE.PointLight;
    expect(o.color.getHex()).toBe(0x38bdf8);
    expect(o.intensity).toBe(3.5);
    expect(o.distance).toBe(18);
  });

  it('construit une ponctuelle avec son helper de débogage', () => {
    const o = buildSimpleNode(
      { type: 'light', light: { color: '#00ff00', intensity: 2, distance: 5 } },
      'point'
    );
    expect(o).toBeInstanceOf(THREE.PointLight);
    const l = o as THREE.PointLight;
    expect(l.color.getHex()).toBe(0x00ff00);
    expect(l.distance).toBe(5);
    expect(l.userData).toEqual({ subType: 'point' });
    expect(o!.children.some((c) => c instanceof THREE.PointLightHelper)).toBe(true);
  });

  it('retombe sur une directionnelle pour une lumière de type inconnu', () => {
    const o = buildSimpleNode({ type: 'light', light: {} }, 'spot');
    expect(o).toBeInstanceOf(THREE.DirectionalLight);
  });
});

describe('scene/nodeBuilder — nœuds délégués et types inconnus', () => {
  it('renvoie null pour un type qu\'il ne construit pas', () => {
    expect(buildSimpleNode({ type: 'camera' }, 'perspective')).toBeNull();
    expect(buildSimpleNode({ type: 'helper' }, 'grid')).toBeNull();
  });

  it('renvoie la liste des nœuds qui appartiennent au NodeRestorer', () => {
    // Ces formes ont une reconstruction dédiée : groupes (joueur, PNJ,
    // véhicule…), palette low-poly, rivières procédurales.
    expect(needsNodeRestorer({ type: 'group' }, 'player')).toBe(true);
    expect(needsNodeRestorer({ type: 'mesh' }, 'lowPoly')).toBe(true);
    expect(needsNodeRestorer({ type: 'mesh' }, 'river')).toBe(true);

    expect(needsNodeRestorer({ type: 'mesh' }, 'cube')).toBe(false);
    expect(needsNodeRestorer({ type: 'light' }, 'point')).toBe(false);
  });
});
