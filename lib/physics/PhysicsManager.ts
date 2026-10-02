import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  Entity,
  ECSWorld,
  RigidbodyComponent,
  ColliderComponent,
  CharacterControllerComponent,
  RigAnimComponent,
  TransformComponent,
} from '../ecs/ECS';
import { CharacterControllerSystem } from './CharacterControllerSystem';
import { VehicleControllerSystem } from './VehicleControllerSystem';
import { RagdollSystem } from './RagdollSystem';
import { EnvironmentalPhysicsManager } from './EnvironmentalPhysicsManager';
import { clampNumber } from '../logic/inputLogic';
import {
  getWorldPosition,
  getWorldQuaternion,
  setLocalFromWorldPosition,
  setLocalFromWorldQuaternion,
} from './transformSpace';

/** Temps réutilisés par la synchro physique (pas d'alloc par frame). */
const _syncPos = new THREE.Vector3();
const _syncQuat = new THREE.Quaternion();

export interface PhysicsSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

/** Borne haute des demi-dimensions de colliders (m) : capte les Inf/échelles folles. */
const MAX_COLLIDER_DIM = 5000;

export class PhysicsManager {
  private static isInitialized: boolean = false;
  private static initPromise: Promise<void> | null = null;

  public world: RAPIER.World | null = null;
  public gravity: { x: number; y: number; z: number } = { x: 0, y: -9.81, z: 0 };
  public isSimulating: boolean = false;

  private ecsWorld: ECSWorld;
  public characterSystem: CharacterControllerSystem;
  public vehicleSystem: VehicleControllerSystem;
  public ragdollSystem: RagdollSystem;
  public environmentalPhysics: EnvironmentalPhysicsManager | null = null;

  // Snapshot to restore editor transforms when Play mode is stopped
  private sceneSnapshots: Map<string, PhysicsSnapshot> = new Map();

  // Internal Rapier reference mapping
  private entityToBody: Map<string, RAPIER.RigidBody> = new Map();
  private entityToCollider: Map<string, RAPIER.Collider> = new Map();
  private colliderHandleToEntity: Map<number, string> = new Map();
  private eventQueue: RAPIER.EventQueue | null = null;
  /** Drained after each step → LogicExecutor.handleCollision (Tier 3.1). */
  public onCollisionEvent?: (entityAId: string, entityBId: string) => void;
  private playerControllerHandle: RAPIER.KinematicCharacterController | null = null;
  private terrainGenerator: any = null;

  private trackCollider(entityId: string, collider: RAPIER.Collider): void {
    this.entityToCollider.set(entityId, collider);
    try {
      this.colliderHandleToEntity.set(collider.handle, entityId);
    } catch {
      /* older Rapier: ignore reverse map */
    }
  }

  constructor(ecsWorld: ECSWorld, camera?: THREE.PerspectiveCamera) {
    this.ecsWorld = ecsWorld;
    this.characterSystem = new CharacterControllerSystem(camera);
    this.vehicleSystem = new VehicleControllerSystem(camera);
    this.ragdollSystem = new RagdollSystem(ecsWorld);
  }

  public setTerrainGenerator(generator: any): void {
    this.terrainGenerator = generator;
  }

  /**
   * Initializes Rapier WebAssembly safely
   */
  public static async initRapier(): Promise<void> {
    if (PhysicsManager.isInitialized) return;
    if (!PhysicsManager.initPromise) {
      PhysicsManager.initPromise = RAPIER.init().then(() => {
        PhysicsManager.isInitialized = true;
      });
    }
    return PhysicsManager.initPromise;
  }

