import * as THREE from 'three';
import { WaterConfig, WaterPreset } from '../../types/atmosphere';
import { soundManager } from '../SoundManager';

// =========================================================================
// GERSTNER WAVE SHADER FOR THREE.JS
// =========================================================================

const GerstnerWaterShader = {
  uniforms: {
    time: { value: 0 },
    waterColor: { value: new THREE.Color('#0284c7') },
    deepWaterColor: { value: new THREE.Color('#032b43') },
    foamColor: { value: new THREE.Color('#e0f2fe') },
    sunColor: { value: new THREE.Color('#fff8eb') },
    sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    waveSpeed: { value: 1.2 },
    waveHeight: { value: 0.45 },
    waveSteepness: { value: 0.4 },
    waveFrequency: { value: 0.08 },
    sunReflection: { value: 1.8 },
    flowDir: { value: new THREE.Vector2(1.0, 0.4).normalize() },
    opacity: { value: 0.88 },
    clarity: { value: 0.65 },
  },
  vertexShader: `
    uniform float time;
    uniform float waveSpeed;
    uniform float waveHeight;
    uniform float waveSteepness;
    uniform float waveFrequency;
    uniform vec2 flowDir;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vWaveCrest;

    // Gerstner Wave Calculation
    vec3 calculateGerstnerWave(
      vec4 wave, // x,y: direction, z: steepness, w: wavelength
      vec3 p,
      inout vec3 tangent,
      inout vec3 binormal
    ) {
      float steepness = wave.z * waveSteepness;
      float wavelength = wave.w / max(waveFrequency * 10.0, 0.01);
      float k = 2.0 * 3.14159265 / wavelength;
      float c = sqrt(9.8 / k) * waveSpeed;
      vec2 d = normalize(wave.xy);
      float f = k * (dot(d, p.xz) - c * time);
      float a = (steepness / k) * waveHeight;

      tangent += vec3(
        -d.x * d.x * (steepness * sin(f)),
        d.x * (steepness * cos(f)),
        -d.x * d.y * (steepness * sin(f))
      );
      binormal += vec3(
        -d.x * d.y * (steepness * sin(f)),
        d.y * (steepness * cos(f)),
        -d.y * d.y * (steepness * sin(f))
      );

      return vec3(
        d.x * (a * cos(f)),
        a * sin(f),
        d.y * (a * cos(f))
      );
    }

    void main() {
      vUv = uv;
      vec3 gridPoint = position;
      vec3 tangent = vec3(1.0, 0.0, 0.0);
      vec3 binormal = vec3(0.0, 0.0, 1.0);
      vec3 p = gridPoint;

      // 4 Composite Gerstner Waves with varying directions and frequencies
      vec4 waveA = vec4(flowDir.x, flowDir.y, 0.5, 24.0);
      vec4 waveB = vec4(flowDir.x * 0.7 - flowDir.y * 0.7, flowDir.x * 0.7 + flowDir.y * 0.7, 0.35, 14.0);
      vec4 waveC = vec4(-flowDir.y * 0.9, flowDir.x * 0.9, 0.25, 7.0);
      vec4 waveD = vec4(0.8, -0.6, 0.15, 3.5);

      p += calculateGerstnerWave(waveA, gridPoint, tangent, binormal);
      p += calculateGerstnerWave(waveB, gridPoint, tangent, binormal);
      p += calculateGerstnerWave(waveC, gridPoint, tangent, binormal);
      p += calculateGerstnerWave(waveD, gridPoint, tangent, binormal);

      vec3 normal = normalize(cross(binormal, tangent));
      vNormal = normal;

      vec4 worldPos = modelMatrix * vec4(p, 1.0);
      vWorldPosition = worldPos.xyz;
      vWaveCrest = clamp(p.y / max(waveHeight * 1.5, 0.01), 0.0, 1.0);

      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform vec3 waterColor;
    uniform vec3 deepWaterColor;
    uniform vec3 foamColor;
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    uniform float sunReflection;
    uniform float opacity;
    uniform float clarity;
    uniform float time;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vWaveCrest;

    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      vec3 norm = normalize(vNormal);

      // Micro-surface ripple perturbation over UVs
      vec2 rippleUv = vWorldPosition.xz * 0.3 + vec2(time * 0.12, time * 0.08);
      float microNoise = sin(rippleUv.x * 12.0 + sin(rippleUv.y * 8.0)) * 0.08;
      norm = normalize(norm + vec3(microNoise, 0.0, microNoise));

      // Fresnel Reflection Factor (Schlick's approximation)
      float NdotV = max(0.0, dot(norm, viewDir));
      float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 4.0);

      // Sun Specular (Blinn-Phong)
      vec3 halfDir = normalize(sunDirection + viewDir);
      float spec = pow(max(0.0, dot(norm, halfDir)), 64.0) * sunReflection;
      vec3 specularColor = sunColor * spec;

      // Depth Color Gradient (Shallow to Deep based on view angle and clarity)
      vec3 baseWater = mix(deepWaterColor, waterColor, clamp(NdotV * clarity + 0.3, 0.0, 1.0));

      // Wave Foam on Crests
      float foamFactor = smoothstep(0.65, 0.95, vWaveCrest);
      vec3 colorWithFoam = mix(baseWater, foamColor, foamFactor * 0.85);

      // Blend Fresnel and Highlights
      vec3 finalColor = mix(colorWithFoam, sunColor * 0.8 + waterColor * 0.2, fresnel * 0.6) + specularColor;

      // Caustics shimmer
      float caustics = pow(max(0.0, sin(vWorldPosition.x * 2.0 + time * 2.0) * cos(vWorldPosition.z * 2.0 + time * 2.0)), 2.0) * 0.15;
      finalColor += vec3(caustics) * clarity;

      float alpha = clamp(opacity + fresnel * 0.3, 0.0, 1.0);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `,
};

