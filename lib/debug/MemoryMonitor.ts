import * as THREE from 'three';

/**
 * MemoryMonitor — snapshots mémoire three.js + estimation VRAM + fuites.
 *
 * - `snapshot()` : traverse la scène (géométries / matériaux / textures
 *   uniques) + `renderer.info` (compteurs GPU + programmes).
 * - `estimateGPUBytes()` : somme des attributs géométriques + textures
 *   (w×h×4 +33 % mipmaps). Approximation documentée, pas une mesure driver.
 * - Fuites : `diff()` entre deux snapshots (ex. play-start → play-stop).
 *   `leakWarnings()` produit des messages actionnables.
 */

export interface MemorySnapshot {
  label: string;
  time: number;
  geometries: number;
  textures: number;
  materials: number;
  programs: number;
  triangles: number;
  gpuBytesEstimate: number;
}

export interface MemoryDiff {
  dGeometries: number;
  dTextures: number;
  dMaterials: number;
  dPrograms: number;
  dTriangles: number;
  dGpuBytes: number;
}

export class MemoryMonitor {
  private snapshots = new Map<string, MemorySnapshot>();

  public snapshot(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    label: string
  ): MemorySnapshot {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const texs = new Set<THREE.Texture>();
    let triangles = 0;

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const geo = (mesh as { geometry?: THREE.BufferGeometry }).geometry;
      if (geo && geo.isBufferGeometry) {
        geos.add(geo);
        const index = geo.getIndex();
        const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (pos) triangles += (index ? index.count : pos.count) / 3;
      }
      const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of list) {
        if (!m) continue;
        mats.add(m);
        const rec = m as unknown as Record<string, unknown>;
        for (const key of Object.keys(rec)) {
          const v = rec[key];
          if (v instanceof THREE.Texture) texs.add(v);
        }
      }
    });

    const info = renderer.info;
    const snap: MemorySnapshot = {
      label,
      time: Date.now(),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      materials: mats.size,
      programs: info.programs?.length ?? 0,
      triangles: Math.round(triangles),
      gpuBytesEstimate: this.estimateGPUBytes(geos, texs),
    };
    this.snapshots.set(label, snap);
    return snap;
  }

  public getSnapshot(label: string): MemorySnapshot | null {
    return this.snapshots.get(label) ?? null;
  }

  /** Dernier snapshot enregistré (affiché par le panneau profiler). */
  public latest(): MemorySnapshot | null {
    let last: MemorySnapshot | null = null;
    for (const snap of this.snapshots.values()) last = snap;
    return last;
  }

  public clearSnapshots(): void {
    this.snapshots.clear();
  }

  public diff(from: MemorySnapshot, to: MemorySnapshot): MemoryDiff {
    return {
      dGeometries: to.geometries - from.geometries,
      dTextures: to.textures - from.textures,
      dMaterials: to.materials - from.materials,
      dPrograms: to.programs - from.programs,
      dTriangles: to.triangles - from.triangles,
      dGpuBytes: to.gpuBytesEstimate - from.gpuBytesEstimate,
    };
  }

  /**
   * Messages actionnables si une session (ex. Play) a laissé des ressources
   * derrière elle. Seuils : toute croissance stricte est suspecte.
   */
  public leakWarnings(fromLabel: string, toLabel: string): string[] {
    const from = this.snapshots.get(fromLabel);
    const to = this.snapshots.get(toLabel);
    if (!from || !to) return [];
    const d = this.diff(from, to);
    const out: string[] = [];
    if (d.dGeometries > 0) {
      out.push(
        `+${d.dGeometries} géométrie(s) entre '${fromLabel}' et '${toLabel}' : .dispose() manquant probable (projectiles, VFX, LOD, import).`
      );
    }
    if (d.dTextures > 0) {
      out.push(
        `+${d.dTextures} texture(s) GPU entre '${fromLabel}' et '${toLabel}' : texture non disposée ou variante streamer non évincée.`
      );
    }
    if (d.dMaterials > 0) {
      out.push(
        `+${d.dMaterials} matériau(x) entre '${fromLabel}' et '${toLabel}' : clones de matériaux non disposés (clone(), wireframe...).`
      );
    }
    if (d.dPrograms > 0) {
      out.push(
        `+${d.dPrograms} programme(s) shader entre '${fromLabel}' et '${toLabel}' : nouveau couple matériau/lumières à chaud.`
      );
    }
    return out;
  }

  /** Estimation : attributs (bytes réels) + textures (w×h×4×1.33 mipmaps). */
  public estimateGPUBytes(
    geos: Set<THREE.BufferGeometry>,
    texs: Set<THREE.Texture>
  ): number {
    let bytes = 0;
    const bytesPerElement = (arr: unknown): number =>
      (arr as { BYTES_PER_ELEMENT?: number } | null)?.BYTES_PER_ELEMENT ?? 4;
    for (const geo of geos) {
      const index = geo.getIndex();
      if (index) {
        bytes += index.count * index.itemSize * bytesPerElement(index.array);
      }
      for (const name of Object.keys(geo.attributes)) {
        const attr = geo.getAttribute(name) as THREE.BufferAttribute;
        bytes += attr.count * attr.itemSize * bytesPerElement(attr.array);
      }
    }
    for (const tex of texs) {
      const img = tex.image as { width?: number; height?: number } | undefined;
      const w = img?.width ?? 0;
      const h = img?.height ?? 0;
      if (w > 0 && h > 0) bytes += Math.round(w * h * 4 * 1.33);
    }
    return bytes;
  }
}
