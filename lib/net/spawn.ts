import * as THREE from 'three';

export interface SpawnPointInfo {
  uuid: string;
  name: string;
  group: string;
  pos: THREE.Vector3;
  yaw: number;
}

export interface SpawnManagerDeps {
  objects: Map<string, THREE.Object3D>;
}

/**
 * SpawnManager — points de spawn, respawn, kill-plane.
 *
 * Sources : nœuds `spawnPoint` placés dans l'éditeur (userData.spawnPoint
 * `{name, yaw, group}`), sinon spawn par défaut (0, 1.05, 0).
 * Sélection round-robin par groupe (anti-spawnkill basique : évite de
 * réutiliser 2 fois de suite le même point quand il y en a plusieurs).
 */
export class SpawnManager {
  /** Hauteur de kill (chute) — respawn automatique en dessous. */
  public killY = -20;

  private readonly objects: Map<string, THREE.Object3D>;
  private cursor = 0;

  constructor(deps: SpawnManagerDeps) {
    this.objects = deps.objects;
  }

  public listSpawnPoints(group = 'default'): SpawnPointInfo[] {
    const out: SpawnPointInfo[] = [];
    for (const obj of this.objects.values()) {
      const ud = (obj.userData ?? {}) as Record<string, unknown>;
      if (ud.subType !== 'spawnPoint') continue;
      const cfg = (ud.spawnPoint ?? {}) as { name?: unknown; yaw?: unknown; group?: unknown };
      const g = typeof cfg.group === 'string' && cfg.group ? cfg.group : 'default';
      if (g !== group) continue;
      const pos = new THREE.Vector3();
      obj.getWorldPosition(pos);
      const cfgYaw = typeof cfg.yaw === 'number' && Number.isFinite(cfg.yaw) ? cfg.yaw : null;
      out.push({
        uuid: obj.uuid,
        name: typeof cfg.name === 'string' && cfg.name ? cfg.name : obj.name || 'Spawn',
        group: g,
        pos,
        yaw: cfgYaw ?? obj.rotation.y,
      });
    }
    // Ordre stable (round-robin déterministe).
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out;
  }

  public pickSpawn(group = 'default'): { pos: THREE.Vector3; yaw: number; name: string } {
    const points = this.listSpawnPoints(group);
    if (points.length === 0) {
      return { pos: new THREE.Vector3(0, 1.05, 0), yaw: 0, name: 'Défaut' };
    }
    const pick = points[this.cursor % points.length];
    this.cursor++;
    return { pos: pick.pos.clone(), yaw: pick.yaw, name: pick.name };
  }

  public isOutOfBounds(pos: THREE.Vector3): boolean {
    return pos.y < this.killY;
  }

  public resetCursor(): void {
    this.cursor = 0;
  }
}
