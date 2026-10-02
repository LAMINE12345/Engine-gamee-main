import * as THREE from 'three';
import {
  TerrainConfig,
  DEFAULT_TERRAIN_CONFIG,
  SplatStroke,
  TerrainHole,
  
  TerrainDetailData,
} from '../../types/terrain';
import {
  genHeights,
  computeNormals,
  bakeSplat,
  pointInHole,
} from './terrainCompute';
import { makeTerrainMaterial, setTerrainSplatTextures } from './terrainLayers';
import { TerrainChunker } from './chunker';
import type { MasterView } from './chunker';
import { DetailManager } from './details';
import { TerrainWorkerClient } from './terrainWorkerClient';

export class TerrainGenerator {
  public config: TerrainConfig;
  /** Mesh unique (legacy) ou Group de chunks — ajouté à la scène par SceneManager. */
  public mesh!: THREE.Object3D;
  /** Géométrie maîtresse (positions XZ + hauteurs + couleurs + uv + index de base). */
  public geometry!: THREE.BufferGeometry;
  public material!: THREE.MeshStandardMaterial;
  /** Hauteur + ombres avec discard des trous. */
  public depthMaterial!: THREE.Material;

  private heightArray!: Float32Array;
  private baseIndex: Uint32Array = new Uint32Array();

  // --- 4.3 : splat, trous, chunks, détails, worker ---
  public splatStrokes: SplatStroke[] = [];
  public holes: TerrainHole[] = [];
  public chunker: TerrainChunker | null = null;
  public details: DetailManager = new DetailManager();
  public readonly worker = new TerrainWorkerClient();
  private splatTex: THREE.DataTexture | null = null;
  private holeTex: THREE.DataTexture | null = null;
  private splatSize = 0;
  private lastSplatBake = 0;
  private regenToken = 0;

  constructor(config?: Partial<TerrainConfig>) {
    this.config = { ...DEFAULT_TERRAIN_CONFIG, ...config };
    this.buildTerrainMesh();
  }

  // ------------------------------------------------------------------ build

  public buildTerrainMesh(customHeights?: number[]): THREE.Object3D {
    const { size, resolution, heightScale, roughness, octaves } = this.config;
    const res = Math.max(8, Math.round(resolution));

    // Gabarit maître : topologie PlaneGeometry (ordre/uv/index identiques).
    const template = new THREE.PlaneGeometry(size, size, res, res);
    template.rotateX(-Math.PI / 2);
    const tplPos = template.attributes.position as THREE.BufferAttribute;
    const tplUv = template.attributes.uv as THREE.BufferAttribute;
    const tplIndex = template.index;
    const vertexCount = tplPos.count;

    this.heightArray = new Float32Array(vertexCount);
    if (customHeights && customHeights.length === vertexCount) {
      for (let i = 0; i < vertexCount; i++) this.heightArray[i] = customHeights[i];
    } else {
      const gen = genHeights({
        seed: this.config.seed,
        size,
        res,
        heightScale,
        roughness,
        octaves,
      });
      this.heightArray.set(gen);
    }

    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array((tplUv.array as Float32Array).slice());
    for (let i = 0; i < vertexCount; i++) {
      positions[i * 3] = tplPos.getX(i);
      positions[i * 3 + 1] = this.heightArray[i];
      positions[i * 3 + 2] = tplPos.getZ(i);
    }
    template.dispose();

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.baseIndex = new Uint32Array(tplIndex ? (tplIndex.array as ArrayLike<number>) : []);
    this.geometry.setIndex(new THREE.BufferAttribute(this.baseIndex.slice(), 1));

    this.refreshNormalsAndColors();
    this.buildMaterial();
    this.rebuildViews();
    void this.requestSplatBake(true);
    this.configureDetails();
    return this.mesh;
  }

