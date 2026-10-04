import * as THREE from 'three';
import { Entity, ECSWorld } from '../ecs/ECS';
import {
  EntityLogicData,
  
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
  NodeGraphData,
  GraphNodeData,
  Script,
} from '../../types/logic';
import { SoundEngine } from '../audio/SoundSynth';
import { ScriptSandbox } from './ScriptSandbox';
import { ScriptDebugger } from './ScriptDebugger';
import { ParticleManager } from '../vfx/ParticleManager';
import { AnimationManager } from '../animation/AnimationManager';
import { soundManager, SFXType, BGMMode } from '../SoundManager';
import { ParticlePreset } from '../../types/engine';
import { EnvironmentalPhysicsManager } from '../physics/EnvironmentalPhysicsManager';
import { NavMeshManager } from '../navigation/NavMeshManager';
import { TriggerVolumeManager } from '../navigation/TriggerVolumeManager';
import { PostProcessVolumeManager } from '../postprocess/PostProcessVolumeManager';
import {
  matchesKeyValue,
  parseKeyBinding,
  readMoveAxis,
  computeMove,
  parseTargetRef,
  clampNumber,
  MoveMode,
} from './inputLogic';
import {
  getSurface,
  resolveSurfaceProperties,
  impactStrength,
  SurfaceData,
} from './surfaceLogic';
import {
  computeTrail,
  TRAIL_PRESETS,
  TrailStyle,
} from './cameraTrailing';

/**
 * Profondeur maximale de récursion d'un flux de graphe. Un cycle dessiné dans
 * l'éditeur est une erreur de câblage classique ; on l'interrompt proprement
 * au lieu de laisser la pile JS déborder.
 */
const MAX_FLOW_DEPTH = 128;

/**
 * Plafond du pas de simulation, après application de l'échelle de temps.
 * Même valeur que le plafond de `dt` dans la boucle de rendu
 * (`SceneManager.animate`) : c'est le pas que Rapier tient sans que les corps
 * se traversent. Le but n'est donc pas de ralentir le jeu, mais d'empêcher
 * qu'un bullet-time ×10 transforme une frame lente en pas de physique d'une
 * seconde. À l'échelle 1 le delta réel est inchangé.
 */
const MAX_SIM_STEP = 0.05;

/**
 * Marqueur des nœuds déjà exécutés pour un contexte de flux donné. Stocké
 * directement sur l'objet contexte (non énumérable, donc invisible lors d'un
 * spread `{...context}`) : le Set meurt avec le contexte au lieu d'accumuler
 * une entrée par frame dans l'exécuteur pendant le Play.
 */
const FLOW_VISITED = Symbol('aether.flowVisited');

function visitedInFlow(context: object): Set<string> {
  const holder = context as Record<symbol, Set<string> | undefined>;
  let set = holder[FLOW_VISITED];
  if (!set) {
    set = new Set<string>();
    Object.defineProperty(context, FLOW_VISITED, { value: set, enumerable: false });
  }
  return set;
}

/**
 * Lit une valeur numérique « socket d'abord, réglage du panneau ensuite ».
 *
 * Une socket câblée doit TOUJOURS l'emporter sur le champ du panneau, sinon
 * l'utilisateur voit une valeur affichée qui est silencieusement ignorée.
 * `undefined`/`null`/non fini ⇒ on garde le réglage du panneau.
 */
function readNumeric(
  fromContext: unknown,
  fromNode: unknown
): number | undefined {
  if (typeof fromContext === 'number' && Number.isFinite(fromContext)) return fromContext;
  if (typeof fromNode === 'number' && Number.isFinite(fromNode)) return fromNode;
  return undefined;
}

/**
 * LogicExecutor
 * Orchestrates the 3-Tier logic engine (Cards, Node Graph, Custom Scripts)
 * for all entities in the ECS World during simulation.
 */
export class LogicExecutor {
  private ecsWorld: ECSWorld;
  public scene?: THREE.Scene;
  public particleManager?: ParticleManager;
  public animationManager?: AnimationManager;
  public environmentalPhysics?: EnvironmentalPhysicsManager;
  public navMeshManager?: NavMeshManager;
  public triggerVolumeManager?: TriggerVolumeManager;
  public postProcessVolumeManager?: PostProcessVolumeManager;
  public onPlaySkeletalAnimation?: (entityId: string, animationName: string) => void;
  /**
   * PhysicsManager optionnel : permet aux nœuds d'action de déplacer aussi le
   * corps Rapier, et pas seulement l'objet Three.js (voir `translate`).
   */
  /**
   * Port minimal du PhysicsManager dont l'exécuteur a besoin.
   *
   * Déclaré en `interface` plutôt qu'en type littéral : les méthodes de
   * mutation (friction, masse, amortissement) sont optionnelles côté moteur
   * (elles n'existent que si Rapier est chargé), donc l'exécuteur les appelle
   * toutes en `?.` et fonctionne aussi avec un double de test minimal.
   */
  public physicsManager?: {
    getEntityRigidbody(entityId: string): unknown;
    getBodySpeed?(entityId: string): { linear: number; angular: number } | null;
    setSurfaceProperties?(
      entityId: string,
      friction?: number,
      restitution?: number
    ): boolean;
    setBodyMass?(entityId: string, mass: number): boolean;
    setBodyDamping?(entityId: string, linear?: number, angular?: number): boolean;
  };
  public onShootProjectile?: (entityId: string, prefabId: string, speed: number, damage: number) => void;
  public onDamageEntity?: (entityId: string, damage: number, currentHealth: number) => void;
  public onCameraFollow?: (entityId: string | null, distance: number, height: number) => void;
  private isRunning: boolean = false;
  private elapsedTime: number = 0;

  // Pack Universel : pause, mort, réapparition, errance, suivi caméra
  private paused: boolean = false;
  private deathFired: boolean = false;
  private respawnPoints: Map<string, THREE.Vector3> = new Map();
  private wanderStates: Map<string, { dir: THREE.Vector3; timer: number }> = new Map();
  public cameraFollow: { entityId: string; distance: number; height: number } | null = null;

  /** Dernier axe de déplacement lu (pour le HUD / les animations). */
  public lastMoveAxis = { forward: 0, right: 0, sprint: 1, magnitude: 0, moving: false };
  /** Vitesse scalaire du dernier déplacement appliqué (unités/seconde). */
  public lastMoveSpeed = 0;
  /** Teste une touche enfoncée (utilisé par le HUD et les tests). */
  public isKeyDown(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  // Active runtime script instances (Level 3)
  private scriptInstances: Map<string, Script> = new Map();

  // Runtime state for Level 1 behavior cards
  private initialTransforms: Map<string, { pos: THREE.Vector3; rot: THREE.Euler }> = new Map();
  private patrolStates: Map<string, { currentDist: number; direction: number }> = new Map();
  private triggerCooldowns: Map<string, number> = new Map();

  // Runtime state for Level 2 node graphs
  private pressedKeys: Set<string> = new Set();
  private keyListener: ((e: KeyboardEvent) => void) | null = null;
  private keyUpListener: ((e: KeyboardEvent) => void) | null = null;
  private blurListener: (() => void) | null = null;
  private triggerInsideStates: Map<string, boolean> = new Map();
  /** Garde-fou anti-cycle pour les flux de graphe. */
  private flowDepth: number = 0;
  private flowLoopWarned: Set<string> = new Set();

  // --- État des effets sensoriels & matières (Lot realism) ---
  /** Gel d'impact en cours (HitStop) : durée restante en secondes. */
  private hitStopRemaining = 0;
  private hitStopTotal = 0;
  /** Tremblement (manette / caméra) en cours. */
  private rumble: { intensity: number; remaining: number; total: number } | null = null;
  /** Échelle de temps courante, mémorisée pour les capteurs. */
  private timeScale = 1;
  /** Matière connue par entité (SetMaterial/SetSurface) — sert aux capteurs. */
  private entitySurfaces: Map<string, SurfaceData> = new Map();
  /** Facteur de gravité personnalisé par entité (0 = zéro-g, 1 = normal). */
  private gravityScales: Map<string, number> = new Map();
  /** Traînée personnalisée par entité. */
  private dragValues: Map<string, number> = new Map();
  /** Vitesse verticale au dernier frame, pour détecter un atterrissage. */
  private verticalSpeeds: Map<string, number> = new Map();
  /** true tant que l'entité est au sol (mis à jour par checkLanding). */
  private groundedState: Map<string, boolean> = new Map();
  /**
   * Timers différés en cours (respawn, pulsations d'échelle/couleur). Ils
   * modifient des objets Three.js ; laissés en vol ils survivent au Stop et
   *Inclusiveallaient la session suivante — ou figeaient un maillage à 125 %
   * si l'on arrêtait pendant la pulsation.
   */
  private deferredTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  /** Setter de caméra fourni par le runtime, pour Shake/Rumble. */
  public onCameraShake?: (intensity: number, duration: number) => void;
  /**
   * Position trainée calculée chaque frame (nœud SlowFollow). Appliquée par le
   * runtime APRÈS le suivi rigide, sinon le retard serait annulé aussitôt.
   */
  public onCameraTrailing?: (
    position: { x: number; y: number; z: number },
    lookAt: { x: number; y: number; z: number },
    lag: number,
    speed: number
  ) => void;
  /**
   * Caméra à traîne (nœud SlowFollow) : retard conservé d'une frame à
   * l'autre. Absent = suivi rigide.
   */
  private trail: {
    targetId: string;
    style: TrailStyle;
    smoothing: number;
    lookAhead: number;
    previousTarget: { x: number; y: number; z: number };
  } | null = null;
  /** Position courante de la caméra trainée (mutée chaque frame). */
  private trailPosition: { x: number; y: number; z: number } | null = null;
  private entityTimerAccumulators: Map<string, Record<string, number>> = new Map();

  // Named timers for scripts (Engine.setTimer)
  private namedTimers: Map<
    string,
    { name: string; entityId: string; remaining: number; interval: number; repeat: boolean; fn?: () => void }
  > = new Map();

  // Global game state variables (Score, Health, etc.)
  public globalState: {
    score: number;
    health: number;
    inventory: string[];
    variables: Record<string, any>;
  } = {
    score: 0,
    health: 100,
    inventory: [],
    variables: {},
  };

  // Cutscene & Dialogue State
  public dialogueState: {
    active: boolean;
    speaker: string;
    text: string;
    portrait?: string;
    duration: number;
    timer: number;
  } = {
    active: false,
    speaker: '',
    text: '',
    duration: 5.0,
    timer: 0,
  };

  public cinematicState: {
    active: boolean;
    targetCameraName: string | null;
    blendDuration: number;
    depthOfFieldBlur: number;
  } = {
    active: false,
    targetCameraName: null,
    blendDuration: 1.0,
    depthOfFieldBlur: 0,
  };

  public floatingTexts: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    z: number;
    color: string;
    timer: number;
  }> = [];

  constructor(ecsWorld: ECSWorld) {
    this.ecsWorld = ecsWorld;
  }

  public getVariables() {
    return {
      ...this.globalState.variables,
      Score: this.globalState.score,
      Health: this.globalState.health,
    };
  }

