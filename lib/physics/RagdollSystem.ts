import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  RagdollBodyPart,
  RagdollBoneConfig,
  RagdollConfig,
} from '../../types/engine';
import { Entity, ECSWorld, CharacterControllerComponent } from '../ecs/ECS';

export interface ActiveRagdollBody {
  part: RagdollBodyPart;
  boneName: string;
  bone: THREE.Bone | THREE.Object3D;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  initialLocalPos: THREE.Vector3;
  initialLocalRot: THREE.Quaternion;
  radius: number;
  height: number;
  alignmentQuat: THREE.Quaternion; // Quaternion aligning Three.js capsule Y axis with bone direction
}

export interface ActiveRagdoll {
  entityId: string;
  entity: Entity;
  rootObj: THREE.Object3D;
  skeleton?: THREE.Skeleton;
  bodies: Map<string, ActiveRagdollBody>;
  joints: RAPIER.ImpulseJoint[];
  activeTimer: number;
  config: RagdollConfig;
  previousControllerEnabled: boolean;
}

// Semantic keywords for standard biped humanoid bones
const BONE_NAME_KEYWORDS: Record<RagdollBodyPart, string[]> = {
  pelvis: ['pelvis', 'hip', 'root', 'bip01_pelvis', 'mixamorig:hips'],
  spine: ['spine', 'spine1', 'torso', 'lower_body', 'mixamorig:spine', 'mixamorig:spine1'],
  chest: ['chest', 'spine2', 'upper_body', 'mixamorig:spine2', 'ribs'],
  head: ['head', 'neck', 'bip01_head', 'mixamorig:head'],
  upperArmL: ['leftarm', 'leftupperarm', 'arm_l', 'upperarm_l', 'shoulder_l', 'mixamorig:leftarm', 'left_arm'],
  lowerArmL: ['leftforearm', 'leftlowerarm', 'forearm_l', 'lowerarm_l', 'elbow_l', 'mixamorig:leftforearm', 'left_forearm'],
  upperArmR: ['rightarm', 'rightupperarm', 'arm_r', 'upperarm_r', 'shoulder_r', 'mixamorig:rightarm', 'right_arm'],
  lowerArmR: ['rightforearm', 'rightlowerarm', 'forearm_r', 'lowerarm_r', 'elbow_r', 'mixamorig:rightforearm', 'right_forearm'],
  thighL: ['leftupleg', 'leftthigh', 'thigh_l', 'upleg_l', 'femur_l', 'mixamorig:leftupleg', 'left_leg'],
  calfL: ['leftleg', 'leftcalf', 'calf_l', 'leg_l', 'shin_l', 'knee_l', 'mixamorig:leftleg', 'left_foreleg'],
  thighR: ['rightupleg', 'rightthigh', 'thigh_r', 'upleg_r', 'femur_r', 'mixamorig:rightupleg', 'right_leg'],
  calfR: ['rightleg', 'rightcalf', 'calf_r', 'leg_r', 'shin_r', 'knee_r', 'mixamorig:rightleg', 'right_foreleg'],
  custom: [],
};

// Hierarchy connections for physics joints
const PARENT_JOINT_MAP: Partial<Record<RagdollBodyPart, RagdollBodyPart>> = {
  spine: 'pelvis',
  chest: 'spine',
  head: 'chest',
  upperArmL: 'chest',
  lowerArmL: 'upperArmL',
  upperArmR: 'chest',
  lowerArmR: 'upperArmR',
  thighL: 'pelvis',
  calfL: 'thighL',
  thighR: 'pelvis',
  calfR: 'thighR',
};

// Proportional mass distribution for humanoid (total ~75kg)
const BODY_PART_MASS: Record<RagdollBodyPart, number> = {
  pelvis: 14.0,
  spine: 12.0,
  chest: 16.0,
  head: 4.5,
  upperArmL: 3.2,
  lowerArmL: 2.0,
  upperArmR: 3.2,
  lowerArmR: 2.0,
  thighL: 7.5,
  calfL: 4.2,
  thighR: 7.5,
  calfR: 4.2,
  custom: 3.0,
};

export class RagdollSystem {
  private activeRagdolls: Map<string, ActiveRagdoll> = new Map();
  private debugHelpers: Map<string, THREE.Group> = new Map();

  constructor(private ecsWorld: ECSWorld) {}

