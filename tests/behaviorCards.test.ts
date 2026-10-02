import { describe, it, expect } from 'vitest';
import { BehaviorCard, BehaviorCardType, NodeGraphData } from '../types/logic';
import {
  BEHAVIOR_CARD_DEFAULTS,
  BEHAVIOR_CARD_ORDER,
  BehaviorCardConfigMap,
  createDefaultConfig,
} from '../lib/logic/behaviorCardDefaults';
import { convertBehaviorToNodes } from '../lib/logic/NodeGraphConverter';

/** Keys of T that cannot be `undefined` (i.e. required fields). */
type RequiredKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? never : K }[keyof T];

/**
 * Required field names per card type. The mapped type forces this table to stay
 * exhaustive: adding a card type, or a required field on an existing config
 * interface, is a compile error until the entry is updated.
 */
const REQUIRED_KEYS: { [K in BehaviorCardType]: RequiredKeys<BehaviorCardConfigMap[K]>[] } = {
  Collectable: [
    'scoreValue',
    'respawnTime',
    'rotateSpeed',
    'hoverSpeed',
    'hoverAmplitude',
    'soundPreset',
    'targetTag',
  ],
  Patrol: ['speed', 'distance', 'axis', 'pingPong', 'waitTime'],
  TriggerZone: ['radius', 'triggerOn', 'action', 'soundPreset', 'message', 'repeatable'],
  DamageOnTouch: ['damage', 'knockbackForce', 'cooldown', 'damageEffect', 'soundPreset'],
  WindZone: ['mode', 'force', 'radius', 'direction'],
  Flammable: ['burnDuration', 'spreadRadius', 'burnDamage', 'autoIgniteOnStart', 'ignitionTemperature'],
  WeatherListener: ['reactTo', 'action', 'soundPreset', 'windSpeedThreshold'],
  Buoyant: ['buoyancyMultiplier', 'waterDrag', 'alignToWaveNormal', 'flowDrift'],
  NavMeshAgent: [
    'targetType',
    'speed',
    'stoppingDistance',
    'acceleration',
    'angularSpeed',
    'autoRepath',
    'repathInterval',
    'avoidanceRadius',
    'avoidWater',
    'maxSlopeAngle',
  ],
  TriggerVolume: [
    'shape',
    'size',
    'radius',
    'triggerOn',
    'actionType',
    'soundPreset',
    'repeatable',
    'cooldown',
    'visualFeedback',
  ],
  PostProcessVolume: ['shape', 'size', 'blendRadius', 'priority', 'overrides'],
};

const ALL_TYPES = Object.keys(REQUIRED_KEYS) as BehaviorCardType[];

/** Builds a Niveau-1 card carrying the default config for its type. */
function card(type: BehaviorCardType): BehaviorCard {
  return { id: `card_${type}`, type, enabled: true, config: createDefaultConfig(type) };
}

