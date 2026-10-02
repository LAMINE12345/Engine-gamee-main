import * as THREE from 'three';
import {
  RippleField,
  rainImpactsThisFrame,
  rainRipple,
  splashDroplets,
  splashRipple,
  splashStrength,
  DEFAULT_RAIN_TUNING,
  DEFAULT_SPLASH_TUNING,
  type RainTuning,
  type RippleSpawn,
  type SplashTuning,
} from './surfaceImpacts';

/**
 * SurfaceImpactFX — rendu Three.js des impacts de surface.
 * =========================================================================
 * Consomme `surfaceImpacts.ts` (logique pure) et ne fait que dessiner :
 *
 *  - `ripples` : un InstancedMesh d'anneaux, couleur par instance. Le fondu
 *    passe par `instanceColor` + `AdditiveBlending` : une couleur qui
 *    s'éteint équivaut à une opacité qui décroît, sans shader custom ni
 *    `material.opacity` partagé.
 *  - `droplets` : un Points unique dont les positions sont intégrées sur CPU
 *    (poussée vers le haut puis chute, comme un vrai jet d'eau).
 *
 * Les deux pools sont fixes : aucun `new` par impact.
 */

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _color = new THREE.Color();
const _hide = new THREE.Matrix4().makeScale(0, 0, 0);

interface Droplet {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
  size: number;
}

/** Gouttelette en vol : position/velocité intégrées à chaque frame. */
interface DropletPool {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  positions: Float32Array;
  colors: Float32Array;
  droplets: Droplet[];
  next: number;
}

export interface SurfaceImpactFXOptions {
  /** Nombre maximum d'anneaux simultanés. */
  rippleCapacity?: number;
  /** Nombre maximum de gouttelettes simultanées. */
  dropletCapacity?: number;
  /** Gouttelettes pondérées (une goutte « weights » vaut N bullets). */
  splashTuning?: SplashTuning;
  rainTuning?: RainTuning;
}

export class SurfaceImpactFX {
  private readonly scene: THREE.Scene;
  private readonly rippleField: RippleField;
  private readonly splashTuning: SplashTuning;
  private readonly rainTuning: RainTuning;