  public dispatchAllVariables(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aether_update_var', {
          detail: this.getVariables(),
        })
      );
    }
  }

  public setVariable(name: string, value: any) {
    if (name === 'Score') this.globalState.score = Number(value);
    else if (name === 'Health') this.globalState.health = Number(value);
    else this.globalState.variables[name] = value;
    ScriptSandbox.setVariable(name, value);
    this.dispatchAllVariables();
    // Pack Universel : passer la Santé à 0 déclenche OnDeath
    if (name === 'Health') this.notifyHealthChanged();
  }

  public startSimulation(): void {
    this.isRunning = true;
    this.elapsedTime = 0;
    this.globalState.score = 0;
    this.globalState.health = 100;
    this.dispatchAllVariables();
    this.scriptInstances.clear();
    this.initialTransforms.clear();
    this.patrolStates.clear();
    this.triggerCooldowns.clear();
    this.pressedKeys.clear();
    this.triggerInsideStates.clear();
    this.flowDepth = 0;
    this.flowLoopWarned.clear();
    this.entityTimerAccumulators.clear();
    this.namedTimers.clear();
    // Pack Universel : état de partie réinitialisé à chaque lancement
    this.paused = false;
    this.deathFired = false;
    this.respawnPoints.clear();
    this.wanderStates.clear();
    this.cameraFollow = null;
    this.onCameraFollow?.(null, 0, 0);
    ScriptSandbox.setTimeScale(1);
    // États transitoires des nœuds (compte à rebours, cooldowns)
    for (const ent of this.ecsWorld.getAllEntities()) {
      const lg = ent.object3D?.userData?.logic as EntityLogicData | undefined;
      for (const n of lg?.nodeGraph?.nodes ?? []) {
        delete n.values._running;
        delete n.values._cd;
        if (n.type === 'Countdown') n.values.remaining = Number(n.values.duration ?? 10);
      }
    }
    ScriptDebugger.reset();
    ScriptSandbox.cancelAllCoroutines();

    // Bind Engine facade runtime (emit / clavier / temps / timers)
    ScriptSandbox.runtime = {
      emit: (name, data) => this.emitCustomEvent(name, data),
      isKeyDown: (code) => this.pressedKeys.has(code),
      getTime: () => this.elapsedTime,
      setTimeScale: () => {},
      setTimer: (name, seconds, repeat, entityId, fn) => {
        this.namedTimers.set(`${entityId}:${name}`, {
          name,
          entityId,
          remaining: seconds,
          interval: seconds,
          repeat,
          fn,
        });
      },
      clearTimer: (name, entityId) => {
        this.namedTimers.delete(`${entityId}:${name}`);
      },
    };

    // Bind key events for OnKeyPress/OnKeyRelease nodes + script onKeyDown/onKeyUp
    if (typeof window !== 'undefined') {
      this.keyListener = (e: KeyboardEvent) => {
        if (!this.isRunning) return;
        // La répétition OS ne doit pas rejouer l'événement : sans ce garde,
        // maintenir une touche déclencherait l'action des dizaines de fois/s.
        if (e.repeat) return;
        this.pressedKeys.add(e.code);
        this.handleKeyPress(e.code, true);
        this.dispatchScriptKey('onKeyDown', e.code);
      };
      this.keyUpListener = (e: KeyboardEvent) => {
        if (!this.isRunning) return;
        this.pressedKeys.delete(e.code);
        this.handleKeyPress(e.code, false);
        this.dispatchScriptKey('onKeyUp', e.code);
      };
      window.addEventListener('keydown', this.keyListener);
      window.addEventListener('keyup', this.keyUpListener);
      // Perdre le focus ne génère pas de `keyup` : sans ce reset, rester
      //iru l'objet dans une direction tant qu'on n'a pas re-cliqué.
      this.blurListener = () => this.pressedKeys.clear();
      window.addEventListener('blur', this.blurListener);
    }

    const entities = this.ecsWorld.getAllEntities();

    // 1. Snapshot initial transforms
    for (const entity of entities) {
      if (entity.object3D) {
        this.initialTransforms.set(entity.id, {
          pos: entity.object3D.position.clone(),
          rot: entity.object3D.rotation.clone(),
        });
      }

      const logicData = entity.object3D?.userData?.logic as EntityLogicData | undefined;
      if (!logicData) continue;

      // 2. Initialize Level 2 Node Graph OnStart events
      if (logicData.nodeGraph?.enabled) {
        this.executeGraphEvents(entity, 'OnStart');
      }

      // 3. Initialize Level 3 Custom Scripts (debug instrumentation si breakpoints)
      if (logicData.customScript?.enabled && logicData.customScript.code) {
        this.instantiateEntityScript(entity, logicData.customScript);
      }
    }
  }

  /** Compile + instantiate le script custom d'une entité (Play start ou hot reload). */
  private instantiateEntityScript(entity: Entity, scriptData: EntityLogicData['customScript']): void {
    const hasBps = (scriptData.breakpoints?.length ?? 0) > 0;
    const run = (ScriptClass: (new () => Script) | null, error: string | null) => {
      if (!ScriptClass) {
        if (error) ScriptSandbox.addLog(`[Script Syntax Error on ${entity.name}]: ${error}`, 'error');
        return;
      }
      const instance = ScriptSandbox.instantiate(
        ScriptClass,
        entity,
        (name) => this.findEntityByName(name),
        (ent) => this.destroyEntity(ent)
      );
      if (instance) {
        this.scriptInstances.set(entity.id, instance);
        ScriptSandbox.invokeStart(instance);
      }
    };

    if (hasBps && typeof ScriptSandbox.compileAsync === 'function') {
      void ScriptSandbox.compileAsync(scriptData.code, {
        entityId: entity.id,
        entityName: entity.name,
      }).then(({ ScriptClass, error }) => run(ScriptClass, error));
    } else {
      const { ScriptClass, error } = ScriptSandbox.compile(scriptData.code);
      run(ScriptClass, error);
    }
  }

  /**
   * Hot reload : recompile et réinstancie le script pendant Play sans redémarrer.
   * Appelé depuis page.tsx / updateLogic quand le code custom change.
   */
  public reloadScript(entityId: string): void {
    if (!this.isRunning) return;
    const entity = this.ecsWorld.getEntity(entityId);
    if (!entity) return;
    const logicData = entity.object3D?.userData?.logic as EntityLogicData | undefined;
    const old = this.scriptInstances.get(entityId);
    if (old) {
      ScriptSandbox.invokeDestroy(old);
      this.scriptInstances.delete(entityId);
    }
    ScriptDebugger.invalidate(entityId);
    if (logicData?.customScript?.enabled && logicData.customScript.code) {
      this.instantiateEntityScript(entity, logicData.customScript);
      if (logicData.customScript.breakpoints) {
        ScriptDebugger.setBreakpoints(entityId, logicData.customScript.breakpoints);
      }
      ScriptSandbox.addLog(`[Hot Reload] Script rechargé sur ${entity.name}`, 'log');
    }
  }

  /** Émet un événement custom vers scripts + nœuds OnCustomEvent de toutes les entités. */
  public emitCustomEvent(name: string, data?: any): void {
    if (!this.isRunning) return;
    const payload = { eventName: name, ...(data && typeof data === 'object' ? data : { data }) };
    for (const entity of this.ecsWorld.getAllEntities()) {
      if (!entity.active) continue;
      const script = this.scriptInstances.get(entity.id);
      if (script) ScriptSandbox.invokeCustomEvent(script, name, data);
      const logicData = entity.object3D?.userData?.logic as EntityLogicData | undefined;
      if (logicData?.nodeGraph?.enabled) {
        this.executeGraphEvents(entity, 'OnCustomEvent', payload);
      }
    }
  }

  private dispatchScriptKey(hook: 'onKeyDown' | 'onKeyUp', code: string): void {
    for (const [id, script] of this.scriptInstances) {
      const entity = this.ecsWorld.getEntity(id);
      if (entity?.active === false) continue;
      if (hook === 'onKeyDown') ScriptSandbox.invokeKeyDown(script, code);
      else ScriptSandbox.invokeKeyUp(script, code);
    }
  }

  /** Déclenche le hook script éventuel + le graphe pour un événement déclencheur. */
  private dispatchScriptEvent(
    entityId: string,
    hook: 'onClick' | 'onTriggerEnter' | 'onTriggerExit' | 'onDestroy',
    other?: Entity
  ): void {
    const script = this.scriptInstances.get(entityId);
    if (script) {
      if (hook === 'onClick') ScriptSandbox.invokeClick(script);
      else if (hook === 'onTriggerEnter' && other) ScriptSandbox.invokeTriggerEnter(script, other);
      else if (hook === 'onTriggerExit' && other) ScriptSandbox.invokeTriggerExit(script, other);
      else if (hook === 'onDestroy') ScriptSandbox.invokeDestroy(script);
    }
  }

  /** Point d'entrée clic (SceneManager.onClickedEntity). */
  public handleEntityClick(entityId: string): void {
    if (!this.isRunning) return;
    this.dispatchScriptEvent(entityId, 'onClick');
    const entity = this.ecsWorld.getEntity(entityId);
    if (entity) this.executeGraphEvents(entity, 'OnClick');
  }

  /**
   * Applique une dérogation en jeu à un personnage piloté par
   * CharacterController (le joueur).
   *
   * Ces entités n'ont PAS de corps rigide : leur mouvement est calculé par
   * `CharacterControllerSystem` / `PhysicsManager.updateCharacterControllerPhysics`,
   * pas par Rapier. Écrire dans le corps Rapier n'aurait donc aucun effet — le
   * nœud semblerait marcher et ne bougerait rien.
   *
   * Retourne false si l'entité n'a pas de CharacterController : l'appelant
   * bascule alors sur la voie corps rigide.
   */
  private setCharacterOverride(
    entity: Entity,
    key: 'gravityScale' | 'traction' | 'groundFriction' | 'drag',
    value: number
  ): boolean {
    const comp = entity.getComponent?.('CharacterController') as unknown as {
      runtimeOverrides?: Record<string, number | null>;
    } | undefined;
    if (!comp?.runtimeOverrides) return false;
    comp.runtimeOverrides[key] = value;
    return true;
  }

  /**
   * Mémorise la matière d'une entité pour les capteurs (OnSurfaceEnter/Exit).
   * On stocke sur l'objet Three.js (`userData.surface`) ET en mémoire : le
   * premier survit au changement de scène, le second est plus rapide.
   */
  private rememberSurface(entity: Entity, surface: SurfaceData): void {
    const previousId = this.getSurfaceOf(entity)?.id;
    this.entitySurfaces.set(entity.id, surface);
    if (entity.object3D) {
      entity.object3D.userData.surface = surface.id;
    }
    // Un changement de matière réveille les capteurs OnSurfaceExit /
    // OnSurfaceEnter. Ce dispatch est la SEULE chose qui déclenche ces deux
    // nœuds : sans lui ils étaient déclarés, câblables, documentés dans
    // l'éditeur… et parfaitement inertes. La première définition compte comme
    // une entrée (« je viens d'entrer dans cette matière »), pas de sortie.
    if (previousId === undefined || previousId !== surface.id) {
      if (previousId !== undefined) {
        this.dispatchSurfaceEvent(entity, 'OnSurfaceExit', previousId);
      }
      this.dispatchSurfaceEvent(entity, 'OnSurfaceEnter', surface.id);
    }
  }

  /** Matière d'une entité, ou `null` si elle n'a jamais été définie. */
  private getSurfaceOf(entity: Entity): SurfaceData | null {
    const cached = this.entitySurfaces.get(entity.id);
    if (cached) return cached;
    const id = entity.object3D?.userData?.surface;
    return id ? getSurface(id) : null;
  }

  /** Facteur d'échelle appliqué au temps réel pour obtenir du temps de jeu. */
  public get simulationTimeScale(): number {
    return ScriptSandbox.getTimeScale();
  }

  /**
   * Convertit un delta temps réel en delta temps de jeu.
   *
   * Le plafond évite qu'un bullet-time ×10 sur une frame lente n'impose un pas
   * de physique de 150 ms : au-delà, Rapier devient instable. À l'échelle 1 le
   * pas est le delta réel, donc le comportement normal est inchangé.
   */
  public scaledDelta(realDt: number): number {
    const scaled = realDt * ScriptSandbox.getTimeScale();
    return Math.min(scaled, MAX_SIM_STEP);
  }

  /**
   * `setTimeout` suivi : le timer est annulé au Stop et se désabonne lui-même.
   * Sans ce suivi, un callback déjà planifié s'exécute après l'arrêt du jeu.
   */
  private defer(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.deferredTimers.delete(id);
      if (!this.isRunning) return;
      fn();
    }, ms);
    this.deferredTimers.add(id);
  }

  /** Annule tous les timers différés en cours. */
  private clearDeferredTimers(): void {
    for (const id of this.deferredTimers) clearTimeout(id);
    this.deferredTimers.clear();
  }

  /**
   * Applique une gravité personnalisée à une entité.
   *
   * Un corps Rapier reçoit une force continue ; un objet sans corps reçoit
   * une intégration manuelle, pour que le nœud fonctionne aussi sur un simple
   * maillage (utile pour les décorations et le prototypage).
   */
  private applyGravity(target: Entity, accel: number): void {
    const body = this.physicsManager?.getEntityRigidbody?.(target.id) as
      | {
          isKinematic?: () => boolean;
          addForce?: (f: { x: number; y: number; z: number }, wake?: boolean) => void;
        }
      | undefined;

    if (body && !body.isKinematic?.()) {
      body.addForce?.({ x: 0, y: accel * 4, z: 0 }, true);
      return;
    }
    if (target.object3D && accel !== 0) {
      target.object3D.position.y += accel * 0.016;
    }
  }

  /**
   * Avance la caméra à traîne d'une frame.
   *
   * Appelée chaque frame dans `update()`. La position trainée est renvoyée au
   * runtime via `onCameraTrailing`, qui l'applique à la CameraManager APRÈS le
   * suivi rigide — sinon la caméra reviendrait à sa place collée et la traîne
   * serait sans effet.
   */
  private updateTrailCamera(dt: number): void {
    const trail = this.trail;
    if (!trail) return;
    const entity = this.ecsWorld.getEntity(trail.targetId);
    const obj = entity?.object3D;
    // `getEntity` renvoie aussi les entités désactivées : sans ce test, un
    // objet détruit laisserait la caméra verrouillée sur lui pour le reste de
    // la partie, puisque l'objet3D survit à la désactivation.
    if (!obj || !entity.active) {
      this.trail = null;
      this.trailPosition = null;
      return;
    }

    const target = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
    // Vitesse de la cible, mesurée AVANT de mettre previousTarget à jour :
    // sinon le déplacement de cette frame serait déjà consommé et la vitesse
    // vaudrait toujours 0 (le FOV dynamique ne s'ouvrirait jamais).
    const speed = Math.hypot(
      target.x - trail.previousTarget.x,
      target.y - trail.previousTarget.y,
      target.z - trail.previousTarget.z
    );
    // Point de base : derrière la cible, à hauteur de tête. C'est la position
    // « idéale » ; le retard vient du lissage vers cette position.
    const base = {
      x: target.x,
      y: target.y + 3,
      z: target.z + 6,
    };
    if (!this.trailPosition) this.trailPosition = { ...base };

    const result = computeTrail(this.trailPosition, trail.previousTarget, {
      base,
      target,
      smoothing: trail.smoothing,
      minDistance: 1,
      dt,
      style: trail.style,
      lookAhead: trail.lookAhead,
    });

    this.trailPosition = result.position;
    trail.previousTarget = target;

    // FOV dynamique : la caméra s'ouvre avec la vitesse pour que le sujet reste
    // dans le cadre — sans ça, un véhicule rapide sort de l'écran.
    this.onCameraTrailing?.(result.position, result.lookAt, result.lag, speed);
  }

  /**
   * Avance les effets temporels (HitStop, Rumble) et restaure le temps.
   *
   * Le HitStop remet l'échelle à 1 une fois écoulé. On n'écrase jamais une
   * échelle posée par `SetTimeScale` : si l'utilisateur a demandé un ralenti
   * durable, le gel d'impact ne doit pas l'annuler.
   */
  private updateTemporalEffects(dt: number): void {
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= dt;
      if (this.hitStopRemaining <= 0) {
        this.hitStopRemaining = 0;
        this.hitStopTotal = 0;
        ScriptSandbox.setTimeScale(this.timeScale);
      }
    }

    if (this.rumble) {
      this.rumble.remaining -= dt;
      if (this.rumble.remaining <= 0) {
        this.rumble = null;
        this.onCameraShake?.(0, 0);
      } else {
        // Décroissance quadratique : la fin d'un tremblement s'estompe au
        // lieu de s'arrêter net, ce qui est plus naturel à la main/caméra.
        const ratio = Math.max(0, this.rumble.remaining / Math.max(0.001, this.rumble.total));
        this.onCameraShake?.(this.rumble.intensity * ratio * ratio, this.rumble.remaining);
      }
    }
  }

  /**
   * Détecte les atterrissages et les changements de matière, puis dispatche
   * les nœuds capteurs (OnLand / OnSurfaceEnter / OnSurfaceExit).
   *
   * L'atterrissage est détecté par le signe de la vitesse verticale : on était
   * en train de descendre et on ne descend plus ⇒ le sol a été touché, et la
   * vitesse d'impact donne la force de l'atterrissage.
   */
  private updateSurfaceSensors(): void {
    for (const entity of this.ecsWorld.getAllEntities()) {
      if (!entity.active || !entity.object3D) continue;
      const logicData = entity.object3D.userData?.logic as EntityLogicData | undefined;
      if (!logicData?.nodeGraph?.enabled) continue;

      // Le joueur n'a pas de corps rigide : on lit sa vitesse verticale sur le
      // composant CharacterController, sinon `OnLand` ne se déclencherait
      // JAMAIS pour lui — le cas le plus important.
      const vertical = this.readVerticalSpeed(entity.id, entity);
      if (vertical !== null) {
        // On mémorise la vitesse AVANT contact : au moment de l'atterrissage la
        // vitesse verticale est déjà remise à zéro par le sol, si on lisait
        // celle-ci la force d'impact vaudrait toujours 0 et « Doux/Violent »
        // serait toujours « Doux ».
        const previous = this.verticalSpeeds.get(entity.id) ?? 0;
        const wasFalling = previous < -0.15;
        const nowFalling = vertical < -0.05;
        this.verticalSpeeds.set(entity.id, vertical);

        if (wasFalling && !nowFalling) {
          const impact = Math.abs(previous);
          this.groundedState.set(entity.id, true);
          if (impact > 0.5) this.dispatchLanding(entity, impact);
        } else if (nowFalling) {
          this.groundedState.set(entity.id, false);
        }
      }
    }
  }

  /**
   * Vitesse verticale instantanée, lue hors des corrections de contact de
   * Rapier pour ne pas confondre un impact avec un simple contact.
   *
   * Deux sources : le corps rigide (objet qui tombe) ou, à défaut, le
   * `verticalVelocity` du CharacterController (le joueur). Sans ce second
   * chemin, un atterrissage de joueur ne déclencherait jamais `OnLand`.
   */
  private readVerticalSpeed(entityId: string, entity?: Entity): number | null {
    const body = this.physicsManager?.getEntityRigidbody?.(entityId) as
      | { linvel?: () => { y: number } }
      | undefined;
    const v = body?.linvel?.();
    if (v) return v.y;

    const cc = entity?.getComponent?.('CharacterController') as unknown as
      | { verticalVelocity?: number }
      | undefined;
    if (cc && typeof cc.verticalVelocity === 'number') return cc.verticalVelocity;
    return null;
  }

  /** Dispatche OnLand avec la force d'impact normalisée (0..1). */
  private dispatchLanding(entity: Entity, impactSpeed: number): void {
    const logicData = entity.object3D?.userData?.logic as EntityLogicData | undefined;
    const graph = logicData?.nodeGraph;
    if (!graph) return;

    const force = impactStrength(impactSpeed);
    for (const node of graph.nodes) {
      if (node.type !== 'OnLand') continue;
      if (impactSpeed < Number(node.values.minSpeed ?? 1)) continue;
      const wanted = String(node.values.surface ?? '*');
      const surface = this.getSurfaceOf(entity);
      // `wanted === '*'` doit matcher même une entité SANS matière déclarée :
      // sinon un capteur « n'importe quelle matière » ignorerait tous les
      // objets qui n'ont jamais eu de SetMaterial — donc la plupart.
      if (wanted !== '*' && surface?.id !== wanted) continue;

      const ctx = { surface: surface?.id ?? 'default', impact: force, speed: impactSpeed };
      // `OnLand` est un nœud d'ÉVÉNEMENT : il n'a pas de socket `in_flow`
      // (cf. getSocketsForNodeType) et aucun `case` dans executeGraphNode.
      // L'appeler par executeGraphNode tomberait dans le `default` et ne
      // déclencherait jamais sa branche. On dispatche donc directement sur
      // ses sorties, comme le fait executeGraphEvents pour OnCollision.
      //
      // `forceRootScope` sur chacune des trois : ce sont trois branches
      // distinctes d'un même capteur. Sans cela, le nœud d'action atteint par
      // `out_flow` resterait marqué et les deux sorties suivantes
      // l'ignoreraient — un « son d'atterrissage + particules d'impact » ne
      // déclencherait que le son.
      this.triggerNodeOutput(entity, graph, node.id, 'out_flow', ctx, true);
      // Le seuil Doux/Violent est à 0,5, soit ~6 m/s (≈ 22 km/h) : c'est
      // l'ordre de grandeur où un atterrissage change de nature.
      this.triggerNodeOutput(
        entity,
        graph,
        node.id,
        force < 0.5 ? 'out_soft' : 'out_hard',
        ctx,
        true
      );
      this.triggerNodeOutput(entity, graph, node.id, 'out_impact', ctx, true);
    }
  }

  /** Dispatche OnSurfaceEnter / OnSurfaceExit pour une matière donnée. */
  private dispatchSurfaceEvent(
    entity: Entity,
    type: 'OnSurfaceEnter' | 'OnSurfaceExit',
    surfaceId: string
  ): void {
    const logicData = entity.object3D?.userData?.logic as EntityLogicData | undefined;
    const graph = logicData?.nodeGraph;
    if (!graph) return;

    for (const node of graph.nodes) {
      if (node.type !== type) continue;
      const wanted = String(node.values.surface ?? '*');
      if (wanted !== '*' && wanted !== surfaceId) continue;
      const ctx = { surface: surfaceId };
      // Nœud d'ÉVÉNEMENT : dispatch direct sur ses sorties (voir dispatchLanding).
      // `forceRootScope` : ce capteur est un événement NEUF, pas la suite du flux
      // qui vient de changer la matière — il doit donc repartir d'un marqueur de
      // passage vierge même quand le déclencheur est lui-même dans un flux.
      this.triggerNodeOutput(entity, graph, node.id, 'out_flow', ctx, true);
      this.triggerNodeOutput(entity, graph, node.id, 'out_surface', ctx, true);
    }
  }

  /**
   * Déplace un objet en tenant compte de la physique.
   *
   * Écrire uniquement `object3D.position` ne suffit PAS en Play : pour un corps
   * RIGIDE non cinématique, `PhysicsManager.step()` réécrit la position de
   * l'objet à partir de Rapier à chaque frame — le déplacement est donc annulé
   * avant même d'être affiché. Les corps cinématiques font l'inverse
   * (Three.js → Rapier) et ne souffrent pas de ce problème.
   *
   * On déplace donc les deux, et on annule la vitesse résiduelle du corps pour
   * qu'il ne continue pas sur sa trajectoire précédente.
   */
  private translate(entity: Entity, dx: number, dz: number, heading?: number | null): void {
    const obj = entity.object3D;
    if (!obj) return;

    obj.position.x += dx;
    obj.position.z += dz;
    if (heading !== null && heading !== undefined) obj.rotation.y = heading;

    const body = this.physicsManager?.getEntityRigidbody(entity.id) as
      | {
          isKinematic?: () => boolean;
          setTranslation?: (v: { x: number; y: number; z: number }, wake?: boolean) => void;
          setRotation?: (q: { x: number; y: number; z: number; w: number }, wake?: boolean) => void;
          setLinvel?: (v: { x: number; y: number; z: number }, wake?: boolean) => void;
        }
      | undefined;

    // Les corps cinématiques sont déjà synchronisés depuis Three.js (step 1c).
    if (body && !body.isKinematic?.()) {
      body.setTranslation?.({ x: obj.position.x, y: obj.position.y, z: obj.position.z }, true);
      if (heading !== null && heading !== undefined) {
        const half = heading / 2;
        body.setRotation?.({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);
      }
      // Sans ça, le corps garde son élan et dérive loin du point visé.
      body.setLinvel?.({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Tier 3.1 : hook script enter/exit depuis TriggerVolumeManager (via SceneManager). */
  public dispatchTriggerHook(entityId: string, phase: 'enter' | 'exit', other: Entity): void {
    if (!this.isRunning) return;
    this.dispatchScriptEvent(entityId, phase === 'enter' ? 'onTriggerEnter' : 'onTriggerExit', other);
  }

  public stopSimulation(): void {
    this.isRunning = false;
    if (this.keyListener && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = null;
    }
    if (this.keyUpListener && typeof window !== 'undefined') {
      window.removeEventListener('keyup', this.keyUpListener);
      this.keyUpListener = null;
    }
    if (this.blurListener && typeof window !== 'undefined') {
      window.removeEventListener('blur', this.blurListener);
      this.blurListener = null;
    }
    // onDestroy hooks avant de vider les instances
    for (const [, script] of this.scriptInstances) {
      ScriptSandbox.invokeDestroy(script);
    }
    this.scriptInstances.clear();
    this.triggerInsideStates.clear();
    this.entityTimerAccumulators.clear();
    this.namedTimers.clear();
    // Timers différés (Delay, respawn, pulsations) : annulés ici, pas
    // simplement ignorés, pour qu'ils ne se réveillent pas au Play suivant.
    this.clearDeferredTimers();
    // Effets sensoriels : un HitStop ou un Rumble laissé actif survivrait au
    // Stop et gèlerait / secouerait la session suivante.
    this.hitStopRemaining = 0;
    this.hitStopTotal = 0;
    this.rumble = null;
    this.timeScale = 1;
    this.entitySurfaces.clear();
    this.gravityScales.clear();
    this.dragValues.clear();
    this.verticalSpeeds.clear();
    this.groundedState.clear();
    this.trail = null;
    this.trailPosition = null;
    // Les dérogations du joueur (gravité lunaire, sol de glace) sont des effets
    // de jeu : elles doivent disparaître au Stop, sinon la session suivante
    // démarrerait avec un joueur lunaire sans que rien ne l'ait demandé.
    for (const ent of this.ecsWorld.getAllEntities()) {
      const cc = ent.getComponent?.('CharacterController') as unknown as
        | { clearRuntimeOverrides?: () => void }
        | undefined;
      cc?.clearRuntimeOverrides?.();
    }
    this.onCameraShake?.(0, 0);
    ScriptSandbox.setTimeScale(1);
    ScriptDebugger.reset();
    ScriptSandbox.cancelAllCoroutines();
    ScriptSandbox.runtime = {};

    // Reset overlays cinématiques/dialoques au stop
    this.dialogueState.active = false;
    this.dialogueState.timer = 0;
    this.cinematicState.active = false;
    this.cinematicState.targetCameraName = null;
    this.cinematicState.depthOfFieldBlur = 0;
    this.floatingTexts = [];
    // Pack Universel : lève la pause et le suivi caméra
    this.paused = false;
    this.deathFired = false;
    this.cameraFollow = null;
    this.onCameraFollow?.(null, 0, 0);

    // Silence procedural BGM loops
    soundManager.setBGMMode('off');

    // Restore initial entity states (un-hide collected entities)
    const entities = this.ecsWorld.getAllEntities();
    for (const entity of entities) {
      entity.active = true;
      if (entity.object3D) {
        entity.object3D.visible = true;
        const initial = this.initialTransforms.get(entity.id);
        if (initial) {
          entity.object3D.position.copy(initial.pos);
          entity.object3D.rotation.copy(initial.rot);
        }
      }
    }
  }

  public update(dt: number): void {
    if (!this.isRunning) return;
    // Pack Universel : PauseGame gèle toute la simulation (le rendu continue)
    if (this.paused) return;
    // `dt` est le temps RÉEL écoulé depuis la frame précédente. Tout ce qui
    // est « jeu » (temps de jeu, timers, physique) doit avancer au rythme de
    // l'échelle de temps posée par SetTimeScale — c'est ce que promet le nœud
    // (« ralenti / bullet-time »). `realDt` reste utilisé pour les effets
    // temporels : un HitStop doit pouvoir expirer même pendant le gel qu'il
    // provoque, sinon il gèlerait la session à jamais.
    const realDt = dt;
    const simDt = this.scaledDelta(dt);
    this.elapsedTime += simDt;

    // Effets temporels et capteurs : avant le graphe, pour que le HitStop et
    // le rumble de la frame précédente soient déjà résolus quand les nœuds
    // d'événement s'exécutent.
    this.updateTemporalEffects(realDt);
    this.updateSurfaceSensors();
    this.updateTrailCamera(simDt);

    const entities = this.ecsWorld.getAllEntities().filter((e) => e.active);

    // Find the player entity for proximity checks (CharacterController or subType === 'player')
    const playerEntity = this.findPlayerEntity();

    // Update Trigger Volumes & Checkpoints
    if (this.triggerVolumeManager) {
      this.triggerVolumeManager.update(
        simDt,
        this.elapsedTime,
        entities,
        () => playerEntity,
        this.isRunning
      );
    }

    // Update NavMesh Agent Pathfinding Steering
    if (this.navMeshManager && this.isRunning) {
      this.navMeshManager.updateAgents(
        simDt,
        (id) => {
          const ent = this.ecsWorld.getEntity(id);
          return ent?.object3D?.position || null;
        },
        () => playerEntity?.object3D?.position || null
      );
    }

    // Update floating damage texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.timer -= simDt;
      ft.y += simDt * 1.5;
      if (ft.timer <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Auto-fermeture du dialogue actif après écoulement de sa durée
    if (this.dialogueState.active) {
      this.dialogueState.timer -= simDt;
      if (this.dialogueState.timer <= 0) {
        this.dialogueState.active = false;
        this.dialogueState.timer = 0;
      }
    }

    for (const entity of entities) {
      const obj = entity.object3D;
      if (!obj) continue;

      const logicData = obj.userData?.logic as EntityLogicData | undefined;
      if (!logicData) continue;

      // ----------------------------------------------------
      // LEVEL 1: BEHAVIOR CARDS UPDATE
      // ----------------------------------------------------
      if (logicData.cards && logicData.cards.length > 0) {
        for (const card of logicData.cards) {
          if (!card.enabled) continue;

          switch (card.type) {
            case 'Collectable': {
              const cfg = card.config as CollectableConfig;
              // Spin mesh
              const rotSpeed = ((cfg.rotateSpeed ?? 90) * Math.PI) / 180;
              obj.rotation.y += rotSpeed * simDt;

              // Floating bob
              const initial = this.initialTransforms.get(entity.id);
              if (initial) {
                const hoverAmp = cfg.hoverAmplitude ?? 0.2;
                const hoverSpd = cfg.hoverSpeed ?? 2.5;
                obj.position.y = initial.pos.y + Math.sin(this.elapsedTime * hoverSpd) * hoverAmp;
              }

              // Proximity collection check with Player
              if (playerEntity && playerEntity.object3D) {
                const dist = obj.position.distanceTo(playerEntity.object3D.position);
                if (dist < 1.4) {
                  this.collectEntity(entity, cfg);
                }
              }
              break;
            }

            case 'Patrol': {
              const cfg = card.config as PatrolConfig;
              let state = this.patrolStates.get(entity.id);
              if (!state) {
                state = { currentDist: 0, direction: 1 };
                this.patrolStates.set(entity.id, state);
              }

              const moveStep = (cfg.speed ?? 3.0) * simDt * state.direction;
              const axis = cfg.axis || 'x';
              const maxDist = cfg.distance ?? 6.0;

              obj.position[axis] += moveStep;
              state.currentDist += Math.abs(moveStep);

              if (state.currentDist >= maxDist) {
                state.direction *= -1;
                state.currentDist = 0;
                // Turn mesh facing direction
                if (axis === 'x') {
                  obj.rotation.y = state.direction > 0 ? 0 : Math.PI;
                } else if (axis === 'z') {
                  obj.rotation.y = state.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
                }
              }
              break;
            }

            case 'TriggerZone': {
              const cfg = card.config as TriggerZoneConfig;
              if (playerEntity && playerEntity.object3D) {
                const dist = obj.position.distanceTo(playerEntity.object3D.position);
                const radius = cfg.radius ?? 3.0;
                const isInside = dist <= radius;
                const wasInside = this.triggerInsideStates.get(entity.id) || false;

                if (isInside && !wasInside) {
                  this.triggerInsideStates.set(entity.id, true);
                  // Execute Trigger action
                  if (cfg.soundPreset && cfg.soundPreset !== 'none') {
                    SoundEngine.play(cfg.soundPreset);
                  }
                  if (cfg.action === 'EmitPulse') {
                    this.pulseEntity(entity);
                  }
                  if (cfg.message) {
                    ScriptSandbox.addLog(`[Zone Trigger: ${entity.name}] ${cfg.message}`, 'log');
                  }
                  this.executeGraphEvents(entity, 'OnTriggerEnter', { target: playerEntity });
                  this.dispatchScriptEvent(entity.id, 'onTriggerEnter', playerEntity);
                } else if (!isInside && wasInside) {
                  this.triggerInsideStates.set(entity.id, false);
                  ScriptSandbox.addLog(`[Zone Sortie: ${entity.name}] Le joueur est sorti de la zone`, 'log');
                  this.executeGraphEvents(entity, 'OnTriggerExit', { target: playerEntity });
                  this.dispatchScriptEvent(entity.id, 'onTriggerExit', playerEntity);
                }
              }
              break;
            }

            case 'DamageOnTouch': {
              const cfg = card.config as DamageOnTouchConfig;
              if (playerEntity && playerEntity.object3D) {
                const dist = obj.position.distanceTo(playerEntity.object3D.position);
                if (dist < 1.3) {
                  const lastHit = this.triggerCooldowns.get(`dmg_${entity.id}`) || 0;
                  if (this.elapsedTime - lastHit > (cfg.cooldown ?? 1.0)) {
                    this.triggerCooldowns.set(`dmg_${entity.id}`, this.elapsedTime);
                    this.applyDamageOnTouch(entity, playerEntity, cfg);
                  }
                }
              }
              break;
            }

            case 'WindZone': {
              const cfg = card.config as WindZoneBehaviorConfig;
              if (obj.userData) {
                obj.userData.physics = obj.userData.physics || {};
                obj.userData.physics.windZone = {
                  enabled: true,
                  mode: cfg.mode || 'directional',
                  force: cfg.force || 25,
                  radius: cfg.radius || 6,
                  direction: cfg.direction || { x: 0, y: 1, z: 0 },
                };
              }
              break;
            }

            case 'Flammable': {
              const cfg = card.config as FlammableBehaviorConfig;
              if (obj.userData) {
                obj.userData.physics = obj.userData.physics || {};
                obj.userData.physics.flammable = {
                  enabled: true,
                  isBurning: cfg.autoIgniteOnStart ? true : (obj.userData.physics.flammable?.isBurning || false),
                  temperature: cfg.autoIgniteOnStart ? 250 : (obj.userData.physics.flammable?.temperature || 20),
                  ignitionTemperature: cfg.ignitionTemperature || 100,
                  fuel: cfg.burnDuration || 15,
                  maxFuel: cfg.burnDuration || 15,
                  spreadRadius: cfg.spreadRadius || 3.0,
                  burnDamage: cfg.burnDamage || 15,
                };
              }
              if (cfg.autoIgniteOnStart && this.environmentalPhysics && !this.environmentalPhysics.isBurning(entity.id)) {
                this.environmentalPhysics.igniteEntity(entity);
              }
              break;
            }

            case 'WeatherListener': {
              const cfg = card.config as WeatherListenerConfig;
              const isRaining = this.environmentalPhysics?.rainConfig.enabled;
              const windSpeed = this.environmentalPhysics?.windConfig.speed || 0;
              const isWindy = Boolean(this.environmentalPhysics?.windConfig.enabled && windSpeed >= (cfg.windSpeedThreshold || 30));

              if ((cfg.reactTo === 'rain' && isRaining) ||
                  (cfg.reactTo === 'wind' && isWindy) ||
                  (cfg.reactTo === 'any' && (isRaining || isWindy))) {
                const lastTrig = this.triggerCooldowns.get(`weather_${entity.id}`) || 0;
                if (this.elapsedTime - lastTrig > 4.0) {
                  this.triggerCooldowns.set(`weather_${entity.id}`, this.elapsedTime);
                  if (cfg.action === 'Ignite' && this.environmentalPhysics) {
                    this.environmentalPhysics.igniteEntity(entity);
                  } else if (cfg.action === 'Extinguish' && this.environmentalPhysics) {
                    this.environmentalPhysics.extinguishEntity(entity.id);
                  } else if (cfg.action === 'PlaySound' && cfg.soundPreset !== 'none') {
                    SoundEngine.play(cfg.soundPreset);
                  }
                }
              }
              break;
            }

            case 'Buoyant': {
              const cfg = card.config as BuoyantConfig;
              if (this.environmentalPhysics?.waterManager) {
                const waterMgr = this.environmentalPhysics.waterManager;
                const waterData = waterMgr.getWaterHeightAndNormal(obj.position.x, obj.position.z);
                const immersion = waterData.height - obj.position.y;
                if (immersion > 0) {
                  // Floating motion for non-physics objects or kinematic entities
                  const mult = cfg.buoyancyMultiplier ?? 1.3;
                  const targetY = waterData.height + 0.1;
                  obj.position.y += (targetY - obj.position.y) * Math.min(1.0, 5.0 * mult * simDt);

                  if (cfg.alignToWaveNormal) {
                    const normal = waterData.normal;
                    const targetRotX = Math.atan2(-normal.z, normal.y) * 0.5;
                    const targetRotZ = Math.atan2(normal.x, normal.y) * 0.5;
                    obj.rotation.x += (targetRotX - obj.rotation.x) * 4.0 * simDt;
                    obj.rotation.z += (targetRotZ - obj.rotation.z) * 4.0 * simDt;
                  }
                }
              }
              break;
            }

            case 'NavMeshAgent': {
              const cfg = card.config as NavMeshAgentConfig;
              if (this.navMeshManager) {
                if (!this.navMeshManager.isBaked && this.scene) {
                  this.navMeshManager.bakeNavMesh(this.scene);
                }
                this.navMeshManager.registerAgent(entity.id, cfg);
              }
              break;
            }

            case 'TriggerVolume': {
              const cfg = card.config as TriggerVolumeBehaviorConfig;
              if (this.triggerVolumeManager) {
                this.triggerVolumeManager.registerVolume(entity.id, cfg, obj);
              }
              break;
            }

            case 'PostProcessVolume': {
              const cfg = card.config as PostProcessVolumeBehaviorConfig;
              if (this.postProcessVolumeManager) {
                const pos = obj.position;
                this.postProcessVolumeManager.register(entity.id, {
                  position: [pos.x, pos.y, pos.z] as [number, number, number],
                  size: [cfg.size.x, cfg.size.y, cfg.size.z] as [number, number, number],
                  overrides: cfg.overrides,
                  blendRadius: cfg.blendRadius,
                  priority: cfg.priority,
                });
              }
              break;
            }
          }
        }
      }

      // ----------------------------------------------------
      // LEVEL 2: NODE GRAPH ONUPDATE
      // ----------------------------------------------------
      if (logicData.nodeGraph?.enabled) {
        // Le `dt` exposé aux graphes est le temps de JEU : sans cela un branchement
        // « si dt > 0.03 » se déclencherait à tort pendant un bullet-time ralenti.
        this.executeGraphEvents(entity, 'OnUpdate', { dt: simDt });

        // Process periodic OnTimer events
        if (logicData.nodeGraph.nodes) {
          logicData.nodeGraph.nodes.forEach((node) => {
            if (node.type === 'OnTimer') {
              const interval = Number(node.values.interval ?? 2.0);
              let timers = this.entityTimerAccumulators.get(entity.id);
              if (!timers) {
                timers = {};
                this.entityTimerAccumulators.set(entity.id, timers);
              }
              const lastTime = timers[node.id] ?? 0;
              if (this.elapsedTime - lastTime >= interval) {
                timers[node.id] = this.elapsedTime;
                this.triggerNodeOutput(entity, logicData.nodeGraph!, node.id, 'out_flow', { dt });
              }
            }
          });
        }
      }

      // ----------------------------------------------------
      // LEVEL 3: CUSTOM SCRIPT ONUPDATE
      // ----------------------------------------------------
      const script = this.scriptInstances.get(entity.id);
      if (script && script.onUpdate) {
        ScriptSandbox.invokeUpdate(script, dt);
      }
    }

    // Named timers (Engine.setTimer)
    if (this.namedTimers.size > 0) {
      const expired: string[] = [];
      for (const [key, t] of this.namedTimers) {
        // `dt` est déjà un temps de JEU : l'échelle a été appliquée en amont.
        // La multiplier une seconde fois ici rendait les timers deux fois trop
        // rapides en bullet-time.
        t.remaining -= dt;
        if (t.remaining <= 0) {
          try {
            t.fn?.();
          } catch (err: any) {
            ScriptSandbox.addLog(`[Timer ${t.name}] ${err.message}`, 'error');
          }
          if (t.repeat) {
            t.remaining = t.interval;
          } else {
            expired.push(key);
          }
        }
      }
      for (const key of expired) this.namedTimers.delete(key);
    }
  }

  /**
   * Collision dispatcher: dispatches to Cards, Node Graphs and Scripts
   */
  public handleCollision(entityA: Entity, entityB: Entity): void {
    if (!this.isRunning) return;

    // Dispatch Level 2 Node Graph OnCollision
    this.executeGraphEvents(entityA, 'OnCollision', { other: entityB });
    this.executeGraphEvents(entityB, 'OnCollision', { other: entityA });

    // Dispatch Level 3 Custom Script onCollision (hooks optionnels)
    const scriptA = this.scriptInstances.get(entityA.id);
    if (scriptA?.onCollision) {
      ScriptSandbox.invokeCollision(scriptA, entityB);
    }

    const scriptB = this.scriptInstances.get(entityB.id);
    if (scriptB?.onCollision) {
      ScriptSandbox.invokeCollision(scriptB, entityA);
    }
  }

  /**
   * Dispatch clavier pour les nœuds OnKeyPress / OnKeyRelease.
   *
   * La correspondance passe par `matchesKeyValue` et non par une comparaison
   * par sous-chaîne : une liaison « E » ne doit pas se déclencher sur Escape,
   * et « 1 » doit tirer aussi sur le pavé numérique sans capturer F1.
   */
  private handleKeyPress(keyCode: string, isDown: boolean): void {
    const entities = this.ecsWorld.getAllEntities().filter((e) => e.active);
    for (const entity of entities) {
      const logicData = entity.object3D?.userData?.logic as EntityLogicData | undefined;
      if (!logicData?.nodeGraph?.enabled) continue;

      const graph = logicData.nodeGraph;
      const wanted = isDown ? 'OnKeyPress' : 'OnKeyRelease';
      const keyNodes = graph.nodes.filter(
        (n) => n.type === wanted && matchesKeyValue(n.values.key ?? 'Space', keyCode)
      );

      for (const node of keyNodes) {
        this.executeGraphNode(entity, graph, node, 'in_flow', { key: keyCode });
      }
    }
  }

  // ==========================================
  // NODE GRAPH RUNTIME EXECUTION ENGINE
  // ==========================================

  public executeGraphEvents(entity: Entity, eventType: string, eventData: Record<string, any> = {}): void {
    const logicData = entity.object3D?.userData?.logic as EntityLogicData | undefined;
    if (!logicData?.nodeGraph?.enabled) return;

    const graph = logicData.nodeGraph;
    const matchingNodes = graph.nodes.filter((n) => {
      if (n.type !== eventType) return false;
      if (eventType === 'OnCustomEvent') {
        const requiredEvent = n.values.eventName || 'custom_msg';
        const receivedEvent = eventData.eventName || '';
        return requiredEvent.toLowerCase() === receivedEvent.toLowerCase();
      }
      return true;
    });

    for (const node of matchingNodes) {
      // Most event nodes expose a single 'out_flow' socket, but branch events
      // (e.g. OnProximity -> out_near / out_far) must run their own evaluation
      // so the correct socket is fired. Fall back to 'out_flow' if a node has
      // no dedicated handler.
      if (node.type === 'OnProximity') {
        this.executeGraphNode(entity, graph, node, 'in_flow', eventData);
      } else {
        // `eventData` est réutilisé pour chaque capteur correspondant : sans
        // `forceRootScope`, le deuxième capteur verrait ses nœuds déjà
        //Visités par le premier et ne déclencherait rien.
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', eventData, true);
      }
    }
  }

  private triggerNodeOutput(
    entity: Entity,
    graph: NodeGraphData,
    fromNodeId: string,
    outputSocketId: string,
    dataContext: Record<string, any>,
    forceRootScope = false
  ): void {
    // Filtre anti-boucle : l'éditeur permet de relier la sortie d'un nœud à
    // son propre entrée (ou à un cycle A→B→A). Sans cette garde, la
    // récurrence entre triggerNodeOutput et executeGraphNode fait déborder la
    // pile — un RangeError non interceptable qui fige tout l'onglet.
    if (this.flowDepth >= MAX_FLOW_DEPTH) {
      this.reportFlowLoop(entity, fromNodeId);
      return;
    }
    this.flowDepth++;
    try {
      const outgoing = graph.connections.filter(
        (c) => c.fromNodeId === fromNodeId && c.fromSocketId === outputSocketId
      );

      // Le marqueur de passage vit sur l'objet contexte : les appels imbriqués
      // le partagent. C'est ce qui fait qu'un nœud de données déclenchant
      // 4 sorties avec le MÊME contexte n'exécute son action qu'une fois —
      // sinon brancher « Avant » ET « Latéral » sur le même nœud d'action
      // doublerait la vitesse.
      //
      // Un événement à branches est le cas opposé : il réutilise son contexte
      // pour chaque sortie (OnLand → out_flow + out_soft/out_hard +
      // out_impact, executeGraphEvents qui boucle sur plusieurs capteurs) et il
      // doit repartir d'un marqueur vierge à chaque branche, sinon la deuxième
      // sortie ignorerait silencieusement les nœuds déjà atteints par la
      // première. D'où `forceRootScope`, posé explicitement par les
      // dispatcheurs d'événement et nulle part ailleurs : l'inférer du
      // `flowDepth` confondait une racine avec la première sortie d'un nœud.
      const context = forceRootScope ? { ...dataContext } : dataContext;

      // Un nœud ne s'exécute qu'une fois par branche de flux.
      const visited = visitedInFlow(context as object);

      for (const conn of outgoing) {
        const targetNode = graph.nodes.find((n) => n.id === conn.toNodeId);
        if (!targetNode) continue;
        if (visited.has(targetNode.id)) continue;
        visited.add(targetNode.id);
        this.executeGraphNode(entity, graph, targetNode, conn.toSocketId, context);
      }
    } finally {
      this.flowDepth--;
    }
  }

  /** Signale une boucle de flux une seule fois par nœud (pas de spam console). */
  private reportFlowLoop(entity: Entity, nodeId: string): void {
    const key = `${entity.id}:${nodeId}`;
    if (this.flowLoopWarned.has(key)) return;
    this.flowLoopWarned.add(key);
    ScriptSandbox.addLog(
      `[Graphe] Boucle de flux détectée sur "${entity.name}" : exécution interrompue au nœud ${nodeId}.`,
      'warn'
    );
  }

  private executeGraphNode(
    entity: Entity,
    graph: NodeGraphData,
    node: GraphNodeData,
    _entrySocket: string,
    context: Record<string, any>
  ): void {
    switch (node.type) {
      case 'IfElse': {
        const cond = Boolean(context.condition ?? context.result ?? node.values.condition ?? true);
        const outSocket = cond ? 'out_true' : 'out_false';
        this.triggerNodeOutput(entity, graph, node.id, outSocket, context);
        break;
      }

      case 'Compare': {
        const a = Number(context.a ?? node.values.a ?? 0);
        const b = Number(context.b ?? node.values.b ?? 0);
        const op = node.values.operator || '==';
        let res = false;
        if (op === '==') res = a === b;
        else if (op === '!=') res = a !== b;
        else if (op === '>') res = a > b;
        else if (op === '<') res = a < b;
        else if (op === '>=') res = a >= b;
        else if (op === '<=') res = a <= b;
        this.triggerNodeOutput(entity, graph, node.id, 'out_result', { ...context, condition: res, result: res });
        break;
      }

      case 'Gate': {
        const a = Boolean(context.a ?? node.values.a ?? false);
        const b = Boolean(context.b ?? node.values.b ?? false);
        const gate = node.values.gate || 'AND';
        let res = false;
        if (gate === 'AND') res = a && b;
        else if (gate === 'OR') res = a || b;
        else if (gate === 'NOT') res = !a;
        else if (gate === 'XOR') res = (a && !b) || (!a && b);
        this.triggerNodeOutput(entity, graph, node.id, 'out_result', { ...context, condition: res, result: res });
        break;
      }

      case 'Math': {
        const a = Number(context.a ?? node.values.a ?? 0);
        const b = Number(context.b ?? node.values.b ?? 0);
        const op = node.values.operation || '+';
        let res = 0;
        if (op === '+') res = a + b;
        else if (op === '-') res = a - b;
        else if (op === '*') res = a * b;
        else if (op === '/') res = b !== 0 ? a / b : 0;
        else if (op === '%') res = b !== 0 ? a % b : 0;
        this.triggerNodeOutput(entity, graph, node.id, 'out_result', { ...context, val: res, value: res });
        break;
      }

      case 'Clamp': {
        const val = Number(context.val ?? context.value ?? node.values.val ?? 0);
        const min = Number(node.values.min ?? 0);
        const max = Number(node.values.max ?? 100);
        const res = Math.min(Math.max(val, min), max);
        this.triggerNodeOutput(entity, graph, node.id, 'out_val', { ...context, val: res, value: res });
        break;
      }

      case 'Lerp': {
        const a = Number(context.a ?? node.values.a ?? 0);
        const b = Number(context.b ?? node.values.b ?? 1);
        const t = Number(context.t ?? node.values.t ?? 0.1);
        const res = a + (b - a) * Math.min(Math.max(t, 0), 1);
        this.triggerNodeOutput(entity, graph, node.id, 'out_val', { ...context, val: res, value: res });
        break;
      }

      case 'Random': {
        const min = Number(node.values.min ?? 1);
        const max = Number(node.values.max ?? 10);
        const res = Math.floor(Math.random() * (max - min + 1)) + min;
        this.triggerNodeOutput(entity, graph, node.id, 'out_val', { ...context, val: res, value: res });
        break;
      }

      case 'Toggle': {
        const currentState = !node.values.state;
        node.values.state = currentState;
        const outSocket = currentState ? 'out_on' : 'out_off';
        this.triggerNodeOutput(entity, graph, node.id, outSocket, { ...context, state: currentState });
        this.triggerNodeOutput(entity, graph, node.id, 'out_state', { ...context, state: currentState });
        break;
      }

      case 'Counter': {
        const step = Number(node.values.step ?? 1);
        let count = Number(node.values.current ?? 0) + step;
        node.values.current = count;
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', { ...context, count, value: count });
        this.triggerNodeOutput(entity, graph, node.id, 'out_count', { ...context, count, value: count });
        break;
      }

      case 'Delay': {
        const dur = Number(node.values.duration ?? 1.0);
        // Le délai est annulé au Stop : sinon il déclencherait sa branche dans
        // la session de jeu suivante.
        this.defer(dur * 1000, () => {
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        });
        break;
      }

      case 'PlaySound': {
        const sound = node.values.sound || 'coin';
        // Route through SoundManager bus when possible
        soundManager.playSFX(sound as any);
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SetVariable': {
        const varName = node.values.variable || 'Score';
        const amount = Number(context.amount ?? node.values.amount ?? 10);
        const op = node.values.operation || 'add';

        let current = this.globalState.variables[varName] ?? (varName === 'Score' ? this.globalState.score : 0);
        if (op === 'add') current += amount;
        else if (op === 'subtract') current -= amount;
        else current = amount;

        this.setVariable(varName, current);
        ScriptSandbox.addLog(`[Var] ${varName} = ${current}`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', { ...context, value: current });
        break;
      }

      case 'GetVariable': {
        const varName = node.values.variable || 'Score';
        const current = this.globalState.variables[varName] ?? (varName === 'Score' ? this.globalState.score : 0);
        this.triggerNodeOutput(entity, graph, node.id, 'out_val', { ...context, val: current, value: current });
        break;
      }

      case 'ApplyImpulse': {
        const force = Number(node.values.force ?? 10);
        const targetEntity = context.other || context.target || entity;
        if (targetEntity?.object3D) {
          targetEntity.object3D.position.y += force * 0.08;
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SetPosition': {
        const target = context.target || entity;
        if (target?.object3D) {
          const px = Number(node.values.posX ?? target.object3D.position.x);
          const py = Number(node.values.posY ?? target.object3D.position.y);
          const pz = Number(node.values.posZ ?? target.object3D.position.z);
          target.object3D.position.set(px, py, pz);
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SetRotation': {
        const target = context.target || entity;
        if (target?.object3D) {
          const ry = (Number(node.values.rotY ?? 90) * Math.PI) / 180;
          target.object3D.rotation.y += ry;
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SetScale': {
        const target = context.target || entity;
        if (target?.object3D) {
          const s = Number(node.values.scale ?? 1.5);
          target.object3D.scale.set(s, s, s);
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SetColor': {
        const target = context.target || entity;
        const col = node.values.color || '#10b981';
        if (target?.object3D) {
          target.object3D.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && child.material) {
              const mat = child.material as THREE.MeshStandardMaterial;
              mat.color?.set(col);
            }
          });
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'ShootProjectile': {
        if (this.onShootProjectile) {
          const prefabId = String(node.values.prefabId || 'Bullet');
          const speed = Number(node.values.speed ?? 20);
          const damage = Number(node.values.damage ?? 10);
          this.onShootProjectile(entity.id, prefabId, speed, damage);
          ScriptSandbox.addLog(`[Action] Tir de ${prefabId} par ${entity.id}`, 'log');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SpawnPrefab': {
        SoundEngine.play('warp');
        ScriptSandbox.addLog(`[Spawn] Entité ${node.values.prefab || 'objet'} générée !`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'PrintLog': {
        const msg = String(node.values.message || 'Log triggered');
        ScriptSandbox.addLog(`[Graph Log] ${msg}`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'CameraShake': {
        SoundEngine.play('hit');
        ScriptSandbox.addLog(`[FX] Secousse Caméra !`, 'warn');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'EmitParticles': {
        const preset = (node.values.preset || context.preset || 'fire') as ParticlePreset;
        const rate = Number(node.values.rate ?? 50);
        const targetEntity = context.target || entity;
        const emitterId = `node_p_${targetEntity.id}_${preset}`;

        if (this.particleManager) {
          const config = ParticleManager.getDefaultPresetConfig(preset);
          config.rate = rate > 0 ? rate : config.rate;
          const pos = targetEntity.object3D?.position ?? new THREE.Vector3();
          this.particleManager.createOrUpdateEmitter(emitterId, config, pos, targetEntity.object3D);
        }

        ScriptSandbox.addLog(`[VFX] Émission particules (${preset}) sur ${targetEntity.id}`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'ExplosionFX': {
        const scale = Number(node.values.scale ?? 1.0);
        const force = Number(node.values.force ?? 10.0);
        const targetEntity = context.target || entity;
        const pos = targetEntity.object3D?.position ? targetEntity.object3D.position.clone() : new THREE.Vector3();

        if (this.particleManager) {
          this.particleManager.triggerExplosion(pos, scale, force);
        }

        SoundEngine.play('hit');
        ScriptSandbox.addLog(`[VFX] Explosion FX (Taille: ${scale}, Force: ${force}) !`, 'warn');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'StopParticles': {
        const targetEntity = context.target || entity;
        const preset = node.values.preset || 'fire';
        const emitterId = `node_p_${targetEntity.id}_${preset}`;

        if (this.particleManager) {
          this.particleManager.stopEmitter(emitterId);
        }

        ScriptSandbox.addLog(`[VFX] Arrêt particules (${preset})`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      // ==========================================
      // AI & NPC NAVIGATION NODE HANDLERS
      // ==========================================
      case 'FollowTarget': {
        const speed = Number(context.speed ?? node.values.speed ?? 3.5);
        const stopDist = Number(context.stopDistance ?? node.values.stopDistance ?? 1.2);
        const dt = Number(context.dt ?? 0.016);

        // Find target player entity or context target
        const targetEntity = context.target || this.findPlayerEntity();

        let reached = false;
        if (entity.object3D && targetEntity && targetEntity.object3D) {
          const selfPos = entity.object3D.position;
          const targetPos = targetEntity.object3D.position;
          const dist = selfPos.distanceTo(targetPos);

          if (dist > stopDist) {
            // Move towards target
            const dir = new THREE.Vector3().subVectors(targetPos, selfPos).setY(0).normalize();
            selfPos.addScaledVector(dir, speed * dt);
            // Face target
            const angle = Math.atan2(dir.x, dir.z);
            entity.object3D.rotation.y = angle;
          } else {
            reached = true;
          }
        }

        this.triggerNodeOutput(entity, graph, node.id, 'out_reached', { ...context, reached });
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'PatrolWaypoints': {
        const speed = Number(node.values.speed ?? 2.5);
        const dt = Number(context.dt ?? 0.016);

        if (entity.object3D) {
          // Find waypoint entities or compute oscillating patrol
          const waypoints = this.ecsWorld.getAllEntities().filter(
            (e) => e.active && e.name.toLowerCase().includes('waypoint')
          );

          if (waypoints.length > 0) {
            const currentIdx = Number(node.values.wpIndex || 0);
            const targetWp = waypoints[currentIdx % waypoints.length];
            if (targetWp.object3D) {
              const selfPos = entity.object3D.position;
              const wpPos = targetWp.object3D.position;
              const dist = selfPos.distanceTo(wpPos);

              if (dist < 0.8) {
                node.values.wpIndex = (currentIdx + 1) % waypoints.length;
              } else {
                const dir = new THREE.Vector3().subVectors(wpPos, selfPos).setY(0).normalize();
                selfPos.addScaledVector(dir, speed * dt);
                entity.object3D.rotation.y = Math.atan2(dir.x, dir.z);
              }
            }
          } else {
            // Ping-pong patrol default around initial pos
            const delta = Math.sin(this.elapsedTime * speed * 0.8) * speed * dt * 2.0;
            entity.object3D.position.x += delta;
            entity.object3D.rotation.y = delta > 0 ? 0 : Math.PI;
          }
        }

        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'CheckDistance': {
        const threshold = Number(node.values.threshold ?? 8.0);
        const targetEntity = context.target || this.findPlayerEntity();

        let dist = 999;
        let inRange = false;

        if (entity.object3D && targetEntity && targetEntity.object3D) {
          dist = entity.object3D.position.distanceTo(targetEntity.object3D.position);
          inRange = dist <= threshold;
        }

        this.triggerNodeOutput(entity, graph, node.id, 'out_range', { ...context, inRange, condition: inRange });
        this.triggerNodeOutput(entity, graph, node.id, 'out_dist', { ...context, dist, distance: dist });
        break;
      }

      case 'LookAtPlayer': {
        const targetEntity = context.target || this.findPlayerEntity();

        if (entity.object3D && targetEntity && targetEntity.object3D) {
          const dir = new THREE.Vector3().subVectors(targetEntity.object3D.position, entity.object3D.position);
          const targetAngle = Math.atan2(dir.x, dir.z);
          entity.object3D.rotation.y = THREE.MathUtils.lerp(entity.object3D.rotation.y, targetAngle, 0.1);
        }

        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      // ==========================================
      // DYNAMIC LIGHTING NODE HANDLERS
      // ==========================================
      case 'SetLightColor': {
        const colorHex = node.values.color || '#38bdf8';
        const intensity = Number(node.values.intensity ?? 5.0);

        if (entity.object3D) {
          entity.object3D.traverse((child) => {
            if (child instanceof THREE.Light) {
              child.color.set(colorHex);
              child.intensity = intensity;
            }
            if (child.name === 'VolumetricLightCone' && child instanceof THREE.Mesh) {
              (child.material as THREE.MeshBasicMaterial).color.set(colorHex);
              (child.material as THREE.MeshBasicMaterial).opacity = Math.min(0.4, intensity * 0.04);
            }
            if (child.name === 'LightBulbMesh' && child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshStandardMaterial;
              mat.color.set(colorHex);
              mat.emissive.set(colorHex);
              mat.emissiveIntensity = Math.min(5.0, intensity * 0.5);
            }
          });
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'PulseLight': {
        const minInt = Number(node.values.min ?? 1.0);
        const maxInt = Number(node.values.max ?? 8.0);
        const freq = Number(node.values.frequency ?? 3.0);

        if (entity.object3D) {
          const pulse = (Math.sin(this.elapsedTime * freq) + 1) / 2;
          const currentIntensity = minInt + pulse * (maxInt - minInt);

          entity.object3D.traverse((child) => {
            if (child instanceof THREE.Light) {
              child.intensity = currentIntensity;
            }
            if (child.name === 'VolumetricLightCone' && child instanceof THREE.Mesh) {
              (child.material as THREE.MeshBasicMaterial).opacity = Math.min(0.4, currentIntensity * 0.04);
            }
            if (child.name === 'LightBulbMesh' && child instanceof THREE.Mesh) {
              (child.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.min(5.0, currentIntensity * 0.5);
            }
          });
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'FlickerLight': {
        const speed = Number(node.values.speed ?? 10.0);
        const randomness = Number(node.values.randomness ?? 0.6);

        if (entity.object3D) {
          const baseIntensity = Number(node.values.baseIntensity ?? 5.0);
          // speed règle l'amplitude du scintillement (curseur éditeur 0-20, 10 = neutre)
          const noise = (Math.random() - 0.5) * randomness * baseIntensity * (speed / 10);
          const currentIntensity = Math.max(0, baseIntensity + noise);

          entity.object3D.traverse((child) => {
            if (child instanceof THREE.Light) {
              child.intensity = currentIntensity;
            }
            if (child.name === 'VolumetricLightCone' && child instanceof THREE.Mesh) {
              (child.material as THREE.MeshBasicMaterial).opacity = Math.min(0.4, currentIntensity * 0.04);
            }
            if (child.name === 'LightBulbMesh' && child instanceof THREE.Mesh) {
              (child.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.min(5.0, currentIntensity * 0.5);
            }
          });
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      // ==========================================
      // CINEMATICS & DIALOGUE NODE HANDLERS
      // ==========================================
      case 'SwitchCamera': {
        const camName = String(node.values.cameraName || node.values.cam || 'Camera_1');
        const blendDuration = Number(node.values.blendDuration ?? node.values.blend ?? 1.0);

        this.cinematicState.active = true;
        this.cinematicState.targetCameraName = camName;
        this.cinematicState.blendDuration = blendDuration;

        ScriptSandbox.addLog(`[Cinématique] Basculement vers caméra '${camName}' (transition: ${blendDuration}s)`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'ShowDialogue': {
        const speaker = String(node.values.speaker || 'Narrateur');
        const text = String(node.values.text || 'Message de dialogue cinématique...');
        const duration = Number(node.values.duration ?? 5.0);

        this.dialogueState.active = true;
        this.dialogueState.speaker = speaker;
        this.dialogueState.text = text;
        this.dialogueState.duration = duration;
        this.dialogueState.timer = duration;

        ScriptSandbox.addLog(`[Dialogue] ${speaker}: "${text}" (${duration}s)`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SetDepthOfField': {
        const blurAmount = Number(node.values.blur ?? node.values.intensity ?? 15);
        this.cinematicState.depthOfFieldBlur = blurAmount;

        ScriptSandbox.addLog(`[Cinématique] Flou de profondeur de champ réglé à ${blurAmount}%`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      // ==========================================
      // SPATIAL AUDIO & BGM NODE HANDLERS
      // ==========================================
      case 'PlaySound3D': {
        const sfxType = (node.values.sfxType || node.values.sfx || 'torch') as SFXType;
        const maxDist = Number(node.values.maxDistance ?? node.values.maxDist ?? 25);

        if (entity.object3D) {
          const playerEnt = this.findPlayerEntity();
          const playerPos = playerEnt?.object3D?.position;
          if (playerPos) {
            soundManager.playSpatialSound3D(
              sfxType,
              entity.object3D.position,
              { x: playerPos.x, y: playerPos.y, z: playerPos.z },
              maxDist
            );
          } else {
            soundManager.playSpatialSound3D(sfxType, entity.object3D.position, undefined, maxDist);
          }
          ScriptSandbox.addLog(`[Audio 3D] Son spatial '${sfxType}' joué à l'entité ${entity.name}`, 'log');
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
          break;
        }
        SoundEngine.play(sfxType as any);
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'PlaySFX': {
        const sfxType = (node.values.type || node.values.sfx || node.values.sound || 'coin') as SFXType;
        soundManager.playSFX(sfxType);
        ScriptSandbox.addLog(`[Audio SFX] Effet sonore '${sfxType}' joué`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SetBGMState': {
        const bgmMode = (node.values.mode || node.values.bgm || node.values.bgmMode || 'exploration') as BGMMode;
        soundManager.setBGMMode(bgmMode);
        ScriptSandbox.addLog(`[Musique BGM] Mode de fond défini sur '${bgmMode}'`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      // ==========================================
      // ENEMY AI, HEALTH & INVENTORY NODE HANDLERS
      // ==========================================
      case 'CheckEnemyVision': {
        const fovAngle = Number(node.values.fov ?? node.values.angle ?? 60); // Degrees
        const range = Number(node.values.range ?? node.values.distance ?? 15);

        const playerEntity = this.findPlayerEntity();

        let isSeen = false;
        if (entity.object3D && playerEntity && playerEntity.object3D) {
          const enemyPos = entity.object3D.position;
          const playerPos = playerEntity.object3D.position;

          const dist = enemyPos.distanceTo(playerPos);
          if (dist <= range) {
            // Forward vector of enemy
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(entity.object3D.quaternion);
            const toPlayer = new THREE.Vector3().subVectors(playerPos, enemyPos).normalize();
            const angleDeg = THREE.MathUtils.radToDeg(forward.angleTo(toPlayer));

            if (angleDeg <= fovAngle / 2) {
              isSeen = true;
            }
          }
        }

        if (isSeen) {
          ScriptSandbox.addLog(`[IA Vision] Joueur repéré par ${entity.name} !`, 'warn');
          this.triggerNodeOutput(entity, graph, node.id, 'out_seen', context);
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_hidden', context);
        }
        break;
      }

      case 'DealDamage': {
        const damageAmount = Number(node.values.damage ?? node.values.dmg ?? 25);
        this.globalState.health = Math.max(0, this.globalState.health - damageAmount);
        this.dispatchAllVariables();

        // Spawn floating text above entity
        if (entity.object3D) {
          const pos = entity.object3D.position;
          this.floatingTexts.push({
            id: `dmg_${Date.now()}_${Math.random()}`,
            text: `-${damageAmount} HP`,
            x: pos.x,
            y: pos.y + 1.2,
            z: pos.z,
            color: '#f43f5e',
            timer: 1.5,
          });
        }

        soundManager.playSFX('explosion');
        this.onDamageEntity?.(entity.id, damageAmount, this.globalState.health);
        ScriptSandbox.addLog(`[Combat] Dégâts infligés: -${damageAmount} HP (Restants: ${this.globalState.health})`, 'warn');
        this.notifyHealthChanged();
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'CheckInventory': {
        const requiredItem = String(node.values.item || node.values.key || 'Clé Rouge');
        const hasItem = this.globalState.inventory.includes(requiredItem);

        if (hasItem) {
          ScriptSandbox.addLog(`[Inventaire] Item '${requiredItem}' trouvé dans l'inventaire`, 'log');
          this.triggerNodeOutput(entity, graph, node.id, 'out_has', context);
        } else {
          ScriptSandbox.addLog(`[Inventaire] Item '${requiredItem}' manquant`, 'log');
          this.triggerNodeOutput(entity, graph, node.id, 'out_none', context);
        }
        break;
      }

      case 'AddItem': {
        const itemName = String(node.values.item ?? node.values.name ?? node.values.key ?? 'Item');
        if (!this.globalState.inventory.includes(itemName)) {
          this.globalState.inventory.push(itemName);
          this.globalState.variables[`Has_${itemName}`] = true;
          ScriptSandbox.setVariable(`Has_${itemName}`, true);
          this.dispatchAllVariables();
          soundManager.playSFX('coin');
          ScriptSandbox.addLog(
            `[Inventaire] Item '${itemName}' ajouté (Total: ${this.globalState.inventory.length})`,
            'log'
          );
        } else {
          ScriptSandbox.addLog(`[Inventaire] Item '${itemName}' déjà possédé (ignoré)`, 'warn');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'RemoveItem': {
        const itemName = String(node.values.item ?? node.values.name ?? node.values.key ?? 'Item');
        const idx = this.globalState.inventory.indexOf(itemName);
        if (idx >= 0) {
          this.globalState.inventory.splice(idx, 1);
          delete this.globalState.variables[`Has_${itemName}`];
          ScriptSandbox.setVariable(`Has_${itemName}`, false);
          this.dispatchAllVariables();
          ScriptSandbox.addLog(
            `[Inventaire] Item '${itemName}' retiré (Restants: ${this.globalState.inventory.length})`,
            'log'
          );
        } else {
          ScriptSandbox.addLog(`[Inventaire] Item '${itemName}' absent, rien à retirer`, 'warn');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'OnProximity': {
        const threshold = Number(node.values.distance ?? node.values.dist ?? node.values.radius ?? 5);
        const targetName = String(node.values.target ?? node.values.targetName ?? 'player');
        const allEntities = this.ecsWorld.getAllEntities();
        const targetEntity =
          allEntities.find(
            (e) =>
              e.active &&
              (e.object3D?.userData?.subType === targetName ||
                e.name.toLowerCase() === targetName.toLowerCase() ||
                e.name.toLowerCase().includes(targetName.toLowerCase()))
          ) || null;

        let isNear = false;
        if (entity.object3D && targetEntity?.object3D) {
          isNear = entity.object3D.position.distanceTo(targetEntity.object3D.position) <= threshold;
        }

        // Edge-triggered: fire only when the proximity state flips,
        // so the downstream graph does not re-run every frame.
        const stateKey = `${entity.id}:${node.id}`;
        const wasNear = this.triggerInsideStates.get(stateKey) ?? false;
        this.triggerInsideStates.set(stateKey, isNear);

        if (isNear && !wasNear) {
          ScriptSandbox.addLog(
            `[Proximité] ${targetName} à portée de ${entity.name} (<= ${threshold}m)`,
            'log'
          );
          this.triggerNodeOutput(entity, graph, node.id, 'out_near', context);
        } else if (!isNear && wasNear) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_far', context);
        }
        break;
      }

      case 'UnlockDoor': {
        if (entity.object3D) {
          // Rotate door open or make invisible
          entity.object3D.rotation.y += Math.PI / 2;
          ScriptSandbox.addLog(`[Porte] Porte '${entity.name}' déverrouillée et ouverte !`, 'log');
          soundManager.playSFX('coin');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'PlayAnimation': {
        const anim = node.values.anim;
        if (anim && anim !== 'none') {
          if (entity.object3D) {
            if (anim === 'spin') {
              const spd = Number(node.values.speed ?? 90) * (Math.PI / 180);
              entity.object3D.rotation.y += spd * 0.016;
            } else if (anim === 'bounce') {
              entity.object3D.position.y += Math.sin(this.elapsedTime * 6) * 0.02;
            } else if (anim === 'pulse') {
              this.pulseEntity(entity);
            } else if (anim === 'patrol') {
              const axis = node.values.axis || 'x';
              const spd = Number(node.values.speed ?? 3);
              const delta = Math.sin(this.elapsedTime * spd) * 0.05;
              if (axis === 'y') {
                entity.object3D.position.y += delta;
              } else if (axis === 'z') {
                entity.object3D.position.z += delta;
              } else {
                entity.object3D.position.x += delta;
              }
            }
          }
        } else {
          const targetEntity = context.target || entity;
          const trackName = node.values.trackName || '';
          if (this.animationManager) {
            const tracks = this.animationManager.getTracksForObject(targetEntity.id);
            let targetTrack = tracks.find((t) => !trackName || t.name.toLowerCase().includes(trackName.toLowerCase()));
            if (!targetTrack && tracks.length > 0) targetTrack = tracks[0];

            if (targetTrack) {
              this.animationManager.playTrack(targetTrack.id, 1);
              ScriptSandbox.addLog(`[Animation] Lecture trajectoire '${targetTrack.name}' sur ${targetEntity.id}`, 'log');
            } else if (targetEntity.object3D?.userData.animations && this.onPlaySkeletalAnimation) {
              // Try to play skeletal animation if no track was found
              this.onPlaySkeletalAnimation(targetEntity.id, trackName);
              ScriptSandbox.addLog(`[Animation] Lecture animation GLTF '${trackName || 'Default'}' sur ${targetEntity.id}`, 'log');
            } else {
              ScriptSandbox.addLog(`[Animation] Aucune trajectoire ou animation GLTF trouvée pour ${targetEntity.id}`, 'warn');
            }
          }
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'ReverseAnimation': {
        const targetEntity = context.target || entity;
        const trackName = node.values.trackName || '';
        if (this.animationManager) {
          const tracks = this.animationManager.getTracksForObject(targetEntity.id);
          let targetTrack = tracks.find((t) => !trackName || t.name.toLowerCase().includes(trackName.toLowerCase()));
          if (!targetTrack && tracks.length > 0) targetTrack = tracks[0];

          if (targetTrack) {
            this.animationManager.playTrack(targetTrack.id, -1);
            ScriptSandbox.addLog(`[Animation] Inversion trajectoire '${targetTrack.name}' sur ${targetEntity.id}`, 'log');
          }
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'PauseAnimation': {
        const targetEntity = context.target || entity;
        if (this.animationManager) {
          const tracks = this.animationManager.getTracksForObject(targetEntity.id);
          tracks.forEach((t) => this.animationManager?.pauseTrack(t.id));
          ScriptSandbox.addLog(`[Animation] Pause trajectoires sur ${targetEntity.id}`, 'log');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'DestroyEntity': {
        const target = node.values.target === 'self' ? entity : context.target || entity;
        this.destroyEntity(target);
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      // ==========================================
      // ENVIRONMENTAL PHYSICS NODES (Vent, Feu, Pluie)
      // ==========================================

      case 'OnWindGust':
      case 'OnIgnite':
      case 'OnExtinguish':
      case 'OnRainStart':
      case 'OnRainStop': {
        // Event triggers forwarded to output flow
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SetWind': {
        const speed = Number(node.values.speed ?? 35);
        const dirX = Number(node.values.dirX ?? 1);
        const dirY = Number(node.values.dirY ?? 0);
        const dirZ = Number(node.values.dirZ ?? 0.3);
        const gustiness = Number(node.values.gustiness ?? 0.5);
        const enabled = node.values.enabled !== false;

        if (this.environmentalPhysics) {
          this.environmentalPhysics.setWindConfig({
            enabled,
            speed,
            direction: { x: dirX, y: dirY, z: dirZ },
            gustiness,
          });
          ScriptSandbox.addLog(`[Physique Vent] Vent configuré: ${speed} km/h (actif: ${enabled})`, 'log');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'ApplyWindForce': {
        const target = context.target || entity;
        const force = Number(node.values.force ?? 25);
        const dirX = Number(node.values.dirX ?? 0);
        const dirY = Number(node.values.dirY ?? 1);
        const dirZ = Number(node.values.dirZ ?? 0);
        if (target?.object3D) {
          target.object3D.position.x += dirX * force * 0.04;
          target.object3D.position.y += dirY * force * 0.04;
          target.object3D.position.z += dirZ * force * 0.04;
          soundManager.playSFX('wind');
          ScriptSandbox.addLog(`[Physique Vent] Poussée de vent (${force} N) sur '${target.name || target.id}'`, 'log');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'GetWind': {
        const windVec = this.environmentalPhysics ? this.environmentalPhysics.getWindVelocity() : new THREE.Vector3();
        const speedKmH = this.environmentalPhysics ? this.environmentalPhysics.windConfig.speed : 0;
        this.triggerNodeOutput(entity, graph, node.id, 'out_val', {
          ...context,
          speed: speedKmH,
          dirX: windVec.x,
          dirY: windVec.y,
          dirZ: windVec.z,
          val: speedKmH,
        });
        break;
      }

      case 'IgniteEntity': {
        const target = context.target || entity;
        if (this.environmentalPhysics) {
          this.environmentalPhysics.igniteEntity(target);
          ScriptSandbox.addLog(`[Physique Feu] Entité '${target.name || target.id}' allumée !`, 'warn');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'ExtinguishEntity': {
        const target = context.target || entity;
        if (this.environmentalPhysics) {
          this.environmentalPhysics.extinguishEntity(target.id);
          ScriptSandbox.addLog(`[Physique Feu] Flammes éteintes sur '${target.name || target.id}'`, 'log');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'CheckIsBurning': {
        const target = context.target || entity;
        const burning = this.environmentalPhysics ? this.environmentalPhysics.isBurning(target.id) : false;
        if (burning) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_true', context);
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_false', context);
        }
        break;
      }

      case 'SetRain': {
        const enabled = node.values.enabled !== false;
        const intensity = Number(node.values.intensity ?? 0.6);
        const isThunder = Boolean(node.values.isThunder ?? false);
        if (this.environmentalPhysics) {
          this.environmentalPhysics.setRainConfig({
            enabled,
            intensity,
            isThunder,
          });
          ScriptSandbox.addLog(`[Physique Pluie] Pluie ${enabled ? 'activée' : 'désactivée'} (intensité: ${intensity})`, 'log');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'CheckIsRaining': {
        const isRaining = this.environmentalPhysics ? this.environmentalPhysics.rainConfig.enabled : false;
        const intensity = this.environmentalPhysics ? this.environmentalPhysics.rainConfig.intensity : 0;
        if (isRaining) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_true', { ...context, intensity });
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_false', { ...context, intensity: 0 });
        }
        break;
      }

      // ==========================================
      // PACK UNIVERSEL — cycle de vie, états de jeu, arcade, progression, caméra
      // ==========================================
      case 'TakeDamage': {
        const dmg = Number(context.amount ?? node.values.damage ?? 25);
        const knockback = Number(node.values.knockback ?? 0);
        const player = this.findPlayerEntity();
        if (player?.object3D && knockback > 0 && entity.object3D) {
          const dir = new THREE.Vector3()
            .subVectors(player.object3D.position, entity.object3D.position)
            .setY(0)
            .normalize();
          player.object3D.position.addScaledVector(dir, knockback * 0.2);
          player.object3D.position.y += 0.3;
        }
        this.damagePlayer(dmg, entity.object3D?.position, 'hit');
        if (this.globalState.health <= 0) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_defeated', context);
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        }
        break;
      }

      case 'Heal': {
        const amount = Number(context.amount ?? node.values.amount ?? 25);
        const maxHP = Number(node.values.maxHP ?? 100);
        this.healPlayer(amount, maxHP);
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', {
          ...context,
          health: this.globalState.health,
        });
        break;
      }

      case 'Checkpoint': {
        const player = this.findPlayerEntity();
        const anchor = entity.object3D?.position;
        if (player && anchor) {
          this.respawnPoints.set(player.id, anchor.clone());
          this.toast(`Checkpoint mémorisé (${entity.name})`, 2000);
          soundManager.playSFX('coin');
          ScriptSandbox.addLog(`[Progression] Checkpoint : ${entity.name}`, 'log');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'Respawn': {
        const target = context.target || entity;
        const restore = node.values.restoreHealth !== false;
        const hp = Number(node.values.health ?? 100);
        const point =
          this.respawnPoints.get(target.id) ?? this.initialTransforms.get(target.id)?.pos;
        if (target.object3D && point) target.object3D.position.copy(point);
        if (restore) {
          this.globalState.health = hp;
          this.deathFired = false;
          this.dispatchAllVariables();
        }
        soundManager.playSFX('warp');
        ScriptSandbox.addLog(`[Progression] Réapparition : ${target.name}`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'WinGame': {
        const title = String(node.values.title || 'VICTOIRE !');
        const message = String(node.values.message || 'Niveau terminé !');
        const sound = (node.values.sound || 'powerup') as SFXType;
        this.dialogueState.active = true;
        this.dialogueState.speaker = title;
        this.dialogueState.text = message;
        this.dialogueState.duration = 6;
        this.dialogueState.timer = 6;
        soundManager.playSFX(sound);
        this.toast(`${title} — ${message}`, 4000);
        ScriptSandbox.addLog(`[Jeu] ${title} ${message}`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'LoseGame': {
        const title = String(node.values.title || 'DÉFAITE...');
        const message = String(node.values.message || 'Partie terminée.');
        const sound = (node.values.sound || 'explosion') as SFXType;
        this.dialogueState.active = true;
        this.dialogueState.speaker = title;
        this.dialogueState.text = message;
        this.dialogueState.duration = 6;
        this.dialogueState.timer = 6;
        soundManager.playSFX(sound);
        this.toast(`${title} — ${message}`, 4000);
        ScriptSandbox.addLog(`[Jeu] ${title} ${message}`, 'warn');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'RestartLevel': {
        ScriptSandbox.addLog('[Jeu] Niveau recommencé', 'warn');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        this.stopSimulation();
        this.startSimulation();
        break;
      }

      case 'PauseGame': {
        this.paused = true;
        ScriptSandbox.setTimeScale(0);
        this.toast('Pause', 1500);
        ScriptSandbox.addLog('[Jeu] Pause — simulation gelée', 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'ResumeGame': {
        this.paused = false;
        ScriptSandbox.setTimeScale(1);
        this.toast('Reprise', 1500);
        ScriptSandbox.addLog('[Jeu] Reprise de la simulation', 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'Countdown': {
        const duration = Number(node.values.duration ?? 10);
        const loop = node.values.loop === true;
        const dt = Number(context.dt ?? 0.016);
        if (!node.values._running) {
          node.values._running = true;
          node.values.remaining = duration;
        }
        const remaining = Math.max(0, Number(node.values.remaining ?? duration) - dt);
        node.values.remaining = remaining;
        if (remaining <= 0) {
          node.values._running = false;
          node.values.remaining = duration;
          this.triggerNodeOutput(entity, graph, node.id, 'out_finished', {
            ...context,
            remaining: 0,
            value: 0,
          });
          if (loop) {
            node.values._running = true;
            node.values.remaining = duration;
          }
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', {
            ...context,
            remaining,
            value: remaining,
          });
        }
        break;
      }

      // ==========================================
      // ENTRÉES CLAVIER & PILOTAGE DIRECT
      // ==========================================

      case 'OnKeyPress':
      case 'OnKeyRelease': {
        // Dispatché par handleKeyPress ; le flux repart par la sortie d'événement.
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        this.triggerNodeOutput(entity, graph, node.id, 'out_key', {
          ...context,
          value: context.key ?? '',
        });
        break;
      }

      case 'IsKeyDown': {
        const binding = parseKeyBinding(node.values.key ?? 'Space');
        const down =
          binding.kind === 'any'
            ? this.pressedKeys.size > 0
            : binding.codes.some((c) => this.pressedKeys.has(c));
        this.triggerNodeOutput(entity, graph, node.id, down ? 'out_down' : 'out_up', {
          ...context,
          down,
        });
        break;
      }

      case 'ReadMoveAxis': {
        const axis = readMoveAxis(
          {
            forward: node.values.forward,
            back: node.values.back,
            left: node.values.left,
            right: node.values.right,
            sprint: node.values.sprint,
            slow: node.values.slow,
            deadzone: node.values.deadzone,
          },
          (code) => this.pressedKeys.has(code)
        );
        this.lastMoveAxis = axis;
        const next = { ...context, ...axis, forward: axis.forward, right: axis.right };
        this.triggerNodeOutput(entity, graph, node.id, 'out_forward', next);
        this.triggerNodeOutput(entity, graph, node.id, 'out_right', next);
        this.triggerNodeOutput(entity, graph, node.id, 'out_sprint', next);
        this.triggerNodeOutput(entity, graph, node.id, 'out_moving', next);
        break;
      }

      case 'MoveByAxis': {
        const mover = this.resolveTargetEntity(node.values.target, context, entity);
        const dt = Number(context.dt ?? 0.016);
        const mode = (node.values.mode ?? 'self') as MoveMode;

        // Deux modes de pilotage, choisis automatiquement quand c'est possible :
        //  - « axe »    : valeurs branchées depuis ReadMoveAxis (maintien) ;
        //  - « touche » : la touche appuyée décide du sens, pour un pas.
        const ctxFwd = context.forward !== undefined ? Number(context.forward) : undefined;
        const ctxRight = context.right !== undefined ? Number(context.right) : undefined;
        const pressed = context.key !== undefined ? String(context.key) : '';
        const trigger = String(node.values.trigger ?? 'auto');
        const useKeyMode =
          trigger === 'key' ||
          (trigger === 'auto' && pressed !== '' && ctxFwd === undefined && ctxRight === undefined);

        let fwd = ctxFwd ?? 0;
        let strafe = ctxRight ?? 0;
        let sprint = Number(context.sprint ?? node.values.sprint ?? 1);
        // En mode touche, le pas est instantané : sans cela, un appui unique
        // ne couvrirait que speed × dt (≈ 0,08 u), invisible à l'écran.
        let step: number | undefined;

        if (useKeyMode) {
          fwd = 0;
          strafe = 0;
          if (matchesKeyValue(node.values.forwardKey ?? 'KeyW', pressed)) fwd = 1;
          else if (matchesKeyValue(node.values.backKey ?? 'KeyS', pressed)) fwd = -1;
          else if (matchesKeyValue(node.values.rightKey ?? 'KeyD', pressed)) strafe = 1;
          else if (matchesKeyValue(node.values.leftKey ?? 'KeyA', pressed)) strafe = -1;
          if (fwd === 0 && strafe === 0) {
            // Touche hors déplacement (E, Espace, Échap…) : on ne fait rien.
            this.triggerNodeOutput(entity, graph, node.id, 'out_stopped', context);
            break;
          }
          step = clampNumber(node.values.step, 0, 1e4, 1);
          sprint = 1;
        }

        if (!mover?.object3D) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_stopped', context);
          break;
        }

        const axisSpeed = clampNumber(node.values.speed, 0, 1e4, 5) * clampNumber(sprint, 0.1, 10, 1);
        const res = computeMove({
          forward: fwd,
          right: strafe,
          heading: mover.object3D.rotation.y,
          cameraHeading: this.getCameraHeading(),
          speed: step !== undefined ? step : axisSpeed,
          dt: step !== undefined ? 1 : dt,
          mode,
          faceHeading: node.values.faceHeading !== false,
        });

        if (res.dx !== 0 || res.dz !== 0) {
          this.translate(mover, res.dx, res.dz, res.heading);
        }

        this.lastMoveSpeed = res.speed;
        const next = { ...context, speed: res.speed, moved: res.dx !== 0 || res.dz !== 0 };
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', next);
        this.triggerNodeOutput(entity, graph, node.id, res.speed > 0 ? 'out_moved' : 'out_stopped', next);
        this.triggerNodeOutput(entity, graph, node.id, 'out_speed', next);
        break;
      }

      case 'MoveTowards': {
        const speed = Number(context.speed ?? node.values.speed ?? 4);
        const stopDist = Number(node.values.stopDistance ?? 0.5);
        const dt = Number(context.dt ?? 0.016);
        const targetName = String(node.values.targetName || '');
        let dest: THREE.Vector3 | null = null;
        if (targetName) {
          const t = this.findEntityByName(targetName);
          if (t?.object3D) dest = t.object3D.position;
        } else {
          dest = new THREE.Vector3(
            Number(node.values.posX ?? 0),
            Number(node.values.posY ?? 0),
            Number(node.values.posZ ?? 0)
          );
        }
        let arrived = false;
        if (entity.object3D && dest) {
          const dist = entity.object3D.position.distanceTo(dest);
          if (dist <= stopDist) {
            arrived = true;
          } else {
            const dir = new THREE.Vector3().subVectors(dest, entity.object3D.position).normalize();
            this.translate(entity, dir.x * speed * dt, dir.z * speed * dt, Math.atan2(dir.x, dir.z));
          }
        }
        if (arrived) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_arrived', context);
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        }
        break;
      }

      case 'FleeFrom': {
        const speed = Number(node.values.speed ?? 4);
        const safeDist = Number(node.values.safeDistance ?? 8);
        const dt = Number(context.dt ?? 0.016);
        const threat = context.target || this.findPlayerEntity();
        let safe = true;
        if (entity.object3D && threat?.object3D) {
          const dist = entity.object3D.position.distanceTo(threat.object3D.position);
          if (dist < safeDist) {
            safe = false;
            const dir = new THREE.Vector3()
              .subVectors(entity.object3D.position, threat.object3D.position)
              .setY(0)
              .normalize();
            this.translate(entity, dir.x * speed * dt, dir.z * speed * dt, Math.atan2(dir.x, dir.z));
          }
        }
        if (safe) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_safe', context);
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        }
        break;
      }

      case 'Wander': {
        const speed = Number(node.values.speed ?? 2);
        const radius = Number(node.values.radius ?? 6);
        const interval = Number(node.values.changeInterval ?? 3);
        const dt = Number(context.dt ?? 0.016);
        if (!entity.object3D) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
          break;
        }
        const key = `${entity.id}:${node.id}`;
        let st = this.wanderStates.get(key);
        const home = this.initialTransforms.get(entity.id)?.pos ?? entity.object3D.position;
        if (!st || st.timer <= 0) {
          const angle = Math.random() * Math.PI * 2;
          st = { dir: new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)), timer: interval };
        }
        st.timer -= dt;
        // Reste dans le rayon du point d'origine : retour au bercail sinon
        if (entity.object3D.position.distanceTo(home) > radius) {
          st.dir = new THREE.Vector3().subVectors(home, entity.object3D.position).setY(0).normalize();
          st.timer = interval;
        }
        entity.object3D.position.addScaledVector(st.dir, speed * dt);
        entity.object3D.rotation.y = Math.atan2(st.dir.x, st.dir.z);
        this.wanderStates.set(key, st);
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'MeleeAttack': {
        const damage = Number(node.values.damage ?? 15);
        const range = Number(node.values.range ?? 2.5);
        const cooldown = Number(node.values.cooldown ?? 1);
        const dt = Number(context.dt ?? 0.016);
        node.values._cd = Math.max(0, Number(node.values._cd ?? 0) - dt);
        const player = context.target || this.findPlayerEntity();
        let hit = false;
        if (entity.object3D && player?.object3D) {
          const dist = entity.object3D.position.distanceTo(player.object3D.position);
          if (dist <= range && Number(node.values._cd) <= 0) {
            node.values._cd = cooldown;
            hit = true;
            // Repousse le joueur hors de portée
            const dir = new THREE.Vector3()
              .subVectors(player.object3D.position, entity.object3D.position)
              .setY(0)
              .normalize();
            player.object3D.position.addScaledVector(dir, 1.5);
            this.damagePlayer(damage, player.object3D.position, 'hit');
          }
        }
        if (hit) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_hit', context);
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        }
        break;
      }

      case 'ShowMessage': {
        const message = String(context.message ?? node.values.message ?? 'Objectif atteint !');
        const duration = Number(node.values.duration ?? 2500);
        this.toast(message, duration);
        ScriptSandbox.addLog(`[HUD] ${message}`, 'log');
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SaveGame': {
        const slot = String(node.values.slot || 'slot1');
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              `aether.save.${slot}`,
              JSON.stringify({
                score: this.globalState.score,
                health: this.globalState.health,
                variables: this.globalState.variables,
                inventory: this.globalState.inventory,
                savedAt: Date.now(),
              })
            );
          }
          this.toast(`Partie sauvegardée (${slot})`, 2000);
          ScriptSandbox.addLog(`[Sauvegarde] Slot '${slot}' enregistré`, 'log');
          this.triggerNodeOutput(entity, graph, node.id, 'out_saved', context);
        } catch (err) {
          ScriptSandbox.addLog(`[Sauvegarde] Échec : ${String(err)}`, 'error');
        }
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'LoadGame': {
        const slot = String(node.values.slot || 'slot1');
        let raw: string | null = null;
        try {
          raw =
            typeof window !== 'undefined'
              ? window.localStorage.getItem(`aether.save.${slot}`)
              : null;
        } catch {
          raw = null;
        }
        if (!raw) {
          ScriptSandbox.addLog(`[Sauvegarde] Aucune sauvegarde '${slot}'`, 'warn');
          this.triggerNodeOutput(entity, graph, node.id, 'out_missing', context);
          break;
        }
        try {
          const data = JSON.parse(raw);
          this.globalState.score = Number(data.score ?? 0);
          this.globalState.health = Number(data.health ?? 100);
          this.globalState.variables = data.variables ?? {};
          this.globalState.inventory = Array.isArray(data.inventory) ? data.inventory : [];
          if (this.globalState.health > 0) this.deathFired = false;
          this.dispatchAllVariables();
          this.notifyHealthChanged();
          this.toast(`Partie chargée (${slot})`, 2000);
          ScriptSandbox.addLog(`[Sauvegarde] Slot '${slot}' chargé`, 'log');
          this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        } catch (err) {
          ScriptSandbox.addLog(`[Sauvegarde] Données corrompues : ${String(err)}`, 'error');
          this.triggerNodeOutput(entity, graph, node.id, 'out_missing', context);
        }
        break;
      }

      case 'ToggleVisibility': {
        const name = String(node.values.target || 'self');
        const target =
          name === 'self' || !name ? entity : this.findEntityByName(name) || entity;
        if (target.object3D) {
          const nowVisible = !target.object3D.visible;
          target.object3D.visible = nowVisible;
          target.active = nowVisible;
        }
        if (target.object3D?.visible) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_shown', context);
        } else {
          this.triggerNodeOutput(entity, graph, node.id, 'out_hidden', context);
        }
        break;
      }

      case 'CameraFollow': {
        const distance = Number(node.values.distance ?? 7);
        const height = Number(node.values.height ?? 4);
        this.cameraFollow = { entityId: entity.id, distance, height };
        this.onCameraFollow?.(entity.id, distance, height);
        ScriptSandbox.addLog(
          `[Caméra] Suivi 3e personne : ${entity.name} (dist ${distance}, haut ${height})`,
          'log'
        );
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
      }

      case 'SlowFollow': {
        // Caméra à traîne : contrairement à `CameraFollow` (rigide), on ne
        // replace PAS la caméra à chaque frame — on garde son retard pour qu'elle
        // déborde du côté opposé à l'accélération.
        const target = this.resolveTargetEntity(node.values.target, context, entity);
        const style = (String(node.values.style ?? 'sprint') as TrailStyle);
        const preset = TRAIL_PRESETS[style] ?? TRAIL_PRESETS.sprint;
        const smoothing = clampNumber(
          readNumeric(context.smoothing, node.values.smoothing) ?? preset.smoothing,
          0.1,
          40,
          preset.smoothing
        );
        const lookAhead = clampNumber(
          readNumeric(context.lookAhead, node.values.lookAhead) ?? preset.lookAhead,
          0,
          6,
          preset.lookAhead
        );

        if (target?.object3D) {
          this.trail = {
            targetId: target.id,
            style,
            smoothing,
            lookAhead,
            // On démarre exactement sur la cible : sans ce recalage, la caméra
            // « rattraperait » depuis l'ancienne position et on verrait un saut.
            previousTarget: { ...target.object3D.position },
          };
          // Reprend le suivi rigide, dont on ne garde que l'inertie.
          this.cameraFollow = { entityId: target.id, distance: 6, height: 3 };
          this.onCameraFollow?.(target.id, 6, 3);
          ScriptSandbox.addLog(
            `[Caméra] Traîne « ${preset.label} » sur « ${target.name} » (retard ${smoothing}, avance ${lookAhead})`,
            'log'
          );
        }

        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', {
          ...context,
          smoothing,
          lookAhead,
          style,
          lag: 0,
        });
        break;
      }

      // ==========================================
      // MATIÈRES & PROPRIÉTÉS PHYSIQUES
      // ==========================================

      case 'SetSurface':
      case 'SetMaterial': {
        const isMaterial = node.type === 'SetMaterial';
        const target = this.resolveTargetEntity(node.values.target, context, entity);
        // Une socket câblée écrase toujours le champ du panneau (convention
        // du graphe), sinon le réglage visible serait silencieusement ignoré.
        const surfaceId = String(
          context.material ?? node.values.material ?? node.values.surface ?? 'default'
        );
        const props = resolveSurfaceProperties(surfaceId, {
          friction: readNumeric(context.friction, node.values.friction),
          restitution: readNumeric(context.restitution, node.values.restitution),
          linearDamping: readNumeric(context.damping, node.values.linearDamping),
          mass: readNumeric(context.mass, node.values.mass),
        });
        const surface = getSurface(surfaceId);

        if (target && (this.physicsManager || target.hasComponent?.('CharacterController'))) {
          // Un objet SANS corps physique ne peut pas avoir de friction : on
          // le signale plutôt que de laisser croire que ça a marché.
          // Exception : le joueur, dont la friction est gérée par le
          // CharacterController (traction + friction au sol).
          const onCharacter = this.setCharacterOverride(target, 'groundFriction', props.friction);
          this.setCharacterOverride(target, 'traction', surface.traction);

          const ok = onCharacter
            ? true
            : this.physicsManager?.setSurfaceProperties?.(
                target.id,
                props.friction,
                props.restitution
              ) ?? false;

          if (!onCharacter) {
            this.physicsManager?.setBodyDamping?.(target.id, props.linearDamping, undefined);
            if (props.mass !== null) this.physicsManager?.setBodyMass?.(target.id, props.mass);
          }
          if (!ok) {
            ScriptSandbox.addLog(
              `[Matière] « ${target.name} » n'a pas de corps physique : friction ignorée.`,
              'warn'
            );
          } else {
            this.rememberSurface(target, surface);
          }
        }

        const next = {
          ...context,
          surface: surfaceId,
          friction: props.friction,
          restitution: props.restitution,
          traction: surface.traction,
        };
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', next);
        if (isMaterial) {
          this.triggerNodeOutput(entity, graph, node.id, 'out_traction', next);
        }
        break;
      }

      case 'SetGravity': {
        const target = this.resolveTargetEntity(node.values.target, context, entity);
        const scale = clampNumber(readNumeric(context.scale, node.values.scale) ?? 1, 0, 4, 1);
        // Gravité de référence du moteur (CharacterControllerSystem) : -18 m/s².
        // Elle est appliquée comme force continue, ce qui donne la pesanteur
        // lunaire (~0,166) et le zéro-g (0) aussi bien que la normale (1).
        const accel = -18 * scale;
        const id = target?.id ?? entity.id;
        if (target) {
          // Un joueur n'a pas de corps rigide : sa gravité est calculée par le
          // CharacterController, pas par Rapier. Sans cette branche, le nœud
          // serait sans effet sur le personnage — le cas le plus courant.
          if (this.setCharacterOverride(target, 'gravityScale', scale)) {
            ScriptSandbox.addLog(`[Gravity] Pesanteur ×${scale} sur « ${target.name} »`, 'log');
          } else {
            this.applyGravity(target, accel);
          }
        }
        this.gravityScales.set(id, scale);

        const next = { ...context, scale, weight: scale };
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', next);
        this.triggerNodeOutput(entity, graph, node.id, 'out_weight', next);
        break;
      }

      case 'SetDrag': {
        const target = this.resolveTargetEntity(node.values.target, context, entity);
        const linear = clampNumber(readNumeric(context.linear, node.values.linear) ?? 0, 0, 50, 0);
        const id = target?.id ?? entity.id;
        if (target) {
          const onCharacter = this.setCharacterOverride(target, 'drag', linear);
          if (!onCharacter) {
            this.physicsManager?.setBodyDamping?.(target.id, linear, linear);
          }
        }
        this.dragValues.set(id, linear);

        const next = { ...context, linear, drag: linear };
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', next);
        this.triggerNodeOutput(entity, graph, node.id, 'out_drag', next);
        break;
      }

      case 'SetTimeScale': {
        // Réutilise l'échelle du bac à sable : déjà bornée 0..10 et appliquée
        // par le runtime, donc graphe (Niveau 2) et script (Niveau 3) restent
        // cohérents au lieu d'avoir deux notions de temps qui divergent.
        const scale = clampNumber(readNumeric(context.scale, node.values.scale) ?? 1, 0, 10, 1);
        ScriptSandbox.setTimeScale(scale);
        this.timeScale = scale;
        const next = { ...context, scale, timeScale: scale };
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', next);
        this.triggerNodeOutput(entity, graph, node.id, 'out_scale', next);
        break;
      }

      case 'FootstepSound': {
        const surfaceId = String(context.surface ?? node.values.surface ?? 'default');
        const surface = getSurface(surfaceId);
        const volume = clampNumber(
          readNumeric(context.volume, node.values.volume) ?? 0.6,
          0,
          1,
          0.6
        );
        // La matière décide du timbre, le volume de l'intensité perçue.
        soundManager.playSFX(surface.stepSound, volume);
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', {
          ...context,
          surface: surfaceId,
        });
        break;
      }

      case 'HitStop': {
        const duration = clampNumber(
          readNumeric(context.duration, node.values.duration) ?? 0.08,
          0,
          0.5,
          0.08
        );
        // Gel bref du temps : l'effet qui donne le plus de « poids » à un
        // impact pour une poignée de lignes. Borné à 0,5 s pour ne pas
        // pouvoir figer la partie par accident.
        this.hitStopRemaining = Math.max(this.hitStopRemaining, duration);
        this.hitStopTotal = Math.max(this.hitStopTotal, duration);
        ScriptSandbox.setTimeScale(0);
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', { ...context, duration });
        break;
      }

      case 'Rumble': {
        const intensity = clampNumber(
          readNumeric(context.intensity, node.values.intensity) ?? 0.6,
          0,
          1,
          0.6
        );
        const duration = clampNumber(
          readNumeric(context.duration, node.values.duration) ?? 0.4,
          0,
          5,
          0.4
        );
        // Un rumble déjà plus fort que le nouveau ne doit pas être coupé :
        // on garde le maximum, comme pour HitStop.
        this.rumble = {
          intensity: Math.max(this.rumble?.intensity ?? 0, intensity),
          remaining: Math.max(this.rumble?.remaining ?? 0, duration),
          total: Math.max(this.rumble?.remaining ?? 0, duration),
        };
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', {
          ...context,
          intensity,
          duration,
        });
        break;
      }

      default:
        // Default forward
        this.triggerNodeOutput(entity, graph, node.id, 'out_flow', context);
        break;
    }
  }

  // ==========================================
  // PACK UNIVERSEL — HELPERS (vie, mort, feedback)
  // ==========================================

  /** Trouve le joueur (même convention que la boucle update). */
  private findPlayerEntity(): Entity | null {
    return (
      this.ecsWorld.getAllEntities().find(
        (e) =>
          e.active &&
          (e.object3D?.userData?.subType === 'player' ||
            e.hasComponent('CharacterController') ||
            e.name.toLowerCase().includes('player'))
      ) || null
    );
  }

  /** Toast HUD du jeu (bannière temporaire en partie). */
  private toast(message: string, duration = 2500): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aether_show_toast', { detail: { message, duration } })
      );
    }
  }

  /** Dégâts au joueur : PV globaux + popup + son + mort éventuelle. */
  private damagePlayer(
    amount: number,
    popupAt?: THREE.Vector3,
    sound: 'explosion' | 'hit' = 'explosion'
  ): void {
    const dmg = Math.max(0, Number(amount) || 0);
    this.globalState.health = Math.max(0, this.globalState.health - dmg);
    this.dispatchAllVariables();
    const player = this.findPlayerEntity();
    const pos = popupAt ?? player?.object3D?.position;
    if (pos) {
      this.floatingTexts.push({
        id: `dmg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        text: `-${dmg} PV`,
        x: pos.x,
        y: pos.y + 1.2,
        z: pos.z,
        color: '#f43f5e',
        timer: 1.5,
      });
    }
    soundManager.playSFX(sound);
    this.onDamageEntity?.(player?.id ?? 'player', dmg, this.globalState.health);
    ScriptSandbox.addLog(
      `[Combat] Dégâts subis : -${dmg} PV (Restants : ${this.globalState.health})`,
      'warn'
    );
    this.notifyHealthChanged();
  }

  /** Soigne le joueur jusqu'au plafond maxHP. */
  private healPlayer(amount: number, maxHP = 100): void {
    const gain = Math.max(0, Number(amount) || 0);
    const cap = Math.max(1, Number(maxHP) || 100);
    this.globalState.health = Math.min(cap, this.globalState.health + gain);
    if (this.globalState.health > 0) this.deathFired = false;
    this.dispatchAllVariables();
    const pos = this.findPlayerEntity()?.object3D?.position;
    if (pos) {
      this.floatingTexts.push({
        id: `heal_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        text: `+${gain} PV`,
        x: pos.x,
        y: pos.y + 1.2,
        z: pos.z,
        color: '#34d399',
        timer: 1.5,
      });
    }
    soundManager.playSFX('powerup');
    ScriptSandbox.addLog(`[Soin] +${gain} PV (Total : ${this.globalState.health})`, 'log');
  }

  /** Déclenche OnDeath (une seule fois) quand la Santé atteint 0. */
  public notifyHealthChanged(): void {
    if (this.globalState.health <= 0 && !this.deathFired) {
      this.deathFired = true;
      ScriptSandbox.addLog('[Jeu] Santé à zéro — OnDeath déclenché', 'error');
      for (const ent of this.ecsWorld.getAllEntities()) {
        if (!ent.active) continue;
        const lg = ent.object3D?.userData?.logic as EntityLogicData | undefined;
        if (lg?.nodeGraph?.enabled) this.executeGraphEvents(ent, 'OnDeath');
      }
    }
  }

  // ==========================================
  // HELPER ACTIONS
  // ==========================================

  private collectEntity(entity: Entity, cfg: CollectableConfig): void {
    if (cfg.soundPreset && cfg.soundPreset !== 'none') {
      SoundEngine.play(cfg.soundPreset);
    }
    const scoreVal = cfg.scoreValue ?? 10;
    this.globalState.score += scoreVal;
    ScriptSandbox.addLog(`+${scoreVal} Points! Score total: ${this.globalState.score}`, 'log');
    this.dispatchAllVariables();

    // Visual disappear effect
    if (entity.object3D) {
      entity.object3D.visible = false;
    }
    entity.active = false;

    // Handle respawn if configured
    if (cfg.respawnTime && cfg.respawnTime > 0) {
      this.defer(cfg.respawnTime * 1000, () => {
        if (entity.object3D) {
          entity.active = true;
          entity.object3D.visible = true;
          SoundEngine.play('warp');
        }
      });
    }
  }

  private applyDamageOnTouch(hazard: Entity, target: Entity, cfg: DamageOnTouchConfig): void {
    if (cfg.soundPreset) SoundEngine.play(cfg.soundPreset);
    const dmg = cfg.damage ?? 25;
    this.globalState.health = Math.max(0, this.globalState.health - dmg);
    this.dispatchAllVariables();
    ScriptSandbox.addLog(`Dégâts subis! -${dmg} PV (PV restants: ${this.globalState.health})`, 'warn');
    this.notifyHealthChanged();

    // Knockback
    if (target.object3D && hazard.object3D) {
      const dir = new THREE.Vector3().subVectors(target.object3D.position, hazard.object3D.position).normalize();
      target.object3D.position.addScaledVector(dir, (cfg.knockbackForce ?? 8.0) * 0.2);
      target.object3D.position.y += 0.5;
    }

    // Flash hazard mesh red
    this.pulseColor(hazard, 0xff0044);
  }

  private pulseEntity(entity: Entity): void {
    if (!entity.object3D) return;
    const origScale = entity.object3D.scale.clone();
    entity.object3D.scale.multiplyScalar(1.25);
    // Volontairement un setTimeout NON annulé au Stop, contrairement aux timers
    // de gameplay : la restauration est un retour à l'état visuel initial. Si on
    // l'annulait, un Stop pendant la pulsation laisserait le maillage figé à
    // 125 % pour le reste de la session — le défaut qu'on souhaitait éviter.
    setTimeout(() => {
      if (entity.object3D) entity.object3D.scale.copy(origScale);
    }, 150);
  }

  private pulseColor(entity: Entity, hex: number): void {
    if (!entity.object3D) return;
    entity.object3D.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        const origColor = mat.color?.getHex() ?? 0xffffff;
        mat.color?.setHex(hex);
        // Même raison que pulseEntity : sans restitution, le maillage resterait
        // rouge pour de bon.
        setTimeout(() => {
          mat.color?.setHex(origColor);
        }, 180);
      }
    });
  }

  public destroyEntity(entity: Entity): void {
    this.dispatchScriptEvent(entity.id, 'onDestroy');
    entity.active = false;
    if (entity.object3D) {
      entity.object3D.visible = false;
    }
  }

  public findEntityByName(name: string): Entity | null {
    return this.ecsWorld.getAllEntities().find((e) => e.name === name) || null;
  }

  /**
   * Résout la cible d'un nœud d'action. Priorité à la cible reçue par le
   * contexte (collision, déclencheur), puis au réglage du nœud, enfin à
   * l'objet porteur du graphe. Une cible configurée mais introuvable retombe
   * sur `self` plutôt que d'échouer en silence.
   */
  private resolveTargetEntity(
    targetSetting: unknown,
    context: Record<string, any>,
    self: Entity
  ): Entity | null {
    const fromContext = context.target ?? context.other;
    if (fromContext) return fromContext as Entity;

    const ref = parseTargetRef(targetSetting);
    if (ref.kind === 'self') return self;
    const found = ref.kind === 'id' ? this.ecsWorld.getEntity(ref.id) : this.findEntityByName(ref.name);
    return found ?? self;
  }

  /**
   * Cap de la caméra du studio, utilisé par MoveByAxis en mode 'camera' pour
   * que les flèches correspondent à ce que l'utilisateur voit.
   */
  private getCameraHeading(): number {
    const cam = this.scene?.getObjectByProperty('isCamera', true) as THREE.Camera | undefined;
    if (!cam) return 0;
    const pos = cam.getWorldPosition(new THREE.Vector3());
    const target = new THREE.Vector3();
    cam.getWorldDirection(target);
    target.multiplyScalar(10).add(pos);
    return Math.atan2(target.x - pos.x, target.z - pos.z) + Math.PI;
  }

  /** Vrai si la simulation Play est active. */
  public getIsRunning(): boolean {
    return this.isRunning;
  }
}
