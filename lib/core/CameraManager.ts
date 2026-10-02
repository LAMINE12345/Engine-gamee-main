import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ECSWorld } from '../ecs/ECS';
import type { CharacterControllerSystem } from '../physics/CharacterControllerSystem';
import { getWorldPosition } from '../physics/transformSpace';
import { resolveNavAction, type NavAction } from '../input/navigation';
import {
  clampFollowConfig,
  dampPivot,
  dampRigidPose,
  isFollowable,
  type CameraFollowConfig,
  type FollowMode,
  type Vec3Like,
} from './cameraFollow';

/** Vecteurs de travail module-level : updateFollow() tourne chaque frame. */
const _followPos = new THREE.Vector3();
const _followQuat = new THREE.Quaternion();
const _followEuler = new THREE.Euler(0, 0, 0, 'YXZ');

/** Point de visée monde d'un objet, selon la config de suivi courante. */
function pivotOf(obj: THREE.Object3D, config: CameraFollowConfig): THREE.Vector3 {
  return getWorldPosition(obj, _followPos).add(_pivotLift.set(0, config.lookAtHeight, 0));
}
const _pivotLift = new THREE.Vector3();

export type CameraViewPreset =
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'side'
  | 'right'
  | 'left'
  | 'iso';

export interface CameraDeps {
  width: number;
  height: number;
  ecsWorld: ECSWorld;
  characterSystem: CharacterControllerSystem;
  getSelectedObject(): THREE.Object3D | null;
  /** Hauteur cible par défaut quand rien n'est sélectionné (plan de travail + 0.8). */
  getDefaultTargetY(): number;
}

/** Cible de repli pour la secousse quand aucun OrbitControls n'est attaché. */
const _shakeZero = new THREE.Vector3(0, 0, 0);

/**
 * CameraManager — caméra perspective, OrbitControls (édition), vues
 * prédéfinies, focus, et suivi du joueur en Play (troisième / première personne).
 *
 * Les contrôles orbit sont attachés après la création du canvas
 * (voir `attachControls`), car le canvas appartient au RenderPipeline.
 */
export class CameraManager {
  private readonly ecsWorld: ECSWorld;
  private readonly characterSystem: CharacterControllerSystem;
  private readonly deps: CameraDeps;

  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls | null = null;
  /** Nettoyage des écouteurs « navigation Blender » (voir bindBlenderNavigation). */
  private navCleanups: Array<() => void> = [];

  // Rotation manuelle de la caméra en Play (drag souris, clampée).
  private manualCameraYaw = 0;
  private manualCameraPitch = 0;
  private isRotatingCamera = false;
  private lastPointerPos: { x: number; y: number } = { x: 0, y: 0 };

  // -------------------------------------------------------------------------
  // Suivi d'un objet assigné (éditeur + Play)
  // -------------------------------------------------------------------------

  /** Cible suivie, ou null si la caméra est libre. */
  private followTarget: THREE.Object3D | null = null;
  private followConfig: CameraFollowConfig = clampFollowConfig();
  private followMode: FollowMode = 'pivot';
  /** Pivot lissé en cours (évite le saquin à chaque frame). */
  private followPivot: THREE.Vector3 = new THREE.Vector3();

  /** Secousse en cours : amplitude 0..1 et durée restante (s). */
  private shakeIntensity = 0;
  private shakeDuration = 0;