export class WaterManager {
  private scene: THREE.Scene;
  public config: WaterConfig;
  public waterMesh: THREE.Mesh | null = null;
  public waterMaterial: THREE.ShaderMaterial | null = null;
  private waterGeometry: THREE.PlaneGeometry | null = null;
  private elapsedTime: number = 0;
  private splashCooldown: number = 0;

  constructor(scene: THREE.Scene, config?: Partial<WaterConfig>) {
    this.scene = scene;
    this.config = {
      enabled: false,
      preset: 'ocean',
      waterLevel: -0.5,
      waterColor: '#0284c7',
      deepWaterColor: '#032b43',
      foamColor: '#e0f2fe',
      clarity: 0.65,
      opacity: 0.88,
      waveSpeed: 1.2,
      waveHeight: 0.45,
      waveSteepness: 0.4,
      waveFrequency: 0.08,
      sunReflection: 1.8,
      flowDirection: { x: 1, z: 0.4 },
      buoyancyFactor: 1.4,
      waterDrag: 1.8,
      splashAudio: true,
      ...config,
    };

    if (this.config.enabled) {
      this.initWaterMesh();
    }
  }

  public setConfig(config: Partial<WaterConfig>): void {
    this.config = { ...this.config, ...config };

    if (this.config.preset && config.preset && config.preset !== 'custom') {
      this.applyPreset(config.preset);
    }

    if (this.config.enabled) {
      if (!this.waterMesh) {
        this.initWaterMesh();
      } else {
        this.updateUniforms();
      }
      if (this.waterMesh) {
        this.waterMesh.visible = true;
        this.waterMesh.position.y = this.config.waterLevel;
      }
    } else if (this.waterMesh) {
      this.waterMesh.visible = false;
    }
  }