describe('behaviorCards — type coverage', () => {
  it('declares all 11 card types exactly once', () => {
    expect(ALL_TYPES).toHaveLength(11);
    expect(new Set(ALL_TYPES).size).toBe(11);
  });

  it('has a default config for every card type', () => {
    expect(Object.keys(BEHAVIOR_CARD_DEFAULTS).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('lists every card type in the add-menu order, without duplicates', () => {
    expect([...BEHAVIOR_CARD_ORDER].sort()).toEqual([...ALL_TYPES].sort());
  });

  it('gives every card type a defined, non-null default', () => {
    for (const type of ALL_TYPES) {
      expect(BEHAVIOR_CARD_DEFAULTS[type], `default for ${type}`).toBeDefined();
      expect(BEHAVIOR_CARD_DEFAULTS[type], `default for ${type}`).not.toBeNull();
    }
  });
});
describe('behaviorCards — default payloads', () => {
  it('populates every required field of every config', () => {
    for (const type of ALL_TYPES) {
      const config = BEHAVIOR_CARD_DEFAULTS[type] as unknown as Record<string, unknown>;
      for (const key of REQUIRED_KEYS[type]) {
        expect(config[key], `${type}.${key}`).toBeDefined();
        expect(config[key], `${type}.${key}`).not.toBeNull();
      }
    }
  });

  it('never ships an empty string where a value is required', () => {
    for (const type of ALL_TYPES) {
      const config = BEHAVIOR_CARD_DEFAULTS[type] as unknown as Record<string, unknown>;
      for (const key of REQUIRED_KEYS[type]) {
        if (typeof config[key] === 'string') {
          expect(config[key], `${type}.${key}`).not.toBe('');
        }
      }
    }
  });

  it('uses finite numeric values for its scalar knobs', () => {
    for (const type of ALL_TYPES) {
      const config = BEHAVIOR_CARD_DEFAULTS[type] as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value), `${type}.${key}`).toBe(true);
        }
      }
    }
  });

  it('gives vector fields all three axes', () => {
    const vectors: Array<[BehaviorCardType, string]> = [
      ['WindZone', 'direction'],
      ['TriggerVolume', 'size'],
      ['PostProcessVolume', 'size'],
    ];
    for (const [type, key] of vectors) {
      const vec = (BEHAVIOR_CARD_DEFAULTS[type] as unknown as Record<string, any>)[key];
      expect(vec, `${type}.${key}`).toBeDefined();
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(typeof vec[axis], `${type}.${key}.${axis}`).toBe('number');
      }
    }
  });

  it('defaults the NavMeshAgent within values NavMeshManager can consume', () => {
    const cfg = BEHAVIOR_CARD_DEFAULTS.NavMeshAgent;
    expect(['Player', 'Entity', 'Position']).toContain(cfg.targetType);
    expect(cfg.speed).toBeGreaterThan(0);
    expect(cfg.stoppingDistance).toBeGreaterThan(0);
    expect(cfg.acceleration).toBeGreaterThan(0);
    expect(cfg.avoidanceRadius).toBeGreaterThan(0);
    // maxSlopeAngle is fed to Math.tan() after a degree→radian conversion.
    expect(cfg.maxSlopeAngle).toBeGreaterThan(0);
    expect(cfg.maxSlopeAngle).toBeLessThan(90);
    expect(cfg.repathInterval).toBeGreaterThan(0);
  });

  it('defaults the TriggerVolume to a usable, re-armable checkpoint', () => {
    const cfg = BEHAVIOR_CARD_DEFAULTS.TriggerVolume;
    expect(['box', 'sphere']).toContain(cfg.shape);
    expect(['checkpoint', 'teleport', 'cinematic', 'trap', 'custom']).toContain(cfg.actionType);
    expect(cfg.soundPreset).not.toBe('');
    expect(cfg.repeatable).toBe(true);
    expect(cfg.cooldown).toBeGreaterThanOrEqual(0);
  });
});
describe('behaviorCards — createDefaultConfig isolation', () => {
  it('returns a distinct object on every call', () => {
    const a = createDefaultConfig('Collectable');
    const b = createDefaultConfig('Collectable');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('deep-copies nested objects so edits cannot leak between cards', () => {
    const first = createDefaultConfig('PostProcessVolume');
    if (first.shape !== 'box') throw new Error('unexpected shape');
    first.size.x = 999;
    first.overrides.exposure = 42;

    const second = createDefaultConfig('PostProcessVolume');
    if (second.shape !== 'box') throw new Error('unexpected shape');
    expect(second.size.x).not.toBe(999);
    expect(second.overrides.exposure).not.toBe(42);

    // The module-level constant itself must stay pristine.
    const constCfg = BEHAVIOR_CARD_DEFAULTS.PostProcessVolume;
    expect(constCfg.size.x).not.toBe(999);
    expect(constCfg.overrides.exposure).not.toBe(42);
  });
});

describe('behaviorCards — NodeGraphConverter round-trip', () => {
  const graphs = new Map<BehaviorCardType, NodeGraphData>();
  for (const type of ALL_TYPES) {
    graphs.set(type, convertBehaviorToNodes(card(type)));
  }

  /**
   * PostProcessVolume is the only card the UI never offers to convert
   * (BehaviorCardsInspector hides the button for it), so it is exempt here.
   */
  const CONVERTIBLE = ALL_TYPES.filter((t) => t !== 'PostProcessVolume');

  it('converts every convertible card type into a graph with at least one node', () => {
    for (const type of CONVERTIBLE) {
      const graph = graphs.get(type)!;
      expect(graph, `${type}`).toBeDefined();
      expect(Array.isArray(graph.nodes), `${type}.nodes`).toBe(true);
      expect(graph.nodes.length, `${type} produced no nodes`).toBeGreaterThan(0);
    }
  });

  it('leaves PostProcessVolume unconverted, matching the hidden UI button', () => {
    expect(graphs.get('PostProcessVolume')!.nodes).toHaveLength(0);
  });

  it('gives every graph uniquely identified nodes', () => {
    for (const type of ALL_TYPES) {
      const ids = graphs.get(type)!.nodes.map((n) => n.id);
      expect(new Set(ids).size, `${type} has duplicate node ids`).toBe(ids.length);
      for (const id of ids) expect(id, `${type} node id`).toBeTruthy();
    }
  });

  it('only emits connections whose endpoints and sockets exist', () => {
    for (const [type, graph] of graphs) {
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      for (const conn of graph.connections) {
        const from = byId.get(conn.fromNodeId);
        const to = byId.get(conn.toNodeId);
        expect(from, `${type}: dangling fromNodeId ${conn.fromNodeId}`).toBeDefined();
        expect(to, `${type}: dangling toNodeId ${conn.toNodeId}`).toBeDefined();
        expect(
          from!.outputs.some((s) => s.id === conn.fromSocketId),
          `${type}: ${from!.type} has no output socket ${conn.fromSocketId}`
        ).toBe(true);
        expect(
          to!.inputs.some((s) => s.id === conn.toSocketId),
          `${type}: ${to!.type} has no input socket ${conn.toSocketId}`
        ).toBe(true);
      }
    }
  });

  it('wires the Collectable into an event-driven graph', () => {
    const graph = graphs.get('Collectable')!;
    expect(graph.connections.length).toBeGreaterThan(0);
    const eventNodes = graph.nodes.filter((n) => n.category === 'event');
    expect(eventNodes.length).toBeGreaterThan(0);
    expect(
      eventNodes.some((n) => n.type === 'OnCollision' || n.type === 'OnTriggerEnter')
    ).toBe(true);
  });

  it('does not mutate the card it converts', () => {
    const source = card('NavMeshAgent');
    const before = JSON.stringify(source);
    convertBehaviorToNodes(source);
    expect(JSON.stringify(source)).toBe(before);
  });
});
