import * as THREE from 'three';
import { Entity } from '../ecs/ECS';
import { TriggerVolumeBehaviorConfig } from '../../types/logic';
import { ParticleManager } from '../vfx/ParticleManager';
import { soundManager, AudioZoneConfig } from '../SoundManager';

export interface CheckpointData {
  id: string;
  name: string;
  position: THREE.Vector3;
  rotationY: number;
  activatedTime: number;
}

export interface TriggerVolumeState {
  entityId: string;
  config: TriggerVolumeBehaviorConfig;
  insideEntities: Set<string>;
  lastTriggerTime: number;
  activatedOnce: boolean;
  helperMesh?: THREE.Object3D;
}

/**
 * TriggerVolumeManager
 * Handles volumetric trigger zones (Box/Sphere), Checkpoint saving & Player Respawn,
 * Teleporters, Cinematic cutscene triggers, and Traps with 3D Editor visual gizmos.
 */
export class TriggerVolumeManager {
  private scene: THREE.Scene | null = null;
  public particleManager?: ParticleManager;

  // Registered Trigger Volumes
  private volumes: Map<string, TriggerVolumeState> = new Map();

  // Active Checkpoint for Player Respawn
  public activeCheckpoint: CheckpointData | null = null;
  public defaultSpawnPoint: THREE.Vector3 = new THREE.Vector3(0, 1.05, 0);
  public defaultSpawnRotationY: number = 0;

  // Event callbacks for UI & HUD
  public onCheckpointActivated?: (checkpoint: CheckpointData) => void;
  public onPlayerRespawn?: (pos: THREE.Vector3) => void;
  public onCinematicTriggered?: (cameraName?: string, speaker?: string, text?: string) => void;
  public onTeleportTriggered?: (entityId: string, destPos: THREE.Vector3) => void;
  public onTrapTriggered?: (entityId: string, damage: number) => void;
  /** Tier 3.1 : scripts + nœuds graph (trigger volume entityId, other entityId). */
  public onVolumeEnter?: (triggerEntityId: string, otherEntityId: string) => void;
  public onVolumeExit?: (triggerEntityId: string, otherEntityId: string) => void;

  constructor() {}

  public setScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  /**
   * Registers a trigger volume node in the scene
   */
  public registerVolume(entityId: string, config: TriggerVolumeBehaviorConfig, object3D?: THREE.Object3D): void {
    const existing = this.volumes.get(entityId);
    if (existing && existing.helperMesh && this.scene) {
      this.scene.remove(existing.helperMesh);
    }

    const state: TriggerVolumeState = {
      entityId,
      config,
      insideEntities: new Set(),
      lastTriggerTime: 0,
      activatedOnce: false,
    };

    if (object3D && this.scene) {
      state.helperMesh = this.createEditorHelperMesh(config, object3D);
      if (state.helperMesh) {
        object3D.add(state.helperMesh);
      }
    }

    this.volumes.set(entityId, state);

    // Tier 3.2 : register as Audio Zone (reverb/occlusion on enter/exit)
    const zoneCfg: AudioZoneConfig = {
      reverbWet: config.actionType === 'cinematic' ? 0.35 : 0.15,
      lowpassHz: config.actionType === 'trap' ? 800 : 16000,
      volumeMul: 1.0,
    };
    soundManager.registerAudioZone(entityId, zoneCfg);
  }

  public unregisterVolume(entityId: string): void {
    const state = this.volumes.get(entityId);
    if (state && state.helperMesh && state.helperMesh.parent) {
      state.helperMesh.parent.remove(state.helperMesh);
    }
    this.volumes.delete(entityId);
    soundManager.unregisterAudioZone(entityId);
  }