  public applyPreset(preset: WaterPreset): void {
    switch (preset) {
      case 'ocean':
        this.config = {
          ...this.config,
          preset: 'ocean',
          waterColor: '#0284c7',
          deepWaterColor: '#032b43',
          foamColor: '#e0f2fe',
          waveHeight: 0.55,
          waveSpeed: 1.3,
          waveSteepness: 0.45,
          waveFrequency: 0.07,
          clarity: 0.6,
          opacity: 0.9,
          sunReflection: 2.0,
          buoyancyFactor: 1.5,
        };
        break;

      case 'lake':
        this.config = {
          ...this.config,
          preset: 'lake',
          waterColor: '#38bdf8',
          deepWaterColor: '#0c4a6e',
          foamColor: '#f0f9ff',
          waveHeight: 0.15,
          waveSpeed: 0.7,
          waveSteepness: 0.2,
          waveFrequency: 0.12,
          clarity: 0.85,
          opacity: 0.75,
          sunReflection: 1.4,
          buoyancyFactor: 1.2,
        };
        break;

      case 'tropical':
        this.config = {
          ...this.config,
          preset: 'tropical',
          waterColor: '#06b6d4',
          deepWaterColor: '#083344',
          foamColor: '#ffffff',
          waveHeight: 0.35,
          waveSpeed: 1.0,
          waveSteepness: 0.35,
          waveFrequency: 0.09,
          clarity: 0.95,
          opacity: 0.8,
          sunReflection: 2.4,
          buoyancyFactor: 1.4,
        };
        break;

      case 'storm':
        this.config = {
          ...this.config,
          preset: 'storm',
          waterColor: '#334155',
          deepWaterColor: '#0f172a',
          foamColor: '#cbd5e1',
          waveHeight: 1.2,
          waveSpeed: 2.4,
          waveSteepness: 0.7,
          waveFrequency: 0.05,
          clarity: 0.3,
          opacity: 0.96,
          sunReflection: 1.0,
          buoyancyFactor: 1.8,
        };
        break;

      case 'swamp':
        this.config = {
          ...this.config,
          preset: 'swamp',
          waterColor: '#4d7c0f',
          deepWaterColor: '#14532d',
          foamColor: '#a3e635',
          waveHeight: 0.08,
          waveSpeed: 0.4,
          waveSteepness: 0.15,
          waveFrequency: 0.15,
          clarity: 0.25,
          opacity: 0.92,
          sunReflection: 0.6,
          buoyancyFactor: 1.1,
        };
        break;
    }
  }

  private initWaterMesh(): void {
    if (this.waterMesh) return;

    // High resolution water plane grid for smooth Gerstner displacement
    this.waterGeometry = new THREE.PlaneGeometry(600, 600, 180, 180);
    this.waterGeometry.rotateX(-Math.PI / 2);

    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: GerstnerWaterShader.vertexShader,
      fragmentShader: GerstnerWaterShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(GerstnerWaterShader.uniforms),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    this.waterMesh.name = "Plan d'Eau (Océan)";
    this.waterMesh.userData = { subType: 'water', isWaterSystem: true };
    this.waterMesh.position.y = this.config.waterLevel;
    this.waterMesh.receiveShadow = true;
    this.waterMesh.castShadow = false;

    this.updateUniforms();
    this.scene.add(this.waterMesh);
  }

  public updateUniforms(): void {
    if (!this.waterMaterial) return;
    const u = this.waterMaterial.uniforms;
    u.waterColor.value.set(this.config.waterColor);
    u.deepWaterColor.value.set(this.config.deepWaterColor);
    u.foamColor.value.set(this.config.foamColor);
    u.waveSpeed.value = this.config.waveSpeed;
    u.waveHeight.value = this.config.waveHeight;
    u.waveSteepness.value = this.config.waveSteepness;
    u.waveFrequency.value = this.config.waveFrequency;
    u.sunReflection.value = this.config.sunReflection;
    u.opacity.value = this.config.opacity;
    u.clarity.value = this.config.clarity;

    const flow = new THREE.Vector2(this.config.flowDirection.x, this.config.flowDirection.z).normalize();
    u.flowDir.value.copy(flow);
  }

  public setSunDirection(sunDir: THREE.Vector3, sunColor: THREE.Color): void {
    if (!this.waterMaterial) return;
    this.waterMaterial.uniforms.sunDirection.value.copy(sunDir).normalize();
    this.waterMaterial.uniforms.sunColor.value.copy(sunColor);
  }

