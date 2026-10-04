import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  GizmoMode,
  GizmoSpace,
  RenderMode,
  SceneNode,
  TransformData,
  MaterialData,
  LightData,
  PhysicsNodeData,
  RigAnimData,
  EngineEvents,
  EngineStats,
  ModelInfo,
  SceneExportData,
  TexturePreset,
  AtmosphereData,
  PostProcessingData,
  SkyPreset,
  TerrainConfig,
  TerrainBrushConfig,
  DEFAULT_TERRAIN_BRUSH,
  
  HUDConfig,
  DEFAULT_HUD_CONFIG,
  WorkPlaneConfig,
  DEFAULT_WORK_PLANE_CONFIG,
  SnapSettings,
  
  RagdollBoneConfig,
  ParticleEmitterData,
  FoliageType,
  FoliageSelectionInfo,
  FoliageEditPatch,
  RepeatData,
  RepeatInfo,
} from '../types/engine';
import { TextureGenerator } from './textureGenerator';
import {
  ECSWorld,
  TransformComponent,
  MeshComponent,
  LightComponent,
  RigidbodyComponent,
  ColliderComponent,
  CharacterControllerComponent,
  RigAnimComponent,
  ToonMaterialComponent,
  OutlineComponent,
  Entity,
} from './ecs/ECS';
import { PhysicsSystem } from './ecs/PhysicsSystem';
import { patchPointerCaptureOnce } from './input/pointerCaptureGuard';
import { ToonMaterialSystem, TOON_SOURCE_MATERIAL_KEY, TOON_OUTLINE_NAME } from './ecs/ToonMaterialSystem';
import { PhysicsManager } from './physics/PhysicsManager';
import { RagdollSystem } from './physics/RagdollSystem';
import { LogicExecutor } from './logic/LogicExecutor';
import { ScriptDebugger } from './logic/ScriptDebugger';
import { createGraphNode } from './logic/NodeGraphConverter';
import { EntityLogicData } from '../types/logic';
import { createVehicleGroup } from './scene/vehicleFactory';
import { assignDefaultPhysics } from './scene/defaultPhysics';
import { ensurePBRMaterial } from './scene/materialFactory';
import { smoothShadeObject, flattenShadeObject } from './scene/smoothShading';
import { AtmosphereManager } from './atmosphere/AtmosphereManager';
import { TerrainGenerator } from './terrain/TerrainGenerator';
import { FoliagePainter, sortFoliageEntries, type FoliageLibraryEntry } from './terrain/FoliagePainter';
import { ParticleManager } from './vfx/ParticleManager';
import { SurfaceImpactFX } from './vfx/SurfaceImpactFX';
import { soundManager, SFXType } from './SoundManager';
import { AnimationManager } from './animation/AnimationManager';
import { EnvironmentalPhysicsManager } from './physics/EnvironmentalPhysicsManager';
import { WaterManager } from './water/WaterManager';
import { RiverMesh, RiverConfig } from './water/RiverMesh';
import { NavMeshManager } from './navigation/NavMeshManager';
import { TriggerVolumeManager } from './navigation/TriggerVolumeManager';
import { PostProcessVolumeManager } from './postprocess/PostProcessVolumeManager';
import { saveModelBinary, deleteModelBinary, resolveTextureUrl } from './persistence';
import { analyzeUv, type UvAnalysis } from './texture/uvAtlas';
import { FORMAT_VERSION } from './serialize/format';
import {
  prepareScene,
  encodeSceneBinary,
  decodeSceneBinary,
  detectImportConflict,
  mergeScenes,
  backupCurrentScene,
  
  
} from './serialize';
import type { ImportPolicy, SceneConflict, BackupInfo } from './serialize';
import { HistoryManager, type AutosaveInfo } from './core/HistoryManager';
import { NodeRestorer, type NodeRestorePort, type RestoredNode } from './scene/nodeRestorer';
import { SelectionManager } from './core/SelectionManager';
import { CameraManager, CameraViewPreset } from './core/CameraManager';
import type { CameraFollowConfig } from './core/cameraFollow';
import { RenderPipeline } from './core/RenderPipeline';
import { PlayModeManager } from './core/PlayModeManager';
import { AssetStore } from './assets/AssetStore';
import { AssetDatabase } from './assets/AssetDatabase';
import { LODManager } from './assets/LODManager';
import { LivePreviewHost } from './live/host';
import type {  } from './live/link';
import { BroadcastLiveLink, WebRtcLiveLink } from './live/link';
import { CollabManager } from './collab/manager';
import { CollabSession } from './collab/session';
import { VersionControl } from './collab/vcs';
import type {
  CollabCommit,
  CollabField,
  CollabNodeData,
  CollabOp,
  PeerPresence,
  SceneDiff,
} from './collab/types';
import { GameUIManager } from './ui/manager';
import { buildUIStarterPreset } from './ui/presets';
import type { UIAction } from '../types/hud';
import { AnimatorSystem } from './animation/animator';
import type { AnimatorEventPayload } from './animation/animator';
import { normalizeAnimatorController } from '../types/animation';
import type { AnimatorControllerData } from '../types/animation';
import { NetHost } from './net/host';
import { NetClient } from './net/client';
import { SpawnManager } from './net/spawn';
import { sampleInputBits, cameraForwardYaw } from './net/playerSim';
import type { NetEntityState } from './net/types';
import { OcclusionCullingManager } from './culling/OcclusionCullingManager';
import { ImpostorManager } from './culling/ImpostorManager';
import { auditFrustumCulling } from './culling/FrustumAudit';
import {
  normalizeLODConfig,
  normalizeCullingConfig,
  DEFAULT_LOD_CONFIG,
  DEFAULT_CULLING_CONFIG,
} from '../types/culling';
import type { LODGlobalConfig, CullingConfig, CullingStats, FrustumAuditResult } from '../types/culling';
import { TextureStreamer } from './assets/TextureStreamer';
import { AssetBundleManager } from './assets/AssetBundleManager';
import { GeometryPipeline, LOD_MIN_TRIANGLES, LOD_PIPELINE_VERSION } from './assets/GeometryPipeline';
import { FrameProfiler } from './debug/FrameProfiler';
import { PhysicsDebugRenderer } from './debug/PhysicsDebugRenderer';
import { MemoryMonitor, MemorySnapshot } from './debug/MemoryMonitor';
import type { ProfilerSnapshot } from '../types/debug';
import type {
  AssetBundleManifest,
  AssetDeleteResult,
  AssetKind,
  AssetRecord,
  AssetStats,
  LODLevelMeta,
  LODStatus,
  ModelImportReport,
  OrphanPurgeResult,
} from '../types/assets';

/**
 * Bibliothèques GLB additionnelles chargées avec le pack LOW_POLY et visibles
 * dans l'onglet Préfabriqués. `importScale: 1` = modèle déjà à l'échelle réelle
 * (le pack LOW_POLY, lui, est posé avec LOW_POLY_IMPORT_SCALE = 0.2).
 */
const EXTRA_MODEL_LIBRARIES: { url: string; importScale: number }[] = [
  { url: '/assets/LongGrass.glb', importScale: 1 },
];

export class SceneManager {
  private container: HTMLElement;

  // --- Modules autonomes (TIER 1 : éclatement du God class) ---
  private cameraManager!: CameraManager;
  private renderPipeline!: RenderPipeline;
  private selection!: SelectionManager;
  private history!: HistoryManager;
  private playMode!: PlayModeManager;

  // --- Asset Pipeline (TIER 1.2 : registry, LOD, streaming, bundles) ---
  public assetStore!: AssetStore;
  public assetDatabase!: AssetDatabase;
  public lodManager!: LODManager;
  // --- Live Preview 5.3 (diffusion jeu temps réel : broadcast + WebRTC) ---
  public previewHost: LivePreviewHost | null = null;
  public previewInvite: WebRtcLiveLink | null = null;
  // --- Collaboration temps réel (5.2 : CRDT LWW + version control) ---
  public collabManager: CollabManager | null = null;
  public collabSession: CollabSession | null = null;
  public vcs = new VersionControl();
  public collabName = 'Éditeur';
  private collabLogLines: string[] = [];
  private pendingCollabParents: { id: string; parentId: string }[] = [];
  /** 4.4 — UI moteur in-game (écrans Canvas 2D, tweens, variables). */
  public guiManager!: GameUIManager;
  /** 4.2 — Animator Controller (states, events, couches, motion matching). */
  public animatorSystem!: AnimatorSystem;
  public occlusionManager!: OcclusionCullingManager;
  public impostorManager!: ImpostorManager;
  /** Config globale LOD/billboard (3.4, persistée dans settings.lod). */
  public lodConfig: LODGlobalConfig = { ...DEFAULT_LOD_CONFIG };
  /** Config globale occlusion culling (3.4, persistée dans settings.culling). */
  public cullingConfig: CullingConfig = { ...DEFAULT_CULLING_CONFIG };

  // --- Multijoueur P2P (WebRTC, test) : host autoritaire + prédiction ---
  public netRole: 'none' | 'host' | 'client' = 'none';
  public netHost: NetHost | null = null;
  public netClient: NetClient | null = null;
  public spawnManager!: SpawnManager;
  public netPlayerName = 'Joueur';
  private netLogLines: string[] = [];
  /** dt de la dernière frame (échantillonnage d'inputs réseau). */
  private lastFrameDt = 1 / 60;
  public textureStreamer!: TextureStreamer;
  public bundleManager!: AssetBundleManager;

  // --- Debug (TIER 1.3 : profiler, physics debug, mémoire) ---
  public frameProfiler!: FrameProfiler;
  public physicsDebug!: PhysicsDebugRenderer;
  public memoryMonitor!: MemoryMonitor;

  /** Scène Three.js partagée (registre passé aux modules). */
  private scene!: THREE.Scene;

  /** Caméra active (propriété du CameraManager). */
  public get camera(): THREE.PerspectiveCamera {
    return this.cameraManager.getCamera();
  }
  /** État Play/Stop (propriété du PlayModeManager). */
  private get isPlaying(): boolean {
    return this.playMode.isPlaying;
  }
  private get selectedObject(): THREE.Object3D | null {
    return this.selection.getSelectedObject();
  }
  public get selectedObjects(): THREE.Object3D[] {
    return this.selection.getSelectedObjects();
  }
  /** Horodatage ISO du dernier autosave réussi (info/debug). */
  public get lastAutosaveAt(): string | null {
    return this.history.lastAutosaveAt;
  }
  private groundPlane: THREE.Plane;

  // 3D Work Plane & Environment
  public workPlaneConfig: WorkPlaneConfig = { ...DEFAULT_WORK_PLANE_CONFIG };
  private workPlaneGroup!: THREE.Group;
  private majorGridHelper!: THREE.GridHelper;
  private minorGridHelper!: THREE.GridHelper;
  private axisLinesGroup!: THREE.Group;
  private axesHelper!: THREE.AxesHelper;
  private floorShadowPlane!: THREE.Mesh;
  private dirLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private rimLight!: THREE.DirectionalLight;

  // ECS, Atmosphere, Terrain & Foliage Engine
  public ecsWorld: ECSWorld;
  public physicsManager: PhysicsManager;
  public physicsSystem: PhysicsSystem;
  public logicExecutor: LogicExecutor;
  public navMeshManager: NavMeshManager;
  public triggerVolumeManager: TriggerVolumeManager;
  public postProcessVolumeManager!: PostProcessVolumeManager;
  public atmosphereManager!: AtmosphereManager;
  public waterManager!: WaterManager;
  public riverMeshes: RiverMesh[] = [];
  public terrainGenerator!: TerrainGenerator;
  public foliagePainter!: FoliagePainter;
  /** Chargement asynchrone de la bibliotheque LOW_POLY_set.glb (112 elements). */
  public foliageLibraryPromise: Promise<FoliageLibraryEntry[]> | null = null;
  public particleManager!: ParticleManager;
  public animationManager!: AnimationManager;
  public terrainBrush: TerrainBrushConfig = { ...DEFAULT_TERRAIN_BRUSH };
  /** Selection d'une instance foliage peinte (mode Sélection du panneau Terrain). */
  private foliageSelection: { type: FoliageType; instanceId: number } | null = null;
  /** True si le pointerdown en cours a été consommé par le picking foliage. */
  private foliagePickConsumed = false;
  private foliageHistoryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Checkpoint d'historique différé pour une série de réglages de répétition. */
  private repeatHistoryTimer: ReturnType<typeof setTimeout> | null = null;
  public hudConfig: HUDConfig = { ...DEFAULT_HUD_CONFIG };
  private brushMarkerMesh!: THREE.Mesh;
  private isSculptingBrush: boolean = false;
  private lastFrameTime: number = performance.now();

  // State
  public objects: Map<string, THREE.Object3D> = new Map();
  /** Restaurateur de nœuds (lazy) : voir lib/scene/nodeRestorer.ts. */
  private _restorer: NodeRestorer | null = null;

  private animationFrameId: number | null = null;
  private events: EngineEvents;

  // Stats calculation
  private frameCount: number = 0;
  private lastFpsTime: number = performance.now();
  private currentFps: number = 60;

  // Loaders
  private gltfLoader: GLTFLoader;
  private fbxLoader: FBXLoader;
  private mixers: Map<string, THREE.AnimationMixer> = new Map();
  private smoothedEntitySpeeds: Map<string, number> = new Map();
  private blendTreeActions: Map<string, Map<string, THREE.AnimationAction>> = new Map();
  // One-shot gesture animations (attack/interact/wave...): played once, then locomotion resumes.
  private oneShotActions: Map<string, { action: THREE.AnimationAction; timer: number; duration: number }> =
    new Map();
  // Clip names already warned about (avoids spamming the console every frame)
  private warnedMissingClips: Set<string> = new Set();
  // Entities already covered by the one-time rig diagnostic log this Play session
  private rigDiagLogged: Set<string> = new Set();
  private activeProjectiles: Array<{
    id: string;
    mesh: THREE.Mesh;
    direction: THREE.Vector3;
    speed: number;
    damage: number;
    timer: number;
    /** Tir relayé réseau : trajectoire seule, sans dégâts ni ragdoll. */
    visualOnly?: boolean;
  }> = [];
  private dracoLoader: DRACOLoader | null = null;
  private toonMaterialSystem!: ToonMaterialSystem;

  constructor(container: HTMLElement, events: EngineEvents) {
    // three.js controls throw InvalidStateError on setPointerCapture races —
    // patch once, before any control is instantiated.
    patchPointerCaptureOnce();
    this.container = container;
    this.events = events;
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Initialize ECS World and Physics Manager
    this.ecsWorld = new ECSWorld();
    this.physicsManager = new PhysicsManager(this.ecsWorld);
    this.physicsSystem = new PhysicsSystem(this.physicsManager);
    this.ecsWorld.addSystem(this.physicsSystem);
    // Le système Toon est piloté manuellement dans animate() afin de tourner
    // aussi en mode édition (pas uniquement en mode lecture)
    this.toonMaterialSystem = new ToonMaterialSystem();
    this.navMeshManager = new NavMeshManager();
    this.triggerVolumeManager = new TriggerVolumeManager();
    this.logicExecutor = new LogicExecutor(this.ecsWorld);
    this.logicExecutor.navMeshManager = this.navMeshManager;
    this.logicExecutor.triggerVolumeManager = this.triggerVolumeManager;
    this.logicExecutor.physicsManager = this.physicsManager;
    // Le nœud « Tremblement » n'a pas accès à la caméra : on lui expose un
    // setter. La CameraManager applique elle-même la secousse au rendu.
    this.logicExecutor.onCameraShake = (intensity, duration) => {
      this.cameraManager.shake(intensity, duration);
    };
    // Caméra à traîne (nœud SlowFollow). Elle DOIT être appliquée après le
    // suivi rigide de la frame : sinon la caméra serait replacée à sa position
    // collée et le retard annulé — le nœud serait sans effet.
    this.logicExecutor.onCameraTrailing = (position) => {
      this.cameraManager.applyTrailingPosition(position);
    };
    this.logicExecutor.onPlaySkeletalAnimation = (id, name) => this.playSkeletalAnimation(id, name);
    this.logicExecutor.onShootProjectile = (id, prefab, speed, damage) => this.shootProjectile(id, prefab, speed, damage);
    this.logicExecutor.onDamageEntity = (id, _damage, health) => {
      const targetEntity = this.ecsWorld.getEntity(id) || this.getPlayerEntity();
      if (targetEntity) {
        const rigComp = targetEntity.getComponent<RigAnimComponent>('RigAnim');
        const ragdollCfg = rigComp?.ragdoll;
        if (ragdollCfg && ragdollCfg.enabled && ragdollCfg.triggerOnDamage) {
          // Trigger ragdoll with impact knockback
          const knockback = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            health <= 0 ? -1.5 : 1.5,
            -3.0
          );
          this.triggerRagdoll(targetEntity.id, knockback);
        }
      }
    };

    // Tier 3.1 : collisions Rapier → scripts / cartes / graphe
    this.physicsManager.onCollisionEvent = (idA, idB) => {
      const a = this.ecsWorld.getEntity(idA);
      const b = this.ecsWorld.getEntity(idB);
      if (a && b) this.logicExecutor.handleCollision(a, b);
    };

    // Tier 3.1 : Trigger Volumes → hooks scripts + nœuds graph
    this.triggerVolumeManager.onVolumeEnter = (triggerId, otherId) => {
      const other = this.ecsWorld.getEntity(otherId);
      if (!other) return;
      const t = this.ecsWorld.getEntity(triggerId);
      if (t) {
        this.logicExecutor.executeGraphEvents(t, 'OnTriggerEnter', { target: other });
        this.logicExecutor.dispatchTriggerHook(triggerId, 'enter', other);
      }
    };
    this.triggerVolumeManager.onVolumeExit = (triggerId, otherId) => {
      const other = this.ecsWorld.getEntity(otherId);
      if (!other) return;
      const t = this.ecsWorld.getEntity(triggerId);
      if (t) {
        this.logicExecutor.executeGraphEvents(t, 'OnTriggerExit', { target: other });
        this.logicExecutor.dispatchTriggerHook(triggerId, 'exit', other);
      }
    };

    // Pre-initialize Rapier WebAssembly in background
    PhysicsManager.initRapier().catch((err) => {
      console.warn('Rapier 3D WebAssembly initialization deferred:', err);
    });

    // Initialize GLTF & DRACO loader
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onError = (url) => {
      console.error(`Erreur de chargement de ressource: ${url}`);
      this.events.onModelImportError?.(`Ressource manquante: ${url.split('/').pop()}. Utilisez le format .GLB pour inclure toutes les textures.`);
    };

    this.gltfLoader = new GLTFLoader(loadingManager);
    this.fbxLoader = new FBXLoader();
    try {
      this.dracoLoader = new DRACOLoader();
      // Forme objet de setDecoderPath : c'est l'API non dépréciée (l'ancien
      // setDecoderConfig() sera retiré en r194). Chemins vérifiés sur le CDN
      // gstatic — le sous-dossier `gltf/` renvoie 404 sur cette version.
      this.dracoLoader.setDecoderPath({
        js: 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/draco_wasm_wrapper.js',
        wasm: 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/draco_decoder.wasm',
      });
      this.gltfLoader.setDRACOLoader(this.dracoLoader);
    } catch {
      console.warn('Draco decoder CDN initialization deferred.');
    }

    this.init();
  }

  /**
   * Brique CameraFollow : la caméra suit une entité arbitraire en 3e personne
   * (course, runner, drone...). Retourne true si un suivi logique est actif
   * — le suivi joueur du CameraManager est alors ignoré pour la frame.
   */
  private applyLogicCameraFollow(dt: number): boolean {
    // Une cible assignée depuis l'éditeur est PRIORITAIRE : c'est un choix
    // explicite de l'utilisateur, il ne doit pas être écrasé au Play par le
    // suivi automatique du joueur ni par une brique CameraFollow.
    if (this.cameraManager.isFollowActive()) return false;
    const follow = this.logicExecutor.cameraFollow;
    if (!follow) return false;
    const ent = this.ecsWorld.getEntity(follow.entityId);
    const obj = ent?.object3D;
    const pos = obj?.position;
    if (!obj || !pos) return false;
    const yaw = obj.rotation.y;
    const desired = new THREE.Vector3(
      pos.x - Math.sin(yaw) * follow.distance,
      pos.y + follow.height,
      pos.z - Math.cos(yaw) * follow.distance
    );
    this.camera.position.lerp(desired, 1.0 - Math.exp(-6 * Math.max(dt, 0.001)));
    this.camera.lookAt(pos.x, pos.y + 1.2, pos.z);
    return true;
  }

  /** Toast HUD du jeu (bannière temporaire en partie). */
  private showToast(message: string, duration = 2500): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aether_show_toast', { detail: { message, duration } })
      );
    }
  }

  private init(): void {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    // 1. Scene & Clear Color (#12131C)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#12131C');
    this.logicExecutor.scene = this.scene;
    this.triggerVolumeManager.setScene(this.scene);
    this.postProcessVolumeManager = new PostProcessVolumeManager(this.scene);
    this.logicExecutor.postProcessVolumeManager = this.postProcessVolumeManager;

    // Feedback UI pour les volumes déclencheurs (toast HUD du jeu)
    this.triggerVolumeManager.onCinematicTriggered = (_cameraName, speaker, text) => {
      this.showToast(`${speaker ? `${speaker} : ` : ''}${text || 'Cinématique'}`, 6000);
    };
    this.triggerVolumeManager.onTrapTriggered = (_entityId, damage) => {
      this.logicExecutor.globalState.health = Math.max(
        0,
        this.logicExecutor.globalState.health - damage
      );
      this.logicExecutor.dispatchAllVariables();
      this.logicExecutor.notifyHealthChanged();
      this.showToast(`Piège ! -${damage} PV`, 2500);
    };

    // 2. Camera (FOV 60, near: 0.1, far: 1000, pos: (3, 3, 5), lookAt: (0, 0, 0))
    //    → CameraManager (caméra, orbit, vues, suivi joueur).
    this.cameraManager = new CameraManager({
      width,
      height,
      ecsWorld: this.ecsWorld,
      characterSystem: this.physicsManager.characterSystem,
      getSelectedObject: () => this.selection.getSelectedObject(),
      getDefaultTargetY: () => this.workPlaneConfig.height + 0.8,
    });
    this.physicsManager.characterSystem.setCamera(this.camera);

    // 3. Renderer + Post-Processing (RenderPass + Bloom + FXAA) → RenderPipeline.
    this.renderPipeline = new RenderPipeline({
      container: this.container,
      scene: this.scene,
      camera: this.camera,
      objects: this.objects,
      toonMaterialSystem: this.toonMaterialSystem,
    });
    const canvas = this.renderPipeline.getCanvas();

    // Gameplay input wiring: mouse-look target + click-to-lock pointer (Yaw)
    this.physicsManager.characterSystem.setMouseLookTarget(canvas);

    // 4. OrbitControls (créés une fois le canvas du RenderPipeline disponible)
    this.cameraManager.attachControls(canvas);

    // Poignée de débogage : uniquement en dev, jamais dans le bundle public.
    // Permet d'inspecter caméra / navigation depuis la console ou un test E2E.
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      (window as unknown as { __aether?: unknown }).__aether = this;
    }

    // 5. Sélection + TransformControls → SelectionManager.
    this.selection = new SelectionManager({
      scene: this.scene,
      camera: this.camera,
      domElement: canvas,
      objects: this.objects,
      ecsWorld: this.ecsWorld,
      events: this.events,
      toSceneNode: (obj) => this.toSceneNode(obj),
      isPlaying: () => this.playMode.isPlaying,
      setOrbitEnabled: (enabled) => this.cameraManager.setOrbitEnabled(enabled),
      onHistoryCheckpoint: () => this.history.saveHistoryState(),
      onGizmoChanged: (obj) => this.handleGizmoChanged(obj),
      onClickedEntity: (entityId) => {
        // Tier 3.1 : script onClick + graphe OnClick
        this.logicExecutor.handleEntityClick(entityId);
      },
    });

    // 6. Environment Helpers & Lights (Ambient 1.5 + Directional (5, 10, 7) 2.0)
    this.setupEnvironment();

    // 6b. Asset Pipeline → registry centralisée, LOD, streaming, bundles.
    // (méthodes async-internes : utilisable immédiatement, sans await)
    this.assetStore = new AssetStore();
    this.assetDatabase = new AssetDatabase(this.assetStore);
    this.lodManager = new LODManager({ store: this.assetStore, objects: this.objects });
    this.occlusionManager = new OcclusionCullingManager({ objects: this.objects });
    this.occlusionManager.onOcclusionChange = (uuid, occluded) => this.applyOcclusion(uuid, occluded);
    this.impostorManager = new ImpostorManager({
      objects: this.objects,
      scene: this.scene,
      getLastLodDistance: (uuid) => this.lodManager.getLastMaxDistance(uuid),
      isOccluded: (uuid) => this.occlusionManager.isOccluded(uuid),
    });
    this.spawnManager = new SpawnManager({ objects: this.objects });
    this.textureStreamer = new TextureStreamer({ store: this.assetStore, db: this.assetDatabase });
    this.bundleManager = new AssetBundleManager({ store: this.assetStore, db: this.assetDatabase });
    GeometryPipeline.preload();

    // 5b2. Debug → profiler (toujours actif, coût ~ns), rendu debug physique
    // (visible sur demande, Play uniquement) et moniteur mémoire (sur demande).
    this.frameProfiler = new FrameProfiler();
    this.physicsDebug = new PhysicsDebugRenderer(this.scene);
    this.memoryMonitor = new MemoryMonitor();

    // 6c. Historique + autosave → HistoryManager (sélection déjà prête).
    this.history = new HistoryManager({
      scene: {
        exportScene: () => this.exportScene(),
        importScene: (data) => this.importScene(data),
        clearUserScene: () => this.clearUserScene(),
        seedInitialScene: () => this.seedInitialScene(),
        notifyHierarchy: () => this.notifyHierarchy(),
      },
      selection: this.selection,
      isPlaying: () => this.playMode.isPlaying,
    });

    // 6c. Play/Stop → PlayModeManager.
    this.playMode = new PlayModeManager({
      physicsManager: this.physicsManager,
      logicExecutor: this.logicExecutor,
      animationManager: this.animationManager,
      events: this.events,
      selection: this.selection,
      camera: this.cameraManager,
      onPlayStarted: () => {
        this.warnedMissingClips.clear();
        this.rigDiagLogged.clear();
        // Modèles enterrés (sculpt du terrain, vieux imports) → reposés au sol.
        try {
          this.groundSunkenModels();
        } catch {
          /* ignore */
        }
        // 4.4 : écrans UI visibles au Play + variables initiales.
        try {
          this.guiManager.syncScreens(this.hudConfig.screens ?? []);
          this.guiManager.syncVariables(this.hudConfig.variables ?? {});
          this.guiManager.showOnPlayScreens();
        } catch {
          /* UI indisponible */
        }
        // Snapshot mémoire : le panneau profiler comparera play-start → play-stop.
        try {
          this.memoryMonitor.snapshot(this.scene, this.renderPipeline.getRenderer(), 'play-start');
        } catch {
          /* monitor indisponible */
        }
      },
      onPlayStopped: () => {
        try {
          this.memoryMonitor.snapshot(this.scene, this.renderPipeline.getRenderer(), 'play-stop');
        } catch {
          /* monitor indisponible */
        }
      },
    });
    this.playMode.attachCanvas(canvas);

    // 7. Initial Demo Objects (ou restauration de l'autosave) → HistoryManager.
    this.history.restoreOrSeed();

    // 8. Event Listeners
    this.bindEvents();

    // 9. Start Loop
    this.animate();

    // Notify initial hierarchy
    this.notifyHierarchy();

    // Seed the initial history state
    this.saveHistoryState();
  }

  /**
   * Sync eau + event UI après une modification au gizmo (via SelectionManager).
   */
  private handleGizmoChanged(obj: THREE.Object3D): void {
    if (this.waterManager && obj === this.waterManager.waterMesh) {
      this.waterManager.config.waterLevel = obj.position.y;
    }
    const node = this.toSceneNode(obj);
    this.events.onTransformChange(node);
  }

  private setupEnvironment(): void {
    // 1. Build the high-contrast 3D Work Plane Group (Plan de travail 3D)
    this.createWorkPlane();

    // 2. Ambient Light (Intensité 1.5)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.ambientLight.name = '__AETHER_AMBIENT_LIGHT__';
    this.scene.add(this.ambientLight);

    // 3. Primary Directional Light (Position x: 5, y: 10, z: 7, Intensité 2.0)
    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.dirLight.position.set(5, 10, 7);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.camera.left = -15;
    this.dirLight.shadow.camera.right = 15;
    this.dirLight.shadow.camera.top = 15;
    this.dirLight.shadow.camera.bottom = -15;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.radius = 2.5;
    this.dirLight.name = 'Directional Sun Light';
    this.scene.add(this.dirLight);

    // 4. Rim light for depth
    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    this.rimLight.position.set(-6, 6, -6);
    this.rimLight.name = '__AETHER_RIM_LIGHT__';
    this.scene.add(this.rimLight);

    // 5. Initialize Atmosphere Manager
    this.atmosphereManager = new AtmosphereManager(
      this.scene,
      this.camera,
      this.renderPipeline.getRenderer(),
      this.dirLight,
      this.ambientLight
    );

    // 5b. Initialize Water & Ocean Gerstner Wave System
    this.waterManager = new WaterManager(this.scene, this.atmosphereManager.atmosphere.water);
    this.syncWaterMeshRegistration();

    // 6. Initialize Procedural Terrain Generator (hidden when disabled so work plane is pristine)
    this.terrainGenerator = new TerrainGenerator();
    this.terrainGenerator.mesh.visible = this.terrainGenerator.config.enabled;
    this.scene.add(this.terrainGenerator.mesh);
    this.terrainGenerator.details.group.visible = this.terrainGenerator.config.enabled;
    this.scene.add(this.terrainGenerator.details.group);
    this.physicsManager.setTerrainGenerator(this.terrainGenerator);

    // 7. Initialize Foliage & Rocks Instanced Painter
    this.foliagePainter = new FoliagePainter(this.scene);
    // 7b. Charge la palette low-poly (public/assets/LOW_POLY_set.glb) puis les
    //     bibliothèques annexes — rejet piégé : la promesse résout toujours.
    this.foliageLibraryPromise = (async () => {
      const entries: FoliageLibraryEntry[] = [];
      try {
        entries.push(
          ...(await this.foliagePainter.loadLibrary('/assets/LOW_POLY_set.glb', this.gltfLoader, {
            replaySavedLayers: false,
          }))
        );
      } catch (err) {
        console.warn('[Aether] Bibliotheque LOW_POLY_set.glb indisponible :', err);
      }

      for (const lib of EXTRA_MODEL_LIBRARIES) {
        try {
          entries.push(
            ...(await this.foliagePainter.loadLibrary(lib.url, this.gltfLoader, {
              importScale: lib.importScale,
              replaySavedLayers: false,
            }))
          );
        } catch (err) {
          console.warn(`[Aether] Bibliotheque ${lib.url} indisponible :`, err);
        }
      }

      // Les calques peints sauvegardés ne sont rejoués qu'une fois tout chargé.
      this.foliagePainter.flushPendingSavedLayers();
      return sortFoliageEntries(entries);
    })();

    // 8. Initialize Particle Emitters & VFX Manager
    this.particleManager = new ParticleManager(this.scene);
    this.logicExecutor.particleManager = this.particleManager;

    // 8b. Initialize Environmental Physics (Wind, Fire, Water Buoyancy & Rain physics)
    const envPhysics = new EnvironmentalPhysicsManager(this.ecsWorld, this.scene);
    envPhysics.particleManager = this.particleManager;
    envPhysics.waterManager = this.waterManager;
    // Impacts de surface : éclaboussures (eau) + impacts au sol (pluie).
    envPhysics.surfaceImpactFX = new SurfaceImpactFX(this.scene);
    // Source de hauteur du sol pour les impacts de pluie : terrain procédural
    // s'il est actif, sinon le plan de travail. Sans cela la pluie traverse
    // le sol au lieu de s'y écraser.
    envPhysics.groundHeightAt = (x, z) => {
      const terrain = this.terrainGenerator;
      if (terrain?.mesh && terrain.config.enabled && terrain.mesh.visible) {
        return terrain.getHeightAt(x, z);
      }
      return this.workPlaneConfig.height;
    };
    this.physicsManager.environmentalPhysics = envPhysics;
    this.logicExecutor.environmentalPhysics = envPhysics;

    // 9. Initialize Keyframe & Kinematic Animation Manager
    this.animationManager = new AnimationManager(this.scene);
    this.logicExecutor.animationManager = this.animationManager;

    // 4.4 — UI moteur in-game (overlay WebGL, variables, actions).
    this.guiManager = new GameUIManager({
      getSize: () => {
        const c = this.renderPipeline.getCanvas();
        return { w: Math.max(1, c.clientWidth || 1), h: Math.max(1, c.clientHeight || 1) };
      },
      getPixelRatio: () => this.renderPipeline.getRenderer().getPixelRatio(),
      onAction: (action, screenId, nodeId) => this.handleUIAction(action, screenId, nodeId),
    });
    this.guiManager.syncScreens(this.hudConfig.screens ?? []);
    this.guiManager.syncVariables(this.hudConfig.variables ?? {});

    // 4.2 — Animator Controller (prend le pas sur le blend tree Rig auto).
    this.animatorSystem = new AnimatorSystem({
      objects: this.objects,
      animationManager: this.animationManager,
      getMixer: (uuid) => this.getAnimatorMixer(uuid),
      getClips: (uuid) => this.getAnimatorClips(uuid),
      readAutoParams: (uuid, measuredSpeed) => this.readAnimatorAutoParams(uuid, measuredSpeed),
      onEvent: (payload) => this.handleAnimatorEvent(payload),
    });

    // 9. Brush Projection Ring Marker
    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    });
    this.brushMarkerMesh = new THREE.Mesh(ringGeo, ringMat);
    this.brushMarkerMesh.name = '__AETHER_BRUSH_MARKER__';
    this.brushMarkerMesh.visible = false;
    this.brushMarkerMesh.renderOrder = 999;
    this.scene.add(this.brushMarkerMesh);
  }

  /**
   * Builds the dual-frequency high precision 3D Work Plane (Plan de travail)
   */
  public createWorkPlane(): void {
    if (this.workPlaneGroup) {
      this.scene.remove(this.workPlaneGroup);
    }

    this.workPlaneGroup = new THREE.Group();
    this.workPlaneGroup.name = '__AETHER_WORK_PLANE_GROUP__';
    this.workPlaneGroup.position.y = this.workPlaneConfig.height;

    const size = this.workPlaneConfig.gridSize || 40;
    const divisions = this.workPlaneConfig.gridDivisions || 40;
    const majorDivisions = Math.max(4, Math.floor(divisions / 5));

    // A. Major Subdivision Grid (Thicker Cyan Accent lines)
    this.majorGridHelper = new THREE.GridHelper(size, majorDivisions, 0x38bdf8, 0x0284c7);
    this.majorGridHelper.name = '__AETHER_MAJOR_GRID__';
    const majorMat = this.majorGridHelper.material as THREE.Material;
    majorMat.transparent = true;
    majorMat.opacity = 0.6;
    majorMat.depthWrite = false;
    this.workPlaneGroup.add(this.majorGridHelper);

    // B. Minor Subdivision Grid (Fine Slate lines)
    this.minorGridHelper = new THREE.GridHelper(size, divisions, 0x334155, 0x1e293b);
    this.minorGridHelper.name = '__AETHER_MINOR_GRID__';
    const minorMat = this.minorGridHelper.material as THREE.Material;
    minorMat.transparent = true;
    minorMat.opacity = 0.4;
    minorMat.depthWrite = false;
    this.workPlaneGroup.add(this.minorGridHelper);

    // C. Floor Axis Lines & Origin Marker (Red for X, Blue for Z)
    this.axisLinesGroup = new THREE.Group();
    this.axisLinesGroup.name = '__AETHER_AXIS_LINES__';

    // X Axis line (Red)
    const xGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size / 2, 0.001, 0),
      new THREE.Vector3(size / 2, 0.001, 0),
    ]);
    const xMat = new THREE.LineBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const xLine = new THREE.Line(xGeo, xMat);
    this.axisLinesGroup.add(xLine);

    // Z Axis line (Blue)
    const zGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.001, -size / 2),
      new THREE.Vector3(0, 0.001, size / 2),
    ]);
    const zMat = new THREE.LineBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const zLine = new THREE.Line(zGeo, zMat);
    this.axisLinesGroup.add(zLine);

    // Center Origin Ring
    const originGeo = new THREE.RingGeometry(0.12, 0.18, 24);
    originGeo.rotateX(-Math.PI / 2);
    const originMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    const originMesh = new THREE.Mesh(originGeo, originMat);
    originMesh.position.y = 0.002;
    this.axisLinesGroup.add(originMesh);

    this.workPlaneGroup.add(this.axisLinesGroup);

    // D. Corner AxesHelper
    this.axesHelper = new THREE.AxesHelper(2.5);
    this.axesHelper.position.set(0, 0.005, 0);
    this.axesHelper.name = '__AETHER_AXES_HELPER__';
    this.workPlaneGroup.add(this.axesHelper);

    // E. Soft Floor Shadow Catcher Plane
    const shadowGeo = new THREE.PlaneGeometry(size * 2, size * 2);
    const shadowMat = new THREE.ShadowMaterial({
      opacity: 0.35,
      depthWrite: false,
    });
    this.floorShadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    this.floorShadowPlane.rotation.x = -Math.PI / 2;
    this.floorShadowPlane.position.y = -0.003;
    this.floorShadowPlane.receiveShadow = true;
    this.floorShadowPlane.name = '__AETHER_FLOOR_SHADOW__';
    this.workPlaneGroup.add(this.floorShadowPlane);

    // Apply visibility states
    this.applyWorkPlaneVisibility();

    this.scene.add(this.workPlaneGroup);
  }

  public applyWorkPlaneVisibility(): void {
    if (!this.workPlaneGroup) return;
    const cfg = this.workPlaneConfig;
    if (this.majorGridHelper) this.majorGridHelper.visible = cfg.gridVisible;
    if (this.minorGridHelper) this.minorGridHelper.visible = cfg.gridVisible;
    if (this.axisLinesGroup) this.axisLinesGroup.visible = cfg.axesVisible;
    if (this.axesHelper) this.axesHelper.visible = cfg.axesVisible;
    if (this.floorShadowPlane) this.floorShadowPlane.visible = cfg.shadowPlaneVisible;
    this.workPlaneGroup.position.y = cfg.height;
    this.groundPlane.constant = -cfg.height;
  }

  public setWorkPlaneConfig(config: Partial<WorkPlaneConfig>): void {
    const sizeChanged =
      (config.gridSize !== undefined && config.gridSize !== this.workPlaneConfig.gridSize) ||
      (config.gridDivisions !== undefined && config.gridDivisions !== this.workPlaneConfig.gridDivisions);

    this.workPlaneConfig = {
      ...this.workPlaneConfig,
      ...config,
    };

    if (config.snapUnit !== undefined) {
      this.selection.setTranslateSnapUnit(config.snapUnit);
    }

    if (sizeChanged) {
      this.createWorkPlane();
    } else {
      this.applyWorkPlaneVisibility();
    }
  }

  public toggleWorkPlaneGrid(): boolean {
    this.setWorkPlaneConfig({ gridVisible: !this.workPlaneConfig.gridVisible });
    return this.workPlaneConfig.gridVisible;
  }

  public toggleWorkPlaneAxes(): boolean {
    this.setWorkPlaneConfig({ axesVisible: !this.workPlaneConfig.axesVisible });
    return this.workPlaneConfig.axesVisible;
  }

  public toggleWorkPlaneShadow(): boolean {
    this.setWorkPlaneConfig({ shadowPlaneVisible: !this.workPlaneConfig.shadowPlaneVisible });
    return this.workPlaneConfig.shadowPlaneVisible;
  }

  public setWorkPlaneHeight(height: number): void {
    this.setWorkPlaneConfig({ height });
  }

  private seedInitialScene(): void {
    // 1. Center Hero Cube with Normal map texture preset
    const cubeGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.25,
      metalness: 0.3,
      emissive: new THREE.Color(0x001133),
      emissiveIntensity: 0.2,
    });
    // Add procedural carbon normal map
    const carbonNormal = TextureGenerator.getNormalMap('carbon');
    if (carbonNormal) {
      cubeMat.normalMap = carbonNormal;
      cubeMat.normalScale.set(0.6, 0.6);
    }
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.name = 'Main Cube';
    cube.position.set(0, 0.75, 0);
    cube.castShadow = true;
    cube.receiveShadow = true;
    // Dialogue d'accueil joué au lancement du Play (OnStart → ShowDialogue)
    const introStart = createGraphNode('OnStart', 80, 160);
    const introDialogue = createGraphNode('ShowDialogue', 340, 160, {
      speaker: 'Guide Aether',
      text: 'Bienvenue dans Aether ! Déplace-toi avec ZQSD/WASD, collecte les pièces dorées et appuie sur Échap pour revenir à l’éditeur.',
      duration: 7,
    });
    cube.userData = {
      subType: 'cube',
      initialY: 0.75,
      texturePreset: 'carbon',
      hasNormalMap: true,
      hasRoughnessMap: false,
      noPhysics: true,
      logic: {
        activeLevel: 'graph',
        cards: [],
        nodeGraph: {
          enabled: true,
          nodes: [introStart, introDialogue],
          connections: [
            {
              id: 'conn_seed_intro_dialogue',
              fromNodeId: introStart.id,
              fromSocketId: 'out_flow',
              toNodeId: introDialogue.id,
              toSocketId: 'in_flow',
            },
          ],
          variables: {},
        },
        customScript: { enabled: false, code: '' },
      },
    } as THREE.Object3D['userData'];
    this.registerObject(cube);

    // 2. Chrome/Glossy Sphere
    const sphereGeo = new THREE.SphereGeometry(0.85, 48, 48);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.12,
      metalness: 0.9,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.name = 'Chrome Sphere';
    sphere.position.set(-2.8, 0.85, 0.8);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.userData = { subType: 'sphere', initialY: 0.85, noPhysics: true };
    this.registerObject(sphere);

    // 3. Gold Torus Ring
    const torusGeo = new THREE.TorusGeometry(0.9, 0.25, 32, 64);
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.85,
    });
    const brushedNormal = TextureGenerator.getNormalMap('brushed');
    if (brushedNormal) {
      torusMat.normalMap = brushedNormal;
      torusMat.normalScale.set(0.7, 0.7);
    }
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.name = 'Torus Ring';
    torus.position.set(2.8, 1.1, -0.6);
    torus.rotation.x = Math.PI / 3;
    torus.castShadow = true;
    torus.receiveShadow = true;
    torus.userData = {
      subType: 'torus',
      initialY: 1.1,
      texturePreset: 'brushed',
      hasNormalMap: true,
      noPhysics: true,
    };
    this.registerObject(torus);

    // 4. Pedestal Base
    const planeGeo = new THREE.CylinderGeometry(4.5, 4.8, 0.15, 48);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.2,
    });
    const gridNormal = TextureGenerator.getNormalMap('grid');
    if (gridNormal) {
      planeMat.normalMap = gridNormal;
      planeMat.normalScale.set(0.4, 0.4);
    }
    const pedestal = new THREE.Mesh(planeGeo, planeMat);
    pedestal.name = 'Base Pedestal';
    pedestal.position.set(0, 0.075, 0);
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    pedestal.userData = { subType: 'cylinder', texturePreset: 'grid', hasNormalMap: true };
    this.registerObject(pedestal);

    // 5. Joueur (la scène démo est jouable immédiatement : WASD + clic souris)
    this.addPrimitive('player', { x: 0, y: 1.05, z: 3.4 }, { silent: true });

    // 6. Pièces à collecter (carte « Collectable » : score au contact du joueur)
    this.registerObject(this.createCollectibleCoin('Pièce 1', 0, 1.4, 1.4));
    this.registerObject(this.createCollectibleCoin('Pièce 2', -2.6, 1.4, -1.6));
    this.registerObject(this.createCollectibleCoin('Pièce 3', 3.4, 1.4, 1.6));

    // Select Main Cube by default
    this.selectObject(cube);
  }

  /** Pièce flottante prête à l'emploi : carte « Collectable » (score + son). */
  private createCollectibleCoin(name: string, x: number, y: number, z: number): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      metalness: 0.9,
      roughness: 0.2,
      emissive: new THREE.Color(0x6d4c07),
      emissiveIntensity: 0.5,
    });
    const coin = new THREE.Mesh(geo, mat);
    coin.name = name;
    coin.position.set(x, y, z);
    // Disque couché à la verticale : la rotation Y donne l'effet « pièce qui tourne ».
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    coin.userData = {
      subType: 'cylinder',
      noPhysics: true,
      logic: {
        activeLevel: 'cards',
        cards: [
          {
            id: `card_coin_${this.objects.size}_${name.replace(/\s+/g, '_').toLowerCase()}`,
            type: 'Collectable',
            enabled: true,
            config: {
              scoreValue: 10,
              respawnTime: 0,
              rotateSpeed: 120,
              hoverSpeed: 2.5,
              hoverAmplitude: 0.15,
              soundPreset: 'coin',
              targetTag: 'Player',
            },
          },
        ],
        nodeGraph: { enabled: false, nodes: [], connections: [], variables: {} },
        customScript: { enabled: false, code: '' },
      },
    } as THREE.Object3D['userData'];
    return coin;
  }

  /**
   * Mini-jeu prêt à jouer : sol, joueur, 8 pièces, 1 ennemi qui patrouille
   * et une zone victoire. Utilisé par l'écran d'accueil « Mini-jeu ».
   */
  public seedMiniGameScene(): void {
    this.clearUserScene();

    // Sol
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(40, 1, 40),
      new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.95, metalness: 0 })
    );
    ground.name = 'Ground';
    ground.position.set(0, -0.5, 0);
    ground.receiveShadow = true;
    ground.userData = { subType: 'cube' };
    this.registerObject(ground);

    // Joueur
    this.addPrimitive('player', { x: 0, y: 1.05, z: 8 }, { silent: true });

    // Couronne de pièces
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.registerObject(
        this.createCollectibleCoin(`Pièce ${i + 1}`, Math.cos(angle) * 6, 1.2, Math.sin(angle) * 6)
      );
    }

    // Ennemi : patrouille + dégâts au contact
    const enemy = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: new THREE.Color(0x7f1d1d),
        emissiveIntensity: 0.6,
        roughness: 0.4,
      })
    );
    enemy.name = 'Ennemi';
    enemy.position.set(0, 0.6, -4);
    enemy.castShadow = true;
    enemy.userData = {
      subType: 'sphere',
      noPhysics: true,
      logic: {
        activeLevel: 'cards',
        cards: [
          {
            id: 'card_enemy_patrol',
            type: 'Patrol',
            enabled: true,
            config: { speed: 2.5, distance: 8, axis: 'x', pingPong: true, waitTime: 0 },
          },
          {
            id: 'card_enemy_damage',
            type: 'DamageOnTouch',
            enabled: true,
            config: {
              damage: 25,
              knockbackForce: 8,
              cooldown: 1,
              damageEffect: true,
              soundPreset: 'hit',
            },
          },
        ],
        nodeGraph: { enabled: false, nodes: [], connections: [], variables: {} },
        customScript: { enabled: false, code: '' },
      },
    } as THREE.Object3D['userData'];
    this.registerObject(enemy);

    // Zone victoire
    const zone = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, 3),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, wireframe: true, transparent: true, opacity: 0.6 })
    );
    zone.name = 'Zone Victoire';
    zone.position.set(0, 1.5, 0);
    zone.userData = {
      subType: 'triggerVolume',
      noPhysics: true,
      logic: {
        activeLevel: 'cards',
        cards: [
          {
            id: 'card_zone_victory',
            type: 'TriggerVolume',
            enabled: true,
            config: {
              shape: 'box',
              size: { x: 3, y: 3, z: 3 },
              radius: 2,
              triggerOn: 'Player',
              actionType: 'checkpoint',
              checkpointName: 'Victoire',
              soundPreset: 'chime',
              repeatable: false,
              cooldown: 1.0,
              visualFeedback: true,
              triggerMessage: 'Victoire ! Vous avez terminé le parcours.',
            },
          },
        ],
        nodeGraph: { enabled: false, nodes: [], connections: [], variables: {} },
        customScript: { enabled: false, code: '' },
      },
    } as THREE.Object3D['userData'];
    this.registerObject(zone);

    this.selectObject(ground);
    this.notifyHierarchy();
    this.saveHistoryState();
  }

  public registerObject(obj: THREE.Object3D): void {
    this.objects.set(obj.uuid, obj);
    this.scene.add(obj);
    this.registerExisting(obj);
  }

  /**
   * Enregistre un objet DÉJÀ parenté (enfant de groupe, clone de sous-arbre...)
   * sans toucher à son parent : même pipeline que registerObject moins scene.add.
   */
  private registerExisting(obj: THREE.Object3D): void {
    this.objects.set(obj.uuid, obj);

    this.renderPipeline.trackObjectMaterials(obj);

    // Asset Pipeline : rattache l'objet à son asset modèle (refcount idempotent
    // par uuid — restaure/import/duplicata ne double-comptent jamais).
    const modelStorageId = (obj.userData?.modelInfo as ModelInfo | undefined)?.storageId;
    if (modelStorageId) {
      void this.assetDatabase.acquire(modelStorageId, obj.uuid).catch(() => {});
    }

    // Synchronize ECS Entity & Components
    const entity = this.ecsWorld.createEntity(obj.uuid, obj.name, obj);

    // 1. TransformComponent
    const transformComp = new TransformComponent();
    transformComp.syncFromObject3D(obj);
    entity.addComponent(transformComp);

    // 2. Visual Mesh or Light Component
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
      entity.addComponent(new MeshComponent(obj));
    } else if (obj instanceof THREE.Light) {
      entity.addComponent(new LightComponent(obj));
    }

    // 3. Physics Components
    const physicsData = obj.userData?.physics as PhysicsNodeData | undefined;
    if (physicsData) {
      if (physicsData.rigidbody) {
        entity.addComponent(new RigidbodyComponent(physicsData.rigidbody));
      }
      if (physicsData.collider) {
        entity.addComponent(new ColliderComponent(physicsData.collider));
      }
      if (physicsData.characterController) {
        entity.addComponent(new CharacterControllerComponent(physicsData.characterController));
      }
    } else {
      assignDefaultPhysics(obj, entity);
    }
  }

  /**
   * Updates Physics configuration from the UI Inspector
   */
  public updatePhysics(id: string, physicsData: Partial<PhysicsNodeData>): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    obj.userData = obj.userData || {};
    obj.userData.physics = {
      ...(obj.userData.physics || {}),
      ...physicsData,
    };

    const entity = this.ecsWorld.getEntity(id);
    if (entity) {
      if (physicsData.rigidbody !== undefined) {
        entity.removeComponent('Rigidbody');
        if (physicsData.rigidbody.enabled) {
          entity.addComponent(new RigidbodyComponent(physicsData.rigidbody));
        }
      }
      if (physicsData.collider !== undefined) {
        entity.removeComponent('Collider');
        entity.addComponent(new ColliderComponent(physicsData.collider));
      }
      if (physicsData.characterController !== undefined) {
        entity.removeComponent('CharacterController');
        if (physicsData.characterController.enabled) {
          entity.addComponent(
            new CharacterControllerComponent(physicsData.characterController)
          );
        }
      }
    }

    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  /**
   * Updates 3-tier Logic configuration (Behavior Cards, Node Graph, Custom Script)
   */
  public updateLogic(id: string, logicData: Partial<EntityLogicData>): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    obj.userData = obj.userData || {};
    obj.userData.logic = {
      ...(obj.userData.logic || {}),
      ...logicData,
    };

    // Tier 3.1 : hot reload du script custom pendant Play
    if (this.isPlaying && logicData.customScript !== undefined) {
      const merged = obj.userData.logic as EntityLogicData | undefined;
      if (merged?.customScript?.breakpoints) {
        ScriptDebugger.setBreakpoints(id, merged.customScript.breakpoints);
      }
      this.logicExecutor.reloadScript(id);
    }

    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  /**
   * Retire un composant d'un objet (Add/Remove Component, logique userData
   * lue en direct par les systèmes + composants ECS synchronisés).
   */
  public removeNodeComponent(
    id: string,
    kind:
      | 'rigidbody'
      | 'collider'
      | 'characterController'
      | 'vehicleController'
      | 'logic'
      | 'rigAnim'
      | 'particles'
  ): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    const entity = this.ecsWorld.getEntity(id);
    const ud = (obj.userData ?? {}) as Record<string, any>;
    obj.userData = ud;

    switch (kind) {
      case 'rigidbody':
        if (ud.physics) delete (ud.physics as Record<string, unknown>).rigidbody;
        entity?.removeComponent('Rigidbody');
        break;
      case 'collider':
        if (ud.physics) delete (ud.physics as Record<string, unknown>).collider;
        entity?.removeComponent('Collider');
        break;
      case 'characterController':
        if (ud.physics) delete (ud.physics as Record<string, unknown>).characterController;
        entity?.removeComponent('CharacterController');
        break;
      case 'vehicleController':
        // userData-driven (VehicleControllerSystem lit userData.physics en direct).
        if (ud.physics) delete (ud.physics as Record<string, unknown>).vehicleController;
        break;
      case 'logic':
        // userData-driven (LogicExecutor lit userData.logic en direct).
        delete ud.logic;
        break;
      case 'rigAnim':
        delete ud.rigAnim;
        entity?.removeComponent('RigAnim');
        break;
      case 'particles': {
        // Stoppe l'émetteur, jette les Points, reconvertit en groupe vide.
        // Garde-fou : ne retag que si c'était bien un émetteur.
        const wasParticles = ud.subType === 'particles';
        const emitterId = ud.emitterId as string | undefined;
        if (emitterId && this.particleManager) {
          try {
            this.particleManager.stopEmitter(emitterId);
          } catch {
            /* ignore */
          }
        }
        for (const child of [...obj.children]) {
          if (child instanceof THREE.Points) {
            obj.remove(child);
            child.geometry?.dispose();
            const mat = child.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat?.dispose();
          }
        }
        delete ud.particles;
        delete ud.emitterId;
        if (wasParticles) ud.subType = 'group';
        break;
      }
    }

    // Nettoie le conteneur physics vide (évite `{}` fantôme dans l'export).
    if (ud.physics && typeof ud.physics === 'object' && Object.keys(ud.physics).length === 0) {
      delete ud.physics;
    }

    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  /**
 * Handlers du canvas nommés, et non closures inline dans `bindEvents`.
 *
 * Une closure anonyme est introuvable au `dispose()` : les trois écouteurs
 * pointer restaient donc liés au canvas après le démontage du composant. Le
 * canvas étant alors détaché du document, ils ne fuient pas la page, mais ils
 * restent atteignables et se ré-accumulent à chaque remontage (React
 * StrictMode en monte deux, le HMR en empile) — chacun gardant le SceneManager
 * corresponding en vie.
 */
