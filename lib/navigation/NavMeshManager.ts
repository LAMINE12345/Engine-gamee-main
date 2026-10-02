import * as THREE from 'three';

import { NavMeshAgentConfig } from '../../types/logic';

export interface NavGridCell {
  xIdx: number;
  zIdx: number;
  worldPos: THREE.Vector3;
  walkable: boolean;
  slope: number;
  height: number;
  isWater?: boolean;
}

export interface NavMeshConfig {
  gridResolution: number; // grid step size in meters (e.g., 0.8)
  maxSlopeAngle: number; // degrees, e.g., 45
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
  agentRadius: number; // clearance radius in meters
  agentHeight: number;
  avoidWater: boolean;
}

export interface AgentRuntimeState {
  config: NavMeshAgentConfig;
  currentPath: THREE.Vector3[];
  currentWaypointIdx: number;
  lastRepathTime: number;
  isMoving: boolean;
  reachedDestination: boolean;
  targetPos: THREE.Vector3 | null;
  debugPathLine?: THREE.Line;
}

/**
 * NavMeshManager & A* Pathfinding Engine
 * Computes walkable heightfield 3D NavGrid around terrain reliefs, steep slopes,
 * water bodies, and static obstacles, performing smooth A* pathfinding for PNJs & Enneis.
 */
export class NavMeshManager {
  public config: NavMeshConfig;
  public grid: NavGridCell[][] = []; // 2D array [xIdx][zIdx]
  public gridWidth: number = 0;
  public gridDepth: number = 0;
  public isBaked: boolean = false;

  private scene: THREE.Scene | null = null;
  private terrainGenerator: any = null;
  private debugGridMesh: THREE.Object3D | null = null;
  public showDebugGrid: boolean = false;

  // Active agents mapping
  private agentStates: Map<string, AgentRuntimeState> = new Map();

  constructor(config?: Partial<NavMeshConfig>) {
    this.config = {
      gridResolution: 0.8,
      maxSlopeAngle: 45,
      boundsMin: new THREE.Vector3(-40, -10, -40),
      boundsMax: new THREE.Vector3(40, 30, 40),
      agentRadius: 0.5,
      agentHeight: 1.8,
      avoidWater: true,
      ...config,
    };
  }

  public setTerrainGenerator(terrainGen: any): void {
    this.terrainGenerator = terrainGen;
  }

