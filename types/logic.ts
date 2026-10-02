import { Entity } from '../lib/ecs/ECS';
import { PostProcessVolumeOverrides } from './atmosphere';

// ==========================================
// NIVEAU 1 : BEHAVIOR CARDS
// ==========================================

export type BehaviorCardType =
  | 'Collectable'
  | 'Patrol'
  | 'TriggerZone'
  | 'DamageOnTouch'
  | 'WindZone'
  | 'Flammable'
  | 'WeatherListener'
  | 'Buoyant'
  | 'NavMeshAgent'
  | 'TriggerVolume'
  | 'PostProcessVolume';

export interface CollectableConfig {
  scoreValue: number;
  respawnTime: number; // 0 = permanent destruction
  rotateSpeed: number; // deg/s
  hoverSpeed: number;
  hoverAmplitude: number;
  soundPreset: 'coin' | 'gem' | 'powerup' | 'none';
  targetTag: string; // default 'Player'
}

export interface PatrolConfig {
  speed: number;
  distance: number;
  axis: 'x' | 'y' | 'z';
  pingPong: boolean;
  waitTime: number;
}

export interface TriggerZoneConfig {
  radius: number;
  triggerOn: 'Player' | 'Any';
  action: 'PlaySound' | 'ShowMessage' | 'ChangeColor' | 'EmitPulse';
  soundPreset: 'chime' | 'alarm' | 'warp' | 'none';
  message: string;
  repeatable: boolean;
}

export interface DamageOnTouchConfig {
  damage: number;
  knockbackForce: number;
  cooldown: number; // in seconds
  damageEffect: boolean;
  soundPreset: 'hit' | 'explosion' | 'hurt';
}

export interface WindZoneBehaviorConfig {
  mode: 'directional' | 'vortex' | 'updraft';
  force: number;
  radius: number;
  direction: { x: number; y: number; z: number };
}

export interface FlammableBehaviorConfig {
  burnDuration: number;
  spreadRadius: number;
  burnDamage: number;
  autoIgniteOnStart: boolean;
  ignitionTemperature: number;
}

export interface WeatherListenerConfig {
  reactTo: 'rain' | 'wind' | 'any';
  action: 'Ignite' | 'Extinguish' | 'ApplyForce' | 'PlaySound';
  soundPreset: 'chime' | 'alarm' | 'warp' | 'none';
  windSpeedThreshold: number;
}

export interface BuoyantConfig {
  buoyancyMultiplier: number;
  waterDrag: number;
  alignToWaveNormal: boolean;
  flowDrift: boolean;
}

export interface NavMeshAgentConfig {
  targetType: 'Player' | 'Entity' | 'Position';
  targetEntityId?: string;
  targetPosition?: { x: number; y: number; z: number };
  speed: number;
  stoppingDistance: number;
  acceleration: number;
  angularSpeed: number;
  autoRepath: boolean;
  repathInterval: number;
  avoidanceRadius: number;
  avoidWater: boolean;
  maxSlopeAngle: number;
}

export interface TriggerVolumeBehaviorConfig {
  shape: 'box' | 'sphere';
  size: { x: number; y: number; z: number };
  radius: number;
  triggerOn: 'Player' | 'Enemy' | 'NPC' | 'Any' | 'Tag:xxx';
  actionType: 'checkpoint' | 'teleport' | 'cinematic' | 'trap' | 'custom';
  teleportDestination?: { x: number; y: number; z: number };
  checkpointName?: string;
  cinematicCameraName?: string;
  cinematicText?: string;
  cinematicSpeaker?: string;
  trapDamage?: number;
  trapKnockback?: number;
  trapParticlePreset?: string;
  soundPreset: 'chime' | 'alarm' | 'warp' | 'explosion' | 'checkpoint' | 'none';
  repeatable: boolean;
  cooldown: number;
  visualFeedback: boolean;
  triggerMessage?: string;
}

export interface PostProcessVolumeBehaviorConfig {
  shape: 'box';
  size: { x: number; y: number; z: number };
  /** Smooth falloff distance around the volume where blending ramps in. */
  blendRadius: number;
  /** Higher priority volumes override lower ones when both overlap. */
  priority: number;
  /** Which scalar post-process knobs this volume overrides (values live here). */
  overrides: PostProcessVolumeOverrides;
}

export interface BehaviorCard {
  id: string;
  type: BehaviorCardType;
  enabled: boolean;
  config:
    | CollectableConfig
    | PatrolConfig
    | TriggerZoneConfig
    | DamageOnTouchConfig
    | WindZoneBehaviorConfig
    | FlammableBehaviorConfig
    | WeatherListenerConfig
    | BuoyantConfig
    | NavMeshAgentConfig
    | TriggerVolumeBehaviorConfig
    | PostProcessVolumeBehaviorConfig;
}

// ==========================================
// NIVEAU 2 : NODE GRAPH
// ==========================================

export type NodeCategory = 'event' | 'logic' | 'action';

