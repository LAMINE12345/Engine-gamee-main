import { EntityLogicData } from './logic';
import { AtmosphereData, PostProcessingData } from './atmosphere';
import { TerrainConfig, FoliageLayer, FoliageSelectionInfo } from './terrain';
import { HUDConfig } from './hud';

export * from './logic';
export * from './atmosphere';
export * from './terrain';
export * from './hud';

export type ParticlePreset =
  | 'fire'
  | 'smoke'
  | 'sparks'
  | 'rain'
  | 'snow'
  | 'cosmic_dust'
  | 'explosion'
  | 'magic_spell'
  | 'electric_sparks'
  | 'volumetric_smoke'
  | 'aurora';

export interface ParticleEmitterData {
  enabled: boolean;
  preset: ParticlePreset;
  rate: number;
  maxParticles: number;
  size: number;
  speed: number;
  color: string;
  colorEnd?: string;
  lifetime: number;
  spread: number;
  gravity: number;
  loop: boolean;
  burstCount?: number;
}

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type GizmoSpace = 'world' | 'local';
export type RenderMode = 'shaded' | 'wireframe' | 'normals';

export interface TransformData {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // In degrees for UI
  scale: { x: number; y: number; z: number };
}

export type TexturePreset = 'none' | 'grid' | 'brushed' | 'pebbles' | 'diamond' | 'carbon';

export interface MaterialData {
  color: string;
  roughness: number;
  metalness: number;
  wireframe: boolean;
  opacity: number;
  transparent: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  normalScale?: number;
  hasNormalMap?: boolean;
  hasRoughnessMap?: boolean;
  texturePreset?: TexturePreset;
  customNormalMapUrl?: string;
  customRoughnessMapUrl?: string;
  mapUrl?: string;
  repeatU?: number;
  repeatV?: number;
  toonIntensity?: number; // Add this
  outlineColor?: string; // Add this
  outlineThickness?: number; // Add this
  /** Lissage des normales (smooth shading). Piloté par setSmoothShading. */
  smoothShading?: boolean;
}

export interface LightData {
  color: string;
  intensity: number;
  distance?: number;
}

export type RigidbodyType = 'dynamic' | 'static' | 'kinematic';
export type ColliderShapeType = 'auto' | 'box' | 'sphere' | 'capsule' | 'trimesh' | 'cylinder';

export interface RigidbodyData {
  enabled: boolean;
  type: RigidbodyType;
  mass: number;
  restitution: number; // Bounciness [0..1]
  friction: number; // [0..1]
  linearDamping?: number;
  angularDamping?: number;
  lockRotations?: boolean;
}

export interface ColliderData {
  shape: ColliderShapeType;
  isSensor?: boolean;
  size?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
}

export interface CharacterControllerData {
  enabled: boolean;
  mode: 'thirdPerson' | 'firstPerson';
  speed: number; // in m/s
  jumpForce: number; // impulse force
  isGrounded?: boolean;
  cameraDistance?: number; // Distance behind player
  cameraHeight?: number;    // Height above player
  cameraOffsetX?: number;   // Lateral offset (e.g. shoulder camera)
  cameraLerpSpeed?: number; // Follow smoothness
}

export interface VehicleControllerData {
  enabled: boolean;
  engineForce: number; // Max acceleration power
  maxSpeed: number; // Max speed in km/h or m/s
  brakeForce: number; // Braking deceleration
  steerAngle: number; // Steering angle in degrees (e.g. 30 deg)
  suspensionStiffness: number; // Spring stiffness
  suspensionDamping: number; // Damper factor
  suspensionRestLength: number; // Rest height off ground
  gripFriction: number; // Tire grip vs drift factor (0.1 = ice drift, 1.0 = high grip)
  cameraDistance: number; // Distance behind vehicle
  cameraHeight: number; // Height above vehicle
  currentSpeedKmH?: number; // Runtime computed speed
}

export interface ScriptData {
  enabled: boolean;
  code?: string;
}

export interface WindZoneConfig {
  enabled: boolean;
  mode: 'directional' | 'vortex' | 'updraft';
  force: number;
  radius: number;
  direction: { x: number; y: number; z: number };
}

export interface FlammableConfig {
  enabled: boolean;
  isBurning: boolean;
  temperature: number;
  ignitionTemperature: number;
  fuel: number;
  maxFuel: number;
  spreadRadius: number;
  burnDamage: number;
  autoIgnite?: boolean;
  charredColor?: string;
}

