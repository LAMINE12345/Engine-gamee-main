import * as THREE from 'three';
import type { PostProcessVolumeOverrides } from '../../types/atmosphere';

export interface PostProcessVolumeEntity {
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  overrides: PostProcessVolumeOverrides;
  blendRadius: number;
  priority: number;
}

/**
 * Holds Post-Process Volume entities, exposes a debug box, and each frame
 * computes the merged scalar overrides for the camera position:
 * - inside box (with smooth falloff over blendRadius): weight 0..1
 * - blending ascending by priority: result = lerp(result, override, weight)
 */
export class PostProcessVolumeManager {
  public helperMesh: THREE.LineSegments;

  private volumes: PostProcessVolumeEntity[] = [];
  private entities: Record<string, unknown> = {};
  private debugGroup = new THREE.Group();

  constructor(scene: THREE.Scene) {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(boxGeo);
    this.helperMesh = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.9 })
    );
    this.helperMesh.name = '__AETHER_PPV_HELPER__';
    this.helperMesh.visible = false;
    this.helperMesh.userData.ignoreRaycast = true;
    this.helperMesh.userData.isEditorOnly = true;
    this.debugGroup.add(this.helperMesh);
    scene.add(this.debugGroup);
    boxGeo.dispose();
  }

  register(entityName: string, data: unknown): void {
    const e = data as Partial<PostProcessVolumeEntity>;
    this.entities[entityName] = data;
    const volume: PostProcessVolumeEntity = {
      name: entityName,
      position: (e.position as [number, number, number]) ?? [0, 0, 0],
      size: (e.size as [number, number, number]) ?? [4, 4, 4],
      overrides: e.overrides ?? {},
      blendRadius: typeof e.blendRadius === 'number' ? e.blendRadius : 1.5,
      priority: typeof e.priority === 'number' ? e.priority : 0,
    };
    // Idempotent: LogicExecutor re-registers every update tick
    const existing = this.volumes.findIndex((v) => v.name === entityName);
    if (existing >= 0) {
      this.volumes[existing] = volume;
    } else {
      this.volumes.push(volume);
    }
    this.syncHelper(volume);
  }

  update(entityName: string, data: unknown): void {
    this.unregister(entityName);
    this.register(entityName, data);
  }

  unregister(entityName: string): void {
    delete this.entities[entityName];
    const idx = this.volumes.findIndex((v) => v.name === entityName);
    if (idx >= 0) this.volumes.splice(idx, 1);
  }

  setVolumeVisible(name: string, visible: boolean): void {
    const v = this.volumes.find((x) => x.name === name);
    if (v) this.syncHelper(v, visible);
  }

  getVolumes(): readonly PostProcessVolumeEntity[] {
    return this.volumes;
  }

  /**
   * Merge overrides at a world position over the given base overrides.
   * Volumes sorted ascending by priority; result = lerp(result, value, weight)
   * so higher-priority volumes applied later win on conflicts.
   */
  compute(
    cameraPosition: THREE.Vector3,
    base: PostProcessVolumeOverrides = {}
  ): PostProcessVolumeOverrides {
    const merged: PostProcessVolumeOverrides = { ...base };
    if (this.volumes.length === 0) return merged;

    const sorted = [...this.volumes].sort((a, b) => a.priority - b.priority);

    for (const vol of sorted) {
      const w = this.weightAt(vol, cameraPosition);
      if (w <= 0.001) continue;
      for (const [key, value] of Object.entries(vol.overrides)) {
        if (typeof value !== 'number') continue;
        const k = key as keyof PostProcessVolumeOverrides;
        const prev = (merged[k] as number | undefined) ?? value;
        (merged as Record<string, number>)[k] = prev + (value - prev) * w;
      }
    }
    return merged;
  }

  /** Weight of a volume at a position: 1 inside, smooth to 0 over blendRadius. */
  private weightAt(vol: PostProcessVolumeEntity, p: THREE.Vector3): number {
    const [cx, cy, cz] = vol.position;
    const [sx, sy, sz] = vol.size;
    const hx = Math.max(sx, 0.001) * 0.5;
    const hy = Math.max(sy, 0.001) * 0.5;
    const hz = Math.max(sz, 0.001) * 0.5;
    const r = Math.max(vol.blendRadius, 0.001);

    const dx = Math.abs(p.x - cx) - hx;
    const dy = Math.abs(p.y - cy) - hy;
    const dz = Math.abs(p.z - cz) - hz;
    // Outside distance (0 when inside)
    const ox = Math.max(dx, 0);
    const oy = Math.max(dy, 0);
    const oz = Math.max(dz, 0);
    const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (outside <= 0) return 1;
    if (outside >= r) return 0;
    // smooth falloff 1 -> 0
    const t = outside / r;
    return 1 - t * t * (3 - 2 * t);
  }

  private syncHelper(vol: PostProcessVolumeEntity, visible = true): void {
    // One shared helper: show the last-registered volume's box when selected;
    // for simplicity show/hide per call (inspector sets visible on select).
    if (!visible) return;
    this.helperMesh.position.set(vol.position[0], vol.position[1], vol.position[2]);
    this.helperMesh.scale.set(
      Math.max(vol.size[0], 0.01),
      Math.max(vol.size[1], 0.01),
      Math.max(vol.size[2], 0.01)
    );
    this.helperMesh.visible = true;
  }

  dispose(): void {
    this.helperMesh.geometry.dispose();
    (this.helperMesh.material as THREE.Material).dispose();
    this.volumes = [];
    this.entities = {};
  }
}