export type NodeType =
  // Events
  | 'OnStart'
  | 'OnUpdate'
  | 'OnCollision'
  | 'OnKeyPress'
  | 'OnClick'
  | 'OnTriggerEnter'
  | 'OnTriggerExit'
  | 'OnTimer'
  | 'OnCustomEvent'
  // Logic & Math
  | 'IfElse'
  | 'Compare'
  | 'Gate'
  | 'Math'
  | 'Clamp'
  | 'Lerp'
  | 'Random'
  | 'Toggle'
  | 'Counter'
  | 'Delay'
  // Actions & Transform & FX
  | 'ApplyImpulse'
  | 'SetPosition'
  | 'SetRotation'
  | 'SetScale'
  | 'SetColor'
  | 'PlaySound'
  | 'DestroyEntity'
  | 'SetVariable'
  | 'GetVariable'
  | 'PlayAnimation'
  | 'PauseAnimation'
  | 'ReverseAnimation'
  | 'SpawnPrefab'
  | 'PrintLog'
  | 'CameraShake'
  | 'EmitParticles'
  | 'ExplosionFX'
  | 'StopParticles'
  | 'ShootProjectile'
  // AI & NPC Navigation
  | 'FollowTarget'
  | 'PatrolWaypoints'
  | 'CheckDistance'
  | 'LookAtPlayer'
  // Dynamic Lighting Effects
  | 'SetLightColor'
  | 'PulseLight'
  | 'FlickerLight'
  // Cinematics & Dialogue
  | 'SwitchCamera'
  | 'ShowDialogue'
  | 'SetDepthOfField'
  // Spatial Audio & BGM
  | 'PlaySound3D'
  | 'PlaySFX'
  | 'SetBGMState'
  // Enemy AI, Health & Inventory
  | 'CheckEnemyVision'
  | 'DealDamage'
  | 'CheckInventory'
  | 'AddItem'
  | 'RemoveItem'
  | 'OnProximity'
  | 'UnlockDoor'
  // Environmental Physics (Vent, Feu, Pluie)
  | 'OnWindGust'
  | 'OnIgnite'
  | 'OnExtinguish'
  | 'OnRainStart'
  | 'OnRainStop'
  | 'SetWind'
  | 'ApplyWindForce'
  | 'GetWind'
  | 'IgniteEntity'
  | 'ExtinguishEntity'
  | 'CheckIsBurning'
  | 'SetRain'
  | 'CheckIsRaining'
  // Pack Universel — cycle de vie, états de jeu, mouvement arcade,
  // progression & caméra (couvre platformer, FPS/TPS, RPG, course,
  // survie/horreur, tower-defense, runner, puzzle, combat)
  // Cycle de vie & Santé
  | 'OnDeath'
  | 'TakeDamage'
  | 'Heal'
  | 'Respawn'
  | 'Checkpoint'
  // États de jeu (Game State)
  | 'WinGame'
  | 'LoseGame'
  | 'RestartLevel'
  | 'PauseGame'
  | 'ResumeGame'
  // Temps
  | 'Countdown'
  // Mouvement arcade & IA simple
  | 'MoveTowards'
  | 'FleeFrom'
  | 'Wander'
  // Combat rapproché
  | 'MeleeAttack'
  // HUD & Feedback
  | 'ShowMessage'
  // Sauvegarde / Chargement
  | 'SaveGame'
  | 'LoadGame'
  // Visibilité
  | 'ToggleVisibility'
  // Caméra
  | 'CameraFollow'
  // Entrées clavier & pilotage direct
  | 'OnKeyRelease'
  | 'IsKeyDown'
  | 'ReadMoveAxis'
  | 'MoveByAxis'
  // Matières & propriétés physiques (calibrées sur la réalité)
  | 'SetSurface'
  | 'SetMaterial'
  | 'SetGravity'
  | 'SetDrag'
  | 'SetTimeScale'
  // Effets sensoriels & capteurs
  | 'FootstepSound'
  | 'HitStop'
  | 'Rumble'
  | 'SlowFollow'
  | 'OnLand'
  | 'OnSurfaceEnter'
  | 'OnSurfaceExit';

export type SocketType = 'flow' | 'number' | 'string' | 'boolean' | 'vector' | 'entity';

export interface Socket {
  id: string;
  name: string;
  type: SocketType;
}

export interface GraphNodeData {
  id: string;
  type: NodeType;
  title: string;
  category: NodeCategory;
  position: { x: number; y: number };
  inputs: Socket[];
  outputs: Socket[];
  values: Record<string, any>;
}

export interface GraphConnection {
  id: string;
  fromNodeId: string;
  fromSocketId: string;
  toNodeId: string;
  toSocketId: string;
}

export interface NodeGraphData {
  enabled: boolean;
  nodes: GraphNodeData[];
  connections: GraphConnection[];
  variables: Record<string, any>;
}

// ==========================================
// NIVEAU 3 : CUSTOM SCRIPT
// ==========================================

export interface CustomScriptData {
  enabled: boolean;
  code: string;
  compiledOk?: boolean;
  lastError?: string;
  /** Lignes (1-based) avec breakpoints dans l'éditeur. */
  breakpoints?: number[];
}

// Abstract Script Class definition contract — hooks optionnels (Tier 3.1)
export class Script {
  public entity!: Entity;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onCollision?(other: Entity): void;
  onTriggerEnter?(other: Entity): void;
  onTriggerExit?(other: Entity): void;
  onKeyDown?(code: string): void;
  onKeyUp?(code: string): void;
  onClick?(): void;
  onCustomEvent?(name: string, data?: any): void;
  onDestroy?(): void;
}

// ==========================================
// AGGREGATED ENTITY LOGIC DATA
// ==========================================

export interface EntityLogicData {
  cards: BehaviorCard[];
  nodeGraph: NodeGraphData;
  customScript: CustomScriptData;
  activeLevel: 'cards' | 'graph' | 'script';
}
