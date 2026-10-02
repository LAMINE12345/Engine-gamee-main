import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { PostProcessingData, RenderMode } from '../../types/engine';
import type { ToonMaterialSystem } from '../ecs/ToonMaterialSystem';
import { ToonMaterialSystem as ToonSystem } from '../ecs/ToonMaterialSystem';

export interface RenderPipelineDeps {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Registre partagé des objets (pour les modes de rendu). */
  objects: Map<string, THREE.Object3D>;
  toonMaterialSystem: ToonMaterialSystem;
}

export interface RenderStats {
  triangles: number;
  drawCalls: number;
}

/**
 * RenderPipeline — renderer WebGL, canvas, post-processing
 * (RenderPass + Bloom + FXAA), modes de rendu (shaded/wireframe/normals)
 * et statistiques de rendu.
 */
export class RenderPipeline {
  private readonly container: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly objects: Map<string, THREE.Object3D>;
  private readonly toonMaterialSystem: ToonMaterialSystem;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private fxaaPass: ShaderPass;

  private renderMode: RenderMode = 'shaded';

  // Override materials for render modes
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly originalMaterials = new Map<string, THREE.Material | THREE.Material[]>();

  constructor(deps: RenderPipelineDeps) {
    this.container = deps.container;
    this.scene = deps.scene;
    this.objects = deps.objects;
    this.toonMaterialSystem = deps.toonMaterialSystem;

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor('#12131C', 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Explicit canvas element styling
    const canvas = this.renderer.domElement;
    canvas.id = 'aether-three-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.outline = 'none';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';

    // Remove any previous canvas to avoid duplicates
    const existingCanvases = this.container.querySelectorAll('canvas');
    existingCanvases.forEach((c) => c.remove());

    this.container.appendChild(canvas);

    // Post-processing: RenderPass + Bloom + FXAA
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(deps.scene, deps.camera));

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.4, 0.85);
    this.composer.addPass(this.bloomPass);
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.uniforms.resolution.value.set(1 / width, 1 / height);
    this.composer.addPass(this.fxaaPass);
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  public getRenderMode(): RenderMode {
    return this.renderMode;
  }

  /** Dessine une frame via le composer (RenderPass + Bloom + FXAA). */
  public render(): void {
    this.composer.render();
  }

  public getRenderStats(): RenderStats {
    return {
      triangles: this.renderer.info.render.triangles,
      drawCalls: this.renderer.info.render.calls,
    };
  }

  public setSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height);
    this.fxaaPass.uniforms.resolution.value.set(1 / width, 1 / height);
  }

  public setRenderMode(mode: RenderMode): void {
    this.renderMode = mode;

    // Le système Toon est suspendu hors du mode 'shaded' afin de ne pas
    // écraser les aperçus wireframe/normals ; les contours sont masqués puis
    // restaurés automatiquement au retour en 'shaded'.
    if (this.toonMaterialSystem) {
      this.toonMaterialSystem.enabled = mode === 'shaded';
      ToonSystem.setOutlineVisibility(this.scene, mode === 'shaded');
    }

    this.objects.forEach((obj, uuid) => {
      const applyRenderMode = (mesh: THREE.Mesh, origMat: THREE.Material | THREE.Material[]) => {
        if (mode === 'normals') {
          mesh.material = this.normalMaterial;
        } else if (mode === 'wireframe') {
          if (Array.isArray(origMat)) {
            mesh.material = origMat.map((m) => {
              const clone = m.clone() as THREE.MeshStandardMaterial;
              clone.wireframe = true;
              return clone;
            });
          } else {
            const clone = origMat.clone() as THREE.MeshStandardMaterial;
            clone.wireframe = true;
            mesh.material = clone;
          }
        } else {
          mesh.material = origMat;
        }
      };

      if (obj instanceof THREE.Mesh) {
        const orig = this.originalMaterials.get(uuid);
        if (orig) applyRenderMode(obj, orig);
      } else if (obj instanceof THREE.Group) {
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const orig = this.originalMaterials.get(child.uuid);
            if (orig) applyRenderMode(child, orig);
          }
        });
      }
    });
  }

  /**
   * Mémorise les matériaux d'origine d'un objet (appelé à l'enregistrement)
   * pour pouvoir les restaurer après un mode wireframe/normals.
   */
  public trackObjectMaterials(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      this.originalMaterials.set(obj.uuid, obj.material);
    } else if (obj instanceof THREE.Group) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.originalMaterials.set(child.uuid, child.material);
        }
      });
    }
  }

  public forgetObjectMaterials(id: string): void {
    this.originalMaterials.delete(id);
  }

  public clearOriginalMaterials(): void {
    this.originalMaterials.clear();
  }

  public updatePostProcessing(data: Partial<PostProcessingData>): void {
    if (!this.composer) return;
    this.composer.passes.forEach((pass) => {
      if (pass instanceof UnrealBloomPass) {
        pass.enabled = data.enabled !== false && (data.bloom?.enabled ?? true);
        if (data.bloom) {
          pass.strength = data.bloom.strength ?? 0.5;
          pass.radius = data.bloom.radius ?? 0.4;
          pass.threshold = data.bloom.threshold ?? 0.85;
        }
      }
      if (pass instanceof ShaderPass && pass.material.defines && 'FXAA' in pass.material.defines) {
        pass.enabled = data.enabled !== false;
      }
    });
  }

  public dispose(): void {
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.originalMaterials.clear();
  }
}
