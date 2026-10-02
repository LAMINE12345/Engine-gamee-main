import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import {
  AtmosphereData,
  PostProcessingData,
  PostProcessVolumeOverrides,
  DEFAULT_ATMOSPHERE,
  normalizePostProcessing,
  SkyPreset,
  
} from '../../types/atmosphere';
import {
  SSAOShader,
  SSRShader,
  MotionBlurShader,
  DepthOfFieldShader,
  ColorGradingShader,
} from '../postprocess/shaders';
import { GBufferPass, TAAPass, CameraJitter, loadLutTexture } from '../postprocess/passes';

/** Null-safe mat4 copy: assigns a fresh Matrix4 when the uniform has no value yet. */
function copyMat4(uniform: THREE.IUniform | undefined, mat: THREE.Matrix4): THREE.Matrix4 {
  if (!uniform || !uniform.value || typeof uniform.value.copy !== 'function') {
    const fresh = new THREE.Matrix4().copy(mat);
    if (uniform) uniform.value = fresh;
    return fresh;
  }
  return uniform.value.copy(mat);
}

// Dynamic Sky Dome with Celestial Sun & Moon & Twinkling Stars
const SkyDomeShader = {
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    uniform float sunIntensity;
    uniform vec3 moonColor;
    uniform vec3 moonDirection;
    uniform float moonIntensity;
    uniform float starsIntensity;
    uniform float time;
    varying vec3 vWorldPosition;

    // Pseudo-random hash for stars
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    void main() {
      vec3 dir = normalize(vWorldPosition);
      float h = max(0.0, dir.y);
      vec3 sky = mix(bottomColor, topColor, pow(h, 0.6));

      // 1. Sun disc & atmospheric glow
      float sunDot = max(0.0, dot(dir, normalize(sunDirection)));
      if (sunDirection.y > -0.2) {
        float sunGlow = pow(sunDot, 64.0) * 1.5;
        float sunDisc = smoothstep(0.998, 0.9995, sunDot) * 4.0;
        sky += (sunColor * (sunGlow + sunDisc)) * max(0.0, sunIntensity);
      }

      // 2. Moon disc & cool halo
      if (moonIntensity > 0.01) {
        float moonDot = max(0.0, dot(dir, normalize(moonDirection)));
        float moonGlow = pow(moonDot, 48.0) * 0.8;
        float moonDisc = smoothstep(0.9975, 0.9992, moonDot) * 3.5;
        sky += (moonColor * (moonGlow + moonDisc)) * moonIntensity * 0.8;
      }

      // 3. Procedural Twinkling Stars Dome at Night
      if (starsIntensity > 0.01 && h > 0.05) {
        vec3 starCoord = floor(dir * 180.0);
        float starRand = hash(starCoord);
        if (starRand > 0.985) {
          float twinkle = sin(time * 3.0 + starRand * 6.28) * 0.3 + 0.7;
          float starBrightness = pow((starRand - 0.985) / 0.015, 3.0) * twinkle * starsIntensity * h;
          sky += vec3(0.85, 0.92, 1.0) * starBrightness;
        }
      }

      gl_FragColor = vec4(sky, 1.0);
    }
  `,
};

export class AtmosphereManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private dirLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  private skyMesh!: THREE.Mesh;
  private skyMaterial!: THREE.ShaderMaterial;

  public atmosphere: AtmosphereData;
  public postProcessing: PostProcessingData;

  // Post-processing Composer
  public composer: EffectComposer | null = null;
  public bloomPass: UnrealBloomPass | null = null;
  public ssaoPass: ShaderPass | null = null;
  public colorPass: ShaderPass | null = null;
  public renderPass: RenderPass | null = null;
  public ssrPass: ShaderPass | null = null;
  public motionBlurPass: ShaderPass | null = null;
  public dofPass: ShaderPass | null = null;
  public gbufferPass: GBufferPass | null = null;
  public taaPass: TAAPass | null = null;
  public fxaaPass: FXAAPass | null = null;
  public smaaPass: SMAAPass | null = null;
  public outputPass: OutputPass | null = null;

  // Temporal / velocity bookkeeping (unjittered view-projection matrices)
  private jitter = new CameraJitter();
  private savedProj = new THREE.Matrix4();
  private currentViewProj = new THREE.Matrix4();
  private prevViewProj = new THREE.Matrix4();
  private projInv = new THREE.Matrix4();
  private renderSize = new THREE.Vector2(1920, 1080);
  private aaModeInitialized = '';

  // LUT (horizontal strip color grading table)
  private lutTexture: THREE.Texture | null = null;
  private lutSize = 0;
  private lutUrl = '';
  private loadingLut = false;

  // Post-Process Volume merged overrides (base values blended by volume manager)
  private volumeOverrides: PostProcessVolumeOverrides = {};

  // Autofocus raycaster for DoF
  private dofRaycaster = new THREE.Raycaster();

  // Internal time tracking
  private internalTime: number = 0;
  public onTimeChange?: (timeOfDay: number) => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    dirLight: THREE.DirectionalLight,
    ambientLight: THREE.AmbientLight,
    initialAtmosphere?: AtmosphereData,
    initialPostProcessing?: PostProcessingData
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.dirLight = dirLight;
    this.ambientLight = ambientLight;

    this.atmosphere = initialAtmosphere ? { ...initialAtmosphere } : { ...DEFAULT_ATMOSPHERE };
    this.postProcessing = normalizePostProcessing(initialPostProcessing);
    this.prevViewProj.identity();

    this.initSky();
    this.initPostProcessing();
    this.applyAtmosphere(this.atmosphere);
    this.applyPostProcessing(this.postProcessing);
  }

  private initSky(): void {
    const skyGeo = new THREE.SphereGeometry(450, 32, 24);
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SkyDomeShader.vertexShader,
      fragmentShader: SkyDomeShader.fragmentShader,
      uniforms: {
        topColor: { value: new THREE.Color(this.atmosphere.skyTopColor) },
        bottomColor: { value: new THREE.Color(this.atmosphere.skyBottomColor) },
        sunColor: { value: new THREE.Color(this.atmosphere.sunColor) },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        sunIntensity: { value: this.atmosphere.sunIntensity },
        moonColor: { value: new THREE.Color('#dbeafe') },
        moonDirection: { value: new THREE.Vector3(0, -1, 0) },
        moonIntensity: { value: 0.0 },
        starsIntensity: { value: 0.0 },
        time: { value: 0.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.skyMesh.name = '__AETHER_SKY_DOME__';
    this.scene.add(this.skyMesh);
  }

  public initPostProcessing(): void {
    const size = this.renderer.getSize(new THREE.Vector2());
    const pixelRatio = this.renderer.getPixelRatio();
    this.renderSize.copy(size);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(size.x, size.y);
    this.composer.setPixelRatio(pixelRatio);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // 0. G-buffer (view-space normals + depth) — feeds SSAO/SSR/TAA/DoF/MotionBlur
    this.gbufferPass = new GBufferPass(this.scene, this.camera, size.x, size.y);
    this.composer.addPass(this.gbufferPass);

    // 1. Screen-space reflections (depth + normal ray march)
    this.ssrPass = new ShaderPass(SSRShader);
    this.composer.addPass(this.ssrPass);

    // 2. Depth-based SSAO (replaces the old luminance-only contact fake)
    this.ssaoPass = new ShaderPass(SSAOShader);
    this.composer.addPass(this.ssaoPass);

    // 3. Temporal AA (depth reprojection + neighbourhood clamp) — mode 'taa'
    this.taaPass = new TAAPass();
    this.taaPass.setDepthTexture(this.gbufferPass.depthTexture);
    this.composer.addPass(this.taaPass);

    // 4. Motion blur (camera-velocity reprojection)
    this.motionBlurPass = new ShaderPass(MotionBlurShader);
    this.composer.addPass(this.motionBlurPass);

    // 5. Depth of field (bokeh CoC gather)
    this.dofPass = new ShaderPass(DepthOfFieldShader);
    this.composer.addPass(this.dofPass);

    // 6. Unreal Bloom
    const bloom = this.postProcessing.bloom;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      bloom.strength,
      bloom.radius,
      bloom.threshold
    );
    this.bloomPass.enabled = bloom.enabled;
    this.composer.addPass(this.bloomPass);

    // 7. Color grading (exposure/WB/contrast/sat/curves/LUT) + vignette + CA
    this.colorPass = new ShaderPass(ColorGradingShader);
    this.composer.addPass(this.colorPass);

    // 8. Anti-aliasing (fxaa | smaa | taa-resolved earlier | none)
    this.fxaaPass = new FXAAPass();
    this.composer.addPass(this.fxaaPass);
    this.smaaPass = new SMAAPass();
    this.composer.addPass(this.smaaPass);

    // 9. Final output pass (tone mapping + sRGB)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // Size newly added passes (composer.setSize only reaches existing passes)
    this.composer.setSize(size.x, size.y);
    this.refreshPostUniforms();
    this.applyLutUrl(this.postProcessing.colorGrading.lutUrl);
  }

  /** Base scalar overrides (current post settings) used as the volume blend start. */
  public getBaseVolumeOverrides(): PostProcessVolumeOverrides {
    const pp = this.postProcessing;
    return {
      bloomStrength: pp.bloom.strength,
      bloomThreshold: pp.bloom.threshold,
      bloomRadius: pp.bloom.radius,
      vignetteDarkness: pp.vignette.darkness,
      exposure: pp.colorGrading.exposure,
      contrast: pp.colorGrading.contrast,
      saturation: pp.colorGrading.saturation,
      temperature: pp.colorGrading.temperature,
      shadows: pp.colorGrading.shadows,
      midtones: pp.colorGrading.midtones,
      highlights: pp.colorGrading.highlights,
      chromaticAberration: pp.chromaticAberration.enabled ? pp.chromaticAberration.intensity : 0,
      ssaoIntensity: pp.ssao?.intensity ?? 1.2,
      dofFocus: pp.depthOfField?.focusDistance ?? 12,
      dofAperture: pp.depthOfField?.aperture ?? 0.6,
      motionBlurStrength: pp.motionBlur?.strength ?? 0.5,
      ssrIntensity: pp.ssr?.intensity ?? 0.7,
    };
  }

  /** Called every frame by the scene with volume-blended overrides. */
  public setVolumeOverrides(overrides: PostProcessVolumeOverrides): void {
    this.volumeOverrides = overrides;
    this.refreshPostUniforms();
  }

  private eff(baseValue: number, overrideKey: keyof PostProcessVolumeOverrides): number {
    const v = this.volumeOverrides[overrideKey];
    return typeof v === 'number' ? v : baseValue;
  }

  private get aaMode(): string {
    if (!this.postProcessing.enabled) return 'none';
    return this.postProcessing.antiAliasing?.mode ?? 'fxaa';
  }

  /** Pushes the effective (base + volume overrides) config into every pass. */
  private refreshPostUniforms(): void {
    const pp = this.postProcessing;
    const size = this.renderSize;
    const enabled = pp.enabled;
    const mode = this.aaMode;
    const ssao = pp.ssao;
    const ssr = pp.ssr;
    const mb = pp.motionBlur;
    const dof = pp.depthOfField;

    // --- Pass enable flags ---
    const gbufferNeeded =
      enabled &&
      !!(
        (ssao?.enabled) ||
        (ssr?.enabled) ||
        mode === 'taa' ||
        (mb?.enabled) ||
        (dof?.enabled)
      );
    if (this.gbufferPass) this.gbufferPass.enabled = gbufferNeeded;
    if (this.ssrPass) this.ssrPass.enabled = enabled && !!ssr?.enabled;
    if (this.ssaoPass) this.ssaoPass.enabled = enabled && !!ssao?.enabled;
    if (this.taaPass) this.taaPass.enabled = enabled && mode === 'taa';
    if (this.motionBlurPass) this.motionBlurPass.enabled = enabled && !!mb?.enabled;
    if (this.dofPass) this.dofPass.enabled = enabled && !!dof?.enabled;
    if (this.bloomPass) this.bloomPass.enabled = enabled && pp.bloom.enabled;
    if (this.colorPass) {
      this.colorPass.enabled =
        enabled &&
        !!(
          pp.colorGrading.enabled ||
          pp.vignette.enabled ||
          pp.chromaticAberration.enabled ||
          (pp.colorGrading.lutUrl && pp.colorGrading.lutUrl.length > 0)
        );
    }
    if (this.fxaaPass) this.fxaaPass.enabled = enabled && mode === 'fxaa';
    if (this.smaaPass) this.smaaPass.enabled = enabled && mode === 'smaa';

    // Reset TAA history when mode changes (e.g. taa -> fxaa -> taa)
    const modeKey = `${enabled}-${mode}`;
    if (modeKey !== this.aaModeInitialized) {
      this.taaPass?.reset();
      this.jitter.reset();
      this.aaModeInitialized = modeKey;
    }

    // --- Bloom (volume overrides) ---
    if (this.bloomPass) {
      this.bloomPass.strength = this.eff(pp.bloom.strength, 'bloomStrength');
      this.bloomPass.radius = this.eff(pp.bloom.radius, 'bloomRadius');
      this.bloomPass.threshold = this.eff(pp.bloom.threshold, 'bloomThreshold');
    }

    // --- Shared matrices / depth uniforms for depth-based passes ---
    const w = Math.max(size.x, 1);
    const h = Math.max(size.y, 1);
    this.projInv.copy(this.savedProj).invert();

    const depthUniformTargets: Array<Record<string, THREE.IUniform>> = [];
    if (this.ssaoPass) depthUniformTargets.push(this.ssaoPass.uniforms);
    if (this.ssrPass) depthUniformTargets.push(this.ssrPass.uniforms);
    if (this.dofPass) depthUniformTargets.push(this.dofPass.uniforms);
    if (this.motionBlurPass) depthUniformTargets.push(this.motionBlurPass.uniforms);
    if (this.taaPass) depthUniformTargets.push(this.taaPass.uniforms);

    for (const u of depthUniformTargets) {
      if (u.cameraNear) u.cameraNear.value = this.camera.near;
      if (u.cameraFar) u.cameraFar.value = this.camera.far;
      if (u.uProj) u.uProj.value = this.savedProj;
      if (u.uProjInv) u.uProjInv.value = this.projInv;
      if (u.tDepth && this.gbufferPass) u.tDepth.value = this.gbufferPass.depthTexture;
      if (u.tNormal && this.gbufferPass) u.tNormal.value = this.gbufferPass.normalRT.texture;
      if (u.resolution) {
        if (u.resolution.value && typeof u.resolution.value.set === 'function') {
          u.resolution.value.set(w, h);
        } else {
          u.resolution.value = new THREE.Vector2(w, h);
        }
      }
    }

    // --- SSAO ---
    if (this.ssaoPass) {
      const u = this.ssaoPass.uniforms;
      u.enableSSAO.value = enabled && ssao?.enabled ? 1.0 : 0.0;
      u.radius.value = ssao?.radius ?? 0.8;
      u.intensity.value = this.eff(ssao?.intensity ?? 1.2, 'ssaoIntensity');
      u.bias.value = ssao?.bias ?? 0.02;
    }

    // --- SSR ---
    if (this.ssrPass) {
      const u = this.ssrPass.uniforms;
      u.enableSSR.value = enabled && ssr?.enabled ? 1.0 : 0.0;
      u.intensity.value = this.eff(ssr?.intensity ?? 0.7, 'ssrIntensity');
      u.thickness.value = ssr?.thickness ?? 0.25;
      u.maxDistance.value = ssr?.maxDistance ?? 0.35;
      u.steps.value = ssr?.steps ?? 16;
    }

    // --- Motion blur ---
    if (this.motionBlurPass) {
      const u = this.motionBlurPass.uniforms;
      u.enableMotionBlur.value = enabled && mb?.enabled ? 1.0 : 0.0;
      u.strength.value = this.eff(mb?.strength ?? 0.5, 'motionBlurStrength');
      u.samples.value = mb?.samples ?? 8;
      u.maxRadius.value = mb?.maxRadius ?? 0.03;
      copyMat4(u.uInvViewProj, this.currentViewProj).invert();
      copyMat4(u.uPrevViewProj, this.prevViewProj);
    }

    // --- Depth of field (+ optional center autofocus) ---
    if (this.dofPass) {
      const u = this.dofPass.uniforms;
      u.enableDoF.value = enabled && dof?.enabled ? 1.0 : 0.0;
      let focus = this.eff(dof?.focusDistance ?? 12, 'dofFocus');
      if (dof?.enabled && dof.autoFocus) {
        focus = this.computeAutoFocus() ?? focus;
      }
      u.focusDistance.value = focus;
      u.focalRange.value = dof?.focalRange ?? 8;
      u.aperture.value = this.eff(dof?.aperture ?? 0.6, 'dofAperture');
      u.maxBlur.value = dof?.maxBlur ?? 0.015;
    }

    // --- TAA matrices ---
    if (this.taaPass) {
      const u = this.taaPass.uniforms;
      copyMat4(u.uInvViewProj, this.currentViewProj).invert();
      copyMat4(u.uPrevViewProj, this.prevViewProj);
      u.feedback.value = 0.9;
    }

    // --- Color grading / vignette / CA / LUT ---
    if (this.colorPass) {
      const u = this.colorPass.uniforms;
      const cg = pp.colorGrading;
      u.enableColorGrading.value = cg.enabled ? 1.0 : 0.0;
      u.exposure.value = this.eff(cg.exposure, 'exposure');
      u.contrast.value = this.eff(cg.contrast, 'contrast');
      u.saturation.value = this.eff(cg.saturation, 'saturation');
      u.temperature.value = this.eff(cg.temperature, 'temperature');
      u.tint.value = cg.tint;
      u.shadows.value = this.eff(cg.shadows, 'shadows');
      u.midtones.value = this.eff(cg.midtones, 'midtones');
      u.highlights.value = this.eff(cg.highlights, 'highlights');
      u.lut.value = this.lutTexture;
      u.lutSize.value = this.lutSize;
      u.lutIntensity.value = cg.lutIntensity;
      u.enableVignette.value = pp.vignette.enabled ? 1.0 : 0.0;
      u.vignetteDarkness.value = this.eff(pp.vignette.darkness, 'vignetteDarkness');
      u.vignetteOffset.value = pp.vignette.offset;
      u.chromaticAberration.value = this.eff(
        pp.chromaticAberration.enabled ? pp.chromaticAberration.intensity : 0,
        'chromaticAberration'
      );
    }
  }

  /** Raycast the screen center; returns world distance to first solid hit. */
  private computeAutoFocus(): number | null {
    this.dofRaycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.dofRaycaster.far = 1000;
    const hits = this.dofRaycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      const obj = hit.object;
      if (!obj.visible) continue;
      const name = (obj.name || '').toLowerCase();
      if (name.includes('__aether_sky') || name.includes('helper') || name.includes('gizmo')) continue;
      if (name.includes('__aether_netremote') || name.includes('__aether_impostor')) continue;
      if (obj.userData?.isNetRemote === true) continue;
      if (obj.userData?.ignoreRaycast || obj.userData?.isSensor || obj.userData?.isEditorOnly) continue;
      if (obj.userData?.isSensor === true) continue;
      return hit.distance;
    }
    return null;
  }

  private applyLutUrl(url?: string): void {
    const next = url ?? '';
    if (next === this.lutUrl && (this.lutTexture || this.loadingLut)) return;
    this.lutUrl = next;

    if (!next) {
      this.lutTexture?.dispose();
      this.lutTexture = null;
      this.lutSize = 0;
      this.refreshPostUniforms();
      return;
    }

    this.loadingLut = true;
    loadLutTexture(next, (tex, size) => {
      this.loadingLut = false;
      this.lutTexture?.dispose();
      this.lutTexture = tex;
      this.lutSize = tex ? size : 0;
      this.refreshPostUniforms();
    });
  }

  public setSize(width: number, height: number): void {
    this.renderSize.set(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
    if (this.ssaoPass) {
      const res = this.ssaoPass.uniforms.resolution;
      if (res.value && typeof res.value.set === 'function') res.value.set(width, height);
      else res.value = new THREE.Vector2(width, height);
    }
    if (this.dofPass) {
      const res = this.dofPass.uniforms.resolution;
      if (res.value && typeof res.value.set === 'function') res.value.set(width, height);
      else res.value = new THREE.Vector2(width, height);
    }
    this.gbufferPass?.setSize(width, height);
    this.taaPass?.setSize(width, height);
    this.refreshPostUniforms();
  }

  public applyAtmosphere(data: Partial<AtmosphereData>): void {
    this.atmosphere = { ...this.atmosphere, ...data };
    const atm = this.atmosphere;

    // Check if Day/Night cycle is active and calculates celestial angles
    if (atm.dayNightCycle && atm.dayNightCycle.enabled) {
      this.updateDayNightColors(atm.dayNightCycle.timeOfDay);
      return;
    }

    // Standard static sun position calculation
    const azimuthRad = THREE.MathUtils.degToRad(atm.sunPosition.azimuth);
    const elevationRad = THREE.MathUtils.degToRad(atm.sunPosition.elevation);
    const radius = 35;

    const sunX = radius * Math.cos(elevationRad) * Math.sin(azimuthRad);
    const sunY = radius * Math.sin(elevationRad);
    const sunZ = radius * Math.cos(elevationRad) * Math.cos(azimuthRad);

    this.dirLight.position.set(sunX, sunY, sunZ);
    this.dirLight.color.set(atm.sunColor);
    this.dirLight.intensity = atm.sunIntensity;

    // Ambient light
    this.ambientLight.color.set(atm.ambientColor);
    this.ambientLight.intensity = atm.ambientIntensity;

    // Sky Dome Uniforms
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.topColor.value.set(atm.skyTopColor);
      this.skyMaterial.uniforms.bottomColor.value.set(atm.skyBottomColor);
      this.skyMaterial.uniforms.sunColor.value.set(atm.sunColor);
      this.skyMaterial.uniforms.sunDirection.value.set(sunX, sunY, sunZ).normalize();
      this.skyMaterial.uniforms.sunIntensity.value = atm.sunIntensity;
      this.skyMaterial.uniforms.moonIntensity.value = 0.0;
      this.skyMaterial.uniforms.starsIntensity.value = 0.0;
    }

    // Fog
    if (atm.fog.enabled) {
      if (atm.fog.type === 'exponential') {
        this.scene.fog = new THREE.FogExp2(atm.fog.color, Math.min(atm.fog.density, 0.008));
      } else if (atm.fog.type === 'linear') {
        this.scene.fog = new THREE.Fog(atm.fog.color, Math.max(atm.fog.near, 15), Math.max(atm.fog.far, 120));
      } else {
        this.scene.fog = null;
      }
    } else {
      this.scene.fog = null;
    }

    if (this.skyMesh && this.skyMesh.visible) {
      this.scene.background = null;
    } else {
      this.scene.background = new THREE.Color(atm.fog.color);
    }
  }

  /**
   * Evaluates continuous Day/Night cycle colors, celestial sun/moon positions, and sky dome
   */
  public updateDayNightColors(hour: number): void {
    const cycle = this.atmosphere.dayNightCycle;
    if (!cycle) return;

    // Normalize hour 0..24
    const h = ((hour % 24) + 24) % 24;

    // Sun angle: 6h = Dawn (elevation 0), 12h = Noon (elevation 90), 18h = Sunset (elevation 0), 0h = Midnight (elevation -90)
    const sunAngleRad = ((h - 6.0) / 24.0) * Math.PI * 2.0;
    const azimuthRad = THREE.MathUtils.degToRad(cycle.sunAzimuth ?? 45);
    const radius = 35;

    // Sun Position
    const sunElevation = Math.sin(sunAngleRad);
    const sunDistance = Math.cos(sunAngleRad);
    const sunX = radius * sunDistance * Math.sin(azimuthRad);
    const sunY = radius * sunElevation;
    const sunZ = radius * sunDistance * Math.cos(azimuthRad);

    // Moon Position (opposite to sun)
    const moonX = -sunX;
    const moonY = -sunY;
    const moonZ = -sunZ;

    // Interpolate Day, Sunset, Night colors based on time
    let sunCol = new THREE.Color('#ffffff');
    let sunInt = 2.0;
    let ambCol = new THREE.Color('#ffffff');
    let ambInt = 1.0;
    let topCol = new THREE.Color('#0284c7');
    let botCol = new THREE.Color('#38bdf8');
    let starsInt = 0.0;
    let moonInt = 0.0;
    let fogCol = '#0f172a';

    if (h >= 5.0 && h < 7.5) {
      // DAWN / SUNRISE (5h to 7.5h)
      const t = (h - 5.0) / 2.5;
      sunCol = new THREE.Color('#ff7849').lerp(new THREE.Color('#fff4e0'), t);
      sunInt = 0.5 + t * 1.7;
      ambCol = new THREE.Color('#fbbf24').lerp(new THREE.Color('#e0f2fe'), t);
      ambInt = 0.3 + t * 0.7;
      topCol = new THREE.Color('#1e1b4b').lerp(new THREE.Color('#0284c7'), t);
      botCol = new THREE.Color('#f97316').lerp(new THREE.Color('#7dd3fc'), t);
      starsInt = Math.max(0.0, 1.0 - t * 1.5) * (cycle.starsIntensity ?? 1.0);
      fogCol = '#382039';
    } else if (h >= 7.5 && h < 16.5) {
      // DAYLIGHT (7.5h to 16.5h)
      sunCol = new THREE.Color('#fffdf5');
      sunInt = 2.2;
      ambCol = new THREE.Color('#ffffff');
      ambInt = 1.1;
      topCol = new THREE.Color('#0284c7');
      botCol = new THREE.Color('#7dd3fc');
      starsInt = 0.0;
      fogCol = '#0f172a';
    } else if (h >= 16.5 && h < 19.5) {
      // SUNSET / GOLDEN HOUR (16.5h to 19.5h)
      const t = (h - 16.5) / 3.0;
      sunCol = new THREE.Color('#fbbf24').lerp(new THREE.Color('#ea580c'), t);
      sunInt = 2.2 - t * 1.2;
      ambCol = new THREE.Color('#fed7aa').lerp(new THREE.Color('#311042'), t);
      ambInt = 1.0 - t * 0.6;
      topCol = new THREE.Color('#0284c7').lerp(new THREE.Color('#1e1b4b'), t);
      botCol = new THREE.Color('#7dd3fc').lerp(new THREE.Color('#f97316'), t);
      starsInt = Math.max(0.0, t - 0.5) * 2.0 * (cycle.starsIntensity ?? 1.0);
      fogCol = '#25112e';
    } else {
      // NIGHT (19.5h to 5.0h)
      sunCol = new THREE.Color('#0f172a');
      sunInt = 0.0;
      ambCol = new THREE.Color('#1e1b4b');
      ambInt = 0.25;
      topCol = new THREE.Color('#020617');
      botCol = new THREE.Color('#0f172a');
      starsInt = 1.0 * (cycle.starsIntensity ?? 1.0);
      moonInt = (cycle.moonIntensity ?? 1.2);
      fogCol = '#020617';
    }

    // Apply lighting
    if (sunElevation > 0.05) {
      this.dirLight.position.set(sunX, sunY, sunZ);
      this.dirLight.color.copy(sunCol);
      this.dirLight.intensity = sunInt;
    } else {
      // Moonlight takes over directional shadows
      this.dirLight.position.set(moonX, moonY, moonZ);
      this.dirLight.color.set('#c7d2fe');
      this.dirLight.intensity = Math.max(0.2, moonInt * 0.6);
    }

    this.ambientLight.color.copy(ambCol);
    this.ambientLight.intensity = ambInt;

    // Sky Dome update
    if (this.skyMaterial) {
      const u = this.skyMaterial.uniforms;
      u.topColor.value.copy(topCol);
      u.bottomColor.value.copy(botCol);
      u.sunColor.value.copy(sunCol);
      u.sunDirection.value.set(sunX, sunY, sunZ).normalize();
      u.sunIntensity.value = sunInt;
      u.moonColor.value.set('#dbeafe');
      u.moonDirection.value.set(moonX, moonY, moonZ).normalize();
      u.moonIntensity.value = moonInt;
      u.starsIntensity.value = starsInt;
      u.time.value = this.internalTime;
    }

    // Dynamic Fog at Night/Day
    if (this.atmosphere.fog.enabled) {
      if (this.atmosphere.fog.type === 'exponential') {
        this.scene.fog = new THREE.FogExp2(fogCol, Math.min(this.atmosphere.fog.density, 0.008));
      } else if (this.atmosphere.fog.type === 'linear') {
        this.scene.fog = new THREE.Fog(fogCol, Math.max(this.atmosphere.fog.near, 15), Math.max(this.atmosphere.fog.far, 120));
      }
    }
  }

  public update(dt: number): void {
    this.internalTime += dt;

    if (this.skyMaterial) {
      this.skyMaterial.uniforms.time.value = this.internalTime;
    }

    // Step automated Day/Night cycle
    const cycle = this.atmosphere.dayNightCycle;
    if (cycle && cycle.enabled && !cycle.isPaused) {
      const cycleDuration = Math.max(0.5, cycle.durationMinutes) * 60; // seconds for 24h
      const hoursPerSec = 24.0 / cycleDuration;
      cycle.timeOfDay = (cycle.timeOfDay + dt * hoursPerSec) % 24.0;

      this.updateDayNightColors(cycle.timeOfDay);

      if (this.onTimeChange) {
        this.onTimeChange(cycle.timeOfDay);
      }
    }
  }

  public updateAtmosphere(data: Partial<AtmosphereData>): void {
    this.applyAtmosphere(data);
  }

  public updatePostProcessing(data: Partial<PostProcessingData>): void {
    this.applyPostProcessing(data);
  }

  public applyPreset(preset: SkyPreset): void {
    let update: Partial<AtmosphereData> = { skyPreset: preset };

    switch (preset) {
      case 'daylight':
        update = {
          skyPreset: 'daylight',
          sunPosition: { azimuth: 45, elevation: 55 },
          sunColor: '#fff8eb',
          sunIntensity: 2.2,
          ambientColor: '#ffffff',
          ambientIntensity: 0.75,
          skyTopColor: '#0284c7',
          skyBottomColor: '#7dd3fc',
          groundColor: '#0f172a',
          fog: {
            enabled: true,
            type: 'exponential',
            color: '#0c0e14',
            density: 0.012,
            near: 10,
            far: 100,
          },
        };
        break;

      case 'sunset':
        update = {
          skyPreset: 'sunset',
          sunPosition: { azimuth: 260, elevation: 12 },
          sunColor: '#ff6b35',
          sunIntensity: 3.2,
          ambientColor: '#818cf8',
          ambientIntensity: 0.6,
          skyTopColor: '#311042',
          skyBottomColor: '#f97316',
          groundColor: '#180e29',
          fog: {
            enabled: true,
            type: 'exponential',
            color: '#240b36',
            density: 0.02,
            near: 10,
            far: 75,
          },
        };
        break;

      case 'golden_hour':
        update = {
          skyPreset: 'golden_hour',
          sunPosition: { azimuth: 235, elevation: 22 },
          sunColor: '#fbbf24',
          sunIntensity: 2.8,
          ambientColor: '#fed7aa',
          ambientIntensity: 0.7,
          skyTopColor: '#0369a1',
          skyBottomColor: '#fde047',
          groundColor: '#1c1917',
          fog: {
            enabled: true,
            type: 'exponential',
            color: '#1e1b18',
            density: 0.015,
            near: 15,
            far: 90,
          },
        };
        break;

      case 'cyberpunk':
        update = {
          skyPreset: 'cyberpunk',
          sunPosition: { azimuth: 180, elevation: 18 },
          sunColor: '#ec4899',
          sunIntensity: 2.5,
          ambientColor: '#06b6d4',
          ambientIntensity: 0.8,
          skyTopColor: '#090514',
          skyBottomColor: '#701a75',
          groundColor: '#020617',
          fog: {
            enabled: true,
            type: 'exponential',
            color: '#090214',
            density: 0.022,
            near: 5,
            far: 60,
          },
        };
        break;

      case 'scifi_night':
        update = {
          skyPreset: 'scifi_night',
          sunPosition: { azimuth: 0, elevation: 8 },
          sunColor: '#38bdf8',
          sunIntensity: 1.2,
          ambientColor: '#1e1b4b',
          ambientIntensity: 0.5,
          skyTopColor: '#020617',
          skyBottomColor: '#0f172a',
          groundColor: '#020617',
          fog: {
            enabled: true,
            type: 'exponential',
            color: '#020617',
            density: 0.028,
            near: 5,
            far: 50,
          },
        };
        break;

      case 'overcast':
        update = {
          skyPreset: 'overcast',
          sunPosition: { azimuth: 90, elevation: 60 },
          sunColor: '#cbd5e1',
          sunIntensity: 1.4,
          ambientColor: '#94a3b8',
          ambientIntensity: 0.9,
          skyTopColor: '#475569',
          skyBottomColor: '#94a3b8',
          groundColor: '#1e293b',
          fog: {
            enabled: true,
            type: 'exponential',
            color: '#334155',
            density: 0.035,
            near: 5,
            far: 45,
          },
        };
        break;
    }

    this.applyAtmosphere(update);
  }

  public applyPostProcessing(data: Partial<PostProcessingData>): void {
    this.postProcessing = normalizePostProcessing({ ...this.postProcessing, ...data });
    this.applyLutUrl(this.postProcessing.colorGrading.lutUrl);
    this.refreshPostUniforms();
  }

  public render(deltaTime: number): void {
    const pp = this.postProcessing;
    if (pp.enabled && this.composer) {
      const size = this.renderSize;
      const modeTaa = (pp.antiAliasing?.mode ?? 'fxaa') === 'taa';

      // Keep volume overrides + depth uniforms in sync every frame
      this.refreshPostUniforms();

      // Snapshot unjittered projection + view-projection BEFORE jitter so
      // velocity reprojection stays stable.
      this.camera.updateMatrixWorld();
      this.savedProj.copy(this.camera.projectionMatrix);
      this.currentViewProj.multiplyMatrices(this.savedProj, this.camera.matrixWorldInverse);
      this.projInv.copy(this.savedProj).invert();

      if (this.motionBlurPass) {
        copyMat4(this.motionBlurPass.uniforms.uInvViewProj, this.currentViewProj).invert();
        copyMat4(this.motionBlurPass.uniforms.uPrevViewProj, this.prevViewProj);
        this.motionBlurPass.uniforms.uProj.value = this.savedProj;
        this.motionBlurPass.uniforms.uProjInv.value = this.projInv;
      }
      if (this.taaPass) {
        this.taaPass.invViewProj.copy(this.currentViewProj);
        this.taaPass.prevViewProj.copy(this.prevViewProj);
        this.taaPass.uniforms.uProj.value = this.savedProj;
        this.taaPass.uniforms.uProjInv.value = this.projInv;
      }

      // Camera jitter for TAA (Halton 2,3 on projectionMatrix)
      if (modeTaa && this.taaPass?.enabled) {
        this.jitter.apply(this.camera, size.x, size.y);
      }

      this.composer.render(deltaTime);
      this.jitter.restoreIfApplied(this.camera);

      // Persist unjittered VP for next frame's velocity/reprojection
      this.prevViewProj.copy(this.currentViewProj);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      this.skyMaterial.dispose();
    }
    if (this.composer) {
      this.composer.dispose();
    }
    this.gbufferPass?.dispose();
    this.taaPass?.dispose();
    this.lutTexture?.dispose();
    this.lutTexture = null;
  }
}
