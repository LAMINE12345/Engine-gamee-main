import * as THREE from 'three';
import { Entity, CharacterControllerComponent, TransformComponent } from '../ecs/ECS';
import {
  getWorldPosition,
  getWorldQuaternion,
  worldDisplacementToLocal,
} from './transformSpace';
import { clampNumber } from '../logic/inputLogic';

/** Temps du fallback cinématique (pas d'alloc par frame). */
const _fbDisp = new THREE.Vector3();
const _fbPos = new THREE.Vector3();
const _fbQuat = new THREE.Quaternion();
const _fbUp = new THREE.Vector3();
import {
  GameplayActionId,
  GAMEPLAY_ACTIONS,
  InputConfig,
  MouseLookSettings,
  DEFAULT_INPUT_CONFIG,
  BLOCKED_CODES,
  cloneInputConfig,
  normalizeInputConfig,
  loadInputConfig,
  saveInputConfig,
  findConflicts,
} from '../input/InputBindings';

/**
 * Keyboard Input State Manager for Character Control.
 * - Uses `KeyboardEvent.code` (physical keys, layout-independent).
 * - Bindings are fully remappable at runtime (see beginListen) and persisted
 *   to localStorage (+ JSON export/import). Defaults cover AZERTY (ZQSD),
 *   QWERTY (WASD) and arrow keys.
 * - Listeners are only bound during Play mode; typing targets (inputs, text
 *   areas, selects, editable zones) never leak into gameplay flags.
 */
export class InputManager {
  // Gameplay flags (kept as public API for physics/animation systems)
  public forward: boolean = false;
  public backward: boolean = false;
  public left: boolean = false;
  public right: boolean = false;
  public jump: boolean = false;
  public sprint: boolean = false;
  public attack: boolean = false;
  public interact: boolean = false;
  public crouch: boolean = false;
  public wave: boolean = false;

  /** Active bindings (physical codes per action). Mutate via setBinding/resetDefaults. */
  public bindings: Record<GameplayActionId, string[]>;
  /** Mouse-look (Yaw) settings, persisted with the bindings. */
  public mouse: MouseLookSettings;

  /** Key-binding listen mode: the action currently waiting for a key press, or null. */
  public listeningFor: GameplayActionId | null = null;
  /** Fired when listen mode captures a key (even a conflicting one — UI decides). */
  public onListenCapture: ((action: GameplayActionId, code: string) => void) | null = null;
  /** Fired when listen mode is cancelled (Escape) or hits a blocked key. */
  public onListenDenied: ((reason: string) => void) | null = null;
  /** Fired after any binding/mouse change (UI can show a "saved" indicator). */
  public onConfigChanged: (() => void) | null = null;

  private isBound: boolean = false;
  private listenTempBound: boolean = false;
  private listenCallback: ((code: string) => void) | null = null;
  private pressedCodes: Set<string> = new Set();

  constructor() {
    const stored = loadInputConfig();
    this.bindings = stored.bindings;
    this.mouse = stored.mouse;
  }

  // ---------------------------------------------------------------- lifecycle

  /** Gameplay capture ON (Play mode). Safe to call repeatedly. */
  public bind(): void {
    if (this.isBound || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.isBound = true;
  }

  /** Gameplay capture OFF (Edit mode). Resets all flags (anti stuck-keys). */
  public unbind(): void {
    if (!this.isBound || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.reset();
    this.isBound = false;
  }

  public reset(): void {
    this.pressedCodes.clear();
    this.forward = false;
    this.backward = false;
    this.left = false;
    this.right = false;
    this.jump = false;
    this.sprint = false;
    this.attack = false;
    this.interact = false;
    this.crouch = false;
    this.wave = false;
  }

  private handleWindowBlur = (): void => {
    this.reset();
  };

  private handleVisibility = (): void => {
    if (typeof document !== 'undefined' && document.hidden) this.reset();
  };

  // ---------------------------------------------------------- event handling

  /** UI focus guard: typing zones never leak keystrokes into gameplay. */
  private isTypingTarget(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    if (!target || !target.tagName) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    // --- Key-binding listen mode (capture phase, works in Edit mode too)
    if (this.listeningFor) {
      e.preventDefault();
      e.stopPropagation();
      const code = e.code;
      if (code === 'Escape') {
        const action = this.listeningFor;
        void action;
        this.endListen();
        this.onListenDenied?.('Écoute annulée (Échap).');
        return;
      }
      if (BLOCKED_CODES[code]) {
        this.endListen();
        this.onListenDenied?.(BLOCKED_CODES[code]);
        return;
      }
      if (code === 'F5' || code === 'F11' || code === 'F12') return; // let the browser handle it
      const action = this.listeningFor;
      const cb = this.listenCallback;
      this.endListen();
      this.onListenCapture?.(action, code);
      cb?.(code);
      return;
    }

    if (this.isTypingTarget(e)) return;

    // Space must not scroll the page nor activate a focused UI button (Play/Stop...).
    if (e.code === 'Space') e.preventDefault();

    this.pressedCodes.add(e.code);
    this.refreshFlags();
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (this.listeningFor) return;
    this.pressedCodes.delete(e.code);
    this.refreshFlags();
  };

  private refreshFlags(): void {
    const has = (action: GameplayActionId): boolean =>
      (this.bindings[action] || []).some((c) => this.pressedCodes.has(c));
    this.forward = has('forward');
    this.backward = has('backward');
    this.left = has('left');
    this.right = has('right');
    this.jump = has('jump');
    this.sprint = has('sprint');
    this.attack = has('attack');
    this.interact = has('interact');
    this.crouch = has('crouch');
    this.wave = has('wave');
  }

  // ------------------------------------------------------------- remapping

  /**
   * Enter "press a key..." listen mode for `action`. The capture callback fires
   * once with the pressed code (conflicts included — the UI arbitrates).
   */
  public beginListen(action: GameplayActionId, cb?: (code: string) => void): void {
    this.endListen();
    this.listeningFor = action;
    this.listenCallback = cb || null;
    if (!this.isBound && !this.listenTempBound && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown, true);
      this.listenTempBound = true;
    }
  }

  public endListen(): void {
    this.listeningFor = null;
    this.listenCallback = null;
    if (this.listenTempBound && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown, true);
      this.listenTempBound = false;
    }
  }

