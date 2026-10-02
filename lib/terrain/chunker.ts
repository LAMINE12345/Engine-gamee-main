import * as THREE from 'three';
import { triangleInHole } from './terrainCompute';
import type { TerrainHole } from '../../types/terrain';

/** Vue maîtresse (source de vérité : hauteurs/couleurs/normales/uv globales). */
export interface MasterView {
  res: number;
  size: number;
  positions: Float32Array; // (res+1)² × 3, monde local (x, h, z)
  normals: Float32Array; // (res+1)² × 3
  colors: Float32Array; // (res+1)² × 3
  uvs: Float32Array; // (res+1)² × 2
  baseIndex: Uint32Array; // topologie pleine (sans trous)
}

export interface TerrainTile {
  cx: number;
  cz: number;
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  radius: number;
  lod: 0 | 1;
  dirty: boolean;
  fullIndex: Uint32Array;
  halfIndex: Uint32Array;
}

function vertexIndex(col: number, row: number, res: number): number {
  return row * (res + 1) + col;
}

/**
 * TerrainChunker — streaming par chunks (4.3).
 *
 * Découpe la vue maîtresse en CxC tuiles (positions/normales/couleurs/uv
 * copiées, normales cousues = zéro couture avec flatShading). Chaque tuile
 * possède 2 index (plein + stride-2) filtrés des trous, basculés par
 * distance. `markDirty(x0,z0,x1,z1)` reconstruit les tuiles touchées
 * (sculpt/peinture/trous).
 */
export class TerrainChunker {
  public readonly group = new THREE.Group();
  public tiles: TerrainTile[] = [];
  public chunks = 1;
  public lodDistance = 60;

  constructor() {
    this.group.name = '__AETHER_TERRAIN_CHUNKS__';
  }

  public build(
    master: MasterView,
    holes: TerrainHole[],
    material: THREE.Material,
    depthMaterial: THREE.Material | null,
    chunks: number
  ): void {
    this.disposeTiles();
    this.chunks = Math.max(1, Math.min(4, Math.round(chunks)));
    const { res } = master;
    const step = res / this.chunks;
    if (!Number.isInteger(step) || step < 4) {
      this.chunks = 1;
    }
    const stepVerts = res / this.chunks;
    for (let cz = 0; cz < this.chunks; cz++) {
      for (let cx = 0; cx < this.chunks; cx++) {
        this.tiles.push(this.buildTile(master, holes, material, depthMaterial, cx, cz, stepVerts));
      }
    }
    for (const t of this.tiles) this.group.add(t.mesh);
  }

