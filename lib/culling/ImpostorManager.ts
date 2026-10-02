import * as THREE from 'three';
import { normalizeLODConfig, DEFAULT_LOD_CONFIG } from '../../types/culling';
import type { LODGlobalConfig } from '../../types/culling';
import { isImpostorEligible, meshRadius, meshCenter } from './cullingUtils';

interface ImpostorReg {
  uuid: string;
  billboardDistance: number;
  active: boolean;
  sprite: THREE.Sprite | null;
  texture: THREE.CanvasTexture | null;
  canvas: HTMLCanvasElement | null;
  /** Direction caméra→centre normalisée au moment de la capture. */
  captureDir: THREE.Vector3 | null;
  captureCenter: THREE.Vector3 | null;
  lastCaptureAt: number;
}

export interface ImpostorManagerDeps {
  objects: Map<string, THREE.Object3D>;
  scene: THREE.Scene;
  /** Rayon max LOD du maillage (0 si aucun) — fourni par SceneManager/LODManager. */
  getLastLodDistance: (uuid: string) => number;
  /** true si l'objet est actuellement masqué par l'occlusion culling. */
  isOccluded: (uuid: string) => boolean;
}

const RECAPTURE_ANGLE = 0.5; // ~30°
const RECAPTURE_COOLDOWN_MS = 500;
const SCAN_EVERY_FRAMES = 120;

/**
 * ImpostorManager — niveau billboard final du LOD (3.4).
 *
 * Au-delà de `billboardDistance`, le maillage est remplacé par un Sprite
 * caméra-facing texturé d'une capture temps réel (rendu isolé 128 px).
 * Re-capture throttlée (1/frame max) quand l'angle de vue change > 30°.
 * Les sprites sont runtime-only : jamais dans le registre `objects`,
 * `raycast` neutralisé, jamais exportés.
 */
export class ImpostorManager {
  public config: LODGlobalConfig = { ...DEFAULT_LOD_CONFIG };

  private readonly objects: Map<string, THREE.Object3D>;
  private readonly scene: THREE.Scene;
  private readonly getLastLodDistance: (uuid: string) => number;
  private readonly isOccluded: (uuid: string) => boolean;
  private readonly regs = new Map<string, ImpostorReg>();

  private readonly rt: THREE.WebGLRenderTarget;
  private readonly captureCam: THREE.PerspectiveCamera;
  private pixelBuffer: Uint8Array;
  private readonly tmpCenter = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpBox = new THREE.Box3();
  private frameCounter = 0;

  constructor(deps: ImpostorManagerDeps) {
    this.objects = deps.objects;
    this.scene = deps.scene;
    this.getLastLodDistance = deps.getLastLodDistance;
    this.isOccluded = deps.isOccluded;
    const size = this.config.impostorCaptureSize;
    this.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    this.captureCam = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    this.pixelBuffer = new Uint8Array(size * size * 4);
  }

  public applyConfig(data?: Partial<LODGlobalConfig> | null): void {
    const wasEnabled = this.config.billboardEnabled;
    this.config = normalizeLODConfig(data ?? this.config);
    const size = this.config.impostorCaptureSize;
    if (this.rt.width !== size) {
      this.rt.setSize(size, size);
      this.pixelBuffer = new Uint8Array(size * size * 4);
      // Les canvas existants sont régénérés à la prochaine capture.
      for (const reg of this.regs.values()) {
        reg.canvas = null;
        if (reg.texture) {
          reg.texture.dispose();
          reg.texture = null;
        }
        if (reg.sprite) {
          (reg.sprite.material as THREE.SpriteMaterial).map = null;
        }
      }
    }
    if (wasEnabled && !this.config.billboardEnabled) this.restoreAll();
  }

  // -------------------------------------------------------------------------
  // Boucle
  // -------------------------------------------------------------------------