export interface PhysicsNodeData {
  rigidbody?: RigidbodyData;
  collider?: ColliderData;
  characterController?: CharacterControllerData;
  vehicleController?: VehicleControllerData;
  ragdoll?: RagdollConfig;
  windZone?: WindZoneConfig;
  flammable?: FlammableConfig;
  /** Sync transform en multijoueur (hôte autoritaire, interpolation). */
  netSync?: boolean;
}

export interface ModelInfo {
  format: 'gltf' | 'glb' | 'fbx';
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
  fileSize?: string;
  originalName?: string;
  animations?: string[];
  /** IndexedDB key for the original model binary (enables restore after reload). */
  storageId?: string;
}

export interface BlendTreeConfig {
  enabled: boolean;
  mode: '1D_speed' | '2D_directional';
  walkSpeed: number; // m/s, default 2.8
  runSpeed: number; // m/s, default 6.5
  sprintSpeed: number; // m/s, default 9.5
  damping: number; // interpolation smoothing factor, default 10.0
  syncPlaybackSpeed: boolean; // dynamically adapt timeScale to avoid foot sliding
}

export interface IKChainConfig {
  enabled: boolean;
  chainName: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
  rootBone: string;
  middleBone: string;
  endBone: string;
  targetOffset: { x: number; y: number; z: number };
  poleVector: { x: number; y: number; z: number };
  weight: number; // 0.0 to 1.0
}

export interface IKConfig {
  enabled: boolean;
  chains: IKChainConfig[];
  footPlanting: boolean; // Automatic ground raycast placement for feet
  groundOffset: number;
}

export type RagdollBodyPart =
  | 'pelvis'
  | 'spine'
  | 'chest'
  | 'head'
  | 'upperArmL'
  | 'lowerArmL'
  | 'upperArmR'
  | 'lowerArmR'
  | 'thighL'
  | 'calfL'
  | 'thighR'
  | 'calfR'
  | 'custom';

export interface RagdollBoneConfig {
  boneName: string;
  part: RagdollBodyPart;
  radius: number; // capsule radius in meters
  height: number; // capsule height in meters
  massRatio?: number;
  parentBoneName?: string;
}

export interface RagdollConfig {
  enabled: boolean;
  active?: boolean;
  totalMass?: number; // default ~75kg
  triggerOnDamage?: boolean; // triggers ragdoll when receiving projectile / attack / health drop
  triggerOnFall?: boolean; // triggers ragdoll on high-speed fall or ground impact
  fallSpeedThreshold?: number; // m/s threshold, default -10 m/s
  damping?: number; // linear/angular damping, default 2.0
  autoGetUp?: boolean; // automatically recover after duration
  getUpDelay?: number; // recovery delay in seconds, default 4.0
  bones?: RagdollBoneConfig[];
}

export interface RigAnimData {
  enabled: boolean;
  rigType: 'biped' | 'quadruped' | 'vehicle' | 'custom';
  animationMapping: {
    idle?: string;
    walk?: string;
    run?: string;
    sprint?: string;
    jump?: string;
    crouch?: string;
    attack?: string;
    interact?: string;
    hit?: string;
    wave?: string;
    die?: string;
  };
  autoAnimate: boolean; // Transitions based on speed
  blendTree?: BlendTreeConfig; // Continuous 1D/2D animation blending
  ik?: IKConfig; // Inverse Kinematics chains & Foot Planting
  ragdoll?: RagdollConfig; // Physical ragdoll collider network
  vehicleWheels?: {
    frontLeft?: string;
    frontRight?: string;
    rearLeft?: string;
    rearRight?: string;
  };
}

/** Config d'un point de spawn multijoueur (nœud `spawnPoint`). */
export interface SpawnPointConfig {
  name: string;
  /** Yaw initial (rad). */
  yaw: number;
  group: string;
}

/** Zone de couleur d'un modèle préfabriqué low-poly (une entrée par matériau du GLB). */
export interface LowPolyPaletteEntry {
  /** Nom du matériau source (unique par modèle). */
  name: string;
  /** Couleur hex sRGB de la zone. */
  color: string;
}

/**
 * Répétition automatique d'un objet : N copies générées le long d'un axe
 * local, avec chevauchement réglable. La configuration vit sur la SOURCE ;
 * les copies sont ses enfants directs marqués `repeatOf`.
 */