  public update(dt: number, cameraPos?: THREE.Vector3): void {
    if (!this.config.enabled || !this.waterMesh || !this.waterMaterial) return;

    this.elapsedTime += dt;
    this.waterMaterial.uniforms.time.value = this.elapsedTime;

    // Follow camera on XZ plane ONLY if followCamera is explicitly enabled
    if (this.config.followCamera && cameraPos) {
      this.waterMesh.position.x = cameraPos.x;
      this.waterMesh.position.z = cameraPos.z;
    }
    this.config.waterLevel = this.waterMesh.position.y;

    if (this.splashCooldown > 0) {
      this.splashCooldown -= dt;
    }
  }

  /**
   * EXACT Mathematical Gerstner Wave height and normal evaluation at any (x, z) on CPU!
   * Used for physics buoyancy simulation so objects float on the exact visual crests and troughs!
   */
  public getWaterHeightAndNormal(
    x: number,
    z: number
  ): { height: number; normal: THREE.Vector3 } {
    if (!this.config.enabled) {
      return { height: this.config.waterLevel, normal: new THREE.Vector3(0, 1, 0) };
    }

    const t = this.elapsedTime;
    const waveHeight = this.config.waveHeight;
    const waveSteepness = this.config.waveSteepness;
    const waveSpeed = this.config.waveSpeed;
    const waveFreq = this.config.waveFrequency;

    const flowDir = new THREE.Vector2(
      this.config.flowDirection.x,
      this.config.flowDirection.z
    ).normalize();

    // 4 Composite Gerstner Waves
    const waves = [
      { dir: flowDir, steepness: 0.5, wavelength: 24.0 },
      {
        dir: new THREE.Vector2(
          flowDir.x * 0.7 - flowDir.y * 0.7,
          flowDir.x * 0.7 + flowDir.y * 0.7
        ).normalize(),
        steepness: 0.35,
        wavelength: 14.0,
      },
      {
        dir: new THREE.Vector2(-flowDir.y * 0.9, flowDir.x * 0.9).normalize(),
        steepness: 0.25,
        wavelength: 7.0,
      },
      {
        dir: new THREE.Vector2(0.8, -0.6).normalize(),
        steepness: 0.15,
        wavelength: 3.5,
      },
    ];

    const waterY = this.waterMesh ? this.waterMesh.position.y : this.config.waterLevel;
    let totalY = waterY;
    let tangent = new THREE.Vector3(1, 0, 0);
    let binormal = new THREE.Vector3(0, 0, 1);

    for (const w of waves) {
      const steepness = w.steepness * waveSteepness;
      const wavelength = w.wavelength / Math.max(waveFreq * 10.0, 0.01);
      const k = (2.0 * Math.PI) / wavelength;
      const c = Math.sqrt(9.8 / k) * waveSpeed;
      const d = w.dir;
      const dotVal = d.x * x + d.y * z;
      const f = k * (dotVal - c * t);
      const a = (steepness / k) * waveHeight;

      totalY += a * Math.sin(f);

      tangent.x -= d.x * d.x * (steepness * Math.sin(f));
      tangent.y += d.x * (steepness * Math.cos(f));
      tangent.z -= d.x * d.y * (steepness * Math.sin(f));

      binormal.x -= d.x * d.y * (steepness * Math.sin(f));
      binormal.y += d.y * (steepness * Math.cos(f));
      binormal.z -= d.y * d.y * (steepness * Math.sin(f));
    }

    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

    return { height: totalY, normal };
  }

  public playSplashSound(): void {
    if (this.config.splashAudio && this.splashCooldown <= 0) {
      soundManager.playSFX('water');
      this.splashCooldown = 0.35;
    }
  }

  public dispose(): void {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      this.waterGeometry?.dispose();
      this.waterMaterial?.dispose();
      this.waterMesh = null;
    }
  }
}
