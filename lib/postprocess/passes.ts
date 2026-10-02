import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import {
  TAAResolveShader,
} from './shaders';

// =========================================================================
// Camera jitter (Halton 2,3) for TAA — applied to projectionMatrix before
// rendering and restored right after the composer finishes.
// =========================================================================

function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

const JITTER_COUNT = 8;
const jitterTable: THREE.Vector2[] = Array.from({ length: JITTER_COUNT }, (_, i) => {
  const v = new THREE.Vector2();
  // Map [0,1) halton to [-0.5, 0.5)
  v.x = halton(i + 1, 2) - 0.5;
  v.y = halton(i + 1, 3) - 0.5;
  return v;
});

export class CameraJitter {
  private frame = 0;
  private saved: THREE.Matrix4 | null = null;

  public apply(camera: THREE.PerspectiveCamera, width: number, height: number): void {
    const j = jitterTable[this.frame % JITTER_COUNT];
    this.frame++;
    this.saved = camera.projectionMatrix.clone();
    const e = camera.projectionMatrix.elements;
    e[8] += (2 * j.x) / Math.max(width, 1);
    e[9] += (2 * j.y) / Math.max(height, 1);
  }

  public restore(): void {
    this.saved = null;
  }

  public restoreIfApplied(camera: THREE.PerspectiveCamera): void {
    if (this.saved) {
      camera.projectionMatrix.copy(this.saved);
      this.saved = null;
    }
  }

  public reset(): void {
    this.frame = 0;
  }
}

// =========================================================================
// GBufferPass — renders view-space normals + depth for depth-based effects.
// needsSwap = false: it only fills its own render targets.
// Skips the sky dome, editor helpers and sensor gizmos.
// =========================================================================

const HIDDEN_NAME_HINTS = ['helper', 'gizmo', '__aether_sky', '__aether_impostor', '__aether_ppv'];

export class GBufferPass extends Pass {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public normalRT: THREE.WebGLRenderTarget;
  public depthTexture: THREE.DepthTexture;
  private normalMaterial: THREE.MeshNormalMaterial;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, width: number, height: number) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;

    this.depthTexture = new THREE.DepthTexture(width, height);
    this.depthTexture.format = THREE.DepthFormat;
    this.depthTexture.type = THREE.UnsignedIntType;
    this.depthTexture.minFilter = THREE.NearestFilter;
    this.depthTexture.magFilter = THREE.NearestFilter;

    this.normalRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      depthTexture: this.depthTexture,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.normalRT.texture.name = 'AetherGBuffer.normal';

    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.normalMaterial.blending = THREE.NoBlending;
  }

  private shouldHide(obj: THREE.Object3D): boolean {
    const ud = obj.userData;
    if (!ud) return false;
    if (ud.isSensor || ud.ignoreRaycast || ud.isEditorOnly || ud.isHelper) return true;
    const name = (obj.name || '').toLowerCase();
    for (const hint of HIDDEN_NAME_HINTS) {
      if (name.includes(hint)) return true;
    }
    return false;
  }

  render(renderer: THREE.WebGLRenderer): void {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.visible && this.shouldHide(obj)) {
        obj.visible = false;
        hidden.push(obj);
      }
    });

    const prevOverride = this.scene.overrideMaterial;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;

    this.scene.overrideMaterial = this.normalMaterial;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.normalRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    this.scene.overrideMaterial = prevOverride;

    for (const obj of hidden) obj.visible = true;
  }

  setSize(width: number, height: number): void {
    this.normalRT.setSize(width, height);
    this.depthTexture.image.width = width;
    this.depthTexture.image.height = height;
    this.depthTexture.needsUpdate = true;
  }

  dispose(): void {
    this.normalRT.dispose();
    this.normalMaterial.dispose();
  }
}

// =========================================================================
// TAAPass — temporal resolve with depth reprojection + neighbourhood clamp.
// Reads tCurrent (readBuffer) + tDepth (GBuffer) + previous history RT,
// writes resolved color to writeBuffer and copies it into history.
// =========================================================================

export class TAAPass extends Pass {
  public uniforms: Record<string, THREE.IUniform>;
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;
  private copyQuad: FullScreenQuad;
  private copyMaterial: THREE.ShaderMaterial;
  private historyRT: THREE.WebGLRenderTarget | null = null;
  private historyDirty = true;

  // matrices managed by AtmosphereManager each frame
  public invViewProj = new THREE.Matrix4();
  public prevViewProj = new THREE.Matrix4();

  constructor() {
    super();

    this.uniforms = THREE.UniformsUtils.clone(TAAResolveShader.uniforms);
    this.material = new THREE.ShaderMaterial({
      name: TAAResolveShader.name,
      uniforms: this.uniforms,
      vertexShader: TAAResolveShader.vertexShader,
      fragmentShader: TAAResolveShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);

    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'AetherTAACopy',
      uniforms: {
        tDiffuse: { value: null },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.copyQuad = new FullScreenQuad(this.copyMaterial);
  }

  public setDepthTexture(tex: THREE.DepthTexture | null): void {
    this.uniforms.tDepth.value = tex;
  }

  public reset(): void {
    this.historyDirty = true;
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    if (!this.historyRT || this.historyRT.width !== readBuffer.width || this.historyRT.height !== readBuffer.height) {
      this.historyRT?.dispose();
      this.historyRT = new THREE.WebGLRenderTarget(readBuffer.width, readBuffer.height, {
        type: THREE.HalfFloatType,
        depthBuffer: false,
      });
      this.historyRT.texture.name = 'AetherTAA.history';
      this.historyDirty = true;
    }

    this.uniforms.tCurrent.value = readBuffer.texture;
    this.uniforms.tHistory.value = this.historyRT.texture;
    this.uniforms.uInvViewProj.value.copy(this.invViewProj);
    this.uniforms.uPrevViewProj.value.copy(this.prevViewProj);
    this.uniforms.reset.value = this.historyDirty ? 1.0 : 0.0;
    this.uniforms.resolution.value.set(readBuffer.width, readBuffer.height);

    renderer.setRenderTarget(writeBuffer);
    renderer.clear();
    this.fsQuad.render(renderer);

    // Persist resolved frame as next frame's history
    this.copyMaterial.uniforms.tDiffuse.value = writeBuffer.texture;
    renderer.setRenderTarget(this.historyRT);
    renderer.clear();
    this.copyQuad.render(renderer);

    this.historyDirty = false;
  }

  setSize(width: number, height: number): void {
    if (this.historyRT) {
      this.historyRT.setSize(width, height);
      this.historyDirty = true;
    }
  }

  dispose(): void {
    this.historyRT?.dispose();
    this.material.dispose();
    this.fsQuad.dispose();
    this.copyMaterial.dispose();
    this.copyQuad.dispose();
  }
}

// =========================================================================
// LUT loader — horizontal strip PNG/JPG: width = size*size, height = size.
// Returns a THREE.Texture configured for non-mipmapped, clamp sampling.
// =========================================================================

export function loadLutTexture(
  url: string,
  onLoad: (tex: THREE.Texture | null, size: number) => void
): void {
  const loader = new THREE.TextureLoader();
  loader.load(
    url,
    (tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;

      const img = tex.image as { width?: number; height?: number };
      const height = img?.height ?? 0;
      const width = img?.width ?? 0;
      if (!height || !width || width < height) {
        // Not a valid strip (needs width = size * height)
        tex.dispose();
        onLoad(null, 0);
        return;
      }
      onLoad(tex, height);
    },
    undefined,
    () => onLoad(null, 0)
  );
}