  /**
   * Bakes/Generates the NavMesh heightfield grid across scene objects and terrain
   */
  public bakeNavMesh(scene: THREE.Scene, terrainGen?: any): void {
    this.scene = scene;
    if (terrainGen) this.terrainGenerator = terrainGen;

    const res = this.config.gridResolution;
    const minX = this.config.boundsMin.x;
    const minZ = this.config.boundsMin.z;
    const maxX = this.config.boundsMax.x;
    const maxZ = this.config.boundsMax.z;

    this.gridWidth = Math.floor((maxX - minX) / res);
    this.gridDepth = Math.floor((maxZ - minZ) / res);

    this.grid = [];

    // Raycaster for obstacle collision detection against static meshes
    const raycaster = new THREE.Raycaster();
    const rayDownDir = new THREE.Vector3(0, -1, 0);

    // Collect obstacle bounding boxes from scene meshes (excluding terrain/players/rivers/sensors)
    const obstacleBoxes: THREE.Box3[] = [];
    if (scene) {
      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh &&
          obj.visible &&
          !obj.userData?.isTerrain &&
          !obj.userData?.isRiver &&
          !obj.userData?.isPlayer &&
          !obj.userData?.isSensor &&
          obj.name !== 'Grid' &&
          obj.name !== 'NavMeshDebug'
        ) {
          const box = new THREE.Box3().setFromObject(obj);
          if (!box.isEmpty()) {
            obstacleBoxes.push(box);
          }
        }
      });
    }

    // Pass 1: Height sampling and slope calculation
    for (let x = 0; x < this.gridWidth; x++) {
      this.grid[x] = [];
      const worldX = minX + x * res + res * 0.5;

      for (let z = 0; z < this.gridDepth; z++) {
        const worldZ = minZ + z * res + res * 0.5;

        let height = 0;
        let isWater = false;

        if (this.terrainGenerator && typeof this.terrainGenerator.getHeightAt === 'function') {
          height = this.terrainGenerator.getHeightAt(worldX, worldZ);
          // Check if below water level
          const waterLevel = this.terrainGenerator.config?.waterLevel ?? 0.3;
          if (height < waterLevel - 0.1) {
            isWater = true;
          }
        } else if (scene) {
          // Raycast down from sky
          raycaster.set(new THREE.Vector3(worldX, 50, worldZ), rayDownDir);
          const intersects = raycaster.intersectObjects(scene.children, true);
          if (intersects.length > 0) {
            height = intersects[0].point.y;
          }
        }

        this.grid[x][z] = {
          xIdx: x,
          zIdx: z,
          worldPos: new THREE.Vector3(worldX, height, worldZ),
          walkable: true,
          slope: 0,
          height,
          isWater,
        };
      }
    }

    // Pass 2: Calculate slope angles and obstacle overlaps
    const radToDeg = 180 / Math.PI;
    const maxSlopeRad = (this.config.maxSlopeAngle * Math.PI) / 180;

    for (let x = 0; x < this.gridWidth; x++) {
      for (let z = 0; z < this.gridDepth; z++) {
        const cell = this.grid[x][z];

        // Slope check with neighbors
        let maxDeltaH = 0;
        const neighborOffsets = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];

        for (const [dx, dz] of neighborOffsets) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx >= 0 && nx < this.gridWidth && nz >= 0 && nz < this.gridDepth) {
            const nh = this.grid[nx][nz].height;
            const dh = Math.abs(nh - cell.height);
            if (dh > maxDeltaH) maxDeltaH = dh;
          }
        }

        const slopeRad = Math.atan2(maxDeltaH, res);
        cell.slope = slopeRad * radToDeg;

        if (slopeRad > maxSlopeRad) {
          cell.walkable = false;
        }

        // Water check
        if (cell.isWater && this.config.avoidWater) {
          cell.walkable = false;
        }

        // Obstacle Bounding Box overlap check
        if (cell.walkable) {
          const sampleBox = new THREE.Box3(
            new THREE.Vector3(
              cell.worldPos.x - res * 0.4,
              cell.worldPos.y,
              cell.worldPos.z - res * 0.4
            ),
            new THREE.Vector3(
              cell.worldPos.x + res * 0.4,
              cell.worldPos.y + this.config.agentHeight,
              cell.worldPos.z + res * 0.4
            )
          );

          for (const obsBox of obstacleBoxes) {
            if (sampleBox.intersectsBox(obsBox)) {
              cell.walkable = false;
              break;
            }
          }
        }
      }
    }

    this.isBaked = true;
    if (this.showDebugGrid) {
      this.rebuildDebugGridMesh();
    }
  }

  /**
   * Finds world coordinate to grid indices
   */
  public worldToGrid(pos: THREE.Vector3): { x: number; z: number } | null {
    const res = this.config.gridResolution;
    const minX = this.config.boundsMin.x;
    const minZ = this.config.boundsMin.z;

    const x = Math.floor((pos.x - minX) / res);
    const z = Math.floor((pos.z - minZ) / res);

    if (x >= 0 && x < this.gridWidth && z >= 0 && z < this.gridDepth) {
      return { x, z };
    }
    return null;
  }

  /**
   * Finds nearest walkable cell if target is slightly blocked
   */
  private findNearestWalkableCell(x: number, z: number, maxSearchRadius: number = 5): { x: number; z: number } | null {
    if (this.grid[x]?.[z]?.walkable) return { x, z };

    for (let r = 1; r <= maxSearchRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx >= 0 && nx < this.gridWidth && nz >= 0 && nz < this.gridDepth) {
            if (this.grid[nx][nz].walkable) {
              return { x: nx, z: nz };
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * A* Pathfinding implementation returning 3D waypoint array
   */
  public findPath(startPos: THREE.Vector3, targetPos: THREE.Vector3): THREE.Vector3[] {
    if (!this.isBaked || this.grid.length === 0) return [];

    let startCell = this.worldToGrid(startPos);
    let targetCell = this.worldToGrid(targetPos);

    if (!startCell || !targetCell) return [];

    // Resolve nearest walkable cells if needed
    const startWalk = this.findNearestWalkableCell(startCell.x, startCell.z);
    const targetWalk = this.findNearestWalkableCell(targetCell.x, targetCell.z);

    if (!startWalk || !targetWalk) return [];

    const startNode = this.grid[startWalk.x][startWalk.z];
    const targetNode = this.grid[targetWalk.x][targetWalk.z];

    const openSet: NavGridCell[] = [startNode];
    const closedSet: Set<string> = new Set();

    const gScore: Map<NavGridCell, number> = new Map();
    const fScore: Map<NavGridCell, number> = new Map();
    const cameFrom: Map<NavGridCell, NavGridCell> = new Map();

    gScore.set(startNode, 0);
    fScore.set(startNode, this.heuristic(startNode, targetNode));

    while (openSet.length > 0) {
      // Find node with lowest fScore
      let current = openSet[0];
      let lowestF = fScore.get(current) ?? Infinity;

      for (let i = 1; i < openSet.length; i++) {
        const score = fScore.get(openSet[i]) ?? Infinity;
        if (score < lowestF) {
          lowestF = score;
          current = openSet[i];
        }
      }

      // Reached destination
      if (current === targetNode) {
        return this.reconstructPath(cameFrom, current, targetPos);
      }

      // Remove current from openSet
      const idx = openSet.indexOf(current);
      if (idx !== -1) openSet.splice(idx, 1);

      const cellKey = `${current.xIdx}_${current.zIdx}`;
      closedSet.add(cellKey);

      // Neighbors (8 directions)
      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        const nKey = `${neighbor.xIdx}_${neighbor.zIdx}`;
        if (closedSet.has(nKey) || !neighbor.walkable) continue;

        // Distance cost (1.0 straight, 1.414 diagonal + height delta cost)
        const dx = Math.abs(neighbor.xIdx - current.xIdx);
        const dz = Math.abs(neighbor.zIdx - current.zIdx);
        const baseCost = dx !== 0 && dz !== 0 ? 1.414 : 1.0;
        const heightPenalty = Math.abs(neighbor.height - current.height) * 1.5;
        const tentG = (gScore.get(current) ?? Infinity) + baseCost + heightPenalty;

        if (!openSet.includes(neighbor)) {
          openSet.push(neighbor);
        } else if (tentG >= (gScore.get(neighbor) ?? Infinity)) {
          continue;
        }

        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentG);
        fScore.set(neighbor, tentG + this.heuristic(neighbor, targetNode));
      }
    }

    // No path found
    return [];
  }

  private heuristic(a: NavGridCell, b: NavGridCell): number {
    const dx = Math.abs(a.xIdx - b.xIdx);
    const dz = Math.abs(a.zIdx - b.zIdx);
    const dy = Math.abs(a.height - b.height);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) + dy;
  }

  private getNeighbors(cell: NavGridCell): NavGridCell[] {
    const neighbors: NavGridCell[] = [];
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];

    for (const [dx, dz] of dirs) {
      const nx = cell.xIdx + dx;
      const nz = cell.zIdx + dz;
      if (nx >= 0 && nx < this.gridWidth && nz >= 0 && nz < this.gridDepth) {
        neighbors.push(this.grid[nx][nz]);
      }
    }
    return neighbors;
  }

  /**
   * Reconstructs raw A* path and applies String Pulling / Path Smoothing
   */
  private reconstructPath(
    cameFrom: Map<NavGridCell, NavGridCell>,
    current: NavGridCell,
    actualTargetPos: THREE.Vector3
  ): THREE.Vector3[] {
    const rawPath: THREE.Vector3[] = [current.worldPos.clone()];

    let curr = current;
    while (cameFrom.has(curr)) {
      curr = cameFrom.get(curr)!;
      rawPath.unshift(curr.worldPos.clone());
    }

    // Replace end with exact target position if nearby
    if (rawPath.length > 0) {
      rawPath[rawPath.length - 1].copy(actualTargetPos);
    }

    // String Pulling / Path Shortcutting
    return this.smoothPath(rawPath);
  }

  /**
   * Smoothes jagged grid path by checking direct line of sight between waypoints
   */
  private smoothPath(path: THREE.Vector3[]): THREE.Vector3[] {
    if (path.length <= 2) return path;

    const smoothed: THREE.Vector3[] = [path[0]];
    let currentIdx = 0;

    while (currentIdx < path.length - 1) {
      let furthestVisible = currentIdx + 1;

      for (let testIdx = path.length - 1; testIdx > currentIdx + 1; testIdx--) {
        if (this.hasLineOfSight(path[currentIdx], path[testIdx])) {
          furthestVisible = testIdx;
          break;
        }
      }

      smoothed.push(path[furthestVisible]);
      currentIdx = furthestVisible;
    }

    return smoothed;
  }

  /**
   * Checks if a straight ray between two points is clear on the NavGrid
   */
  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dist = from.distanceTo(to);
    const steps = Math.ceil(dist / (this.config.gridResolution * 0.5));
    const dir = new THREE.Vector3().subVectors(to, from).divideScalar(steps);

    const temp = from.clone();
    for (let i = 0; i <= steps; i++) {
      const gridPos = this.worldToGrid(temp);
      if (!gridPos) return false;

      const cell = this.grid[gridPos.x]?.[gridPos.z];
      if (!cell || !cell.walkable) return false;

      temp.add(dir);
    }
    return true;
  }

  /**
   * Registers a NavMeshAgent entity and manages steering runtime
   */
  public registerAgent(entityId: string, config: NavMeshAgentConfig): void {
    this.agentStates.set(entityId, {
      config,
      currentPath: [],
      currentWaypointIdx: 0,
      lastRepathTime: 0,
      isMoving: false,
      reachedDestination: false,
      targetPos: config.targetPosition ? new THREE.Vector3(config.targetPosition.x, config.targetPosition.y, config.targetPosition.z) : null,
    });
  }

  public unregisterAgent(entityId: string): void {
    const state = this.agentStates.get(entityId);
    if (state && state.debugPathLine && this.scene) {
      this.scene.remove(state.debugPathLine);
      state.debugPathLine.geometry.dispose();
    }
    this.agentStates.delete(entityId);
  }

  /**
   * Updates steering and movement for all active registered agents
   */
  public updateAgents(dt: number, getEntityPos: (id: string) => THREE.Vector3 | null, getPlayerPos: () => THREE.Vector3 | null): void {
    if (!this.isBaked) return;

    for (const [entityId, state] of this.agentStates.entries()) {
      const entityPos = getEntityPos(entityId);
      if (!entityPos) continue;

      // 1. Resolve Target Position
      let destPos: THREE.Vector3 | null = null;
      if (state.config.targetType === 'Player') {
        destPos = getPlayerPos();
      } else if (state.config.targetType === 'Entity' && state.config.targetEntityId) {
        destPos = getEntityPos(state.config.targetEntityId);
      } else if (state.config.targetPosition) {
        destPos = new THREE.Vector3(state.config.targetPosition.x, state.config.targetPosition.y, state.config.targetPosition.z);
      }

      if (!destPos) continue;

      // 2. Repath if target moved or timer elapsed
      const now = performance.now() * 0.001;
      const distToDest = entityPos.distanceTo(destPos);

      const needRepath =
        state.currentPath.length === 0 ||
        (state.config.autoRepath && now - state.lastRepathTime > (state.config.repathInterval || 0.6) && distToDest > state.config.stoppingDistance);

      if (needRepath) {
        state.lastRepathTime = now;
        state.currentPath = this.findPath(entityPos, destPos);
        state.currentWaypointIdx = 0;
        state.reachedDestination = false;
        this.updateAgentDebugLine(state);
      }

      // 3. Move along waypoints
      if (state.currentPath.length > 0 && state.currentWaypointIdx < state.currentPath.length) {
        if (distToDest <= (state.config.stoppingDistance || 0.8)) {
          state.isMoving = false;
          state.reachedDestination = true;
          continue;
        }

        const nextWaypoint = state.currentPath[state.currentWaypointIdx];
        const toWaypoint = new THREE.Vector3().subVectors(nextWaypoint, entityPos);
        toWaypoint.y = 0; // Move horizontally, Y set by terrain height
        const distToWaypoint = toWaypoint.length();

        if (distToWaypoint < 0.6) {
          state.currentWaypointIdx++;
          if (state.currentWaypointIdx >= state.currentPath.length) {
            state.isMoving = false;
            state.reachedDestination = true;
            continue;
          }
        } else {
          state.isMoving = true;
          state.reachedDestination = false;

          toWaypoint.normalize();
          const moveDist = state.config.speed * dt;
          entityPos.add(toWaypoint.multiplyScalar(moveDist));

          // Set Y coordinate on terrain
          if (this.terrainGenerator && typeof this.terrainGenerator.getHeightAt === 'function') {
            entityPos.y = this.terrainGenerator.getHeightAt(entityPos.x, entityPos.z);
          }
        }
      }
    }
  }

  /**
   * Renders/Updates visual path line for selected agent
   */
  private updateAgentDebugLine(state: AgentRuntimeState): void {
    if (!this.showDebugGrid || !this.scene || state.currentPath.length === 0) {
      if (state.debugPathLine && this.scene) {
        this.scene.remove(state.debugPathLine);
        state.debugPathLine = undefined;
      }
      return;
    }

    const points = state.currentPath.map((p) => new THREE.Vector3(p.x, p.y + 0.3, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(points);

    if (!state.debugPathLine) {
      const mat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 3 });
      state.debugPathLine = new THREE.Line(geo, mat);
      this.scene.add(state.debugPathLine);
    } else {
      state.debugPathLine.geometry.dispose();
      state.debugPathLine.geometry = geo;
    }
  }

  /**
   * Rebuilds 3D visual debug grid overlay mesh
   */
  public rebuildDebugGridMesh(): void {
    if (this.debugGridMesh && this.scene) {
      this.scene.remove(this.debugGridMesh);
      this.debugGridMesh = null;
    }

    if (!this.showDebugGrid || !this.isBaked || !this.scene) return;

    const group = new THREE.Group();
    group.name = 'NavMeshDebug';

    const res = this.config.gridResolution;
    const boxGeo = new THREE.BoxGeometry(res * 0.9, 0.05, res * 0.9);
    const walkableMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35, wireframe: false });
    const blockedMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.45, wireframe: false });

    // InstancedMesh or simple merged grid
    for (let x = 0; x < this.gridWidth; x++) {
      for (let z = 0; z < this.gridDepth; z++) {
        const cell = this.grid[x][z];
        const mesh = new THREE.Mesh(boxGeo, cell.walkable ? walkableMat : blockedMat);
        mesh.position.copy(cell.worldPos);
        mesh.position.y += 0.05;
        group.add(mesh);
      }
    }

    this.debugGridMesh = group;
    this.scene.add(this.debugGridMesh);
  }

  public toggleDebugGrid(show?: boolean): boolean {
    this.showDebugGrid = show !== undefined ? show : !this.showDebugGrid;
    this.rebuildDebugGridMesh();
    return this.showDebugGrid;
  }
}