private onCanvasPointerDown = (e: PointerEvent): void => {
    const dom = this.renderPipeline.getCanvas();
    if (this.selection.isDraggingTransform) return;

    // 4.4 : UI moteur d'abord (boutons cliquables, menus modaux bloquants).
    if (this.isPlaying && this.guiManager.anyInteractive()) {
      try {
        if (this.guiManager.handleDown(e, dom.getBoundingClientRect())) return;
      } catch {
        /* ignore */
      }
    }

    this.selection.recordPointerDown(e.clientX, e.clientY);

    if (this.isPlaying) {
      this.cameraManager.beginPlayRotate(e.clientX, e.clientY);
      return;
    }

    if (this.terrainBrush.mode !== 'none' && e.button === 0) {
      this.isSculptingBrush = true;
      this.cameraManager.setOrbitEnabled(false);
      this.applyTerrainBrush(e);
      return;
    }

    // 2D drag-selection box trigger checks
    if (this.terrainBrush.mode === 'none' && !this.selection.isGizmoHovered() && e.button === 0) {
      this.foliagePickConsumed = false;

      // Mode Sélection : picking d'une instance foliage peinte avant la
      // sélection scène. Un clic (sans Shift) sur un objet peint est avalé.
      if (!e.shiftKey && this.tryPickFoliage(e)) return;

      const hitObject = this.selection.raycastObjects(e);
      if (e.shiftKey || !hitObject) {
        this.selection.beginDragSelect(e.clientX, e.clientY);
      }
    }
  };

private onCanvasPointerMove = (e: PointerEvent): void => {
    if (this.selection.isDraggingTransform) return;

    // 4.4 : survol des boutons UI (jamais consommé, la caméra continue).
    if (this.isPlaying && this.guiManager.anyInteractive()) {
      try {
        this.guiManager.handleMove(e, this.renderPipeline.getCanvas().getBoundingClientRect());
      } catch {
        /* ignore */
      }
    }

    if (this.selection.draggingBox) {
      this.selection.updateDragSelect(e.clientX, e.clientY);
      return;
    }

    if (this.isPlaying && this.cameraManager.isPlayRotating) {
      this.cameraManager.updatePlayRotate(e.clientX, e.clientY);
      return;
    }

    if (this.terrainBrush.mode !== 'none') {
      this.updateBrushMarker(e);
      if (this.isSculptingBrush) {
        this.applyTerrainBrush(e);
      }
    } else if (this.brushMarkerMesh) {
      this.brushMarkerMesh.visible = false;
    }
  };

private onCanvasPointerUp = (e: PointerEvent): void => {
    if (this.isPlaying) {
      this.cameraManager.endPlayRotate();
    }

    // 4.4 : clic UI (boutons) avant la sélection scène.
    if (this.isPlaying && this.guiManager.anyInteractive()) {
      try {
        if (this.guiManager.handleUp(e, this.renderPipeline.getCanvas().getBoundingClientRect())) {
          return;
        }
      } catch {
        /* ignore */
      }
    }

    if (this.selection.draggingBox) {
      this.selection.endDragSelect(e.shiftKey);
      return;
    }

    if (this.isSculptingBrush) {
      this.isSculptingBrush = false;
      if (this.terrainBrush.mode === 'none') {
        this.cameraManager.setOrbitEnabled(true);
      }
      // Save history state on completing terrain brush or foliage paint action
      this.saveHistoryState();
      return;
    }

    if (this.selection.isDraggingTransform) return;

    const pointerDown = this.selection.getPointerDown();
    const deltaX = Math.abs(e.clientX - pointerDown.x);
    const deltaY = Math.abs(e.clientY - pointerDown.y);

    if (deltaX < 5 && deltaY < 5) {
      // Flash du rayon de clic quand le debug physique est visible.
      this.physicsDebug.flashScreenRay(
        e.clientX,
        e.clientY,
        this.renderPipeline.getCanvas(),
        this.camera
      );
      if (this.foliagePickConsumed) {
        // Clic foliage déjà consommé au pointerdown : ne rien raycaster.
        this.foliagePickConsumed = false;
      } else {
        // Un clic scène (valide ou vide) remplace toute sélection foliage.
        this.clearFoliageSelection();
        this.selection.performRaycast(e);
      }
    }
  };

/** Retire les écouteurs posés par `bindEvents`. Appelé par `dispose()`. */
private unbindEvents(): void {
    const dom = this.renderPipeline.getCanvas();
    dom.removeEventListener('pointerdown', this.onCanvasPointerDown);
    dom.removeEventListener('pointermove', this.onCanvasPointerMove);
    dom.removeEventListener('pointerup', this.onCanvasPointerUp);
  }