  public update(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void {
    if (!this.config.billboardEnabled) return;
    this.frameCounter++;
    if (this.frameCounter % SCAN_EVERY_FRAMES === 0) this.scan();
    let capturedThisFrame = false;
    for (const reg of this.regs.values()) {
      const obj = this.objects.get(reg.uuid);
      if (!obj || !(obj instanceof THREE.Mesh)) {
        this.unregister(reg.uuid);
        continue;
      }
      meshCenter(obj, this.tmpCenter);
      const radius = meshRadius(obj);
      if (radius <= 0) continue;
      const dist = Math.max(0, camera.position.distanceTo(this.tmpCenter) - radius);
      const far = reg.active
        ? dist > reg.billboardDistance * 0.9
        : dist > reg.billboardDistance * 1.1;
      if (far && !reg.active) {
        if (this.activate(reg, obj, camera, renderer, capturedThisFrame)) {
          capturedThisFrame = true;
        }
      } else if (far && reg.active) {
        if (!capturedThisFrame && this.needsRecapture(reg, obj, camera)) {
          if (this.capture(reg, obj, camera, renderer)) capturedThisFrame = true;
        }
        this.applyFarVisibility(reg, obj);
      } else if (!far && reg.active) {
        this.deactivate(reg, obj);
      }
    }
  }

  // -------------------------------------------------------------------------
  // (Dé)activation
  // -------------------------------------------------------------------------

  /** Retourne true si une capture a eu lieu (budget 1/frame). */
  private activate(
    reg: ImpostorReg,
    obj: THREE.Mesh,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    skipCapture: boolean
  ): boolean {
    let captured = false;
    if (!reg.texture && !skipCapture) {
      captured = this.capture(reg, obj, camera, renderer);
      if (!captured) return false;
    }
    if (!reg.texture) return false;
    reg.active = true;
    this.applyFarVisibility(reg, obj);
    return captured;
  }

  /** Maillage caché, sprite affiché (sauf si occlus : les deux cachés). */
  private applyFarVisibility(reg: ImpostorReg, obj: THREE.Object3D): void {
    const occluded = this.isOccluded(reg.uuid);
    obj.visible = false;
    if (reg.sprite) {
      if (reg.sprite.parent !== this.scene) this.scene.add(reg.sprite);
      reg.sprite.visible = !occluded;
    }
  }

  private deactivate(reg: ImpostorReg, obj: THREE.Object3D): void {
    reg.active = false;
    if (reg.sprite) reg.sprite.visible = false;
    // L'occlusion culling ré-appliquera visible=false le cas échéant ;
    // on restaure sauf si l'objet est marqué occlus.
    if (!this.isOccluded(reg.uuid)) obj.visible = true;
  }

  /** Restaure les maillages (désactivation globale / clear). */
  public restoreAll(): void {
    for (const reg of this.regs.values()) {
      const obj = this.objects.get(reg.uuid);
      if (reg.sprite) reg.sprite.visible = false;
      if (obj && !this.isOccluded(reg.uuid)) obj.visible = true;
      reg.active = false;
    }
  }

  // -------------------------------------------------------------------------
  // Capture d'impostor (rendu isolé → texture)
  // -------------------------------------------------------------------------

  private needsRecapture(
    reg: ImpostorReg,
    obj: THREE.Object3D,
    camera: THREE.PerspectiveCamera
  ): boolean {
    if (!reg.captureDir || !reg.captureCenter) return true;
    if (performance.now() - reg.lastCaptureAt < RECAPTURE_COOLDOWN_MS) return false;
    meshCenter(obj, this.tmpCenter);
    if (reg.captureCenter.distanceTo(this.tmpCenter) > meshRadius(obj) * 0.5) return true;
    this.tmpDir.copy(camera.position).sub(this.tmpCenter).normalize();
    return reg.captureDir.angleTo(this.tmpDir) > RECAPTURE_ANGLE;
  }

  private capture(
    reg: ImpostorReg,
    obj: THREE.Mesh,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer
  ): boolean {
    // Isoler la cible : masque tout sauf son sous-arbre (+ ciel masqué aussi,
    // fond transparent => le sprite se fond dans le vrai ciel au rendu).
    const hidden: THREE.Object3D[] = [];
    const prevTargetVisible: { o: THREE.Object3D; v: boolean }[] = [];
    const prevBackground = this.scene.background;
    const prevTarget = renderer.getRenderTarget();
    try {
      meshCenter(obj, this.tmpCenter);
      const radius = Math.max(meshRadius(obj), 0.5);
      const size = this.config.impostorCaptureSize;

      const targetSet = new Set<string>();
      obj.traverse((o) => targetSet.add(o.uuid));
      this.scene.traverse((o) => {
        const renderable =
          (o as THREE.Mesh).isMesh ||
          (o as THREE.Sprite).isSprite ||
          (o as THREE.Points).isPoints ||
          (o as THREE.Line).isLine;
        if (!renderable) return;
        if (targetSet.has(o.uuid)) {
          prevTargetVisible.push({ o, v: o.visible });
          o.visible = true;
          return;
        }
        if (o.visible) {
          hidden.push(o);
          o.visible = false;
        }
      });
      this.scene.background = null;

      this.captureCam.position.copy(camera.position);
      this.captureCam.quaternion.copy(camera.quaternion);
      const camFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 40;
      this.captureCam.fov = camFov;
      this.captureCam.aspect = 1;
      this.captureCam.near = Math.max(0.1, camera.position.distanceTo(this.tmpCenter) - radius * 4);
      this.captureCam.far = camera.position.distanceTo(this.tmpCenter) + radius * 8;
      this.captureCam.updateProjectionMatrix();

      renderer.setRenderTarget(this.rt);
      renderer.render(this.scene, this.captureCam);
      renderer.readRenderTargetPixels(this.rt, 0, 0, size, size, this.pixelBuffer);
    } catch (err) {
      console.warn('Impostor : capture impossible.', err);
      return false;
    } finally {
      // Restore scène dans tous les cas (jamais de scène à moitié masquée).
      for (const o of hidden) o.visible = true;
      for (const { o, v } of prevTargetVisible) o.visible = v;
      this.scene.background = prevBackground;
      renderer.setRenderTarget(prevTarget);
    }

    try {
      const size = this.config.impostorCaptureSize;
      // Flip Y → canvas dédié (un par impostor, jamais partagé).
      if (!reg.canvas || reg.canvas.width !== size) {
        reg.canvas = document.createElement('canvas');
        reg.canvas.width = size;
        reg.canvas.height = size;
      }
      const ctx = reg.canvas.getContext('2d');
      if (!ctx) return false;
      const img = ctx.createImageData(size, size);
      const rowBytes = size * 4;
      for (let y = 0; y < size; y++) {
        const src = (size - 1 - y) * rowBytes;
        img.data.set(this.pixelBuffer.subarray(src, src + rowBytes), y * rowBytes);
      }
      ctx.putImageData(img, 0, 0);

      if (!reg.texture) {
        reg.texture = new THREE.CanvasTexture(reg.canvas);
        reg.texture.colorSpace = THREE.SRGBColorSpace;
        reg.texture.minFilter = THREE.LinearFilter;
        reg.texture.generateMipmaps = false;
        if (reg.sprite) {
          (reg.sprite.material as THREE.SpriteMaterial).map = reg.texture;
          (reg.sprite.material as THREE.SpriteMaterial).needsUpdate = true;
        }
      } else {
        reg.texture.needsUpdate = true;
      }
      if (!reg.sprite) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: reg.texture,
            transparent: true,
            depthWrite: false,
          })
        );
        sprite.name = `__AETHER_IMPOSTOR__${reg.uuid.slice(0, 8)}`;
        // Neutralise tout raycast (autofocus DoF, audio occlusion, picking).
        sprite.raycast = () => {};
        reg.sprite = sprite;
      }
      // Cadrer le sprite sur la boîte monde (mieux qu'une sphère pour les bâtiments).
      this.tmpBox.setFromObject(obj);
      const dims = this.tmpBox.getSize(new THREE.Vector3());
      const center = this.tmpBox.getCenter(new THREE.Vector3());
      reg.sprite.position.copy(center);
      reg.sprite.scale.set(Math.max(dims.x, 0.5), Math.max(dims.y, 0.5), 1);
      reg.sprite.updateMatrixWorld(true);

      this.tmpDir.copy(camera.position).sub(this.tmpCenter).normalize();
      reg.captureDir = this.tmpDir.clone();
      reg.captureCenter = this.tmpCenter.clone();
      reg.lastCaptureAt = performance.now();
      return true;
    } catch (err) {
      console.warn('Impostor : capture impossible.', err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Registre
  // -------------------------------------------------------------------------

  /** Balaye les maillages solides éligibles (rayon ≥ min, non enregistrés). */
  public scan(): void {
    for (const obj of this.objects.values()) {
      if (!(obj instanceof THREE.Mesh)) continue;
      if (this.regs.has(obj.uuid)) continue;
      if (!isImpostorEligible(obj)) continue;
      const geo = obj.geometry as THREE.BufferGeometry | undefined;
      if (!geo?.attributes.position) continue;
      const radius = meshRadius(obj);
      if (radius < this.config.impostorMinRadius) continue;
      const lodMax = this.getLastLodDistance(obj.uuid);
      this.regs.set(obj.uuid, {
        uuid: obj.uuid,
        billboardDistance:
          lodMax > 0
            ? lodMax * this.config.billboardFactor
            : this.config.billboardFallbackDistance,
        active: false,
        sprite: null,
        texture: null,
        canvas: null,
        captureDir: null,
        captureCenter: null,
        lastCaptureAt: 0,
      });
    }
    // Purge les disparus.
    for (const uuid of [...this.regs.keys()]) {
      if (!this.objects.has(uuid)) this.unregister(uuid);
    }
  }

  public isFar(uuid: string): boolean {
    return this.regs.get(uuid)?.active ?? false;
  }

  public getSprite(uuid: string): THREE.Sprite | undefined {
    return this.regs.get(uuid)?.sprite ?? undefined;
  }

  public unregister(uuid: string): void {
    const reg = this.regs.get(uuid);
    if (!reg) return;
    if (reg.sprite) {
      this.scene.remove(reg.sprite);
      (reg.sprite.material as THREE.Material | undefined)?.dispose();
      reg.sprite = null;
    }
    if (reg.texture) {
      reg.texture.dispose();
      reg.texture = null;
    }
    const obj = this.objects.get(uuid);
    if (obj && !this.isOccluded(uuid)) obj.visible = true;
    this.regs.delete(uuid);
  }

  public clear(): void {
    for (const uuid of [...this.regs.keys()]) {
      const reg = this.regs.get(uuid);
      if (reg?.sprite) {
        this.scene.remove(reg.sprite);
        (reg.sprite.material as THREE.Material | undefined)?.dispose();
      }
      reg?.texture?.dispose();
      const obj = this.objects.get(uuid);
      if (obj) obj.visible = true;
    }
    this.regs.clear();
  }

  public dispose(): void {
    this.clear();
    this.rt.dispose();
  }

  public getStats(): { impostors: number; active: number; captures: number } {
    let active = 0;
    let captures = 0;
    for (const r of this.regs.values()) {
      if (r.active) active++;
      if (r.texture) captures++;
    }
    return { impostors: this.regs.size, active, captures };
  }
}
