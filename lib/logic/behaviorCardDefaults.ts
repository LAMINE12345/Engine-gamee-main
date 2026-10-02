/**
 * behaviorCardDefaults.ts
 * Default payload for every Niveau-1 Behavior Card.
 *
 * Kept free of React / Three.js imports so it can be unit-tested in a plain
 * Node environment. `BEHAVIOR_CARD_DEFAULTS` is mapped over the
 * `BehaviorCardType` union, which turns "added a new card type but forgot its
 * config" into a compile-time error — the exact bug class that made
 * NavMeshAgent / TriggerVolume ship with `undefined` configs.
 */

import {
  BehaviorCardType,
  CollectableConfig,
  PatrolConfig,
  TriggerZoneConfig,
  DamageOnTouchConfig,
  WindZoneBehaviorConfig,
  FlammableBehaviorConfig,
  WeatherListenerConfig,
  BuoyantConfig,
  NavMeshAgentConfig,
  TriggerVolumeBehaviorConfig,
  PostProcessVolumeBehaviorConfig,
} from '../../types/logic';

/** Maps each behavior-card type to the interface of its config payload. */
export interface BehaviorCardConfigMap {
  Collectable: CollectableConfig;
  Patrol: PatrolConfig;
  TriggerZone: TriggerZoneConfig;
  DamageOnTouch: DamageOnTouchConfig;
  WindZone: WindZoneBehaviorConfig;
  Flammable: FlammableBehaviorConfig;
  WeatherListener: WeatherListenerConfig;
  Buoyant: BuoyantConfig;
  NavMeshAgent: NavMeshAgentConfig;
  TriggerVolume: TriggerVolumeBehaviorConfig;
  PostProcessVolume: PostProcessVolumeBehaviorConfig;
}

/** Union of every behavior-card config payload. */
export type BehaviorCardConfig = BehaviorCardConfigMap[BehaviorCardType];

/**
 * Defaults are mapped over the union rather than typed as a plain
 * `Record<BehaviorCardType, BehaviorCardConfig>`: every entry is checked
 * against its own interface, so required fields are enforced, excess fields
 * rejected, and a new BehaviorCardType cannot be added without a default.
 */
export const BEHAVIOR_CARD_DEFAULTS: { [K in BehaviorCardType]: BehaviorCardConfigMap[K] } = {
  Collectable: {
    scoreValue: 10,
    respawnTime: 0,
    rotateSpeed: 90,
    hoverSpeed: 2.5,
    hoverAmplitude: 0.25,
    soundPreset: 'coin',
    targetTag: 'Player',
  },
  Patrol: {
    speed: 3.0,
    distance: 6.0,
    axis: 'x',
    pingPong: true,
    waitTime: 0,
  },
  TriggerZone: {
    radius: 3.5,
    triggerOn: 'Player',
    action: 'PlaySound',
    soundPreset: 'chime',
    message: 'Bienvenue dans la zone secrète!',
    repeatable: true,
  },
  DamageOnTouch: {
    damage: 25,
    knockbackForce: 8.0,
    cooldown: 1.0,
    damageEffect: true,
    soundPreset: 'hit',
  },
  WindZone: {
    mode: 'directional',
    force: 25,
    radius: 6,
    direction: { x: 0, y: 1, z: 0 },
  },
  Flammable: {
    autoIgniteOnStart: false,
    ignitionTemperature: 100,
    burnDuration: 15,
    spreadRadius: 3.0,
    burnDamage: 15,
  },
  WeatherListener: {
    reactTo: 'rain',
    windSpeedThreshold: 30,
    action: 'Extinguish',
    soundPreset: 'chime',
  },
  Buoyant: {
    buoyancyMultiplier: 1.3,
    waterDrag: 1.8,
    alignToWaveNormal: true,
    flowDrift: true,
  },
  // Poursuite A* — aligné sur NavMeshManager.registerAgent.
  NavMeshAgent: {
    targetType: 'Player',
    speed: 3.5,
    stoppingDistance: 1.5,
    acceleration: 8,
    angularSpeed: 120,
    autoRepath: true,
    repathInterval: 0.5,
    avoidanceRadius: 0.6,
    avoidWater: true,
    maxSlopeAngle: 45,
  },
  // Volume déclencheur — aligné sur TriggerVolumeManager.registerVolume.
  TriggerVolume: {
    shape: 'box',
    size: { x: 4, y: 3, z: 4 },
    radius: 3,
    triggerOn: 'Player',
    actionType: 'checkpoint',
    soundPreset: 'chime',
    repeatable: true,
    cooldown: 1.0,
    visualFeedback: true,
    triggerMessage: '',
  },
  PostProcessVolume: {
    shape: 'box',
    size: { x: 8, y: 5, z: 8 },
    blendRadius: 2.0,
    priority: 0,
    overrides: { exposure: 1.2, vignetteDarkness: 1.1 },
  },
};

/** Every behavior-card type, in the order shown by the "Ajouter" menu. */
export const BEHAVIOR_CARD_ORDER: BehaviorCardType[] = [
  'Collectable',
  'Patrol',
  'TriggerZone',
  'DamageOnTouch',
  'WindZone',
  'Flammable',
  'WeatherListener',
  'Buoyant',
  'PostProcessVolume',
  'NavMeshAgent',
  'TriggerVolume',
];

/**
 * Returns a fresh, mutable copy of a card's default config.
 *
 * The copy matters: without it every card of the same type would share one
 * object (and the module-level constant itself), so editing a nested field
 * such as `size` or `overrides` on one card could leak into the others.
 */
export function createDefaultConfig<K extends BehaviorCardType>(
  type: K
): BehaviorCardConfigMap[K] {
  return JSON.parse(JSON.stringify(BEHAVIOR_CARD_DEFAULTS[type])) as BehaviorCardConfigMap[K];
}
