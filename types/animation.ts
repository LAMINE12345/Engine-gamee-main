export type EasingFunctionType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'bounce'
  | 'elastic';

export interface KeyframeData {
  id: string;
  time: number; // In seconds (e.g. 0, 1.5, 3)
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // In degrees
  scale: { x: number; y: number; z: number };
  easing: EasingFunctionType;
}

export interface AnimationTrack {
  id: string;
  name: string;
  targetNodeId: string;
  duration: number; // In seconds
  loop: boolean;
  pingPong: boolean;
  autoplay: boolean;
  keyframes: KeyframeData[];
}

export interface AnimationPlaybackState {
  trackId: string;
  currentTime: number; // Current playhead in seconds
  isPlaying: boolean;
  playbackSpeed: number; // 1.0 = normal, 0.5 = slow-mo, 2.0 = fast
  direction: 1 | -1; // 1 = forward, -1 = reverse
}

// =========================================================================
// 4.2 — Animator Controller (Unity-style) : states, transitions, paramètres,
// events, couches additives, motion matching.
// Un état joue un clip squelettique (mixer) OU une track keyframes.
// =========================================================================

/** Source jouée par un état. */
export type AnimStateSource =
  | { kind: 'clip'; clip: string }
  | { kind: 'track'; trackId: string };

export type AnimParamType = 'float' | 'bool' | 'trigger';

export interface AnimParam {
  name: string;
  type: AnimParamType;
  value: number | boolean;
}

export type AnimConditionOp = '>' | '<' | '>=' | '<=' | '==' | '!=';

export interface AnimCondition {
  param: string;
  op: AnimConditionOp;
  value: number | boolean;
}

export interface AnimTransition {
  id: string;
  to: string; // nom de l'état cible
  conditions: AnimCondition[];
  /** Temps normalisé (0-1) requis avant transition (défaut 0 = immédiate). */
  exitTime?: number;
  /** Durée du crossfade (s). */
  duration: number;
  /** Si false, la transition ne se rejoue pas tant que la cible est active. */
  canTransitionToSelf?: boolean;
}

/** Callback à un instant normalisé (0-1) du clip. */
export type AnimEventKind = 'sound' | 'emitter' | 'flag' | 'log';

export interface AnimEvent {
  id: string;
  /** Temps normalisé 0-1. */
  time: number;
  name: string;
  kind: AnimEventKind;
  /** sound: nom SFX · emitter: preset particules · flag: `nom=valeur` · log: texte. */
  value: string;
}

export interface AnimState {
  name: string;
  source: AnimStateSource;
  /** Vitesse de lecture (1 = normal). */
  speed: number;
  loop: boolean;
  /** Tag locomotion (motion matching + auto-speed). */
  locomotion?: boolean;
  /** Vitesse cible (m/s) pour le motion matching. */
  targetSpeed?: number;
  /** Virage cible (rad/s) pour le motion matching. */
  targetTurn?: number;
  transitions: AnimTransition[];
  events: AnimEvent[];
}

export type AnimLayerMode = 'override' | 'additive';

export interface AnimLayer {
  name: string;
  mode: AnimLayerMode;
  /** Poids 0-1 (couche additive : intensité de l'overlay). */
  weight: number;
  /** État joué par la couche (défaut : suit la base pour override). */
  state?: string;
}

export interface MotionMatchingConfig {
  enabled: boolean;
  /** Intervalle d'évaluation (s). */
  interval: number;
  /** Temps min dans un état avant re-switch (s). */
  dwellTime: number;
  /** Marge de supériorité requise pour switcher. */
  margin: number;
  /** Poids vitesse vs virage. */
  speedWeight: number;
  turnWeight: number;
}

export interface AnimatorControllerData {
  enabled: boolean;
  params: AnimParam[];
  states: AnimState[];
  /** État initial (défaut = premier état). */
  entryState?: string;
  layers: AnimLayer[];
  motionMatching: MotionMatchingConfig;
  /** Auto-alimentation : speed/moving/grounded depuis la scène. */
  autoParams: boolean;
}

export function defaultAnimatorController(): AnimatorControllerData {
  return {
    enabled: true,
    params: [
      { name: 'speed', type: 'float', value: 0 },
      { name: 'moving', type: 'bool', value: false },
      { name: 'grounded', type: 'bool', value: true },
      { name: 'attack', type: 'trigger', value: false },
    ],
    states: [],
    layers: [{ name: 'Base', mode: 'override', weight: 1 }],
    motionMatching: {
      enabled: false,
      interval: 0.15,
      dwellTime: 0.4,
      margin: 0.15,
      speedWeight: 1,
      turnWeight: 0.5,
    },
    autoParams: true,
  };
}

export function normalizeAnimatorController(
  data?: Partial<AnimatorControllerData> | null
): AnimatorControllerData {
  const d = data ?? {};
  const def = defaultAnimatorController();
  const num = (v: unknown, fb: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fb;
  return {
    enabled: typeof d.enabled === 'boolean' ? d.enabled : true,
    params: Array.isArray(d.params) ? (d.params as AnimParam[]) : def.params,
    states: Array.isArray(d.states) ? (d.states as AnimState[]) : [],
    entryState: typeof d.entryState === 'string' ? d.entryState : undefined,
    layers: Array.isArray(d.layers) && (d.layers as AnimLayer[]).length > 0 ? (d.layers as AnimLayer[]) : def.layers,
    motionMatching: {
      enabled: (d.motionMatching as MotionMatchingConfig | undefined)?.enabled === true,
      interval: num((d.motionMatching as MotionMatchingConfig | undefined)?.interval, 0.15),
      dwellTime: num((d.motionMatching as MotionMatchingConfig | undefined)?.dwellTime, 0.4),
      margin: num((d.motionMatching as MotionMatchingConfig | undefined)?.margin, 0.15),
      speedWeight: num((d.motionMatching as MotionMatchingConfig | undefined)?.speedWeight, 1),
      turnWeight: num((d.motionMatching as MotionMatchingConfig | undefined)?.turnWeight, 0.5),
    },
    autoParams: typeof d.autoParams === 'boolean' ? d.autoParams : true,
  };
}
