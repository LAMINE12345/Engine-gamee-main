import * as THREE from 'three';
import { normalizeCullingConfig, DEFAULT_CULLING_CONFIG } from '../../types/culling';
import type { CullingConfig } from '../../types/culling';
import { isOcclusionEligible, meshRadius, meshCenter } from './cullingUtils';

interface OccludeeState {
  uuid: string;
  hiddenFrames: number;
  occluded: boolean;
}

export interface OcclusionManagerDeps {
  /** Registre partagé des objets de scène. */
  objects: Map<string, THREE.Object3D>;
}

/**
 * OcclusionCullingManager — masque les objets entièrement cachés derrière
 * d'autres (raycast caméra → centre, échelonné sur N frames).
 *
 * - Occluders : maillages solides de rayon ≥ occluderMinRadius.
 * - Occludees : maillages solides de rayon ≤ occludeeMaxRadius.
 * - Hystérésis : masquage après `hideAfterFrames` frames cachées, réapparition
 *   immédiate dès qu'un rayon passe.
 * - Ne touche jamais à `visible` directement : émet via `onOcclusionChange`
 *   (SceneManager applique + coordonne avec les impostors).
 */
export class OcclusionCullingManager {
  public config: CullingConfig = { ...DEFAULT_CULLING_CONFIG };

  /** (uuid, occluded) — appliqué par SceneManager. */
  public onOcclusionChange: ((uuid: string, occluded: boolean) => void) | null = null;

  private readonly objects: Map<string, THREE.Object3D>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly tmpCenter = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  private occluders: THREE.Mesh[] = [];
  private occludees: OccludeeState[] = [];
  private cursor = 0;
  private frameCounter = 0;
  private raysLastFrame = 0;

  constructor(deps: OcclusionManagerDeps) {
    this.objects = deps.objects;
  }

  public applyConfig(data?: Partial<CullingConfig> | null): void {
    const wasEnabled = this.config.occlusionEnabled;
    this.config = normalizeCullingConfig(data ?? this.config);
    if (wasEnabled && !this.config.occlusionEnabled) this.clearOcclusion();
    if (!wasEnabled && this.config.occlusionEnabled) this.rescan();
  }

  /** Reclassifie occluders / occludees (appelé périodiquement + sur enable). */
  public rescan(): void {
    const cfg = this.config;
    const occluders: THREE.Mesh[] = [];
    const seen = new Set(this.occludees.map((o) => o.uuid));
    const fresh: OccludeeState[] = [];
    for (const obj of this.objects.values()) {
      if (!(obj instanceof THREE.Mesh)) continue;
      if (!isOcclusionEligible(obj)) continue;
      const geo = obj.geometry as THREE.BufferGeometry | undefined;
      if (!geo?.attributes.position) continue;
      const r = meshRadius(obj);
      if (r <= 0) continue;
      if (r >= cfg.occluderMinRadius) {
        occluders.push(obj);
        continue;
      }
      if (r <= cfg.occludeeMaxRadius) {
        if (seen.has(obj.uuid)) {
          const prev = this.occludees.find((o) => o.uuid === obj.uuid);
          if (prev) fresh.push(prev);
        } else {
          fresh.push({ uuid: obj.uuid, hiddenFrames: 0, occluded: false });
        }
      }
    }
    // Les occludees disparus : s'ils étaient occlus, on les libère.
    for (const prev of this.occludees) {
      if (prev.occluded && !fresh.some((f) => f.uuid === prev.uuid)) {
        this.emit(prev.uuid, false);
      }
    }
    this.occluders = occluders;
    this.occludees = fresh;
    this.cursor = 0;
  }