  /**
   * Starts the physical simulation (Play Mode)
   */
  public async startSimulation(): Promise<void> {
    await PhysicsManager.initRapier();

    // 1. Create Rapier World with gravity + collision event queue
    this.world = new RAPIER.World(this.gravity);
    try {
      this.eventQueue = new RAPIER.EventQueue(true);
    } catch {
      this.eventQueue = null;
    }
    this.isSimulating = true;
    this.sceneSnapshots.clear();
    this.entityToBody.clear();
    this.entityToCollider.clear();
    this.colliderHandleToEntity.clear();

    // 2. Add an infinite ground plane at Y = 0 (safety floor)
    // Règle de combinaison `Min` : sans elle, Rapier MOYENNE la friction de ce
    // plan avec celle de l'objet posé dessus. Un objet sur de la glace (0,02)
    // verrait sa friction remontée à (0,02 + 0,5) / 2 = 0,26 et ne glisserait
    // presque pas — le preset « glacier » serait inerte. `Min` applique la
    // surface la plus glissante, ce qui est le comportement attendu d'un sol
    // de glace (vérifié en physique réelle : tests/surfacePhysics.test.ts).
    const groundDesc = RAPIER.ColliderDesc.cuboid(500, 0.1, 500);
    groundDesc.setTranslation(0, -0.1, 0);
    groundDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
    groundDesc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    this.world.createCollider(groundDesc);

    // 2b. Add physical collider for the terrain if enabled
    if (this.terrainGenerator && this.terrainGenerator.config && this.terrainGenerator.config.enabled && this.terrainGenerator.mesh) {
      const trimeshData = this.extractTrimeshData(this.terrainGenerator.mesh);
      if (trimeshData && trimeshData.vertices.length > 0 && trimeshData.indices.length > 0) {
        try {
          const terrainDesc = RAPIER.ColliderDesc.trimesh(trimeshData.vertices, trimeshData.indices);
          const obj = this.terrainGenerator.mesh;
          terrainDesc
            .setTranslation(obj.position.x, obj.position.y, obj.position.z)
            .setRotation({
              x: obj.quaternion.x,
              y: obj.quaternion.y,
              z: obj.quaternion.z,
              w: obj.quaternion.w,
            });
          this.world.createCollider(terrainDesc);
        } catch (e) {
          console.warn('Failed to build Rapier terrain collider:', e);
        }
      }
    }

    // 3. Capture snapshots & build Rapier bodies for all entities
    const entities = this.ecsWorld.getAllEntities();
    for (const entity of entities) {
      if (!entity.active || !entity.object3D) continue;

      const obj = entity.object3D;

      // Save editor snapshot
      this.sceneSnapshots.set(entity.id, {
        position: obj.position.clone(),
        quaternion: obj.quaternion.clone(),
        scale: obj.scale.clone(),
      });

      // Synchronize initial Transform Component
      let transformComp = entity.getComponent<TransformComponent>('Transform');
      if (!transformComp) {
        transformComp = new TransformComponent();
        transformComp.syncFromObject3D(obj);
        entity.addComponent(transformComp);
      } else {
        transformComp.syncFromObject3D(obj);
      }

      // Check if entity has Rigidbody or Collider
      const rbComp = entity.getComponent<RigidbodyComponent>('Rigidbody');
      const colComp = entity.getComponent<ColliderComponent>('Collider');
      const charComp = entity.getComponent<CharacterControllerComponent>('CharacterController');

      if (charComp && charComp.enabled) {
        this.setupCharacterController(entity, charComp, colComp);
      } else if (rbComp && rbComp.enabled) {
        this.setupRigidBody(entity, rbComp, colComp);
      } else if (colComp && colComp.enabled) {
        // Static collider only (no active rigid body, e.g. level geometry)
        this.setupStaticCollider(entity, colComp);
      }
    }

    // Initialize Flammable Entities for thermal simulation
    if (this.environmentalPhysics) {
      for (const entity of this.ecsWorld.getAllEntities()) {
        const physicsData = (entity.object3D?.userData?.physics as any) || {};
        if (physicsData.flammable && physicsData.flammable.enabled) {
          this.environmentalPhysics.registerFlammableEntity(entity, physicsData.flammable);
        }
      }
    }

    // Activate Keyboard Input for controllers
    this.characterSystem.activate();
    this.vehicleSystem.activate();
  }

  /**
   * Stops simulation and faithfully restores objects to their editor positions
   */
  public stopSimulation(): void {
    this.isSimulating = false;
    this.characterSystem.deactivate();
    this.vehicleSystem.deactivate();

    if (this.environmentalPhysics) {
      this.environmentalPhysics.dispose();
    }

    // Restore snapshots for all entities
    for (const [id, snapshot] of this.sceneSnapshots.entries()) {
      const entity = this.ecsWorld.getEntity(id);
      if (entity && entity.object3D) {
        entity.object3D.position.copy(snapshot.position);
        entity.object3D.quaternion.copy(snapshot.quaternion);
        entity.object3D.scale.copy(snapshot.scale);

        const transformComp = entity.getComponent<TransformComponent>('Transform');
        if (transformComp) {
          transformComp.syncFromObject3D(entity.object3D);
        }
      }
    }

    // Clean up ragdolls
    this.ragdollSystem.dispose(this.world);

    // Clean up Rapier bodies and controller
    if (this.playerControllerHandle && this.world) {
      this.world.removeCharacterController(this.playerControllerHandle);
      this.playerControllerHandle = null;
    }

    if (this.world) {
      this.world.free();
      this.world = null;
    }
    if (this.eventQueue) {
      try {
        this.eventQueue.free();
      } catch {
        /* ignore */
      }
      this.eventQueue = null;
    }

    this.entityToBody.clear();
    this.entityToCollider.clear();
    this.colliderHandleToEntity.clear();
    this.sceneSnapshots.clear();

    // Clear raw references in components
    for (const entity of this.ecsWorld.getAllEntities()) {
      const rb = entity.getComponent<RigidbodyComponent>('Rigidbody');
      if (rb) rb.rawBody = null;
      const col = entity.getComponent<ColliderComponent>('Collider');
      if (col) col.rawCollider = null;
      const char = entity.getComponent<CharacterControllerComponent>('CharacterController');
      if (char) {
        char.rawController = null;
        char.rawBody = null;
        char.verticalVelocity = 0;
      }
    }
  }

