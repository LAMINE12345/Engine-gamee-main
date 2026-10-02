import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import {
  RigidbodyType,
  ColliderShapeType,
  RigidbodyData,
  ColliderData,
  CharacterControllerData,
} from '../../types/engine';

/**
 * Base Component Interface for Aether ECS
 */
export interface IComponent {
  readonly type: string;
  enabled: boolean;
  entity: Entity | null;
  onAttach?(entity: Entity): void;
  onDetach?(): void;
}

export abstract class BaseComponent implements IComponent {
  abstract readonly type: string;
  public enabled: boolean = true;
  public entity: Entity | null = null;

  public onAttach(entity: Entity): void {
    this.entity = entity;
  }

  public onDetach(): void {
    this.entity = null;
  }
}

/**
 * 1. Transform Component (Three.js Spatial Synchronization)
 */
export class TransformComponent extends BaseComponent {
  readonly type = 'Transform';

  public position: THREE.Vector3;
  public rotation: THREE.Euler;
  public scale: THREE.Vector3;
  public quaternion: THREE.Quaternion;

  constructor(
    pos = new THREE.Vector3(0, 0, 0),
    rot = new THREE.Euler(0, 0, 0),
    scl = new THREE.Vector3(1, 1, 1)
  ) {
    super();
    this.position = pos.clone();
    this.rotation = rot.clone();
    this.scale = scl.clone();
    this.quaternion = new THREE.Quaternion().setFromEuler(this.rotation);
  }

  public syncFromObject3D(object: THREE.Object3D): void {
    this.position.copy(object.position);
    this.quaternion.copy(object.quaternion);
    this.rotation.copy(object.rotation);
    this.scale.copy(object.scale);
  }

  public syncToObject3D(object: THREE.Object3D): void {
    object.position.copy(this.position);
    object.quaternion.copy(this.quaternion);
    object.scale.copy(this.scale);
  }
}

/**
 * 2. Mesh Component (Visual Rendering reference)
 */
export class MeshComponent extends BaseComponent {
  readonly type = 'Mesh';

  public object3D: THREE.Object3D;
  public castShadow: boolean;
  public receiveShadow: boolean;

  constructor(object3D: THREE.Object3D) {
    super();
    this.object3D = object3D;
    this.castShadow = object3D.castShadow;
    this.receiveShadow = object3D.receiveShadow;
  }
}

/**
 * 3. Rigidbody Component (Rapier 3D Physical Body)
 */
export class RigidbodyComponent extends BaseComponent {
  readonly type = 'Rigidbody';

  public bodyType: RigidbodyType = 'dynamic';
  public mass: number = 1.0;
  public restitution: number = 0.5; // Rebond [0..1]
  public friction: number = 0.5; // [0..1]
  public linearDamping: number = 0.05;
  public angularDamping: number = 0.05;
  public lockRotations: boolean = false;

  // Runtime Rapier handle (instantiated during Play mode)
  public rawBody: RAPIER.RigidBody | null = null;

  constructor(data?: Partial<RigidbodyData>) {
    super();
    if (data) {
      if (data.type !== undefined) this.bodyType = data.type;
      if (data.mass !== undefined) this.mass = data.mass;
      if (data.restitution !== undefined) this.restitution = data.restitution;
      if (data.friction !== undefined) this.friction = data.friction;
      if (data.linearDamping !== undefined) this.linearDamping = data.linearDamping;
      if (data.angularDamping !== undefined) this.angularDamping = data.angularDamping;
      if (data.lockRotations !== undefined) this.lockRotations = data.lockRotations;
    }
  }

  public toData(): RigidbodyData {
    return {
      enabled: this.enabled,
      type: this.bodyType,
      mass: this.mass,
      restitution: this.restitution,
      friction: this.friction,
      linearDamping: this.linearDamping,
      angularDamping: this.angularDamping,
      lockRotations: this.lockRotations,
    };
  }
}

/**
 * 4. Collider Component (Collision geometry representation)
 */
export class ColliderComponent extends BaseComponent {
  readonly type = 'Collider';

  public shape: ColliderShapeType = 'auto';
  public isSensor: boolean = false;
  public size?: { x: number; y: number; z: number };
  public radius?: number;
  public height?: number;

  // Runtime Rapier handle
  public rawCollider: RAPIER.Collider | null = null;

  constructor(data?: Partial<ColliderData>) {
    super();
    if (data) {
      if (data.shape !== undefined) this.shape = data.shape;
      if (data.isSensor !== undefined) this.isSensor = data.isSensor;
      if (data.size) this.size = { ...data.size };
      if (data.radius !== undefined) this.radius = data.radius;
      if (data.height !== undefined) this.height = data.height;
    }
  }

