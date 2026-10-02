import * as THREE from 'three';
import { mulberry32 } from './terrainCompute';
import type { DetailStroke } from '../../types/terrain';

export interface DetailSampler {
  size: number;
  getHeightAt: (x: number, z: number) => number;
  getSlopeYAt: (x: number, z: number) => number;
  grassWeightAt: (x: number, z: number) => number;
  rockWeightAt: (x: number, z: number) => number;
  isHoleAt: (x: number, z: number) => boolean;
}

interface PlacedDetail {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  tint: number;
}

interface ChunkDetails {
  key: string;
  cx: number;
  cz: number;
  center: THREE.Vector3;
  radius: number;
  grass: THREE.InstancedMesh | null;
  pebbles: THREE.InstancedMesh | null;
  built: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function grassSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 64, 64);
    const rand = mulberry32(777);
    for (let i = 0; i < 46; i++) {
      const x = 6 + rand() * 52;
      const bend = (rand() - 0.5) * 14;
      const h = 22 + rand() * 38;
      const g = 120 + Math.floor(rand() * 90);
      ctx.strokeStyle = `rgb(${40 + Math.floor(rand() * 40)},${g},${50 + Math.floor(rand() * 40)})`;
      ctx.lineWidth = 1.6 + rand() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.quadraticCurveTo(x + bend * 0.4, 64 - h * 0.6, x + bend, 64 - h);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let grassTex: THREE.CanvasTexture | null = null;

function grassGeometry(): THREE.BufferGeometry {
  // Deux plans croisés ancrés au sol (y 0→1).
  const p1 = new THREE.PlaneGeometry(1, 1);
  p1.translate(0, 0.5, 0);
  const p2 = p1.clone();
  p2.rotateY(Math.PI / 2);
  const merged = mergeGeometries([p1, p2]);
  p1.dispose();
  p2.dispose();
  return merged;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += (g.index ? g.index.count : g.attributes.position.count);
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, vo * 3);
    if (n) nor.set(n.array as Float32Array, vo * 3);
    if (u) uv.set(u.array as Float32Array, vo * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function pebbleGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  g.scale(1, 0.55, 1);
  return g;
}

/**
 * DetailManager — herbe haute + petits cailloux instanciés (4.3).
 *
 * Scatter procédural déterministe (seed par chunk, densité auto guidée par
 * la splatmap : herbe où l'herbe domine et plat, cailloux sur roche) +
 * coups de pinceau persistés. Un InstancedMesh par chunk × type (streaming :
 * seuls les chunks proches sont construits). Sway du vent en shader.
 */
export class DetailManager {
  public readonly group = new THREE.Group();
  public time = 0;

  private sampler: DetailSampler | null = null;
  private seed = 1337;
  private density = 5;
  private chunks = new Map<string, ChunkDetails>();
  private strokes: DetailStroke[] = [];
  private buildQueue: string[] = [];
  private grassMat: THREE.MeshStandardMaterial | null = null;
  private pebbleMat: THREE.MeshStandardMaterial | null = null;

  constructor() {
    this.group.name = '__AETHER_TERRAIN_DETAILS__';
  }

  public configure(sampler: DetailSampler, seed: number, density: number): void {
    this.sampler = sampler;
    this.seed = seed;
    this.density = density;
  }

  public setDensity(d: number): void {
    this.density = d;
  }

  private ensureMaterials(): void {
    if (!this.grassMat) {
      if (!grassTex) grassTex = grassSpriteTexture();
      this.grassMat = new THREE.MeshStandardMaterial({
        map: grassTex,
        alphaTest: 0.42,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
      });
      this.grassMat.onBeforeCompile = (shader) => {
        shader.uniforms.uSwayTime = { value: 0 };
        (this.grassMat as THREE.MeshStandardMaterial).userData.swayShader = shader;
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            uniform float uSwayTime;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
              {
                vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
                float swayPhase = ip.x * 0.35 + ip.y * 0.61;
                float swayAmt = clamp(transformed.y, 0.0, 1.0);
                transformed.x += sin(uSwayTime * 1.7 + swayPhase) * swayAmt * 0.09;
                transformed.z += cos(uSwayTime * 1.3 + swayPhase * 1.3) * swayAmt * 0.06;
              }
            #endif`
          );
      };
      this.grassMat.customProgramCacheKey = () => 'aether-grass-sway-v1';
    }
    if (!this.pebbleMat) {
      this.pebbleMat = new THREE.MeshStandardMaterial({
        color: '#8a8f98',
        roughness: 0.95,
        metalness: 0.05,
        flatShading: true,
      });
    }
  }

  public setTime(t: number): void {
    this.time = t;
    const shader = this.grassMat?.userData.swayShader as
      | { uniforms: { uSwayTime: { value: number } } }
      | undefined;
    if (shader) shader.uniforms.uSwayTime.value = t;
  }

  // ------------------------------------------------------------- peuplement

  public registerChunk(cx: number, cz: number, center: THREE.Vector3, radius: number): void {
    const key = `${cx},${cz}`;
    if (!this.chunks.has(key)) {
      this.chunks.set(key, { key, cx, cz, center: center.clone(), radius, grass: null, pebbles: null, built: false });
    }
  }

  public update(camera: THREE.Camera, detailDistance: number, maxBuildPerFrame = 1): void {
    if (!this.sampler) return;
    let built = 0;
    const queue: { key: string; dist: number }[] = [];
    for (const [key, ch] of this.chunks) {
      const dist = Math.max(0, camera.position.distanceTo(ch.center) - ch.radius);
      const want = dist < detailDistance;
      if (want && !ch.built) {
        queue.push({ key, dist });
      } else if (!want && ch.built) {
        this.releaseChunk(ch);
      } else if (want && ch.built) {
        if (ch.grass) ch.grass.visible = true;
        if (ch.pebbles) ch.pebbles.visible = true;
      }
    }
    queue.sort((a, b) => a.dist - b.dist);
    for (const q of queue) {
      if (built >= maxBuildPerFrame) {
        if (!this.buildQueue.includes(q.key)) this.buildQueue.push(q.key);
        continue;
      }
      const ch = this.chunks.get(q.key);
      if (ch && !ch.built) {
        this.buildChunk(ch);
        built++;
      }
    }
    // File d'attente des builds reportés.
    while (built < maxBuildPerFrame && this.buildQueue.length > 0) {
      const key = this.buildQueue.shift();
      if (!key) break;
      const ch = this.chunks.get(key);
      if (ch && !ch.built) {
        this.buildChunk(ch);
        built++;
      }
    }
  }

  public markAllDirty(): void {
    for (const ch of this.chunks.values()) {
      if (ch.built) {
        this.releaseChunk(ch);
        ch.built = false;
      }
    }
    this.buildQueue.length = 0;
  }

  public markDirtyRect(x0: number, z0: number, x1: number, z1: number): void {
    for (const ch of this.chunks.values()) {
      const b = chunkBounds(ch);
      if (b.maxX >= x0 && b.minX <= x1 && b.maxZ >= z0 && b.minZ <= z1) {
        if (ch.built) {
          this.releaseChunk(ch);
          ch.built = false;
        }
      }
    }
  }

  private releaseChunk(ch: ChunkDetails): void {
    // Géométries par chunk (disposées) ; matériaux partagés (conservés).
    if (ch.grass) {
      this.group.remove(ch.grass);
      ch.grass.geometry.dispose();
      ch.grass = null;
    }
    if (ch.pebbles) {
      this.group.remove(ch.pebbles);
      ch.pebbles.geometry.dispose();
      ch.pebbles = null;
    }
    ch.built = false;
  }

  private buildChunk(ch: ChunkDetails): void {
    if (!this.sampler) return;
    this.ensureMaterials();
    const placed = this.scatterChunk(ch);
    this.applyStrokes(ch, placed);
    ch.grass = this.instantiate(placed.grass, grassGeometry(), this.grassMat, true);
    ch.pebbles = this.instantiate(placed.pebbles, pebbleGeometry(), this.pebbleMat, false);
    if (ch.grass) this.group.add(ch.grass);
    if (ch.pebbles) this.group.add(ch.pebbles);
    ch.built = true;
  }

  private scatterChunk(ch: ChunkDetails): { grass: PlacedDetail[]; pebbles: PlacedDetail[] } {
    const grass: PlacedDetail[] = [];
    const pebbles: PlacedDetail[] = [];
    const sampler = this.sampler;
    if (!sampler) return { grass, pebbles };
    const rand = mulberry32(this.seed * 7919 + ch.cx * 131 + ch.cz * 17 + 5);
    const b = chunkBounds(ch);
    const area = Math.max(1, (b.maxX - b.minX) * (b.maxZ - b.minZ));
    // Densité auto : herbe ~9/m² au max, cailloux ~0.5/m².
    const grassTries = Math.round((this.density / 10) * area * 9);
    const pebbleTries = Math.round((this.density / 10) * area * 0.5) + (this.density > 0 ? 4 : 0);
    for (let i = 0; i < grassTries && grass.length < 1400; i++) {
      const x = b.minX + rand() * (b.maxX - b.minX);
      const z = b.minZ + rand() * (b.maxZ - b.minZ);
      if (sampler.isHoleAt(x, z)) continue;
      const slope = sampler.getSlopeYAt(x, z);
      if (slope < 0.86) continue;
      const gw = sampler.grassWeightAt(x, z);
      if (rand() > gw * 1.15) continue;
      grass.push({
        x,
        y: sampler.getHeightAt(x, z) - 0.02,
        z,
        rotY: rand() * Math.PI * 2,
        scale: 0.35 + rand() * 0.75,
        tint: 0.8 + rand() * 0.4,
      });
    }
    for (let i = 0; i < pebbleTries && pebbles.length < 140; i++) {
      const x = b.minX + rand() * (b.maxX - b.minX);
      const z = b.minZ + rand() * (b.maxZ - b.minZ);
      if (sampler.isHoleAt(x, z)) continue;
      const slope = sampler.getSlopeYAt(x, z);
      if (slope < 0.7) continue;
      const rw = sampler.rockWeightAt(x, z);
      if (rand() > 0.25 + rw) continue;
      pebbles.push({
        x,
        y: sampler.getHeightAt(x, z),
        z,
        rotY: rand() * Math.PI * 2,
        scale: 0.12 + rand() * 0.4,
        tint: 0.75 + rand() * 0.5,
      });
    }
    return { grass, pebbles };
  }

  private applyStrokes(ch: ChunkDetails, placed: { grass: PlacedDetail[]; pebbles: PlacedDetail[] }): void {
    const sampler = this.sampler;
    if (!sampler || this.strokes.length === 0) return;
    const rand = mulberry32(this.seed + ch.cx * 31 + ch.cz * 101 + 999);
    const b = chunkBounds(ch);
    for (const s of this.strokes) {
      const overlaps =
        s.x + s.radius >= b.minX && s.x - s.radius <= b.maxX && s.z + s.radius >= b.minZ && s.z - s.radius <= b.maxZ;
      if (!overlaps) continue;
      const list = s.kind === 'grass' ? placed.grass : placed.pebbles;
      if (!s.add) {
        for (let i = list.length - 1; i >= 0; i--) {
          if (Math.hypot(list[i].x - s.x, list[i].z - s.z) < s.radius) list.splice(i, 1);
        }
        continue;
      }
      const count = Math.round(s.density * s.radius * (s.kind === 'grass' ? 6 : 1.2));
      for (let i = 0; i < count; i++) {
        const r = Math.sqrt(rand()) * s.radius;
        const a = rand() * Math.PI * 2;
        const x = s.x + r * Math.cos(a);
        const z = s.z + r * Math.sin(a);
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        if (sampler.isHoleAt(x, z)) continue;
        list.push({
          x,
          y: sampler.getHeightAt(x, z) - (s.kind === 'grass' ? 0.02 : 0),
          z,
          rotY: rand() * Math.PI * 2,
          scale: s.kind === 'grass' ? 0.35 + rand() * 0.75 : 0.12 + rand() * 0.4,
          tint: 0.8 + rand() * 0.4,
        });
      }
    }
  }

  private instantiate(
    list: PlacedDetail[],
    geo: THREE.BufferGeometry,
    mat: THREE.Material | null,
    noShadow: boolean
  ): THREE.InstancedMesh | null {
    if (list.length === 0 || !mat) {
      geo.dispose();
      return null;
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      _e.set(0, d.rotY, 0);
      _q.setFromEuler(_e);
      _p.set(d.x, d.y, d.z);
      _s.set(d.scale * d.tint, d.scale, d.scale * d.tint);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = list.length;
    mesh.castShadow = !noShadow;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    // Bornes réelles (instances dispersées, sinon culling faux).
    try {
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    } catch {
      mesh.frustumCulled = false;
    }
    return mesh;
  }

  // ------------------------------------------------------------- pinceau

  public paintDetail(x: number, z: number, radius: number, kind: 'grass' | 'pebble', add: boolean, density: number): void {
    this.strokes.push({ x, z, radius, kind, add, density });
    if (this.strokes.length > 400) this.strokes.splice(0, this.strokes.length - 400);
    this.markDirtyRect(x - radius, z - radius, x + radius, z + radius);
  }

  public setStrokes(strokes: DetailStroke[]): void {
    this.strokes = [...strokes];
    this.markAllDirty();
  }

  public getStrokes(): DetailStroke[] {
    return [...this.strokes];
  }

  public getStats(): { chunks: number; built: number } {
    let built = 0;
    for (const ch of this.chunks.values()) if (ch.built) built++;
    return { chunks: this.chunks.size, built };
  }

  public dispose(): void {
    for (const ch of this.chunks.values()) this.releaseChunk(ch);
    this.chunks.clear();
    this.buildQueue.length = 0;
  }
}

function chunkBounds(ch: { center: THREE.Vector3; radius: number }): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  return {
    minX: ch.center.x - ch.radius,
    maxX: ch.center.x + ch.radius,
    minZ: ch.center.z - ch.radius,
    maxZ: ch.center.z + ch.radius,
  };
}
