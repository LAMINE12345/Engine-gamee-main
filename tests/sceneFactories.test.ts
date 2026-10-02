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
