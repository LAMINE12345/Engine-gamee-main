import * as THREE from 'three';
import { GeometryPipeline } from './GeometryPipeline';
import type { AssetStore } from './AssetStore';
import type { LODLevelMeta } from '../../types/assets';

export interface LODManagerDeps {
  store: AssetStore;
  /** Registre partagé des objets de scène. */
  objects: Map<string, THREE.Object3D>;
}

interface Registration {
  meshUuid: string;
  assetId: string;
  /** Niveaux triés par maxDistance croissant (L0 en premier, sans blob). */
  levels: LODLevelMeta[];
  currentLevel: number;
  originalIndex: THREE.BufferAttribute | null;
  radius: number;
  residentAttrs: Map<number, THREE.BufferAttribute>;
  loadingLevels: Set<number>;
  residentBytes: number;
}

const HYSTERESIS = 0.15;
const DEFAULT_MAX_SWAPS_PER_FRAME = 6;
const DEFAULT_RESIDENT_CAP = 96 * 1024 * 1024;

/**
 * LODManager — bascule d'indices géométriques selon la distance caméra.
 *
 * Contrairement à THREE.LOD (objets multiples), le swap se fait sur le Mesh
 * existant (`geometry.setIndex`) : sélection, matériaux, export et physique
 * restent inchangés. Les attributs (positions, normales, UV) sont partagés
 * avec L0 — seuls les indices basse-résolution sont stockés/chargés.
 */
export class LODManager {
  private readonly store: AssetStore;
  private readonly objects: Map<string, THREE.Object3D>;
  private readonly regs = new Map<string, Registration>();
  private readonly maxSwapsPerFrame: number;
  private readonly residentCap: number;
  private readonly tmpVec = new THREE.Vector3();

  constructor(deps: LODManagerDeps, opts?: { maxSwapsPerFrame?: number; residentCapBytes?: number }) {
    this.store = deps.store;
    this.objects = deps.objects;
    this.maxSwapsPerFrame = opts?.maxSwapsPerFrame ?? DEFAULT_MAX_SWAPS_PER_FRAME;
    this.residentCap = opts?.residentCapBytes ?? DEFAULT_RESIDENT_CAP;
  }

  // -------------------------------------------------------------------------
  // Enregistrement
  // -------------------------------------------------------------------------

  public registerMesh(meshUuid: string, assetId: string, levels: LODLevelMeta[]): boolean {
    const obj = this.objects.get(meshUuid);
    if (!obj || !(obj instanceof THREE.Mesh)) return false;
    const geo = obj.geometry as THREE.BufferGeometry;
    if (!geo) return false;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const sorted = [...levels].sort((a, b) => a.maxDistance - b.maxDistance);
    if (sorted.length === 0 || sorted[0].maxDistance !== 0) {
      sorted.unshift({ ratio: 1, maxDistance: 0, error: 0, triangleCount: 0 });
    }
    this.unregisterMesh(meshUuid);
    this.regs.set(meshUuid, {
      meshUuid,
      assetId,
      levels: sorted,
      currentLevel: 0,
      originalIndex: geo.getIndex() ?? null,
      radius: geo.boundingSphere?.radius ?? 0,
      residentAttrs: new Map(),
      loadingLevels: new Set(),
      residentBytes: 0,
    });
    return true;
  }

  public unregisterMesh(meshUuid: string): void {
    const reg = this.regs.get(meshUuid);
    if (!reg) return;
    const obj = this.objects.get(meshUuid);
    if (obj && obj instanceof THREE.Mesh && reg.originalIndex) {
      try {
        (obj.geometry as THREE.BufferGeometry).setIndex(reg.originalIndex);
      } catch {
        /* ignore */
      }
    }
    this.regs.delete(meshUuid);
  }

  public unregisterAsset(assetId: string): void {
    for (const [uuid, reg] of this.regs) {
      if (reg.assetId === assetId) this.unregisterMesh(uuid);
    }
  }

  public clear(): void {
    for (const uuid of [...this.regs.keys()]) this.unregisterMesh(uuid);
  }

  /** Restaure tous les maillages au LOD0 (désactivation globale). */
  public resetAll(): void {
    for (const reg of this.regs.values()) {
      const obj = this.objects.get(reg.meshUuid);
      if (obj && obj instanceof THREE.Mesh && reg.originalIndex) {
        try {
          (obj.geometry as THREE.BufferGeometry).setIndex(reg.originalIndex);
        } catch {
          /* ignore */
        }
      }
      reg.currentLevel = 0;
    }
  }