  /** Actions (besides `except`) already using `code`. */
  public findConflicts(code: string, except?: GameplayActionId): GameplayActionId[] {
    return findConflicts(this.bindings, code, except);
  }

  /**
   * Assign `code` as the SOLE binding of `action`.
   * Returns the list of other actions that lost this code (for UI notice).
   */
  public setBinding(action: GameplayActionId, code: string): GameplayActionId[] {
    const replaced = this.findConflicts(code, action);
    for (const other of replaced) {
      this.bindings[other] = (this.bindings[other] || []).filter((c) => c !== code);
      if (this.bindings[other].length === 0) {
        // Never leave an action keyless: restore its factory default.
        this.bindings[other] = [...DEFAULT_INPUT_CONFIG.bindings[other]];
      }
    }
    this.bindings[action] = [code];
    this.persist();
    this.refreshFlags();
    return replaced;
  }

  /** Exchange the bindings of two actions. */
  public swapBindings(a: GameplayActionId, b: GameplayActionId): void {
    const tmp = this.bindings[a];
    this.bindings[a] = this.bindings[b];
    this.bindings[b] = tmp;
    this.persist();
    this.refreshFlags();
  }

  public resetDefaults(): void {
    const fresh = cloneInputConfig(DEFAULT_INPUT_CONFIG);
    this.bindings = fresh.bindings;
    this.mouse = fresh.mouse;
    this.persist();
    this.refreshFlags();
  }

  public setMouse(partial: Partial<MouseLookSettings>): void {
    this.mouse = {
      enabled: partial.enabled ?? this.mouse.enabled,
      sensitivity:
        partial.sensitivity !== undefined
          ? Math.min(10, Math.max(0.5, partial.sensitivity))
          : this.mouse.sensitivity,
      invert: partial.invert ?? this.mouse.invert,
    };
    this.persist();
  }

  public getConfig(): InputConfig {
    return cloneInputConfig({ version: 1, bindings: this.bindings, mouse: this.mouse });
  }

  public applyConfig(cfg: InputConfig): void {
    const clean = normalizeInputConfig(cfg);
    this.bindings = clean.bindings;
    this.mouse = clean.mouse;
    this.persist();
    this.refreshFlags();
  }

  public exportJSON(): string {
    return JSON.stringify(this.getConfig(), null, 2);
  }

  /** Returns an error message on failure, null on success. */
  public importJSON(text: string): string | null {
    try {
      const parsed = JSON.parse(text) as unknown;
      this.applyConfig(normalizeInputConfig(parsed));
      return null;
    } catch {
      return 'Fichier JSON invalide ou illisible.';
    }
  }

  private persist(): void {
    saveInputConfig(this.getConfig());
    this.onConfigChanged?.();
  }
}

export { GAMEPLAY_ACTIONS };

/**
 * CharacterControllerSystem (ECS System)
 * Manages player movement, gravity, jump impulse, grounded state, and camera follow
 */