export interface RepeatData {
  /** Nombre de copies générées (0 = répétition désactivée). */
  count: number;
  /** Axe local le long duquel les copies sont décalées. */
  axis: 'x' | 'y' | 'z';
  /** Chevauchement, 0 = bout à bout, 0.95 = quasi superposé. */
  overlap: number;
  /** Recale chaque copie au sol au moment de la génération. */
  followGround?: boolean;
}

/** Mesures d'un objet servant à convertir superposition ⇄ espacement. */
export interface RepeatInfo {
  /** Étendue LOCALE (géométrie, hors échelle) par axe. */
  size: { x: number; y: number; z: number };
  /** Échelle monde par axe local (unités monde par unité locale). */
  scale: { x: number; y: number; z: number };
}

export interface SceneNode {
  id: string; // Three.js UUID & ECS Entity ID
  name: string;
  type: 'mesh' | 'light' | 'camera' | 'group' | 'helper';
  subType?:
    | 'cube'
    | 'sphere'
    | 'cylinder'
    | 'plane'
    | 'torus'
    | 'cone'
    | 'player'
    | 'directional'
    | 'point'
    | 'spot'
    | 'ambient'
    | 'model'
    | 'particles'
    | 'vehicle'
    | 'water'
    | 'river'
    | 'lowPoly'
    | 'triggerVolume'
    | 'navMeshAgent'
    | 'checkpoint'
    | 'spawnPoint'
    | 'postProcessVolume'
    | 'group'
    | 'empty';
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  transform: TransformData;
  /** UUID du parent enregistré (null = racine). TIER 2.1. */
  parentId?: string | null;
  /** Rattachement prefab : template + instance. TIER 2.1. */
  prefabId?: string;
  prefabInstanceId?: string;
  /** Objet de la bibliothèque low-poly (LOW_POLY_set.glb) : id du modèle source. */
  lowPolyId?: string;
  /** Palette de couleurs éditable du modèle (zones = matériaux du GLB). */
  palette?: LowPolyPaletteEntry[];
  /** Répétition automatique (source uniquement — voir RepeatData). */
  repeat?: RepeatData;
  /** UUID de la source dont cet objet est une copie générée par répétition. */
  repeatOf?: string;
  material?: MaterialData;
  light?: LightData;
  physics?: PhysicsNodeData;
  logic?: EntityLogicData;
  particles?: ParticleEmitterData;
  rigAnim?: RigAnimData;
  childrenCount?: number;
  modelInfo?: ModelInfo;
  riverConfig?: any;
  spawnPoint?: SpawnPointConfig;
  animator?: import('./animation').AnimatorControllerData;
  /** 5.2 : identifiant stable inter-pairs (édition collaborative). */
  collabId?: string;
}

export interface EngineStats {
  fps: number;
  triangles: number;
  drawCalls: number;
  objectsCount: number;
  physicsBodiesCount?: number;
  // --- Profiler (TIER 1.3, optionnels : HUD existants inchangés) ---
  /** Moyenne du temps de frame sur la fenêtre (ms). */
  frameMsAvg?: number;
  /** p95 du temps de frame (ms) — le vrai indicateur de fluidité. */
  frameMsP95?: number;
  entitiesCount?: number;
  /** Compteurs GPU three.js (renderer.info.memory). */
  geometries?: number;
  textures?: number;
  /** Top sections du profiler (triées par moyenne décroissante). */
  sections?: Array<{ name: string; avg: number; p95: number; max: number }>;
}

export interface EngineEvents {
  onSelectionChange: (node: SceneNode | null, selectedIds?: string[]) => void;
  onHierarchyChange: (nodes: SceneNode[]) => void;
  onTransformChange: (node: SceneNode) => void;
  onStatsUpdate: (stats: EngineStats) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  /** Remonté quand le moteur modifie la configuration HUD (mini-jeu, import de scène, etc.) */
  onHUDConfigChange?: (config: HUDConfig) => void;
  onModelImportSuccess?: (name: string, info: ModelInfo) => void;
  onModelImportError?: (error: string) => void;
  /** Remonté quand la sélection d'une instance foliage peinte change (mode Sélection). */
  onFoliageSelectionChange?: (info: FoliageSelectionInfo | null) => void;
}

export interface WorkPlaneConfig {
  gridVisible: boolean;
  axesVisible: boolean;
  shadowPlaneVisible: boolean;
  gridSize: number;
  gridDivisions: number;
  snapUnit: number;
  height: number;
}