  /**
   * Instantiates a dynamic, static or kinematic Rapier Rigidbody
   */
  private setupRigidBody(
    entity: Entity,
    rbComp: RigidbodyComponent,
    colComp?: ColliderComponent
  ): void {
    if (!this.world || !entity.object3D) return;

    const obj = entity.object3D;
    if (!this.assertSaneTransform(obj, entity)) return;
    obj.updateMatrixWorld(true);

    let bodyDesc: RAPIER.RigidBodyDesc;
    if (rbComp.bodyType === 'static') {
      bodyDesc = RAPIER.RigidBodyDesc.fixed();
    } else if (rbComp.bodyType === 'kinematic') {
      bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    } else {
      bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    }

    // Les corps Rapier vivent en espace MONDE (hiérarchie parent-enfant).
    getWorldPosition(obj, _syncPos);
    getWorldQuaternion(obj, _syncQuat);
    if (_syncQuat.lengthSq() > 1e-8) _syncQuat.normalize();
    else _syncQuat.identity();
    bodyDesc
      .setTranslation(_syncPos.x, _syncPos.y, _syncPos.z)
      .setRotation({ x: _syncQuat.x, y: _syncQuat.y, z: _syncQuat.z, w: _syncQuat.w })
      .setLinearDamping(this.finiteOr(rbComp.linearDamping, 0.05))
      .setAngularDamping(this.finiteOr(rbComp.angularDamping, 0.05));

    if (rbComp.lockRotations) {
      bodyDesc.lockRotations();
    }

    let body: RAPIER.RigidBody;
    try {
      body = this.world.createRigidBody(bodyDesc);
    } catch (err) {
      console.error(
        `[Physics] RigidBody ignoré pour '${obj.name}' (${entity.id}) : création impossible.`,
        err
      );
      return;
    }
    rbComp.rawBody = body;
    this.entityToBody.set(entity.id, body);

    // Create and attach collider to this body
    const shape = colComp?.shape || 'auto';
    const colliderDesc = this.createColliderDesc(obj, shape, colComp);
    if (colliderDesc) {
      colliderDesc.setRestitution(this.finiteOr(rbComp.restitution, 0.5));
      colliderDesc.setFriction(Math.max(0, this.finiteOr(rbComp.friction, 0.5)));
      if (colComp?.isSensor) colliderDesc.setSensor(true);

      try {
        const collider = this.world.createCollider(colliderDesc, body);
        this.trackCollider(entity.id, collider);
        if (colComp) colComp.rawCollider = collider;
      } catch (err) {
        console.error(
          `[Physics] Collider '${shape}' ignoré pour '${obj.name}' (${entity.id}) : paramètres rejetés par Rapier.`,
          err
        );
      }
    }
  }

  /**
   * Instantiates a static level collider without moving body
   */
  private setupStaticCollider(entity: Entity, colComp: ColliderComponent): void {
    if (!this.world || !entity.object3D) return;

    const obj = entity.object3D;
    if (!this.assertSaneTransform(obj, entity)) return;
    obj.updateMatrixWorld(true);

    const colliderDesc = this.createColliderDesc(obj, colComp.shape, colComp);
    if (colliderDesc) {
      getWorldPosition(obj, _syncPos);
      getWorldQuaternion(obj, _syncQuat);
      if (_syncQuat.lengthSq() > 1e-8) _syncQuat.normalize();
      else _syncQuat.identity();
      colliderDesc
        .setTranslation(_syncPos.x, _syncPos.y, _syncPos.z)
        .setRotation({ x: _syncQuat.x, y: _syncQuat.y, z: _syncQuat.z, w: _syncQuat.w });

      if (colComp.isSensor) colliderDesc.setSensor(true);

      try {
        const collider = this.world.createCollider(colliderDesc);
        colComp.rawCollider = collider;
        this.trackCollider(entity.id, collider);
      } catch (err) {
        console.error(
          `[Physics] Collider statique '${colComp.shape}' ignoré pour '${obj.name}' (${entity.id}).`,
          err
        );
      }
    }
  }