  /**
   * Automatically scans an Object3D / SkinnedMesh to detect humanoid bones
   * and compute proportional capsule dimensions for ragdoll physics.
   */
  public static autoDetectBones(root: THREE.Object3D): RagdollBoneConfig[] {
    const discoveredBones: Array<{ bone: THREE.Bone; name: string }> = [];

    // Collect all bones
    root.traverse((child) => {
      if (child instanceof THREE.Bone) {
        discoveredBones.push({ bone: child, name: child.name });
      }
    });

    // If no explicit Three.Bone instances, check for named Object3D nodes
    if (discoveredBones.length === 0) {
      root.traverse((child) => {
        if (child !== root && child.children.length >= 0) {
          const lower = child.name.toLowerCase();
          for (const keywords of Object.values(BONE_NAME_KEYWORDS)) {
            if (keywords.some((k) => lower.includes(k))) {
              discoveredBones.push({ bone: child as any, name: child.name });
              break;
            }
          }
        }
      });
    }

    const boneConfigs: RagdollBoneConfig[] = [];
    const matchedParts = new Set<RagdollBodyPart>();

    // Helper: find best matching bone for a body part
    const findBoneForPart = (part: RagdollBodyPart): THREE.Bone | null => {
      const keywords = BONE_NAME_KEYWORDS[part];
      for (const { bone, name } of discoveredBones) {
        const lower = name.toLowerCase();
        for (const kw of keywords) {
          if (lower.includes(kw)) {
            return bone;
          }
        }
      }
      return null;
    };

    // Calculate bounding box scale of model
    const bbox = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const modelHeight = Math.max(0.5, size.y || 1.8);
    const scaleFactor = modelHeight / 1.8;

    const parts: RagdollBodyPart[] = [
      'pelvis',
      'spine',
      'chest',
      'head',
      'upperArmL',
      'lowerArmL',
      'upperArmR',
      'lowerArmR',
      'thighL',
      'calfL',
      'thighR',
      'calfR',
    ];

    for (const part of parts) {
      const bone = findBoneForPart(part);
      if (!bone) continue;

      matchedParts.add(part);

      // Default proportions
      let radius = 0.08 * scaleFactor;
      let height = 0.25 * scaleFactor;

      // Detect length from distance to child bone if available
      if (bone.children.length > 0) {
        const childBone = bone.children.find((c) => c instanceof THREE.Bone) || bone.children[0];
        if (childBone) {
          const p1 = new THREE.Vector3();
          const p2 = new THREE.Vector3();
          bone.getWorldPosition(p1);
          childBone.getWorldPosition(p2);
          const dist = p1.distanceTo(p2);
          if (dist > 0.05 && dist < 1.5) {
            height = dist;
          }
        }
      }

      // Anatomical dimensions adjustments
      switch (part) {
        case 'pelvis':
          radius = 0.14 * scaleFactor;
          height = 0.22 * scaleFactor;
          break;
        case 'spine':
          radius = 0.14 * scaleFactor;
          height = 0.24 * scaleFactor;
          break;
        case 'chest':
          radius = 0.16 * scaleFactor;
          height = 0.28 * scaleFactor;
          break;
        case 'head':
          radius = 0.12 * scaleFactor;
          height = 0.18 * scaleFactor;
          break;
        case 'upperArmL':
        case 'upperArmR':
          radius = 0.065 * scaleFactor;
          height = Math.max(0.18 * scaleFactor, Math.min(0.42 * scaleFactor, height));
          break;
        case 'lowerArmL':
        case 'lowerArmR':
          radius = 0.055 * scaleFactor;
          height = Math.max(0.16 * scaleFactor, Math.min(0.38 * scaleFactor, height));
          break;
        case 'thighL':
        case 'thighR':
          radius = 0.095 * scaleFactor;
          height = Math.max(0.25 * scaleFactor, Math.min(0.55 * scaleFactor, height));
          break;
        case 'calfL':
        case 'calfR':
          radius = 0.075 * scaleFactor;
          height = Math.max(0.22 * scaleFactor, Math.min(0.50 * scaleFactor, height));
          break;
      }

      const parentPart = PARENT_JOINT_MAP[part];
      const parentBone = parentPart ? findBoneForPart(parentPart) : undefined;

      boneConfigs.push({
        boneName: bone.name,
        part,
        radius: Number(radius.toFixed(3)),
        height: Number(height.toFixed(3)),
        parentBoneName: parentBone ? parentBone.name : undefined,
      });
    }

    // Fallback: If no bones detected (e.g. procedural / simple mesh), generate default humanoid layout
    if (boneConfigs.length === 0) {
      boneConfigs.push(
        { boneName: 'pelvis', part: 'pelvis', radius: 0.14 * scaleFactor, height: 0.22 * scaleFactor },
        { boneName: 'chest', part: 'chest', radius: 0.16 * scaleFactor, height: 0.32 * scaleFactor, parentBoneName: 'pelvis' },
        { boneName: 'head', part: 'head', radius: 0.12 * scaleFactor, height: 0.18 * scaleFactor, parentBoneName: 'chest' },
        { boneName: 'upperArmL', part: 'upperArmL', radius: 0.065 * scaleFactor, height: 0.26 * scaleFactor, parentBoneName: 'chest' },
        { boneName: 'lowerArmL', part: 'lowerArmL', radius: 0.055 * scaleFactor, height: 0.24 * scaleFactor, parentBoneName: 'upperArmL' },
        { boneName: 'upperArmR', part: 'upperArmR', radius: 0.065 * scaleFactor, height: 0.26 * scaleFactor, parentBoneName: 'chest' },
        { boneName: 'lowerArmR', part: 'lowerArmR', radius: 0.055 * scaleFactor, height: 0.24 * scaleFactor, parentBoneName: 'upperArmR' },
        { boneName: 'thighL', part: 'thighL', radius: 0.095 * scaleFactor, height: 0.35 * scaleFactor, parentBoneName: 'pelvis' },
        { boneName: 'calfL', part: 'calfL', radius: 0.075 * scaleFactor, height: 0.32 * scaleFactor, parentBoneName: 'thighL' },
        { boneName: 'thighR', part: 'thighR', radius: 0.095 * scaleFactor, height: 0.35 * scaleFactor, parentBoneName: 'pelvis' },
        { boneName: 'calfR', part: 'calfR', radius: 0.075 * scaleFactor, height: 0.32 * scaleFactor, parentBoneName: 'thighR' }
      );
    }

    return boneConfigs;
  }

