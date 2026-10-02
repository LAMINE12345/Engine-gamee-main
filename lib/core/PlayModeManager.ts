import type { EngineEvents } from '../../types/engine';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { LogicExecutor } from '../logic/LogicExecutor';
import type { AnimationManager } from '../animation/AnimationManager';
import type { SelectionManager } from './SelectionManager';
import type { CameraManager } from './CameraManager';

export interface PlayModeDeps {
  physicsManager: PhysicsManager;
  logicExecutor: LogicExecutor;
  animationManager: AnimationManager | null;
  events: EngineEvents;
  selection: SelectionManager;
  camera: CameraManager;
  /** Reset d'état du domaine rig/anim à chaque entrée en Play (logs diag...). */
  onPlayStarted(): void;
  /** Nettoyage/snapshot à chaque sortie de Play (optionnel). */
  onPlayStopped?(): void;
}

/**
 * PlayModeManager — cycle Play/Stop, séquençage des simulations
 * (physique, logique, animations) et pointer lock pour le mouse-look.
 *
 * L'état `isPlaying` est la source de vérité ; l'historique/autosave
 * et la sélection le consultent pour se suspendre ou se reconfigurer.
 */
export class PlayModeManager {
  private readonly deps: PlayModeDeps;
  private isPlayingFlag = false;
  private canvas: HTMLCanvasElement | null = null;

  constructor(deps: PlayModeDeps) {
    this.deps = deps;
  }

  public get isPlaying(): boolean {
    return this.isPlayingFlag;
  }

  /** Enregistre le canvas pour le click-to-lock (mouse-look troisième personne). */
  public attachCanvas(canvas: HTMLCanvasElement): void {
    this.detachCanvas();
    this.canvas = canvas;
    this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
  }

  private detachCanvas(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.handleCanvasMouseDown);
      this.canvas = null;
    }
  }

  public togglePlayMode(): void {
    void this.setPlayMode(!this.isPlayingFlag);
  }

  public async setPlayMode(playing: boolean): Promise<void> {
    this.isPlayingFlag = playing;
    this.deps.events.onPlayStateChange(playing);

    if (playing) {
      this.deps.camera.resetPlayState();
      // Re-sync mouse-look yaw to the player on each Play start.
      this.deps.physicsManager.characterSystem.cameraYaw = null;
      this.deps.onPlayStarted();
      this.deps.selection.detachGizmo();
      await this.deps.physicsManager.startSimulation();
      this.deps.logicExecutor.startSimulation();
    } else {
      this.deps.logicExecutor.stopSimulation();
      this.deps.physicsManager.stopSimulation();
      this.exitPointerLock();
      if (this.deps.animationManager) {
        this.deps.animationManager.resetAllTracks();
      }
      this.deps.selection.attachGizmoToSelection();
      this.deps.onPlayStopped?.();
    }
  }

  /**
   * Click-to-lock pointer for mouse-look Yaw (third-person).
   * Only engages during Play when mouse-look is enabled in the input config.
   */
  private handleCanvasMouseDown = (): void => {
    if (!this.isPlayingFlag) return;
    if (!this.deps.physicsManager.characterSystem.input.mouse.enabled) return;
    const canvas = this.canvas;
    if (!canvas || typeof document === 'undefined') return;
    if (document.pointerLockElement === canvas) return;
    try {
      const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Pointer lock unavailable (iframe permissions...) : mouse-look still
      // works unlocked via movementX. Ignore silently.
    }
  };

  private exitPointerLock(): void {
    if (typeof document === 'undefined') return;
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      // Ignore.
    }
  }

  public dispose(): void {
    this.exitPointerLock();
    this.detachCanvas();
  }
}