  constructor(deps: CameraDeps) {
    this.deps = deps;
    this.ecsWorld = deps.ecsWorld;
    this.characterSystem = deps.characterSystem;

    this.camera = new THREE.PerspectiveCamera(60, deps.width / deps.height, 0.1, 1000);
    this.camera.position.set(3, 3, 5);
    this.camera.lookAt(0, 0, 0);
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  // -------------------------------------------------------------------------
  // Suivi d'un objet assigné
  // -------------------------------------------------------------------------

  /**
   * Assigne (ou libère avec `null`) la cible suivie par la caméra.
   *
   * Refuse une cible inexploitable (objet masqué, plan d'eau, absent) : mieux
   * vaut refuser l'assignation que laisser la caméra fixer un point mort.
   */
  public setFollowTarget(obj: THREE.Object3D | null, config?: Partial<CameraFollowConfig>): boolean {
    if (obj && !isFollowable(obj)) return false;
    this.followTarget = obj;
    if (config) this.followConfig = clampFollowConfig({ ...this.followConfig, ...config });
    if (obj) {
      // Recalage immédiat du pivot : la caméra ne doit pas « rattraper » la
      // cible depuis l'ancienne position lors de l'assignation.
      this.followPivot.copy(pivotOf(obj, this.followConfig));
    }
    return true;
  }

  public getFollowTarget(): THREE.Object3D | null {
    return this.followTarget;
  }

  /** Renvoie une COPIE : le caller ne doit pas pouvoir muter l'état interne. */
  public getFollowConfig(): CameraFollowConfig {
    return { ...this.followConfig };
  }

  /** Applique une config partielle (bornée et validée). */
  public setFollowConfig(config: Partial<CameraFollowConfig>): void {
    this.followConfig = clampFollowConfig({ ...this.followConfig, ...config });
  }

  public isFollowing(): boolean {
    return this.followTarget !== null;
  }

  /** Le suivi est-il actuellement actif (cible valide ET assignée) ? */
  public isFollowActive(): boolean {
    return this.followTarget !== null && isFollowable(this.followTarget);
  }

  /**
   * Bascule de mode ('pivot' en édition, 'rigid' en Play).
   *
   * On recalcule le pivot de référence à chaque bascule : sans cela, le pivot
   * conserve la position de l'ancien mode et le premier update voit un écart
   * énorme — la caméra fait un saut visible au moment du changement.
   */
  public setFollowMode(mode: FollowMode): void {
    if (mode === this.followMode) return;
    this.followMode = mode;
    if (this.followTarget) {
      this.followPivot.copy(pivotOf(this.followTarget, this.followConfig));
    }
  }

  public getFollowMode(): FollowMode {
    return this.followMode;
  }

  /**
   * Impose une position de caméra trainée (nœud SlowFollow).
   *
   * Appelée par le runtime APRÈS `updateFollow()` : le lissage a déjà replacé
   * la caméra sur sa position collée, c'est ici qu'on lui rend son retard. Si
   * elle était appliquée avant, le suivi rigide l'écraserait à la frame
   * suivante et le nœud serait sans effet.
   */
  public applyTrailingPosition(p: { x: number; y: number; z: number }): void {
    this.camera.position.set(p.x, p.y, p.z);
    // Le pivot doit suivre, sinon OrbitControls ré-ancre la caméra dessus à la
    // frame suivante et on verrait un à-coup.
    if (this.orbitControls) {
      this.orbitControls.target.set(p.x, p.y, p.z);
    }
  }

  /**
   * Secousse d'écran (tremblement de caméra / rumble).
   *
   * `intensity` 0..1, appliqué comme un décalage aléatoire de la POSITION de
   * la caméra. L'amplitude est proportionnelle à la distance caméra/cible : à
   * distance constante, l'angle apparent de la secousse reste le même (sinon
   * un zoom avant rendrait le tremblement invisible).
   *
   * Le bruit est régénéré à chaque appel : un motif fixe se lirait comme un
   * défaut, pas comme un impact.
   */
  public shake(intensity: number, duration: number): void {
    if (intensity <= 0 || duration <= 0) {
      this.shakeIntensity = 0;
      return;
    }
    // Un tremblement déjà plus fort n'est pas coupé par un plus faible.
    this.shakeIntensity = Math.max(this.shakeIntensity, Math.min(1, intensity));
    this.shakeDuration = Math.max(this.shakeDuration, duration);
  }

  /**
   * Applique la secousse au rendu. À appeler APRÈS `updateFollow()` (qui
   * repositionne la caméra) et avant le rendu, sinon la secousse est écrasée
   * par le suivi de la frame.
   */
  public applyShake(dt: number): void {
    if (this.shakeIntensity <= 0) return;

    const dist = this.camera.position.distanceTo(this.orbitControls?.target ?? _shakeZero);
    const amp = this.shakeIntensity * 0.35 * Math.max(1, dist * 0.15);
    this.camera.position.x += (Math.random() * 2 - 1) * amp;
    this.camera.position.y += (Math.random() * 2 - 1) * amp;
    this.camera.position.z += (Math.random() * 2 - 1) * amp;

    this.shakeDuration -= dt;
    if (this.shakeDuration <= 0) {
      this.shakeIntensity = 0;
      this.shakeDuration = 0;
    }
  }

  /**
   * Avance le suivi d'une frame.
   *
   * - mode `pivot` : déplace le point de visée des OrbitControls vers l'objet.
   *   La caméra n'est PAS forcée : l'utilisateur garde l'orbite et le zoom,
   *   ce qui est le comportement attendu d'un éditeur.
   * - mode `rigid` : place la caméra à l'offset configuré, comme la
   *   troisième personne du joueur.
   *
   * Retourne true si un suivi a été appliqué cette frame.
   */
  public updateFollow(dt: number): boolean {
    const target = this.followTarget;
    if (!target || !isFollowable(target)) return false;

    // Espace MONDE : la cible peut être enfant d'un groupe ou d'un prefab.
    const worldPos = getWorldPosition(target, _followPos);
    const asVec3: Vec3Like = { x: worldPos.x, y: worldPos.y, z: worldPos.z };

    if (this.followMode === 'pivot') {
      const next = dampPivot(
        { x: this.followPivot.x, y: this.followPivot.y, z: this.followPivot.z },
        asVec3,
        this.followConfig,
        dt
      );
      // OrbitControls est purement RELATIF : `update()` recalcule la caméra
      // comme `target + offset`, où l'offset est relu de la position courante
      // à chaque frame. Déplacer `target` seul fait donc pivoter la vue sur
      // place, la caméra ne suit PAS l'objet. Il faut donc translater la
      // caméra du même delta que le pivot — c'est ce qui donne un vrai
      // suivi tout en laissant l'utilisateur orbiter et zoomer librement.
      this.camera.position.x += next.x - this.followPivot.x;
      this.camera.position.y += next.y - this.followPivot.y;
      this.camera.position.z += next.z - this.followPivot.z;
      this.followPivot.set(next.x, next.y, next.z);

      if (this.orbitControls) {
        this.orbitControls.target.copy(this.followPivot);
      } else {
        this.camera.lookAt(this.followPivot);
      }
      return true;
    }

    // Rigide : yaw monde de l'objet (il peut être imbriqué, d'où le quaternion).
    target.getWorldQuaternion(_followQuat);
    _followEuler.setFromQuaternion(_followQuat, 'YXZ');
    const pose = dampRigidPose(
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      asVec3,
      _followEuler.y,
      this.followConfig,
      dt
    );
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.followPivot.set(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    this.camera.lookAt(this.followPivot);
    if (this.orbitControls) this.orbitControls.target.copy(this.followPivot);
    return true;
  }

  /**
   * Recentre la caméra sur la cible selon la config courante (bouton
   * « Cadrer la cible ») : instantané, sans lissage.
   */
  public frameFollowTarget(): boolean {
    const target = this.followTarget;
    if (!target || !isFollowable(target)) return false;
    const worldPos = getWorldPosition(target, _followPos);
    target.getWorldQuaternion(_followQuat);
    _followEuler.setFromQuaternion(_followQuat, 'YXZ');

    const lookAt = pivotOf(target, this.followConfig);
    this.followPivot.copy(lookAt);
    if (this.orbitControls) {
      this.orbitControls.target.copy(lookAt);
      // On garde l'orientation courante : un recadrage ne doit pas
      // téléporter la caméra sur un autre côté de la cible.
      const dir = this.camera.position.clone().sub(lookAt);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0.7, 1);
      dir.normalize();
      const dist = THREE.MathUtils.clamp(
        this.followConfig.distance,
        this.followConfig.minDistance,
        this.followConfig.maxDistance
      );
      this.camera.position.copy(lookAt).addScaledVector(dir, dist);
      this.orbitControls.update();
    } else {
      this.camera.lookAt(lookAt);
    }
    return true;
  }

  /**
   * Crée les OrbitControls une fois le canvas du RenderPipeline disponible.
   *
   * Réglage « façon Blender » : le clic gauche appartient aux outils (il ne
   * fait donc plus orbiter — c'était la source n°1 d'accidents de sélection),
   * le clic droit au menu contextuel, et la navigation passe par la molette.
   */
  public attachControls(domElement: HTMLElement): void {
    const controls = new OrbitControls(this.camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    // Blender autorise l'orbite complète, y compris passer sous le sol.
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minDistance = 0.5;
    controls.maxDistance = 200;
    // Pan en espace écran (comme Blender) : le décor ne « penche » pas.
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.85;
    controls.panSpeed = 1;
    controls.zoomSpeed = 1.1;
    // LEFT/RIGHT à null : plus de dérive orbitale sur un clic gauche (sélection)
    // ni sur un clic droit (menu contextuel). MIDDLE est remappé à chaque appui
    // par bindBlenderNavigation() selon les modificateurs.
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };

    this.orbitControls = controls;
    this.bindBlenderNavigation(domElement);
    controls.update();
  }

  /**
   * Navigation souris façon Blender, posée sur le canvas :
   *
   *  - `pointerdown` en phase de capture remappe `mouseButtons` selon Maj/Ctrl
   *    (OrbitControls ne lit pas les modificateurs) — et se réinitialise sur
   *    `pointerup` pour ne rien laisser d'actif entre deux gestes ;
   *  - Ctrl+molette fait un dolly (comme Blender) au lieu de zoomer la page ;
   *  - `auxclick` coupe l'autoscroll des navigateurs (MWM) ;
   *  - `contextmenu` coupe le menu natif, le nôtre prend le relais.
   */
  private bindBlenderNavigation(domElement: HTMLElement): void {
    // OrbitControls r186 teste lui-même les modificateurs dans `onMouseDown` :
    //   · MOUSE.ROTATE + Maj/Ctrl  → bascule sur le PAN ;
    //   · MOUSE.PAN    + Maj/Ctrl  → rebascule sur le ROTATE (aller-retour) ;
    //   · MOUSE.DOLLY              → aucun test de modificateur.
    // Il faut donc laisser passer Maj pour obtenir le pan, et passer par DOLLY
    // pour imposer le zoom sous Ctrl.
    const MOUSE_BY_ACTION: Record<NavAction, THREE.MOUSE | null> = {
      orbit: THREE.MOUSE.ROTATE,
      pan: THREE.MOUSE.ROTATE, // Maj fait basculer OrbitControls sur le pan
      zoom: THREE.MOUSE.DOLLY, // seul moyen d'imposer le zoom sous Ctrl
      none: null, // LMB nu = outils, RMB = menu contextuel
    };

    const onPointerDown = (e: PointerEvent) => {
      const controls = this.orbitControls;
      if (!controls) return;
      if (e.pointerType !== 'mouse') return;
      const action = resolveNavAction({
        button: e.button,
        pointerType: e.pointerType,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      });
      controls.mouseButtons.MIDDLE = MOUSE_BY_ACTION[action];
      controls.mouseButtons.LEFT = MOUSE_BY_ACTION[action];
    };

    const onPointerUp = (e: PointerEvent) => {
      const controls = this.orbitControls;
      if (!controls || e.pointerType !== 'mouse') return;
      controls.mouseButtons.LEFT = null;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    };

    const onWheel = (e: WheelEvent) => {
      const controls = this.orbitControls;
      if (!controls || !controls.enabled) return;
      if (!e.ctrlKey && !e.metaKey) return; // molette nue : gérée par OrbitControls
      // Empêche le zoom de page du navigateur, et dolly comme Blender.
      e.preventDefault();
      const offset = this.camera.position.clone().sub(controls.target);
      const dist = offset.length();
      if (dist < 1e-4) return;
      const next = THREE.MathUtils.clamp(
        dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1),
        controls.minDistance,
        controls.maxDistance
      );
      this.camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
      controls.update();
    };

    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault(); // pas d'autoscroll MWM
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // Capture : doit passer AVANT le pointerdown d'OrbitControls.
    domElement.addEventListener('pointerdown', onPointerDown, true);
    domElement.addEventListener('pointerup', onPointerUp, true);
    domElement.addEventListener('wheel', onWheel, { passive: false, capture: true });
    domElement.addEventListener('auxclick', onAuxClick);
    domElement.addEventListener('contextmenu', onContextMenu);

    this.navCleanups = [
      () => domElement.removeEventListener('pointerdown', onPointerDown, true),
      () => domElement.removeEventListener('pointerup', onPointerUp, true),
      () => domElement.removeEventListener('wheel', onWheel, true),
      () => domElement.removeEventListener('auxclick', onAuxClick),
      () => domElement.removeEventListener('contextmenu', onContextMenu),
    ];
  }