  /**
   * Sets up the kinematic Character Controller with Rapier autostep & snap to ground
   */
  private setupCharacterController(
    entity: Entity,
    charComp: CharacterControllerComponent,
    colComp?: ColliderComponent
  ): void {
    if (!this.world || !entity.object3D) return;

    const obj = entity.object3D;
    if (!this.assertSaneTransform(obj, entity)) return;
    obj.updateMatrixWorld(true);

    // Character Rigidbody is Kinematic Position-Based (espace monde).
    getWorldPosition(obj, _syncPos);
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(_syncPos.x, _syncPos.y, _syncPos.z)
      .lockRotations();

    let body: RAPIER.RigidBody;
    try {
      body = this.world.createRigidBody(bodyDesc);
    } catch (err) {
      console.error(
        `[Physics] Corps du CharacterController ignoré pour '${obj.name}' (${entity.id}).`,
        err
      );
      return;
    }
    this.entityToBody.set(entity.id, body);

    // Capsule Collider: height = TOTAL height (visual mesh height).
    // Cylindrical mid-section = total height minus the two hemispherical caps.
    const radius = THREE.MathUtils.clamp(this.finiteOr(colComp?.radius, 0.45), 0.01, MAX_COLLIDER_DIM);
    const rawHeight = this.finiteOr(colComp?.height, radius * 2 + 1.0);
    const halfHeight = Math.max(0, rawHeight / 2 - radius);
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
    colliderDesc.setFriction(0.0).setRestitution(0.0);

    try {
      const collider = this.world.createCollider(colliderDesc, body);
      this.trackCollider(entity.id, collider);
    } catch (err) {
      console.error(
        `[Physics] Capsule du CharacterController ignorée pour '${obj.name}' (${entity.id}).`,
        err
      );
      return;
    }

    // Create Rapier Character Controller
    const offset = 0.05;
    const controller = this.world.createCharacterController(offset);
    controller.enableAutostep(0.35, 0.2, true);
    controller.enableSnapToGround(0.3);
    controller.setUp(new RAPIER.Vector3(0, 1, 0));

    this.playerControllerHandle = controller;
    charComp.rawController = controller;
    charComp.rawBody = body;
  }