  /** Distance max du dernier niveau (0 si aucun) — base du billboard. */
  public getLastMaxDistance(meshUuid: string): number {
    const reg = this.regs.get(meshUuid);
    if (!reg || reg.levels.length === 0) return 0;
    return reg.levels[reg.levels.length - 1].maxDistance;
  }

  // -------------------------------------------------------------------------
  // Mise à jour par frame
  // -------------------------------------------------------------------------

  public update(camera: THREE.PerspectiveCamera): void {
    if (this.regs.size === 0) return;
    let swaps = 0;
    for (const reg of this.regs.values()) {
      if (swaps >= this.maxSwapsPerFrame) break;
      const obj = this.objects.get(reg.meshUuid);
      if (!obj || !(obj instanceof THREE.Mesh)) continue;
      // Les maillages masqués (impostor billboard, occlusion culling, éditeur)
      // conservent leur niveau : aucun swap inutile.
      if (!obj.visible) continue;
      obj.getWorldPosition(this.tmpVec);
      const dist = Math.max(0, camera.position.distanceTo(this.tmpVec) - reg.radius);
      const target = this.pickLevel(reg, dist);
      if (target === reg.currentLevel) continue;
      if (this.applyLevel(obj, reg, target)) swaps++;
    }
  }

  private pickLevel(reg: Registration, dist: number): number {
    const c = reg.currentLevel;
    // Descente (plus grossier) avec marge haute.
    if (c + 1 < reg.levels.length && dist > reg.levels[c + 1].maxDistance * (1 + HYSTERESIS)) {
      // Saut direct possible si très loin.
      let t = c + 1;
      while (t + 1 < reg.levels.length && dist > reg.levels[t + 1].maxDistance * (1 + HYSTERESIS)) t++;
      return t;
    }
    // Remontée (plus fin) avec marge basse.
    if (c > 0 && dist < reg.levels[c].maxDistance * (1 - HYSTERESIS)) {
      let t = c - 1;
      while (t > 0 && dist < reg.levels[t].maxDistance * (1 - HYSTERESIS)) t--;
      return t;
    }
    return c;
  }

  /** Retourne true si le swap est appliqué (false = chargement en cours). */
  private applyLevel(obj: THREE.Mesh, reg: Registration, level: number): boolean {
    if (level === 0) {
      if (reg.originalIndex) {
        (obj.geometry as THREE.BufferGeometry).setIndex(reg.originalIndex);
      } else {
        (obj.geometry as THREE.BufferGeometry).setIndex(null);
      }
      reg.currentLevel = 0;
      return true;
    }
    const cached = reg.residentAttrs.get(level);
    if (cached) {
      (obj.geometry as THREE.BufferGeometry).setIndex(cached);
      reg.currentLevel = level;
      return true;
    }
    const meta = reg.levels[level];
    if (!meta?.blobKey || reg.loadingLevels.has(level)) return false;
    reg.loadingLevels.add(level);
    void (async () => {
      try {
        const blob = await this.store.getBlob(meta.blobKey!);
        if (!blob) return;
        const indices = await GeometryPipeline.decodeIndexBlob(blob);
        const attr = new THREE.BufferAttribute(indices, 1);
        reg.residentAttrs.set(level, attr);
        reg.residentBytes += indices.byteLength;
        this.evictIfNeeded(reg);
        // Applique si la cible est toujours d'actualité.
        const current = this.objects.get(reg.meshUuid);
        if (current && current instanceof THREE.Mesh && reg.currentLevel !== level) {
          (current.geometry as THREE.BufferGeometry).setIndex(attr);
          reg.currentLevel = level;
        }
      } catch (err) {
        console.warn(`LOD : niveau ${level} illisible (${reg.assetId}).`, err);
      } finally {
        reg.loadingLevels.delete(level);
      }
    })();
    return false;
  }

  private evictIfNeeded(except: Registration): void {
    let total = 0;
    for (const r of this.regs.values()) total += r.residentBytes;
    if (total <= this.residentCap) return;
    // Éviction simple : niveaux non courants des autres registrations.
    for (const r of this.regs.values()) {
      if (total <= this.residentCap) break;
      if (r === except) continue;
      for (const [lvl, attr] of r.residentAttrs) {
        if (lvl === r.currentLevel) continue;
        r.residentAttrs.delete(lvl);
        r.residentBytes -= (attr.array as Uint32Array).byteLength;
        total -= (attr.array as Uint32Array).byteLength;
        attr.onUploadCallback = () => {};
        if (total <= this.residentCap) break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  public getStats(): { meshes: number; residentBytes: number } {
    let residentBytes = 0;
    for (const r of this.regs.values()) residentBytes += r.residentBytes;
    return { meshes: this.regs.size, residentBytes };
  }
}