  public toData(): ColliderData {
    return {
      shape: this.shape,
      isSensor: this.isSensor,
      size: this.size ? { ...this.size } : undefined,
      radius: this.radius,
      height: this.height,
    };
  }
}

/**
 * 5. Character Controller Component (Ready-to-use Player Entity)
 */
export class CharacterControllerComponent extends BaseComponent {
  readonly type = 'CharacterController';

  public mode: 'thirdPerson' | 'firstPerson' = 'thirdPerson';
  public speed: number = 7.0; // m/s
  public jumpForce: number = 8.5; // initial jump impulse velocity
  public isGrounded: boolean = true;
  // Third-person camera rig (Distance = arm length, Height = pitch source, OffsetX = shoulder)
  public cameraDistance: number = 6.0;
  public cameraHeight: number = 3.5;
  public cameraOffsetX: number = 0.0;
  public cameraLerpSpeed: number = 10.0; // exponential follow smoothing (Hz)
  public currentSpeed: number = 0;
  public velocity: THREE.Vector3 = new THREE.Vector3();

  // Runtime kinematic controller handle
  public rawController: RAPIER.KinematicCharacterController | null = null;
  public rawBody: RAPIER.RigidBody | null = null;
  public verticalVelocity: number = 0;

  /**
   * Dérogations posees EN JEU par les noeuds du graphe (SetGravity,
   * SetSurface, SetDrag, SetTimeScale).
   *
   * Volontairement hors de `CharacterControllerData` / `toData()` : ces
   * valeurs ne doivent PAS etre sauvegardees avec la scene. Un sol de glace
   * pose en cours de partie disparait quand on sort du Play — ce qui est
   * correct, puisque c'etait un effet de jeu, pas une propriete de l'objet.
   *
   * `null` = aucune derogation, le systeme utilise sa valeur propre.
   */
  public runtimeOverrides: {
    /** Multiplicateur de gravite : 1 = terrestre, 0.166 = Lune, 0 = zero-G. */
    gravityScale: number | null;
    /** Multiplicateur de traction applique a la vitesse de deplacement. */
    traction: number | null;
    /** Friction au sol (0 = glisse comme sur de la glace). */
    groundFriction: number | null;
    /** Resistance de l'air (amortissement lineaire de la vitesse). */
    drag: number | null;
  } = {
    gravityScale: null,
    traction: null,
    groundFriction: null,
    drag: null,
  };

  /** Efface toutes les derogations en jeu (appele au Stop du Play). */
  public clearRuntimeOverrides(): void {
    this.runtimeOverrides.gravityScale = null;
    this.runtimeOverrides.traction = null;
    this.runtimeOverrides.groundFriction = null;
    this.runtimeOverrides.drag = null;
  }

  constructor(data?: Partial<CharacterControllerData>) {
    super();
    if (data) {
      if (data.mode !== undefined) this.mode = data.mode;
      if (data.speed !== undefined) this.speed = data.speed;
      if (data.jumpForce !== undefined) this.jumpForce = data.jumpForce;
      if (data.cameraDistance !== undefined) this.cameraDistance = data.cameraDistance;
      if (data.cameraHeight !== undefined) this.cameraHeight = data.cameraHeight;
      if (data.cameraOffsetX !== undefined) this.cameraOffsetX = data.cameraOffsetX;
      if (data.cameraLerpSpeed !== undefined) this.cameraLerpSpeed = data.cameraLerpSpeed;
    }
  }

  public toData(): CharacterControllerData {
    return {
      enabled: this.enabled,
      mode: this.mode,
      speed: this.speed,
      jumpForce: this.jumpForce,
      isGrounded: this.isGrounded,
      cameraDistance: this.cameraDistance,
      cameraHeight: this.cameraHeight,
      cameraOffsetX: this.cameraOffsetX,
      cameraLerpSpeed: this.cameraLerpSpeed,
    };
  }
}

/**
 * 6. Light Component (ECS Light abstraction)
 */
export class LightComponent extends BaseComponent {
  readonly type = 'Light';

  public light: THREE.Light;
  public color: string;
  public intensity: number;

  constructor(light: THREE.Light) {
    super();
    this.light = light;
    this.color = `#${light.color.getHexString()}`;
    this.intensity = light.intensity;
  }
}

/**
 * 7. Script Component (User / Simulation custom lifecycle)
 */
export class ScriptComponent extends BaseComponent {
  readonly type = 'Script';

  public onUpdate?: (entity: Entity, dt: number) => void;
  public onCollision?: (other: Entity) => void;

  constructor(onUpdate?: (entity: Entity, dt: number) => void) {
    super();
    this.onUpdate = onUpdate;
  }
}