export class CharacterControllerSystem {
  public input: InputManager = new InputManager();
  public camera: THREE.PerspectiveCamera | null = null;
  /** Acceleration smoothing rate (Hz). Higher = snappier, lower = floatier. ~10-12 feels responsive. */
  public accelerationSmoothing: number = 12.0;
  /**
   * Third-person orbit yaw (radians) driven by mouse X when
   * `input.mouse.enabled` is true. Null = not yet synced to the player.
   * SceneManager reads it to place the follow camera behind the player.
   */
  public cameraYaw: number | null = null;
  /** Initial yaw when play starts — clamp reference for ±45° limit. */
  public cameraYawBase: number | null = null;

  private mouseLookEl: HTMLElement | null = null;
  private mouseBound: boolean = false;  constructor(camera?: THREE.PerspectiveCamera) {
    if (camera) this.camera = camera;
  }

  public setCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
  }

  public getCamera(): THREE.PerspectiveCamera | null {
    return this.camera;
  }

  /** Element receiving mouse-look movement (usually the WebGL canvas). */
  public setMouseLookTarget(el: HTMLElement | null): void {
    if (this.mouseLookEl === el) return;
    this.detachMouseLook();
    this.mouseLookEl = el;
    if (this.input) this.attachMouseLook();
  }

  public activate(): void {
    this.input.bind();
    this.input.endListen();
    this.attachMouseLook();
  }

  public deactivate(): void {
    this.detachMouseLook();
    this.input.unbind();
    this.input.endListen();
    this.cameraYaw = null;
    this.cameraYawBase = null;
  }

  private attachMouseLook(): void {
    if (this.mouseBound || !this.mouseLookEl || typeof window === 'undefined') return;
    this.mouseLookEl.addEventListener('mousemove', this.handleMouseMove);
    this.mouseBound = true;
  }

  private detachMouseLook(): void {
    if (!this.mouseBound || !this.mouseLookEl) return;
    this.mouseLookEl.removeEventListener('mousemove', this.handleMouseMove);
    this.mouseBound = false;
  }

  /**
   * Mouse X → player Yaw. Works with pointer lock (movementX) and without.
   * Applied to `cameraYaw`; SceneManager orbits the camera and faces the player.
   */
  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.input.mouse.enabled) return;
    const dx = e.movementX || 0;
    if (!dx) return;
    if (this.cameraYaw === null) {
      this.cameraYaw = 0;
      this.cameraYawBase = 0;
    }
    const dir = this.input.mouse.invert ? 1 : -1;
    this.cameraYaw += dir * dx * 0.0022 * this.input.mouse.sensitivity;
    // Clamp to ±45° from initial yaw (over-the-shoulder camera style)
    if (this.cameraYawBase !== null) {
      this.cameraYaw = Math.max(
        this.cameraYawBase - Math.PI / 4,
        Math.min(this.cameraYawBase + Math.PI / 4, this.cameraYaw)
      );
    }
  };

  public update(dt: number, entities: Entity[]): void {
    // Find active player entity with CharacterControllerComponent
    const playerEntity = entities.find(
      (e) => e.active && e.hasComponent('CharacterController') && e.object3D
    );

    if (!playerEntity || !playerEntity.object3D) return;

    const controller = playerEntity.getComponent<CharacterControllerComponent>('CharacterController');
    const transform = playerEntity.getComponent<TransformComponent>('Transform');
    if (!controller || !controller.enabled || !transform) return;

    const obj = playerEntity.object3D;

    // Dérogations en jeu posées par les nœuds du graphe (SetGravity,
    // SetSurface/Material, SetDrag). Sans elles, la gravité −18 et la vitesse
    // seraient figées en dur et un joueur « lunaire » resterait terrestre.
    const ov = controller.runtimeOverrides;

    // Movement speed with sprint modifier (crouch halves speed)
    // La traction de la matière freine le personnage : on marche dans la boue.
    const traction = ov.traction ?? 1;
    const moveSpeed =
      controller.speed *
      (this.input.sprint ? 1.5 : 1.0) *
      (this.input.crouch ? 0.5 : 1.0) *
      traction;

    // --- 1. Build 8-way input vector (camera-relative, XZ plane) ---
    // forward/back/left/right + diagonals = 8 directions. Normalizing
    // keeps diagonal speed identical to cardinal speed.
    const moveDir = this.getCameraRelativeMoveDir();

    const hasHorizontalMovement = moveDir.lengthSq() > 0.001;
    if (hasHorizontalMovement) {
      moveDir.normalize();
      // No auto-rotation: le joueur garde son orientation Y manuelle (gizmo/éditeur).
    }

    // --- 3. Smooth movement speed (exponential damp = SmoothDamp without overshoot) ---
    // Instead of snapping velocity to full speed, ease current velocity
    // toward target. This removes start/stop jitter.
    const targetVelocity = hasHorizontalMovement
      ? moveDir.clone().multiplyScalar(moveSpeed)
      : new THREE.Vector3(0, 0, 0);
    const accelFactor = 1.0 - Math.exp(-this.accelerationSmoothing * dt);
    controller.velocity.lerp(targetVelocity, accelFactor);
    controller.currentSpeed = controller.velocity.length();
    const horizontalVelocity = controller.velocity;

    // Gravity and Jumping
    // Pesanteur de référence du moteur, modulée par le nœud SetGravity.
    // Lune : −3 m/s², zéro-G : 0 (le joueur flotte au lieu de tomber).
    const gravity = -18.0 * (ov.gravityScale ?? 1);

    // Friction au sol : « Collé » sur un sol glissant ou accrocheur.
    // En l'air on ne l'applique pas (sinon on se figerait en plein saut).
    if (ov.groundFriction !== null) {
      const friction = clampNumber(ov.groundFriction, 0, 20, 0.5);
      if (hasHorizontalMovement) {
        const keep = friction * dt * 6;
        if (keep < 1) {
          horizontalVelocity.x *= keep;
          horizontalVelocity.z *= keep;
        }
      } else {
        horizontalVelocity.x = 0;
        horizontalVelocity.z = 0;
      }
    }

    // Résistance de l'air (SetDrag) : parachute, glisse en apesanteur.
    if (ov.drag !== null) {
      const damp = Math.max(0, 1 - clampNumber(ov.drag, 0, 50, 0) * dt);
      horizontalVelocity.multiplyScalar(damp);
    }

    if (controller.isGrounded) {
      if (this.input.jump) {
        controller.verticalVelocity = controller.jumpForce;
        controller.isGrounded = false;
      } else {
        // Slight downward velocity to stay glued to slopes/floors
        controller.verticalVelocity = -1.5;
      }
    } else {
      controller.verticalVelocity += gravity * dt;
      // Clamp terminal velocity
      if (controller.verticalVelocity < -25) {
        controller.verticalVelocity = -25;
      }
    }

    // Calculate total movement vector for this step
    const displacement = new THREE.Vector3(
      horizontalVelocity.x * dt,
      controller.verticalVelocity * dt,
      horizontalVelocity.z * dt
    );

    // If Rapier character controller is bound, let Rapier compute actual collision movement
    if (controller.rawController && controller.rawBody) {
      // Rapier movement will be driven in PhysicsSystem step
    } else {
      // Fallback simple ground collision with floor plane (Y = 0, MONDE).
      // Le déplacement est calculé monde (caméra-relative) puis converti en local.
      worldDisplacementToLocal(obj, displacement, _fbDisp);
      obj.position.add(_fbDisp);
      obj.updateWorldMatrix(true, false);
      const worldY = _fbPos.setFromMatrixPosition(obj.matrixWorld).y;
      const minFloorY = 0.9; // capsule bottom offset (halfHeight 0.45 + radius 0.45)
      if (worldY <= minFloorY) {
        worldDisplacementToLocal(obj, _fbUp.set(0, minFloorY - worldY, 0), _fbDisp);
        obj.position.add(_fbDisp);
        controller.verticalVelocity = 0;
        controller.isGrounded = true;
      }
    }

    // Update Transform component
    transform.position.copy(obj.position);
    transform.rotation.copy(obj.rotation);
    transform.quaternion.copy(obj.quaternion);

    // Follow camera update
    if (this.camera) {
      if (controller.mode === 'thirdPerson') {
        // Handled exclusively by SceneManager to prevent frame conflicts and high-frequency shaking
      } else {
        // First-person eye level (espace monde)
        getWorldPosition(obj, _fbPos);
        getWorldQuaternion(obj, _fbQuat);
        this.camera.position.copy(_fbPos).add(new THREE.Vector3(0, 1.6, 0));
        const targetLook = new THREE.Vector3(0, 0, -1).applyQuaternion(_fbQuat);
        this.camera.lookAt(this.camera.position.clone().add(targetLook));
      }
    }
  }

  /**
   * Returns the combined 8-way movement direction on the XZ plane,
   * relative to the camera yaw (or world axes if no camera bound).
   * Do NOT normalize here — caller normalizes after the length check
   * so diagonals keep the same speed as cardinals.
   */
  public getCameraRelativeMoveDir(): THREE.Vector3 {
    const moveDir = new THREE.Vector3();
    let forward = new THREE.Vector3(0, 0, -1);
    let right = new THREE.Vector3(1, 0, 0);

    if (this.camera) {
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    }

    if (this.input.forward) moveDir.add(forward);
    if (this.input.backward) moveDir.sub(forward);
    if (this.input.right) moveDir.add(right);
    if (this.input.left) moveDir.sub(right);
    return moveDir;
  }

  public dispose(): void {
    this.input.unbind();
  }
}