  private rippleMesh: THREE.InstancedMesh | null = null;
  private rippleGeometry: THREE.RingGeometry | null = null;
  private rippleMaterial: THREE.MeshBasicMaterial | null = null;
  private droplets: DropletPool | null = null;
  private dropTexture: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, opts: SurfaceImpactFXOptions = {}) {
    this.scene = scene;
    this.splashTuning = opts.splashTuning ?? DEFAULT_SPLASH_TUNING;
    this.rainTuning = opts.rainTuning ?? DEFAULT_RAIN_TUNING;
    this.rippleField = new RippleField(opts.rippleCapacity ?? 160);
  }

  // =======================================================================
  // API publique
  // =======================================================================

  /** Ondes actuellement vivantes (drainage pour le test/debug). */
  get activeRipples(): number {
    return this.rippleField.activeCount;
  }

  /** Gouttelettes actuellement en vol. */
  get activeDroplets(): number {
    const pool = this.droplets;
    if (!pool) return 0;
    let n = 0;
    for (const d of pool.droplets) if (d.active) n++;
    return n;
  }

  /**
   * Éclaboussure : un objet vient de toucher l'eau.
   *
   * @param impactSpeed vitesse d'entrée (m/s, signée : négatif = vers le bas)
   * @returns la force normalisée appliquée, 0 si l'impact est trop faible
   */
  splash(
    position: THREE.Vector3,
    impactSpeed: number,
    normal?: THREE.Vector3
  ): number {
    const strength = splashStrength(impactSpeed, this.splashTuning);
    if (strength <= 0) return 0;

    this.ensureRipples();
    const ring = splashRipple(strength, this.splashTuning);
    this.rippleField.spawn({
      ...ring,
      x: position.x,
      y: position.y,
      z: position.z,
      nx: normal?.x,
      ny: normal?.y,
      nz: normal?.z,
    });

    const { count, speed, lifetime } = splashDroplets(strength);
    this.emitDroplets(position, count, speed, lifetime, normal);
    return strength;
  }

  /**
   * Impact d'une goutte de pluie sur une surface.
   * @param strength 0..1 (habituellement l'intensité de la pluie)
   */
  rainImpact(position: THREE.Vector3, strength: number): void {
    this.ensureRipples();
    const spec = rainRipple(strength, this.rainTuning);
    this.rippleField.spawn({ ...spec, x: position.x, y: position.y, z: position.z });
  }

  /**
   * Impact de pluie + micro-éclaboussure.
   * Utilisé par la pluie : l'onde seule manque de « poids » sous forte
   * intensité, on ajoute donc quelques gouttelettes.
   */
  rainSplash(position: THREE.Vector3, strength: number): void {
    this.rainImpact(position, strength);
    if (strength < 0.25) return;
    const count = Math.round(2 + strength * 4);
    this.emitDroplets(position, count, 1.1 + strength, 0.32, null, this.rainTuning.splashHeight);
  }

  /**
   * How many rain impacts to emit this frame — delegates to the pure module so
   * the caller (the rain system) and the FX share the exact same budget.
   */
  rainBudget(intensity: number, dt: number): number {
    return rainImpactsThisFrame(intensity, dt, this.rainTuning);
  }

  /** Direct ripple spawn (used by the rivers / custom surfaces). */
  spawnRipple(spec: RippleSpawn): void {
    this.ensureRipples();
    this.rippleField.spawn(spec);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.rippleField.update(dt);
    this.updateRippleMesh();
    this.updateDroplets(dt);
  }

  clear(): void {
    this.rippleField.clear();
    this.updateRippleMesh();
    if (this.droplets) {
      for (const d of this.droplets.droplets) d.active = false;
      this.flushDropletPositions();
    }
  }

  dispose(): void {
    if (this.rippleMesh) {
      this.scene.remove(this.rippleMesh);
      this.rippleMesh.dispose();
      this.rippleMesh = null;
    }
    this.rippleGeometry?.dispose();
    this.rippleGeometry = null;
    this.rippleMaterial?.dispose();
    this.rippleMaterial = null;
    this.rippleField.clear();

    const pool = this.droplets;
    if (pool) {
      this.scene.remove(pool.points);
      pool.geometry.dispose();
      pool.material.dispose();
      this.droplets = null;
    }
    this.dropTexture?.dispose();
    this.dropTexture = null;
  }

  // =======================================================================
  // Anneaux
  // =======================================================================

  private ensureRipples(): void {
    if (this.rippleMesh) return;
    // Anneau fin (0.78 → 1.0) : le rayon visible est porté par l'échelle, la
    // largeur relative du trait reste donc constante quelle que que soit la
    // taille de l'onde.
    this.rippleGeometry = new THREE.RingGeometry(0.78, 1, 40);
    this.rippleGeometry.rotateX(-Math.PI / 2);
    this.rippleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(
      this.rippleGeometry,
      this.rippleMaterial,
      this.rippleField.capacity
    );
    mesh.name = 'ImpactRipples';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    // instanceColor doit exister avant le premier setColorAt.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.rippleField.capacity * 3),
      3
    );
    for (let i = 0; i < this.rippleField.capacity; i++) mesh.setMatrixAt(i, _hide);
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this.rippleMesh = mesh;
  }

  /** @private Projette le pool d'ondes sur l'InstancedMesh. */
  private updateRippleMesh(): void {
    const mesh = this.rippleMesh;
    if (!mesh) return;
    const active = this.rippleField.collect();
    for (let i = 0; i < active.length; i++) {
      const r = active[i];
      // L'anneau est un disque horizontal : on l'aligne sur la normale de la
      // surface (vague) pour qu'il épouse la crête au lieu de la traverser.
      if (r.nx !== 0 || r.ny !== 1 || r.nz !== 0) {
        _n.set(r.nx, r.ny, r.nz).normalize();
        _q.setFromUnitVectors(_up, _n);
      } else {
        _q.identity();
      }
      _p.set(r.x, r.y, r.z);
      _s.set(r.radius, r.radius, r.radius);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      _color.setRGB(r.r * r.opacity, r.g * r.opacity, r.b * r.opacity);
      mesh.setColorAt(i, _color);
    }
    mesh.count = active.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // =======================================================================
  // Gouttelettes
  // =======================================================================

  /** @private Crée le pool de gouttelettes (lazy : rien si aucune éclaboussure). */
  private ensureDroplets(capacity: number): DropletPool {
    const existing = this.droplets;
    if (existing) return existing;

    const n = Math.max(8, capacity);
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) positions[i * 3 + 1] = -99999;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.14,
      sizeAttenuation: true,
      vertexColors: true,
      map: this.createDropTexture(),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'ImpactDroplets';
    points.frustumCulled = false;
    this.scene.add(points);

    const droplets: Droplet[] = [];
    for (let i = 0; i < n; i++) {
      droplets.push({ active: false, x: 0, y: -99999, z: 0, vx: 0, vy: 0, vz: 0, age: 0, lifetime: 1, size: 1 });
    }
    this.droplets = { points, geometry, material, positions, colors, droplets, next: 0 };
    return this.droplets;
  }

  /**
   * @private Émet `count` gouttelettes dans un cône.
   * `heightScale` comprime la projection (utilisé pour la pluie, où le jet
   * doit rester plat).
   */
  private emitDroplets(
    origin: THREE.Vector3,
    count: number,
    speed: number,
    lifetime: number,
    normal?: THREE.Vector3 | null,
    heightScale = 1
  ): void {
    if (count <= 0) return;
    const pool = this.ensureDroplets(Math.max(64, count * 2));
    for (let i = 0; i < count; i++) {
      const d = pool.droplets[pool.next];
      pool.next = (pool.next + 1) % pool.droplets.length;

      // Cône : dispersion azimutale uniforme, élévation biaisée vers le haut
      // (une éclaboussure part en gerbe, pas en boule).
      const azimuth = Math.random() * Math.PI * 2;
      const lift = 0.45 + Math.random() * 0.55;
      const lateral = Math.sqrt(Math.max(0, 1 - lift * lift));

      // Si l'impact est sur une surface inclinée, on projette le jet sur sa
      // normale pour qu'il jaillisse du bon côté.
      let vx = Math.cos(azimuth) * lateral * speed * (0.7 + Math.random() * 0.6);
      let vy = lift * speed * heightScale;
      let vz = Math.sin(azimuth) * lateral * speed * (0.7 + Math.random() * 0.6);
      if (normal && (normal.x !== 0 || normal.y !== 1 || normal.z !== 0)) {
        _n.set(normal.x, normal.y, normal.z).normalize();
        const dot = vx * _n.x + vy * _n.y + vz * _n.z;
        vx += _n.x * dot;
        vy += _n.y * dot;
        vz += _n.z * dot;
      }

      d.active = true;
      d.age = 0;
      d.lifetime = lifetime * (0.75 + Math.random() * 0.5);
      d.x = origin.x + Math.cos(azimuth) * lateral * 0.12;
      d.y = origin.y + 0.04;
      d.z = origin.z + Math.sin(azimuth) * lateral * 0.12;
      d.vx = vx;
      d.vy = vy;
      d.vz = vz;
      d.size = 0.7 + Math.random() * 0.6;
    }
  }

  /** @private Intègre le vol des gouttelettes (poussée d'Archimède + chute). */
  private updateDroplets(dt: number): void {
    const pool = this.droplets;
    if (!pool) return;
    const gravity = 16;
    for (let i = 0; i < pool.droplets.length; i++) {
      const d = pool.droplets[i];
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.lifetime) {
        d.active = false;
        d.y = -99999;
        continue;
      }
      d.vy -= gravity * dt;
      // Léger frein de l'air : la gerbe s'ouvre puis retombe.
      d.vx *= 1 - 0.9 * dt;
      d.vz *= 1 - 0.9 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
    }
    this.flushDropletPositions();
  }

  /** @private Écrit le buffer GPU (couleur = fondu de fin de vie). */
  private flushDropletPositions(): void {
    const pool = this.droplets;
    if (!pool) return;
    for (let i = 0; i < pool.droplets.length; i++) {
      const d = pool.droplets[i];
      if (d.active) {
        pool.positions[i * 3] = d.x;
        pool.positions[i * 3 + 1] = d.y;
        pool.positions[i * 3 + 2] = d.z;
        const fade = 1 - d.age / d.lifetime;
        pool.colors[i * 3] = 0.72 * fade;
        pool.colors[i * 3 + 1] = 0.88 * fade;
        pool.colors[i * 3 + 2] = 1.0 * fade;
      } else {
        pool.positions[i * 3] = 0;
        pool.positions[i * 3 + 1] = -99999;
        pool.positions[i * 3 + 2] = 0;
      }
    }
    pool.geometry.attributes.position.needsUpdate = true;
    pool.geometry.attributes.color.needsUpdate = true;
  }

  /** @private Sprite radial doux pour les gouttelettes. */
  private createDropTexture(): THREE.Texture {
    if (this.dropTexture) return this.dropTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.45, 'rgba(210,235,255,0.75)');
      grad.addColorStop(1, 'rgba(180,220,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(16, 16, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    this.dropTexture = tex;
    return tex;
  }
}