  /**
   * Creates wireframe visual gizmo box/sphere for Editor mode
   */
  public createEditorHelperMesh(config: TriggerVolumeBehaviorConfig, _parentObj: THREE.Object3D): THREE.Object3D {
    let color = 0x10b981; // Green default
    switch (config.actionType) {
      case 'checkpoint':
        color = 0x10b981; // Emerald Green
        break;
      case 'teleport':
        color = 0x06b6d4; // Cyan
        break;
      case 'cinematic':
        color = 0x8b5cf6; // Violet
        break;
      case 'trap':
        color = 0xef4444; // Red
        break;
      case 'custom':
        color = 0xf59e0b; // Amber
        break;
    }

    let geom: THREE.BufferGeometry;
    if (config.shape === 'sphere') {
      geom = new THREE.SphereGeometry(config.radius || 2, 16, 16);
    } else {
      const size = config.size || { x: 3, y: 3, z: 3 };
      geom = new THREE.BoxGeometry(size.x, size.y, size.z);
    }

    const mat = new THREE.MeshBasicMaterial({
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'TriggerVolumeHelper';
    mesh.userData = { isSensor: true, ignoreRaycast: true };

    // Sub-icon/Beacon floor ring
    if (config.visualFeedback) {
      const ringGeom = new THREE.RingGeometry(0.8, 1.2, 32);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.y = - (config.size?.y ? config.size.y / 2 : config.radius || 1) + 0.02;
      mesh.add(ringMesh);
    }

    return mesh;
  }

  /**
   * Evaluates volume overlaps during simulation (Play mode)
   */
  public update(
    _dt: number,
    elapsedTime: number,
    entities: Entity[],
    getPlayerEntity: () => Entity | null,
    isSimulating: boolean
  ): void {
    if (!isSimulating) {
      // Show editor gizmos in editor mode
      for (const vol of this.volumes.values()) {
        if (vol.helperMesh) vol.helperMesh.visible = true;
      }
      return;
    }

    // Hide wireframe gizmos during Play simulation
    for (const vol of this.volumes.values()) {
      if (vol.helperMesh) vol.helperMesh.visible = false;
    }

    const player = getPlayerEntity();
    const playerObj = player?.object3D;

    for (const [volEntityId, state] of this.volumes.entries()) {
      const triggerEntity = entities.find((e) => e.id === volEntityId);
      const triggerObj = triggerEntity?.object3D;
      if (!triggerObj) continue;

      const cfg = state.config;

      // Filter target entities
      let targetEntities: Entity[] = [];
      if (cfg.triggerOn === 'Player' && player) {
        targetEntities = [player];
      } else if (cfg.triggerOn === 'Any') {
        targetEntities = entities.filter((e) => e.object3D && e.id !== volEntityId);
      }

      for (const target of targetEntities) {
        const targetObj = target.object3D;
        if (!targetObj) continue;

        const isInside = this.checkOverlap(triggerObj, targetObj.position, cfg);
        const wasInside = state.insideEntities.has(target.id);

        if (isInside && !wasInside) {
          // ENTER EVENT
          state.insideEntities.add(target.id);

          const cooldown = cfg.cooldown || 0.5;
          if (!state.activatedOnce || (cfg.repeatable && elapsedTime - state.lastTriggerTime > cooldown)) {
            state.lastTriggerTime = elapsedTime;
            state.activatedOnce = true;
            this.executeTriggerAction(target, triggerEntity, cfg, triggerObj.position);
          }
          // Audio zone enter
          soundManager.setZoneActive(volEntityId, true);
          this.onVolumeEnter?.(volEntityId, target.id);
        } else if (!isInside && wasInside) {
          // EXIT EVENT
          state.insideEntities.delete(target.id);
          soundManager.setZoneActive(volEntityId, false);
          this.onVolumeExit?.(volEntityId, target.id);
        }
      }
    }

    // Out-of-bounds / Fall Check for Player
    if (playerObj && playerObj.position.y < -20) {
      this.respawnPlayerAtCheckpoint(player);
    }
  }

  /**
   * Checks if target point is inside Box or Sphere volume
   */
  private checkOverlap(triggerObj: THREE.Object3D, targetPos: THREE.Vector3, config: TriggerVolumeBehaviorConfig): boolean {
    const localPos = targetPos.clone();
    triggerObj.worldToLocal(localPos);

    if (config.shape === 'sphere') {
      return localPos.length() <= (config.radius || 2);
    } else {
      const sx = (config.size?.x || 3) * 0.5;
      const sy = (config.size?.y || 3) * 0.5;
      const sz = (config.size?.z || 3) * 0.5;

      return (
        Math.abs(localPos.x) <= sx &&
        Math.abs(localPos.y) <= sy &&
        Math.abs(localPos.z) <= sz
      );
    }
  }

  /**
   * Executes the specified trigger volume action type
   */
  private executeTriggerAction(
    target: Entity,
    triggerEntity: Entity,
    config: TriggerVolumeBehaviorConfig,
    worldPos: THREE.Vector3
  ): void {
    switch (config.actionType) {
      case 'checkpoint': {
        const rotY = triggerEntity.object3D ? triggerEntity.object3D.rotation.y : 0;
        this.activeCheckpoint = {
          id: triggerEntity.id,
          name: config.checkpointName || triggerEntity.name || 'Checkpoint',
          position: worldPos.clone().add(new THREE.Vector3(0, 0.5, 0)),
          rotationY: rotY,
          activatedTime: performance.now(),
        };

        soundManager.playSFX('powerup');

        if (this.particleManager) {
          this.particleManager.triggerBurst('sparks', worldPos, 30);
        }

        if (this.onCheckpointActivated) {
          this.onCheckpointActivated(this.activeCheckpoint);
        }
        break;
      }

      case 'teleport': {
        const dest = config.teleportDestination
          ? new THREE.Vector3(config.teleportDestination.x, config.teleportDestination.y, config.teleportDestination.z)
          : worldPos.clone().add(new THREE.Vector3(0, 0, 5));

        if (target.object3D) {
          if (this.particleManager) {
            this.particleManager.triggerBurst('sparks', target.object3D.position, 25);
          }

          target.object3D.position.copy(dest);

          if (this.particleManager) {
            this.particleManager.triggerBurst('cosmic_dust', dest, 25);
          }
        }

        soundManager.playSFX('warp');

        if (this.onTeleportTriggered) {
          this.onTeleportTriggered(target.id, dest);
        }
        break;
      }

      case 'cinematic': {
        soundManager.playSFX('coin');

        if (this.onCinematicTriggered) {
          this.onCinematicTriggered(config.cinematicCameraName, config.cinematicSpeaker || triggerEntity.name, config.cinematicText || config.triggerMessage);
        }
        break;
      }

      case 'trap': {
        const dmg = config.trapDamage || 25;
        soundManager.playSFX('hit');

        if (this.particleManager) {
          this.particleManager.triggerBurst((config.trapParticlePreset as any) || 'explosion', target.object3D?.position || worldPos, 35);
        }

        if (this.onTrapTriggered) {
          this.onTrapTriggered(target.id, dmg);
        }
        break;
      }

      case 'custom': {
        if (config.soundPreset && config.soundPreset !== 'none') {
          soundManager.playSFX(config.soundPreset as any);
        }
        break;
      }
    }
  }

  /**
   * Respawns player entity back at the last activated Checkpoint or default spawn point
   */
  public respawnPlayerAtCheckpoint(playerEntity: Entity, physicsManager?: any): void {
    if (!playerEntity.object3D) return;

    const spawnPos = this.activeCheckpoint
      ? this.activeCheckpoint.position.clone()
      : this.defaultSpawnPoint.clone();

    const spawnRotY = this.activeCheckpoint
      ? this.activeCheckpoint.rotationY
      : this.defaultSpawnRotationY;

    // Teleport player 3D mesh
    playerEntity.object3D.position.copy(spawnPos);
    playerEntity.object3D.rotation.set(0, spawnRotY, 0);

    // Reset Rapier physics body if present
    if (physicsManager && typeof physicsManager.teleportEntity === 'function') {
      physicsManager.teleportEntity(playerEntity.id, spawnPos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spawnRotY, 0)));
    }

    // Respawn effects
    soundManager.playSFX('powerup');

    if (this.particleManager) {
      this.particleManager.triggerBurst('cosmic_dust', spawnPos, 40);
    }

    if (this.onPlayerRespawn) {
      this.onPlayerRespawn(spawnPos);
    }
  }
}