  /**
   * Activates full dynamic Ragdoll on the character entity.
   * Spawns physical capsule colliders and connects limbs with spherical Rapier joints.
   */
  public activateRagdoll(
    world: RAPIER.World,
    entity: Entity,
    config: RagdollConfig,
    initialImpulse?: THREE.Vector3,
    hitBoneName?: string
  ): boolean {
    if (this.activeRagdolls.has(entity.id)) {
      // Already active, apply knockback impulse if provided
      if (initialImpulse) {
        this.applyImpulse(entity.id, initialImpulse, hitBoneName);
      }
      return true;
    }

    const obj = entity.object3D;
    if (!obj) return false;

    obj.updateMatrixWorld(true);

    // 1. Locate skeleton if SkinnedMesh exists
    let skeleton: THREE.Skeleton | undefined;
    obj.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.skeleton) {
        skeleton = child.skeleton;
      }
    });

    const bonesConfig = config.bones && config.bones.length > 0
      ? config.bones
      : RagdollSystem.autoDetectBones(obj);

    if (bonesConfig.length === 0) return false;

    // 2. Suspend character controller to avoid fighting ragdoll physics
    const charComp = entity.getComponent<CharacterControllerComponent>('CharacterController');
    const wasControllerEnabled = !!charComp?.enabled;
    if (charComp) {
      charComp.enabled = false;
    }

    // Initial character linear velocity
    const baseVel = new THREE.Vector3();
    if (charComp && charComp.velocity) {
      baseVel.copy(charComp.velocity);
    }

    const bodies = new Map<string, ActiveRagdollBody>();
    const joints: RAPIER.ImpulseJoint[] = [];
    const damping = config.damping ?? 2.0;

    // 3. Spawn Rapier dynamic RigidBodies for each bone
    for (const bConf of bonesConfig) {
      let boneObj: THREE.Object3D | null = null;

      obj.traverse((child) => {
        if (child.name === bConf.boneName) {
          boneObj = child;
        }
      });

      // Fallback: search by partial match or root offset
      if (!boneObj) {
        boneObj = obj;
      }

      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();

      boneObj.getWorldPosition(worldPos);
      boneObj.getWorldQuaternion(worldQuat);
      boneObj.getWorldScale(worldScale);

      // Determine capsule axis and orientation
      // For limbs, align capsule direction towards child bone if present
      let capsuleQuat = worldQuat.clone();
      let capsuleCenter = worldPos.clone();

      if (boneObj.children.length > 0) {
        const childBone = boneObj.children[0];
        const childWorldPos = new THREE.Vector3();
        childBone.getWorldPosition(childWorldPos);
        const limbDir = childWorldPos.clone().sub(worldPos);
        const len = limbDir.length();
        if (len > 0.05) {
          limbDir.normalize();
          // Capsule is oriented along Y axis in Rapier, rotate from Y to limbDir
          capsuleQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), limbDir);
          // Shift center to midpoint of limb segment
          capsuleCenter.add(limbDir.multiplyScalar(len * 0.5));
        }
      }

      const radius = Math.max(0.04, bConf.radius);
      const halfHeight = Math.max(0.05, (bConf.height - 2 * radius) * 0.5);

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(capsuleCenter.x, capsuleCenter.y, capsuleCenter.z)
        .setRotation({
          x: capsuleQuat.x,
          y: capsuleQuat.y,
          z: capsuleQuat.z,
          w: capsuleQuat.w,
        })
        .setLinearDamping(damping)
        .setAngularDamping(damping * 1.5);

      const body = world.createRigidBody(bodyDesc);

      // Mass adjustment based on anatomical part
      const partMass = BODY_PART_MASS[bConf.part] || 5.0;
      body.setAdditionalMass(partMass, true);

      // Set initial inherited character velocity
      body.setLinvel(
        new RAPIER.Vector3(baseVel.x, baseVel.y, baseVel.z),
        true
      );

      // Create collider (Ball for head, capsule for others)
      const colDesc = bConf.part === 'head'
        ? RAPIER.ColliderDesc.ball(radius)
        : RAPIER.ColliderDesc.capsule(halfHeight, radius);

      colDesc.setRestitution(0.1).setFriction(0.85);

      const collider = world.createCollider(colDesc, body);

      // Compute relative alignment between capsule and original bone local transform
      const alignmentQuat = worldQuat.clone().invert().multiply(capsuleQuat);

      bodies.set(bConf.boneName, {
        part: bConf.part,
        boneName: bConf.boneName,
        bone: boneObj,
        body,
        collider,
        initialLocalPos: boneObj.position.clone(),
        initialLocalRot: boneObj.quaternion.clone(),
        radius,
        height: bConf.height,
        alignmentQuat,
      });
    }

    // 4. Create spherical impulse joints connecting child bones to parent bones
    for (const bConf of bonesConfig) {
      if (!bConf.parentBoneName) continue;

      const childBodyData = bodies.get(bConf.boneName);
      const parentBodyData = bodies.get(bConf.parentBoneName);

      if (!childBodyData || !parentBodyData) continue;

      const childBody = childBodyData.body;
      const parentBody = parentBodyData.body;

      // Anchor point is at the joint origin (the world position of the child bone)
      const jointWorldPos = new THREE.Vector3();
      childBodyData.bone.getWorldPosition(jointWorldPos);

      // Convert world anchor into local coordinate spaces of parent and child rigid bodies
      const pTrans = parentBody.translation();
      const pRot = parentBody.rotation();
      const parentInvMat = new THREE.Matrix4()
        .compose(
          new THREE.Vector3(pTrans.x, pTrans.y, pTrans.z),
          new THREE.Quaternion(pRot.x, pRot.y, pRot.z, pRot.w),
          new THREE.Vector3(1, 1, 1)
        )
        .invert();

      const cTrans = childBody.translation();
      const cRot = childBody.rotation();
      const childInvMat = new THREE.Matrix4()
        .compose(
          new THREE.Vector3(cTrans.x, cTrans.y, cTrans.z),
          new THREE.Quaternion(cRot.x, cRot.y, cRot.z, cRot.w),
          new THREE.Vector3(1, 1, 1)
        )
        .invert();

      const localAnchorParent = jointWorldPos.clone().applyMatrix4(parentInvMat);
      const localAnchorChild = jointWorldPos.clone().applyMatrix4(childInvMat);

      try {
        const jointData = RAPIER.JointData.spherical(
          { x: localAnchorParent.x, y: localAnchorParent.y, z: localAnchorParent.z },
          { x: localAnchorChild.x, y: localAnchorChild.y, z: localAnchorChild.z }
        );
        const joint = world.createImpulseJoint(jointData, parentBody, childBody, true);
        joints.push(joint);
      } catch (err) {
        console.warn(`[Ragdoll] Impossible de créer la liaison articulaire entre ${bConf.parentBoneName} et ${bConf.boneName}:`, err);
      }
    }

    const activeRagdoll: ActiveRagdoll = {
      entityId: entity.id,
      entity,
      rootObj: obj,
      skeleton,
      bodies,
      joints,
      activeTimer: 0,
      config,
      previousControllerEnabled: wasControllerEnabled,
    };

    this.activeRagdolls.set(entity.id, activeRagdoll);

    // 5. Apply knockback impulse if provided (e.g. bullet impact or fall)
    if (initialImpulse) {
      this.applyImpulse(entity.id, initialImpulse, hitBoneName);
    }

    return true;
  }

  /**
   * Applies an instantaneous impact / explosion / damage knockback impulse to the ragdoll
   */
  public applyImpulse(entityId: string, impulse: THREE.Vector3, hitBoneName?: string): void {
    const ragdoll = this.activeRagdolls.get(entityId);
    if (!ragdoll) return;

    if (hitBoneName && ragdoll.bodies.has(hitBoneName)) {
      const hitBody = ragdoll.bodies.get(hitBoneName)!.body;
      hitBody.applyImpulse(new RAPIER.Vector3(impulse.x, impulse.y, impulse.z), true);
      return;
    }

    // Default: apply distributed impulse to torso/pelvis and limbs
    for (const [, bodyData] of ragdoll.bodies.entries()) {
      const scale = bodyData.part === 'chest' || bodyData.part === 'pelvis' ? 1.0 : 0.4;
      bodyData.body.applyImpulse(
        new RAPIER.Vector3(impulse.x * scale, impulse.y * scale, impulse.z * scale),
        true
      );
    }
  }

  /**
   * Main per-frame update loop for active ragdolls.
   * Synchronizes Rapier rigid bodies transforms to Three.js Skeleton and bones.
   */
  public step(world: RAPIER.World, dt: number): void {
    for (const [entityId, ragdoll] of this.activeRagdolls.entries()) {
      ragdoll.activeTimer += dt;

      // Synchronize bone transforms from physics bodies
      let pelvisWorldPos: THREE.Vector3 | null = null;

      for (const [, bodyData] of ragdoll.bodies.entries()) {
        const body = bodyData.body;
        const trans = body.translation();
        const rot = body.rotation();

        const curBodyPos = new THREE.Vector3(trans.x, trans.y, trans.z);
        const curBodyQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

        if (bodyData.part === 'pelvis') {
          pelvisWorldPos = curBodyPos.clone();
        }

        const bone = bodyData.bone;
        if (!bone) continue;

        // Apply alignment offset inverse
        const targetWorldQuat = curBodyQuat.clone().multiply(bodyData.alignmentQuat.clone().invert());

        // Transform world position & quaternion into bone parent local coordinate space
        if (bone.parent) {
          bone.parent.updateMatrixWorld(true);
          const parentWorldInv = new THREE.Matrix4().copy(bone.parent.matrixWorld).invert();

          const worldMat = new THREE.Matrix4().compose(curBodyPos, targetWorldQuat, bone.scale);
          const localMat = new THREE.Matrix4().multiplyMatrices(parentWorldInv, worldMat);

          localMat.decompose(bone.position, bone.quaternion, bone.scale);
        } else {
          bone.position.copy(curBodyPos);
          bone.quaternion.copy(targetWorldQuat);
        }

        bone.updateMatrixWorld(true);
      }

      // Update GPU skeleton buffers if SkinnedMesh
      if (ragdoll.skeleton) {
        ragdoll.skeleton.update();
      }

      // Keep root object at pelvis horizontal location to maintain camera follow & world consistency
      if (pelvisWorldPos) {
        ragdoll.rootObj.position.x = pelvisWorldPos.x;
        ragdoll.rootObj.position.z = pelvisWorldPos.z;
      }

      // Auto get-up / recover logic if configured
      if (ragdoll.config.autoGetUp && ragdoll.config.getUpDelay) {
        if (ragdoll.activeTimer >= ragdoll.config.getUpDelay) {
          this.deactivateRagdoll(world, entityId);
        }
      }
    }
  }

  /**
   * Deactivates ragdoll simulation and restores character controller and animations
   */
  public deactivateRagdoll(world: RAPIER.World, entityId: string): void {
    const ragdoll = this.activeRagdolls.get(entityId);
    if (!ragdoll) return;

    // 1. Remove Rapier joints and bodies
    for (const joint of ragdoll.joints) {
      try {
        world.removeImpulseJoint(joint, true);
      } catch {
        // Joint removed with body
      }
    }

    for (const [, bodyData] of ragdoll.bodies.entries()) {
      try {
        world.removeRigidBody(bodyData.body);
      } catch {
        // Ignored
      }
    }

    // 2. Restore character controller at current pelvis position
    const charComp = ragdoll.entity.getComponent<CharacterControllerComponent>('CharacterController');
    if (charComp && ragdoll.previousControllerEnabled) {
      charComp.enabled = true;
      charComp.verticalVelocity = 0;
      charComp.isGrounded = true;
    }

    this.activeRagdolls.delete(entityId);
  }

  /**
   * Is ragdoll currently active for an entity
   */
  public isRagdollActive(entityId: string): boolean {
    return this.activeRagdolls.has(entityId);
  }

  /**
   * Generates visual debug wireframe mesh in Three.js showing capsules on the skeleton
   */
  public createDebugWireframes(
    entity: Entity,
    config: RagdollConfig,
    scene: THREE.Scene
  ): THREE.Group {
    this.removeDebugWireframes(entity.id, scene);

    const group = new THREE.Group();
    group.name = `ragdoll_debug_${entity.id}`;

    const obj = entity.object3D;
    if (!obj) return group;

    const bonesConfig = config.bones && config.bones.length > 0
      ? config.bones
      : RagdollSystem.autoDetectBones(obj);

    const partColors: Record<RagdollBodyPart, number> = {
      pelvis: 0x10b981, // Emerald
      spine: 0x06b6d4, // Cyan
      chest: 0x3b82f6, // Blue
      head: 0xf59e0b, // Amber
      upperArmL: 0x8b5cf6, // Violet
      lowerArmL: 0xa855f7, // Purple
      upperArmR: 0xec4899, // Pink
      lowerArmR: 0xf43f5e, // Rose
      thighL: 0x14b8a6, // Teal
      calfL: 0x059669, // Green
      thighR: 0xeab308, // Yellow
      calfR: 0xd97706, // Orange
      custom: 0x94a3b8, // Slate
    };

    for (const bConf of bonesConfig) {
      let matchedBone: THREE.Object3D | undefined = undefined;
      obj.traverse((child) => {
        if (!matchedBone && child.name === bConf.boneName) {
          matchedBone = child;
        }
      });
      if (!matchedBone) continue;
      const targetBone: THREE.Object3D = matchedBone;

      const radius = bConf.radius;
      const height = Math.max(0.01, bConf.height - 2 * radius);

      const color = partColors[bConf.part] || 0x6366f1;
      const mat = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      });

      const geo = bConf.part === 'head'
        ? new THREE.SphereGeometry(radius, 8, 8)
        : new THREE.CapsuleGeometry(radius, height, 4, 8);

      const mesh = new THREE.Mesh(geo, mat);

      // Attach as child or align with bone
      targetBone.add(mesh);
    }

    this.debugHelpers.set(entity.id, group);
    scene.add(group);
    return group;
  }

  /**
   * Removes debug wireframes
   */
  public removeDebugWireframes(entityId: string, scene: THREE.Scene): void {
    const existing = this.debugHelpers.get(entityId);
    if (existing) {
      scene.remove(existing);
      this.debugHelpers.delete(entityId);
    }

    const entity = this.ecsWorld.getEntity(entityId);
    if (entity && entity.object3D) {
      entity.object3D.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material && (child.material as any).wireframe) {
          if (child.parent && child.geometry instanceof THREE.CapsuleGeometry) {
            child.parent.remove(child);
          }
        }
      });
    }
  }

  /**
   * Clean up all active ragdolls
   */
  public dispose(world: RAPIER.World | null): void {
    if (world) {
      for (const entityId of Array.from(this.activeRagdolls.keys())) {
        this.deactivateRagdoll(world, entityId);
      }
    }
    this.activeRagdolls.clear();
    this.debugHelpers.clear();
  }
}