  public setOrbitEnabled(enabled: boolean): void {
    if (this.orbitControls) {
      this.orbitControls.enabled = enabled;
    }
  }

  public updateOrbit(): void {
    // En mode RIGIDE, la pose de la caméra est calculée par updateFollow()
    // (offset fixe derrière l'objet). OrbitControls.update() est purement
    // relatif — il recalcule `position = target + offset` en relisant l'offset
    // courant — et écraserait donc cette pose à chaque frame, ramenant la
    // caméra derrière l'objet même après une rotation. En Play l'orbite est
    // déjà désactivée, mais en édition updateOrbit tourne toujours : d'où ce
    // garde ici plutôt qu'un simple `enabled = false` côté appelant.
    if (this.followMode === 'rigid' && this.isFollowActive()) return;
    this.orbitControls?.update();
  }

  // -------------------------------------------------------------------------
  // Focus / vues prédéfinies / reset
  // -------------------------------------------------------------------------

  public focusOnObject(obj: THREE.Object3D | null): void {
    if (!obj || !this.orbitControls) return;
    this.frameBox(new THREE.Box3().setFromObject(obj));
  }

  /**
   * Cadre toute la scène (touche `Home` de Blender) en conservant la
   * direction de vue courante, pour ne pas désorienter l'utilisateur.
   */
  public frameAll(objects: Iterable<THREE.Object3D>): void {
    if (!this.orbitControls) return;

    const box = new THREE.Box3();
    for (const obj of objects) {
      if (obj.visible) box.expandByObject(obj);
    }
    if (box.isEmpty()) {
      this.resetCamera();
      return;
    }
    this.frameBox(box);
  }

