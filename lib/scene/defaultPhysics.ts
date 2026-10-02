/**
 * defaultPhysics.ts
 * Context-aware default physics profiles, extracted from SceneManager.
 *
 * This was `SceneManager.assignDefaultPhysics()`. It never touched `this` — it
 * only reads `obj.userData` / `obj.name` and attaches components to the given
 * entity — so it is a free function, not a method, and can be unit-tested in a
 * plain Node environment.
 *
 * The branch order is significant: ground-like objects win over `subType`, and
 * the special cases (player / vehicle) are checked before the generic dynamic
 * mesh fallback. It is preserved exactly as it was.
 */

import * as THREE from 'three';
import {
  Entity,
  RigidbodyComponent,
  ColliderComponent,
  CharacterControllerComponent,
} from '../ecs/ECS';
import type { PhysicsNodeData } from '../../types/engine';
import { createVehiclePhysics } from './vehicleFactory';

/**
 * Assigns context-aware default physics configurations to entities.
 */
export function assignDefaultPhysics(obj: THREE.Object3D, entity: Entity): void {
  obj.userData = obj.userData || {};

  // Objects explicitly marked as non-physical (e.g. seed scene decoration)
  if (obj.userData.noPhysics) return;

  // Is it ground / pedestal or level geometry?
  if (
    obj.name === 'Base Pedestal' ||
    obj.userData.subType === 'plane' ||
    obj.name.toLowerCase().includes('ground') ||
    obj.name.toLowerCase().includes('floor')
  ) {
    const physics: PhysicsNodeData = {
      rigidbody: {
        enabled: true,
        type: 'static',
        mass: 0,
        restitution: 0.2,
        friction: 0.8,
      },
      collider: {
        shape: obj.userData.subType === 'cylinder' ? 'cylinder' : 'box',
      },
    };
    obj.userData.physics = physics;
    entity.addComponent(new RigidbodyComponent(physics.rigidbody));
    entity.addComponent(new ColliderComponent(physics.collider));
    return;
  }

  // Is it a player character?
  if (obj.userData.subType === 'player') {
    const physics: PhysicsNodeData = {
      rigidbody: {
        enabled: true,
        type: 'kinematic',
        mass: 75,
        restitution: 0.0,
        friction: 0.2,
        lockRotations: true,
      },
      collider: {
        shape: 'capsule',
        radius: 0.45,
        height: 1.8,
      },
      characterController: {
        enabled: true,
        mode: 'thirdPerson',
        speed: 7.0,
        jumpForce: 8.5,
        isGrounded: true,
        cameraDistance: 6.0,
        cameraHeight: 3.5,
        cameraOffsetX: 0.0,
        cameraLerpSpeed: 10.0,
      },
    };
    obj.userData.physics = physics;
    entity.addComponent(new RigidbodyComponent(physics.rigidbody));
    entity.addComponent(new ColliderComponent(physics.collider));
    entity.addComponent(new CharacterControllerComponent(physics.characterController));
    return;
  }

  // Is it a vehicle?
  if (obj.userData.subType === 'vehicle') {
    const physics: PhysicsNodeData = obj.userData.physics || createVehiclePhysics();
    obj.userData.physics = physics;
    entity.addComponent(new RigidbodyComponent(physics.rigidbody));
    entity.addComponent(new ColliderComponent(physics.collider));
    return;
  }

  // Standard physical mesh (dynamic by default: cube, sphere, cylinder, model)
  if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
    const subType = obj.userData.subType;
    const isSphere = subType === 'sphere';
    const isCylinder = subType === 'cylinder';
    const isModel = subType === 'model';

    const physics: PhysicsNodeData = {
      rigidbody: {
        enabled: true,
        type: 'dynamic',
        mass: isSphere ? 0.8 : 1.0,
        restitution: isSphere ? 0.75 : 0.4,
        friction: 0.5,
        linearDamping: 0.05,
        angularDamping: 0.05,
      },
      collider: {
        shape: isSphere
          ? 'sphere'
          : isCylinder
          ? 'cylinder'
          : isModel
          ? 'trimesh'
          : 'auto',
      },
    };
    obj.userData.physics = physics;
    entity.addComponent(new RigidbodyComponent(physics.rigidbody));
    entity.addComponent(new ColliderComponent(physics.collider));
  }
}