export const DEFAULT_WORK_PLANE_CONFIG: WorkPlaneConfig = {
  gridVisible: true,
  axesVisible: true,
  shadowPlaneVisible: true,
  gridSize: 40,
  gridDivisions: 40,
  snapUnit: 0.5,
  height: 0,
};

/** TIER 2.4 — mode d'accrochage translation. */
export type SnapMode = 'grid' | 'surface' | 'vertex';

export interface SnapSettings {
  enabled: boolean;
  mode: SnapMode;
  /** Pas de grille (m) — presets SNAP_TRANSLATE_PRESETS. */
  translateSnap: number;
  /** Pas de rotation (degrés) — presets SNAP_ROTATE_PRESETS. */
  rotateSnapDeg: number;
  /** Pas d'échelle (incrément) ou null = libre. */
  scaleSnap: number | null;
  /** Seuil de capture de sommet (m). */
  vertexThreshold: number;
  /** Distance max de chute pour le surface snap (m). */
  surfaceMaxDrop: number;
}

export const SNAP_TRANSLATE_PRESETS = [0.1, 0.25, 0.5, 1, 5] as const;
export const SNAP_ROTATE_PRESETS = [15, 30, 45, 90] as const;
export const SNAP_SCALE_PRESETS = [0.05, 0.1, 0.25, 0.5, 1] as const;

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: false,
  mode: 'grid',
  translateSnap: 0.5,
  rotateSnapDeg: 15,
  scaleSnap: 0.1,
  vertexThreshold: 0.3,
  surfaceMaxDrop: 25,
};

export interface SceneExportData {
  version: string;
  generator: string;
  timestamp: string;
  projectName?: string;
  /** Bloc 1.3.0 : provenance et comptages (migrateurs le reconstituent). */
  meta?: {
    generator?: string;
    exportedAt?: string;
    nodeCount?: number;
    formatVersion?: string;
  };
  /** Bloc 1.3.0 : réglages éditeur persistés (plan de travail, rendu, snap). */
  settings?: {
    workPlane?: Partial<WorkPlaneConfig>;
    renderMode?: RenderMode;
    /** Compat 1.3 — remplacé par `snap` (TIER 2.4). */
    snapping?: boolean;
    snap?: Partial<SnapSettings>;
    /** 3.4 : config globale LOD / billboards. */
    lod?: Partial<import('./culling').LODGlobalConfig>;
    /** 3.4 : config globale occlusion culling. */
    culling?: Partial<import('./culling').CullingConfig>;
  };
  atmosphere?: AtmosphereData;
  postProcessing?: PostProcessingData;
  terrain?: {
    config: TerrainConfig;
    heightmap?: number[];
    foliageLayers?: FoliageLayer[];
    /** 4.3 : splat strokes, trous, peinture de détails. */
    detail?: import('./terrain').TerrainDetailData;
  };
  hud?: HUDConfig;
  /**
   * Géométrie embarquée (GLB binaire, base64) — uniquement dans le payload
   * de l'export HTML autonome, jamais dans un export JSON de scène.
   */
  gltf?: string;
  environment: {
    backgroundColor: string;
    ambientIntensity: number;
    sunIntensity: number;
    sunPosition: { x: number; y: number; z: number };
  };
  nodes: {
    id?: string;
    name: string;
    type: 'mesh' | 'light' | 'camera' | 'group' | 'helper';
    subType?: string;
    /** UUID du parent enregistré (null/absent = racine). Format 1.4.0+. */
    parentId?: string | null;
    /** Rattachement prefab (template + instance). Format 1.4.0+. */
    prefabId?: string;
    prefabInstanceId?: string;
    /** Objet de la bibliothèque low-poly : id du modèle source (LOW_POLY_set.glb). */
    lowPolyId?: string;
    /** Palette de couleurs éditable du modèle (zones = matériaux du GLB). */
    palette?: LowPolyPaletteEntry[];
    /** Répétition automatique (source uniquement). Format 4.x+. */
    repeat?: RepeatData;
    /** UUID de la source dont cet objet est une copie générée. Format 4.x+. */
    repeatOf?: string;
    transform: TransformData;
    material?: MaterialData;
    light?: LightData;
    physics?: PhysicsNodeData;
    logic?: EntityLogicData;
    rigAnim?: RigAnimData;
    modelInfo?: ModelInfo;
    particles?: ParticleEmitterData;
    riverConfig?: any;
    spawnPoint?: SpawnPointConfig;
    animator?: import('./animation').AnimatorControllerData;
    collabId?: string;
    visible: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
  }[];
}