  /**
   * Creates an optimized Collider Descriptor based on shape type or auto-detection.
   * Toutes les dimensions sont assainies (finies, > 0, bornées) : un objet
   * dégénéré (boîte vide, NaN d'import, champ UI invalide) donne un collider
   * par défaut au lieu de faire paniquer le WASM Rapier (`unreachable`).
   */
  private createColliderDesc(
    obj: THREE.Object3D,
    shape: string,
    colComp?: ColliderComponent
  ): RAPIER.ColliderDesc | null {
    // 1. Explicit Sphere
    if (shape === 'sphere') {
      const raw = colComp?.radius || this.computeBoundingSphereRadius(obj);
      const radius = THREE.MathUtils.clamp(this.finiteOr(raw, 0.5), 0.05, MAX_COLLIDER_DIM);
      return RAPIER.ColliderDesc.ball(radius);
    }

    // 2. Explicit Capsule (height = TOTAL height including caps, matching visual mesh)
    if (shape === 'capsule') {
      let radius = colComp?.radius;
      let height = colComp?.height;
      if (radius === undefined || height === undefined) {
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        if (radius === undefined) radius = Math.max(size.x, size.z) / 2;
        if (height === undefined) height = size.y;
      }
      radius = THREE.MathUtils.clamp(this.finiteOr(radius, 0.45), 0.01, MAX_COLLIDER_DIM);
      height = THREE.MathUtils.clamp(
        this.finiteOr(height, radius * 2 + 1.0),
        0.02,
        MAX_COLLIDER_DIM * 2
      );
      // Cylindrical mid-section = total height minus the two hemispherical caps
      const halfHeight = Math.max(0, height / 2 - radius);
      return RAPIER.ColliderDesc.capsule(halfHeight, radius);
    }

    // 3. Explicit Cylinder (dimensions from mesh bounding box when not specified)
    if (shape === 'cylinder') {
      let radius = colComp?.radius;
      let height = colComp?.height;
      if (radius === undefined || height === undefined) {
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        if (radius === undefined) radius = Math.max(size.x, size.z) / 2;
        if (height === undefined) height = size.y;
      }
      const halfHeight = THREE.MathUtils.clamp(this.finiteOr(height, 1) / 2, 0.01, MAX_COLLIDER_DIM);
      const saneRadius = THREE.MathUtils.clamp(this.finiteOr(radius, 0.5), 0.01, MAX_COLLIDER_DIM);
      return RAPIER.ColliderDesc.cylinder(halfHeight, saneRadius);
    }

    // 4. Trimesh (Auto-fit for GLTF models & complex meshes)
    if (shape === 'trimesh' || (shape === 'auto' && obj.userData?.subType === 'model')) {
      const trimeshData = this.extractTrimeshData(obj);
      if (this.isValidTrimesh(trimeshData)) {
        try {
          return RAPIER.ColliderDesc.trimesh(trimeshData!.vertices, trimeshData!.indices);
        } catch (e) {
          console.warn(`[Physics] Trimesh '${obj.name}' rejeté, repli Box :`, e);
        }
      } else if (shape === 'trimesh') {
        console.warn(
          `[Physics] Trimesh '${obj.name}' dégénéré (sommets NaN/vides), repli Box.`
        );
      }
    }

    // 5. Box / Cuboid (default auto-fit bounding box)
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const halfX = THREE.MathUtils.clamp(this.finiteOr(colComp?.size?.x, size.x) / 2, 0.05, MAX_COLLIDER_DIM);
    const halfY = THREE.MathUtils.clamp(this.finiteOr(colComp?.size?.y, size.y) / 2, 0.05, MAX_COLLIDER_DIM);
    const halfZ = THREE.MathUtils.clamp(this.finiteOr(colComp?.size?.z, size.z) / 2, 0.05, MAX_COLLIDER_DIM);

    return RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ);
  }

  // -------------------------------------------------------------------------
  // Garde-fous Rapier : aucune valeur non finie ne doit atteindre le WASM
  // (panique `unreachable` qui tue toute la session Play).
  // -------------------------------------------------------------------------

  /** Retourne `value` si nombre fini, sinon `fallback`. */
  private finiteOr(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  /**
   * Vérifie que la transform d'un objet est saine avant setup physique.
   * Retourne false (avec log identifiant l'objet) si NaN/Infini détecté.
   */
  private assertSaneTransform(obj: THREE.Object3D, entity: Entity): boolean {
    const p = obj.position;
    const q = obj.quaternion;
    const vals = [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
    if (vals.every((v) => Number.isFinite(v))) return true;
    console.error(
      `[Physics] '${obj.name}' (${entity.id}) ignoré : transform invalide ` +
        `(pos=[${p.x},${p.y},${p.z}] quat=[${q.x},${q.y},${q.z},${q.w}]). ` +
        `Vérifiez ses valeurs dans l'inspecteur.`
    );
    return false;
  }

  /**
   * Valide les données trimesh : non vides, indices multiples de 3,
   * sommets finis, indices dans les bornes.
   */
  private isValidTrimesh(
    data: { vertices: Float32Array; indices: Uint32Array } | null
  ): data is { vertices: Float32Array; indices: Uint32Array } {
    if (!data || data.vertices.length < 9 || data.indices.length < 3) return false;
    if (data.indices.length % 3 !== 0) return false;
    const vCount = data.vertices.length / 3;
    for (let i = 0; i < data.vertices.length; i++) {
      if (!Number.isFinite(data.vertices[i])) return false;
    }
    for (let i = 0; i < data.indices.length; i++) {
      const idx = data.indices[i];
      if (!Number.isInteger(idx) || idx < 0 || idx >= vCount) return false;
    }
    return true;
  }

  /**
   * Computes approximate bounding sphere radius for auto-fit
   */
  private computeBoundingSphereRadius(obj: THREE.Object3D): number {
    const bbox = new THREE.Box3().setFromObject(obj);
    const sphere = new THREE.Sphere();
    bbox.getBoundingSphere(sphere);
    return Math.max(0.1, sphere.radius);
  }

  /**
   * Extracts vertices and indices from complex Three.js models or hierarchies for Trimesh Colliders
   */
  private extractTrimeshData(
    root: THREE.Object3D
  ): { vertices: Float32Array; indices: Uint32Array } | null {
    const allVertices: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;

    const rootInverseMatrix = new THREE.Matrix4().copy(root.matrixWorld).invert();

    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const geo = child.geometry.clone();
        child.updateMatrixWorld(true);

        // Compute transform matrix relative to root
        const relativeMatrix = new THREE.Matrix4()
          .copy(rootInverseMatrix)
          .multiply(child.matrixWorld);
        geo.applyMatrix4(relativeMatrix);

        const posAttr = geo.attributes.position;
        if (!posAttr) return;

        // Collect vertices
        for (let i = 0; i < posAttr.count; i++) {
          allVertices.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        }

        // Collect indices
        if (geo.index) {
          for (let i = 0; i < geo.index.count; i++) {
            allIndices.push(geo.index.getX(i) + vertexOffset);
          }
        } else {
          for (let i = 0; i < posAttr.count; i++) {
            allIndices.push(i + vertexOffset);
          }
        }

        vertexOffset += posAttr.count;
      }
    });

    if (allVertices.length === 0 || allIndices.length === 0) return null;

    return {
      vertices: new Float32Array(allVertices),
      indices: new Uint32Array(allIndices),
    };
  }

  /**
   * Step the physics simulation and synchronize with Three.js
   */
  public step(dt: number): void {
    if (!this.isSimulating || !this.world) return;

    // Fixed timestep clamp to prevent physics explosion
    const fixedDelta = Math.min(dt, 0.05);

    // 1. Update Character Controller inputs & physics movement
    this.updateCharacterControllerPhysics(fixedDelta);

    // 1b. Update Vehicle Controllers inputs & driving physics
    this.updateVehicleControllersPhysics(fixedDelta);

    // 1c. Sync kinematic bodies from Three.js to Rapier (espace monde).
    for (const [id, body] of this.entityToBody.entries()) {
      if (body.isKinematic()) {
        const entity = this.ecsWorld.getEntity(id);
        if (entity && entity.object3D) {
          const obj = entity.object3D;
          getWorldPosition(obj, _syncPos);
          getWorldQuaternion(obj, _syncQuat);
          if (_syncQuat.lengthSq() > 1e-8) _syncQuat.normalize();
          else _syncQuat.identity();
          body.setNextKinematicTranslation({ x: _syncPos.x, y: _syncPos.y, z: _syncPos.z });
          body.setNextKinematicRotation({ x: _syncQuat.x, y: _syncQuat.y, z: _syncQuat.z, w: _syncQuat.w });
        }
      }
    }

    // 2. Step Rapier World (+ event queue for collisions)
    if (this.eventQueue) {
      this.world.step(this.eventQueue);
      this.drainCollisionEvents();
    } else {
      this.world.step();
    }

    // 2b. Environmental Physics (Wind forces, fire propagation & damage, rain & wet friction)
    if (this.environmentalPhysics) {
      this.environmentalPhysics.stepPhysics(
        fixedDelta,
        this.world,
        this.entityToBody,
        this.entityToCollider
      );
    }

    // 2c. Step Ragdoll physics and bone synchronization
    this.ragdollSystem.step(this.world, fixedDelta);

    // 3. Synchronize Rapier bodies -> Three.js Objects & ECS Transform Components
    for (const [id, body] of this.entityToBody.entries()) {
      const entity = this.ecsWorld.getEntity(id);
      if (!entity || !entity.object3D) continue;

      // Ignore static bodies as they do not move
      if (body.isFixed()) continue;

      const translation = body.translation();
      const rotation = body.rotation();

      // Monde → local (hiérarchie) : le corps Rapier commande en monde.
      _syncPos.set(translation.x, translation.y, translation.z);
      _syncQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
      setLocalFromWorldPosition(entity.object3D, _syncPos);
      setLocalFromWorldQuaternion(entity.object3D, _syncQuat);

      const transformComp = entity.getComponent<TransformComponent>('Transform');
      if (transformComp) {
        transformComp.syncFromObject3D(entity.object3D);
      }
    }
  }

  /**
   * Drains Rapier collision events → LogicExecutor.handleCollision
   */
  private drainCollisionEvents(): void {
    if (!this.eventQueue || !this.onCollisionEvent) return;
    try {
      this.eventQueue.drainCollisionEvents((h1: number, h2: number, started: boolean) => {
        if (!started) return;
        const idA = this.colliderHandleToEntity.get(h1);
        const idB = this.colliderHandleToEntity.get(h2);
        if (idA && idB && idA !== idB) {
          this.onCollisionEvent?.(idA, idB);
        }
      });
      if (typeof this.eventQueue.drainContactForceEvents === 'function') {
        this.eventQueue.drainContactForceEvents(() => {});
      }
    } catch {
      /* EventQueue API differences — ignore */
    }
  }

  /**
   * Drives character kinematic movement through Rapier's CharacterController
   */
  private updateCharacterControllerPhysics(dt: number): void {
    if (!this.playerControllerHandle || !this.world) {
      // Fallback update without Rapier character controller
      this.characterSystem.update(dt, this.ecsWorld.getAllEntities());
      return;
    }

    const playerEntity = this.ecsWorld
      .getAllEntities()
      .find((e) => e.active && e.hasComponent('CharacterController') && e.object3D);

    if (!playerEntity || !playerEntity.object3D) return;

    // If ragdoll physics is currently active, camera still follows player but kinematic translation is suspended
    if (this.ragdollSystem.isRagdollActive(playerEntity.id)) {
      this.characterSystem.update(dt, [playerEntity]);
      return;
    }

    const controllerComp =
      playerEntity.getComponent<CharacterControllerComponent>('CharacterController');
    const collider = this.entityToCollider.get(playerEntity.id);
    const body = this.entityToBody.get(playerEntity.id);

    if (!controllerComp || !collider || !body) {
      this.characterSystem.update(dt, this.ecsWorld.getAllEntities());
      return;
    }

    const input = this.characterSystem.input;
    const obj = playerEntity.object3D;

    // Movement speed & direction (8-way, camera-relative — same as CharacterControllerSystem)
    // Les dérogations en jeu (nœuds du graphe) s'appliquent aussi dans ce
    // chemin : les deux étaient auparavant figés à −18 et vitesse nominale.
    const ov = controllerComp.runtimeOverrides;
    const traction = ov.traction ?? 1;
    const speed =
      controllerComp.speed *
      (input.sprint ? 1.5 : 1.0) *
      (input.crouch ? 0.5 : 1.0) *
      traction;
    const moveDir = this.characterSystem.getCameraRelativeMoveDir();

    if (moveDir.lengthSq() > 0.001) {
      moveDir.normalize();
      // No auto-rotation: le joueur garde son orientation Y manuelle (gizmo/éditeur).
    }

    // Friction au sol posée par SetSurface (glace ⇒ le joueur glisse).
    if (ov.groundFriction !== null) {
      const friction = clampNumber(ov.groundFriction, 0, 20, 0.5);
      if (controllerComp.isGrounded && moveDir.lengthSq() > 0.001) {
        const keep = Math.min(1, friction * dt * 6);
        controllerComp.velocity.x *= keep;
        controllerComp.velocity.z *= keep;
      }
    }

    // Résistance de l'air posée par SetDrag.
    if (ov.drag !== null) {
      const damp = Math.max(0, 1 - clampNumber(ov.drag, 0, 50, 0) * dt);
      controllerComp.velocity.x *= damp;
      controllerComp.velocity.z *= damp;
    }

    // Gravity and jumping
    const gravity = -18.0 * (ov.gravityScale ?? 1);
    if (controllerComp.isGrounded) {
      if (input.jump) {
        controllerComp.verticalVelocity = controllerComp.jumpForce;
        controllerComp.isGrounded = false;
      } else {
        controllerComp.verticalVelocity = -2.0; // slight stick to ground
      }
    } else {
      controllerComp.verticalVelocity += gravity * dt;
      if (controllerComp.verticalVelocity < -25) {
        controllerComp.verticalVelocity = -25;
      }
    }

    // Check Fall Trigger for Ragdoll
    const rigComp = playerEntity.getComponent<RigAnimComponent>('RigAnim');
    const ragdollCfg = rigComp?.ragdoll;
    if (ragdollCfg && ragdollCfg.enabled && ragdollCfg.triggerOnFall) {
      const fallThreshold = ragdollCfg.fallSpeedThreshold ?? -10.0;
      if (controllerComp.verticalVelocity < fallThreshold) {
        // High fall velocity triggered ragdoll impact
        this.triggerRagdoll(playerEntity.id, new THREE.Vector3(0, controllerComp.verticalVelocity * 0.4, 0));
        return;
      }
    }

    const desiredTranslation = new RAPIER.Vector3(
      moveDir.x * speed * dt,
      controllerComp.verticalVelocity * dt,
      moveDir.z * speed * dt
    );

    // Let Rapier compute collision movement and handle stairs/slopes
    this.playerControllerHandle.computeColliderMovement(collider, desiredTranslation);
    const correctedMovement = this.playerControllerHandle.computedMovement();
    controllerComp.isGrounded = this.playerControllerHandle.computedGrounded();

    // If grounded after movement, zero vertical velocity
    if (controllerComp.isGrounded && controllerComp.verticalVelocity < 0) {
      controllerComp.verticalVelocity = 0;
    }

    // Apply movement to Rapier body
    const currentPos = body.translation();
    const newPos = new RAPIER.Vector3(
      currentPos.x + correctedMovement.x,
      currentPos.y + correctedMovement.y,
      currentPos.z + correctedMovement.z
    );

    // Keep minimum safety floor (capsule bottom offset = halfHeight + radius = 0.9)
    if (newPos.y < 0.9) {
      newPos.y = 0.9;
      controllerComp.isGrounded = true;
      controllerComp.verticalVelocity = 0;
    }

    body.setNextKinematicTranslation(newPos);
    // Monde → local : le joueur peut être enfant d'un groupe.
    _syncPos.set(newPos.x, newPos.y, newPos.z);
    setLocalFromWorldPosition(obj, _syncPos);

    // Update current speed for animations
    controllerComp.velocity.set(correctedMovement.x / dt, 0, correctedMovement.z / dt);
    controllerComp.currentSpeed = Math.sqrt(controllerComp.velocity.x ** 2 + controllerComp.velocity.z ** 2);

    // Update Camera Follow
    this.characterSystem.update(dt, [playerEntity]);
  }

  /**
   * Drives vehicle physics, tire suspension, steering and dynamic follow camera
   */
  private updateVehicleControllersPhysics(dt: number): void {
    const vehicleEntities = this.ecsWorld
      .getAllEntities()
      .filter(
        (e) =>
          e.active &&
          e.object3D &&
          e.object3D.userData?.physics?.vehicleController?.enabled
      );

    for (const entity of vehicleEntities) {
      const vehicleData = entity.object3D!.userData.physics.vehicleController;
      this.vehicleSystem.update(dt, entity, vehicleData, new Map());
    }
  }

  public getEntityRigidbody(entityId: string): RAPIER.RigidBody | undefined {
    return this.entityToBody.get(entityId);
  }

  /**
   * Collider d'une entité, pour modifier ses propriétés PENDANT la simulation.
   *
   * `friction` et `restitution` sont mutables sur un collier déjà créé (c'est
   * ce que fait `applyRainToPhysics` pour le sol mouillé) : inutile de
   * recréer le corps pour un changement de surface en cours de jeu.
   */
  public getEntityCollider(entityId: string): RAPIER.Collider | undefined {
    return this.entityToCollider.get(entityId);
  }

  /**
   * Change la friction/rebond d'un corps en cours de jeu.
   * Retourne false si l'entité n'a pas de corps physique simulé.
   *
   * RÈGLE DE COMBINAISON — c'est le point qui fait toute la différence :
   * Rapier combine par DÉFAUT les coefficients des deux corps en contact par
   * la MOYENNE. Une glace à 0,02 posée sur un joueur à 0,5 donnerait
   * (0,02 + 0,5) / 2 = 0,26 : on glisserait à peine. Le preset « glacier »
   * serait donc inerte — c'est exactement ce que le test d'intégration réelle
   * a révélé.
   *
   * On force la règle `Min` : la surface la plus glissante l'emporte toujours.
   * Un sol de glace rend glissant tout ce qui le touche, quelle que soit la
   * friction de l'objet, et un sol de caoutchouc reste très accrocheur.
   */
  public setSurfaceProperties(
    entityId: string,
    friction?: number,
    restitution?: number
  ): boolean {
    const col = this.entityToCollider.get(entityId);
    if (!col) return false;
    if (typeof friction === 'number' && Number.isFinite(friction)) {
      col.setFriction(Math.max(0, friction));
    }
    if (typeof restitution === 'number' && Number.isFinite(restitution)) {
      col.setRestitution(Math.max(0, restitution));
    }
    // `Min` existe sur le descripteur ET sur le collier en cours de jeu.
    try {
      col.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
      col.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
    } catch {
      // Versions anciennes de Rapier : la règle reste Average, le réglage de
      // la friction fonctionne quand même (seule la combinaison est moyennée).
    }
    return true;
  }

  /**
   * Change la masse d'un corps en cours de jeu.
   * Rapier refuse une masse nulle ou négative : on borne à un minimum.
   */
  public setBodyMass(entityId: string, mass: number): boolean {
    const body = this.entityToBody.get(entityId);
    if (!body || !Number.isFinite(mass)) return false;
    // Garde-fou Rapier : une masse nulle fait considérer le corps comme fixe.
    const safe = Math.max(0.001, mass);
    body.setAdditionalMass(safe - body.mass(), true);
    return true;
  }

  /**
   * Résistance de l'air / amortissement d'un corps en cours de jeu.
   */
  public setBodyDamping(
    entityId: string,
    linear?: number,
    angular?: number
  ): boolean {
    const body = this.entityToBody.get(entityId);
    if (!body) return false;
    if (typeof linear === 'number' && Number.isFinite(linear)) {
      body.setLinearDamping(Math.max(0, linear));
    }
    if (typeof angular === 'number' && Number.isFinite(angular)) {
      body.setAngularDamping(Math.max(0, angular));
    }
    return true;
  }

  /**
   * Renvoie (linéaire, angulaire) d'un corps — utile pour les capteurs
   * (vitesse d'impact, intensité de rumleur proportionnelle à la vitesse).
   */
  public getBodySpeed(entityId: string): { linear: number; angular: number } | null {
    const body = this.entityToBody.get(entityId);
    if (!body) return null;
    const v = body.linvel();
    const w = body.angvel();
    return {
      linear: Math.hypot(v.x, v.y, v.z),
      angular: Math.hypot(w.x, w.y, w.z),
    };
  }

  /**
   * Return number of active physics bodies in the world
   */
  public getBodiesCount(): number {
    return this.entityToBody.size;
  }

  /**
   * Triggers ragdoll physics on an entity (humanoid or model with SkinnedMesh / bones)
   */
  public triggerRagdoll(
    entityId: string,
    impulse?: THREE.Vector3,
    hitBoneName?: string
  ): boolean {
    if (!this.world || !this.isSimulating) return false;
    const entity = this.ecsWorld.getEntity(entityId);
    if (!entity || !entity.object3D) return false;

    const rigComp = entity.getComponent<RigAnimComponent>('RigAnim');
    const config = rigComp?.ragdoll || {
      enabled: true,
      triggerOnDamage: true,
      triggerOnFall: true,
      fallSpeedThreshold: -10,
      damping: 2.0,
      totalMass: 75,
      autoGetUp: true,
      getUpDelay: 4.0,
      bones: RagdollSystem.autoDetectBones(entity.object3D),
    };

    return this.ragdollSystem.activateRagdoll(
      this.world,
      entity,
      config,
      impulse,
      hitBoneName
    );
  }

  /**
   * Deactivates ragdoll simulation on an entity
   */
  public deactivateRagdoll(entityId: string): void {
    if (!this.world) return;
    this.ragdollSystem.deactivateRagdoll(this.world, entityId);
  }

  /**
   * Checks if an entity is currently simulating ragdoll physics
   */
  public isRagdollActive(entityId: string): boolean {
    return this.ragdollSystem.isRagdollActive(entityId);
  }

  /**
   * Cleanly dispose physics world and systems
   */
  public dispose(): void {
    this.stopSimulation();
    this.ragdollSystem.dispose(this.world);
    this.characterSystem.dispose();
    this.vehicleSystem.dispose();
  }
}