/**
 * 8. Toon Material Component
 */
export class ToonMaterialComponent extends BaseComponent {
  readonly type = 'ToonMaterial';
  public colorLevels: number = 4.0;
  public vibrancy: number = 1.0;
  constructor(colorLevels = 4.0, vibrancy = 1.0) {
    super();
    this.colorLevels = colorLevels;
    this.vibrancy = vibrancy;
  }
}

/**
 * 9. Outline Component
 */
export class OutlineComponent extends BaseComponent {
  readonly type = 'Outline';
  public strength: number = 1.0;
  public color: string = '#000000';
  constructor(strength = 1.0, color = '#000000') {
    super();
    this.strength = strength;
    this.color = color;
  }
}

/**
 * 10. RigAnim Component (Animation Mapping & Rigging metadata)
 */
import { RigAnimData } from '../../types/engine';
export class RigAnimComponent extends BaseComponent {
  readonly type = 'RigAnim';

  public rigType: RigAnimData['rigType'] = 'biped';
  public mapping: RigAnimData['animationMapping'] = {};
  public autoAnimate: boolean = true;
  public blendTree?: RigAnimData['blendTree'];
  public ragdoll?: RigAnimData['ragdoll'];
  public vehicleWheels: RigAnimData['vehicleWheels'] = {};

  constructor(data?: Partial<RigAnimData>) {
    super();
    if (data) {
      if (data.enabled !== undefined) this.enabled = data.enabled;
      if (data.rigType !== undefined) this.rigType = data.rigType;
      if (data.animationMapping !== undefined) this.mapping = data.animationMapping;
      if (data.autoAnimate !== undefined) this.autoAnimate = data.autoAnimate;
      if (data.blendTree !== undefined) this.blendTree = data.blendTree;
      if (data.ragdoll !== undefined) this.ragdoll = data.ragdoll;
      if (data.vehicleWheels !== undefined) this.vehicleWheels = data.vehicleWheels;
    }
  }

  public toData(): RigAnimData {
    return {
      enabled: this.enabled,
      rigType: this.rigType,
      animationMapping: this.mapping,
      autoAnimate: this.autoAnimate,
      blendTree: this.blendTree,
      ragdoll: this.ragdoll,
      vehicleWheels: this.vehicleWheels,
    };
  }
}

/**
 * Entity (represents a 3D object in the Aether World with an UUID)
 */
export class Entity {
  public readonly id: string;
  public name: string;
  public active: boolean = true;
  public object3D: THREE.Object3D | null = null;
  private components: Map<string, IComponent> = new Map();

  constructor(id: string, name: string = 'Entity', object3D: THREE.Object3D | null = null) {
    this.id = id;
    this.name = name;
    this.object3D = object3D;
  }

  public addComponent<T extends IComponent>(component: T): this {
    component.onAttach?.(this);
    this.components.set(component.type, component);
    return this;
  }

  public getComponent<T extends IComponent>(type: string): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  public hasComponent(type: string): boolean {
    return this.components.has(type);
  }

  public removeComponent(type: string): this {
    const comp = this.components.get(type);
    if (comp) {
      comp.onDetach?.();
      this.components.delete(type);
    }
    return this;
  }

  public getAllComponents(): IComponent[] {
    return Array.from(this.components.values());
  }

  public dispose(): void {
    this.components.forEach((comp) => comp.onDetach?.());
    this.components.clear();
    this.object3D = null;
  }
}

/**
 * System Base Class
 */
export abstract class System {
  abstract readonly name: string;
  public enabled: boolean = true;

  abstract update(dt: number, entities: Entity[]): void;
}

/**
 * ECS World Container
 */
export class ECSWorld {
  private entities: Map<string, Entity> = new Map();
  private systems: System[] = [];

  public createEntity(
    id: string,
    name: string = 'Entity',
    object3D: THREE.Object3D | null = null
  ): Entity {
    let entity = this.entities.get(id);
    if (!entity) {
      entity = new Entity(id, name, object3D);
      this.entities.set(id, entity);
    } else {
      entity.name = name;
      if (object3D) entity.object3D = object3D;
    }
    return entity;
  }

  public getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  public removeEntity(id: string): void {
    const entity = this.entities.get(id);
    if (entity) {
      entity.dispose();
      this.entities.delete(id);
    }
  }

  public getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  public addSystem(system: System): this {
    this.systems.push(system);
    return this;
  }

  public update(dt: number): void {
    const entityList = this.getAllEntities().filter((e) => e.active);
    for (const system of this.systems) {
      if (system.enabled) {
        system.update(dt, entityList);
      }
    }
  }

  public clear(): void {
    this.entities.forEach((entity) => entity.dispose());
    this.entities.clear();
  }
}