  private buildMaterial(): void {
    if (this.material) this.material.dispose();
    this.material = makeTerrainMaterial({
      terrainSize: this.config.size,
      wireframe: this.config.wireframe,
      flatShading: true,
    });
    // Depth material avec le même discard (pas d'ombres fantômes sur les trous).
    if (this.depthMaterial) (this.depthMaterial as THREE.Material).dispose?.();
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    const holeRef = { value: this.holeTex };
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.tHole = holeRef;
      (depth.userData as Record<string, unknown>).holeRef = holeRef;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D tHole;
          varying vec2 vHoleUv;`
        )
        .replace(
          '#include <alphamap_fragment>',
          `#include <alphamap_fragment>
          {
            float hole = texture2D(tHole, vHoleUv).r;
            if (hole > 0.5) discard;
          }`
        );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vHoleUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvHoleUv = uv;');
    };
    depth.customProgramCacheKey = () => 'aether-terrain-hole-depth-v1';
    this.depthMaterial = depth;
    // Re-lie les textures courantes (rebake).
    if (this.splatTex && this.holeTex) {
      setTerrainSplatTextures(this.material, this.splatTex, this.holeTex);
      const ud = depth.userData as Record<string, unknown>;
      const ref = ud.holeRef as { value: unknown } | undefined;
      if (ref) ref.value = this.holeTex;
    }
  }

  /** (Re)construit les vues (mesh unique ou chunks) depuis la géométrie maîtresse. */
  private rebuildViews(): void {
    // Identité stable : this.mesh est TOUJOURS le même Group (la scène ne
    // perd jamais la référence) ; seul son contenu est reconstruit.
    let group = this.mesh as THREE.Group | undefined;
    if (!group || !(group as THREE.Group).isGroup) {
      const old = this.mesh;
      group = new THREE.Group();
      group.name = '__AETHER_PROCEDURAL_TERRAIN__';
      group.userData = { isTerrain: true, terrainConfig: this.config };
      this.mesh = group;
      if (old && old !== group) this.disposeObject(old);
    }
    group.clear();
    const useChunks = Math.max(1, Math.min(4, Math.round(this.config.chunks || 1)));
    if (useChunks <= 1 || this.config.resolution / useChunks < 4) {
      if (this.chunker) {
        this.chunker.dispose();
        this.chunker = null;
      }
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.name = '__AETHER_TERRAIN_SINGLE__';
      mesh.castShadow = this.config.castShadow;
      mesh.receiveShadow = this.config.receiveShadow;
      mesh.customDepthMaterial = this.depthMaterial;
      mesh.userData = { isTerrain: true };
      group.add(mesh);
      this.applyHoleFacesLegacy();
    } else {
      if (!this.chunker) this.chunker = new TerrainChunker();
      this.chunker.lodDistance = this.config.chunkLodDistance;
      this.chunker.build(this.masterView(), this.holes, this.material, this.depthMaterial, useChunks);
      group.add(this.chunker.group);
      this.registerDetailChunks();
    }
    group.visible = this.config.enabled;
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry !== this.geometry) child.geometry.dispose();
      }
    });
  }

  private masterView(): MasterView {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const nor = this.geometry.attributes.normal as THREE.BufferAttribute;
    const col = this.geometry.attributes.color as THREE.BufferAttribute;
    const uv = this.geometry.attributes.uv as THREE.BufferAttribute;
    return {
      res: this.config.resolution,
      size: this.config.size,
      positions: pos.array as Float32Array,
      normals: nor.array as Float32Array,
      colors: col.array as Float32Array,
      uvs: uv.array as Float32Array,
      baseIndex: this.baseIndex,
    };
  }

  private refreshNormalsAndColors(): void {
    const { resolution: res, size } = this.config;
    const normals = computeNormals(this.heightArray, res, size);
    (this.geometry.attributes.normal as THREE.BufferAttribute).array.set(normals);
    (this.geometry.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    const colors = this.config.colors;
    this.updateColors(
      new THREE.Color(colors.grass),
      new THREE.Color(colors.rock),
      new THREE.Color(colors.sand),
      new THREE.Color(colors.snow)
    );
  }

  /** Propage maître → vues (sculpt/peinture/trous). */
  private refreshViews(x0 = -Infinity, z0 = -Infinity, x1 = Infinity, z1 = Infinity): void {
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    if (this.chunker) {
      this.chunker.markDirtyRect(x0, z0, x1, z1);
      this.chunker.refreshDirty(this.masterView(), this.holes);
    } else {
      this.applyHoleFacesLegacy();
    }
    this.details.markDirtyRect(x0, z0, x1, z1);
  }

  private applyHoleFacesLegacy(): void {
    if (!this.geometry || this.chunker) return;
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const kept: number[] = [];
    const idx = this.baseIndex;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const cx = (pos.array[a] + pos.array[b] + pos.array[c]) / 3;
      const cz = (pos.array[a + 2] + pos.array[b + 2] + pos.array[c + 2]) / 3;
      if (!pointInHole(cx, cz, this.holes)) {
        kept.push(idx[t], idx[t + 1], idx[t + 2]);
      }
    }
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(kept), 1));
  }

  // ------------------------------------------------------------------ splat

  /** Rebake splat+trous (worker si dispo). `force` ignore le throttle. */
  public async requestSplatBake(force = false): Promise<void> {
    const now = performance.now();
    if (!force && now - this.lastSplatBake < 150) return;
    this.lastSplatBake = now;
    const { resolution: res, size, heightScale, splatSize } = this.config;
    const token = ++this.regenToken;
    try {
      const normals = (this.geometry.attributes.normal as THREE.BufferAttribute).array as Float32Array;
      const result = this.config.useWorker
        ? await this.worker.bakeSplat({
            heights: this.heightArray,
            normals,
            res,
            size,
            heightScale,
            splatSize,
            strokes: this.splatStrokes,
            holes: this.holes,
          })
        : bakeSplat({
            heights: this.heightArray,
            normals,
            res,
            size,
            heightScale,
            splatSize,
            strokes: this.splatStrokes,
            holes: this.holes,
          });
      if (token !== this.regenToken) return; // regen entre-temps : résultat périmé
      this.uploadSplat(result.splat, result.hole, splatSize);
    } catch {
      /* worker HS : le repli synchrone a déjà été tenté dans le client */
    }
  }

  private uploadSplat(splat: Uint8Array, hole: Uint8Array, size: number): void {
    const S = Math.max(32, size);
    if (!this.splatTex || !this.holeTex || this.splatSize !== S) {
      this.splatTex?.dispose();
      this.holeTex?.dispose();
      this.splatTex = new THREE.DataTexture(splat, S, S);
      this.holeTex = new THREE.DataTexture(hole, S, S);
      for (const tex of [this.splatTex, this.holeTex]) {
        tex.flipY = true; // v=1 ↔ rangée 0 (z=-half), comme les uv PlaneGeometry
        tex.needsUpdate = true;
      }
      this.splatSize = S;
      setTerrainSplatTextures(this.material, this.splatTex, this.holeTex);
      const ud = this.depthMaterial?.userData as Record<string, unknown> | undefined;
      const ref = ud?.holeRef as { value: unknown } | undefined;
      if (ref) ref.value = this.holeTex;
    } else {
      (this.splatTex.image.data as Uint8Array).set(splat);
      (this.holeTex.image.data as Uint8Array).set(hole);
      this.splatTex.needsUpdate = true;
      this.holeTex.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ couches

  /** Coup de pinceau couche (persisté + rebake). */
  public paintLayerAt(
    worldPoint: THREE.Vector3,
    layer: number,
    radius: number,
    strength: number
  ): void {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    this.splatStrokes.push({
      x: local.x,
      z: local.z,
      radius: Math.max(0.5, radius),
      layer: Math.max(0, Math.min(3, Math.round(layer))),
      strength: Math.max(0.05, Math.min(2, strength)),
    });
    if (this.splatStrokes.length > 600) {
      this.splatStrokes.splice(0, this.splatStrokes.length - 600);
    }
    void this.requestSplatBake(false);
  }

  /** Poids splat (0-1) échantillonné — placement des détails. */
  public splatWeightAt(x: number, z: number, layer: number): number {
    if (!this.splatTex || this.splatSize <= 0) return layer === 0 ? 1 : 0;
    const S = this.splatSize;
    const tx = Math.max(0, Math.min(S - 1, Math.round(((x + this.config.size / 2) / this.config.size) * (S - 1))));
    const ty = Math.max(0, Math.min(S - 1, Math.round(((z + this.config.size / 2) / this.config.size) * (S - 1))));
    const data = this.splatTex.image.data as Uint8Array;
    return (data[(ty * S + tx) * 4 + Math.max(0, Math.min(3, layer))] ?? 0) / 255;
  }

  // ------------------------------------------------------------------ trous

  public paintHoleAt(worldPoint: THREE.Vector3, radius: number): void {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    this.holes.push({ x: local.x, z: local.z, radius: Math.max(1, radius) });
    if (this.holes.length > 64) this.holes.splice(0, this.holes.length - 64);
    this.afterHoleChange(local.x, local.z, radius);
  }

  public eraseHoleAt(worldPoint: THREE.Vector3, radius: number): void {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    const before = this.holes.length;
    this.holes = this.holes.filter((h) => Math.hypot(h.x - local.x, h.z - local.z) > radius + h.radius * 0.5);
    if (this.holes.length !== before) {
      this.afterHoleChange(local.x, local.z, radius * 2);
    }
  }

  private afterHoleChange(x: number, z: number, radius: number): void {
    if (this.chunker) {
      this.chunker.markDirtyRect(x - radius * 2, z - radius * 2, x + radius * 2, z + radius * 2);
      this.chunker.refreshDirty(this.masterView(), this.holes);
    } else {
      this.applyHoleFacesLegacy();
    }
    this.details.markDirtyRect(x - radius * 2, z - radius * 2, x + radius * 2, z + radius * 2);
    void this.requestSplatBake(true);
  }

  public isHoleAt(x: number, z: number): boolean {
    return pointInHole(x, z, this.holes);
  }

  // ------------------------------------------------------------------ détails

  private configureDetails(): void {
    this.details.configure(
      {
        size: this.config.size,
        getHeightAt: (x, z) => this.getHeightAt(x, z),
        getSlopeYAt: (x, z) => this.getSlopeYAt(x, z),
        grassWeightAt: (x, z) => this.splatWeightAt(x, z, 0),
        rockWeightAt: (x, z) => this.splatWeightAt(x, z, 1),
        isHoleAt: (x, z) => this.isHoleAt(x, z),
      },
      this.config.seed,
      this.config.detailDensity
    );
    if (this.chunker) {
      this.registerDetailChunks();
    } else {
      const half = this.config.size / 2;
      this.details.registerChunk(0, 0, new THREE.Vector3(0, 0, 0), half * 1.5);
    }
  }

  private registerDetailChunks(): void {
    if (!this.chunker) return;
    for (const t of this.chunker.tiles) {
      this.details.registerChunk(t.cx, t.cz, t.center, t.radius);
    }
  }

  public paintDetailAt(
    worldPoint: THREE.Vector3,
    kind: 'grass' | 'pebble',
    add: boolean,
    radius: number,
    density: number
  ): void {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    this.details.paintDetail(local.x, local.z, radius, kind, add, density);
  }

  // ------------------------------------------------------------------ boucle

  public update(camera: THREE.Camera, elapsed: number): void {
    if (this.chunker) {
      this.chunker.update(camera);
      this.chunker.lodDistance = this.config.chunkLodDistance;
    }
    this.details.setDensity(this.config.detailDensity);
    this.details.setTime(elapsed);
    this.details.update(camera, this.config.detailDistance);
  }

  public getStats(): {
    mode: string;
    tiles: number;
    lod0: number;
    lod1: number;
    detailChunks: number;
    detailBuilt: number;
    holes: number;
    strokes: number;
    worker: boolean;
  } {
    let lod0 = 0;
    let lod1 = 0;
    if (this.chunker) {
      for (const t of this.chunker.tiles) {
        if (t.lod === 0) lod0++;
        else lod1++;
      }
    } else {
      lod0 = 1;
    }
    const det = this.details.getStats();
    return {
      mode: this.chunker ? `${this.chunker.chunks}×${this.chunker.chunks} chunks` : 'mesh unique',
      tiles: this.chunker?.tiles.length ?? 1,
      lod0,
      lod1,
      detailChunks: det.chunks,
      detailBuilt: det.built,
      holes: this.holes.length,
      strokes: this.splatStrokes.length,
      worker: this.worker.workerAvailable,
    };
  }

  // ------------------------------------------------------------------ legacy API

  public updateColors(
    grassColor: THREE.Color,
    rockColor: THREE.Color,
    sandColor: THREE.Color,
    snowColor: THREE.Color
  ): void {
    const posAttr = this.geometry.attributes.position;
    const normAttr = this.geometry.attributes.normal;
    let colorAttr = this.geometry.attributes.color as THREE.BufferAttribute;

    if (!colorAttr) {
      const arr = new Float32Array(posAttr.count * 3);
      this.geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      colorAttr = this.geometry.attributes.color as THREE.BufferAttribute;
    }

    // Variation subtile (AO + grain) teintée à 30 % des couleurs biome :
    // la splatmap porte la couleur, le vertex apporte le relief visuel.
    // Les peintures manuelles (paintColorAt) restent des overlays de teinte.
    const tempColor = new THREE.Color();
    const biome = new THREE.Color();
    const maxH = this.config.heightScale;

    for (let i = 0; i < posAttr.count; i++) {
      const y = (posAttr as THREE.BufferAttribute).getY(i);
      const ny = normAttr ? (normAttr as THREE.BufferAttribute).getY(i) : 1.0;
      if (ny < 0.7) {
        biome.copy(rockColor);
      } else if (y > maxH * 0.75) {
        biome.copy(snowColor);
      } else if (y < 0.3) {
        biome.copy(sandColor);
      } else {
        biome.copy(grassColor);
      }
      const shade =
        0.88 + 0.12 * (0.5 + 0.5 * Math.sin((posAttr as THREE.BufferAttribute).getX(i) * 1.7 + y * 2.3));
      tempColor.setRGB(shade, shade, shade).lerp(biome, 0.3);
      colorAttr.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
    }

    colorAttr.needsUpdate = true;
  }

  public raycastTerrain(raycaster: THREE.Raycaster): THREE.Intersection[] {
    if (!this.mesh) return [];
    return raycaster.intersectObject(this.mesh, true);
  }

  // Real-time sculpt methods via Raycasting
  public sculptAt(
    worldPoint: THREE.Vector3,
    mode: 'raise' | 'lower' | 'smooth' | 'flatten',
    radius: number,
    strength: number,
    targetHeight: number = 0
  ): void {
    if (!this.geometry) return;
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const vertexCount = posAttr.count;
    const localPoint = this.mesh.worldToLocal(worldPoint.clone());

    let avgHeight = 0;
    let avgCount = 0;
    if (mode === 'smooth') {
      for (let i = 0; i < vertexCount; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const dist = Math.hypot(vx - localPoint.x, vz - localPoint.z);
        if (dist < radius) {
          avgHeight += posAttr.getY(i);
          avgCount++;
        }
      }
      if (avgCount > 0) avgHeight /= avgCount;
    }

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const dist = Math.hypot(vx - localPoint.x, vz - localPoint.z);

      if (dist < radius) {
        // Ignore les sommets dans les trous (on ne sculpte pas le vide).
        if (pointInHole(vx, vz, this.holes)) continue;
        const factor = 0.5 * (1 + Math.cos((Math.PI * dist) / radius)) * strength * 0.15;
        const curY = posAttr.getY(i);

        let newY = curY;
        switch (mode) {
          case 'raise':
            newY = curY + factor * 2.0;
            break;
          case 'lower':
            newY = Math.max(-5, curY - factor * 2.0);
            break;
          case 'smooth':
            newY = curY + (avgHeight - curY) * factor * 1.5;
            break;
          case 'flatten':
            newY = curY + (targetHeight - curY) * factor * 2.0;
            break;
        }

        posAttr.setY(i, newY);
        this.heightArray[i] = newY;
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vz < minZ) minZ = vz;
        if (vz > maxZ) maxZ = vz;
      }
    }

    this.refreshNormalsAndColors();
    this.refreshViews(minX, minZ, maxX, maxZ);
    this.details.markDirtyRect(minX, minZ, maxX, maxZ);
  }

  // Paint custom vertex colors directly onto the terrain
  public paintColorAt(worldPoint: THREE.Vector3, colorHex: string, radius: number, strength: number): void {
    if (!this.geometry) return;
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colorAttr = this.geometry.attributes.color as THREE.BufferAttribute;
    if (!colorAttr) return;

    const localPoint = this.mesh.worldToLocal(worldPoint.clone());
    const targetColor = new THREE.Color(colorHex);
    const curColor = new THREE.Color();

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const dist = Math.hypot(vx - localPoint.x, vz - localPoint.z);

      if (dist < radius) {
        const factor = 0.5 * (1 + Math.cos((Math.PI * dist) / radius)) * strength;
        curColor.setRGB(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
        curColor.lerp(targetColor, factor);
        colorAttr.setXYZ(i, curColor.r, curColor.g, curColor.b);
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vz < minZ) minZ = vz;
        if (vz > maxZ) maxZ = vz;
      }
    }

    colorAttr.needsUpdate = true;
    this.refreshViews(minX, minZ, maxX, maxZ);
  }

  // Get interpolated terrain height at any world (X, Z) coordinate
  public getHeightAt(x: number, z: number): number {
    if (!this.geometry) return 0;
    const { size, resolution } = this.config;
    const halfSize = size / 2;

    const gx = ((x + halfSize) / size) * resolution;
    const gz = ((z + halfSize) / size) * resolution;

    const col = Math.floor(Math.max(0, Math.min(resolution - 1, gx)));
    const row = Math.floor(Math.max(0, Math.min(resolution - 1, gz)));

    const idx = row * (resolution + 1) + col;
    if (this.heightArray && idx >= 0 && idx < this.heightArray.length) {
      return this.heightArray[idx];
    }
    return 0;
  }

  public getSlopeYAt(x: number, z: number): number {
    if (!this.geometry) return 1;
    const e = Math.max(0.25, this.config.size / this.config.resolution);
    const dx = this.getHeightAt(x + e, z) - this.getHeightAt(x - e, z);
    const dz = this.getHeightAt(x, z + e) - this.getHeightAt(x, z - e);
    const inv = 1 / Math.hypot(dx / (2 * e), 1, dz / (2 * e));
    return Math.max(0, Math.min(1, inv));
  }

  public exportHeightmap(): number[] {
    return Array.from(this.heightArray);
  }

  public importHeightmap(heights: number[]): void {
    if (!this.geometry) return;
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const count = Math.min(posAttr.count, heights.length);

    for (let i = 0; i < count; i++) {
      posAttr.setY(i, heights[i]);
      this.heightArray[i] = heights[i];
    }

    this.refreshNormalsAndColors();
    this.refreshViews();
    this.details.markAllDirty();
    void this.requestSplatBake(true);
  }

  public exportDetailData(): TerrainDetailData {
    return {
      splatStrokes: this.splatStrokes.map((s) => ({ ...s })),
      holes: this.holes.map((h) => ({ ...h })),
      detailPaint: this.details.getStrokes(),
    };
  }

  public importDetailData(data?: Partial<TerrainDetailData> | null): void {
    this.splatStrokes = Array.isArray(data?.splatStrokes) ? [...(data?.splatStrokes ?? [])] : [];
    this.holes = Array.isArray(data?.holes) ? [...(data?.holes ?? [])] : [];
    this.details.setStrokes(Array.isArray(data?.detailPaint) ? [...(data?.detailPaint ?? [])] : []);
    if (this.chunker) {
      this.chunker.markAllDirty();
      this.chunker.refreshDirty(this.masterView(), this.holes);
    } else {
      this.applyHoleFacesLegacy();
    }
    void this.requestSplatBake(true);
  }

  public carveRiverBed(
    riverMesh: {
      config: { width: number };
      mesh: THREE.Mesh;
      curve: THREE.CatmullRomCurve3;
      getRiverHeightAndFlowAt: (x: number, z: number) => { height: number; flow: THREE.Vector3; inRiver: boolean };
    },
    depth: number = 2.0,
    bankWidth: number = 4.0
  ): void {
    if (!this.geometry) return;
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const vertexCount = posAttr.count;

    const riverWidth = riverMesh.config.width;
    const riverHalfWidth = riverWidth / 2;
    const totalEffectRadius = riverHalfWidth + bankWidth;

    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);

      const worldV = this.mesh.localToWorld(new THREE.Vector3(vx, posAttr.getY(i), vz));
      const riverLocalP = riverMesh.mesh.worldToLocal(worldV.clone());

      let closestDistSq = Infinity;
      let closestU = 0;
      const steps = 60;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const p = riverMesh.curve.getPointAt(u);
        const d2 = (p.x - riverLocalP.x) * (p.x - riverLocalP.x) + (p.z - riverLocalP.z) * (p.z - riverLocalP.z);
        if (d2 < closestDistSq) {
          closestDistSq = d2;
          closestU = u;
        }
      }

      const dist = Math.sqrt(closestDistSq);
      if (dist < totalEffectRadius) {
        const curvePoint = riverMesh.curve.getPointAt(closestU);
        const worldCurvePoint = riverMesh.mesh.localToWorld(curvePoint.clone());
        const targetBedHeight = worldCurvePoint.y - depth;

        let factor = 0;
        if (dist <= riverHalfWidth) {
          factor = 1.0;
        } else {
          const edgeT = (dist - riverHalfWidth) / bankWidth;
          factor = 0.5 * (1.0 + Math.cos(Math.PI * edgeT));
        }

        const curY = posAttr.getY(i);
        const newY = curY * (1 - factor) + targetBedHeight * factor;

        posAttr.setY(i, newY);
        this.heightArray[i] = newY;
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vz < minZ) minZ = vz;
        if (vz > maxZ) maxZ = vz;
      }
    }

    this.refreshNormalsAndColors();
    this.refreshViews(minX, minZ, maxX, maxZ);
    this.details.markDirtyRect(minX, minZ, maxX, maxZ);
  }

  /** Régénération (worker si grand + activé, sinon synchrone). */
  public regenerate(seed?: number): void {
    if (seed !== undefined) this.config.seed = seed;
    const token = ++this.regenToken;
    const { size, resolution, heightScale, roughness, octaves } = this.config;
    const useAsync = this.config.useWorker && resolution >= 160;
    if (!useAsync) {
      const gen = genHeights({
        seed: this.config.seed,
        size,
        res: resolution,
        heightScale,
        roughness,
        octaves,
      });
      if (token !== this.regenToken) return;
      this.applyHeights(gen);
      return;
    }
    void this.worker
      .genHeights({ seed: this.config.seed, size, res: resolution, heightScale, roughness, octaves })
      .then((gen) => {
        if (token !== this.regenToken) return;
        this.applyHeights(gen);
      })
      .catch(() => {
        if (token !== this.regenToken) return;
        this.applyHeights(
          genHeights({ seed: this.config.seed, size, res: resolution, heightScale, roughness, octaves })
        );
      });
  }

  private applyHeights(gen: Float32Array): void {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const count = Math.min(posAttr.count, gen.length);
    for (let i = 0; i < count; i++) {
      posAttr.setY(i, gen[i]);
      this.heightArray[i] = gen[i];
    }
    this.refreshNormalsAndColors();
    this.refreshViews();
    this.details.markAllDirty();
    void this.requestSplatBake(true);
  }

  /** Reconstruit les vues après changement de config (chunks, wireframe…). */
  public syncConfig(): void {
    this.material.wireframe = this.config.wireframe;
    this.material.needsUpdate = false;
    this.rebuildViews();
    this.configureDetails();
    void this.requestSplatBake(true);
  }

  public setWireframe(wireframe: boolean): void {
    this.config.wireframe = wireframe;
    if (this.material) this.material.wireframe = wireframe;
  }

  public dispose(): void {
    this.regenToken++;
    this.worker.dispose();
    this.chunker?.dispose();
    this.chunker = null;
    this.details.dispose();
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.depthMaterial) (this.depthMaterial as THREE.Material).dispose?.();
    this.splatTex?.dispose();
    this.holeTex?.dispose();
    this.splatTex = null;
    this.holeTex = null;
  }
}