  /**
   * Recule la caméra juste assez pour que `box` tienne dans le champ, en
   * gardant l'orientation courante (ou une vue iso si la caméra est sur le
   * point de visée).
   */
  private frameBox(box: THREE.Box3): void {
    const controls = this.orbitControls;
    if (!controls) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.5) * 0.5;

    // Distance nécessaire pour faire tenir la sphère englobante, en
    // tenant compte de l'aspect ratio (une scène large ne rentre pas de face).
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) * 0.5;
    const aspect = Math.max(this.camera.aspect, 0.1);
    const distV = radius / Math.tan(halfFov);
    const distH = radius / (Math.tan(halfFov) * aspect);
    const dist = THREE.MathUtils.clamp(
      Math.max(distV, distH) * 1.35,
      controls.minDistance,
      controls.maxDistance
    );

    const dir = this.camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.8, 1);
    dir.normalize();

    controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    controls.update();
  }

  public resetCamera(): void {
    this.camera.position.set(3, 3, 5);
    if (this.orbitControls) {
      this.orbitControls.target.set(0, 0, 0);
      this.orbitControls.update();
    }
    this.camera.lookAt(0, 0, 0);
  }

  public setCameraView(view: CameraViewPreset): void {
    if (!this.orbitControls) return;
    const dist = 12;
    const selected = this.deps.getSelectedObject();
    const target = selected
      ? selected.position.clone()
      : new THREE.Vector3(0, this.deps.getDefaultTargetY(), 0);

    this.orbitControls.target.copy(target);

    switch (view) {
      case 'top':
        this.camera.position.set(target.x, target.y + dist, target.z + 0.001);
        break;
      case 'bottom':
        this.camera.position.set(target.x, target.y - dist, target.z + 0.001);
        break;
      case 'front':
        this.camera.position.set(target.x, target.y, target.z + dist);
        break;
      case 'back':
        this.camera.position.set(target.x, target.y, target.z - dist);
        break;
      case 'side':
      case 'right':
        this.camera.position.set(target.x + dist, target.y, target.z);
        break;
      case 'left':
        this.camera.position.set(target.x - dist, target.y, target.z);
        break;
      case 'iso':
      default:
        this.camera.position.set(target.x + 7, target.y + 5.5, target.z + 7.5);
        break;
    }
    this.orbitControls.update();
  }

  public handleResize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------------------
  // Rotation manuelle en Play (drag souris)
  // -------------------------------------------------------------------------

  public beginPlayRotate(x: number, y: number): void {
    this.isRotatingCamera = true;
    this.lastPointerPos = { x, y };
  }

  public updatePlayRotate(x: number, y: number): void {
    if (!this.isRotatingCamera) return;
    const deltaX = x - this.lastPointerPos.x;
    const deltaY = y - this.lastPointerPos.y;
    this.lastPointerPos = { x, y };

    this.manualCameraYaw = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.manualCameraYaw - deltaX * 0.005));
    this.manualCameraPitch = Math.max(-Math.PI / 3.2, Math.min(Math.PI / 3.2, this.manualCameraPitch - deltaY * 0.005));
  }

  public endPlayRotate(): void {
    this.isRotatingCamera = false;
  }

  public get isPlayRotating(): boolean {
    return this.isRotatingCamera;
  }

  /** Réinitialise l'état de rotation à chaque entrée en Play. */
  public resetPlayState(): void {
    this.manualCameraYaw = 0;
    this.manualCameraPitch = 0;
    this.isRotatingCamera = false;
  }

  // -------------------------------------------------------------------------
  // Suivi du joueur (appelé chaque frame en Play)
  // -------------------------------------------------------------------------

  /**
   * Suit le joueur en troisième personne (ou désactive l'orbit en première
   * personne, gérée par le character system). Retourne true si la caméra
   * suit activement le joueur.
   */
  public updateFollowCamera(dt: number): boolean {
    if (!this.orbitControls) return false;

    const entities = this.ecsWorld.getAllEntities();
    const playerEntity = entities.find(
      (e) =>
        e.active && (
          e.object3D?.userData?.subType === 'player' ||
          e.hasComponent('CharacterController') ||
          e.name.toLowerCase().includes('player')
        )
    );

    if (!playerEntity || !playerEntity.object3D) return false;

    const charComp = playerEntity.getComponent<any>('CharacterController');
    const mode = charComp?.mode || 'thirdPerson';

    if (mode === 'thirdPerson') {
      const playerObj = playerEntity.object3D;
      // Espace monde : le joueur peut être enfant d'un groupe.
      const targetPos = getWorldPosition(playerObj, new THREE.Vector3());

      // Get customizable camera properties
      const camDist = charComp?.cameraDistance !== undefined ? charComp.cameraDistance : 6.0;
      const camHeight = charComp?.cameraHeight !== undefined ? charComp.cameraHeight : 3.5;
      const camOffsetX = charComp?.cameraOffsetX !== undefined ? charComp.cameraOffsetX : 0.0;
      const lerpSpeed = charComp?.cameraLerpSpeed !== undefined ? charComp.cameraLerpSpeed : 10.0;

      // Mouse-look Yaw: the player faces the orbit yaw and the follow
      // camera stays behind him. Otherwise the classic fixed-behind offset.
      const charSystem = this.characterSystem;
      const mouseYawOn = charSystem.input.mouse.enabled;
      let offset: THREE.Vector3;
      if (mouseYawOn) {
        if (charSystem.cameraYaw === null) {
          charSystem.cameraYaw = playerObj.rotation.y;
          charSystem.cameraYawBase = playerObj.rotation.y;
        }
        const yaw = charSystem.cameraYaw;
        playerObj.rotation.y = yaw;
        const s = Math.sin(yaw);
        const c = Math.cos(yaw);
        offset = new THREE.Vector3(
          camOffsetX * c + -camDist * s,
          camHeight,
          -camOffsetX * s + -camDist * c
        );
      } else {
        offset = new THREE.Vector3(camOffsetX, camHeight, -camDist);
      }
      const desiredCameraPos = targetPos.clone().add(offset);

      // Smooth lerp camera position
      const lerpFactor = 1.0 - Math.exp(-lerpSpeed * dt);
      this.camera.position.lerp(desiredCameraPos, lerpFactor);
      this.camera.lookAt(targetPos.clone().add(new THREE.Vector3(0, 1.2, 0)));

      this.orbitControls.enabled = false;
      return true;
    }

    // In firstPerson mode, character system handles camera placement (at eye level)
    this.orbitControls.enabled = false;
    return true;
  }

  public dispose(): void {
    this.followTarget = null;
    for (const cleanup of this.navCleanups) cleanup();
    this.navCleanups = [];
    this.orbitControls?.dispose();
    this.orbitControls = null;
  }
}
