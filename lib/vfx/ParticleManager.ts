import * as THREE from 'three';
import { ParticleEmitterData, ParticlePreset } from '../../types/engine';

export interface ActiveParticleEmitter {
  id: string;
  data: ParticleEmitterData;
  parentObject?: THREE.Object3D;
  position: THREE.Vector3;
  mesh: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  ages: Float32Array;
  lifetimes: Float32Array;
  activeCount: number;
  timeSinceLastEmit: number;
  isAlive: boolean;
}

export class ParticleManager {
  private scene: THREE.Scene;
  private emitters: Map<string, ActiveParticleEmitter> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Generates a circular procedural particle canvas texture for soft rendering
   */
  private getParticleTexture(type: 'glow' | 'soft' | 'spark' | 'ring' = 'glow'): THREE.Texture {
    if (this.textureCache.has(type)) {
      return this.textureCache.get(type)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, 64, 64);
      if (type === 'glow') {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(32, 32, 32, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 'spark') {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.1, 'rgba(255, 240, 200, 0.9)');
        grad.addColorStop(0.5, 'rgba(255, 180, 50, 0.3)');
        grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(32, 32, 32, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 'soft') {
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(32, 32, 32, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    this.textureCache.set(type, texture);
    return texture;
  }

  /**
   * Helper to create default configuration per preset
   */
  public static getDefaultPresetConfig(preset: ParticlePreset): ParticleEmitterData {
    switch (preset) {
      case 'fire':
        return {
          enabled: true,
          preset: 'fire',
          rate: 60,
          maxParticles: 300,
          size: 0.8,
          speed: 2.2,
          color: '#ff6600',
          colorEnd: '#cc0000',
          lifetime: 1.2,
          spread: 0.4,
          gravity: -1.5,
          loop: true,
        };
      case 'smoke':
        return {
          enabled: true,
          preset: 'smoke',
          rate: 25,
          maxParticles: 200,
          size: 1.6,
          speed: 1.0,
          color: '#888899',
          colorEnd: '#222233',
          lifetime: 2.5,
          spread: 0.6,
          gravity: -0.4,
          loop: true,
        };
      case 'sparks':
        return {
          enabled: true,
          preset: 'sparks',
          rate: 80,
          maxParticles: 400,
          size: 0.3,
          speed: 5.0,
          color: '#ffcc00',
          colorEnd: '#ff3300',
          lifetime: 0.8,
          spread: 1.2,
          gravity: 6.0,
          loop: true,
        };
      case 'rain':
        return {
          enabled: true,
          preset: 'rain',
          rate: 150,
          maxParticles: 800,
          size: 0.25,
          speed: 12.0,
          color: '#66aaff',
          colorEnd: '#3366cc',
          lifetime: 1.5,
          spread: 8.0,
          gravity: 15.0,
          loop: true,
        };
      case 'snow':
        return {
          enabled: true,
          preset: 'snow',
          rate: 40,
          maxParticles: 500,
          size: 0.4,
          speed: 1.2,
          color: '#ffffff',
          colorEnd: '#cceeff',
          lifetime: 4.0,
          spread: 10.0,
          gravity: 0.8,
          loop: true,
        };
      case 'cosmic_dust':
        return {
          enabled: true,
          preset: 'cosmic_dust',
          rate: 30,
          maxParticles: 350,
          size: 0.6,
          speed: 0.5,
          color: '#a855f7',
          colorEnd: '#06b6d4',
          lifetime: 3.5,
          spread: 6.0,
          gravity: 0.0,
          loop: true,
        };
      case 'magic_spell':
        return {
          enabled: true,
          preset: 'magic_spell',
          rate: 100,
          maxParticles: 500,
          size: 0.5,
          speed: 1.5,
          color: '#3b82f6',
          colorEnd: '#ec4899',
          lifetime: 1.8,
          spread: 2.0,
          gravity: -0.2,
          loop: true,
        };
      case 'electric_sparks':
        return {
          enabled: true,
          preset: 'electric_sparks',
          rate: 120,
          maxParticles: 600,
          size: 0.25,
          speed: 6.0,
          color: '#38bdf8',
          colorEnd: '#ffffff',
          lifetime: 0.6,
          spread: 3.0,
          gravity: 0.8,
          loop: true,
        };
      case 'volumetric_smoke':
        return {
          enabled: true,
          preset: 'volumetric_smoke',
          rate: 35,
          maxParticles: 250,
          size: 2.2,
          speed: 0.8,
          color: '#a1a1aa',
          colorEnd: '#3f3f46',
          lifetime: 3.5,
          spread: 1.5,
          gravity: -0.3,
          loop: true,
        };
      case 'aurora':
        return {
          enabled: true,
          preset: 'aurora',
          rate: 30,
          maxParticles: 300,
          size: 3.5,
          speed: 0.3,
          color: '#22c55e',
          colorEnd: '#a855f7',
          lifetime: 5.0,
          spread: 8.0,
          gravity: 0.0,
          loop: true,
        };
      case 'explosion':
      default:
        return {
          enabled: true,
          preset: 'explosion',
          rate: 0,
          maxParticles: 500,
          size: 1.2,
          speed: 9.0,
          color: '#ff8800',
          colorEnd: '#ff0000',
          lifetime: 1.0,
          spread: 1.5,
          gravity: 2.0,
          loop: false,
          burstCount: 250,
        };
    }
  }

  /**
   * Spawns or updates a particle emitter attached to a position or Object3D
   */
  public createOrUpdateEmitter(
    id: string,
    config: ParticleEmitterData,
    position: THREE.Vector3 = new THREE.Vector3(),
    parentObject?: THREE.Object3D
  ): ActiveParticleEmitter {
    // Remove existing if present
    if (this.emitters.has(id)) {
      this.removeEmitter(id);
    }

    const maxP = Math.min(config.maxParticles || 300, 2000);
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(maxP * 3);
    const velocities = new Float32Array(maxP * 3);
    const colors = new Float32Array(maxP * 3);
    const sizes = new Float32Array(maxP);
    const ages = new Float32Array(maxP);
    const lifetimes = new Float32Array(maxP);

    // Initialize ages to infinity so they are inactive until spawned
    ages.fill(1e9);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mapTexture = this.getParticleTexture(
      config.preset === 'sparks' || config.preset === 'electric_sparks'
        ? 'spark'
        : config.preset === 'smoke' || config.preset === 'volumetric_smoke' || config.preset === 'aurora'
        ? 'soft'
        : 'glow'
    );

    const material = new THREE.PointsMaterial({
      size: config.size || 0.8,
      vertexColors: true,
      map: mapTexture,
      transparent: true,
      opacity: config.preset === 'aurora' ? 0.6 : 0.9,
      blending:
        config.preset === 'smoke' || config.preset === 'volumetric_smoke'
          ? THREE.NormalBlending
          : THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const mesh = new THREE.Points(geometry, material);
    mesh.name = `particles_${id}`;
    mesh.position.copy(position);

    if (parentObject) {
      parentObject.add(mesh);
    } else {
      this.scene.add(mesh);
    }

    const emitter: ActiveParticleEmitter = {
      id,
      data: { ...config },
      parentObject,
      position: position.clone(),
      mesh,
      geometry,
      material,
      positions,
      velocities,
      colors,
      sizes,
      ages,
      lifetimes,
      activeCount: 0,
      timeSinceLastEmit: 0,
      isAlive: true,
    };

    // If one-shot burst or preset explosion, trigger initial burst
    if (!config.loop && (config.burstCount || config.preset === 'explosion')) {
      const burst = config.burstCount || maxP;
      this.spawnBurst(emitter, burst);
    }

    this.emitters.set(id, emitter);
    return emitter;
  }

  /**
   * Spawns a sudden burst of N particles for explosions or impact effects
   */
  public spawnBurst(emitter: ActiveParticleEmitter, count: number): void {
    const config = emitter.data;
    const colorStart = new THREE.Color(config.color || '#ff6600');

    let spawned = 0;
    for (let i = 0; i < emitter.ages.length && spawned < count; i++) {
      if (emitter.ages[i] >= emitter.lifetimes[i]) {
        // Spawn particle at index i
        emitter.positions[i * 3] = (Math.random() - 0.5) * (config.preset === 'rain' ? config.spread : 0.2);
        emitter.positions[i * 3 + 1] = config.preset === 'rain' || config.preset === 'snow' ? (Math.random() * config.spread) : 0;
        emitter.positions[i * 3 + 2] = (Math.random() - 0.5) * (config.preset === 'rain' ? config.spread : 0.2);

        // Velocity vector according to preset
        const speed = config.speed * (0.6 + Math.random() * 0.8);
        if (config.preset === 'explosion') {
          // Radial spherical spread
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          emitter.velocities[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
          emitter.velocities[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
          emitter.velocities[i * 3 + 2] = speed * Math.cos(phi);
        } else if (config.preset === 'fire' || config.preset === 'smoke') {
          emitter.velocities[i * 3] = (Math.random() - 0.5) * config.spread;
          emitter.velocities[i * 3 + 1] = speed;
          emitter.velocities[i * 3 + 2] = (Math.random() - 0.5) * config.spread;
        } else if (config.preset === 'rain') {
          emitter.velocities[i * 3] = (Math.random() - 0.5) * 0.2;
          emitter.velocities[i * 3 + 1] = -speed;
          emitter.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        } else if (config.preset === 'snow') {
          emitter.velocities[i * 3] = (Math.random() - 0.5) * 0.5;
          emitter.velocities[i * 3 + 1] = -speed * 0.5;
          emitter.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
        } else {
          emitter.velocities[i * 3] = (Math.random() - 0.5) * config.spread * speed;
          emitter.velocities[i * 3 + 1] = (Math.random() - 0.5) * config.spread * speed;
          emitter.velocities[i * 3 + 2] = (Math.random() - 0.5) * config.spread * speed;
        }

        emitter.colors[i * 3] = colorStart.r;
        emitter.colors[i * 3 + 1] = colorStart.g;
        emitter.colors[i * 3 + 2] = colorStart.b;

        emitter.sizes[i] = config.size * (0.7 + Math.random() * 0.6);
        emitter.ages[i] = 0;
        emitter.lifetimes[i] = config.lifetime * (0.8 + Math.random() * 0.5);

        spawned++;
      }
    }

    emitter.geometry.attributes.position.needsUpdate = true;
    emitter.geometry.attributes.color.needsUpdate = true;
    emitter.geometry.attributes.size.needsUpdate = true;
  }

  /**
   * Triggers a dynamic 3D explosion VFX at a specified location
   */
  public triggerExplosion(
    position: THREE.Vector3,
    scale: number = 1.0,
    force: number = 10.0
  ): void {
    const explosionId = `exp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const config: ParticleEmitterData = {
      enabled: true,
      preset: 'explosion',
      rate: 0,
      maxParticles: Math.min(Math.round(200 * scale), 800),
      size: 1.2 * scale,
      speed: force * 0.8,
      color: '#ffaa00',
      colorEnd: '#ff1100',
      lifetime: 0.9,
      spread: 2.0,
      gravity: 3.0,
      loop: false,
      burstCount: Math.min(Math.round(180 * scale), 600),
    };

    this.createOrUpdateEmitter(explosionId, config, position);

    // Auto cleanup explosion emitter after lifetime
    setTimeout(() => {
      this.removeEmitter(explosionId);
    }, (config.lifetime + 0.5) * 1000);
  }

  /**
   * Main per-frame animation loop update for all particle emitters
   */
  public update(dt: number): void {
    const cappedDt = Math.min(dt, 0.1);

    this.emitters.forEach((emitter, id) => {
      if (!emitter.isAlive || !emitter.data.enabled) return;

      const config = emitter.data;
      const colorStart = new THREE.Color(config.color || '#ff6600');
      const colorEnd = new THREE.Color(config.colorEnd || '#cc0000');

      // Continuous emission for loop emitters
      if (config.loop && config.rate > 0) {
        emitter.timeSinceLastEmit += cappedDt;
        const interval = 1.0 / config.rate;

        while (emitter.timeSinceLastEmit >= interval) {
          emitter.timeSinceLastEmit -= interval;
          this.spawnSingleParticle(emitter, colorStart);
        }
      }

      // Update particle physics, positions, sizes, ages
      let aliveParticles = 0;
      const positions = emitter.positions;
      const velocities = emitter.velocities;
      const colors = emitter.colors;
      const sizes = emitter.sizes;
      const ages = emitter.ages;
      const lifetimes = emitter.lifetimes;

      const maxP = ages.length;

      for (let i = 0; i < maxP; i++) {
        if (ages[i] < lifetimes[i]) {
          ages[i] += cappedDt;
          const lifeRatio = ages[i] / lifetimes[i];

          if (lifeRatio >= 1.0) {
            // Particle died
            ages[i] = lifetimes[i];
            positions[i * 3 + 1] = -99999; // Move far away
            continue;
          }

          aliveParticles++;

          // Apply Gravity
          velocities[i * 3 + 1] -= config.gravity * cappedDt;

          // Apply Turbulence or Sine drift
          if (config.preset === 'snow') {
            velocities[i * 3] = Math.sin(ages[i] * 3 + i) * 0.4;
            velocities[i * 3 + 2] = Math.cos(ages[i] * 2.5 + i) * 0.4;
          } else if (config.preset === 'fire' || config.preset === 'smoke' || config.preset === 'volumetric_smoke') {
            velocities[i * 3] += (Math.random() - 0.5) * 0.2 * cappedDt;
            velocities[i * 3 + 2] += (Math.random() - 0.5) * 0.2 * cappedDt;
          } else if (config.preset === 'magic_spell') {
            // Helical spiral effect
            const angle = ages[i] * 5 + i * 0.5;
            const radius = (1.0 - lifeRatio) * config.spread * 0.5;
            positions[i * 3] += Math.sin(angle) * radius * cappedDt;
            positions[i * 3 + 2] += Math.cos(angle) * radius * cappedDt;
            velocities[i * 3] += (Math.random() - 0.5) * 0.1 * cappedDt;
            velocities[i * 3 + 2] += (Math.random() - 0.5) * 0.1 * cappedDt;
          } else if (config.preset === 'electric_sparks') {
            // Erratic jagged jitter
            velocities[i * 3] += (Math.random() - 0.5) * 20 * cappedDt;
            velocities[i * 3 + 1] += (Math.random() - 0.5) * 20 * cappedDt;
            velocities[i * 3 + 2] += (Math.random() - 0.5) * 20 * cappedDt;
          } else if (config.preset === 'aurora') {
            // Slow majestic drifting wave
            velocities[i * 3] = Math.sin(ages[i] * 0.8 + i * 0.1) * 0.5;
            velocities[i * 3 + 2] = Math.cos(ages[i] * 0.6 + i * 0.1) * 0.3;
            velocities[i * 3 + 1] = 0.1 + Math.sin(ages[i] + i) * 0.05;
          }

          // Update position
          positions[i * 3] += velocities[i * 3] * cappedDt;
          positions[i * 3 + 1] += velocities[i * 3 + 1] * cappedDt;
          positions[i * 3 + 2] += velocities[i * 3 + 2] * cappedDt;

          // Interpolate color over life
          const currentColor = new THREE.Color().copy(colorStart).lerp(colorEnd, lifeRatio);
          colors[i * 3] = currentColor.r;
          colors[i * 3 + 1] = currentColor.g;
          colors[i * 3 + 2] = currentColor.b;

          // Dynamic particle size scaling
          if (config.preset === 'fire' || config.preset === 'smoke' || config.preset === 'volumetric_smoke') {
            sizes[i] = config.size * (1.0 + lifeRatio * 2.0) * (1.0 - lifeRatio * 0.7);
          } else if (config.preset === 'explosion' || config.preset === 'sparks' || config.preset === 'electric_sparks') {
            sizes[i] = config.size * (1.0 - lifeRatio * lifeRatio);
          } else if (config.preset === 'aurora') {
            sizes[i] = config.size * Math.sin(lifeRatio * Math.PI) * (1.0 + Math.sin(ages[i] + i) * 0.2);
          } else {
            sizes[i] = config.size * Math.sin(lifeRatio * Math.PI);
          }
        }
      }

      emitter.activeCount = aliveParticles;

      // Flag geometry attributes for GPU upload
      emitter.geometry.attributes.position.needsUpdate = true;
      emitter.geometry.attributes.color.needsUpdate = true;
      emitter.geometry.attributes.size.needsUpdate = true;

      // Auto-cleanup non-looping empty emitters
      if (!config.loop && aliveParticles === 0 && emitter.timeSinceLastEmit > 1.0) {
        this.removeEmitter(id);
      }
    });
  }

  /**
   * Spawns one particle into an available buffer slot
   */
  private spawnSingleParticle(emitter: ActiveParticleEmitter, colorStart: THREE.Color): void {
    const config = emitter.data;
    const maxP = emitter.ages.length;

    for (let i = 0; i < maxP; i++) {
      if (emitter.ages[i] >= emitter.lifetimes[i]) {
        if (config.preset === 'rain' || config.preset === 'snow') {
          emitter.positions[i * 3] = (Math.random() - 0.5) * config.spread * 2;
          emitter.positions[i * 3 + 1] = config.spread * (0.8 + Math.random() * 0.4);
          emitter.positions[i * 3 + 2] = (Math.random() - 0.5) * config.spread * 2;
        } else if (config.preset === 'cosmic_dust') {
          emitter.positions[i * 3] = (Math.random() - 0.5) * config.spread;
          emitter.positions[i * 3 + 1] = (Math.random() - 0.5) * config.spread;
          emitter.positions[i * 3 + 2] = (Math.random() - 0.5) * config.spread;
        } else if (config.preset === 'aurora') {
          // Spawn in a wide lateral ribbon
          emitter.positions[i * 3] = (Math.random() - 0.5) * config.spread * 2;
          emitter.positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
          emitter.positions[i * 3 + 2] = (Math.random() - 0.5) * config.spread * 0.5;
        } else {
          emitter.positions[i * 3] = (Math.random() - 0.5) * 0.2;
          emitter.positions[i * 3 + 1] = 0;
          emitter.positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        }

        const speed = config.speed * (0.7 + Math.random() * 0.6);
        if (config.preset === 'fire' || config.preset === 'smoke' || config.preset === 'volumetric_smoke') {
          emitter.velocities[i * 3] = (Math.random() - 0.5) * config.spread;
          emitter.velocities[i * 3 + 1] = speed;
          emitter.velocities[i * 3 + 2] = (Math.random() - 0.5) * config.spread;
        } else if (config.preset === 'rain') {
          emitter.velocities[i * 3] = 0;
          emitter.velocities[i * 3 + 1] = -speed;
          emitter.velocities[i * 3 + 2] = 0;
        } else if (config.preset === 'snow') {
          emitter.velocities[i * 3] = (Math.random() - 0.5) * 0.3;
          emitter.velocities[i * 3 + 1] = -speed * 0.4;
          emitter.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        } else if (config.preset === 'aurora') {
          emitter.velocities[i * 3] = (Math.random() - 0.5) * 0.2;
          emitter.velocities[i * 3 + 1] = speed * 0.5;
          emitter.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
        } else if (config.preset === 'electric_sparks') {
          // Highly erratic speed
          const angle = Math.random() * Math.PI * 2;
          emitter.velocities[i * 3] = Math.cos(angle) * speed;
          emitter.velocities[i * 3 + 1] = (Math.random() - 0.3) * speed;
          emitter.velocities[i * 3 + 2] = Math.sin(angle) * speed;
        } else if (config.preset === 'magic_spell') {
          const angle = Math.random() * Math.PI * 2;
          emitter.velocities[i * 3] = Math.cos(angle) * config.spread * 0.3;
          emitter.velocities[i * 3 + 1] = speed;
          emitter.velocities[i * 3 + 2] = Math.sin(angle) * config.spread * 0.3;
        } else {
          emitter.velocities[i * 3] = (Math.random() - 0.5) * config.spread * speed;
          emitter.velocities[i * 3 + 1] = Math.random() * speed;
          emitter.velocities[i * 3 + 2] = (Math.random() - 0.5) * config.spread * speed;
        }

        emitter.colors[i * 3] = colorStart.r;
        emitter.colors[i * 3 + 1] = colorStart.g;
        emitter.colors[i * 3 + 2] = colorStart.b;

        emitter.sizes[i] = config.size;
        emitter.ages[i] = 0;
        emitter.lifetimes[i] = config.lifetime * (0.8 + Math.random() * 0.4);
        break;
      }
    }
  }

  /**
   * Triggers a one-shot burst of particles at a world position
   */
  public triggerBurst(
    preset: ParticlePreset = 'sparks',
    position: THREE.Vector3 = new THREE.Vector3(),
    count: number = 35
  ): void {
    const burstId = `burst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const config = ParticleManager.getDefaultPresetConfig(preset);
    config.maxParticles = Math.min(count, 300);
    config.rate = count * 10;
    
    const emitter = this.createOrUpdateEmitter(burstId, config, position);
    const color = new THREE.Color(config.color || '#ffaa00');
    for (let i = 0; i < Math.min(count, config.maxParticles); i++) {
      this.spawnSingleParticle(emitter, color);
    }

    // Auto-cleanup emitter after lifetime
    setTimeout(() => {
      this.removeEmitter(burstId);
    }, (config.lifetime + 0.5) * 1000);
  }

  /**
   * Safely stops or removes a particle emitter
   */
  public removeEmitter(id: string): void {
    const emitter = this.emitters.get(id);
    if (emitter) {
      emitter.isAlive = false;
      if (emitter.mesh.parent) {
        emitter.mesh.parent.remove(emitter.mesh);
      } else {
        this.scene.remove(emitter.mesh);
      }
      emitter.geometry.dispose();
      emitter.material.dispose();
      this.emitters.delete(id);
    }
  }

  /**
   * Stops emission for a specific emitter
   */
  public stopEmitter(id: string): void {
    const emitter = this.emitters.get(id);
    if (emitter) {
      emitter.data.enabled = false;
    }
  }

  /**
   * Clears all active particle emitters
   */
  public dispose(): void {
    this.emitters.forEach((_, id) => this.removeEmitter(id));
    this.emitters.clear();
    this.textureCache.forEach((texture) => texture.dispose());
    this.textureCache.clear();
  }
}