  public update(camera: THREE.PerspectiveCamera): void {
    this.raysLastFrame = 0;
    if (!this.config.occlusionEnabled) return;
    if (this.occludees.length === 0 || this.occluders.length === 0) {
      // Rebalayage léger toutes les ~2 s (à 60 fps) si une liste est vide.
      this.frameCounter++;
      if (this.frameCounter % 120 === 0) this.rescan();
      return;
    }
    this.frameCounter++;
    if (this.frameCounter % 150 === 0) this.rescan();

    camera.updateMatrixWorld();
    const budget = this.config.raysPerFrame;
    const tested = new Set<string>();
    for (let i = 0; i < budget && tested.size < this.occludees.length; i++) {
      this.cursor = (this.cursor + 1) % this.occludees.length;
      const state = this.occludees[this.cursor];
      if (tested.has(state.uuid)) break;
      tested.add(state.uuid);
      this.testOne(camera, state);
    }
  }

  private testOne(camera: THREE.PerspectiveCamera, state: OccludeeState): void {
    const obj = this.objects.get(state.uuid);
    if (!obj || !(obj instanceof THREE.Mesh)) return;
    meshCenter(obj, this.tmpCenter);
    const dist = camera.position.distanceTo(this.tmpCenter);
    if (dist < this.config.minDistance) {
      this.setOccluded(state, false);
      return;
    }
    const radius = meshRadius(obj);
    // Caméra dans le volume : jamais occlus.
    if (dist < radius) {
      this.setOccluded(state, false);
      return;
    }
    this.tmpDir.copy(this.tmpCenter).sub(camera.position).normalize();
    this.raycaster.set(camera.position, this.tmpDir);
    this.raycaster.far = Math.max(0.1, dist - radius * 0.5);
    this.raycaster.near = 0;
    this.raysLastFrame++;
    // Exclut la cible elle-même (un maillage ne s'occlut jamais lui-même).
    let occluded = false;
    const hits = this.raycaster.intersectObjects(this.occluders, false);
    for (const hit of hits) {
      if (hit.object.uuid !== state.uuid) {
        occluded = true;
        break;
      }
    }
    this.setOccluded(state, occluded);
  }

  private setOccluded(state: OccludeeState, hidden: boolean): void {
    if (hidden) {
      state.hiddenFrames++;
      if (!state.occluded && state.hiddenFrames >= this.config.hideAfterFrames) {
        state.occluded = true;
        this.emit(state.uuid, true);
      }
    } else {
      state.hiddenFrames = 0;
      if (state.occluded) {
        state.occluded = false;
        this.emit(state.uuid, false);
      }
    }
  }

  private emit(uuid: string, occluded: boolean): void {
    try {
      this.onOcclusionChange?.(uuid, occluded);
    } catch (err) {
      console.warn('Occlusion : application impossible.', err);
    }
  }

  public isOccluded(uuid: string): boolean {
    return this.occludees.some((o) => o.uuid === uuid && o.occluded);
  }

  /** Libère tout (disable / clear scène). */
  public clearOcclusion(): void {
    for (const state of this.occludees) {
      if (state.occluded) {
        state.occluded = false;
        state.hiddenFrames = 0;
        this.emit(state.uuid, false);
      }
    }
  }

  public unregister(uuid: string): void {
    const idx = this.occludees.findIndex((o) => o.uuid === uuid);
    if (idx >= 0) {
      const [state] = this.occludees.splice(idx, 1);
      if (state.occluded) this.emit(uuid, false);
    }
    const oi = this.occluders.findIndex((m) => m.uuid === uuid);
    if (oi >= 0) this.occluders.splice(oi, 1);
  }

  public clear(): void {
    this.clearOcclusion();
    this.occluders = [];
    this.occludees = [];
    this.cursor = 0;
  }

  public getStats(): {
    occluders: number;
    occludees: number;
    occludedHidden: number;
    raysLastFrame: number;
  } {
    return {
      occluders: this.occluders.length,
      occludees: this.occludees.length,
      occludedHidden: this.occludees.filter((o) => o.occluded).length,
      raysLastFrame: this.raysLastFrame,
    };
  }
}