  private buildTile(
    master: MasterView,
    holes: TerrainHole[],
    material: THREE.Material,
    depthMaterial: THREE.Material | null,
    cx: number,
    cz: number,
    step: number
  ): TerrainTile {
    const { res } = master;
    const c0 = Math.round(cx * step);
    const r0 = Math.round(cz * step);
    const n = Math.round(step) + 1;
    const positions = new Float32Array(n * n * 3);
    const normals = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const g = vertexIndex(c0 + c, r0 + r, res);
        const l = r * n + c;
        positions[l * 3] = master.positions[g * 3];
        positions[l * 3 + 1] = master.positions[g * 3 + 1];
        positions[l * 3 + 2] = master.positions[g * 3 + 2];
        normals[l * 3] = master.normals[g * 3];
        normals[l * 3 + 1] = master.normals[g * 3 + 1];
        normals[l * 3 + 2] = master.normals[g * 3 + 2];
        colors[l * 3] = master.colors[g * 3];
        colors[l * 3 + 1] = master.colors[g * 3 + 1];
        colors[l * 3 + 2] = master.colors[g * 3 + 2];
        uvs[l * 2] = master.uvs[g * 2];
        uvs[l * 2 + 1] = master.uvs[g * 2 + 1];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const fullIndex = this.buildIndex(master, holes, c0, r0, n, 1);
    const halfIndex = this.buildIndex(master, holes, c0, r0, n, 2);
    geo.setIndex(new THREE.BufferAttribute(fullIndex, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `__AETHER_TERRAIN_TILE_${cx}_${cz}__`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { isTerrain: true, terrainTile: `${cx},${cz}` };
    if (depthMaterial) mesh.customDepthMaterial = depthMaterial as THREE.Material;
    geo.computeBoundingSphere();
    const center = geo.boundingSphere ? geo.boundingSphere.center.clone() : new THREE.Vector3();
    const radius = geo.boundingSphere ? geo.boundingSphere.radius : 1;
    return { cx, cz, mesh, center, radius, lod: 0, dirty: false, fullIndex, halfIndex };
  }

  /** Index local (stride 1 = plein, 2 = LOD), trous découpés (faces réelles). */
  private buildIndex(
    master: MasterView,
    holes: TerrainHole[],
    c0: number,
    r0: number,
    n: number,
    stride: number
  ): Uint32Array {
    const tris: number[] = [];
    const px = (c: number): number => master.positions[vertexIndex(c0 + c, r0, master.res) * 3];
    const pz = (r: number): number => master.positions[vertexIndex(c0, r0 + r, master.res) * 3 + 2];
    for (let r = 0; r + stride < n; r += stride) {
      for (let c = 0; c + stride < n; c += stride) {
        const a = r * n + c;
        const b = r * n + c + stride;
        const d = (r + stride) * n + c;
        const e = (r + stride) * n + c + stride;
        void master;
        // Triangle 1 : a, d, b — Triangle 2 : b, d, e (même winding que PlaneGeometry).
        if (
          !triangleInHole(px(c), pz(r), px(c), pz(r + stride), px(c + stride), pz(r), holes)
        ) {
          tris.push(a, d, b);
        }
        if (
          !triangleInHole(px(c + stride), pz(r), px(c), pz(r + stride), px(c + stride), pz(r + stride), holes)
        ) {
          tris.push(b, d, e);
        }
      }
    }
    return new Uint32Array(tris);
  }

  /** Marque les tuiles intersectant le rect monde (sculpt/peinture/trous). */
  public markDirtyRect(x0: number, z0: number, x1: number, z1: number): void {
    for (const t of this.tiles) {
      const b = new THREE.Box3().setFromObject(t.mesh);
      if (b.max.x >= x0 && b.min.x <= x1 && b.max.z >= z0 && b.min.z <= z1) {
        t.dirty = true;
      }
    }
  }

  public markAllDirty(): void {
    for (const t of this.tiles) t.dirty = true;
  }

  /** Reconstruit les tuiles sales depuis la vue maîtresse (positions/normales/couleurs). */
  public refreshDirty(master: MasterView, holes: TerrainHole[]): number {
    let rebuilt = 0;
    const { res } = master;
    for (const t of this.tiles) {
      if (!t.dirty) continue;
      t.dirty = false;
      const geo = t.mesh.geometry as THREE.BufferGeometry;
      const step = res / this.chunks;
      const c0 = Math.round(t.cx * step);
      const r0 = Math.round(t.cz * step);
      const n = Math.round(step) + 1;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const nor = geo.attributes.normal as THREE.BufferAttribute;
      const col = geo.attributes.color as THREE.BufferAttribute;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const g = vertexIndex(c0 + c, r0 + r, res);
          const l = r * n + c;
          pos.setXYZ(l, master.positions[g * 3], master.positions[g * 3 + 1], master.positions[g * 3 + 2]);
          nor.setXYZ(l, master.normals[g * 3], master.normals[g * 3 + 1], master.normals[g * 3 + 2]);
          col.setXYZ(l, master.colors[g * 3], master.colors[g * 3 + 1], master.colors[g * 3 + 2]);
        }
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      col.needsUpdate = true;
      t.fullIndex = this.buildIndex(master, holes, c0, r0, n, 1);
      t.halfIndex = this.buildIndex(master, holes, c0, r0, n, 2);
      geo.setIndex(new THREE.BufferAttribute(t.lod === 0 ? t.fullIndex : t.halfIndex, 1));
      geo.computeBoundingSphere();
      if (geo.boundingSphere) {
        t.center.copy(geo.boundingSphere.center);
        t.radius = geo.boundingSphere.radius;
      }
      rebuilt++;
    }
    return rebuilt;
  }

  /** Bascule LOD par distance (setIndex plein/simplifié, pas cher). */
  public update(camera: THREE.Camera): { lod0: number; lod1: number } {
    let lod0 = 0;
    let lod1 = 0;
    if (this.tiles.length === 0) return { lod0, lod1 };
    for (const t of this.tiles) {
      const dist = Math.max(0, camera.position.distanceTo(t.center) - t.radius);
      // Hystérésis 10 % anti-oscillation à la frontière.
      const want: 0 | 1 =
        this.chunks <= 1
          ? 0
          : t.lod === 0
            ? dist > this.lodDistance * 1.1
              ? 1
              : 0
            : dist < this.lodDistance * 0.9
              ? 0
              : 1;
      if (want !== t.lod) {
        t.lod = want;
        (t.mesh.geometry as THREE.BufferGeometry).setIndex(
          new THREE.BufferAttribute(want === 0 ? t.fullIndex : t.halfIndex, 1)
        );
      }
      if (want === 0) lod0++;
      else lod1++;
    }
    return { lod0, lod1 };
  }

  public tileAt(x: number, z: number): TerrainTile | null {
    for (const t of this.tiles) {
      const b = new THREE.Box3().setFromObject(t.mesh);
      if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) return t;
    }
    return null;
  }

  private disposeTiles(): void {
    for (const t of this.tiles) {
      this.group.remove(t.mesh);
      (t.mesh.geometry as THREE.BufferGeometry).dispose();
    }
    this.tiles = [];
  }

  public dispose(): void {
    this.disposeTiles();
  }
}