private bindEvents(): void {
    const dom = this.renderPipeline.getCanvas();
    dom.addEventListener('pointerdown', this.onCanvasPointerDown);
    dom.addEventListener('pointermove', this.onCanvasPointerMove);
    dom.addEventListener('pointerup', this.onCanvasPointerUp);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private updateBrushMarker(e: PointerEvent): void {
    if (!this.terrainGenerator?.mesh || !this.brushMarkerMesh) return;

    const raycaster = this.selection.setRayFromScreen(e.clientX, e.clientY);
    const intersects = this.terrainGenerator.raycastTerrain(raycaster);

    if (intersects.length > 0) {
      const hit = intersects[0];
      this.brushMarkerMesh.position.copy(hit.point).add(new THREE.Vector3(0, 0.08, 0));
      const r = this.terrainBrush.radius;
      this.brushMarkerMesh.scale.set(r, r, r);
      this.brushMarkerMesh.visible = true;

      // Color code ring: green sculpt, blue foliage, violet layers, red erase, orange holes
      const mat = this.brushMarkerMesh.material as THREE.MeshBasicMaterial;
      if (this.terrainBrush.mode === 'foliage_erase' || this.terrainBrush.mode === 'detail_erase' || this.terrainBrush.mode === 'hole_erase') {
        mat.color.set(0xf43f5e);
      } else if (this.terrainBrush.mode === 'foliage_paint' || this.terrainBrush.mode === 'detail_paint') {
        mat.color.set(0x38bdf8);
      } else if (this.terrainBrush.mode === 'layer_paint') {
        mat.color.set(0xc084fc);
      } else if (this.terrainBrush.mode === 'hole_paint') {
        mat.color.set(0xfb923c);
      } else {
        mat.color.set(0x10b981);
      }
    } else {
      this.brushMarkerMesh.visible = false;
    }
  }

  private applyTerrainBrush(e: PointerEvent): void {
    if (!this.terrainGenerator?.mesh) return;

    const raycaster = this.selection.setRayFromScreen(e.clientX, e.clientY);
    const intersects = this.terrainGenerator.raycastTerrain(raycaster);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const point = hit.point;
      const b = this.terrainBrush;

      if (b.mode === 'raise' || b.mode === 'lower' || b.mode === 'smooth' || b.mode === 'flatten') {
        this.terrainGenerator.sculptAt(point, b.mode, b.radius, b.strength, b.flattenHeight);
        this.foliagePainter.adjustFoliageHeights(this.terrainGenerator);
      } else if (
        b.mode === 'paint_grass' ||
        b.mode === 'paint_rock' ||
        b.mode === 'paint_sand' ||
        b.mode === 'paint_snow' ||
        b.mode === 'layer_paint'
      ) {
        // 4.3 : peinture de couches splat (les presets legacy mappent aux couches).
        const layer =
          b.mode === 'paint_grass' ? 0
          : b.mode === 'paint_rock' ? 1
          : b.mode === 'paint_sand' ? 2
          : b.mode === 'paint_snow' ? 3
          : Math.max(0, Math.min(3, b.selectedLayer ?? 0));
        this.terrainGenerator.paintLayerAt(point, layer, b.radius, b.strength);
      } else if (b.mode === 'hole_paint') {
        this.terrainGenerator.paintHoleAt(point, b.radius);
        this.foliagePainter.eraseAt(point, b.radius);
      } else if (b.mode === 'hole_erase') {
        this.terrainGenerator.eraseHoleAt(point, b.radius);
      } else if (b.mode === 'detail_paint') {
        this.terrainGenerator.paintDetailAt(point, b.selectedDetail ?? 'grass', true, b.radius, b.detailDensity ?? 4);
      } else if (b.mode === 'detail_erase') {
        this.terrainGenerator.paintDetailAt(point, b.selectedDetail ?? 'grass', false, b.radius, b.detailDensity ?? 4);
      } else if (b.mode === 'foliage_paint') {
        this.foliagePainter.paintAt(
          point,
          b.selectedFoliage,
          b.radius,
          b.foliageDensity,
          b.foliageScaleMin,
          b.foliageScaleMax,
          hit.face?.normal
        );
      } else if (b.mode === 'foliage_erase') {
        this.foliagePainter.eraseAt(point, b.radius);
      }
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'w':
        this.setGizmoMode('translate');
        break;
      case 'e':
        this.setGizmoMode('rotate');
        break;
      case 'r':
        if (this.isPlaying) {
          this.togglePlayerRagdoll();
        } else {
          this.setGizmoMode('scale');
        }
        break;
      case 'escape':
        if (this.foliageSelection) {
          this.clearFoliageSelection();
        } else {
          this.deselect();
        }
        break;
      case 'delete':
      case 'backspace':
        if (this.foliageSelection) {
          this.deleteSelectedFoliage();
        } else if (this.selectedObject) {
          this.deleteObject(this.selectedObject.uuid);
        }
        break;
      case 'f':
        this.focusOnObject();
        break;
      case ' ':
        // En mode Jeu, Espace = saut (CharacterControllerSystem) : ne jamais
        // couper la simulation depuis ce raccourci. Depuis l'éditeur, Espace
        // lance/arrête le Play.
        if (this.isPlaying) break;
        e.preventDefault();
        this.togglePlayMode();
        break;
    }
  };

  /**
   * Calculates world coordinates of the mouse on the active 3D work plane or terrain
   */
  public getGroundIntersection(clientX: number, clientY: number): THREE.Vector3 {
    const raycaster = this.selection.setRayFromScreen(clientX, clientY);

    // If procedural terrain is enabled and visible, raycast directly onto terrain heightmap
    if (
      this.terrainGenerator?.mesh &&
      this.terrainGenerator.config.enabled &&
      this.terrainGenerator.mesh.visible
    ) {
      const terrainHits = this.terrainGenerator.raycastTerrain(raycaster);
      if (terrainHits.length > 0) {
        const hitPos = terrainHits[0].point.clone();
        if (this.selection.isSnappingEnabled && this.selection.getSnapSettings().mode === 'grid') {
          const s = this.selection.translateSnap || this.workPlaneConfig.snapUnit || 0.5;
          hitPos.x = Math.round(hitPos.x / s) * s;
          hitPos.z = Math.round(hitPos.z / s) * s;
        }
        return hitPos;
      }
    }

    // Default: Raycast on 3D Work Plane at Y = workPlaneConfig.height
    const target = new THREE.Vector3();
    const intersect = raycaster.ray.intersectPlane(this.groundPlane, target);

    if (intersect) {
      if (this.selection.isSnappingEnabled && this.selection.getSnapSettings().mode === 'grid') {
        const s = this.selection.translateSnap || this.workPlaneConfig.snapUnit || 0.5;
        intersect.x = Math.round(intersect.x / s) * s;
        intersect.z = Math.round(intersect.z / s) * s;
      }
      return intersect;
    }
    return new THREE.Vector3(0, this.workPlaneConfig.height, 0);
  }

  // --- Sélection (propriété du SelectionManager, délégués API-compatible) ---

  public selectObject(object: THREE.Object3D | null): void {
    this.selection.selectObject(object);
  }

  public selectById(id: string): void {
    this.selection.selectById(id);
  }

  public deselect(): void {
    this.selection.deselect();
  }

  public toggleMultiSelect(object: THREE.Object3D): void {
    this.selection.toggleMultiSelect(object);
  }

  /** Toggle de sélection par id (Ctrl+clic hiérarchie). */
  public toggleSelectById(id: string): void {
    const obj = this.objects.get(id);
    if (obj) this.selection.toggleMultiSelect(obj);
  }

  /** Sélectionne une liste d'ids (plage Shift+clic, enfants...). */
  public selectNodesByIds(ids: string[]): void {
    this.selection.restoreSelection(ids);
  }

  /** Sélectionne un objet et tout son sous-arbre enregistré. */
  public selectSubtree(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    const ids = [id];
    const walk = (o: THREE.Object3D): void => {
      for (const child of o.children) {
        if (this.objects.has(child.uuid)) {
          ids.push(child.uuid);
          walk(child);
        }
      }
    };
    walk(obj);
    this.selection.restoreSelection(ids);
  }

  // --- Historique + autosave (propriété du HistoryManager) ---

  public saveHistoryState(label?: string): void {
    this.history.saveHistoryState(label);
    // 5.2 : toute mutation locale alimente la session collaborative.
    try {
      this.collabManager?.notifyLocalMutation();
    } catch {
      /* ignore */
    }
    // 5.3 : idem pour l'aperçu live.
    try {
      this.previewHost?.notifyChange();
    } catch {
      /* ignore */
    }
  }

  public scheduleAutosave(): void {
    this.history.scheduleAutosave();
  }

  public persistSceneNow(): void {
    this.history.persistSceneNow();
  }

  public hasAutosave(): boolean {
    return this.history.hasAutosave();
  }

  public clearAutosave(): void {
    this.history.clearAutosave();
  }

  public resetToSeedScene(): void {
    this.history.resetToSeedScene();
  }

  /** Annule la dernière action et retourne son libellé (null si rien à faire). */
  public undo(): string | null {
    const label = this.history.undo();
    if (label === null) return null;
    try {
      this.collabManager?.notifyLocalMutation();
    } catch {
      /* ignore */
    }
    try {
      this.previewHost?.notifyChange();
    } catch {
      /* ignore */
    }
    return label;
  }

  /** Rétablit l'action annulée et retourne son libellé (null si rien à faire). */
  public redo(): string | null {
    const label = this.history.redo();
    if (label === null) return null;
    try {
      this.collabManager?.notifyLocalMutation();
    } catch {
      /* ignore */
    }
    try {
      this.previewHost?.notifyChange();
    } catch {
      /* ignore */
    }
    return label;
  }

  public get canUndo(): boolean {
    return this.history.canUndo;
  }

  public get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** Libellé de la prochaine annulation (« Déplacer 3 objets »), ou null. */
  public getUndoLabel(): string | null {
    return this.history.getUndoLabel();
  }

  /** Libellé du prochain rétablissement, ou null. */
  public getRedoLabel(): string | null {
    return this.history.getRedoLabel();
  }

  /** État d'autosave pour l'indicateur de la Toolbar. */
  public getAutosaveInfo(): AutosaveInfo {
    return this.history.getAutosaveInfo();
  }

  /**
   * Instancie un prefab : hiérarchie préservée (parentId remappés), offset
   * appliqué aux RACINES uniquement (translation rigide du template),
   * modèles restaurés via leurs binaires (async), instances taggées
   * (prefabId/instanceId) pour Apply/Revert.
   */
  public instantiatePrefab(
    prefabNodes: any[],
    dropPos?: { x: number; y: number; z: number },
    opts?: { prefabId?: string; instanceId?: string }
  ): void {
    this.selection.dissolveMultiSelectGroup();
    this.deselect();

    const createdByTemplateId = new Map<string, THREE.Object3D>();
    const newRoots: THREE.Object3D[] = [];

    const templateIds = new Set(prefabNodes.map((n) => n.id));
    const isTemplateRoot = (n: any): boolean => !n.parentId || !templateIds.has(n.parentId);

    // 1. UUIDs frais (les ids template servent au remap parent).
    const processedNodes = prefabNodes.map((node) => {
      const copy = JSON.parse(JSON.stringify(node));
      copy.id = THREE.MathUtils.generateUUID();
      return copy;
    });

    // 2. Offset rigide calculé sur les RACINES du template uniquement.
    const rootNodes = processedNodes.filter((n) => isTemplateRoot(n));
    const bboxSource = rootNodes.length > 0 ? rootNodes : processedNodes;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    bboxSource.forEach((node) => {
      const pos = node.transform.position;
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.z < minZ) minZ = pos.z;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y > maxY) maxY = pos.y;
      if (pos.z > maxZ) maxZ = pos.z;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = minY; // keep pivot at base of prefab
    const centerZ = (minZ + maxZ) / 2;

    const targetX = dropPos ? dropPos.x : 0;
    const targetY = dropPos ? dropPos.y : 0;
    const targetZ = dropPos ? dropPos.z : 0;

    const offsetX = targetX - centerX;
    const offsetY = targetY - centerY;
    const offsetZ = targetZ - centerZ;

    const prefabId = opts?.prefabId;
    const instanceId =
      opts?.instanceId ?? (prefabId ? `inst-${THREE.MathUtils.generateUUID()}` : undefined);
    const tagPrefabInstance = (obj: THREE.Object3D): void => {
      if (!prefabId) return;
      obj.userData = obj.userData || {};
      (obj.userData as { prefabId?: string }).prefabId = prefabId;
      if (instanceId) {
        (obj.userData as { prefabInstanceId?: string }).prefabInstanceId = instanceId;
      }
    };

    const factoryTypes = ['player', 'navMeshAgent', 'vehicle', 'particles', 'triggerVolume', 'checkpoint', 'spawnPoint'];
    const asyncJobs: Promise<void>[] = [];

    // 3. Désérialise chaque nœud (parallèle aux originaux pour les ids template).
    prefabNodes.forEach((origNode, index) => {
      const item = processedNodes[index];
      const templateId = origNode.id;
      const isRoot = isTemplateRoot(origNode);
      const ox = isRoot ? offsetX : 0;
      const oy = isRoot ? offsetY : 0;
      const oz = isRoot ? offsetZ : 0;

      const trackCreated = (obj: THREE.Object3D | null): void => {
        if (!obj) return;
        if (templateId) createdByTemplateId.set(templateId, obj);
        tagPrefabInstance(obj);
        if (isRoot) newRoots.push(obj);
      };

      let created: THREE.Object3D | null = null;
      const subType = item.subType || 'cube';
      const isModel = item.modelInfo?.storageId && (item.type === 'mesh' || subType === 'model');
      const isFactory = item.type === 'group' && factoryTypes.includes(subType);

      if (isModel) {
        // Modèle : restauration async via le binaire (attache à complétion).
        asyncJobs.push(
          this.restorePrefabModelInstance(item, templateId, { x: ox, y: oy, z: oz }, createdByTemplateId, tagPrefabInstance).then(
            (obj) => {
              if (obj && isRoot) newRoots.push(obj);
            }
          )
        );
        return;
      }

      if (item.type === 'mesh' && subType === 'lowPoly') {
        // Bibliothèque low-poly : clone async depuis la palette GLB.
        asyncJobs.push(
          this.restorer.restoreLowPoly(item, {
            offset: { x: ox, y: oy, z: oz },
            onCreated: trackCreated,
          }).then(() => undefined)
        );
        return;
      }

      if (isFactory) {
        try {
          const node = this.addPrimitive(
            subType as 'player' | 'navMeshAgent' | 'vehicle' | 'particles' | 'triggerVolume' | 'checkpoint' | 'spawnPoint',
            { x: item.transform.position.x + ox, y: item.transform.position.y + oy, z: item.transform.position.z + oz },
            { silent: true }
          );
          const obj = this.objects.get(node.id);
          if (obj) {
            this.restorer.applyOverlay(obj, item);
            if (isRoot) {
              obj.position.x += ox;
              obj.position.y += oy;
              obj.position.z += oz;
            }
            created = obj;
          }
        } catch (err) {
          console.warn(`Prefab : factory '${item.name}' ignorée.`, err);
        }
        trackCreated(created);
        return;
      }

      if (item.type === 'group') {
        // Groupe / empty : conteneur avec transform + logique éventuelle.
        const group = new THREE.Group();
        group.userData = { subType: subType || 'group' };
        this.restorer.applyOverlay(group, item);
        if (isRoot) {
          group.position.x += ox;
          group.position.y += oy;
          group.position.z += oz;
        }
        this.registerObject(group);
        created = group;
        trackCreated(created);
        return;
      }

      if (item.type === 'mesh') {
        // Bibliothèque low-poly : géométrie CLONÉE depuis FoliagePainter (async,
        // la palette GLB peut encore charger au moment de l'import).
        if (subType === 'lowPoly') {
          void this.restorer.restoreLowPoly(item);
          return;
        }
        const mat = new THREE.MeshStandardMaterial({
          color: item.material?.color || '#3b82f6',
          roughness: item.material?.roughness ?? 0.35,
          metalness: item.material?.metalness ?? 0.2,
          wireframe: item.material?.wireframe ?? false,
          opacity: item.material?.opacity ?? 1,
          transparent: item.material?.transparent ?? false,
          emissive: new THREE.Color(item.material?.emissive || '#000000'),
          emissiveIntensity: item.material?.emissiveIntensity || 0,
        });

        if (item.material?.texturePreset && item.material.texturePreset !== 'none') {
          const normalTex = TextureGenerator.getNormalMap(item.material.texturePreset);
          if (normalTex) {
            mat.normalMap = normalTex;
            mat.normalScale.set(0.6, 0.6);
          }
        }

        let geo: THREE.BufferGeometry;
        switch (subType) {
          case 'sphere':
            geo = new THREE.SphereGeometry(0.9, 36, 36);
            break;
          case 'cylinder':
            geo = new THREE.CylinderGeometry(0.75, 0.75, 1.8, 36);
            break;
          case 'plane':
            geo = new THREE.PlaneGeometry(3, 3);
            break;
          case 'torus':
            geo = new THREE.TorusGeometry(0.8, 0.25, 24, 48);
            break;
          case 'cone':
            geo = new THREE.ConeGeometry(0.9, 1.8, 32);
            break;
          case 'postProcessVolume':
            geo = new THREE.BoxGeometry(8, 5, 8);
            break;
          case 'cube':
          default:
            geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
            break;
        }

        created = new THREE.Mesh(geo, mat);
        if (subType === 'postProcessVolume') {
          mat.color.set(item.material?.color || '#d946ef');
          mat.wireframe = item.material?.wireframe ?? true;
          mat.transparent = true;
          mat.opacity = item.material?.opacity ?? 0.55;
        }
        created.userData = { subType, texturePreset: item.material?.texturePreset };
      } else if (item.type === 'light') {
        if (subType === 'point') {
          const light = new THREE.PointLight(
            item.light?.color || 0x38bdf8,
            item.light?.intensity || 3.5,
            item.light?.distance || 18
          );
          light.add(new THREE.PointLightHelper(light, 0.3));
          created = light;
          created.userData = { subType: 'point' };
        } else {
          created = new THREE.DirectionalLight(
            item.light?.color || 0xffffff,
            item.light?.intensity || 2.0
          );
          created.userData = { subType: 'directional' };
        }
      }

      if (created) {
        created.name = item.name;
        // Offset rigide : racines uniquement (les enfants gardent leurs locales).
        created.position.set(
          item.transform.position.x + ox,
          item.transform.position.y + oy,
          item.transform.position.z + oz
        );
        created.rotation.set(
          THREE.MathUtils.degToRad(item.transform.rotation.x),
          THREE.MathUtils.degToRad(item.transform.rotation.y),
          THREE.MathUtils.degToRad(item.transform.rotation.z)
        );
        created.scale.set(
          item.transform.scale.x,
          item.transform.scale.y,
          item.transform.scale.z
        );
        created.visible = item.visible;
        created.castShadow = item.castShadow;
        created.receiveShadow = item.receiveShadow;

        if (item.physics) {
          created.userData = created.userData || {};
          created.userData.physics = JSON.parse(JSON.stringify(item.physics));
        }
        if (item.logic) {
          created.userData = created.userData || {};
          created.userData.logic = JSON.parse(JSON.stringify(item.logic));
        }
        if (item.modelInfo) {
          created.userData = created.userData || {};
          created.userData.modelInfo = item.modelInfo;
        }
        if (item.rigAnim) {
          created.userData = created.userData || {};
          created.userData.rigAnim = item.rigAnim;
        }

        this.registerObject(created);
        trackCreated(created);

        if (item.rigAnim) {
          this.setRigAnim(created.uuid, item.rigAnim);
        }

        // Restaure le rendu Toon & Contours du préfabriqué
        const toonIntensity = item.material?.toonIntensity;
        const outlineColor = item.material?.outlineColor;
        const outlineThickness = item.material?.outlineThickness;
        if (toonIntensity !== undefined || outlineColor !== undefined || outlineThickness !== undefined) {
          this.syncECSComponents(created.uuid, { toonIntensity, outlineColor, outlineThickness });
        }
      }
    });

    // 4. Passe 2 : rattache les parents (sync ; les modèles async suivent).
    prefabNodes.forEach((origNode) => {
      const child = origNode.id ? createdByTemplateId.get(origNode.id) : undefined;
      const parent = origNode.parentId ? createdByTemplateId.get(origNode.parentId) : undefined;
      if (!child || !parent || child === parent) return;
      if (this.isDescendantOf(child.uuid, parent.uuid)) return;
      parent.add(child);
    });

    // 5. Modèles async : attache + notify à complétion.
    if (asyncJobs.length > 0) {
      void Promise.all(asyncJobs).then(() => {
        prefabNodes.forEach((origNode) => {
          const child = origNode.id ? createdByTemplateId.get(origNode.id) : undefined;
          const parent = origNode.parentId ? createdByTemplateId.get(origNode.parentId) : undefined;
          if (!child || !parent || child === parent) return;
          if (this.isDescendantOf(child.uuid, parent.uuid)) return;
          parent.add(child);
        });
        this.notifyHierarchy();
        this.saveHistoryState();
      });
    }

    // 6. Sélectionne les racines créées en synchrone.
    if (newRoots.length === 1) {
      this.selectObject(newRoots[0]);
    } else if (newRoots.length > 1) {
      this.selection.setMultiSelection(newRoots, false);
    }

    this.notifyHierarchy();
    this.saveHistoryState();
  }

  /**
   * Restaure un modèle de prefab via son binaire (async). S'enregistre dans
   * `createdByTemplateId` pour la passe d'attache, tag prefab, overlay template.
   */
  private async restorePrefabModelInstance(
    item: any,
    templateId: string | undefined,
    rootOffset: { x: number; y: number; z: number },
    createdByTemplateId: Map<string, THREE.Object3D>,
    tagPrefabInstance: (obj: THREE.Object3D) => void
  ): Promise<THREE.Object3D | null> {
    try {
      const storageId = item.modelInfo?.storageId;
      if (!storageId) return null;
      const binary = await this.assetDatabase.getBinary(storageId);
      if (!binary) {
        console.warn(`Prefab : binaire introuvable pour '${item.name}'.`);
        return null;
      }
      const node = await this.importGLTF(binary, item.modelInfo?.originalName || item.name, {
        silent: true,
        storageId,
      });
      const obj = this.objects.get(node.id);
      if (!obj) return null;
      this.restorer.applyOverlay(obj, item);
      obj.position.x += rootOffset.x;
      obj.position.y += rootOffset.y;
      obj.position.z += rootOffset.z;
      tagPrefabInstance(obj);
      if (templateId) createdByTemplateId.set(templateId, obj);
      return obj;
    } catch (err) {
      console.warn(`Prefab : modèle '${item.name}' non restauré.`, err);
      return null;
    }
  }

  // --- Gizmo + rendu + Play (délégués aux modules) ---

  public setGizmoMode(mode: GizmoMode): void {
    this.selection.setGizmoMode(mode);
  }

  public setGizmoSpace(space: GizmoSpace): void {
    this.selection.setGizmoSpace(space);
  }

  public setSnapping(enabled: boolean, translateSnap?: number, rotateSnap?: number): void {
    this.selection.setSnapping(enabled, translateSnap, rotateSnap);
    const s = this.selection.getSnapSettings();
    if (translateSnap !== undefined) {
      this.workPlaneConfig = { ...this.workPlaneConfig, snapUnit: s.translateSnap };
      this.createWorkPlane();
    }
  }

  /** TIER 2.4 — patch partiel SnapSettings (mode, pas grille/rot/échelle…). */
  public setSnapSettings(partial: Partial<SnapSettings>): void {
    this.selection.setSnapSettings(partial);
    const s = this.selection.getSnapSettings();
    if (partial.translateSnap !== undefined && partial.translateSnap !== this.workPlaneConfig.snapUnit) {
      this.workPlaneConfig = { ...this.workPlaneConfig, snapUnit: s.translateSnap };
      this.createWorkPlane();
    }
  }

  public getSnapSettings(): SnapSettings {
    return this.selection.getSnapSettings();
  }

  public setRenderMode(mode: RenderMode): void {
    this.renderPipeline.setRenderMode(mode);
  }

  public togglePlayMode(): void {
    this.playMode.togglePlayMode();
  }

  public async setPlayMode(playing: boolean): Promise<void> {
    await this.playMode.setPlayMode(playing);
  }

  // Object addition with optional drop location
  public addPrimitive(
    type:
      | 'cube'
      | 'sphere'
      | 'cylinder'
      | 'plane'
      | 'torus'
      | 'cone'
      | 'player'
      | 'pointLight'
      | 'spotLight'
      | 'dirLight'
      | 'camera'
      | 'particles'
      | 'vehicle'
      | 'river'
      | 'triggerVolume'
      | 'navMeshAgent'
      | 'checkpoint'
      | 'spawnPoint'
      | 'postProcessVolume',
    dropPos?: { x: number; y: number; z: number },
    opts?: { silent?: boolean; preserveId?: string }
  ): SceneNode {
    if (type === 'river') {
      return this.addRiver({}, dropPos);
    }
    let newObject: THREE.Object3D;
    let name = 'Object';

    const defaultMaterial = () =>
      new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        roughness: 0.35,
        metalness: 0.15,
      });

    const posX = dropPos ? dropPos.x : 0;
    const posZ = dropPos ? dropPos.z : 0;

    switch (type) {
      case 'cube': {
        const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        newObject = new THREE.Mesh(geo, defaultMaterial());
        name = `Cube_${this.objects.size + 1}`;
        newObject.position.set(posX, 0.75, posZ);
        newObject.castShadow = true;
        newObject.receiveShadow = true;
        newObject.userData = { subType: 'cube' };
        break;
      }
      case 'sphere': {
        const geo = new THREE.SphereGeometry(0.9, 36, 36);
        newObject = new THREE.Mesh(geo, defaultMaterial());
        name = `Sphere_${this.objects.size + 1}`;
        newObject.position.set(posX, 0.9, posZ);
        newObject.castShadow = true;
        newObject.receiveShadow = true;
        newObject.userData = { subType: 'sphere' };
        break;
      }
      case 'cylinder': {
        const geo = new THREE.CylinderGeometry(0.75, 0.75, 1.8, 36);
        newObject = new THREE.Mesh(geo, defaultMaterial());
        name = `Cylinder_${this.objects.size + 1}`;
        newObject.position.set(posX, 0.9, posZ);
        newObject.castShadow = true;
        newObject.receiveShadow = true;
        newObject.userData = { subType: 'cylinder' };
        break;
      }
      case 'torus': {
        const geo = new THREE.TorusGeometry(0.8, 0.25, 24, 48);
        newObject = new THREE.Mesh(geo, defaultMaterial());
        name = `Torus_${this.objects.size + 1}`;
        newObject.position.set(posX, 1.0, posZ);
        newObject.castShadow = true;
        newObject.receiveShadow = true;
        newObject.userData = { subType: 'torus' };
        break;
      }
      case 'cone': {
        const geo = new THREE.ConeGeometry(0.9, 1.8, 32);
        newObject = new THREE.Mesh(geo, defaultMaterial());
        name = `Cone_${this.objects.size + 1}`;
        newObject.position.set(posX, 0.9, posZ);
        newObject.castShadow = true;
        newObject.receiveShadow = true;
        newObject.userData = { subType: 'cone' };
        break;
      }
      case 'plane': {
        const geo = new THREE.PlaneGeometry(3, 3);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x3f3f46,
          side: THREE.DoubleSide,
          roughness: 0.6,
        });
        newObject = new THREE.Mesh(geo, mat);
        name = `Plane_${this.objects.size + 1}`;
        newObject.rotation.x = -Math.PI / 2;
        newObject.position.set(posX, 0.05, posZ);
        newObject.receiveShadow = true;
        newObject.userData = { subType: 'plane' };
        break;
      }
      case 'pointLight': {
        const light = new THREE.PointLight(0x38bdf8, 3.5, 18);
        light.position.set(posX, 3.0, posZ);
        light.castShadow = true;
        const helper = new THREE.PointLightHelper(light, 0.3);
        light.add(helper);

        // Emissive Light Bulb Mesh
        const bulbMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 16, 16),
          new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x38bdf8,
            emissiveIntensity: 2.5,
            roughness: 0.1,
          })
        );
        bulbMesh.name = 'LightBulbMesh';
        light.add(bulbMesh);

        newObject = light;
        name = `PointLight_${this.objects.size + 1}`;
        newObject.userData = { subType: 'point' };
        break;
      }
      case 'spotLight': {
        const spot = new THREE.SpotLight(0xf59e0b, 5, 25, Math.PI / 4, 0.3);
        spot.position.set(posX, 4.0, posZ);
        spot.castShadow = true;
        const helper = new THREE.SpotLightHelper(spot);
        spot.add(helper);

        // Volumetric Cone Beam Mesh
        const coneGeo = new THREE.ConeGeometry(2.5, 7, 32, 1, true);
        coneGeo.translate(0, -3.5, 0);
        coneGeo.rotateX(-Math.PI / 2);
        const coneMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const volumetricCone = new THREE.Mesh(coneGeo, coneMat);
        volumetricCone.name = 'VolumetricLightCone';
        spot.add(volumetricCone);

        newObject = spot;
        name = `SpotLight_${this.objects.size + 1}`;
        newObject.userData = { subType: 'spot' };
        break;
      }
      case 'dirLight': {
        const dir = new THREE.DirectionalLight(0xe0e7ff, 2.0);
        dir.position.set(posX + 4, 6, posZ + 4);
        dir.castShadow = true;
        newObject = dir;
        name = `DirLight_${this.objects.size + 1}`;
        newObject.userData = { subType: 'directional' };
        break;
      }
      case 'camera': {
        // Target Camera dummy with visual helper
        const group = new THREE.Group();
        group.position.set(posX, 2.0, posZ);
        const camBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.4, 0.7),
          new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 })
        );
        camBox.castShadow = true;
        group.add(camBox);
        newObject = group;
        name = `Camera_${this.objects.size + 1}`;
        newObject.userData = { subType: 'camera' };
        break;
      }
      case 'player': {
        // Ready-to-play Character Controller Avatar
        const group = new THREE.Group();
        name = `Player_${this.objects.size + 1}`;

        // Capsule Body
        const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.0, 16, 32);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: 0x0284c7, // Sky Blue
          roughness: 0.25,
          metalness: 0.7,
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        bodyMesh.position.set(0, 0, 0);
        group.add(bodyMesh);

        // Cyber Visor
        const visorGeo = new THREE.BoxGeometry(0.52, 0.16, 0.28);
        const visorMat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: new THREE.Color(0x00f5ff),
          emissiveIntensity: 1.8,
          roughness: 0.1,
          metalness: 0.9,
        });
        const visorMesh = new THREE.Mesh(visorGeo, visorMat);
        visorMesh.position.set(0, 0.42, -0.28);
        group.add(visorMesh);

        group.position.set(posX, 1.05, posZ);
        group.userData = {
          subType: 'player',
          physics: {
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
              cameraDistance: 5.5,
            },
          },
        };
        newObject = group;
        break;
      }
      case 'particles': {
        const group = new THREE.Group();
        group.position.set(posX, 1.0, posZ);
        name = `Emitter_Fire_${this.objects.size + 1}`;
        const fireConfig = ParticleManager.getDefaultPresetConfig('fire');
        const emitterId = `sc_p_${Date.now()}`;

        group.userData = {
          subType: 'particles',
          particles: fireConfig,
          emitterId,
        };

        if (this.particleManager) {
          this.particleManager.createOrUpdateEmitter(emitterId, fireConfig, group.position, group);
        }

        newObject = group;
        break;
      }
      case 'vehicle': {
        newObject = createVehicleGroup(posX, posZ);
        name = `Voiture_3D_${this.objects.size + 1}`;
        break;
      }
      case 'triggerVolume': {
        const geo = new THREE.BoxGeometry(3, 3, 3);
        const mat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, wireframe: true, transparent: true, opacity: 0.6 });
        newObject = new THREE.Mesh(geo, mat);
        name = `TriggerVolume_${this.objects.size + 1}`;
        let posY = 1.5;
        if (this.terrainGenerator) posY = this.terrainGenerator.getHeightAt(posX, posZ) + 1.5;
        newObject.position.set(posX, posY, posZ);
        newObject.userData = {
          subType: 'triggerVolume',
          logic: {
            activeLevel: 'cards',
            cards: [
              {
                id: `card_${Date.now()}`,
                type: 'TriggerVolume',
                enabled: true,
                config: {
                  shape: 'box',
                  size: { x: 3, y: 3, z: 3 },
                  radius: 2,
                  triggerOn: 'Player',
                  actionType: 'checkpoint',
                  checkpointName: 'Checkpoint ' + (this.objects.size + 1),
                  soundPreset: 'chime',
                  repeatable: false,
                  cooldown: 1.0,
                  visualFeedback: true,
                  triggerMessage: 'Checkpoint Activé !',
                },
              },
            ],
            nodeGraph: { enabled: false, nodes: [], connections: [], variables: {} },
            customScript: { enabled: false, code: '' },
          },
        };
        break;
      }
      case 'postProcessVolume': {
        const geo = new THREE.BoxGeometry(8, 5, 8);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xd946ef,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
        });
        newObject = new THREE.Mesh(geo, mat);
        name = `PostProcessVolume_${this.objects.size + 1}`;
        let posY = 2.5;
        if (this.terrainGenerator) posY = this.terrainGenerator.getHeightAt(posX, posZ) + 2.5;
        newObject.position.set(posX, posY, posZ);
        newObject.userData = {
          subType: 'postProcessVolume',
          logic: {
            activeLevel: 'cards',
            cards: [
              {
                id: `card_${Date.now()}`,
                type: 'PostProcessVolume',
                enabled: true,
                config: {
                  shape: 'box',
                  size: { x: 8, y: 5, z: 8 },
                  blendRadius: 2.0,
                  priority: 0,
                  overrides: { exposure: 1.2, vignetteDarkness: 1.1 },
                },
              },
            ],
            nodeGraph: { enabled: false, nodes: [], connections: [], variables: {} },
            customScript: { enabled: false, code: '' },
          },
        };
        break;
      }
      case 'spawnPoint': {
        const group = new THREE.Group();
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 12);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xa3e635, emissive: 0x4d7c0f, emissiveIntensity: 0.9 });
        const poleMesh = new THREE.Mesh(poleGeo, poleMat);
        poleMesh.position.y = 1.1;
        group.add(poleMesh);

        const gemGeo = new THREE.OctahedronGeometry(0.35);
        const gemMat = new THREE.MeshStandardMaterial({ color: 0xd9f99d, emissive: 0xa3e635, emissiveIntensity: 1.2 });
        const gemMesh = new THREE.Mesh(gemGeo, gemMat);
        gemMesh.position.y = 2.5;
        group.add(gemMesh);

        const ringGeo = new THREE.TorusGeometry(0.9, 0.06, 10, 40);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xa3e635, transparent: true, opacity: 0.8 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.position.y = 0.05;
        group.add(ringMesh);

        name = `SpawnPoint_${this.objects.size + 1}`;
        let posY = 0;
        if (this.terrainGenerator) posY = this.terrainGenerator.getHeightAt(posX, posZ);
        group.position.set(posX, posY, posZ);
        group.userData = {
          subType: 'spawnPoint',
          spawnPoint: {
            name: name,
            yaw: 0,
            group: 'default',
          },
        };
        newObject = group;
        break;
      }
      case 'checkpoint': {
        const group = new THREE.Group();
        const baseGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.2, 32);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3, metalness: 0.8, emissive: 0x059669, emissiveIntensity: 0.4 });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        group.add(baseMesh);

        const pillarGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.8, 16);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x059669, emissiveIntensity: 0.8 });
        const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
        pillarMesh.position.y = 0.9;
        group.add(pillarMesh);

        name = `Checkpoint_${this.objects.size + 1}`;
        let posY = 0.1;
        if (this.terrainGenerator) posY = this.terrainGenerator.getHeightAt(posX, posZ) + 0.1;
        group.position.set(posX, posY, posZ);
        group.userData = {
          subType: 'checkpoint',
          logic: {
            activeLevel: 'cards',
            cards: [
              {
                id: `card_${Date.now()}`,
                type: 'TriggerVolume',
                enabled: true,
                config: {
                  shape: 'box',
                  size: { x: 2.5, y: 3, z: 2.5 },
                  radius: 1.8,
                  triggerOn: 'Player',
                  actionType: 'checkpoint',
                  checkpointName: 'Point de Réapparition ' + (this.objects.size + 1),
                  soundPreset: 'chime',
                  repeatable: false,
                  cooldown: 1.0,
                  visualFeedback: true,
                  triggerMessage: 'Point de Réapparition Enregistré !',
                },
              },
            ],
            nodeGraph: { enabled: false, nodes: [], connections: [], variables: {} },
            customScript: { enabled: false, code: '' },
          },
        };
        newObject = group;
        break;
      }
      case 'navMeshAgent': {
        const group = new THREE.Group();
        const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.0, 8, 16);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.2 });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.9;
        group.add(bodyMesh);

        const eyeGeo = new THREE.SphereGeometry(0.12, 12, 12);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-0.2, 1.2, -0.4);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(0.2, 1.2, -0.4);
        group.add(eyeL);
        group.add(eyeR);

        name = `PNJ_AStar_${this.objects.size + 1}`;
        let posY = 0;
        if (this.terrainGenerator) posY = this.terrainGenerator.getHeightAt(posX, posZ);
        group.position.set(posX, posY, posZ);
        group.userData = {
          subType: 'navMeshAgent',
          logic: {
            activeLevel: 'cards',
            cards: [
              {
                id: `card_${Date.now()}`,
                type: 'NavMeshAgent',
                enabled: true,
                config: {
                  targetType: 'Player',
                  speed: 3.8,
                  stoppingDistance: 1.2,
                  acceleration: 8,
                  angularSpeed: 10,
                  autoRepath: true,
                  repathInterval: 0.5,
                  avoidanceRadius: 0.6,
                  avoidWater: true,
                  maxSlopeAngle: 45,
                },
              },
            ],
            nodeGraph: { enabled: false, nodes: [], connections: [], variables: {} },
            customScript: { enabled: false, code: '' },
          },
        };
        newObject = group;
        break;
      }
    }

    newObject.name = name;
    if (opts?.preserveId) {
      this.adoptImportId(newObject, opts.preserveId);
    }
    this.registerObject(newObject);
    if (!opts?.silent) {
      this.selectObject(newObject);
      this.notifyHierarchy();

      this.saveHistoryState();
    }

    return this.toSceneNode(newObject);
  }

  /**
   * Pose un objet de la bibliothèque low-poly (LOW_POLY_set.glb) dans la scène.
   * La géométrie + le matériau sont CLONÉS depuis FoliagePainter : chaque objet
   * est autonome (suppression / duplication sans impacter les calques peints).
   * Async car la bibliothèque GLB se charge à la demande.
   */
  public async addLowPolyModel(
    lowPolyId: string,
    dropPos?: { x: number; y: number; z: number },
    opts?: { silent?: boolean; preserveId?: string }
  ): Promise<SceneNode | null> {
    // Attend la fin du chargement GLB (résolu même en cas d'échec).
    await this.foliageLibraryPromise?.catch(() => null);
    if (!this.foliagePainter) return null;

    const mesh = this.foliagePainter.createLibraryMesh(lowPolyId);
    if (!mesh) {
      console.warn(`[Aether] Modèle low-poly '${lowPolyId}' introuvable dans la bibliothèque.`);
      return null;
    }

    const entry = this.foliagePainter.getEntry(lowPolyId);
    const posX = dropPos ? dropPos.x : 0;
    const posZ = dropPos ? dropPos.z : 0;
    // Base du modèle à y=0 (recenter fait par loadLibrary) : on se cale au sol.
    const groundY =
      dropPos?.y !== undefined
        ? dropPos.y
        : this.terrainGenerator?.config.enabled
          ? this.terrainGenerator.getHeightAt(posX, posZ)
          : 0;

    mesh.position.set(posX, groundY, posZ);
    mesh.name = `${entry?.name || lowPolyId}_${this.objects.size + 1}`;
    mesh.userData = { subType: 'lowPoly', lowPolyId, palette: entry?.palette };

    // Échelle d'import : le pack LOW_POLY est modélisé ~5x trop grand pour la scène
    // (arbres jusqu'à 25 unités, médiane ~5). 0.2 donne des arbres ~5 m, des cailloux
    // ~5-20 cm et des props ~1 m, cohérent avec le cube par défaut (1.5 m).
    // Une entrée peut imposer sa propre échelle (modèle déjà à l'échelle réelle).
    // Conservée dans le transform exporté : la restauration réapplique exactement cette échelle.
    const LOW_POLY_IMPORT_SCALE = 0.2;
    mesh.scale.setScalar(entry?.importScale ?? LOW_POLY_IMPORT_SCALE);

    if (opts?.preserveId) this.adoptImportId(mesh, opts.preserveId);
    this.registerObject(mesh);
    if (!opts?.silent) {
      this.selectObject(mesh);
      this.notifyHierarchy();
      this.saveHistoryState();
    }
    return this.toSceneNode(mesh);
  }

  /**
   * Adds a procedural animated River to the scene and auto-carves terrain bed
   */
  public addRiver(
    config?: Partial<RiverConfig>,
    dropPos?: { x: number; y: number; z: number }
  ): SceneNode {
    const river = new RiverMesh(config);
    const posX = dropPos ? dropPos.x : 0;
    const posZ = dropPos ? dropPos.z : 0;

    let posY = dropPos ? dropPos.y : 0.4;
    if (this.terrainGenerator && !dropPos) {
      posY = Math.max(0.2, this.terrainGenerator.getHeightAt(posX, posZ) + 0.3);
    }

    river.mesh.position.set(posX, posY, posZ);
    river.setSunDirection(this.dirLight.position, this.dirLight.color);

    this.scene.add(river.mesh);
    this.riverMeshes.push(river);
    this.registerObject(river.mesh);

    // Auto-carve river bed into terrain if enabled
    if (this.terrainGenerator && river.config.autoCarveTerrain !== false) {
      this.terrainGenerator.carveRiverBed(river);
    }

    this.selectObject(river.mesh);
    this.notifyHierarchy();

    this.saveHistoryState();

    return this.toSceneNode(river.mesh);
  }

  /**
   * Import GLTF/GLB File with automatic DRACO decoding, normal recalculation,
   * bounding box centering, ground elevation, and shadow mapping.
   */
  public playSkeletalAnimation(entityId: string, animationName: string): void {
    const obj = this.objects.get(entityId);
    if (!obj) return;

    const animations = obj.userData.animations as THREE.AnimationClip[];
    if (!animations || animations.length === 0) return;

    // Find the requested animation
    const clip = animations.find((a) => a.name === animationName);
    if (!clip) {
      const warnKey = `${entityId}::${animationName}`;
      if (!this.warnedMissingClips.has(warnKey)) {
        this.warnedMissingClips.add(warnKey);
        console.warn(
          `[Rig] Clip "${animationName}" introuvable sur ${obj.name}. Clips dispo: ${animations.map((a) => a.name).join(', ') || '(aucun)'}. Vérifiez le mapping exact (sensible à la casse) dans Rig Studio.`
        );
      }
      return;
    }

    // In Play mode, non-locomotion clips (attack/interact/...) play once via the
    // one-shot system so the locomotion blend tree doesn't override them mid-gesture.
    if (this.isPlaying) {
      const ent = this.ecsWorld.getEntity(entityId);
      const rig = ent?.getComponent<RigAnimComponent>('RigAnim');
      if (rig?.enabled && rig.autoAnimate) {
        const loco = [rig.mapping.idle, rig.mapping.walk, rig.mapping.run, rig.mapping.sprint, rig.mapping.jump, rig.mapping.crouch];
        if (!loco.includes(animationName)) {
          this.playOneShotAnimation(entityId, animationName);
          return;
        }
      }
    }

    let mixer = this.mixers.get(entityId);
    if (!mixer) {
      mixer = new THREE.AnimationMixer(obj);
      this.mixers.set(entityId, mixer);
    }

    const action = mixer.clipAction(clip);
    
    // If this action is already playing, don't restart it
    if (action.isRunning() && mixer.timeScale > 0) return;

    // Fade out other actions smoothly and fade in this one
    const actions = (mixer as any)._actions || [];
    actions.forEach((act: THREE.AnimationAction) => {
      if (act !== action && act.isRunning()) {
        act.fadeOut(0.2);
      }
    });

    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.fadeIn(0.2);
    action.play();
  }

  // -------------------------------------------------------------------------
  // 4.2 — Animator Controller : API moteur
  // -------------------------------------------------------------------------

  /** Mixer existant ou créé si l'objet porte des clips (jamais d'exception). */
  private getAnimatorMixer(uuid: string): THREE.AnimationMixer | null {
    const obj = this.objects.get(uuid);
    if (!obj) return null;
    let mixer = this.mixers.get(uuid);
    if (!mixer) {
      const clips = obj.userData.animations as THREE.AnimationClip[] | undefined;
      if (!clips || clips.length === 0) return null;
      mixer = new THREE.AnimationMixer(obj);
      this.mixers.set(uuid, mixer);
    }
    return mixer;
  }

  private getAnimatorClips(uuid: string): THREE.AnimationClip[] {
    const obj = this.objects.get(uuid);
    if (!obj) return [];
    const clips = obj.userData.animations as THREE.AnimationClip[] | undefined;
    return Array.isArray(clips) ? clips : [];
  }

  /** Liste les sources jouables (clips + tracks) pour l'éditeur Animator. */
  public listAnimatorSources(uuid: string): { clips: string[]; tracks: { id: string; name: string }[] } {
    const clips = this.getAnimatorClips(uuid).map((c) => c.name);
    const tracks = this.animationManager
      ? this.animationManager.getTracksForObject(uuid).map((t) => ({ id: t.id, name: t.name }))
      : [];
    return { clips, tracks };
  }

  private readAnimatorAutoParams(
    uuid: string,
    measuredSpeed: number
  ): { speed: number; moving: boolean; grounded: boolean } {
    const entity = this.ecsWorld.getEntity(uuid);
    const cc = entity?.getComponent('CharacterController') as
      | { isGrounded?: boolean }
      | undefined;
    return {
      speed: measuredSpeed,
      moving: measuredSpeed > 0.15,
      grounded: cc?.isGrounded ?? true,
    };
  }

  /** Exécute un event d'animation (footstep, attack frame, emitter, flag). */
  private handleAnimatorEvent(payload: AnimatorEventPayload): void {
    const { event } = payload;
    try {
      switch (event.kind) {
        case 'sound': {
          soundManager.playSFX(event.value as SFXType);
          break;
        }
        case 'emitter': {
          const obj = this.objects.get(payload.uuid);
          if (obj && this.particleManager) {
            const pos = new THREE.Vector3();
            obj.getWorldPosition(pos);
            this.particleManager.createOrUpdateEmitter(
              `anim_${payload.uuid.slice(0, 6)}_${event.id}`,
              {
                preset: 'sparks',
                rate: 40,
                maxParticles: 60,
                lifetime: 0.5,
                speed: 2.5,
                color: '#ffd166',
                size: 0.22,
                gravity: -4,
                spread: 1,
                loop: false,
                enabled: true,
              },
              pos.clone()
            );
          }
          break;
        }
        case 'flag': {
          // `nom=valeur` → paramètre (bool/float) du même animator.
          const eq = event.value.indexOf('=');
          if (eq > 0) {
            const name = event.value.slice(0, eq).trim();
            const raw = event.value.slice(eq + 1).trim().toLowerCase();
            const value = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
            if (typeof value === 'boolean' || Number.isFinite(value)) {
              this.animatorSystem.setParam(payload.uuid, name, value);
            }
          }
          break;
        }
        case 'log':
        default: {
          console.info(`[Animator] ${payload.objectName}/${payload.stateName} : ${event.name}`);
          break;
        }
      }
    } catch (err) {
      console.warn(`[Animator] event "${event.name}" ignoré.`, err);
    }
  }

  /** Assigne/remplace le contrôleur d'un objet (persité comme les autres blocs). */
  public setAnimatorConfig(id: string, data: AnimatorControllerData | null): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.userData = obj.userData || {};
    if (data) {
      (obj.userData as Record<string, unknown>).animator = normalizeAnimatorController(data);
      this.animatorSystem.bind(id);
    } else {
      delete (obj.userData as Record<string, unknown>).animator;
      this.animatorSystem.unbind(id);
    }
    this.notifyHierarchy();
  }

  public playAnimatorState(id: string, stateName: string): boolean {
    return this.animatorSystem.playState(id, stateName, 0.25);
  }

  /** Candidats Animator : objets avec clips, tracks ou contrôleur existant. */
  public listAnimatorCandidates(): {
    uuid: string;
    name: string;
    clips: string[];
    tracks: { id: string; name: string }[];
    hasAnimator: boolean;
  }[] {
    const out: {
      uuid: string;
      name: string;
      clips: string[];
      tracks: { id: string; name: string }[];
      hasAnimator: boolean;
    }[] = [];
    for (const obj of this.objects.values()) {
      if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Group)) continue;
      const ud = (obj.userData as Record<string, unknown> | undefined) ?? {};
      const clips = this.getAnimatorClips(obj.uuid).map((c) => c.name);
      const tracks = this.animationManager
        ? this.animationManager.getTracksForObject(obj.uuid).map((t) => ({ id: t.id, name: t.name }))
        : [];
      const hasAnimator = ud.animator !== undefined && this.animatorSystem.has(obj.uuid);
      if (clips.length === 0 && tracks.length === 0 && !hasAnimator) continue;
      out.push({ uuid: obj.uuid, name: obj.name || obj.uuid.slice(0, 8), clips, tracks, hasAnimator });
    }
    return out;
  }

  /** Copie éditable du contrôleur (null si aucun). */
  public getAnimatorController(id: string): AnimatorControllerData | null {
    const obj = this.objects.get(id);
    if (!obj) return null;
    const raw = (obj.userData as Record<string, unknown> | undefined)?.animator as
      | AnimatorControllerData
      | undefined;
    if (!raw) return null;
    return JSON.parse(JSON.stringify(normalizeAnimatorController(raw))) as AnimatorControllerData;
  }

  public getAnimatorInfo(id: string): {
    current: string | null;
    normTime: number;
    blending: boolean;
    speed: number;
    turnRate: number;
  } | null {
    return this.animatorSystem.getInfo(id);
  }

  public setAnimatorParam(id: string, name: string, value: number | boolean): void {
    this.animatorSystem.setParam(id, name, value);
  }

  public fireAnimatorTrigger(id: string, name: string): void {
    this.animatorSystem.setTrigger(id, name);
  }

  // -------------------------------------------------------------------------
  // Mise au sol des modèles (import + inspecteur + début de simulation)
  // -------------------------------------------------------------------------

  /** Niveau du sol : hauteur du terrain au point, sinon Y=0. */
  public groundLevelAt(x: number, z: number): number {
    try {
      if (this.terrainGenerator?.config.enabled) {
        const h = this.terrainGenerator.getHeightAt(x, z);
        if (Number.isFinite(h)) return h;
      }
    } catch {
      /* ignore */
    }
    return 0;
  }

  /**
   * Pose un objet sur le sol (base du bbox monde au niveau du sol).
   * Utilisé sans historique (l'appelant sauvegarde).
   */
  private groundObjectToLevel(obj: THREE.Object3D): void {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const ground = this.groundLevelAt(center.x, center.z);
    obj.position.y += ground - box.min.y;
    obj.updateMatrixWorld(true);
  }

  /** Action UI : pose la sélection/un objet au sol (avec historique). */
  public snapObjectToGround(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    this.groundObjectToLevel(obj);
    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
    this.saveHistoryState();
  }

  /** Au Play : repêche les modèles enterrés sous le sol (sculpt, imports). */
  private groundSunkenModels(): void {
    for (const obj of this.objects.values()) {
      const sub = (obj.userData as Record<string, unknown> | undefined)?.subType;
      if (sub !== 'model') continue;
      if (obj.parent !== this.scene) continue; // racines seules (pas les enfants)
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) continue;
      const center = box.getCenter(new THREE.Vector3());
      const ground = this.groundLevelAt(center.x, center.z);
      if (box.min.y < ground - 0.05) {
        obj.position.y += ground - box.min.y;
        obj.updateMatrixWorld(true);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4.4 — UI moteur : actions, presets, synchro config
  // -------------------------------------------------------------------------

  private handleUIAction(action: UIAction, screenId: string, nodeId: string): void {
    void nodeId;
    switch (action.kind) {
      case 'show':
        this.guiManager.showScreen(action.screen, action.transition);
        break;
      case 'hide':
        this.guiManager.hideScreen(action.screen ?? screenId, action.transition);
        break;
      case 'toggle':
        if (this.guiManager.isVisible(action.screen)) {
          this.guiManager.hideScreen(action.screen);
        } else {
          this.guiManager.showScreen(action.screen);
        }
        break;
      case 'setVar':
        this.guiManager.setVariable(action.name, action.value);
        break;
      case 'addVar': {
        const cur = (this.hudConfig.variables ?? {})[action.name];
        const next = (typeof cur === 'number' ? cur : 0) + action.delta;
        this.guiManager.setVariable(action.name, next);
        break;
      }
      case 'resume':
        this.guiManager.hideScreen(screenId);
        break;
      case 'restart':
        void this.setPlayMode(false);
        window.setTimeout(() => {
          void this.setPlayMode(true);
        }, 100);
        break;
      case 'custom':
        try {
          this.logicExecutor.emitCustomEvent(action.event, { screenId, nodeId });
        } catch {
          /* ignore */
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('aether_ui_action', { detail: { event: action.event, screenId, nodeId } })
          );
        }
        break;
      default:
        break;
    }
  }

  /** Écrans starter (pause / game over / menu) générés en un clic. */
  public addUIStarterPreset(kind: 'pause' | 'gameover' | 'mainmenu'): void {
    const screens = [...(this.hudConfig.screens ?? [])];
    screens.push(buildUIStarterPreset(kind));
    this.updateHUDConfig({ screens });
  }

  /** Gestes clavier (E/F/V + accroupi) → triggers/params de l'animator joueur. */
  private prevGestureInput = { attack: false, interact: false, wave: false };
  private forwardGestureInputs(): void {
    const entity = this.getPlayerEntity();
    const uuid = entity?.object3D?.uuid;
    if (!uuid || !this.animatorSystem.has(uuid)) {
      const input = this.physicsManager.characterSystem.input;
      this.prevGestureInput = { attack: input.attack, interact: input.interact, wave: input.wave };
      return;
    }
    const input = this.physicsManager.characterSystem.input;
    const edge = (key: 'attack' | 'interact' | 'wave'): boolean =>
      input[key] && !this.prevGestureInput[key];
    if (edge('attack')) {
      this.animatorSystem.setTrigger(uuid, 'attack');
      input.attack = false;
    }
    if (edge('interact')) {
      this.animatorSystem.setTrigger(uuid, 'interact');
      input.interact = false;
    }
    if (edge('wave')) {
      this.animatorSystem.setTrigger(uuid, 'wave');
      input.wave = false;
    }
    this.animatorSystem.setParam(uuid, 'crouch', input.crouch);
    this.prevGestureInput = { attack: input.attack, interact: input.interact, wave: input.wave };
  }

  /**
   * Append animations from an external GLB/GLTF file to an existing model
   */
  public async appendAnimationsToModel(
    targetId: string,
    source: File | ArrayBuffer,
    customClipPrefix?: string
  ): Promise<string[]> {
    const targetObj = this.objects.get(targetId);
    if (!targetObj) throw new Error("Objet 3D cible introuvable.");

    let arrayBuffer: ArrayBuffer;
    let fileName = 'Animation';
    let isFbx = false;
    if (source instanceof File) {
      arrayBuffer = await source.arrayBuffer();
      fileName = source.name.replace(/\.[^/.]+$/, '');
      isFbx = source.name.toLowerCase().endsWith('.fbx');
    } else {
      arrayBuffer = source;
    }

    return new Promise((resolve, reject) => {
      // FBX is parsed synchronously (no onLoad/onError callbacks).
      if (isFbx) {
        try {
          const fbx = this.fbxLoader.parse(arrayBuffer, '');
          const clips = (fbx.animations || []) as THREE.AnimationClip[];
          if (clips.length === 0) {
            reject(new Error("Aucune piste d'animation trouvée dans ce fichier FBX."));
            return;
          }
          resolve(this.mergeClipsIntoModel(targetObj, targetId, clips, fileName, customClipPrefix));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Erreur lors du décodage FBX'));
        }
        return;
      }
      this.gltfLoader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          if (!gltf.animations || gltf.animations.length === 0) {
            reject(new Error("Aucune piste d'animation trouvée dans ce fichier."));
            return;
          }
          resolve(
            this.mergeClipsIntoModel(targetObj, targetId, gltf.animations, fileName, customClipPrefix)
          );
        },
        (error) => {
          reject(error);
        }
      );
    });
  }

  /**
   * Merges animation clips into a model's userData (dedup + generic rename),
   * refreshes modelInfo + mixer caches. Shared by the GLTF and FBX paths.
   */
  private mergeClipsIntoModel(
    targetObj: THREE.Object3D,
    targetId: string,
    clips: THREE.AnimationClip[],
    fileName: string,
    customClipPrefix?: string
  ): string[] {
    if (!targetObj.userData) targetObj.userData = {};
    if (!Array.isArray(targetObj.userData.animations)) {
      targetObj.userData.animations = [];
    }

    const existingAnimations: THREE.AnimationClip[] = targetObj.userData.animations;
    const addedNames: string[] = [];

    clips.forEach((clip, index) => {
      // Rename generic or colliding clip names (e.g. mixamo.com, mixamo.com.001, Take 001) using file name
      let clipName = clip.name;
      if (
        !clipName ||
        clipName === 'mixamo.com' ||
        clipName.startsWith('mixamo.com.') ||
        clipName === 'Armature|mixamo.com' ||
        clipName.startsWith('Take ') ||
        clipName === 'ArmatureAction'
      ) {
        clipName = clips.length === 1 ? fileName : `${fileName}_${index + 1}`;
      } else if (customClipPrefix) {
        clipName = `${customClipPrefix}_${clipName}`;
      }

      // Ensure unique name
      let uniqueName = clipName;
      let counter = 1;
      while (existingAnimations.some((a) => a.name === uniqueName)) {
        uniqueName = `${clipName}_${counter++}`;
      }
      clip.name = uniqueName;

      existingAnimations.push(clip);
      addedNames.push(uniqueName);
    });

    // Update modelInfo
    if (targetObj.userData.modelInfo) {
      targetObj.userData.modelInfo.animations = existingAnimations.map((a) => a.name);
    } else {
      targetObj.userData.modelInfo = {
        format: 'glb',
        vertexCount: 0,
        triangleCount: 0,
        meshCount: 1,
        fileSize: 'N/A',
        originalName: targetObj.name,
        animations: existingAnimations.map((a) => a.name),
      };
    }

    // If mixer exists, recreate or refresh. Cached blend-tree actions
    // reference the OLD mixer and must be dropped, or locomotion breaks.
    if (this.mixers.has(targetId)) {
      const oldMixer = this.mixers.get(targetId);
      oldMixer?.stopAllAction();
      this.mixers.set(targetId, new THREE.AnimationMixer(targetObj));
      this.blendTreeActions.delete(targetId);
      this.oneShotActions.delete(targetId);
      this.smoothedEntitySpeeds.delete(targetId);
    }

    this.notifyHierarchy();
    return addedNames;
  }

  public stopSkeletalAnimations(entityId: string): void {
    const mixer = this.mixers.get(entityId);
    if (mixer) {
      // Instead of stopping abruptly, fade out all actions
      const actions = (mixer as any)._actions || [];
      actions.forEach((action: THREE.AnimationAction) => {
        if (action.isRunning()) {
          action.fadeOut(0.25);
        }
      });
    }
  }

  /**
   * Plays a gesture clip ONCE (attack/interact/wave...), then lets locomotion resume.
   * While the gesture plays, the locomotion blend tree is suspended for this entity
   * (see updateRigSystems) so it can't override the gesture mid-play.
   * Returns false if the clip doesn't exist or another gesture is already playing.
   */
  public playOneShotAnimation(entityId: string, clipName: string): boolean {
    const obj = this.objects.get(entityId);
    if (!obj) return false;
    const animations = obj.userData.animations as THREE.AnimationClip[];
    if (!animations || animations.length === 0) return false;
    const clip = animations.find((a) => a.name === clipName);
    if (!clip) {
      const warnKey = `${entityId}::${clipName}`;
      if (!this.warnedMissingClips.has(warnKey)) {
        this.warnedMissingClips.add(warnKey);
        console.warn(
          `[Rig] Clip "${clipName}" introuvable sur ${obj.name}. Clips dispo: ${animations.map((a) => a.name).join(', ') || '(aucun)'}.`
        );
      }
      return false;
    }
    if (this.oneShotActions.has(entityId)) return false; // un seul geste à la fois

    let mixer = this.mixers.get(entityId);
    if (!mixer) {
      mixer = new THREE.AnimationMixer(obj);
      this.mixers.set(entityId, mixer);
    }

    // Fade out locomotion/other running actions for the gesture duration
    const actions = (mixer as any)._actions || [];
    actions.forEach((act: THREE.AnimationAction) => {
      if (act.isRunning()) act.fadeOut(0.15);
    });

    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.fadeIn(0.15);
    action.play();

    this.oneShotActions.set(entityId, {
      action,
      timer: 0,
      duration: Math.max(0.01, clip.duration),
    });
    return true;
  }

  /** Advances a running one-shot gesture. Returns true while it is still playing. */
  private updateOneShotState(entityId: string, dt: number): boolean {
    const state = this.oneShotActions.get(entityId);
    if (!state) return false;
    state.timer += dt;
    if (state.timer >= state.duration) {
      this.oneShotActions.delete(entityId);
      return false;
    }
    return true;
  }

  /**
   * Keyboard triggers for mapped gesture clips (Play mode only).
   * E = attack, F = interact, V = wave. Flags are always consumed.
   * Returns true if a gesture just started (caller should skip locomotion this frame).
   */
  private handleAnimActionInputs(entity: Entity, rigComp: RigAnimComponent): boolean {
    const input = this.physicsManager.characterSystem.input;
    const mapping = rigComp.mapping;
    let started = false;

    // Warn ONCE when a gesture key is pressed but its slot is empty —
    // the #1 cause of "keys do nothing" (empty slots warn nowhere else).
    const warnEmptySlot = (slot: 'attack' | 'interact' | 'wave', keyLabel: string) => {
      const warnKey = `${entity.id}::slot-empty:${slot}`;
      if (this.warnedMissingClips.has(warnKey)) return;
      this.warnedMissingClips.add(warnKey);
      console.warn(
        `[Rig] Touche ${keyLabel} pressée mais aucun clip mappé au slot "${slot}" sur ${entity.name}. ` +
          `Ouvrez Rig Studio → Locomotion → Mapping des Clips, choisissez un clip puis Sauvegardez.`
      );
    };

    if (input.attack) {
      input.attack = false;
      if (mapping.attack) {
        if (!started) started = this.playOneShotAnimation(entity.id, mapping.attack);
      } else {
        warnEmptySlot('attack', 'E');
      }
    }
    if (input.interact) {
      input.interact = false;
      if (mapping.interact) {
        if (!started) started = this.playOneShotAnimation(entity.id, mapping.interact);
      } else {
        warnEmptySlot('interact', 'F');
      }
    }
    if (input.wave) {
      input.wave = false;
      if (mapping.wave) {
        if (!started) started = this.playOneShotAnimation(entity.id, mapping.wave);
      } else {
        warnEmptySlot('wave', 'V');
      }
    }
    return started;
  }

  public shootProjectile(entityId: string, prefabId: string, speed: number, damage: number, opts?: { fromNet?: boolean }): void {
    const parentObj = this.objects.get(entityId);
    if (!parentObj) return;

    const projectileId = `proj_${Date.now()}_${Math.random()}`;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(parentObj.quaternion);
    const startPos = parentObj.position.clone()
      .add(forward.clone().multiplyScalar(1.2))
      .add(new THREE.Vector3(0, 1.2, 0));
    this.spawnProjectileMesh(projectileId, startPos, forward, speed, damage, prefabId, false);

    // Relais réseau : le tir local est rejoué par l'hôte (autorité).
    if (!opts?.fromNet) this.relayShootEvent(prefabId, speed, damage, startPos, forward);

    // Sound
    soundManager.playSFX('laser');
  }

  /** Cœur de spawn projectile (local, hôte, relayé) — params explicites. */
  private spawnProjectileMesh(
    projectileId: string,
    startPos: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    damage: number,
    prefabId: string,
    visualOnly: boolean
  ): void {
    // Simple visual for "Fire" shot
    const geo = new THREE.SphereGeometry(0.15, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: prefabId.toLowerCase().includes('fire') ? 0xff4400 : 0x00ccff,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(startPos);
    if (visualOnly) mesh.userData.netVisualOnly = true;
    this.scene.add(mesh);

    // Register
    this.objects.set(projectileId, mesh);

    // VFX
    if (this.particleManager) {
      this.particleManager.createOrUpdateEmitter(projectileId + '_trail', {
        preset: 'fire',
        rate: 30,
        maxParticles: 100,
        size: 0.3,
        speed: 0.5,
        lifetime: 0.4,
        color: prefabId.toLowerCase().includes('fire') ? '#ffaa00' : '#00ffff',
        spread: 0.2,
        gravity: 0,
        loop: true,
        enabled: true
      }, new THREE.Vector3(0, 0, 0), mesh);
    }

    this.activeProjectiles.push({
      id: projectileId,
      mesh,
      direction,
      speed,
      damage,
      timer: 5.0, // 5 seconds max life
      visualOnly,
    });

    // Flash de la trajectoire quand le debug physique est visible.
    if (this.physicsDebug.visible) {
      const end = startPos.clone().add(direction.clone().multiplyScalar(speed * 0.5));
      this.physicsDebug.flashLine(startPos, end, new THREE.Color(0xfb923c), 0.8);
    }
  }

  /**
   * Spawn de projectile relayé par le réseau (tirs des autres pairs).
   * `visualOnly` = trajectoire seule, sans dégâts ni ragdoll.
   */
  public spawnRemoteProjectile(
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
    speed: number, damage: number, prefab: string,
    visualOnly = true
  ): void {
    const id = `proj_net_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    this.spawnProjectileMesh(
      id,
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(dx, dy, dz).normalize(),
      speed,
      damage,
      prefab,
      visualOnly
    );
  }

  /** Émet l'événement de tir vers l'hôte / les clients selon le rôle. */
  private relayShootEvent(
    prefabId: string, speed: number, damage: number,
    startPos: THREE.Vector3, forward: THREE.Vector3
  ): void {
    if (this.netRole === 'client' && this.netClient) {
      if (this.netClient.spectator) return;
      this.netClient.sendShootEvent({
        prefab: prefabId, speed, damage,
        x: startPos.x, y: startPos.y, z: startPos.z,
        dx: forward.x, dy: forward.y, dz: forward.z,
      });
    } else if (this.netRole === 'host' && this.netHost) {
      // Tir logique local de l'hôte : diffusion aux clients.
      this.netHost.broadcastProjectileEvent({
        prefab: prefabId, speed, damage,
        x: startPos.x, y: startPos.y, z: startPos.z,
        dx: forward.x, dy: forward.y, dz: forward.z,
      });
    }
  }

  public async importGLTF(
    source: File | ArrayBuffer,
    fileName: string = 'Imported_Model',
    opts?: { silent?: boolean; storageId?: string; preserveId?: string }
  ): Promise<SceneNode> {
    let arrayBuffer: ArrayBuffer;
    let fileSizeStr = 'Unknown';
    let isFbx = false;
    let sourceExt = '';

    if (source instanceof File) {
      arrayBuffer = await source.arrayBuffer();
      fileName = source.name.replace(/\.[^/.]+$/, '');
      sourceExt = (source.name.match(/\.[^/.]+$/)?.[0] || '').toLowerCase();
      isFbx = sourceExt === '.fbx';
      const bytes = source.size;
      fileSizeStr =
        bytes > 1048576
          ? `${(bytes / 1048576).toFixed(2)} MB`
          : `${(bytes / 1024).toFixed(1)} KB`;

      // Proactive check for multi-file GLTF
      if (source.name.toLowerCase().endsWith('.gltf')) {
        const text = new TextDecoder().decode(arrayBuffer.slice(0, 2000));
        if (text.includes('"uri":') && !text.includes('data:application/octet-stream;base64')) {
          console.warn('Fichier .gltf détecté avec références externes. Les textures risquent de manquer.');
          this.events.onModelImportError?.('Format .gltf détecté. Pour les modèles avec textures, préférez un fichier unique .GLB ou .FBX qui embarque tout.');
        }
      }
    } else {
      arrayBuffer = source;
      fileSizeStr = `${(arrayBuffer.byteLength / 1024).toFixed(1)} KB`;
    }

    // Persistance du binaire (Asset Pipeline → IndexedDB) pour restaurer le
    // modèle après rechargement. Binaire déjà stocké lors d'une restauration :
    // on réutilise la clé.
    const modelStorageId = opts?.storageId ?? `model-${THREE.MathUtils.generateUUID()}`;
    if (!opts?.storageId) {
      try {
        await this.assetDatabase.importModelBinary({
          id: modelStorageId,
          name: fileName,
          format: sourceExt.replace('.', '') || (isFbx ? 'fbx' : 'glb'),
          bytes: arrayBuffer,
        });
      } catch (err) {
        console.warn('Asset Pipeline indisponible, repli legacy (IndexedDB direct).', err);
        void saveModelBinary(modelStorageId, arrayBuffer).catch(() => {});
      }
    }

    return new Promise((resolve, reject) => {
      // FBX is parsed synchronously (no onLoad/onError callbacks).
      if (isFbx) {
        try {
          const fbx = this.fbxLoader.parse(arrayBuffer, '');
          resolve(this.finalizeModelImport(fbx, fbx.animations || [], fileName, fileSizeStr, 'fbx', {
            silent: opts?.silent,
            storageId: modelStorageId,
            preserveId: opts?.preserveId,
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Erreur lors du décodage FBX';
          this.events.onModelImportError?.(message);
          reject(new Error(message));
        }
        return;
      }
      this.gltfLoader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          const root = gltf.scene || gltf.scenes[0];
          if (!root) {
            reject(new Error('Modèle GLTF vide ou invalide.'));
            return;
          }

          resolve(
            this.finalizeModelImport(
              root,
              gltf.animations,
              fileName,
              fileSizeStr,
              sourceExt === '.glb' ? 'glb' : 'gltf',
              { silent: opts?.silent, storageId: modelStorageId, preserveId: opts?.preserveId }
            )
          );
        },
        (err) => {
          const message =
            (err as unknown as { message?: string })?.message ||
            'Erreur lors du décodage GLTF/GLB';
          this.events.onModelImportError?.(message);
          reject(new Error(message));
        }
      );
    });
  }

  /**
   * Shared model finalization (GLTF + FBX): pivot centering, auto-scale,
   * PBR materials, wrapper group, modelInfo, scene registration.
   */
  private finalizeModelImport(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    fileName: string,
    fileSizeStr: string,
    format: ModelInfo['format'],
    extra?: { silent?: boolean; storageId?: string; preserveId?: string }
  ): SceneNode {
    root.name = fileName;
    root.userData = root.userData || {};
    root.userData.subType = 'model';

    let vertexCount = 0;
    let triangleCount = 0;
    let meshCount = 0;

    // 1. Process all geometries & materials
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
        child.castShadow = true;
        child.receiveShadow = true;

        const geo = child.geometry;
        if (geo) {
          // Ensure normals are computed and smooth
          if (!geo.attributes.normal) {
            geo.computeVertexNormals();
          } else {
            // Recalculate normals to fix corrupted or flat export normals
            geo.computeVertexNormals();
          }
          geo.computeBoundingBox();

          if (geo.attributes.position) {
            vertexCount += geo.attributes.position.count;
          }
          if (geo.index) {
            triangleCount += geo.index.count / 3;
          } else if (geo.attributes.position) {
            triangleCount += geo.attributes.position.count / 3;
          }
        }

        // Ensure material is MeshStandardMaterial with PBR
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((m) => ensurePBRMaterial(m));
          } else {
            child.material = ensurePBRMaterial(child.material);
          }
        }
      }
    });

    // 2. Compute bounding box to center pivot and scale if needed
    // (also normalizes FBX files exported in centimeters, e.g. Mixamo)
    const bbox = new THREE.Box3().setFromObject(root);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());

    // Auto-normalize scale if gigantic or microscopic
    const maxDim = Math.max(size.x, size.y, size.z);
    let targetScale = 1;
    if (maxDim > 15) {
      targetScale = 4 / maxDim;
    } else if (maxDim < 0.2 && maxDim > 0) {
      targetScale = 1.5 / maxDim;
    }

    // Offset geometry/children so root pivot sits at the base (Y=0) and center (X=0, Z=0).
    // NOTE : offset NON scalé — l'échelle s'applique via le wrapper parent.
    // (Bug : offset pré-scalé + wrapper scalé = double échelle sur le placement.)
    const offset = new THREE.Vector3(-center.x, -bbox.min.y, -center.z);
    root.position.copy(offset);

    // Create wrapper container group so TransformControls can easily rotate/scale
    const modelWrapper = new THREE.Group();
    modelWrapper.name = fileName;
    modelWrapper.scale.setScalar(targetScale);
    modelWrapper.position.set(0, 0, 0);
    modelWrapper.add(root);
    // Pose au sol : base du bbox monde au niveau du sol (terrain ou Y=0).
    this.groundObjectToLevel(modelWrapper);

    const modelInfo: ModelInfo = {
      format,
      vertexCount: Math.round(vertexCount),
      triangleCount: Math.round(triangleCount),
      meshCount,
      fileSize: fileSizeStr,
      originalName: fileName,
      animations: animations.map((a) => a.name),
      storageId: extra?.storageId,
    };

    modelWrapper.userData = {
      subType: 'model',
      modelInfo,
      animations,
    };

    if (extra?.preserveId) {
      this.adoptImportId(modelWrapper, extra.preserveId);
    }
    this.registerObject(modelWrapper);
    if (!extra?.silent) {
      this.selectObject(modelWrapper);
      this.focusOnObject(modelWrapper.uuid);
      this.notifyHierarchy();
    }

    this.saveHistoryState();

    // --- Asset Pipeline : registre, textures streamées, LOD (arrière-plan) ---
    if (extra?.storageId) {
      void this.processModelPipeline(
        modelWrapper,
        extra.storageId,
        fileName,
        format,
        Math.round(triangleCount)
      ).catch((err) => console.warn('Asset Pipeline modèle : traitement différé impossible.', err));
    }

    if (!extra?.silent) {
      this.events.onModelImportSuccess?.(fileName, modelInfo);
    }
    return this.toSceneNode(modelWrapper);
  }

  /**
   * Traitement différé d'un modèle importé : acquire + stats + textures
   * (enregistrement déterministe, re-track) + génération LOD meshopt.
   * Si le record existe déjà avec des LOD prêts (restauration), on se contente
   * de ré-enregistrer les maillages — sans régénérer.
   */
  private async processModelPipeline(
    wrapper: THREE.Object3D,
    assetId: string,
    fileName: string,
    format: ModelInfo['format'],
    triTotal: number
  ): Promise<ModelImportReport> {
    const t0 = performance.now();
    // Migration legacy : un modèle importé avant le pipeline n'a pas de record.
    // On le crée depuis le binaire (nouveau store + repli legacy automatique).
    let record = await this.assetDatabase.getRecord(assetId).catch(() => null);
    if (!record) {
      try {
        const bin = await this.assetDatabase.getBinary(assetId);
        if (bin) {
          record = await this.assetDatabase.importModelBinary({
            id: assetId,
            name: fileName,
            format,
            bytes: bin,
          });
        }
      } catch {
        /* registre indisponible : acquire échouera silencieusement */
      }
    }
    await this.assetDatabase.acquire(assetId, wrapper.uuid).catch(() => false);

    // 1. Textures : ids déterministes `<asset>:tex:<matIdx>:<slot>` → idempotents
    //    entre restaurations (pas de doublons, variantes réutilisées).
    const textureIds: string[] = [];
    const slots: Array<'map' | 'normalMap' | 'emissiveMap'> = ['map', 'normalMap', 'emissiveMap'];
    let matIndex = 0;
    const texJobs: Promise<void>[] = [];
    wrapper.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        const idx = matIndex++;
        for (const slot of slots) {
          const tex = (mat as unknown as Record<string, THREE.Texture | null>)[slot];
          if (!tex || !tex.image) continue;
          const texId = `${assetId}:tex:${idx}:${slot}`;
          texJobs.push(
            (async () => {
              try {
                const id = await this.textureStreamer.registerSource({
                  id: texId,
                  name: `${fileName}#${idx}:${slot}`,
                  image: tex.image as ImageBitmap | HTMLImageElement | HTMLCanvasElement,
                  format: 'webp',
                });
                tex.userData = tex.userData || {};
                (tex.userData as { assetId?: string }).assetId = id;
                await this.assetDatabase.acquire(id, wrapper.uuid).catch(() => false);
                this.textureStreamer.track(wrapper.uuid, mat, slot, id, child);
                textureIds.push(id);
              } catch {
                /* texture non streamée : affichage normal */
              }
            })()
          );
        }
      });
    });
    await Promise.all(texJobs);

    // 2. LOD meshopt : restauration → ré-enregistre (même ordre de sommets) ;
    // sinon génère si dense. Les records d'ancien pipeline sont régénérés.
    let lodStatus: LODStatus = 'small';
    const existing = await this.assetDatabase.getRecord(assetId).catch(() => null);
    if (
      existing?.lodStatus === 'ready' &&
      existing.lodLevels &&
      existing.lodLevels.length > 0 &&
      (existing.lodPipelineVersion ?? 0) >= LOD_PIPELINE_VERSION
    ) {
      await this.reregisterModelLODs(wrapper, assetId, existing.lodLevels);
      lodStatus = 'ready';
    } else if (triTotal >= LOD_MIN_TRIANGLES * 8) {
      lodStatus = await this.buildModelLODs(wrapper, assetId);
    } else {
      await this.assetDatabase.updateRecord(assetId, { lodStatus: 'small' }).catch(() => null);
    }

    await this.assetDatabase
      .updateRecord(assetId, { textureIds, lodStatus })
      .catch(() => null);
    return {
      assetId,
      triangleCount: triTotal,
      vertexCount: 0,
      meshCount: 0,
      textureIds,
      lodStatus,
      durationMs: Math.round(performance.now() - t0),
    };
  }

  /**
   * Génère les LOD (50 % / 25 % / 12.5 %) pour chaque maillage ≥ 1000 tris,
   * stocke les indices encodés meshopt et enregistre les maillages. Seuils de
   * distance proportionnels au rayon du modèle (petit accessoire ≠ bâtiment).
   * Le niveau billboard final est géré au runtime par l'ImpostorManager.
   *
   * Ordre impératif : soudure (weld) → optimize (renumérotation sommets) →
   * extraction → simplification. Les blobs LOD référencent l'ordre FINAL.
   */
  private async buildModelLODs(wrapper: THREE.Object3D, assetId: string): Promise<LODStatus> {
    const supported = await GeometryPipeline.isSupported().catch(() => false);
    if (!supported) {
      await this.assetDatabase.updateRecord(assetId, { lodStatus: 'unsupported' }).catch(() => null);
      return 'unsupported';
    }
    const bbox = new THREE.Box3().setFromObject(wrapper);
    const radius = bbox.getSize(new THREE.Vector3()).length() / 2 || 1;
    const distScale = THREE.MathUtils.clamp(radius / 2, 0.5, 8);
    const allLevels: LODLevelMeta[] = [];
    let lodBytes = 0;
    let registered = 0;
    let meshIndex = 0;
    const meshes: THREE.Mesh[] = [];
    wrapper.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });

    for (const mesh of meshes) {
      const idx = meshIndex++;
      const geo = mesh.geometry as THREE.BufferGeometry;
      const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (tris < LOD_MIN_TRIANGLES) continue;
      try {
        // 1. Soudure du mesh vivant (visuellement identique).
        const indexedGeo = GeometryPipeline.ensureIndexedLive(mesh);
        if (!indexedGeo) continue;
        // 2. Reorder + renumérotation (doit précéder l'extraction !).
        await GeometryPipeline.optimize(indexedGeo).catch(() => null);
        // 3. Extraction dans l'ordre final + simplification.
        const { positions, index } = GeometryPipeline.prepareIndexed(indexedGeo);
        const simplified = await GeometryPipeline.generateLODs(positions, index, [0.5, 0.25, 0.125]);
        const ratios = [25, 60, 120];
        const meshLevels: LODLevelMeta[] = [];
        for (let li = 0; li < simplified.length; li++) {
          const lvl = simplified[li];
          const blobKey = `${assetId}:lod:${idx}:${li}`;
          const blob = await GeometryPipeline.encodeIndexBlob(lvl.indices);
          await this.assetStore.putBlob(blobKey, blob);
          lodBytes += blob.byteLength;
          meshLevels.push({
            ratio: lvl.ratio,
            maxDistance: Math.round(ratios[li] * distScale),
            blobKey,
            error: lvl.error,
            triangleCount: lvl.triangleCount,
            meshIndex: idx,
          });
        }
        if (meshLevels.length > 0) {
          allLevels.push(...meshLevels);
          if (this.lodManager.registerMesh(mesh.uuid, assetId, meshLevels)) registered++;
        }
      } catch (err) {
        console.warn(`LOD : maillage ${idx} ignoré (${assetId}).`, err);
      }
    }

    if (registered === 0) {
      await this.assetDatabase.updateRecord(assetId, { lodStatus: 'small' }).catch(() => null);
      return 'small';
    }
    await this.assetDatabase
      .updateRecord(assetId, { lodStatus: 'ready', lodLevels: allLevels, lodBytes, lodPipelineVersion: LOD_PIPELINE_VERSION })
      .catch(() => null);
    return 'ready';
  }

  /**
   * Restauration : rejoue le pipeline d'ordre (weld + optimize, déterministes)
   * AVANT d'enregistrer les maillages sur les niveaux stockés — sinon les
   * indices LOD référenceraient un ordre de sommets différent (déformation
   * à distance après rechargement). Les records d'ancien pipeline sont
   * régénérés au lieu d'être réutilisés.
   */
  private async reregisterModelLODs(
    wrapper: THREE.Object3D,
    assetId: string,
    levels: LODLevelMeta[]
  ): Promise<void> {
    let meshIndex = 0;
    const jobs: Promise<unknown>[] = [];
    wrapper.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const idx = meshIndex++;
      const meshLevels = levels.filter((l) => l.meshIndex === idx);
      if (meshLevels.length === 0) return;
      jobs.push(
        (async () => {
          try {
            const indexedGeo = GeometryPipeline.ensureIndexedLive(child);
            if (!indexedGeo) return;
            await GeometryPipeline.optimize(indexedGeo).catch(() => null);
            this.lodManager.registerMesh(child.uuid, assetId, meshLevels);
          } catch (err) {
            console.warn(`LOD : ré-enregistrement ${idx} ignoré (${assetId}).`, err);
          }
        })()
      );
    });
    await Promise.all(jobs);
  }

  public deleteObject(id: string): void {
    if (this.selectedObjects.length > 1 && this.selectedObjects.some((o) => o.uuid === id)) {
      this.selection.dissolveMultiSelectGroup();
      const idsToDelete = this.selectedObjects.map((o) => o.uuid);
      this.deselect();
      idsToDelete.forEach((uuid) => {
        this.deleteSingleObject(uuid);
      });
      this.saveHistoryState();
      return;
    }

    this.deleteSingleObject(id);
    this.saveHistoryState();
  }

  private deleteSingleObject(id: string): void {
    this.deleteObjectTree(id);
    this.notifyHierarchy();
  }

  /**
   * Suppression en cascade : les descendants enregistrés sont supprimés
   * d'abord (récursif), puis l'objet lui-même (retiré de son parent,
   * quel qu'il soit — pas seulement la racine).
   */
  private deleteObjectTree(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    // Si l'objet fait partie d'une (multi-)sélection, on l'en retire d'abord :
    // sinon le gizmo resterait attaché à un objet hors du graphe de scène
    // (spam `TransformControls: ... must be a part of the scene graph`).
    if (this.selectedObjects.some((o) => o.uuid === id)) {
      const remaining = this.selectedObjects.filter((o) => o.uuid !== id);
      if (remaining.length === 0) {
        this.deselect();
      } else {
        this.selection.setMultiSelection(remaining, false);
      }
    }

    if (this.waterManager && obj === this.waterManager.waterMesh) {
      this.waterManager.config.enabled = false;
      if (this.atmosphereManager?.atmosphere?.water) {
        this.atmosphereManager.atmosphere.water.enabled = false;
      }
    }

    const riverIdx = this.riverMeshes.findIndex((r) => r.mesh === obj);
    if (riverIdx !== -1) {
      this.riverMeshes[riverIdx].dispose();
      this.riverMeshes.splice(riverIdx, 1);
    }

    // Cascade : supprime les descendants enregistrés avant le parent.
    const registeredChildren = [...obj.children].filter((c) => this.objects.has(c.uuid));
    for (const child of registeredChildren) {
      this.deleteObjectTree(child.uuid);
    }

    if (obj.parent) {
      obj.parent.remove(obj);
    } else {
      this.scene.remove(obj);
    }
    const removedModelStorageId = (obj?.userData?.modelInfo as ModelInfo | undefined)?.storageId;
    this.objects.delete(id);
    this.mixers.delete(id);
    this.smoothedEntitySpeeds.delete(id);
    this.blendTreeActions.delete(id);
    this.renderPipeline.forgetObjectMaterials(id);
    this.ecsWorld.removeEntity(id);

    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Ressources partagées (copie de répétition) : les libérer tuerait la
        // géométrie/matériau que la source utilise encore.
        if (child.userData?.sharedResources) return;
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });

    // Libère les références assets (refcount) : le binaire IndexedDB n'est
    // supprimé que si plus aucun objet ne l'utilise (ex. duplicata partagé).
    // Repli legacy : suppression directe si aucun record (import pré-pipeline).
    if (removedModelStorageId) {
      const sid = removedModelStorageId;
      void (async () => {
        try {
          const rec = await this.assetDatabase.getRecord(sid);
          if (rec) {
            const res = await this.assetDatabase.release(sid, id);
            if (res.deleted) this.lodManager.unregisterAsset(sid);
          } else {
            const stillUsed = [...this.objects.values()].some(
              (o) => (o.userData?.modelInfo as ModelInfo | undefined)?.storageId === sid
            );
            if (!stillUsed) {
              await deleteModelBinary(sid).catch(() => {});
            }
          }
        } catch {
          /* ignore */
        }
      })();
    }
    // Textures/streaming + LOD suivis pour cet objet.
    this.textureStreamer.untrackOwner(id);
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) this.lodManager.unregisterMesh(child.uuid);
      this.impostorManager.unregister(child.uuid);
      this.occlusionManager.unregister(child.uuid);
      this.animatorSystem.unbind(child.uuid);
    });
    // Autres assets éventuellement rattachés à cet objet (textures...).
    void this.assetDatabase.releaseOwner(id).catch(() => {});
  }

  public duplicateObject(id: string): void {
    if (this.selectedObjects.length > 1 && this.selectedObjects.some((o) => o.uuid === id)) {
      this.duplicateSelectedObjects();
      return;
    }

    this.duplicateSingleObject(id);
    this.saveHistoryState();
  }

  private duplicateSelectedObjects(): void {
    this.selection.dissolveMultiSelectGroup();

    const newClones: THREE.Object3D[] = [];
    const offset = new THREE.Vector3(1.2, 0, 1.2);

    this.selectedObjects.forEach((source) => {
      newClones.push(this.cloneSubtree(source, offset));
    });

    this.selection.setMultiSelection(newClones, false);
    this.notifyHierarchy();
    this.saveHistoryState();
  }

  private duplicateSingleObject(id: string): void {
    const source = this.objects.get(id);
    if (!source) return;

    // Dissout d'abord : la source peut être membre d'un groupe multi-sélection
    // transitoire (son parent réel serait sinon le groupe éphémère).
    this.selection.dissolveMultiSelectGroup();
    const clone = this.cloneSubtree(source, new THREE.Vector3(1.2, 0, 1.2));
    this.selectObject(clone);
    this.notifyHierarchy();
  }

  /**
   * Clone un sous-arbre complet : la racine reçoit l'offset (espace local du
   * parent, même parent que la source), les descendants ENREGISTRÉS sont
   * ré-uuidifiés + enregistrés. Les enfants non enregistrés (internals de
   * modèles, helpers, hulls toon) sont copiés puis assainis par
   * sanitizeClonedPair (qui retire les hulls du clone).
   */
  private cloneSubtree(
    source: THREE.Object3D,
    offset: THREE.Vector3,
    opts?: {
      /**
       * Copies générées (répétition) : géométrie ET matériau partagés avec la
       * source. Un clone indépendant coûterait ~25 Mo de VRAM pour un modèle
       * type LongGrass (381 k tris) ; le partage propague aussi les couleurs.
       * Les copies marquent `sharedResources` pour que leur suppression ne
       * libère jamais les ressources de la source.
       */
      shareResources?: boolean;
    }
  ): THREE.Object3D {
    const share = opts?.shareResources === true;
    const hasRegisteredChildren = source.children.some((c) => this.objects.has(c.uuid));
    let clone: THREE.Object3D;
    if (source instanceof THREE.Mesh && !hasRegisteredChildren) {
      const geo = share ? source.geometry : source.geometry.clone();
      const mat = share
        ? source.material
        : Array.isArray(source.material)
          ? source.material.map((m) => m.clone())
          : source.material.clone();
      clone = new THREE.Mesh(geo, mat);
      clone.castShadow = source.castShadow;
      clone.receiveShadow = source.receiveShadow;
    } else {
      clone = source.clone(true);
    }

    if (source.userData) {
      const cleanUserData: Record<string, unknown> = { ...source.userData };
      delete cleanUserData[TOON_SOURCE_MATERIAL_KEY];
      if (share) {
        delete cleanUserData.repeat;
        delete cleanUserData.repeatOf;
        delete cleanUserData.repeatIndex;
      }
      clone.userData = JSON.parse(JSON.stringify(cleanUserData));
    }
    if (share) {
      clone.traverse((desc) => {
        if ((desc as THREE.Mesh).isMesh) {
          desc.userData = desc.userData || {};
          (desc.userData as Record<string, unknown>).sharedResources = true;
        }
      });
    }

    // Le clone doit porter de vrais matériaux PBR (jamais les matériaux
    // toon/hull générés à la volée ni des références partagées) : nettoyage
    // parallèle source/clone. Les effets sont ré-appliquables indépendamment.
    ToonMaterialSystem.sanitizeClonedPair(source, clone, { sharedResources: share });

    clone.name = `${source.name}_Copy`;
    clone.position.copy(source.position).add(offset);
    clone.uuid = THREE.MathUtils.generateUUID();

    // Un clone d'instance prefab devient une NOUVELLE instance du même prefab
    // (même prefabId, identité fraîche) pour Apply/Revert sans ambiguïté.
    const sourceInstanceId = (source.userData as { prefabInstanceId?: string } | undefined)
      ?.prefabInstanceId;
    if (sourceInstanceId) {
      const freshInstanceId = `inst-${THREE.MathUtils.generateUUID()}`;
      clone.traverse((desc) => {
        const ud = desc.userData as { prefabInstanceId?: string } | undefined;
        if (ud && ud.prefabInstanceId === sourceInstanceId) {
          ud.prefabInstanceId = freshInstanceId;
        }
      });
    }

    // Même parent que la source (locales valides telles quelles).
    const parent =
      source.parent && this.objects.has(source.parent.uuid) ? source.parent : this.scene;
    parent.add(clone);
    this.registerExisting(clone);

    // Appariement parallèle source/clone (hulls exclus : sanitize les a retirés
    // du clone, l'ordre des autres enfants est préservé par clone(true)).
    const isHull = (o: THREE.Object3D): boolean => o.name === TOON_OUTLINE_NAME;
    const queue: Array<[THREE.Object3D, THREE.Object3D]> = [[source, clone]];
    while (queue.length > 0) {
      const [s, c] = queue.shift()!;
      const sKids = s.children.filter((k) => !isHull(k));
      const cKids = c.children.filter((k) => !isHull(k));
      const n = Math.min(sKids.length, cKids.length);
      for (let i = 0; i < n; i++) {
        const sc = sKids[i];
        const cc = cKids[i];
        if (this.objects.has(sc.uuid)) {
          cc.uuid = THREE.MathUtils.generateUUID();
          this.registerExisting(cc);
        }
        queue.push([sc, cc]);
      }
    }
    return clone;
  }

  // -------------------------------------------------------------------------
  // Répétition automatique — N copies le long d'un axe + superposition
  // -------------------------------------------------------------------------

  /** Cap de copies générées (au-delà : temps de rendu / mémoire déraisonnables). */
  private static readonly MAX_REPEAT = 64;

  /** Historique différé (une série de sliders = un seul point d'annulation). */
  private scheduleRepeatHistory(): void {
    if (this.repeatHistoryTimer) clearTimeout(this.repeatHistoryTimer);
    this.repeatHistoryTimer = setTimeout(() => {
      this.repeatHistoryTimer = null;
      this.saveHistoryState();
    }, 500);
  }

  /**
   * Mesures nécessaires à la conversion superposition ⇄ espacement :
   * étendue LOCALE de la géométrie (hors échelle) + échelle monde par axe.
   */
  public getRepeatInfo(id: string): RepeatInfo | null {
    const obj = this.objects.get(id);
    if (!obj) return null;

    obj.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const tmp = new THREE.Box3();
    const local = new THREE.Box3();
    let found = false;
    // Parcours manuel : les copies générées (`repeatOf`) sont EXCLUES, sinon la
    // boîte engloberait tout le champ de répétition et l'espacement exploserait.
    const measure = (o: THREE.Object3D): void => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        const geo = mesh.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        if (geo.boundingBox && !geo.boundingBox.isEmpty()) {
          rel.multiplyMatrices(inv, mesh.matrixWorld);
          tmp.copy(geo.boundingBox).applyMatrix4(rel);
          local.union(tmp);
          found = true;
        }
      }
      for (const child of o.children) {
        if (child.userData?.repeatOf) continue;
        measure(child);
      }
    };
    measure(obj);
    if (!found || local.isEmpty()) return null;

    const axisScale = (index: number): number =>
      new THREE.Vector3().setFromMatrixColumn(obj.matrixWorld, index).length() || 1;
    return {
      size: {
        x: Math.max(local.max.x - local.min.x, 1e-4),
        y: Math.max(local.max.y - local.min.y, 1e-4),
        z: Math.max(local.max.z - local.min.z, 1e-4),
      },
      scale: { x: axisScale(0), y: axisScale(1), z: axisScale(2) },
    };
  }

  /** Place une copie existante à `index × step` le long de l'axe demandé. */
  private positionRepeatCopy(
    copy: THREE.Object3D,
    index: number,
    axisIndex: number,
    step: number,
    sourceName: string,
    sourceId: string,
    followGround: boolean
  ): void {
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.scale.set(1, 1, 1);
    copy.position.setComponent(axisIndex, step * index);
    copy.name = `${sourceName}_R${index}`;
    const copyUserData = (copy.userData ||= {}) as Record<string, unknown>;
    delete copyUserData.repeat;
    copyUserData.repeatOf = sourceId;
    copyUserData.repeatIndex = index;
    if (followGround) this.groundObjectToLevel(copy);
  }

  /**
   * (Re)génère les copies d'un objet. Chaque copie est un enfant DIRECT de la
   * source (elle suit donc ses déplacements), décalée le long d'un axe local de
   * `taille × (1 - superposition)` — un chevauchement de 50 % empile les copies
   * à moitié l'une dans l'autre. Les copies partagent géométrie/matériau.
   *
   * La configuration est stockée dans `userData.repeat` de la source et
   * persistée à l'export ; les copies portent `userData.repeatOf`.
   */
  public applyRepeat(id: string, config: Partial<RepeatData>): void {
    const source = this.objects.get(id);
    if (!source) return;

    const userData = (source.userData ||= {}) as Record<string, unknown>;
    const previous = userData.repeat as RepeatData | undefined;

    const clamp = (v: number, lo: number, hi: number): number =>
      Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : lo;
    const count = Math.round(
      clamp(config.count ?? previous?.count ?? 0, 0, SceneManager.MAX_REPEAT)
    );
    const axis: RepeatData['axis'] = config.axis ?? previous?.axis ?? 'x';
    const overlap = clamp(config.overlap ?? previous?.overlap ?? 0, 0, 0.95);
    const followGround = config.followGround ?? previous?.followGround ?? false;

    const existing = [...source.children].filter(
      (child) => this.objects.has(child.uuid) && Boolean(child.userData?.repeatOf)
    );

    if (count <= 0) {
      existing.forEach((copy) => this.deleteObjectTree(copy.uuid));
      delete userData.repeat;
      if (this.selectedObject?.uuid === id) this.selection.refreshSelection();
      this.notifyHierarchy();
      this.scheduleRepeatHistory();
      return;
    }

    // Nombre inchangé (copie du bon compte) : on repositionne, sinon on
    // régénère. Un slider de superposition ne recrée donc rien.
    const reuse = existing.length === count;
    if (!reuse) existing.forEach((copy) => this.deleteObjectTree(copy.uuid));

    userData.repeat = { count, axis, overlap, followGround } satisfies RepeatData;

    const info = this.getRepeatInfo(id);
    const extent = info ? info.size[axis] : 1;
    const step = Math.max(extent * (1 - overlap), 1e-3);
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;

    source.updateWorldMatrix(true, false);

    if (reuse) {
      existing.sort(
        (a, b) =>
          ((a.userData?.repeatIndex as number | undefined) ?? 0) -
          ((b.userData?.repeatIndex as number | undefined) ?? 0)
      );
      existing.forEach((copy, i) =>
        this.positionRepeatCopy(copy, i + 1, axisIndex, step, source.name, id, followGround)
      );
    } else {
      const created: THREE.Object3D[] = [];
      for (let i = 1; i <= count; i++) {
        // Les copies déjà créées sont détachées pendant le clone : sinon le
        // (i+1)-ème clone emporterait les précédentes avec lui.
        for (const prev of created) prev.removeFromParent();
        const copy = this.cloneSubtree(source, new THREE.Vector3(), { shareResources: true });
        copy.removeFromParent();
        for (const prev of created) source.add(prev);
        source.add(copy);
        created.push(copy);
        this.positionRepeatCopy(copy, i, axisIndex, step, source.name, id, followGround);
      }
    }

    if (this.selectedObject?.uuid === id) this.selection.refreshSelection();
    this.notifyHierarchy();
    this.scheduleRepeatHistory();
  }

  public updateRiverConfig(id: string, config: Partial<import('./water/RiverMesh').RiverConfig>): void {
    const obj = this.objects.get(id);
    if (!obj || obj.userData?.subType !== 'river') return;

    const river = this.riverMeshes.find((r) => r.mesh.uuid === id || r.mesh === obj);
    if (river) {
      river.updateConfig(config);
      if (this.terrainGenerator && config.autoCarveTerrain !== false) {
        this.terrainGenerator.carveRiverBed(river);
      }
      this.notifyHierarchy();
      if (this.selectedObject?.uuid === obj.uuid) {
        this.selection.refreshSelection();
      }
    }
  }

  public updateTransform(id: string, transform: Partial<TransformData>): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    if (transform.position) {
      obj.position.set(transform.position.x, transform.position.y, transform.position.z);
      if (this.waterManager && obj === this.waterManager.waterMesh) {
        this.waterManager.config.waterLevel = transform.position.y;
      }
    }
    if (transform.rotation) {
      obj.rotation.set(
        THREE.MathUtils.degToRad(transform.rotation.x),
        THREE.MathUtils.degToRad(transform.rotation.y),
        THREE.MathUtils.degToRad(transform.rotation.z)
      );
    }
    if (transform.scale) {
      obj.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
    }

    const node = this.toSceneNode(obj);
    this.events.onTransformChange(node);
  }

  /**
   * Advanced PBR Material Update (Albedo Color, Roughness, Metalness, Emission, Normal Map, Roughness Map)
   */
  public updateMaterial(id: string, matData: Partial<MaterialData>): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    // Lissage : touche la géométrie (soudure + normales), pas seulement le
    // matériau — appliqué en premier (import : la géométrie vient d'être créée).
    if (matData.smoothShading !== undefined) {
      this.setSmoothShading(id, matData.smoothShading);
    }

    this.syncECSComponents(id, matData);

    const applyToStandardMat = (mat: THREE.MeshStandardMaterial) => {
      if (matData.color !== undefined) {
        mat.color.set(matData.color);
      }
      if (matData.roughness !== undefined) {
        mat.roughness = matData.roughness;
      }
      if (matData.metalness !== undefined) {
        mat.metalness = matData.metalness;
      }
      if (matData.wireframe !== undefined) {
        mat.wireframe = matData.wireframe;
      }
      if (matData.opacity !== undefined) {
        mat.opacity = matData.opacity;
      }
      if (matData.transparent !== undefined) {
        mat.transparent = matData.transparent;
      }

      // Emission
      if (matData.emissive !== undefined) {
        mat.emissive.set(matData.emissive);
      }
      if (matData.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = matData.emissiveIntensity;
      }

      // Normal Scale & Maps
      if (matData.normalScale !== undefined) {
        mat.normalScale.set(matData.normalScale, matData.normalScale);
      }

      // Procedural or Custom Normal Map
      if (matData.texturePreset !== undefined || matData.hasNormalMap !== undefined) {
        const preset: TexturePreset =
          matData.texturePreset ?? (obj.userData?.texturePreset || 'none');
        const enableNormal =
          matData.hasNormalMap !== undefined
            ? matData.hasNormalMap
            : matData.texturePreset !== undefined
              ? matData.texturePreset !== 'none'
              // Aucun preset demandé explicitement : on ne force PAS la normal
              // map. `undefined !== 'none'` vaut `true`, ce qui transformait un
              // simple réglage de couleur en « carbone » surprise.
              : (obj.userData?.hasNormalMap ?? false);

        // Le preset est TOUJOURS mémorisé, y compris pour 'none' : sinon,
        // choisir « Aucune » retirait la normal map à l'écran mais laissait
        // l'ancien preset dans userData — la texture revenait au rechargement
        // de la scène, puisque l'import relit `material.texturePreset`.
        obj.userData.texturePreset = preset;

        if (enableNormal && preset !== 'none') {
          const normalTex = TextureGenerator.getNormalMap(preset);
          mat.normalMap = normalTex;
          if (!mat.normalScale || mat.normalScale.x === 0) {
            mat.normalScale.set(0.6, 0.6);
          }
          obj.userData.hasNormalMap = true;
        } else {
          mat.normalMap = null;
          obj.userData.hasNormalMap = false;
        }
      }

      // Roughness Map
      if (matData.hasRoughnessMap !== undefined || matData.texturePreset !== undefined) {
        const preset: TexturePreset =
          matData.texturePreset ?? (obj.userData?.texturePreset || 'none');
        const enableRough =
          matData.hasRoughnessMap !== undefined
            ? matData.hasRoughnessMap
            : matData.texturePreset !== undefined
              ? matData.texturePreset !== 'none'
              : (obj.userData?.hasRoughnessMap ?? false);

        if (enableRough && preset !== 'none') {
          const roughTex = TextureGenerator.getRoughnessMap(preset);
          mat.roughnessMap = roughTex;
          obj.userData.hasRoughnessMap = true;
        } else {
          // Même raison que la normal map : on nettoie le drapeau ET la texture,
          // au lieu de laisser un preset « carbone » fantôme derrière.
          mat.roughnessMap = null;
          obj.userData.hasRoughnessMap = false;
        }
      }

      // Albedo Image Map
      if (matData.mapUrl !== undefined) {
        if (matData.mapUrl) {
          obj.userData.mapUrl = matData.mapUrl;
          this.loadAlbedoTexture(obj, mat, matData.mapUrl, matData.repeatU, matData.repeatV);
        } else {
          mat.map = null;
          obj.userData.mapUrl = undefined;
        }
      }

      // Repeat U & V Tiling Update
      if (matData.repeatU !== undefined || matData.repeatV !== undefined) {
        const repU = matData.repeatU !== undefined ? matData.repeatU : (obj.userData.repeatU ?? 1);
        const repV = matData.repeatV !== undefined ? matData.repeatV : (obj.userData.repeatV ?? 1);
        obj.userData.repeatU = repU;
        obj.userData.repeatV = repV;

        if (mat.map) {
          mat.map.wrapS = THREE.RepeatWrapping;
          mat.map.wrapT = THREE.RepeatWrapping;
          mat.map.repeat.set(repU, repV);
        }
        if (mat.normalMap) {
          mat.normalMap.wrapS = THREE.RepeatWrapping;
          mat.normalMap.wrapT = THREE.RepeatWrapping;
          mat.normalMap.repeat.set(repU, repV);
        }
        if (mat.roughnessMap) {
          mat.roughnessMap.wrapS = THREE.RepeatWrapping;
          mat.roughnessMap.wrapT = THREE.RepeatWrapping;
          mat.roughnessMap.repeat.set(repU, repV);
        }
      }

      mat.needsUpdate = true;
    };

    // Cible le matériau SOURCE (conservé dans userData quand le rendu Toon
    // est actif) afin que les réglages PBR suivent la conversion toon.
    const applyToShaderMat = (mat: THREE.ShaderMaterial) => {
      // Eau / rivières : la couleur pilote l'uniform waterColor
      if (matData.color !== undefined && mat.uniforms?.waterColor?.value instanceof THREE.Color) {
        (mat.uniforms.waterColor.value as THREE.Color).set(matData.color);
      }
    };

    const applyToMeshTargets = (mesh: THREE.Mesh) => {
      const source = mesh.userData[TOON_SOURCE_MATERIAL_KEY] ?? mesh.material;
      const materials = Array.isArray(source) ? source : [source];
      materials.forEach((m) => {
        if (m instanceof THREE.MeshStandardMaterial) applyToStandardMat(m);
        else if (m instanceof THREE.ShaderMaterial) applyToShaderMat(m);
      });
    };

    if (obj instanceof THREE.Mesh) {
      applyToMeshTargets(obj);
    } else if (obj instanceof THREE.Group) {
      // If user selected an imported GLTF group, apply to all child meshes
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) applyToMeshTargets(child);
      });
    }

    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  /**
   * Analyse la couche UV de l'objet pour le panneau de textures.
   * null si l'objet n'a pas de géométrie exploitable.
   *
   * L'attribut `uv` n'existe que si le maillage a été UV-mappé ; Three le
   * supprime des primitives sans UV (lignes, points). On agrège les maillages
   * enfants pour un groupe importé (GLB) et on garde la plus grande couche.
   */
  public analyzeObjectUv(id: string): UvAnalysis | null {
    const obj = this.objects.get(id);
    if (!obj) return null;

    let best: UvAnalysis | null = null;
    const read = (o: THREE.Object3D): void => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const count = mesh.geometry.attributes.position?.count ?? 0;
      if (count === 0) return;
      const uvAttr = mesh.geometry.attributes.uv as THREE.BufferAttribute | undefined;
      const arr = uvAttr?.array;
      const idx = mesh.geometry.index;
      // analyzeUv tolère un attribut absent (renvoie hasUv: false). L'index
      // est INDISPENSABLE : sans lui les UV brutes d'un maillage indexé ne
      // décrivent pas les triangles (voir analyzeUv).
      const analysis = analyzeUv(
        arr ? (arr as ArrayLike<number>) : null,
        count,
        idx ? (idx.array as ArrayLike<number>) : null
      );
      if (!best || (analysis.hasUv && !best.hasUv) || analysis.vertexCount > best.vertexCount) {
        best = analysis;
      }
    };

    if ((obj as THREE.Mesh).isMesh) read(obj);
    else obj.traverse((child) => read(child));
    return best;
  }

  /**
   * Charge une texture d'albédo et l'applique au matériau.
   *
   * `mapUrl` peut être une URL distante (chargée telle quelle) OU une clé
   * locale `aether:texture:<id>` dont le binaire vit dans IndexedDB : on la
   * résout d'abord en object URL, car THREE.TextureLoader ne connaît pas
   * notre store. L'object URL est mise en cache côté persistence.
   *
   * L'ancienne `mat.map` est disposée : sans cela, réassigner une texture
   * fuitait la GPU à chaque clic.
   */
  private loadAlbedoTexture(
    obj: THREE.Object3D,
    mat: THREE.MeshStandardMaterial,
    mapUrl: string,
    repeatU?: number,
    repeatV?: number
  ): void {
    const applyTex = (tex: THREE.Texture) => {
      // L'objet a pu être supprimé entre-temps (chargement asynchrone).
      if (!this.objects.has(obj.uuid)) {
        tex.dispose();
        return;
      }
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      const repU = repeatU ?? obj.userData.repeatU ?? 1;
      const repV = repeatV ?? obj.userData.repeatV ?? 1;
      tex.repeat.set(repU, repV);
      if (mat.map && mat.map !== tex) mat.map.dispose();
      mat.map = tex;
      mat.needsUpdate = true;
    };

    const onError = () => {
      console.warn(`[TextureAssigner] Texture introuvable pour « ${obj.name} » : ${mapUrl}`);
    };

    resolveTextureUrl(mapUrl)
      .then((resolved) => {
        if (!resolved) {
          onError();
          return;
        }
        new THREE.TextureLoader().load(resolved, applyTex, undefined, onError);
      })
      .catch(onError);
  }

  /**
   * Lissage des normales (smooth shading) d'un élément 3D : soudure des
   * sommets + normales moyennées + flatShading désactivé (ou l'inverse).
   * Persisté via userData.smoothShading → MaterialData → export/import.
   */
  public setSmoothShading(id: string, smooth: boolean): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    if (smooth) smoothShadeObject(obj);
    else flattenShadeObject(obj);

    // Matériau SOURCE (mode toon) : garde le flatShading cohérent pour les
    // futures conversions, comme updateMaterial.
    const syncSourceFlat = (mesh: THREE.Mesh) => {
      const source = mesh.userData[TOON_SOURCE_MATERIAL_KEY] ?? mesh.material;
      const materials = Array.isArray(source) ? source : [source];
      materials.forEach((m) => {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.flatShading = !smooth;
          m.needsUpdate = true;
        }
      });
    };
    if (obj instanceof THREE.Mesh) syncSourceFlat(obj);
    else {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) syncSourceFlat(child);
      });
    }

    obj.userData.smoothShading = smooth;
    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  /**
   * Recolore les zones d'un objet préfabriqué (vertex colors bakees a la creation).
   * `colors` est indexe par zone (nom de materiau du GLB) ; null → palette par defaut.
   */
  public updateLowPolyPalette(id: string, colors: string[] | null): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    const lowPolyId = (obj.userData as { lowPolyId?: string } | undefined)?.lowPolyId;
    if (!lowPolyId) return;

    const defaultPalette = this.foliagePainter?.getLibraryPalette(lowPolyId) ?? [];
    const nextPalette = defaultPalette.map((zone, i) => ({
      name: zone.name,
      color: colors && colors[i] ? colors[i] : zone.color,
    }));
    const palette = (colors ? nextPalette : defaultPalette).length
      ? (colors ? nextPalette : defaultPalette)
      : undefined;

    this.foliagePainter?.applyMeshPalette(obj, colors);
    obj.userData = { ...(obj.userData as Record<string, unknown>), palette };

    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
    this.saveHistoryState();
  }

  private syncECSComponents(id: string, matData: Partial<MaterialData>): void {
    const entity = this.ecsWorld.getEntity(id);
    if (!entity) return;
    const obj = this.objects.get(id) ?? entity.object3D ?? undefined;

    // Rendu Toon : intensité = nombre de bandes de couleur (0 = désactivé)
    if (matData.toonIntensity !== undefined) {
      let toonComp = entity.getComponent<ToonMaterialComponent>('ToonMaterial');
      if (!toonComp) {
        toonComp = new ToonMaterialComponent(Math.max(matData.toonIntensity, 2));
        entity.addComponent(toonComp);
      }
      toonComp.colorLevels = matData.toonIntensity;
      toonComp.enabled = matData.toonIntensity > 0;
      if (!toonComp.enabled) {
        ToonMaterialSystem.restoreMaterials(obj);
      }
    }

    // Contours : épaisseur (0 = désactivé) + couleur
    if (matData.outlineColor !== undefined || matData.outlineThickness !== undefined) {
      let outlineComp = entity.getComponent<OutlineComponent>('Outline');
      if (!outlineComp) {
        outlineComp = new OutlineComponent(
          matData.outlineThickness !== undefined ? matData.outlineThickness : 1.0,
          matData.outlineColor ?? '#000000'
        );
        entity.addComponent(outlineComp);
      }
      if (matData.outlineColor !== undefined) {
        outlineComp.color = matData.outlineColor;
        // Choisir une couleur = intention explicite d'avoir un contour ;
        // l'épaisseur à 0 reste maître de la visibilité effective.
        outlineComp.enabled = true;
      }
      if (matData.outlineThickness !== undefined) {
        outlineComp.strength = matData.outlineThickness;
        outlineComp.enabled = matData.outlineThickness > 0;
      }
      if (!outlineComp.enabled) {
        ToonMaterialSystem.removeOutlineMeshes(obj);
      }
    }
  }

  /**
   * Apply PBR material preset by name
   */
  public applyMaterialPreset(id: string, presetName: string): void {
    const presets: Record<string, Partial<MaterialData>> = {
      gold: {
        color: '#f59e0b',
        roughness: 0.18,
        metalness: 0.95,
        texturePreset: 'brushed',
        hasNormalMap: true,
      },
      chrome: {
        color: '#ffffff',
        roughness: 0.05,
        metalness: 1.0,
        texturePreset: 'none',
        hasNormalMap: false,
      },
      emerald: {
        color: '#10b981',
        roughness: 0.15,
        metalness: 0.4,
        emissive: '#047857',
        emissiveIntensity: 0.15,
      },
      ruby: {
        color: '#e11d48',
        roughness: 0.2,
        metalness: 0.5,
        emissive: '#881337',
        emissiveIntensity: 0.2,
      },
      carbon: {
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.3,
        texturePreset: 'carbon',
        hasNormalMap: true,
        hasRoughnessMap: true,
      },
      cyberNeon: {
        color: '#06b6d4',
        roughness: 0.2,
        metalness: 0.1,
        emissive: '#00ffff',
        emissiveIntensity: 1.2,
      },
      obsidian: {
        color: '#0f172a',
        roughness: 0.1,
        metalness: 0.8,
        texturePreset: 'none',
      },
      industrialDiamond: {
        color: '#94a3b8',
        roughness: 0.35,
        metalness: 0.8,
        texturePreset: 'diamond',
        hasNormalMap: true,
      },
    };

    const preset = presets[presetName];
    if (preset) {
      this.updateMaterial(id, preset);
    }
  }

  public updateLight(id: string, lightData: Partial<LightData>): void {
    const obj = this.objects.get(id);
    if (!obj || !(obj instanceof THREE.Light)) return;

    if (lightData.color !== undefined) {
      obj.color.set(lightData.color);
    }
    if (lightData.intensity !== undefined) {
      obj.intensity = lightData.intensity;
    }
    if (lightData.distance !== undefined && 'distance' in obj) {
      (obj as THREE.PointLight).distance = lightData.distance;
    }

    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  public updateObjectName(id: string, name: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.name = name;
    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  public setVisibility(id: string, visible: boolean): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.visible = visible;

    if (!visible && this.selectedObject?.uuid === id) {
      this.deselect();
    }
    this.notifyHierarchy();
  }

  public setShadows(id: string, cast: boolean, receive: boolean): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.castShadow = cast;
    obj.receiveShadow = receive;

    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = cast;
        child.receiveShadow = receive;
      }
    });

    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  // ---------------------------------------------------------------------------
  // Hiérarchie parent-enfant (TIER 2.1 : groupes, reparentage, DnD)
  // ---------------------------------------------------------------------------

  /**
   * Adopte un id d'import (undo/JSON/binaire) quand il est libre : les ids
   * stables rendent le remap parentId trivial ET réparent la restauration de
   * sélection après undo (qui générait des UUIDs frais à chaque fois).
   */
  private adoptImportId(obj: THREE.Object3D, wantedId: string | undefined): void {
    if (wantedId && typeof wantedId === 'string' && !this.objects.has(wantedId)) {
      obj.uuid = wantedId;
    }
  }

  /**
   * Remap oldId → objet pendant un import (ou une instanciation de prefab).
   * Conservé au niveau instance pour les restaurations ASYNC de modèles
   * (qui se terminent après la fin d'importScene). Écrasé à chaque import.
   */
  private importIdRemap: Map<string, THREE.Object3D> = new Map();

  private trackImportId(item: { id?: string }, obj: THREE.Object3D): void {
    if (item.id) this.importIdRemap.set(item.id, obj);
  }

  /**
   * Rattache un objet importé à son parent (plain .add : les locales
   * stockées sont déjà correctes, pas de préservation monde ici).
   * Retourne false si le parent n'existe pas encore (restaurations async) :
   * l'appelant met alors en file pour `sweepPendingParents()`.
   */
  private attachImportParent(
    item: { id?: string; name?: string; parentId?: string | null },
    obj: THREE.Object3D,
    remap?: Map<string, THREE.Object3D>
  ): boolean {
    if (!item.parentId || !item.id) return true;
    const map = remap ?? this.importIdRemap;
    const parent = map.get(item.parentId);
    if (!parent) {
      return false;
    }
    if (obj === parent || this.isDescendantOf(obj.uuid, parent.uuid)) {
      console.warn(`[Scene] rattachement cyclique refusé pour '${item.name ?? item.id}'.`);
      return true; // résolu (refusé) : ne pas remettre en file.
    }
    parent.add(obj);
    return true;
  }

  /** File des rattachements en attente de parents async (modèles). */
  private pendingParentAttaches: Array<{
    item: { id?: string; name?: string; parentId?: string | null };
    obj: THREE.Object3D;
  }> = [];

  /** Tente les rattachements en attente ; garde les irrésolus (avec warning). */
  private sweepPendingParents(warnUnresolved = false): void {
    if (this.pendingParentAttaches.length === 0) return;
    const rest: typeof this.pendingParentAttaches = [];
    for (const p of this.pendingParentAttaches) {
      if (!this.attachImportParent(p.item, p.obj)) rest.push(p);
    }
    this.pendingParentAttaches = rest;
    if (warnUnresolved) {
      for (const p of rest) {
        console.warn(
          `[Scene] parent '${p.item.parentId}' introuvable pour '${p.item.name ?? p.item.id}' : racine.`
        );
      }
    }
  }

  /** UUID du parent enregistré (null si racine ou parent non enregistré). */
  public getParentId(id: string): string | null {
    const obj = this.objects.get(id);
    if (!obj || !obj.parent) return null;
    return this.objects.has(obj.parent.uuid) ? obj.parent.uuid : null;
  }  /** Enfants directs enregistrés, dans l'ordre de la scène. */
  public getChildIds(id: string): string[] {
    const obj = this.objects.get(id);
    if (!obj) return [];
    const out: string[] = [];
    for (const child of obj.children) {
      if (this.objects.has(child.uuid)) out.push(child.uuid);
    }
    return out;
  }

  /** Racines enregistrées, dans l'ordre de la scène. */
  public getRootIds(): string[] {
    const roots: string[] = [];
    for (const child of this.scene.children) {
      if (this.objects.has(child.uuid)) roots.push(child.uuid);
    }
    return roots;
  }

  /** true si `ancestorId` est un ancêtre strict de `objId` (chaîne complète). */
  private isDescendantOf(ancestorId: string, objId: string): boolean {
    let current = this.objects.get(objId)?.parent;
    while (current) {
      if (current.uuid === ancestorId) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Re parente un objet (monde préservé par défaut, style Unity).
   * Refuse les cycles et les ids inconnus.
   */
  public setParent(childId: string, parentId: string | null, keepWorldTransform = true): boolean {
    const child = this.objects.get(childId);
    if (!child || childId === parentId) return false;
    const parent = parentId ? this.objects.get(parentId) : null;
    if (parentId && !parent) return false;
    if (parent && this.isDescendantOf(childId, parentId as string)) {
      console.warn(`[Hierarchy] reparent refusé : cycle détecté (${childId} → ${parentId}).`);
      return false;
    }
    if ((this.getParentId(childId) ?? null) === (parentId ?? null)) return true;
    if (keepWorldTransform) {
      (parent ?? this.scene).attach(child);
    } else {
      (parent ?? this.scene).add(child);
    }
    const entity = this.ecsWorld.getEntity(childId);
    const trans = entity?.getComponent<TransformComponent>('Transform');
    if (trans) trans.syncFromObject3D(child);
    this.notifyHierarchy();
    this.saveHistoryState();
    return true;
  }

  /** Groupe vide d'organisation (type 'group', sous-type 'empty'). */
  public createEmpty(name = 'Empty', parentId?: string | null): string {
    const group = new THREE.Group();
    group.name = name;
    group.userData = { subType: 'empty' };
    this.registerObject(group);
    if (parentId) {
      const parent = this.objects.get(parentId);
      if (parent) parent.add(group);
    }
    this.selectObject(group);
    this.notifyHierarchy();
    this.saveHistoryState();
    return group.uuid;
  }

  /**
   * Groupe des objets existants (monde préservé). Naît au niveau du parent
   * commun quand il existe (comportement Unity), sinon à la racine.
   */
  public createGroup(name = 'Group', childIds: string[] = []): string {
    const group = new THREE.Group();
    group.name = name;
    group.userData = { subType: 'group' };

    const validChildren: THREE.Object3D[] = [];
    const parentSet = new Set<string | null>();
    for (const cid of childIds) {
      const child = this.objects.get(cid);
      if (!child) continue;
      validChildren.push(child);
      parentSet.add(this.getParentId(cid));
    }

    this.registerObject(group);

    // Barycentre monde des enfants → position du pivot (gizmo pertinent).
    if (validChildren.length > 0) {
      const center = new THREE.Vector3();
      const tmp = new THREE.Vector3();
      for (const child of validChildren) {
        child.getWorldPosition(tmp);
        center.add(tmp);
      }
      center.divideScalar(validChildren.length);
      group.position.copy(center);
    }

    // Parent commun unique → le groupe naît à ce niveau.
    if (parentSet.size === 1) {
      const commonId = [...parentSet][0];
      const commonParent = commonId ? this.objects.get(commonId) : null;
      if (commonParent) commonParent.attach(group);
    }

    for (const child of validChildren) {
      // Évite d'avaler un ancêtre du groupe (impossible : groupe frais, sauf
      // si un enfant EST un ancêtre... setParent n'a pas de cycle ici car le
      // groupe n'a pas d'enfants au moment de l'attach — sûr par construction).
      group.attach(child);
      const entity = this.ecsWorld.getEntity(child.uuid);
      const trans = entity?.getComponent<TransformComponent>('Transform');
      if (trans) trans.syncFromObject3D(child);
    }

    this.selectObject(group);
    this.notifyHierarchy();
    this.saveHistoryState();
    return group.uuid;
  }

  /**
   * Dissout un groupe : les enfants remontent au parent du groupe
   * (monde préservé), puis le groupe est supprimé. Sélectionne les enfants.
   */
  public dissolveGroup(groupId: string): boolean {
    const group = this.objects.get(groupId);
    if (!group) return false;
    this.selection.dissolveMultiSelectGroup();
    const target =
      group.parent && this.objects.has(group.parent.uuid) ? group.parent : this.scene;
    const children = [...group.children];
    for (const child of children) {
      target.attach(child);
      if (this.objects.has(child.uuid)) {
        const entity = this.ecsWorld.getEntity(child.uuid);
        const trans = entity?.getComponent<TransformComponent>('Transform');
        if (trans) trans.syncFromObject3D(child);
      }
    }
    const keptIds = children.filter((c) => this.objects.has(c.uuid)).map((c) => c.uuid);
    this.deleteSingleObject(groupId);
    if (keptIds.length > 0) {
      this.selection.setMultiSelection(
        keptIds.map((id) => this.objects.get(id)).filter((o): o is THREE.Object3D => Boolean(o)),
        false
      );
    }
    this.notifyHierarchy();
    this.saveHistoryState();
    return true;
  }

  /**
   * Déplacement drag & drop hiérarchique :
   * - 'inside' : devient enfant de la cible (monde préservé).
   * - 'before'/'after' : même niveau que la cible + réordonne les frères.
   * - targetId null : retour à la racine (fin de liste).
   */
  public moveObject(
    draggedId: string,
    targetId: string | null,
    position: 'inside' | 'before' | 'after'
  ): boolean {
    const dragged = this.objects.get(draggedId);
    if (!dragged) return false;
    if (targetId === null) {
      this.scene.attach(dragged);
      const entity = this.ecsWorld.getEntity(draggedId);
      const trans = entity?.getComponent<TransformComponent>('Transform');
      if (trans) trans.syncFromObject3D(dragged);
      this.notifyHierarchy();
      this.saveHistoryState();
      return true;
    }
    const target = this.objects.get(targetId);
    if (!target || draggedId === targetId) return false;
    if (position === 'inside') {
      return this.setParent(draggedId, targetId, true);
    }
    // before/after : refuse si dragged est un ancêtre de target.
    if (this.isDescendantOf(draggedId, targetId)) {
      console.warn('[Hierarchy] déplacement refusé : casserait la hiérarchie.');
      return false;
    }
    const targetParent =
      target.parent && this.objects.has(target.parent.uuid) ? target.parent : this.scene;
    targetParent.attach(dragged);
    // Réordonne les frères autour de la cible (locales intactes : même parent).
    const ordered = [...targetParent.children].filter((c) => c.uuid !== draggedId);
    const targetIdx = ordered.findIndex((c) => c.uuid === targetId);
    const insertAt = targetIdx === -1 ? ordered.length : position === 'before' ? targetIdx : targetIdx + 1;
    ordered.splice(insertAt, 0, dragged);
    for (const c of [...targetParent.children]) targetParent.remove(c);
    for (const c of ordered) targetParent.add(c);
    const entity = this.ecsWorld.getEntity(draggedId);
    const trans = entity?.getComponent<TransformComponent>('Transform');
    if (trans) trans.syncFromObject3D(dragged);
    this.notifyHierarchy();
    this.saveHistoryState();
    return true;
  }

  // =========================================================================
  // Caméra de suivi — assignation d'un objet 3D (éditeur ET Play)
  // =========================================================================

  /**
   * Assigne la caméra à un objet (joueur, ennemi, véhicule, décor…).
   *
   * Renvoie false si l'objet n'existe pas ou n'est pas suivable (masqué,
   * plan d'eau…). En édition on reste en mode « pivot » : l'utilisateur
   * garde la main sur l'orbite. En Play, la caméra passe en mode rigide
   * derrière l'objet.
   */
  public assignCameraToObject(id: string): boolean {
    const obj = this.objects.get(id);
    if (!obj) return false;
    if (!this.cameraManager.setFollowTarget(obj)) return false;
    this.cameraManager.setFollowMode(this.isPlaying ? 'rigid' : 'pivot');
    this.cameraManager.frameFollowTarget();
    return true;
  }

  /** Libère la caméra (retour au pilotage orbital normal). */
  public clearCameraFollow(): void {
    this.cameraManager.setFollowTarget(null);
  }

  /** UUID de l'objet suivi, ou null. */
  public getCameraFollowTargetId(): string | null {
    return this.cameraManager.getFollowTarget()?.uuid ?? null;
  }

  public getCameraFollowConfig(): CameraFollowConfig {
    return this.cameraManager.getFollowConfig();
  }

  public setCameraFollowConfig(config: Partial<CameraFollowConfig>): void {
    this.cameraManager.setFollowConfig(config);
  }

  /** Recentre la caméra sur la cible suivie (sans changer son orientation). */
  public frameFollowedObject(): boolean {
    return this.cameraManager.frameFollowTarget();
  }

  // ---------------------------------------------------------------------------
  // Prefabs : instances liées (TIER 2.1 : Apply / Revert / Unlink)
  // ---------------------------------------------------------------------------

  /**
   * Capture un sous-arbre en template : seuls les objets ENREGISTRÉS
   * (les internals de modèles ne sont pas duplicables unitairement),
   * racine relativisée (parentId null), linkage prefab retiré (blueprint pur).
   */
  public captureSubtree(rootId: string): SceneExportData['nodes'] {
    const root = this.objects.get(rootId);
    if (!root) return [];
    const out: SceneExportData['nodes'] = [];
    const visit = (obj: THREE.Object3D): void => {
      out.push(this.toSceneNode(obj));
      for (const child of obj.children) {
        if (this.objects.has(child.uuid)) visit(child);
      }
    };
    visit(root);
    if (out.length > 0) {
      out[0].parentId = null;
      for (const n of out) {
        delete n.prefabId;
        delete n.prefabInstanceId;
      }
    }
    return out;
  }

  /**
   * Racine d'instance prefab (remonte tant que le parent partage l'instanceId).
   * null si l'objet n'appartient à aucune instance.
   */
  public getPrefabInstanceRoot(id: string): string | null {
    const obj = this.objects.get(id);
    const instanceId = (obj?.userData as { prefabInstanceId?: string } | undefined)
      ?.prefabInstanceId;
    if (!obj || !instanceId) return null;
    let current = obj;
    while (current.parent && this.objects.has(current.parent.uuid)) {
      const pu = current.parent.userData as { prefabInstanceId?: string } | undefined;
      if (pu?.prefabInstanceId !== instanceId) break;
      current = current.parent;
    }
    return current.uuid;
  }

  /** Détache une instance de son prefab (devient des objets ordinaires). */
  public unlinkPrefabInstance(rootId: string): void {
    const root = this.objects.get(rootId);
    if (!root) return;
    const instanceId = (root.userData as { prefabInstanceId?: string } | undefined)
      ?.prefabInstanceId;
    const strip = (o: THREE.Object3D): void => {
      if (o.userData) {
        delete (o.userData as { prefabId?: string }).prefabId;
        delete (o.userData as { prefabInstanceId?: string }).prefabInstanceId;
      }
    };
    strip(root);
    const walk = (o: THREE.Object3D): void => {
      for (const child of o.children) {
        if (!this.objects.has(child.uuid)) continue;
        const cu = child.userData as { prefabInstanceId?: string } | undefined;
        if (!instanceId || cu?.prefabInstanceId === instanceId) strip(child);
        walk(child);
      }
    };
    walk(root);
    this.notifyHierarchy();
    this.saveHistoryState();
  }

  /**
   * Revert : supprime l'instance et la ré-instancie depuis le template,
   * reposée au même endroit (monde) et même niveau hiérarchique.
   * Les overrides locaux sont abandonnés (sémantique Unity).
   */
  public revertPrefabInstance(rootId: string, templateNodes: any[]): boolean {
    const root = this.objects.get(rootId);
    if (!root || !Array.isArray(templateNodes) || templateNodes.length === 0) return false;
    root.updateWorldMatrix(true, false);
    const worldPos = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
    const parent = root.parent && this.objects.has(root.parent.uuid) ? root.parent : null;
    const prefabId = (root.userData as { prefabId?: string } | undefined)?.prefabId;
    this.deleteSingleObject(rootId);
    this.instantiatePrefab(
      templateNodes,
      { x: worldPos.x, y: worldPos.y, z: worldPos.z },
      prefabId ? { prefabId } : undefined
    );
    // Replace au niveau d'origine (monde préservé tel qu'instancié).
    const newRoots = this.selection.getSelectedObjects();
    if (parent && newRoots.length === 1) {
      this.setParent(newRoots[0].uuid, parent.uuid, true);
    }
    return true;
  }

  public focusOnObject(id?: string): void {    const targetObj = id ? this.objects.get(id) : this.selectedObject;
    if (!targetObj) return;
    this.cameraManager.focusOnObject(targetObj);
  }

  public resetCamera(): void {
    this.cameraManager.resetCamera();
  }

  public setCameraView(view: CameraViewPreset): void {
    this.cameraManager.setCameraView(view);
  }

  /**
   * Cadre toute la scène (touche `Home`, comme dans le viewport Blender).
   * Le cadrage est calculé sur les objets réellement présents, donc invisible
   * et hors caméra exclus.
   */
  public frameAll(): void {
    this.cameraManager.frameAll(this.objects.values());
  }

  /**
   * Updates Terrain configuration & visibility
   */
  public updateTerrainConfig(config: Partial<TerrainConfig>): void {
    if (!this.terrainGenerator) return;
    const prevChunks = this.terrainGenerator.config.chunks;
    const prevSize = this.terrainGenerator.config.splatSize;
    this.terrainGenerator.config = {
      ...this.terrainGenerator.config,
      ...config,
    };
    if (this.terrainGenerator.mesh) {
      this.terrainGenerator.mesh.visible = this.terrainGenerator.config.enabled;
    }
    this.terrainGenerator.details.group.visible = this.terrainGenerator.config.enabled;
    // Rebuild views si la structure change (chunks, splat, wireframe…).
    if (
      this.terrainGenerator.config.chunks !== prevChunks ||
      this.terrainGenerator.config.splatSize !== prevSize ||
      config.resolution !== undefined ||
      config.size !== undefined
    ) {
      this.terrainGenerator.syncConfig();
    }
  }

  public handleResize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.cameraManager.handleResize(width, height);
    this.renderPipeline.setSize(width, height);
    if (this.atmosphereManager) {
      this.atmosphereManager.setSize(width, height);
    }
  }

  /**
   * Updates Terrain Brush settings from UI
   */
  public setTerrainBrush(brush: Partial<TerrainBrushConfig>): void {
    this.terrainBrush = {
      ...this.terrainBrush,
      ...brush,
    };
    // Passer en pinceau quitte le mode Sélection : la sélection foliage part.
    if (brush.mode !== undefined && brush.mode !== 'none') {
      this.clearFoliageSelection();
    }
    if (this.terrainBrush.mode === 'none') {
      if (this.brushMarkerMesh) this.brushMarkerMesh.visible = false;
      this.cameraManager.setOrbitEnabled(true);
    }
  }

  /**
   * Procedural terrain regeneration
   */
  public regenerateTerrain(seed?: number): void {
    if (!this.terrainGenerator) return;
    if (this.terrainGenerator.mesh) {
      this.scene.remove(this.terrainGenerator.mesh);
    }
    this.terrainGenerator.regenerate(seed);
    if (this.terrainGenerator.mesh) {
      this.scene.add(this.terrainGenerator.mesh);
    }
    if (this.foliagePainter) {
      this.foliagePainter.adjustFoliageHeights(this.terrainGenerator);
    }
  }

  /**
   * Reset/clear foliage layers
   */
  public clearFoliage(): void {
    if (!this.foliagePainter) return;
    this.foliagePainter.clearAll();
    this.clearFoliageSelection();
  }

  // -------------------------------------------------------------------------
  // Selection & édition des instances foliage (objets low-poly peints)
  // -------------------------------------------------------------------------

  /** Raycast des instances peintes (avec occlusion terrain) au pointerdown. */
  private tryPickFoliage(e: PointerEvent): boolean {
    // Sans panneau Terrain, aucune sélection foliage n'est affichée : on ne
    // consomme pas le clic (sinon il serait avalé inutilement).
    if (!this.foliagePainter || !this.events.onFoliageSelectionChange) return false;
    const raycaster = this.selection.setRayFromScreen(e.clientX, e.clientY);
    const hit = this.foliagePainter.pick(raycaster);
    if (!hit) return false;

    // Test d'occlusion : une instance derrière une colline n'est pas cliquable.
    if (this.terrainGenerator?.mesh) {
      const terrainHits = this.terrainGenerator.raycastTerrain(raycaster);
      if (terrainHits.length > 0 && terrainHits[0].distance < hit.distance) return false;
    }

    this.foliageSelection = { type: hit.type, instanceId: hit.instanceId };
    this.foliagePainter.setSelection(hit.type, hit.instanceId);
    if (this.selectedObject) this.deselect();
    this.foliagePickConsumed = true;
    this.events.onFoliageSelectionChange?.(this.getFoliageSelectionInfo());
    return true;
  }

  /** Info d'édition de l'instance sélectionnée (null si sélection invalide). */
  public getFoliageSelectionInfo(): FoliageSelectionInfo | null {
    const sel = this.foliageSelection;
    if (!sel || !this.foliagePainter) return null;
    const inst = this.foliagePainter.getInstance(sel.type, sel.instanceId);
    if (!inst) {
      this.foliageSelection = null;
      this.foliagePainter.clearSelection();
      this.events.onFoliageSelectionChange?.(null);
      return null;
    }

    const entry = this.foliagePainter.getEntry(sel.type);
    const terrainY = this.terrainGenerator?.getHeightAt(inst.x, inst.z);
    let yOff = inst.yOff;
    if (yOff === undefined) {
      yOff = terrainY !== undefined ? inst.y - terrainY : 0;
    }

    return {
      type: sel.type,
      instanceId: sel.instanceId,
      name: entry?.name ?? sel.type,
      category: entry?.category ?? 'Divers',
      scale: inst.scale,
      rotY: inst.rotY,
      yOff,
    };
  }

  /** Applique un patch (échelle / rotation / altitude) à l'instance sélectionnée. */
  public updateSelectedFoliage(patch: FoliageEditPatch): void {
    const sel = this.foliageSelection;
    if (!sel || !this.foliagePainter) return;
    const inst = this.foliagePainter.getInstance(sel.type, sel.instanceId);
    if (!inst) return;

    const full: Partial<Pick<typeof inst, 'y' | 'rotY' | 'scale' | 'yOff'>> = {};
    if (patch.scale !== undefined) full.scale = Math.min(20, Math.max(0.05, patch.scale));
    if (patch.rotY !== undefined) full.rotY = patch.rotY;
    if (patch.yOff !== undefined) {
      const oldOff = inst.yOff ?? 0;
      const terrainY = this.terrainGenerator
        ? this.terrainGenerator.getHeightAt(inst.x, inst.z)
        : inst.y - oldOff;
      full.yOff = patch.yOff;
      full.y = terrainY + patch.yOff;
    }

    this.foliagePainter.updateInstance(sel.type, sel.instanceId, full);
    this.events.onFoliageSelectionChange?.(this.getFoliageSelectionInfo());
    this.scheduleFoliageHistory();
  }

  /** Supprime l'instance sélectionnée de son calque. */
  public deleteSelectedFoliage(): void {
    const sel = this.foliageSelection;
    if (!sel || !this.foliagePainter) return;
    const removed = this.foliagePainter.removeInstance(sel.type, sel.instanceId);
    this.foliageSelection = null;
    this.foliagePainter.clearSelection();
    if (removed) this.saveHistoryState();
    this.events.onFoliageSelectionChange?.(null);
  }

  public clearFoliageSelection(): void {
    if (!this.foliageSelection) return;
    this.foliageSelection = null;
    this.foliagePainter?.clearSelection();
    this.events.onFoliageSelectionChange?.(null);
  }

  /** Historique/Sauvegarde différée pendant une série de sliders (500 ms). */
  private scheduleFoliageHistory(): void {
    if (this.foliageHistoryTimer) clearTimeout(this.foliageHistoryTimer);
    this.foliageHistoryTimer = setTimeout(() => {
      this.foliageHistoryTimer = null;
      this.saveHistoryState();
    }, 500);
  }

  /** Stats terrain 4.3 pour l'UI (chunks, LOD, détails, trous, worker). */
  public getTerrainStats(): {
    mode: string;
    tiles: number;
    lod0: number;
    lod1: number;
    detailChunks: number;
    detailBuilt: number;
    holes: number;
    strokes: number;
    worker: boolean;
  } | null {
    try {
      return this.terrainGenerator ? this.terrainGenerator.getStats() : null;
    } catch {
      return null;
    }
  }

  /**
   * Synchronize Water Mesh registration with SceneManager objects map for viewport selection
   */
  public syncWaterMeshRegistration(): void {
    if (!this.waterManager) return;
    const mesh = this.waterManager.waterMesh;
    if (this.waterManager.config.enabled && mesh) {
      if (!mesh.name || mesh.name === '__AETHER_WATER_OCEAN__') {
        mesh.name = "Plan d'Eau (Océan)";
      }
      mesh.userData = { subType: 'water', isWaterSystem: true };
      if (!this.objects.has(mesh.uuid)) {
        this.objects.set(mesh.uuid, mesh);
        this.notifyHierarchy();
      }
    } else if (mesh && this.objects.has(mesh.uuid)) {
      if (this.selectedObject === mesh) {
        this.deselect();
      }
      this.objects.delete(mesh.uuid);
      this.notifyHierarchy();
    }
  }

  /**
   * Update Atmosphere settings
   */
  public updateAtmosphere(data: Partial<AtmosphereData>): void {
    if (!this.atmosphereManager) return;
    this.atmosphereManager.updateAtmosphere(data);

    if (data.water && this.waterManager) {
      this.waterManager.setConfig(data.water);
      this.waterManager.setSunDirection(this.dirLight.position, this.dirLight.color);
      this.syncWaterMeshRegistration();
    }

    if (this.physicsManager.environmentalPhysics) {
      if (data.wind) {
        this.physicsManager.environmentalPhysics.setWindConfig(data.wind);
      }
      if (data.rain) {
        this.physicsManager.environmentalPhysics.setRainConfig(data.rain);
      }
    }
  }

  /**
   * Update Post-Processing settings
   */
  public updatePostProcessing(data: Partial<PostProcessingData>): void {
    if (this.atmosphereManager) {
      this.atmosphereManager.updatePostProcessing(data);
    }
    this.renderPipeline.updatePostProcessing(data);
  }

  /**
   * Apply a Sky/Atmosphere preset
   */
  public applySkyPreset(preset: SkyPreset): void {
    if (!this.atmosphereManager) return;
    this.atmosphereManager.applyPreset(preset);
  }

  /**
   * Update HUD configuration
   */
  public updateHUDConfig(config: Partial<HUDConfig>): void {
    this.hudConfig = {
      ...this.hudConfig,
      ...config,
    };
    // 4.4 : resynchronise les écrans moteur + variables.
    try {
      this.guiManager.syncScreens(this.hudConfig.screens ?? []);
      this.guiManager.syncVariables(this.hudConfig.variables ?? {});
    } catch {
      /* ignore */
    }
    // Synchronise l'état React (overlay HUD).
    this.events.onHUDConfigChange?.(this.hudConfig);
    // Persistance : sans mutation de scène, l'éditeur HUD ne serait jamais
    // autosauvegardé et les widgets ajoutés disparaîtraient au rechargement.
    this.scheduleAutosave();
  }

  /**
   * Export Scene to custom structured JSON
   */
  public exportScene(): SceneExportData {
    const exportNodes: SceneExportData['nodes'] = [];

    // Parcours profondeur scène (ordre des frères préservé, parents avant
    // enfants) : seuls les objets enregistrés sont exportés.
    const visit = (obj: THREE.Object3D): void => {
      // Avatars réseau éphémères : jamais persistés.
      if ((obj.userData as Record<string, unknown> | undefined)?.netEphemeral === true) return;
      if (this.objects.has(obj.uuid)) {
        const node = this.toSceneNode(obj);
        exportNodes.push({
          id: node.id,
          name: node.name,
          type: node.type,
          subType: node.subType,
          parentId: node.parentId,
          prefabId: node.prefabId,
          prefabInstanceId: node.prefabInstanceId,
          lowPolyId: node.lowPolyId,
          palette: node.palette,
          repeat: node.repeat,
          repeatOf: node.repeatOf,
          transform: node.transform,
          material: node.material,
          light: node.light,
          physics: node.physics,
          logic: node.logic,
          rigAnim: node.rigAnim,
          modelInfo: node.modelInfo,
          particles: node.particles,
          riverConfig: node.riverConfig,
          spawnPoint: node.spawnPoint,
          animator: node.animator,
          collabId: node.collabId,
          visible: node.visible,
          castShadow: node.castShadow,
          receiveShadow: node.receiveShadow,
        });
      }
      for (const child of [...obj.children]) visit(child);
    };
    for (const child of [...this.scene.children]) visit(child);

    const now = new Date().toISOString();
    const finiteOr = (v: number, fallback: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? v : fallback;

    return {
      version: FORMAT_VERSION,
      generator: 'Aether 3D Engine Studio',
      timestamp: now,
      meta: {
        generator: 'Aether 3D Engine Studio',
        exportedAt: now,
        nodeCount: exportNodes.length,
        formatVersion: FORMAT_VERSION,
      },
      settings: {
        workPlane: { ...this.workPlaneConfig },
        renderMode: this.renderPipeline.getRenderMode(),
        snapping: this.selection.isSnappingEnabled,
        snap: { ...this.selection.getSnapSettings() },
        lod: { ...this.lodConfig },
        culling: { ...this.cullingConfig },
      },
      environment: {
        backgroundColor: this.atmosphereManager ? this.atmosphereManager.atmosphere.fog.color : '#0c0e14',
        ambientIntensity: finiteOr(this.ambientLight.intensity, 0.85),
        sunIntensity: finiteOr(this.dirLight.intensity, 2.2),
        sunPosition: {
          x: finiteOr(this.dirLight.position.x, 5),
          y: finiteOr(this.dirLight.position.y, 10),
          z: finiteOr(this.dirLight.position.z, 7),
        },
      },
      atmosphere: this.atmosphereManager ? this.atmosphereManager.atmosphere : undefined,
      postProcessing: this.atmosphereManager ? this.atmosphereManager.postProcessing : undefined,
      terrain: this.terrainGenerator
        ? {
            config: this.terrainGenerator.config,
            heightmap: this.terrainGenerator.exportHeightmap(),
            foliageLayers: this.foliagePainter ? this.foliagePainter.exportLayers() : [],
            detail: this.terrainGenerator.exportDetailData(),
          }
        : undefined,
      hud: this.hudConfig,
      nodes: exportNodes,
    };
  }

  /**
   * Exporte la géométrie de la scène en GLB binaire (Three.js GLTFExporter).
   * Seuls les enfants top-level contenant des objets enregistrés partent dans
   * le GLB (helpers, lumières globales et terrain exclus). Chaque objet
   * enregistré reçoit temporairement `userData.__aetherId = uuid` : le
   * runtime HTML exporté s'en sert pour ré-associer nœuds JSON ↔ objets GLB.
   * Retourne null si échec (le runtime retombe sur la reconstruction JSON).
   */
  public async exportSceneGLTF(): Promise<Uint8Array | null> {
    const containsRegistered = (obj: THREE.Object3D): boolean => {
      if ((obj.userData as Record<string, unknown> | undefined)?.netEphemeral === true) return false;
      // Lumières / caméras : toujours reconstruites depuis le JSON (jamais
      // embarquées dans le GLB, sinon doublons au runtime).
      if (obj instanceof THREE.Light || obj instanceof THREE.Camera) return false;
      if (this.objects.has(obj.uuid)) return true;
      for (const child of obj.children) if (containsRegistered(child)) return true;
      return false;
    };
    const roots: THREE.Object3D[] = [];
    for (const child of [...this.scene.children]) {
      if (containsRegistered(child)) roots.push(child);
    }
    if (roots.length === 0) return null;

    const stamped: THREE.Object3D[] = [];
    for (const root of roots) {
      root.traverse((o) => {
        if (o instanceof THREE.Light || o instanceof THREE.Camera) return;
        if (this.objects.has(o.uuid)) {
          o.userData.__aetherId = o.uuid;
          stamped.push(o);
        }
      });
    }
    try {
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(roots, { binary: true, onlyVisible: true });
      if (result instanceof ArrayBuffer) return new Uint8Array(result);
      console.warn('[Scene] export GLTF : format inattendu, fallback JSON');
      return null;
    } catch (err) {
      console.warn('[Scene] export GLTF échoué, fallback reconstruction JSON :', err);
      return null;
    } finally {
      for (const o of stamped) delete o.userData.__aetherId;
    }
  }

  /**
   * Rebuild and load scene from JSON.
   * Validation + migration AVANT toute application : un fichier invalide
   * throw (SceneValidationError / NewerVersionError) sans toucher la scène.
   * Les snapshots internes (undo) passent skipValidation:true.
   */
  public importScene(input: SceneExportData, opts?: { skipValidation?: boolean }): void {
    let data = input;
    if (!opts?.skipValidation) {
      const prepared = prepareScene(input);
      data = prepared.data;
      for (const w of [...prepared.applied, ...prepared.warnings]) {
        console.info(`[Scene] import : ${w}`);
      }
    }
    // Les blobs assets survivent (releaseAssets:false) pour être re-référencés
    // par les objets reconstruits ; les suivis runtime repartent de zéro.
    // Le remap oldId → objet est reconstruit (restaurations async de modèles).
    this.importIdRemap = new Map();
    this.clearUserScene({ releaseAssets: false });
    this.lodManager.clear();
    this.impostorManager.clear();
    this.occlusionManager.clear();
    this.animatorSystem.clear();
    this.textureStreamer.clear();

    if (data.atmosphere && this.atmosphereManager) {
      this.atmosphereManager.updateAtmosphere(data.atmosphere);
    }
    if (data.postProcessing && this.atmosphereManager) {
      this.atmosphereManager.updatePostProcessing(data.postProcessing);
    }
    if (data.hud) {
      this.hudConfig = data.hud;
      try {
        this.guiManager.syncScreens(this.hudConfig.screens ?? []);
        this.guiManager.syncVariables(this.hudConfig.variables ?? {});
      } catch {
        /* ignore */
      }
      // Restauration (autosave/undo/import) : resynchronise l'overlay React,
      // sinon l'état conserve les défauts et le HUD chargé reste invisible.
      this.events.onHUDConfigChange?.(this.hudConfig);
    }
    // 3.4 : config LOD / culling persistée (défauts si absente).
    if (data.settings?.lod) this.setLODConfig(data.settings.lod);
    if (data.settings?.culling) this.setCullingConfig(data.settings.culling);
    if (data.terrain && this.terrainGenerator) {
      if (data.terrain.config) {
        this.terrainGenerator.config = { ...this.terrainGenerator.config, ...data.terrain.config };
        this.terrainGenerator.syncConfig();
      }
      if (data.terrain.heightmap && data.terrain.heightmap.length > 0) {
        this.terrainGenerator.importHeightmap(data.terrain.heightmap);
      }
      if (data.terrain.foliageLayers && this.foliagePainter) {
        this.clearFoliageSelection();
        this.foliagePainter.importLayers(data.terrain.foliageLayers);
        this.foliagePainter.adjustFoliageHeights(this.terrainGenerator);
      }
      // 4.3 : splat strokes, trous, peinture de détails.
      if (data.terrain.detail) {
        this.terrainGenerator.importDetailData(data.terrain.detail);
      }
    }

    if (data.environment) {
      this.ambientLight.intensity = data.environment.ambientIntensity || 0.85;
      this.dirLight.intensity = data.environment.sunIntensity || 2.2;
      if (data.environment.sunPosition) {
        this.dirLight.position.set(
          data.environment.sunPosition.x,
          data.environment.sunPosition.y,
          data.environment.sunPosition.z
        );
      }
    }

    if (Array.isArray(data.nodes)) {
      data.nodes.forEach((item) => {
        let created: THREE.Object3D | null = null;
        const subType = item.subType || 'cube';

        // Rivière procédurale : reconstruction dédiée (sans re-sculptage du terrain).
        if (item.type === 'mesh' && subType === 'river') {
          this.restorer.restoreRiver(item);
          return;
        }

        // Groupes (joueur, PNJ, véhicule, particules, trigger, checkpoint, modèle...).
        // Ils étaient auparavant abandonnés à l'import (joueur perdu au reload/undo).
        if (item.type === 'group') {
          this.restorer.restoreGroup(item);
          return;
        }

        if (item.type === 'mesh') {
          // Bibliothèque low-poly : clone async depuis la palette GLB
          // (mêmes modèles que l'instantiateur de prefab).
          if (subType === 'lowPoly') {
            void this.restorer.restoreLowPoly(item);
            return;
          }
          const mat = new THREE.MeshStandardMaterial({
            color: item.material?.color || '#3b82f6',
            roughness: item.material?.roughness ?? 0.35,
            metalness: item.material?.metalness ?? 0.2,
            wireframe: item.material?.wireframe ?? false,
            opacity: item.material?.opacity ?? 1,
            transparent: item.material?.transparent ?? false,
            emissive: new THREE.Color(item.material?.emissive || '#000000'),
            emissiveIntensity: item.material?.emissiveIntensity || 0,
          });

          if (item.material?.texturePreset && item.material.texturePreset !== 'none') {
            const normalTex = TextureGenerator.getNormalMap(item.material.texturePreset);
            if (normalTex) {
              mat.normalMap = normalTex;
              mat.normalScale.set(0.6, 0.6);
            }
          }

          let geo: THREE.BufferGeometry;
          switch (subType) {
            case 'sphere':
              geo = new THREE.SphereGeometry(0.9, 36, 36);
              break;
            case 'cylinder':
              geo = new THREE.CylinderGeometry(0.75, 0.75, 1.8, 36);
              break;
            case 'plane':
              geo = new THREE.PlaneGeometry(3, 3);
              break;
            case 'torus':
              geo = new THREE.TorusGeometry(0.8, 0.25, 24, 48);
              break;
            case 'cone':
              geo = new THREE.ConeGeometry(0.9, 1.8, 32);
              break;
            case 'postProcessVolume':
              geo = new THREE.BoxGeometry(8, 5, 8);
              break;
            case 'cube':
            default:
              geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
              break;
          }

          created = new THREE.Mesh(geo, mat);
          if (subType === 'postProcessVolume') {
            mat.color.set(item.material?.color || '#d946ef');
            mat.wireframe = item.material?.wireframe ?? true;
            mat.transparent = true;
            mat.opacity = item.material?.opacity ?? 0.55;
          }
          created.userData = { subType, texturePreset: item.material?.texturePreset };
        } else if (item.type === 'light') {
          if (subType === 'point') {
            const light = new THREE.PointLight(
              item.light?.color || 0x38bdf8,
              item.light?.intensity || 3.5,
              item.light?.distance || 18
            );
            light.add(new THREE.PointLightHelper(light, 0.3));
            created = light;
            created.userData = { subType: 'point' };
          } else {
            created = new THREE.DirectionalLight(
              item.light?.color || 0xffffff,
              item.light?.intensity || 2.0
            );
            created.userData = { subType: 'directional' };
          }
        }

        if (created) {
          created.name = item.name;
          created.position.set(
            item.transform.position.x,
            item.transform.position.y,
            item.transform.position.z
          );
          created.rotation.set(
            THREE.MathUtils.degToRad(item.transform.rotation.x),
            THREE.MathUtils.degToRad(item.transform.rotation.y),
            THREE.MathUtils.degToRad(item.transform.rotation.z)
          );
          created.scale.set(
            item.transform.scale.x,
            item.transform.scale.y,
            item.transform.scale.z
          );
          created.visible = item.visible;
          created.castShadow = item.castShadow;
          created.receiveShadow = item.receiveShadow;
          if (item.physics) {
            created.userData = created.userData || {};
            created.userData.physics = item.physics;
          }
          if (item.logic) {
            created.userData = created.userData || {};
            created.userData.logic = item.logic;
          }
          if (item.modelInfo) {
            created.userData = created.userData || {};
            created.userData.modelInfo = item.modelInfo;
          }
          if (item.rigAnim) {
            created.userData = created.userData || {};
            created.userData.rigAnim = item.rigAnim;
          }
          if (item.spawnPoint) {
            created.userData = created.userData || {};
            created.userData.spawnPoint = item.spawnPoint;
          }
          if (item.animator) {
            created.userData = created.userData || {};
            created.userData.animator = normalizeAnimatorController(item.animator);
          }
          if (item.collabId) {
            created.userData = created.userData || {};
            (created.userData as { collabId?: string }).collabId = item.collabId;
          }
          // Rattachement prefab (Apply/Revert/Unlink dans l'Inspector).
          if (item.prefabId) {
            created.userData = created.userData || {};
            (created.userData as { prefabId?: string }).prefabId = item.prefabId;
          }
          if (item.prefabInstanceId) {
            created.userData = created.userData || {};
            (created.userData as { prefabInstanceId?: string }).prefabInstanceId =
              item.prefabInstanceId;
          }

          this.adoptImportId(created, item.id);
          this.registerObject(created);
          this.trackImportId(item, created);

          if (item.rigAnim) {
            this.setRigAnim(created.uuid, item.rigAnim);
          }

          // Restaure le rendu Toon & Contours sauvegardé (undo/redo, JSON)
          const toonIntensity = item.material?.toonIntensity;
          const outlineColor = item.material?.outlineColor;
          const outlineThickness = item.material?.outlineThickness;
          if (toonIntensity !== undefined || outlineColor !== undefined || outlineThickness !== undefined) {
            this.syncECSComponents(created.uuid, { toonIntensity, outlineColor, outlineThickness });
          }
          // 4.2 — relie l'animator restauré.
          if (item.animator) this.animatorSystem.bind(created.uuid);
        }
      });
    }

    // Passe 2 : rattache les parents (plain .add — les locales stockées
    // sont déjà correctes). Les modèles async s'attachent à complétion
    // via importIdRemap (restoreModelNode) ; les irrésolus patientent.
    this.pendingParentAttaches = [];
    for (const item of data.nodes) {
      if (!item.parentId || !item.id) continue;
      const child = this.importIdRemap.get(item.id);
      if (!child) continue;
      if (!this.attachImportParent(item, child)) {
        this.pendingParentAttaches.push({ item, obj: child });
      }
    }
    this.sweepPendingParents();

    // Réglages éditeur persistés (1.3.0+ : plan de travail, rendu, snap).
    if (data.settings) {
      if (data.settings.workPlane) {
        try {
          this.setWorkPlaneConfig(data.settings.workPlane);
        } catch {
          /* config partielle : on ignore */
        }
      }
      if (data.settings.renderMode) {
        try {
          this.setRenderMode(data.settings.renderMode);
        } catch {
          /* ignore */
        }
      }
      if (typeof data.settings.snapping === 'boolean') {
        try {
          this.selection.setSnapping(data.settings.snapping);
        } catch {
          /* ignore */
        }
      }
      // TIER 2.4 : réglages snap complets (priorité sur le booléen legacy)
      if (data.settings.snap && typeof data.settings.snap === 'object') {
        try {
          const raw = data.settings.snap;
          const patch: Partial<SnapSettings> = {};
          if (typeof raw.enabled === 'boolean') patch.enabled = raw.enabled;
          if (raw.mode === 'grid' || raw.mode === 'surface' || raw.mode === 'vertex') {
            patch.mode = raw.mode;
          }
          if (typeof raw.translateSnap === 'number' && Number.isFinite(raw.translateSnap)) {
            patch.translateSnap = raw.translateSnap;
          }
          if (typeof raw.rotateSnapDeg === 'number' && Number.isFinite(raw.rotateSnapDeg)) {
            patch.rotateSnapDeg = raw.rotateSnapDeg;
          }
          if (raw.scaleSnap === null) {
            patch.scaleSnap = null;
          } else if (typeof raw.scaleSnap === 'number' && Number.isFinite(raw.scaleSnap)) {
            patch.scaleSnap = raw.scaleSnap;
          }
          if (typeof raw.vertexThreshold === 'number' && Number.isFinite(raw.vertexThreshold)) {
            patch.vertexThreshold = raw.vertexThreshold;
          }
          if (typeof raw.surfaceMaxDrop === 'number' && Number.isFinite(raw.surfaceMaxDrop)) {
            patch.surfaceMaxDrop = raw.surfaceMaxDrop;
          }
          if (Object.keys(patch).length > 0) this.selection.setSnapSettings(patch);
        } catch {
          /* ignore */
        }
      }
    }

    this.notifyHierarchy();
    this.resetCamera();
    this.scheduleAutosave();
    // Les modèles restaurés se ré-acquièrent via registerObject/finalize ;
    // la réconciliation répare les comptes (mark-and-sweep).
    void this.reconcileAssetReferences().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Sérialisation — façade binaire + politiques d'import (TIER 1.4)
  // ---------------------------------------------------------------------------

  /** Export binaire MessagePack (`.aether`, heightmap float32 compact). */
  public exportSceneBinary(): Uint8Array<ArrayBuffer> {
    return encodeSceneBinary(this.exportScene());
  }

  /**
   * Décode un buffer `.aether` SANS l'appliquer (validation + migration
   * incluses). Throw NewerVersionError / SceneValidationError.
   */
  public decodeSceneBinary(bytes: Uint8Array): SceneExportData {
    const { data } = decodeSceneBinary(bytes);
    return prepareScene(data).data;
  }

  /** Import binaire `.aether` (mêmes garanties que l'import JSON). */
  public importSceneBinary(bytes: Uint8Array, policy: ImportPolicy = 'replace'): { warnings: string[] } {
    return this.importSceneWithPolicy(this.decodeSceneBinary(bytes), policy);
  }

  // --- Slots de sauvegarde locale (conflits, filets de sécurité) ---

  public backupSceneNow(): string {
    return this.history.backupNow();
  }

  public listSceneBackups(): BackupInfo[] {
    return this.history.listBackups();
  }

  public deleteSceneBackup(key: string): void {
    this.history.deleteBackup(key);
  }

  /** Restaure un slot (false si illisible). L'UI doit resynchroniser ses états. */
  public restoreSceneBackup(key: string): boolean {
    return this.history.restoreBackup(key);
  }

  /** Détecte un conflit entre la scène courante et des données entrantes. */
  public detectConflictWithCurrent(incoming: SceneExportData): SceneConflict {
    const current = this.exportScene();
    return detectImportConflict(
      { timestamp: current.timestamp, nodes: current.nodes.length },
      incoming
    );
  }

  /**
   * Import avec politique de conflit :
   * - 'replace' : sauvegarde auto de la scène courante puis remplace.
   * - 'merge' : nœuds ajoutés (UUIDs frais), environnement courant conservé.
   * - 'cancel' : rien n'est appliqué.
   */
  public importSceneWithPolicy(
    input: SceneExportData,
    policy: ImportPolicy = 'replace'
  ): { warnings: string[] } {
    if (policy === 'cancel') return { warnings: ['Import annulé par l\'utilisateur.'] };
    const prepared = prepareScene(input);
    const warnings = [...prepared.applied, ...prepared.warnings];
    if (policy === 'merge') {
      const current = this.exportScene();
      const merged = mergeScenes(current, prepared.data);
      warnings.push(...merged.warnings);
      this.importScene(merged.data, { skipValidation: true });
      return { warnings };
    }
    // replace : backup de sécurité AVANT d'écraser.
    try {
      const key = backupCurrentScene(this.exportScene());
      warnings.push(`Scène précédente sauvegardée (${key}).`);
    } catch (err) {
      warnings.push(
        `Sauvegarde préalable impossible : ${err instanceof Error ? err.message : err}`
      );
    }
    this.importScene(prepared.data, { skipValidation: true });
    return { warnings };
  }


  // --- Restauration de nœud : voir lib/scene/nodeRestorer.ts (port NodeRestorePort). ---
  private get restorer(): NodeRestorer {
    if (!this._restorer) {
      this._restorer = new NodeRestorer(this.nodeRestorePort());
    }
    return this._restorer;
  }

  /**
   * Adaptateur explicite vers `NodeRestorePort`.
   *
   * On n'expose pas les membres privés de SceneManager au restaurateur : on
   * construit un objet littéral qui n'expose que le strict nécessaire. Le
   * contrat du restorer's est ainsi vérifiable par le compilateur, et
   * SceneManager garde la maîtrise de ses invariants.
   */
  private nodeRestorePort(): NodeRestorePort {
    const sm = this;
    return {
      get ecsWorld() {
        return sm.ecsWorld;
      },
      get dirLight() {
        return sm.dirLight;
      },
      get riverMeshes() {
        return sm.riverMeshes;
      },
      get foliagePainter() {
        return sm.foliagePainter;
      },
      get foliageLibraryPromise() {
        return sm.foliageLibraryPromise;
      },
      get animatorSystem() {
        return sm.animatorSystem;
      },
      get scene() {
        return sm.scene;
      },
      get objects() {
        return sm.objects;
      },
      registerObject: (obj) => sm.registerObject(obj),
      addPrimitive: (type, pos, opts) => sm.addPrimitive(type, pos, opts),
      restoreModelNode: (item) => {
        void sm.restoreModelNode(item);
      },
      adoptImportId: (obj, id) => sm.adoptImportId(obj, id),
      trackImportId: (item, obj) => sm.trackImportId(item, obj),
      attachImportParent: (item, obj) => sm.attachImportParent(item, obj),
      enqueuePendingParent: (item, obj) => {
        sm.pendingParentAttaches.push({ item, obj });
      },
      sweepPendingParents: () => sm.sweepPendingParents(),
      updatePhysics: (id, physics) => sm.updatePhysics(id, physics as Partial<PhysicsNodeData>),
      updateLogic: (id, logic) => sm.updateLogic(id, logic as Partial<EntityLogicData>),
      updateParticlesConfig: (id, config) =>
        sm.updateParticlesConfig(id, config as Partial<ParticleEmitterData>),
      setRigAnim: (id, data) => sm.setRigAnim(id, data as Partial<RigAnimData>),
      syncECSComponents: (id, data) => sm.syncECSComponents(id, data as Partial<MaterialData>),
      notifyHierarchy: () => sm.notifyHierarchy(),
    };
  }

  /**
   * Restaure un modèle importé : binaire rechargé depuis IndexedDB puis
   * réimporté par le pipeline standard. Placeholder si le binaire est absent.
   */
  private async restoreModelNode(item: RestoredNode): Promise<void> {
    const name = item.name || 'Restored_Model';
    const storageId = item.modelInfo?.storageId;
    const spawnPlaceholder = (): void => {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true });
      const placeholder = new THREE.Mesh(geo, mat);
      placeholder.userData = {
        subType: 'model',
        placeholder: true,
        modelInfo: item.modelInfo,
      };
      this.adoptImportId(placeholder, item.id);
      this.restorer.applyOverlay(placeholder, item);
      this.registerObject(placeholder);
      this.trackImportId(item, placeholder);
      this.attachImportParent(item, placeholder);
      this.notifyHierarchy();
    };
    if (!storageId) {
      console.warn(
        `Modèle '${name}' non restauré : importé avant l'autosave, réimportez le fichier.`
      );
      spawnPlaceholder();
      return;
    }
    try {
      // Asset Pipeline (nouveau store + repli legacy automatique).
      const binary = await this.assetDatabase.getBinary(storageId);
      if (!binary) {
        console.warn(
          `Modèle '${name}' non restauré : binaire introuvable, réimportez le fichier.`
        );
        spawnPlaceholder();
        return;
      }
      const node = await this.importGLTF(binary, item.modelInfo?.originalName || name, {
        silent: true,
        storageId,
        preserveId: item.id,
      });
      const obj = this.objects.get(node.id);
      if (obj) {
        this.restorer.applyOverlay(obj, item);
        this.trackImportId(item, obj);
        if (!this.attachImportParent(item, obj)) {
          this.pendingParentAttaches.push({ item, obj });
        }
        this.sweepPendingParents();
      }
      this.notifyHierarchy();
      // Les restaurations async se terminent après le reconcile d'importScene :
      // on répare les comptes une fois l'objet ré-acquis.
      void this.reconcileAssetReferences().catch(() => {});
    } catch (err) {
      console.warn(`Restauration du modèle '${name}' impossible.`, err);
      spawnPlaceholder();
    }
  }

  public clearUserScene(opts?: { releaseAssets?: boolean }): void {
    this.deselect();
    // Une session réseau ne survit pas au vidage/changement de scène.
    this.stopNet();
    // Par défaut on libère les références assets (scène vidée par l'utilisateur).
    // `importScene` passe releaseAssets:false : les blobs doivent survivre pour
    // être re-référencés juste après (la réconciliation finale répare les comptes).
    const releaseAssets = opts?.releaseAssets !== false;
    if (releaseAssets) {
      const releases: Promise<unknown>[] = [];
      this.objects.forEach((obj) => {
        releases.push(this.assetDatabase.releaseOwner(obj.uuid).catch(() => {}));
      });
      void Promise.all(releases).catch(() => {});
      this.lodManager.clear();
      this.impostorManager.clear();
      this.occlusionManager.clear();
      this.animatorSystem.clear();
      this.textureStreamer.clear();
    }
    this.objects.forEach((obj) => {
      this.scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    });
    this.riverMeshes.forEach((r) => r.dispose());
    this.riverMeshes = [];
    this.objects.clear();
    this.renderPipeline.clearOriginalMaterials();
    this.notifyHierarchy();
    this.scheduleAutosave();
  }

  private toSceneNode(obj: THREE.Object3D): SceneNode {
    let type: SceneNode['type'] = 'mesh';
    let material: MaterialData | undefined = undefined;
    let light: LightData | undefined = undefined;
    let physics: PhysicsNodeData | undefined = undefined;

    // Retrieve physics configuration
    if (obj.userData?.physics) {
      physics = JSON.parse(JSON.stringify(obj.userData.physics));
    } else {
      const entity = this.ecsWorld.getEntity(obj.uuid);
      if (entity) {
        const rb = entity.getComponent<RigidbodyComponent>('Rigidbody');
        const col = entity.getComponent<ColliderComponent>('Collider');
        const cc = entity.getComponent<CharacterControllerComponent>('CharacterController');
        if (rb || col || cc) {
          physics = {
            rigidbody: rb?.toData(),
            collider: col?.toData(),
            characterController: cc?.toData(),
          };
        }
      }
    }

    let targetMesh: THREE.Mesh | null = null;
    if (obj instanceof THREE.Mesh) {
      targetMesh = obj;
      type = 'mesh';
    } else if (obj instanceof THREE.Group) {
      type = 'group';
      // Find first mesh in group for previewing materials
      obj.traverse((child) => {
        if (!targetMesh && child instanceof THREE.Mesh) {
          targetMesh = child;
        }
      });
    } else if (obj instanceof THREE.Light) {
      type = 'light';
      light = {
        color: `#${obj.color.getHexString()}`,
        intensity: obj.intensity,
        distance: 'distance' in obj ? (obj as THREE.PointLight).distance : undefined,
      };
    }

    if (targetMesh && targetMesh.material) {
      // Lit le matériau SOURCE : en mode toon, le matériau courant du mesh est
      // un MeshToonMaterial généré à la volée — sinon le panneau Matériau
      // disparaît de l'Inspector après chaque modification.
      const rawSource = targetMesh.userData[TOON_SOURCE_MATERIAL_KEY] ?? targetMesh.material;
      let mat = Array.isArray(rawSource) ? rawSource[0] : rawSource;

      if (mat instanceof THREE.MeshStandardMaterial) {
        material = {
          color: `#${mat.color.getHexString()}`,
          roughness: mat.roughness,
          metalness: mat.metalness,
          wireframe: mat.wireframe,
          opacity: mat.opacity,
          transparent: mat.transparent,
          emissive: `#${mat.emissive.getHexString()}`,
          emissiveIntensity: mat.emissiveIntensity,
          normalScale: mat.normalScale ? mat.normalScale.x : 1,
          hasNormalMap: Boolean(mat.normalMap),
          hasRoughnessMap: Boolean(mat.roughnessMap),
          texturePreset: obj.userData?.texturePreset || 'none',
          // Sans ces trois champs, la texture assignée et son tiling étaient
          // perdus à la sauvegarde : le matériau était reconstruit « nu » au
          // rechargement de la scène.
          mapUrl: obj.userData?.mapUrl,
          repeatU: obj.userData?.repeatU,
          repeatV: obj.userData?.repeatV,
          smoothShading:
            (obj.userData?.smoothShading as boolean | undefined) ?? !mat.flatShading,
        };
      } else if (mat instanceof THREE.ShaderMaterial) {
        // Surfaces à shader custom : eau (océan/lac), rivières animées...
        const waterColor = mat.uniforms.waterColor?.value;
        material = {
          color: waterColor instanceof THREE.Color ? `#${waterColor.getHexString()}` : '#38bdf8',
          roughness: 0.15,
          metalness: 0,
          wireframe: false,
          opacity: 1,
          transparent: true,
          emissive: '#000000',
          emissiveIntensity: 0,
          normalScale: 1,
          hasNormalMap: false,
          hasRoughnessMap: false,
          texturePreset: 'none',
          smoothShading: false,
        };
      }
    } else if (obj.userData?.emitterId && obj.userData?.particles) {
      // Émetteur de particules (feu, fumée, pluie/neige, aurore, VFX...) :
      // les THREE.Points vivent sous le groupe — on expose une fiche matériau
      // pour rendre le panneau Toon & Contours disponible.
      const particlesColor = (obj.userData.particles as { color?: string } | undefined)?.color;
      material = {
        color: particlesColor || '#ff6a00',
        roughness: 0.5,
        metalness: 0,
        wireframe: false,
        opacity: 1,
        transparent: true,
        emissive: '#000000',
        emissiveIntensity: 0,
        normalScale: 1,
        hasNormalMap: false,
        hasRoughnessMap: false,
        texturePreset: 'none',
      };
    }

    // Persistance du rendu Toon & Contours (undo/redo, export, préfabriqués)
    if (material) {
      const nodeEntity = this.ecsWorld.getEntity(obj.uuid);
      const toonComp = nodeEntity?.getComponent<ToonMaterialComponent>('ToonMaterial');
      const outlineComp = nodeEntity?.getComponent<OutlineComponent>('Outline');
      if (toonComp) {
        material.toonIntensity = toonComp.enabled ? toonComp.colorLevels : 0;
      }
      if (outlineComp) {
        material.outlineColor = outlineComp.color;
        material.outlineThickness = outlineComp.enabled ? outlineComp.strength : 0;
      }
    }

    let logic: EntityLogicData | undefined = undefined;
    if (obj.userData?.logic) {
      logic = JSON.parse(JSON.stringify(obj.userData.logic));
    }

    let rigAnim: RigAnimData | undefined = undefined;
    if (obj.userData?.rigAnim) {
      rigAnim = JSON.parse(JSON.stringify(obj.userData.rigAnim));
    } else {
      const entity = this.ecsWorld.getEntity(obj.uuid);
      const rigComp = entity?.getComponent<RigAnimComponent>('RigAnim');
      if (rigComp) {
        rigAnim = rigComp.toData();
      }
    }

    return {
      id: obj.uuid,
      name: obj.name || 'Unnamed',
      type,
      subType: obj.userData?.subType,
      // Hiérarchie (TIER 2.1) : parent enregistré + rattachement prefab.
      parentId: this.getParentId(obj.uuid),
      prefabId: (obj.userData as { prefabId?: string } | undefined)?.prefabId,
      prefabInstanceId: (obj.userData as { prefabInstanceId?: string } | undefined)?.prefabInstanceId,
      lowPolyId: (obj.userData as { lowPolyId?: string } | undefined)?.lowPolyId,
      palette: (obj.userData as { palette?: SceneNode['palette'] } | undefined)?.palette,
      repeat: obj.userData?.repeat
        ? (JSON.parse(JSON.stringify(obj.userData.repeat)) as SceneNode['repeat'])
        : undefined,
      repeatOf: (obj.userData as { repeatOf?: string } | undefined)?.repeatOf,
      visible: obj.visible,
      castShadow: obj.castShadow,
      receiveShadow: obj.receiveShadow,
      transform: {
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: {
          x: THREE.MathUtils.radToDeg(obj.rotation.x),
          y: THREE.MathUtils.radToDeg(obj.rotation.y),
          z: THREE.MathUtils.radToDeg(obj.rotation.z),
        },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
      },
      material,
      light,
      physics,
      logic,
      rigAnim,
      childrenCount: obj.children.length,
      modelInfo: obj.userData?.modelInfo,
      riverConfig: obj.userData?.riverConfig,
      particles: obj.userData?.particles,
      spawnPoint: obj.userData?.spawnPoint
        ? JSON.parse(JSON.stringify(obj.userData.spawnPoint))
        : undefined,
      animator: obj.userData?.animator
        ? JSON.parse(JSON.stringify(obj.userData.animator))
        : undefined,
      collabId: (obj.userData as { collabId?: unknown } | undefined)?.collabId as string | undefined,
    };
  }

  public updateParticlesConfig(id: string, config: Partial<ParticleEmitterData>): void {
    const obj = this.objects.get(id);
    if (!obj || obj.userData?.subType !== 'particles') return;

    const currentParticles = obj.userData.particles || {};
    const updatedParticles = {
      ...currentParticles,
      ...config,
    };
    obj.userData.particles = updatedParticles;

    // Recreate or update the active emitter inside the particle manager
    if (this.particleManager && obj.userData.emitterId) {
      this.particleManager.createOrUpdateEmitter(
        obj.userData.emitterId,
        updatedParticles,
        obj.position,
        obj
      );
    }

    this.notifyHierarchy();
    if (this.selectedObject?.uuid === id) {
      this.selection.refreshSelection();
    }
  }

  public getSceneHierarchy(): SceneNode[] {
    const nodes: SceneNode[] = [];
    this.scene.children.forEach((obj) => {
      if (this.objects.has(obj.uuid)) {
        nodes.push(this.toSceneNode(obj));
      }
    });
    return nodes;
  }

  private notifyHierarchy(): void {
    const nodes: SceneNode[] = [];
    this.objects.forEach((obj) => {
      nodes.push(this.toSceneNode(obj));
    });
    this.events.onHierarchyChange(nodes);
    // Toute modification notifiée à l'UI est persistée (debouncé, ignoré en Play).
    this.scheduleAutosave();
  }

  // Optimized Loop
  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const profiler = this.frameProfiler;
    profiler.beginFrame();

    this.frameCount++;
    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;
    this.lastFrameDt = dt;

    if (now - this.lastFpsTime >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;

      const renderStats = this.renderPipeline.getRenderStats();
      const frameDist = profiler.getFrameDistribution();
      const sectionStats = profiler.getSectionStats();
      const stats: EngineStats = {
        fps: this.currentFps,
        triangles: renderStats.triangles,
        drawCalls: renderStats.drawCalls,
        objectsCount: this.objects.size,
        physicsBodiesCount: this.physicsManager.getBodiesCount(),
        frameMsAvg: frameDist.avg,
        frameMsP95: frameDist.p95,
        entitiesCount: this.ecsWorld.getAllEntities().length,
        geometries: this.renderPipeline.getRenderer().info.memory.geometries,
        textures: this.renderPipeline.getRenderer().info.memory.textures,
        sections: sectionStats.slice(0, 8).map((s) => ({
          name: s.name,
          avg: s.avg,
          p95: s.p95,
          max: s.max,
        })),
      };
      this.events.onStatsUpdate(stats);
    }

    let isFollowingPlayer = false;

    if (this.isPlaying) {
      // Tier 3.1 : pause debugger — saute logique/physique tant que paused
      // (ScriptDebugger.hit attend en async dans les scripts instrumentés)
      const debuggerPaused = ScriptDebugger.isPaused;

      // Multijoueur : échantillonne l'input AVANT la simulation locale.
      // En spectateur, les touches ne pilotent plus l'avatar (caméra libre).
      const spectating = this.netRole === 'client' && (this.netClient?.spectator ?? false);
      if (spectating) {
        this.physicsManager.characterSystem.input.reset();
      } else {
        this.netClient?.beginFrame(dt);
      }

      // Step Physics Simulation and ECS Systems
      if (!debuggerPaused) {
        // Le pas de physique suit l'échelle de temps du graphe (SetTimeScale) :
        // c'est elle qui donne son sens au ralenti « bullet-time ». À l'échelle
        // 1 le pas est le delta brut, donc le comportement normal est inchangé.
        // Un pas nul (HitStop / PauseGame) saute la résolution : faire tourner
        // Rapier à dt 0 ne ferait que résoudre des contacts pour rien.
        const simDt = this.logicExecutor.scaledDelta(dt);
        profiler.begin('physics');
        if (simDt > 0) this.ecsWorld.update(simDt);
        profiler.end('physics');
        profiler.begin('logic');
        this.logicExecutor.update(dt);
        profiler.end('logic');
      }

      // Multijoueur : enregistre l'état post-sim (prédiction), simu hôte,
      // interpolation des distants, chutes locales.
      profiler.begin('net');
      this.netClient?.endFrame();
      this.netHost?.update(dt);
      this.netClient?.update(dt);
      this.checkNetFallRespawn();
      profiler.end('net');

      // Keep the 3D audio listener on the active camera so spatial
      // attenuation/panning/doppler are computed from the right viewpoint.
      // Called every frame; SoundManager derives velocity from position deltas.
      if (this.cameraManager) {
        const lp = this.cameraManager.getCamera().position;
        soundManager.setListener({ x: lp.x, y: lp.y, z: lp.z });
      }

      // Smooth Camera Follow Player in Third Person → CameraManager.
      // Spectateur : orbite libre, pas de suivi.
      // Brique CameraFollow : suivi d'une entité arbitraire (prioritaire).
      // Cible assignée dans l'éditeur : priorité absolue.
      profiler.begin('camera');
      if (this.cameraManager.isFollowActive()) {
        this.cameraManager.setOrbitEnabled(false);
        this.cameraManager.updateFollow(dt);
        isFollowingPlayer = true;
      } else if (spectating) {
        this.cameraManager.setOrbitEnabled(true);
        isFollowingPlayer = false;
      } else if (this.applyLogicCameraFollow(dt)) {
        isFollowingPlayer = true;
      } else {
        isFollowingPlayer = this.cameraManager.updateFollowCamera(dt);
      }
      profiler.end('camera');
    }

    if (this.particleManager) {
      profiler.begin('particles');
      this.particleManager.update(dt);
      profiler.end('particles');
    }

    // Update Environmental Visuals (Wind streaks, Rain particles, Lightning, Audio)
    if (this.physicsManager.environmentalPhysics) {
      profiler.begin('environment');
      this.physicsManager.environmentalPhysics.updateVisuals(dt, this.camera);
      profiler.end('environment');
    }

    if (this.animationManager) {
      profiler.begin('animation');
      this.animationManager.update(dt, this.objects);
      this.animationManager.renderTrajectoryOverlay(
        this.selectedObject?.uuid || null
      );
    }

    // Update skeletal animations
    this.mixers.forEach((mixer) => mixer.update(dt));

    // Update Rigging Systems (Auto-animations, Vehicles)
    if (this.isPlaying) {
      this.updateRigSystems(dt);
    }
    // 4.2 — Animator Controller (après mixers : poids appliqués frame suivante,
    // events au temps courant ; préempte le blend tree Rig via __animatorActive).
    if (this.animatorSystem) {
      this.animatorSystem.update(dt);
    }
    // 4.2 — pont gestes clavier → triggers/params animator du joueur
    // (le rig étant court-circuité, E/F/V n'arriveraient jamais).
    if (this.isPlaying) {
      this.forwardGestureInputs();
    }
    profiler.end('animation');

    // Update projectiles
    profiler.begin('projectiles');
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      p.timer -= dt;
      p.mesh.position.add(p.direction.clone().multiplyScalar(p.speed * dt));

      let hasCollided = false;
      if (this.isPlaying) {
        const pPos = p.mesh.position;
        const entities = this.ecsWorld.getAllEntities();
        for (const target of entities) {
          if (!target.active || !target.object3D) continue;
          const targetPos = new THREE.Vector3();
          target.object3D.getWorldPosition(targetPos);

          // Test hit if projectile is close to target (within 1.2m radius)
          if (pPos.distanceTo(targetPos) < 1.3) {
            hasCollided = true;

            // SFX & Hit Spark Particles
            soundManager.playSFX('explosion');
            if (this.particleManager) {
              this.particleManager.createOrUpdateEmitter(
                `hit_${Date.now()}`,
                {
                  preset: 'sparks',
                  rate: 30,
                  maxParticles: 20,
                  lifetime: 0.35,
                  speed: 3.0,
                  color: '#ff6622',
                  size: 0.18,
                  gravity: -6,
                  spread: 1.2,
                  loop: false,
                  enabled: true,
                },
                pPos.clone()
              );
            }

            // Tir relayé réseau : impact visuel seul (l'hôte fait autorité).
            if (p.visualOnly) break;

            // Spawn floating damage indicator
            this.logicExecutor.floatingTexts.push({
              id: `hit_dmg_${Date.now()}`,
              text: `-${p.damage} HP`,
              x: targetPos.x,
              y: targetPos.y + 1.2,
              z: targetPos.z,
              color: '#f43f5e',
              timer: 1.5,
            });

            // Trigger physical ragdoll with impact knockback
            const knockback = p.direction.clone().multiplyScalar(p.speed * 0.85);
            knockback.y += 1.2;
            this.triggerRagdoll(target.id, knockback);

            // Execute logic node action on player if applicable
            if (target.hasComponent('CharacterController')) {
              this.logicExecutor.globalState.health = Math.max(
                0,
                this.logicExecutor.globalState.health - p.damage
              );
              this.logicExecutor.dispatchAllVariables();
              // Brique OnDeath : la mort par projectile déclenche le graphe
              this.logicExecutor.notifyHealthChanged();
            }
            break;
          }
        }
      }

      if (p.timer <= 0 || hasCollided) {
        this.scene.remove(p.mesh);
        this.objects.delete(p.id);
        if (this.particleManager) this.particleManager.stopEmitter(p.id + '_trail');
        this.activeProjectiles.splice(i, 1);
      }
    }
    profiler.end('projectiles');

    profiler.begin('orbit');
    if (!isFollowingPlayer && !this.selection.isDraggingTransform) {
      this.cameraManager.setOrbitEnabled(true);
      // Hors Play avec une cible assignée : updateFollow cale le point de
      // visée, updateOrbit garde l'amortissement et le pan — l'utilisateur
      // conserve la main sur la caméra.
      this.cameraManager.updateFollow(dt);
      this.cameraManager.updateOrbit();
    } else if (this.selection.isDraggingTransform) {
      this.cameraManager.setOrbitEnabled(false);
    }
    profiler.end('orbit');

    // Secousse d'écran (nœud « Tremblement ») : appliquée APRÈS que la caméra
    // a été positionnée (suivi + orbit), sinon elle serait écrasée avant d'être
    // vue, et AVANT le rendu pour que l'image tremblée parte à l'écran.
    this.cameraManager.applyShake(dt);

    // Asset Pipeline : LOD géométrique + streaming de textures (budgets/frame).
    // 3.4 : billboard final (impostors) puis occlusion culling (décisions
    // appliquées après, via applyOcclusion, sans conflit de visibilité).
    profiler.begin('streaming');
    if (this.lodConfig.enabled) this.lodManager.update(this.camera);
    this.textureStreamer.update(this.camera);
    this.impostorManager.update(this.camera, this.renderPipeline.getRenderer());
    this.occlusionManager.update(this.camera);
    // 4.3 : streaming chunks terrain + détails (LOD par tuile, builds budgétés).
    if (this.terrainGenerator?.config.enabled) {
      this.terrainGenerator.update(this.camera, now / 1000);
    }
    // 5.3 : diffusion aperçu live (caméra + état Play).
    try {
      this.previewHost?.update(dt);
    } catch {
      /* ignore */
    }
    profiler.end('streaming');

    profiler.begin('environment');
    if (this.atmosphereManager) {
      this.atmosphereManager.update(dt);
    }
    if (this.waterManager) {
      this.waterManager.update(dt, this.camera.position);
      this.waterManager.setSunDirection(this.dirLight.position, this.dirLight.color);
    }
    if (this.riverMeshes.length > 0) {
      for (const river of this.riverMeshes) {
        river.update(dt);
        river.setSunDirection(this.dirLight.position, this.dirLight.color);
      }
    }

    // Applique le rendu Toon & les contours aux objets (mode édition ET lecture).
    // Suspendu en modes wireframe/normals pour ne pas écraser l'aperçu.
    if (this.toonMaterialSystem && this.toonMaterialSystem.enabled) {
      this.toonMaterialSystem.update(dt, this.ecsWorld.getAllEntities().filter((e) => e.active));
    }
    profiler.end('environment');

    // Debug physique : wireframes Rapier (+ lignes transitoires), Play uniquement.
    profiler.begin('physics-debug');
    this.physicsDebug.update(this.physicsManager.world, dt);
    profiler.end('physics-debug');

    profiler.begin('render');
    if (this.atmosphereManager) {
      // Blend Post-Process Volume overrides for the camera position this frame
      if (this.postProcessVolumeManager) {
        const merged = this.postProcessVolumeManager.compute(
          this.camera.position,
          this.atmosphereManager.getBaseVolumeOverrides()
        );
        this.atmosphereManager.setVolumeOverrides(merged);
      }
      this.atmosphereManager.render(dt);
    } else {
      this.renderPipeline.render();
    }
    // 4.4 : overlay UI moteur (tweens + redraws + quad fullscreen, sans clear).
    try {
      const showOverlay = this.isPlaying || this.hudConfig.showInEditor === true;
      if (showOverlay && this.guiManager.hasScreens()) {
        this.guiManager.update(dt);
        this.guiManager.renderOverlay(this.renderPipeline.getRenderer());
      }
    } catch {
      /* ignore */
    }
    profiler.end('render');

    profiler.endFrame();
  };

  public setRigAnim(id: string, data: Partial<RigAnimData>): void {
    const entity = this.ecsWorld.getEntity(id);
    if (!entity) return;

    let rigComp = entity.getComponent<RigAnimComponent>('RigAnim');
    if (!rigComp) {
      rigComp = new RigAnimComponent(data);
      entity.addComponent(rigComp);
    } else {
      if (data.enabled !== undefined) rigComp.enabled = data.enabled;
      if (data.rigType !== undefined) rigComp.rigType = data.rigType;
      if (data.animationMapping !== undefined) rigComp.mapping = data.animationMapping;
      if (data.autoAnimate !== undefined) rigComp.autoAnimate = data.autoAnimate;
      if (data.blendTree !== undefined) rigComp.blendTree = data.blendTree;
      if (data.vehicleWheels !== undefined) rigComp.vehicleWheels = data.vehicleWheels;
      if (data.ragdoll !== undefined) rigComp.ragdoll = data.ragdoll;
    }

    // Update object userData for export
    const obj = this.objects.get(id);
    if (obj) {
      obj.userData.rigAnim = rigComp.toData();
    }
  }

  private updateRigSystems(dt: number): void {
    const entities = this.ecsWorld.getAllEntities();
    for (const entity of entities) {
      if (!entity.active || !entity.object3D) continue;

      // Skip skeletal auto-animation if ragdoll physics is currently active
      if (this.physicsManager.isRagdollActive(entity.id)) {
        continue;
      }

      // 4.2 — Animator Controller actif : il pilote mixer/tracks, le rig s'efface.
      if (
        entity.object3D &&
        (entity.object3D.userData as Record<string, unknown> | undefined)?.__animatorActive === true
      ) {
        continue;
      }

      const rigComp = entity.getComponent<RigAnimComponent>('RigAnim');
      if (!rigComp || !rigComp.enabled) continue;

      // One-time diagnostic per Play session: shows exactly which gesture
      // slots/keys the engine sees for this entity.
      if (!this.rigDiagLogged.has(entity.id)) {
        this.rigDiagLogged.add(entity.id);
        const m = rigComp.mapping;
        const b = this.physicsManager.characterSystem.input.bindings;
        console.info(
          `[Rig] Diagnostic ${entity.name}: rigType=${rigComp.rigType}, autoAnimate=${rigComp.autoAnimate}, ` +
            `slots={attack:${m.attack || '—'}, interact:${m.interact || '—'}, crouch:${m.crouch || '—'}, wave:${m.wave || '—'}}, ` +
            `touches={E:${(b.attack || []).join('/') || '—'}, F:${(b.interact || []).join('/') || '—'}, ` +
            `C:${(b.crouch || []).join('/') || '—'}, V:${(b.wave || []).join('/') || '—'}}. ` +
            `Les gestes clavier exigent rigType Humanoïde/Animal.`
        );
      }

      // 0. One-shot gesture in progress (attack/interact/wave) → locomotion suspended
      if (this.updateOneShotState(entity.id, dt)) continue;

      // 0b. Keyboard gesture triggers (E/F/V). Skips locomotion on the trigger frame.
      if (
        (rigComp.rigType === 'biped' || rigComp.rigType === 'quadruped') &&
        this.handleAnimActionInputs(entity, rigComp)
      ) {
        continue;
      }

      // 1. Automated Skeletal Animations
      if (rigComp.autoAnimate && (rigComp.rigType === 'biped' || rigComp.rigType === 'quadruped')) {
        this.handleAutoAnimation(entity, rigComp, dt);
      }

      // 2. Vehicle Rigging (Wheels rotation)
      if (rigComp.rigType === 'vehicle' && rigComp.vehicleWheels) {
        this.handleVehicleRigging(entity, rigComp, dt);
      }
    }
  }

  private handleAutoAnimation(entity: Entity, rigComp: RigAnimComponent, dt: number): void {
    const body = this.physicsManager.getEntityRigidbody(entity.id);
    let speed = 0;
    let isGrounded = true;

    // Check physics for speed
    if (body) {
      const vel = body.linvel();
      speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    }

    // Check character controller for grounded state and speed override
    const charComp = entity.getComponent<CharacterControllerComponent>('CharacterController');
    if (charComp) {
      isGrounded = charComp.isGrounded ?? true;
      if (charComp.currentSpeed > 0) {
        speed = charComp.currentSpeed;
      }
    }

    // Use continuous 1D/2D Blend Tree by default unless explicitly disabled
    const useBlendTree = rigComp.blendTree?.enabled !== false;
    if (useBlendTree) {
      this.updateLocomotionBlendTree(entity, rigComp, speed, isGrounded, dt);
      return;
    }

    // Discrete fallback (threshold-based switch)
    const mapping = rigComp.mapping;
    let targetAnim = mapping.idle;

    const discreteInput = this.physicsManager.characterSystem.input;
    if (discreteInput.crouch && isGrounded && mapping.crouch) {
      targetAnim = mapping.crouch;
    } else if (!isGrounded && mapping.jump) {
      targetAnim = mapping.jump;
    } else if (speed > 8.0 && mapping.sprint) {
      targetAnim = mapping.sprint;
    } else if (speed > 4.5 && mapping.run) {
      targetAnim = mapping.run;
    } else if (speed > 0.1 && mapping.walk) {
      targetAnim = mapping.walk;
    }

    if (targetAnim && targetAnim !== '') {
      this.playSkeletalAnimation(entity.id, targetAnim);
    } else {
      // Fallback: stop animations or fade out if nothing is mapped
      this.stopSkeletalAnimations(entity.id);
    }
  }

  /**
   * Continuous 1D/2D Locomotion Blend Tree
   * Dynamically blends weights between Idle, Walk, Run, and Sprint
   * with smooth damping and automatic stride rate adaptation (anti-patinage).
   */
  private updateLocomotionBlendTree(
    entity: Entity,
    rigComp: RigAnimComponent,
    rawSpeed: number,
    isGrounded: boolean,
    dt: number
  ): void {
    const obj = entity.object3D;
    if (!obj || !obj.userData.animations) return;

    const animations = obj.userData.animations as THREE.AnimationClip[];
    if (!animations || animations.length === 0) return;

    let mixer = this.mixers.get(entity.id);
    if (!mixer) {
      mixer = new THREE.AnimationMixer(obj);
      this.mixers.set(entity.id, mixer);
    }

    const mapping = rigComp.mapping;
    const blendTree = rigComp.blendTree || {
      enabled: true,
      mode: '1D_speed',
      walkSpeed: 2.8,
      runSpeed: 6.5,
      sprintSpeed: 9.5,
      damping: 10.0,
      syncPlaybackSpeed: true,
    };

    let actionsMap = this.blendTreeActions.get(entity.id);
    if (!actionsMap) {
      actionsMap = new Map();
      this.blendTreeActions.set(entity.id, actionsMap);
    }

    const getOrInitAction = (clipName?: string): THREE.AnimationAction | null => {
      if (!clipName) return null;
      if (actionsMap!.has(clipName)) {
        return actionsMap!.get(clipName)!;
      }
      const clip = animations.find((a) => a.name === clipName);
      if (!clip) {
        const warnKey = `${entity.id}::${clipName}`;
        if (!this.warnedMissingClips.has(warnKey)) {
          this.warnedMissingClips.add(warnKey);
          console.warn(
            `[Rig] Clip "${clipName}" introuvable sur ${obj.name}. Clips dispo: ${animations.map((a) => a.name).join(', ') || '(aucun)'}. Vérifiez le mapping dans Rig Studio (nom exact, sensible à la casse).`
          );
        }
        return null;
      }
      const act = mixer!.clipAction(clip);
      act.setLoop(THREE.LoopRepeat, Infinity);
      act.play();
      act.setEffectiveWeight(0);
      actionsMap!.set(clipName, act);
      return act;
    };

    const idleAction = getOrInitAction(mapping.idle);
    const walkAction = getOrInitAction(mapping.walk);
    const runAction = getOrInitAction(mapping.run);
    const sprintAction = getOrInitAction(mapping.sprint);
    const jumpAction = getOrInitAction(mapping.jump);
    const crouchAction = getOrInitAction(mapping.crouch);

    // 1. Air / Jump Override State
    if (!isGrounded && jumpAction) {
      jumpAction.setEffectiveWeight(
        THREE.MathUtils.lerp(jumpAction.getEffectiveWeight(), 1.0, Math.min(1.0, dt * 12))
      );
      idleAction?.setEffectiveWeight(
        THREE.MathUtils.lerp(idleAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
      walkAction?.setEffectiveWeight(
        THREE.MathUtils.lerp(walkAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
      runAction?.setEffectiveWeight(
        THREE.MathUtils.lerp(runAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
      sprintAction?.setEffectiveWeight(
        THREE.MathUtils.lerp(sprintAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
      return;
    } else if (jumpAction && jumpAction.getEffectiveWeight() > 0.01) {
      jumpAction.setEffectiveWeight(
        THREE.MathUtils.lerp(jumpAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
    }

    // 1b. Crouch hold state (C) — overrides locomotion while held
    const animInput = this.physicsManager.characterSystem.input;
    if (animInput.crouch && isGrounded && crouchAction) {
      crouchAction.setEffectiveWeight(
        THREE.MathUtils.lerp(crouchAction.getEffectiveWeight(), 1.0, Math.min(1.0, dt * 10))
      );
      idleAction?.setEffectiveWeight(
        THREE.MathUtils.lerp(idleAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
      walkAction?.setEffectiveWeight(
        THREE.MathUtils.lerp(walkAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
      runAction?.setEffectiveWeight(
        THREE.MathUtils.lerp(runAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
      sprintAction?.setEffectiveWeight(
        THREE.MathUtils.lerp(sprintAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
      return;
    } else if (crouchAction && crouchAction.getEffectiveWeight() > 0.01) {
      crouchAction.setEffectiveWeight(
        THREE.MathUtils.lerp(crouchAction.getEffectiveWeight(), 0.0, Math.min(1.0, dt * 10))
      );
    }

    // 2. Smooth Speed Interpolation
    let currentSmoothed = this.smoothedEntitySpeeds.get(entity.id) ?? rawSpeed;
    const damping = blendTree.damping || 10.0;
    currentSmoothed = THREE.MathUtils.lerp(currentSmoothed, rawSpeed, Math.min(1.0, dt * damping));
    this.smoothedEntitySpeeds.set(entity.id, currentSmoothed);

    // 3. Compute continuous proportional weights
    const walkThresh = blendTree.walkSpeed || 2.8;
    const runThresh = blendTree.runSpeed || 6.5;
    const sprintThresh = blendTree.sprintSpeed || 9.5;

    let targetIdleWeight = 0;
    let targetWalkWeight = 0;
    let targetRunWeight = 0;
    let targetSprintWeight = 0;

    // 2D directional check (detect reverse locomotion)
    let moveDirection = 1.0;
    if (blendTree.mode === '2D_directional') {
      const body = this.physicsManager.getEntityRigidbody(entity.id);
      if (body) {
        const vel = body.linvel();
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(obj.quaternion);
        const dot = fwd.x * vel.x + fwd.z * vel.z;
        if (dot < -0.15) moveDirection = -1.0;
      }
    }

    if (currentSmoothed <= 0.08) {
      // Idle
      targetIdleWeight = 1.0;
    } else if (!walkAction && runAction) {
      // Only Idle and Run available
      const t = Math.min(1.0, (currentSmoothed - 0.08) / Math.max(0.1, runThresh - 0.08));
      targetIdleWeight = 1.0 - t;
      targetRunWeight = t;
    } else if (walkAction && !runAction) {
      // Only Idle and Walk available
      const t = Math.min(1.0, (currentSmoothed - 0.08) / Math.max(0.1, walkThresh - 0.08));
      targetIdleWeight = 1.0 - t;
      targetWalkWeight = t;
    } else if (currentSmoothed <= walkThresh) {
      // Idle -> Walk continuous blend
      const t = (currentSmoothed - 0.08) / Math.max(0.01, walkThresh - 0.08);
      targetIdleWeight = 1.0 - t;
      targetWalkWeight = t;
    } else if (currentSmoothed <= runThresh) {
      // Walk -> Run continuous blend
      const t = (currentSmoothed - walkThresh) / Math.max(0.01, runThresh - walkThresh);
      targetWalkWeight = 1.0 - t;
      targetRunWeight = t;
    } else {
      // Run -> Sprint continuous blend
      if (sprintAction) {
        const t = Math.min(1.0, (currentSmoothed - runThresh) / Math.max(0.01, sprintThresh - runThresh));
        targetRunWeight = 1.0 - t;
        targetSprintWeight = t;
      } else {
        targetRunWeight = 1.0;
      }
    }

    // Apply weights smoothly and adapt playback speed
    const applyActionWeight = (action: THREE.AnimationAction | null, targetW: number, baseSpeedScale?: number) => {
      if (!action) return;
      const curW = action.getEffectiveWeight();
      const newW = THREE.MathUtils.lerp(curW, targetW, Math.min(1.0, dt * 14));
      action.setEffectiveWeight(newW);

      // Foot sliding prevention: adapt playback rate to actual velocity
      if (blendTree.syncPlaybackSpeed && baseSpeedScale && newW > 0.05) {
        const ratio = currentSmoothed / baseSpeedScale;
        const clampedScale = THREE.MathUtils.clamp(ratio, 0.75, 1.45) * moveDirection;
        action.setEffectiveTimeScale(clampedScale);
      } else if (moveDirection < 0 && newW > 0.05) {
        action.setEffectiveTimeScale(-1.0);
      } else {
        action.setEffectiveTimeScale(1.0);
      }
    };

    applyActionWeight(idleAction, targetIdleWeight);
    applyActionWeight(walkAction, targetWalkWeight, walkThresh);
    applyActionWeight(runAction, targetRunWeight, runThresh);
    applyActionWeight(sprintAction, targetSprintWeight, sprintThresh);
  }

  private handleVehicleRigging(entity: Entity, rigComp: RigAnimComponent, dt: number): void {
    const wheels = rigComp.vehicleWheels;
    if (!wheels) return;

    let speed = 0;
    let direction = 1;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(entity.object3D!.quaternion);

    const body = this.physicsManager.getEntityRigidbody(entity.id);
    if (body) {
      const vel = body.linvel();
      speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      const dot = new THREE.Vector3(vel.x, vel.y, vel.z).normalize().dot(forward);
      direction = dot >= 0 ? 1 : -1;
    } else if (this.physicsManager.vehicleSystem) {
      const vSpeed = this.physicsManager.vehicleSystem.getCurrentSpeed();
      speed = Math.abs(vSpeed);
      direction = vSpeed >= 0 ? 1 : -1;
    }

    if (speed < 0.01) return;

    // Wheel rotation speed based on speed
    const wheelCircumference = 2.0; // approx 2m
    const rotationAmount = (speed / wheelCircumference) * Math.PI * 2 * dt * direction;

    const findMesh = (name: string): THREE.Object3D | null => {
      let found: THREE.Object3D | null = null;
      entity.object3D!.traverse((child) => {
        if (child.name === name) found = child;
      });
      return found;
    };

    const wheelNames = [wheels.frontLeft, wheels.frontRight, wheels.rearLeft, wheels.rearRight];
    wheelNames.forEach((name) => {
      if (!name) return;
      const mesh = findMesh(name);
      if (mesh) {
        mesh.rotateX(rotationAmount);
      }
    });

    // Front wheels steering
    const steerAngle = this.physicsManager.vehicleSystem ? this.physicsManager.vehicleSystem.getCurrentSteerAngle() : 0;
    const steerNames = [wheels.frontLeft, wheels.frontRight];
    steerNames.forEach((name) => {
      if (!name) return;
      const mesh = findMesh(name);
      if (mesh) {
        mesh.rotation.y = steerAngle;
      }
    });
  }

  public getChildNames(id: string): string[] {
    const obj = this.objects.get(id);
    if (!obj) return [];
    const names: Set<string> = new Set();
    obj.traverse((child) => {
      if (child.name && child !== obj) {
        names.add(child.name);
      }
    });
    return Array.from(names);
  }

  /**
   * Garantit qu'un joueur existe au lancement du Play. Ajoute aussi un sol
   * si la scène n'en a aucun (évite de tomber dans le vide).
   * @returns true si un joueur (et éventuellement un sol) a été ajouté.
   */
  public ensurePlayablePlayer(): boolean {
    if (this.getPlayerEntity()) return false;

    let addedGround = false;
    if (!this.sceneHasGround()) {
      const ground = new THREE.Mesh(
        new THREE.BoxGeometry(40, 1, 40),
        new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.95, metalness: 0 })
      );
      ground.name = 'Ground';
      ground.position.set(0, -0.5, 0);
      ground.receiveShadow = true;
      ground.userData = { subType: 'cube' };
      this.registerObject(ground);
      addedGround = true;
    }

    this.addPrimitive(
      'player',
      { x: 0, y: 1.05, z: addedGround ? 6 : 3.4 },
      { silent: true }
    );
    this.notifyHierarchy();
    return true;
  }

  /** Détecte un support au sol : terrain, sol/floor/pedestal nommé, ou solide statique. */
  private sceneHasGround(): boolean {
    if (this.terrainGenerator?.config.enabled) return true;
    for (const obj of this.objects.values()) {
      const n = obj.name.toLowerCase();
      if (n.includes('ground') || n.includes('floor') || n.includes('pedestal')) return true;
      const physics = obj.userData?.physics as PhysicsNodeData | undefined;
      if (physics?.rigidbody?.type === 'static' && physics.collider) return true;
    }
    return false;
  }

  /**
   * Returns the primary player entity (with CharacterController component)
   */
  public getPlayerEntity(): Entity | undefined {
    return this.ecsWorld
      .getAllEntities()
      .find((e) => e.active && e.hasComponent('CharacterController') && e.object3D);
  }

  /**
   * Automatically detect skeleton bones on a 3D model and generate capsule collider presets
   */
  public autoDetectRagdollBones(entityId: string): RagdollBoneConfig[] {
    const entity = this.ecsWorld.getEntity(entityId);
    const obj = entity?.object3D || this.objects.get(entityId);
    if (!obj) return [];
    return RagdollSystem.autoDetectBones(obj);
  }

  /**
   * Triggers ragdoll physics simulation on a character or model entity
   */
  public triggerRagdoll(
    entityId: string,
    impulse?: THREE.Vector3,
    hitBoneName?: string
  ): boolean {
    return this.physicsManager.triggerRagdoll(entityId, impulse, hitBoneName);
  }

  /**
   * Restores normal character animation and controller kinematic motion
   */
  public deactivateRagdoll(entityId: string): void {
    this.physicsManager.deactivateRagdoll(entityId);
  }

  /**
   * Checks if an entity is currently in a ragdoll simulation state
   */
  public isRagdollActive(entityId: string): boolean {
    return this.physicsManager.isRagdollActive(entityId);
  }

  /**
   * Toggles ragdoll physics on the current player entity (or selected object)
   */
  public togglePlayerRagdoll(): void {
    const player = this.getPlayerEntity() || (this.selectedObject ? this.ecsWorld.getEntity(this.selectedObject.uuid) : undefined);
    if (!player) return;

    if (this.isRagdollActive(player.id)) {
      this.deactivateRagdoll(player.id);
    } else {
      const impulse = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        1.0,
        (Math.random() - 0.5) * 1.5
      );
      this.triggerRagdoll(player.id, impulse);
    }
  }

  /**
   * Shows or hides wireframe debug colliders for ragdoll bones
   */
  public showRagdollWireframes(entityId: string, show: boolean): void {
    const entity = this.ecsWorld.getEntity(entityId);
    if (!entity || !entity.object3D) return;

    if (!show) {
      this.physicsManager.ragdollSystem.removeDebugWireframes(entityId, this.scene);
      return;
    }

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

    this.physicsManager.ragdollSystem.createDebugWireframes(entity, config, this.scene);
  }

  // ---------------------------------------------------------------------------
  // Asset Pipeline — façade publique (registry, bundles, supervision)
  // ---------------------------------------------------------------------------

  /**
   * Reconstruit les refcounts depuis les objets réels de la scène
   * (mark-and-sweep). Appelé après chaque import/restauration.
   */
  public async reconcileAssetReferences(): Promise<{ fixed: number }> {
    const referenced = new Map<string, Set<string>>();
    const link = (assetId: string, ownerUuid: string) => {
      let set = referenced.get(assetId);
      if (!set) {
        set = new Set<string>();
        referenced.set(assetId, set);
      }
      set.add(ownerUuid);
    };
    this.objects.forEach((obj) => {
      const sid = (obj.userData?.modelInfo as ModelInfo | undefined)?.storageId;
      if (sid) link(sid, obj.uuid);
      // Textures suivies (ids posés par le pipeline sur tex.userData.assetId).
      obj.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          const slots = ['map', 'normalMap', 'emissiveMap'] as const;
          for (const slot of slots) {
            const tex = (mat as unknown as Record<string, THREE.Texture | null>)[slot];
            const texId = tex && (tex.userData as { assetId?: string } | undefined)?.assetId;
            if (texId) link(texId, obj.uuid);
          }
        }
      });
    });
    return this.assetDatabase.reconcile(referenced);
  }

  /** Stats supervisées pour l'UI (stockage + VRAM + LOD + orphelins). */
  public async getAssetStats(): Promise<AssetStats> {
    const storage = await this.assetDatabase.getStorageStats();
    const bundles = await this.bundleManager.listBundles().catch(() => []);
    const stream = this.textureStreamer.getStats();
    const lod = this.lodManager.getStats();
    return {
      models: storage.models,
      textures: storage.textures,
      audio: storage.audio,
      bundles: bundles.length,
      totalBytes: storage.totalBytes,
      orphanCount: storage.orphanCount,
      orphanBytes: storage.orphanBytes,
      vramBytes: stream.vramBytes,
      lodMeshes: lod.meshes,
    };
  }

  // -------------------------------------------------------------------------
  // 3.4 — LOD / occlusion culling / impostors : config, stats, audit
  // -------------------------------------------------------------------------

  /**
   * Applique une décision d'occlusion en coordonnant maillage + sprite
   * d'impostor. La visibilité utilisateur est préservée (restaurée à la fin
   * de l'occlusion) et le billboard reste maître quand il est actif.
   */
  private applyOcclusion(uuid: string, occluded: boolean): void {
    const obj = this.objects.get(uuid);
    if (!obj) return;
    const ud = (obj.userData ?? {}) as Record<string, unknown>;
    const sprite = this.impostorManager?.getSprite(uuid);
    if (occluded) {
      if (ud.__occPrevVisible === undefined) ud.__occPrevVisible = obj.visible;
      obj.visible = false;
      if (sprite) {
        if (ud.__occSpritePrev === undefined) ud.__occSpritePrev = sprite.visible;
        sprite.visible = false;
      }
    } else {
      const prev = ud.__occPrevVisible;
      delete ud.__occPrevVisible;
      delete ud.__occSpritePrev;
      if (this.impostorManager?.isFar(uuid)) {
        obj.visible = false;
        if (sprite) sprite.visible = true;
      } else {
        obj.visible = typeof prev === 'boolean' ? prev : true;
        if (sprite) sprite.visible = false;
      }
    }
    obj.userData = ud;
  }

  public setLODConfig(patch: Partial<LODGlobalConfig>): void {
    this.lodConfig = normalizeLODConfig({ ...this.lodConfig, ...patch });
    if (!this.lodConfig.enabled) this.lodManager.resetAll();
    this.impostorManager.applyConfig(this.lodConfig);
  }

  public setCullingConfig(patch: Partial<CullingConfig>): void {
    this.cullingConfig = normalizeCullingConfig({ ...this.cullingConfig, ...patch });
    this.occlusionManager.applyConfig(this.cullingConfig);
  }

  public getCullingStats(): CullingStats {
    const lod = this.lodManager.getStats();
    const imp = this.impostorManager.getStats();
    const occ = this.occlusionManager.getStats();
    return {
      lodMeshes: lod.meshes,
      impostors: imp.impostors,
      impostorCaptures: imp.captures,
      occluders: occ.occluders,
      occludees: occ.occludees,
      occludedHidden: occ.occludedHidden,
      occlusionRaysLastFrame: occ.raysLastFrame,
    };
  }

  /** Audit frustum culling (auto-fix des boundingSphere manquantes). */
  public verifyFrustumCulling(): FrustumAuditResult {
    return auditFrustumCulling(this.objects);
  }

  // -------------------------------------------------------------------------
  // Multijoueur P2P (WebRTC) — host autoritaire, prédiction + réconciliation
  // -------------------------------------------------------------------------

  private netLog(line: string): void {
    this.netLogLines.push(`[${new Date().toLocaleTimeString()}] ${line}`);
    if (this.netLogLines.length > 40) this.netLogLines.splice(0, this.netLogLines.length - 40);
  }

  public getNetLog(): string[] {
    return [...this.netLogLines];
  }

  public get netSessionActive(): boolean {
    return this.netRole !== 'none';
  }

  /** Démarre l'hébergement (le testeur qui simule). */
  public startNetHost(name: string): void {
    this.stopNet();
    this.netPlayerName = (name || 'Hôte').slice(0, 24);
    this.netHost = new NetHost({
      spawnPlayerAvatar: (clientId, playerName, x, y, z, yaw) =>
        this.spawnNetAvatar(clientId, playerName, x, y, z, yaw),
      removePlayerAvatar: (uuid) => this.removeNetAvatar(uuid),
      teleportAvatar: (uuid, x, y, z, yaw) => this.teleportNetAvatar(uuid, x, y, z, yaw),
      getHostPlayerState: () => this.readHostPlayerState(),
      getNetProps: () => this.collectNetProps(),
      spawnAuthoritativeProjectile: (x, y, z, dx, dy, dz, speed, damage, prefab) =>
        this.spawnRemoteProjectile(x, y, z, dx, dy, dz, speed, damage, prefab, false),
      pickSpawn: () => {
        const s = this.spawnManager.pickSpawn();
        return { pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z }, yaw: s.yaw };
      },
      isPlaying: () => this.isPlaying,
      onPeersChanged: () => this.notifyHierarchy(),
    });
    this.netHost.onLog = (l) => this.netLog(l);
    this.netHost.start();
    this.netRole = 'host';
    this.netLog(`Salon créé (${this.netPlayerName}). Créez une invitation à partager.`);
    this.notifyHierarchy();
  }

  /** Rejoint un salon (code d'invitation) → retourne le code de réponse. */
  public async joinNetSession(invite: string, name: string, spectator: boolean): Promise<string> {
    this.stopNet();
    this.netPlayerName = (name || 'Joueur').slice(0, 24);
    const client = new NetClient(this.scene, {
      isPlaying: () => this.isPlaying,
      sampleInput: () => this.sampleNetInput(),
      getLocalState: () => this.readLocalPlayerState(),
      applyCorrection: (s) => this.applyNetCorrection(s),
      teleportLocal: (x, y, z, yaw) => this.teleportLocalPlayer(x, y, z, yaw),
      resetPrediction: () => {},
      spawnVisualProjectile: (x, y, z, dx, dy, dz, speed, damage, prefab) =>
        this.spawnRemoteProjectile(x, y, z, dx, dy, dz, speed, damage, prefab),
      resolveNode: (nodeId) => this.objects.get(nodeId),
      onDisconnected: (reason) => {
        this.netLog(`Déconnecté (${reason}).`);
        this.netRole = 'none';
        this.netClient = null;
        this.notifyHierarchy();
      },
      onWelcome: (playerId) => {
        this.netLog(`Bienvenue (${playerId}).`);
        this.notifyHierarchy();
      },
    });
    client.onLog = (l) => this.netLog(l);
    const answer = await client.connect(invite, this.netPlayerName, spectator);
    this.netClient = client;
    this.netRole = 'client';
    this.notifyHierarchy();
    return answer;
  }

  public stopNet(): void {
    try {
      this.netHost?.stop();
    } catch {
      /* ignore */
    }
    try {
      this.netClient?.disconnect();
    } catch {
      /* ignore */
    }
    this.netHost = null;
    this.netClient = null;
    if (this.netRole !== 'none') this.netLog('Session fermée.');
    this.netRole = 'none';
    this.notifyHierarchy();
  }

  public setNetSpectator(spectator: boolean): void {
    if (this.netRole !== 'client' || !this.netClient) return;
    this.netClient.setSpectator(spectator);
    const obj = this.getPlayerEntity()?.object3D;
    if (obj) obj.visible = !spectator;
    this.netLog(spectator ? 'Mode spectateur.' : 'Retour en jeu.');
  }

  public requestNetRespawn(): void {
    this.netClient?.requestRespawn();
  }

  /** Filet anti-chute réseau : hôte retéléporte, client demande un respawn. */
  private lastNetFallRequest = 0;
  private checkNetFallRespawn(): void {
    if (!this.isPlaying || this.netRole === 'none') return;
    const obj = this.getPlayerEntity()?.object3D;
    if (!obj) return;
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    if (p.y >= this.spawnManager.killY) return;
    if (this.netRole === 'host') {
      const s = this.spawnManager.pickSpawn();
      this.teleportLocalPlayer(s.pos.x, s.pos.y, s.pos.z, s.yaw);
      this.netLog('Chute : respawn.');
    } else {
      const now = Date.now();
      if (now - this.lastNetFallRequest > 2000) {
        this.lastNetFallRequest = now;
        this.netClient?.requestRespawn();
      }
    }
  }

  public getNetStats(): {
    role: string;
    clients: number;
    rttMs: number;
    reconciliations: number;
    lastError: number;
    remotes: number;
  } {
    if (this.netRole === 'host' && this.netHost) {
      const s = this.netHost.getStats();
      return { role: 'host', clients: s.clients, rttMs: 0, reconciliations: 0, lastError: 0, remotes: s.clients };
    }
    if (this.netRole === 'client' && this.netClient) {
      const s = this.netClient.getStats();
      return {
        role: 'client',
        clients: 0,
        rttMs: s.rttMs,
        reconciliations: s.reconciliations,
        lastError: s.lastError,
        remotes: s.remotes,
      };
    }
    return { role: 'none', clients: 0, rttMs: 0, reconciliations: 0, lastError: 0, remotes: 0 };
  }

  // -------------------------------------------------------------------------
  // 5.2 — Collaboration temps réel (CRDT LWW + version control)
  // -------------------------------------------------------------------------

  private collabLog(line: string): void {
    this.collabLogLines.push(`[${new Date().toLocaleTimeString()}] ${line}`);
    if (this.collabLogLines.length > 40) {
      this.collabLogLines.splice(0, this.collabLogLines.length - 40);
    }
  }

  public getCollabLog(): string[] {
    return [...this.collabLogLines];
  }

  public get collabActive(): boolean {
    return this.collabManager !== null && this.collabSession !== null;
  }

  /** Démarre une session collaborative (éditeur + salon P2P). */
  public startCollabSession(name: string): void {
    this.stopCollabSession();
    this.collabName = (name || 'Éditeur').slice(0, 24);
    const manager = new CollabManager(
      {
        exportScene: () => this.exportScene(),
        resolveSelected: () => {
          const sel = this.selectedObject;
          return sel ? { id: sel.uuid, name: sel.name || sel.uuid.slice(0, 8) } : null;
        },
        applyRemoteOps: (ops) => this.applyRemoteOps(ops),
        setApplyingRemote: () => {},
        sendEnvelope: (env) => this.collabSession?.broadcast(env),
        sendPresence: (msg) => this.collabSession?.broadcast(msg),
        onPeersChanged: () => this.notifyHierarchy(),
        onRemoteActivity: (summary) => this.collabLog(summary),
      }
    );
    const session = new CollabSession({
      onEnvelope: (env) => manager.receive(env),
      onPresence: (msg) => manager.receivePresence(msg),
      onCommit: (msg) => {
        if (this.vcs.receiveCommit(msg.commit)) {
          this.collabLog(`${msg.actor.slice(0, 8)} a partagé « ${msg.commit.message} » (${msg.commit.branch}).`);
          this.notifyHierarchy();
        }
      },
      onPeersChanged: () => this.notifyHierarchy(),
      onLog: (line) => this.collabLog(line),
    });
    this.collabManager = manager;
    this.collabSession = session;
    manager.startSession(this.collabName);
    this.collabLog(`Session collaborative démarrée (${this.collabName}).`);
    this.notifyHierarchy();
  }

  public stopCollabSession(): void {
    try {
      this.collabSession?.leave();
    } catch {
      /* ignore */
    }
    try {
      this.collabManager?.dispose();
    } catch {
      /* ignore */
    }
    this.collabSession = null;
    this.collabManager = null;
  }

  public async createCollabInvite(): Promise<string> {
    if (!this.collabSession || !this.collabManager) throw new Error('Démarrez d’abord la session.');
    return this.collabSession.createInvite();
  }

  public async acceptCollabAnswer(code: string): Promise<void> {
    if (!this.collabSession || !this.collabManager) throw new Error('Démarrez d’abord la session.');
    await this.collabSession.acceptAnswer(code);
    // État complet vers le nouveau pair (base commune immédiate).
    this.collabManager.flushNow();
  }

  public async joinCollabSession(invite: string, name: string): Promise<string> {
    if (!this.collabManager || !this.collabSession) {
      this.startCollabSession(name);
    }
    return this.collabSession!.join(invite);
  }

  /** Résout une clé de suivi (`u:uuid`) vers l'objet local. */
  private resolveCollabNode(key: string): THREE.Object3D | undefined {
    if (key.startsWith('u:')) {
      return this.objects.get(key.slice(2));
    }
    return undefined;
  }

  /** Application granulaire des ops distantes (sans historique, sans écho). */
  private applyRemoteOps(ops: CollabOp[]): { applied: number } {
    let applied = 0;
    // Rejeu des rattachements parent en attente (parent arrivé après l'enfant).
    if (this.pendingCollabParents.length > 0) {
      const retry = [...this.pendingCollabParents];
      this.pendingCollabParents = [];
      for (const { id, parentId } of retry) {
        const obj = this.objects.get(id);
        const parent = this.objects.get(parentId);
        if (obj && parent && obj.parent !== parent) {
          try {
            parent.add(obj);
            obj.updateMatrixWorld(true);
            applied++;
          } catch {
            this.pendingCollabParents.push({ id, parentId });
          }
        } else if (obj && !parent) {
          this.pendingCollabParents.push({ id, parentId });
        }
      }
    }
    // Passe 1 : créations (parents d'abord si présents dans le lot).
    const adds = ops.filter((o) => o.k === 'add');
    const rest = ops.filter((o) => o.k !== 'add');
    const pending = [...adds];
    let guard = pending.length * 2 + 1;
    while (pending.length > 0 && guard-- > 0) {
      const op = pending.shift();
      if (!op || op.k !== 'add') continue;
      if (this.resolveCollabNode(op.id)) continue; // déjà présent
      if (this.spawnCollabNode(op.node)) {
        applied++;
      } else {
        pending.push(op);
      }
    }
    // Passe 2 : rattache les parents (les nœuds créés portent leur parentId).
    for (const op of adds) {
      const obj = this.resolveCollabNode(op.id);
      if (!obj || op.k !== 'add') continue;
      const parentId = (op.node.parentId ?? null) as string | null;
      if (parentId) {
        const parent = this.objects.get(parentId);
        if (parent && obj.parent !== parent) {
          try {
            parent.add(obj);
            obj.updateMatrixWorld(true);
          } catch {
            /* ignore */
          }
        } else if (!parent) {
          // Parent pas encore reçu : réessayé aux prochains lots.
          if (!this.pendingCollabParents.some((p) => p.id === obj.uuid)) {
            this.pendingCollabParents.push({ id: obj.uuid, parentId });
          }
        }
      }
    }
    for (const op of rest) {
      try {
        if (op.k === 'del') {
          const obj = this.resolveCollabNode(op.id);
          if (obj) {
            this.deleteObjectSilent(obj.uuid);
            applied++;
          }
        } else if (op.k === 'set') {
          if (this.applyRemoteField(op.id, op.field, op.value)) applied++;
        }
      } catch {
        /* op inapplicable : ignorée (convergence au prochain flush) */
      }
    }
    if (applied > 0) {
      this.notifyHierarchy();
      // Les proxies ECS suivent les transforms via updateTransform.
    }
    return { applied };
  }

  private applyRemoteField(id: string, field: CollabField, value: unknown): boolean {
    const obj = this.resolveCollabNode(id);
    if (!obj) return false;
    const v = value as never;
    switch (field) {
      case 'name':
        if (typeof v === 'string' && obj.name !== v) {
          obj.name = v;
          return true;
        }
        return false;
      case 'parentId': {
        const pid = (v ?? null) as string | null;
        const parent = pid ? this.objects.get(pid) : null;
        if (pid && !parent) {
          // Parent inconnu : file d'attente (arrivera dans un lot suivant).
          if (!this.pendingCollabParents.some((p) => p.id === obj.uuid)) {
            this.pendingCollabParents.push({ id: obj.uuid, parentId: pid });
          }
          return false;
        }
        const target = parent ?? this.scene;
        if (obj.parent !== target) {
          target.add(obj);
          obj.updateMatrixWorld(true);
          return true;
        }
        return false;
      }
      case 'transform':
        this.updateTransform(obj.uuid, v as Partial<import('../types/engine').TransformData>);
        return true;
      case 'material':
        if (v && typeof v === 'object') {
          this.updateMaterial(obj.uuid, v as Partial<import('../types/engine').MaterialData>);
          return true;
        }
        return false;
      case 'light':
        if (v && typeof v === 'object') {
          this.updateLight(obj.uuid, v as Partial<import('../types/engine').LightData>);
          return true;
        }
        return false;
      case 'physics':
        if (v && typeof v === 'object') {
          this.updatePhysics(obj.uuid, v as Partial<import('../types/engine').PhysicsNodeData>);
          return true;
        }
        return false;
      case 'logic':
        if (v && typeof v === 'object') {
          this.updateLogic(obj.uuid, v as Partial<import('../types/engine').EntityLogicData>);
          return true;
        }
        return false;
      case 'visible':
        if (typeof v === 'boolean' && obj.visible !== v) {
          this.setVisibility(obj.uuid, v);
          return true;
        }
        return false;
      case 'castShadow':
      case 'receiveShadow': {
        const other = field === 'castShadow' ? obj.receiveShadow : obj.castShadow;
        const next = field === 'castShadow' ? [v as boolean, other] : [obj.castShadow, v as boolean];
        if ((field === 'castShadow' ? obj.castShadow : obj.receiveShadow) !== v) {
          this.setShadows(obj.uuid, next[0], next[1]);
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * Reconstruit un nœud distant : primitives via factory + overlay, reste en
   * conteneur placeholder (modèles binaires non transférables en test).
   */
  /**
   * Reconstruit un nœud distant : primitives via factory + overlay, reste en
   * conteneur placeholder (modèles binaires non transférables en test).
   * L'UUID distant est adopté (preserveId) : l'identité reste alignée.
   */
  private spawnCollabNode(node: CollabNodeData): boolean {
    const subType = (node.subType ?? '') as string;
    const factoryTypes = [
      'cube', 'sphere', 'cylinder', 'plane', 'torus', 'cone', 'player',
      'pointLight', 'spotLight', 'dirLight', 'camera', 'particles', 'vehicle',
      'river', 'triggerVolume', 'navMeshAgent', 'checkpoint', 'spawnPoint', 'postProcessVolume',
    ];
    let obj: THREE.Object3D | undefined;
    try {
      if (node.type === 'light' || factoryTypes.includes(subType)) {
        const created = this.addPrimitive(
          (node.type === 'light' ? subType || 'pointLight' : subType) as Parameters<SceneManager['addPrimitive']>[0],
          { x: node.transform.position.x, y: node.transform.position.y, z: node.transform.position.z },
          { silent: true, preserveId: node.id }
        );
        obj = this.objects.get(created.id);
      } else {
        const group = new THREE.Group();
        group.position.set(node.transform.position.x, node.transform.position.y, node.transform.position.z);
        this.scene.add(group);
        this.adoptImportId(group, node.id);
        this.registerObject(group);
        obj = group;
      }
      if (!obj) return false;
      const ud = (obj.userData ?? {}) as Record<string, unknown>;
      const collab = (node as { collabId?: unknown }).collabId;
      if (typeof collab === 'string' && collab) ud.collabId = collab;
      obj.userData = ud;
      obj.name = node.name || obj.name;
      // Overlay des blocs persistés.
      if (node.transform) {
        try {
          this.updateTransform(obj.uuid, node.transform);
        } catch {
          /* ignore */
        }
      }
      if (node.material && obj instanceof THREE.Mesh) {
        try {
          this.updateMaterial(obj.uuid, node.material);
        } catch {
          /* ignore */
        }
      }
      if (node.physics) {
        try {
          this.updatePhysics(obj.uuid, node.physics);
        } catch {
          /* ignore */
        }
      }
      if (node.logic) {
        try {
          this.updateLogic(obj.uuid, node.logic);
        } catch {
          /* ignore */
        }
      }
      if (typeof node.visible === 'boolean') obj.visible = node.visible;
      return true;
    } catch {
      return false;
    }
  }

  /** Suppression cascade silencieuse (sans historique, sans écho). */
  public deleteObjectSilent(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) this.lodManager.unregisterMesh(child.uuid);
      try {
        this.impostorManager.unregister(child.uuid);
      } catch {
        /* ignore */
      }
      try {
        this.occlusionManager.unregister(child.uuid);
      } catch {
        /* ignore */
      }
      try {
        this.animatorSystem.unbind(child.uuid);
      } catch {
        /* ignore */
      }
    });
    if (obj.parent) obj.parent.remove(obj);
    this.objects.delete(id);
    try {
      const entity = this.ecsWorld.getEntity(id);
      if (entity) this.ecsWorld.removeEntity(id);
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------- version control

  public collabCommit(message: string): CollabCommit {
    const snap = this.exportScene();
    const c = this.vcs.commit(message, `${this.collabName} (${this.collabManager?.actorId.slice(0, 6) ?? 'local'})`, snap);
    this.collabLog(`Commit « ${c.message} » sur ${c.branch}.`);
    return c;
  }

  public shareCollabCommit(id: string): boolean {
    const c = this.vcs.getCommit(id);
    if (!c || !this.collabSession || !this.collabManager) return false;
    this.collabSession.shareCommit(c, this.collabManager.actorId);
    this.collabLog(`Commit « ${c.message} » partagé.`);
    return true;
  }

  public checkoutCollabCommit(id: string): boolean {
    const c = this.vcs.getCommit(id);
    if (!c) return false;
    try {
      this.importScene(JSON.parse(JSON.stringify(c.snapshot)) as import('../types/engine').SceneExportData, {
        skipValidation: true,
      });
      // Diffusé (pas rebasé) : les pairs convergent vers l'état restauré.
      this.collabManager?.notifyLocalMutation();
      this.collabLog(`Checkout « ${c.message} » (diffusé).`);
      return true;
    } catch (err) {
      console.warn('[Collab] checkout impossible.', err);
      return false;
    }
  }

  public diffCollabWork(): SceneDiff {
    const head = this.vcs.head();
    return this.vcs.diffCommits(head?.id ?? null, this.exportScene());
  }

  public diffCollabCommits(aId: string, bId: string): SceneDiff | null {
    const a = this.vcs.getCommit(aId);
    const b = this.vcs.getCommit(bId);
    if (!a || !b) return null;
    return this.vcs.diffCommits(a.id, b.snapshot);
  }

  public prepareCollabMerge(theirsHeadId: string): { conflicts: import('./collab/types').MergeConflict[]; autoApplied: number } {
    const res = this.vcs.prepareMerge(theirsHeadId, this.exportScene());
    return { conflicts: res.conflicts, autoApplied: res.autoApplied };
  }

  public resolveCollabMerge(resolutions: ('ours' | 'theirs')[]): boolean {
    const merged = this.vcs.resolveMerge(resolutions);
    if (!merged) return false;
    try {
      this.importScene(merged, { skipValidation: true });
      const c = this.vcs.commitMerge('Merge', this.collabName);
      // Diffusé (pas rebasé) : les pairs convergent vers le merge.
      this.collabManager?.notifyLocalMutation();
      this.collabLog(c ? `Merge committé (${c.id.slice(0, 8)}).` : 'Merge appliqué.');
      return true;
    } catch (err) {
      console.warn('[Collab] merge impossible.', err);
      return false;
    }
  }

  public getCollabStats(): {
    active: boolean;
    role: string;
    peers: number;
    lamport: number;
    commits: number;
    branch: string;
    branches: number;
  } {
    const role = this.collabSession?.role ?? 'none';
    return {
      active: this.collabActive,
      role,
      peers: this.collabManager?.getStats().peers ?? 0,
      lamport: this.collabManager?.getStats().lamport ?? 0,
      commits: this.vcs.listCommits(this.vcs.currentBranch, 1000).length,
      branch: this.vcs.currentBranch,
      branches: this.vcs.listBranches().length,
    };
  }

  public getCollabPeers(): PeerPresence[] {
    return this.collabManager?.getPeers() ?? [];
  }

  // -------------------------------------------------------------------------
  // 5.3 — Live Preview (diffusion du jeu : broadcast local + WebRTC)
  // -------------------------------------------------------------------------

  /** Démarre la diffusion (broadcast même-appareil ; invités WebRTC en plus). */
  public startLivePreview(room = 'aether-live'): void {
    this.stopLivePreview();
    const host = new LivePreviewHost({
      exportScene: () => this.exportScene(),
      getCameraPose: () => ({
        pos: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        quat: [this.camera.quaternion.x, this.camera.quaternion.y, this.camera.quaternion.z, this.camera.quaternion.w],
        fov: (this.camera as THREE.PerspectiveCamera).fov ?? 60,
      }),
      isPlaying: () => this.isPlaying,
      onLog: (line) => this.collabLog(line),
    });
    this.previewHost = host;
    try {
      host.addLink(new BroadcastLiveLink(room, true));
    } catch {
      /* broadcast indisponible */
    }
    this.collabLog(`Diffusion live démarrée (onglets : même appareil).`);
    this.notifyHierarchy();
  }

  public stopLivePreview(): void {
    try {
      this.previewHost?.clear();
    } catch {
      /* ignore */
    }
    try {
      this.previewInvite?.close();
    } catch {
      /* ignore */
    }
    this.previewHost = null;
    this.previewInvite = null;
  }

  public get livePreviewActive(): boolean {
    return this.previewHost !== null && this.previewHost.active;
  }

  /** Invitation WebRTC pour un appareil distant (aperçu live). */
  public async createLiveInvite(): Promise<string> {
    if (!this.previewHost) this.startLivePreview();
    const { link, invite } = await WebRtcLiveLink.createHost();
    this.previewInvite = link;
    this.previewHost!.addLink(link);
    return invite;
  }

  public async acceptLiveAnswer(code: string): Promise<void> {
    if (!this.previewInvite) throw new Error('Créez d’abord une invitation live.');
    await this.previewInvite.acceptAnswer(code);
    this.collabLog('Visionneuse distante connectée.');
    this.notifyHierarchy();
  }

  /** Applique des ops live distantes (aperçu : sans historique, sans écho). */
  public applyLiveOps(ops: CollabOp[]): number {
    if (!ops || ops.length === 0) return 0;
    return this.applyRemoteOps(ops).applied;
  }

  public importLiveScene(scene: import('../types/engine').SceneExportData): void {
    this.importScene(scene);
  }

  public listCollabCommits(branch?: string, limit = 60): CollabCommit[] {
    return this.vcs.listCommits(branch, limit);
  }

  public listCollabBranches(): import('./collab/types').CollabBranch[] {
    return this.vcs.listBranches();
  }

  public getCollabBranch(): string {
    return this.vcs.currentBranch;
  }

  public getCollabCommit(id: string): CollabCommit | undefined {
    return this.vcs.getCommit(id);
  }

  public createCollabBranch(name: string): void {
    this.vcs.createBranch(name);
    this.collabLog(`Branche « ${name} » créée.`);
    this.notifyHierarchy();
  }

  public switchCollabBranch(name: string): boolean {
    const snap = this.vcs.checkoutBranch(name);
    if (snap === null && !this.vcs.listBranches().some((b) => b.name === name)) return false;
    if (snap) {
      try {
        this.importScene(JSON.parse(JSON.stringify(snap)) as import('../types/engine').SceneExportData, {
          skipValidation: true,
        });
      } catch (err) {
        console.warn('[Collab] switch impossible.', err);
        return false;
      }
    }
    // Diffusé : les pairs convergent vers la branche basculée.
    this.collabManager?.notifyLocalMutation();
    this.collabLog(`Branche courante : ${name}.`);
    this.notifyHierarchy();
    return true;
  }

  public pendingCollabConflicts(): import('./collab/types').MergeConflict[] {
    return this.vcs.pendingMergeConflicts();
  }

  public discardCollabMerge(): void {
    this.vcs.discardMerge();
  }

  // --- Avatars distants (hôte) ---

  private spawnNetAvatar(
    clientId: number,
    name: string,
    x: number,
    y: number,
    z: number,
    yaw: number
  ): string {
    const node = this.addPrimitive('player', { x, y, z }, { silent: true });
    const obj = this.objects.get(node.id);
    if (obj) {
      obj.name = `Player_net_${clientId}`;
      obj.rotation.set(0, yaw, 0);
      obj.position.set(x, y, z);
      obj.userData = obj.userData || {};
      (obj.userData as Record<string, unknown>).netEphemeral = true;
      (obj.userData as Record<string, unknown>).netClientId = clientId;
      const bodyMesh = obj.children[0] as THREE.Mesh | undefined;
      if (bodyMesh && bodyMesh instanceof THREE.Mesh) {
        const mat = (bodyMesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.set([0xf472b6, 0x4ade80, 0xfacc15, 0xc084fc][clientId % 4]);
        bodyMesh.material = mat;
      }
      obj.updateMatrixWorld(true);
    }
    this.notifyHierarchy();
    this.netLog(`Avatar spawné pour ${name}.`);
    return node.id;
  }

  private removeNetAvatar(uuid: string): void {
    const obj = this.objects.get(uuid);
    if (!obj) return;
    // Même nettoyage que deleteObjectTree, sans historique (runtime réseau).
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) this.lodManager.unregisterMesh(child.uuid);
      this.impostorManager.unregister(child.uuid);
      this.occlusionManager.unregister(child.uuid);
    });
    const entity = this.ecsWorld.getEntity(uuid);
    if (entity) {
      try {
        this.ecsWorld.removeEntity(uuid);
      } catch {
        /* ignore */
      }
    }
    if (obj.parent) obj.parent.remove(obj);
    this.objects.delete(uuid);
    this.notifyHierarchy();
  }

  private teleportNetAvatar(uuid: string, x: number, y: number, z: number, yaw: number): void {
    const obj = this.objects.get(uuid);
    if (!obj) return;
    obj.position.set(x, y, z);
    obj.rotation.set(0, yaw, 0);
    obj.updateMatrixWorld(true);
    try {
      const entity = this.ecsWorld.getEntity(uuid);
      const pm = this.physicsManager as unknown as {
        teleportEntity?: (id: string, pos: THREE.Vector3, quat: THREE.Quaternion) => void;
      };
      if (entity && typeof pm.teleportEntity === 'function') {
        pm.teleportEntity(
          uuid,
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
        );
      }
    } catch {
      /* pas de corps physique (spawn mid-play) : visuel seul */
    }
  }

  private readHostPlayerState(): NetEntityState | null {
    const entity = this.getPlayerEntity();
    const obj = entity?.object3D;
    if (!obj) return null;
    const ctrl = entity?.getComponent('CharacterController') as
      | { velocity?: THREE.Vector3; verticalVelocity?: number; isGrounded?: boolean }
      | undefined;
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    return {
      id: 'p:0',
      p: [p.x, p.y, p.z],
      v: [ctrl?.velocity?.x ?? 0, ctrl?.verticalVelocity ?? 0, ctrl?.velocity?.z ?? 0],
      y: cameraForwardYaw(this.camera),
      f: (ctrl?.isGrounded ?? true) ? 1 : 0,
    };
  }

  /** Props flaguées `physics.netSync` (dynamiques, hôte autoritaire). */
  private collectNetProps(): NetEntityState[] {
    const out: NetEntityState[] = [];
    for (const obj of this.objects.values()) {
      if (!(obj instanceof THREE.Mesh)) continue;
      const phys = (obj.userData?.physics ?? {}) as { netSync?: unknown };
      if (phys.netSync !== true) continue;
      const q = obj.quaternion;
      out.push({
        id: `n:${obj.uuid}`,
        p: [obj.position.x, obj.position.y, obj.position.z],
        v: [0, 0, 0],
        y: obj.rotation.y,
        f: 0,
        q: [q.x, q.y, q.z, q.w],
      });
    }
    return out;
  }

  // --- Joueur local (client) : échantillonnage / correction ---

  private sampleNetInput(): { bits: number; yaw: number; dt: number; attackEdge: boolean } | null {
    if (!this.isPlaying) return null;
    const entity = this.getPlayerEntity();
    if (!entity?.object3D) return null;
    const input = this.physicsManager.characterSystem.input;
    const { bits, attackEdge } = sampleInputBits(input);
    return { bits, yaw: cameraForwardYaw(this.camera), dt: Math.min(this.lastFrameDt, 0.1), attackEdge };
  }

  private readLocalPlayerState(): {
    x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean;
  } | null {
    const entity = this.getPlayerEntity();
    const obj = entity?.object3D;
    if (!obj) return null;
    const ctrl = entity?.getComponent('CharacterController') as
      | { velocity?: THREE.Vector3; verticalVelocity?: number; isGrounded?: boolean }
      | undefined;
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    return {
      x: p.x, y: p.y, z: p.z,
      vx: ctrl?.velocity?.x ?? 0,
      vy: ctrl?.verticalVelocity ?? 0,
      vz: ctrl?.velocity?.z ?? 0,
      grounded: ctrl?.isGrounded ?? true,
    };
  }

  private applyNetCorrection(s: { x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean }): void {
    const entity = this.getPlayerEntity();
    const obj = entity?.object3D;
    if (!obj) return;
    obj.position.set(s.x, s.y, s.z);
    obj.updateMatrixWorld(true);
    const ctrl = entity?.getComponent('CharacterController') as
      | { velocity?: THREE.Vector3; verticalVelocity?: number; isGrounded?: boolean }
      | undefined;
    if (ctrl?.velocity) ctrl.velocity.set(s.vx, 0, s.vz);
    if (ctrl && 'verticalVelocity' in ctrl) ctrl.verticalVelocity = s.vy;
    if (ctrl && 'isGrounded' in ctrl) ctrl.isGrounded = s.grounded;
  }

  private teleportLocalPlayer(x: number, y: number, z: number, yaw: number): void {
    const entity = this.getPlayerEntity();
    const obj = entity?.object3D;
    if (!obj) return;
    obj.position.set(x, y, z);
    obj.rotation.set(0, yaw, 0);
    obj.updateMatrixWorld(true);
    const ctrl = entity?.getComponent('CharacterController') as
      | { velocity?: THREE.Vector3; verticalVelocity?: number; isGrounded?: boolean }
      | undefined;
    if (ctrl?.velocity) ctrl.velocity.set(0, 0, 0);
    if (ctrl && 'verticalVelocity' in ctrl) ctrl.verticalVelocity = 0;
  }

  public listAssetRecords(kind?: AssetKind): Promise<AssetRecord[]> {
    return this.assetDatabase.listRecords(kind);
  }

  public getAssetRecord(id: string): Promise<AssetRecord | null> {
    return this.assetDatabase.getRecord(id);
  }

  /** Supprime les assets non référencés (scène intacte garantie). */
  public purgeOrphanAssets(): Promise<OrphanPurgeResult> {
    return this.assetDatabase.purgeOrphans();
  }

  /**
   * Suppression explicite d'un asset (UI). Refusée s'il est encore utilisé,
   * sauf `force`. Retourne les propriétaires bloquants le cas échéant.
   */
  public deleteAssetRecord(id: string, force = false): Promise<AssetDeleteResult> {
    return this.assetDatabase.deleteAsset(id, force);
  }

  /** Importe un fichier audio dans le registre (décodage à la demande). */
  public async importAudioAsset(file: File): Promise<AssetRecord> {
    const bytes = await file.arrayBuffer();
    const ext = (file.name.match(/\.[^/.]+$/)?.[0] ?? '.wav').replace('.', '').toLowerCase();
    return this.assetDatabase.importAudio({
      name: file.name.replace(/\.[^/.]+$/, ''),
      format: ext,
      bytes,
    });
  }

  // --- Bundles (chargement paresseux par zone/pack) ---

  public createAssetBundle(name: string, assetIds: string[] = []): Promise<AssetBundleManifest> {
    return this.bundleManager.createBundle(name, { assetIds });
  }

  public listAssetBundles(): Promise<AssetBundleManifest[]> {
    return this.bundleManager.listBundles();
  }

  public preloadAssetBundle(id: string): Promise<{ warmed: number; bytes: number }> {
    return this.bundleManager.preload(id);
  }

  public unloadAssetBundle(id: string): Promise<{ evicted: number; bytes: number }> {
    return this.bundleManager.unload(id);
  }

  public deleteAssetBundle(id: string): Promise<boolean> {
    return this.bundleManager.deleteBundle(id);
  }

  public addAssetsToBundle(bundleId: string, assetIds: string[]): Promise<AssetBundleManifest | null> {
    return this.bundleManager.addAssets(bundleId, assetIds);
  }

  public removeAssetsFromBundle(bundleId: string, assetIds: string[]): Promise<AssetBundleManifest | null> {
    return this.bundleManager.removeAssets(bundleId, assetIds);
  }

  // ---------------------------------------------------------------------------
  // Debug — façade publique (TIER 1.3 : profiler, physics debug, mémoire)
  // ---------------------------------------------------------------------------

  /** Affiche/masque les wireframes des colliders Rapier (Play uniquement). */
  public setPhysicsDebugVisible(visible: boolean): void {
    this.physicsDebug.setVisible(visible);
  }

  public isPhysicsDebugVisible(): boolean {
    return this.physicsDebug.visible;
  }

  /** Snapshot complet pour le panneau profiler (polling UI à 4 Hz). */
  public getProfilerSnapshot(): ProfilerSnapshot | null {
    if (!this.frameProfiler) return null;
    const dist = this.frameProfiler.getFrameDistribution();
    const mem = this.memoryMonitor.latest();
    let leaks: string[] = [];
    try {
      leaks = this.memoryMonitor.leakWarnings('play-start', 'play-stop');
    } catch {
      /* ignore */
    }
    return {
      fps: this.frameProfiler.getFPS(),
      frame: {
        avg: dist.avg,
        p50: dist.p50,
        p95: dist.p95,
        p99: dist.p99,
        max: dist.max,
        count: dist.count,
      },
      sections: this.frameProfiler.getSectionStats(),
      recentTotals: this.frameProfiler.getRecentTotals(120),
      memory: mem ? { ...mem, leaks } : null,
      physicsDebug: this.physicsDebug.visible,
      physicsBodies: this.physicsManager.getBodiesCount(),
      isPlaying: this.isPlaying,
    };
  }

  /** Snapshot mémoire manuel (label libre, ex. 'avant-import'). */
  public snapshotMemoryNow(label = 'manual'): MemorySnapshot | null {
    try {
      return this.memoryMonitor.snapshot(this.scene, this.renderPipeline.getRenderer(), label);
    } catch {
      return null;
    }
  }

  public resetProfiler(): void {
    this.frameProfiler.reset();
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.foliageHistoryTimer) {
      clearTimeout(this.foliageHistoryTimer);
      this.foliageHistoryTimer = null;
    }
    if (this.repeatHistoryTimer) {
      clearTimeout(this.repeatHistoryTimer);
      this.repeatHistoryTimer = null;
    }

    this.history.dispose();
    this.playMode.dispose();
    this.textureStreamer.dispose();
    this.physicsDebug.dispose();
    this.lodManager.clear();
    this.impostorManager.dispose();
    this.occlusionManager.clear();
    this.animatorSystem.clear();
    this.guiManager.dispose();
    try {
      this.stopLivePreview();
    } catch {
      /* ignore */
    }
    try {
      this.stopCollabSession();
    } catch {
      /* ignore */
    }

    window.removeEventListener('keydown', this.handleKeyDown);
    // Les trois écouteurs pointer du canvas n'étaient pas retirés : sans
    // référence nommée ils étaient de toute façon inatteignables ici.
    this.unbindEvents();
    this.physicsManager.dispose();

    if (this.atmosphereManager) {
      this.atmosphereManager.dispose();
    }
    if (this.terrainGenerator) {
      this.terrainGenerator.dispose();
    }
    if (this.foliagePainter) {
      this.foliagePainter.dispose();
    }
    if (this.particleManager) {
      this.particleManager.dispose();
    }
    if (this.animationManager) {
      this.animationManager.dispose();
    }
    // Les rivières sont des maillages + shaders propres : sans cela, chaque
    // recharge de scène en laissait un contexte GPU de plus sur la carte.
    for (const river of this.riverMeshes) {
      river.dispose();
    }
    this.riverMeshes = [];
    this.waterManager?.dispose();

    // Mixers d'animation : sans `uncacheRoot`, three.js conserve un Actions
    // par clip pour chaque entité — le compteur d'actions montait sans borne
    // au fil des sessions de jeu.
    for (const mixer of this.mixers.values()) {
      mixer.uncacheRoot(mixer.getRoot());
    }
    this.mixers.clear();
    this.blendTreeActions.clear();
    this.oneShotActions.clear();
    this.smoothedEntitySpeeds.clear();
    this.warnedMissingClips.clear();
    this.activeProjectiles.length = 0;

    if (this.brushMarkerMesh) {
      this.brushMarkerMesh.geometry?.dispose();
      const brushMaterial = this.brushMarkerMesh.material;
      if (Array.isArray(brushMaterial)) brushMaterial.forEach((m) => m.dispose());
      else brushMaterial?.dispose();
    }

    if (this.dracoLoader) {
      this.dracoLoader.dispose();
    }

    this.physicsManager.characterSystem.setMouseLookTarget(null);
    this.selection.dispose();
    this.cameraManager.dispose();
    this.renderPipeline.dispose();

    this.objects.clear();
  }
}
