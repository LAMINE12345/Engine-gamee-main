import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type {
  EngineEvents,
  GizmoMode,
  GizmoSpace,
  SceneNode,
  SnapSettings,
} from '../../types/engine';
import { DEFAULT_SNAP_SETTINGS } from '../../types/engine';
import type { ECSWorld } from '../ecs/ECS';
import { TransformComponent } from '../ecs/ECS';
import {
  applySurfaceSnap,
  applyWorldOffset,
  collectWorldVertices,
  findVertexSnapOffset,
} from '../snap/SnapService';

export interface SelectionDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  /** Registre partagé des objets de la scène (référence, pas copie). */
  objects: Map<string, THREE.Object3D>;
  ecsWorld: ECSWorld;
  events: EngineEvents;
  toSceneNode(obj: THREE.Object3D): SceneNode;
  isPlaying(): boolean;
  setOrbitEnabled(enabled: boolean): void;
  /** Point de sauvegarde historique (fin de drag gizmo, fin de sculpt...). */
  onHistoryCheckpoint(): void;
  /** Sync eau + event UI après une modification gizmo. */
  onGizmoChanged(obj: THREE.Object3D): void;
  /** Clic sur une entité pendant le Play (events OnClick du graphe logique). */
  onClickedEntity(entityId: string): void;
}

/**
 * SelectionManager — sélection, gizmo TransformControls, picking souris,
 * multi-sélection (groupe pivot + box-select 2D) et snapping.
 *
 * Possède : l'objet sélectionné, la liste multi-sélection, le groupe pivot,
 * les TransformControls (+ helper ajouté à la scène), le raycaster de picking
 * et l'état du drag-select 2D.
 */
export class SelectionManager {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly objects: Map<string, THREE.Object3D>;
  private readonly ecsWorld: ECSWorld;
  private readonly deps: SelectionDeps;

  private transformControls: TransformControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();

  private selectedObject: THREE.Object3D | null = null;
  private selectedObjects: THREE.Object3D[] = [];
  private multiSelectGroup: THREE.Group | null = null;
  /** Parents d'origine des membres du groupe multi (restauration exacte). */
  private multiSelectParents: Map<string, THREE.Object3D | null> = new Map();

  private isDragSelecting = false;
  private selectionBoxElement: HTMLDivElement | null = null;
  private selectionStartPos: { x: number; y: number } = { x: 0, y: 0 };
  private pointerDownPos: { x: number; y: number } = { x: 0, y: 0 };

  private gizmoMode: GizmoMode = 'translate';
  private gizmoSpace: GizmoSpace = 'world';
  /** TIER 2.4 — snap complet (grille / surface / sommet + pas rot/échelle). */
  private snapSettings: SnapSettings = { ...DEFAULT_SNAP_SETTINGS };
  /** Sommets cibles échantillonnés au début d'un drag vertex. */
  private vertexSnapTargets: THREE.Vector3[] = [];

  private isTransformDragging = false;

  constructor(deps: SelectionDeps) {
    this.deps = deps;
    this.scene = deps.scene;
    this.camera = deps.camera;
    this.domElement = deps.domElement;
    this.objects = deps.objects;
    this.ecsWorld = deps.ecsWorld;

    this.transformControls = new TransformControls(this.camera, this.domElement);
    this.transformControls.size = 0.85;
    this.transformControls.setMode(this.gizmoMode);
    this.transformControls.setSpace(this.gizmoSpace);

    this.transformControls.addEventListener('dragging-changed', (event) => {
      const isDragging = Boolean((event as { value?: boolean }).value);
      this.isTransformDragging = isDragging;
      this.deps.setOrbitEnabled(!isDragging);

      if (isDragging) {
        // Amorçage vertex snap : sommets des autres objets (une seule fois).
        if (
          this.snapSettings.enabled &&
          this.snapSettings.mode === 'vertex' &&
          this.gizmoMode === 'translate'
        ) {
          this.vertexSnapTargets = this.sampleVertexTargets();
        }
      } else {
        this.vertexSnapTargets = [];
        if (this.multiSelectGroup) {
          // Temporarily dissolve to commit world positions, rotations, scales to ECS/three
          this.dissolveMultiSelectGroup();
          // Notify transform updates for each component
          this.selectedObjects.forEach((obj) => {
            this.deps.onGizmoChanged(obj);
          });
          // Regroup at new composite center
          this.recreateMultiSelectGroup();
        } else if (this.selectedObject) {
          const entity = this.ecsWorld.getEntity(this.selectedObject.uuid);
          if (entity) {
            const trans = entity.getComponent<TransformComponent>('Transform');
            if (trans) trans.syncFromObject3D(this.selectedObject);
          }
        }
        this.deps.onHistoryCheckpoint();
      }
    });

    this.transformControls.addEventListener('change', () => {
      if (this.selectedObject) {
        this.deps.onGizmoChanged(this.selectedObject);
      }
      // Surface / vertex snap pendant le drag (hors grille).
      if (
        this.isTransformDragging &&
        this.snapSettings.enabled &&
        this.snapSettings.mode !== 'grid' &&
        this.gizmoMode === 'translate'
      ) {
        this.applySpatialSnap();
      }
    });

    const gizmo = this.transformControls.getHelper();
    gizmo.name = '__AETHER_GIZMO_HELPER__';
    this.scene.add(gizmo);
  }

  // -------------------------------------------------------------------------
  // Accès en lecture (utilisés par la boucle et l'orchestrateur)
  // -------------------------------------------------------------------------

  public getSelectedObject(): THREE.Object3D | null {
    return this.selectedObject;
  }

  public getSelectedObjects(): THREE.Object3D[] {
    return this.selectedObjects;
  }

  public getSelectedIds(): string[] {
    return this.selectedObjects.map((o) => o.uuid);
  }

  public get isDraggingTransform(): boolean {
    return this.isTransformDragging;
  }

  public get isSnappingEnabled(): boolean {
    return this.snapSettings.enabled;
  }

  public get translateSnap(): number {
    return this.snapSettings.translateSnap;
  }

  public getSnapSettings(): SnapSettings {
    return { ...this.snapSettings };
  }

  public get dragging(): boolean {
    return this.transformControls.dragging;
  }

  /** Le gizmo est-il survolé ? (pour décider du box-select au pointerdown). */
  public isGizmoHovered(): boolean {
    const tc = this.transformControls as unknown as { pointerIsOver?: boolean };
    return this.transformControls.dragging || tc.pointerIsOver === true;
  }

  /**
   * Configure le raycaster partagé depuis des coordonnées écran et le retourne
   * (pour les outils qui raycastent eux-mêmes : terrain, plan de travail).
   */
  public setRayFromScreen(clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster;
  }

  /** Ré-emet l'event de sélection courante (après updatePhysics/updateLogic...). */
  public refreshSelection(): void {
    this.triggerSelectionChange();
  }

  public recordPointerDown(x: number, y: number): void {
    this.pointerDownPos = { x, y };
  }

  public getPointerDown(): { x: number; y: number } {
    return this.pointerDownPos;
  }

  // -------------------------------------------------------------------------
  // Sélection
  // -------------------------------------------------------------------------

  private triggerSelectionChange(): void {
    const node = this.selectedObject ? this.deps.toSceneNode(this.selectedObject) : null;
    const ids = this.selectedObjects.map((o) => o.uuid);
    this.deps.events.onSelectionChange(node, ids);
  }

  public selectObject(object: THREE.Object3D | null): void {
    this.dissolveMultiSelectGroup();
    if (!object || !this.objects.has(object.uuid)) {
      this.deselect();
      return;
    }
    // Garde-fou : un objet hors du graphe de scène fait spammer le gizmo
    // (`TransformControls: ... must be a part of the scene graph`) à chaque frame.
    if (object.parent === null) {
      console.warn(
        `[Selection] '${object.name}' (${object.uuid}) refusé au gizmo : hors du graphe de scène.`
      );
      this.deselect();
      return;
    }

    this.selectedObject = object;
    this.selectedObjects = [object];

    if (!this.deps.isPlaying()) {
      this.transformControls.attach(object);
    } else {
      this.transformControls.detach();
    }

    this.triggerSelectionChange();
  }

  public selectById(id: string): void {
    const obj = this.objects.get(id);
    if (obj) {
      this.selectObject(obj);
    } else {
      this.deselect();
    }
  }

  public deselect(): void {
    this.dissolveMultiSelectGroup();
    this.selectedObject = null;
    this.selectedObjects = [];
    this.transformControls.detach();
    this.triggerSelectionChange();
  }

  /** Alias sémantique pour HistorySelectionPort. */
  public clearSelection(): void {
    this.deselect();
  }

  public toggleMultiSelect(object: THREE.Object3D): void {
    if (!this.objects.has(object.uuid)) return;

    this.dissolveMultiSelectGroup();

    const index = this.selectedObjects.findIndex((o) => o.uuid === object.uuid);
    if (index === -1) {
      this.selectedObjects.push(object);
    } else {
      this.selectedObjects.splice(index, 1);
    }

    if (this.selectedObjects.length === 0) {
      this.deselect();
    } else if (this.selectedObjects.length === 1) {
      this.selectObject(this.selectedObjects[0]);
    } else {
      this.selectedObject = this.selectedObjects[this.selectedObjects.length - 1];
      this.recreateMultiSelectGroup();
      this.triggerSelectionChange();
    }
  }

  /** Remplace la sélection par une liste (fin de box-select, restore historique). */
  public setMultiSelection(objs: THREE.Object3D[], additive: boolean): void {
    this.dissolveMultiSelectGroup();
    if (additive) {
      objs.forEach((obj) => {
        const idx = this.selectedObjects.findIndex((o) => o.uuid === obj.uuid);
        if (idx === -1) {
          this.selectedObjects.push(obj);
        } else {
          this.selectedObjects.splice(idx, 1);
        }
      });
    } else {
      this.selectedObjects = [...objs];
    }

    if (this.selectedObjects.length === 1) {
      this.selectObject(this.selectedObjects[0]);
    } else if (this.selectedObjects.length > 1) {
      this.selectedObject = this.selectedObjects[this.selectedObjects.length - 1];
      this.recreateMultiSelectGroup();
      this.triggerSelectionChange();
    }
  }

  /** Restaure une sélection à partir d'ids (undo/redo). */
  public restoreSelection(ids: string[]): void {
    const restoredObjects: THREE.Object3D[] = [];
    ids.forEach((id) => {
      const obj = this.objects.get(id);
      if (obj) restoredObjects.push(obj);
    });

    if (restoredObjects.length === 1) {
      this.selectObject(restoredObjects[0]);
    } else if (restoredObjects.length > 1) {
      this.selectedObjects = restoredObjects;
      this.selectedObject = restoredObjects[restoredObjects.length - 1];
      this.recreateMultiSelectGroup();
      this.triggerSelectionChange();
    } else {
      this.deselect();
    }
  }

  private recreateMultiSelectGroup(): void {
    if (this.selectedObjects.length <= 1) return;

    this.dissolveMultiSelectGroup();

    // 1. Calculate bounding center of selected items
    const compositeCenter = new THREE.Vector3();
    const tempV = new THREE.Vector3();
    this.selectedObjects.forEach((obj) => {
      obj.getWorldPosition(tempV);
      compositeCenter.add(tempV);
    });
    compositeCenter.divideScalar(this.selectedObjects.length);

    // 2. Create the pivot group wrapper
    this.multiSelectGroup = new THREE.Group();
    this.multiSelectGroup.name = '__AETHER_MULTI_SELECT_GROUP__';
    this.multiSelectGroup.position.copy(compositeCenter);
    this.scene.add(this.multiSelectGroup);

    // 3. Attach each child to the group maintaining world transform offsets.
    //    Mémorise le parent d'origine (hiérarchie) pour restauration exacte.
    this.multiSelectParents.clear();
    this.selectedObjects.forEach((obj) => {
      this.multiSelectParents.set(obj.uuid, obj.parent);
      this.multiSelectGroup!.attach(obj);
    });

    // 4. Attach gizmo to pivot group
    if (!this.deps.isPlaying()) {
      this.transformControls.attach(this.multiSelectGroup);
    }
  }

  public dissolveMultiSelectGroup(): void {
    if (!this.multiSelectGroup) return;

    this.transformControls.detach();

    // Rend chaque enfant à son parent d'origine (monde préservé).
    // Si le parent a disparu entre-temps (supprimé), repli sur la scène.
    const children = [...this.multiSelectGroup.children];
    children.forEach((child) => {
      const originalParent = this.multiSelectParents.get(child.uuid) ?? null;
      let validParent: THREE.Object3D | null = null;
      if (originalParent) {
        let cursor: THREE.Object3D | null = originalParent;
        while (cursor) {
          if (cursor === this.scene) {
            validParent = originalParent;
            break;
          }
          cursor = cursor.parent;
        }
      }
      (validParent ?? this.scene).attach(child);

      // Sync updated coordinates to ECS transform component
      const entity = this.ecsWorld.getEntity(child.uuid);
      if (entity) {
        const trans = entity.getComponent<TransformComponent>('Transform');
        if (trans) trans.syncFromObject3D(child);
      }
    });
    this.multiSelectParents.clear();

    this.scene.remove(this.multiSelectGroup);
    this.multiSelectGroup = null;
  }

  // -------------------------------------------------------------------------
  // Gizmo : mode, espace, snapping, cycle Play
  // -------------------------------------------------------------------------

  public setGizmoMode(mode: GizmoMode): void {
    this.gizmoMode = mode;
    this.transformControls.setMode(mode);
  }

  public setGizmoSpace(space: GizmoSpace): void {
    this.gizmoSpace = space;
    this.transformControls.setSpace(space);
  }

  public setSnapping(enabled: boolean, translateSnap?: number, rotateSnap?: number): void {
    const patch: Partial<SnapSettings> = { enabled };
    if (translateSnap !== undefined) patch.translateSnap = translateSnap;
    if (rotateSnap !== undefined) {
      patch.rotateSnapDeg = Math.round((rotateSnap * 180) / Math.PI);
    }
    this.setSnapSettings(patch);
  }

  /** TIER 2.4 — patch partiel des réglages de snap + application gizmo. */
  public setSnapSettings(partial: Partial<SnapSettings>): void {
    this.snapSettings = { ...this.snapSettings, ...partial };
    this.applySnapToGizmo();
    if (partial.translateSnap !== undefined) {
      // Les valeurs non finies retombent sur le défaut (anti-NaN gizmo).
      if (!Number.isFinite(this.snapSettings.translateSnap) || this.snapSettings.translateSnap <= 0) {
        this.snapSettings.translateSnap = DEFAULT_SNAP_SETTINGS.translateSnap;
      }
    }
    if (
      partial.rotateSnapDeg !== undefined &&
      (!Number.isFinite(this.snapSettings.rotateSnapDeg) || this.snapSettings.rotateSnapDeg <= 0)
    ) {
      this.snapSettings.rotateSnapDeg = DEFAULT_SNAP_SETTINGS.rotateSnapDeg;
    }
    if (
      partial.scaleSnap !== undefined &&
      this.snapSettings.scaleSnap !== null &&
      (!Number.isFinite(this.snapSettings.scaleSnap) || this.snapSettings.scaleSnap <= 0)
    ) {
      this.snapSettings.scaleSnap = DEFAULT_SNAP_SETTINGS.scaleSnap;
    }
    this.vertexSnapTargets = [];
  }

  private applySnapToGizmo(): void {
    const s = this.snapSettings;
    const rotRad = (s.rotateSnapDeg * Math.PI) / 180;

    if (!s.enabled) {
      this.transformControls.setTranslationSnap(null);
      this.transformControls.setRotationSnap(null);
      this.transformControls.setScaleSnap(null);
      return;
    }

    this.transformControls.setRotationSnap(rotRad);
    this.transformControls.setScaleSnap(s.scaleSnap);

    // Surface / vertex : translation gizmo libre, le SnapService corrige après.
    if (s.mode === 'grid') {
      this.transformControls.setTranslationSnap(s.translateSnap);
    } else {
      this.transformControls.setTranslationSnap(null);
    }
  }

  /** Cibles vertex = sommets des objets enregistrés hors sélection. */
  private sampleVertexTargets(): THREE.Vector3[] {
    const excluded = new Set<THREE.Object3D>();
    const attached = this.transformControls.object;
    if (attached) {
      excluded.add(attached);
      attached.traverse((c) => excluded.add(c));
    }
    this.selectedObjects.forEach((o) => {
      excluded.add(o);
      o.traverse((c) => excluded.add(c));
    });

    const out: THREE.Vector3[] = [];
    const budget = 600;
    for (const obj of this.objects.values()) {
      if (excluded.has(obj) || !obj.visible) continue;
      out.push(...collectWorldVertices(obj, Math.min(64, budget - out.length)));
      if (out.length >= budget) break;
    }
    return out;
  }

  /** Applique surface ou vertex snap sur la cible du gizmo pendant le drag. */
  private applySpatialSnap(): void {
    const target = this.transformControls.object;
    if (!target) return;

    if (this.snapSettings.mode === 'surface') {
      const excluded = new Set<THREE.Object3D>();
      excluded.add(target);
      target.traverse((c) => excluded.add(c));
      this.selectedObjects.forEach((o) => {
        excluded.add(o);
        o.traverse((c) => excluded.add(c));
      });
      const candidates = [...this.objects.values()].filter((o) => !excluded.has(o) && o.visible);
      if (candidates.length === 0) return;

      const raycaster = new THREE.Raycaster();
      const applied = applySurfaceSnap(target, raycaster, candidates, {
        maxDrop: this.snapSettings.surfaceMaxDrop,
      });
      if (applied) {
        this.deps.onGizmoChanged(target);
        if (this.selectedObject && target !== this.selectedObject) {
          this.deps.onGizmoChanged(this.selectedObject);
        }
      }
      return;
    }

    if (this.snapSettings.mode === 'vertex') {
      if (this.vertexSnapTargets.length === 0) {
        this.vertexSnapTargets = this.sampleVertexTargets();
      }
      const moving = collectWorldVertices(target, 128);
      const offset = findVertexSnapOffset(
        moving,
        this.vertexSnapTargets,
        this.snapSettings.vertexThreshold
      );
      if (offset && offset.lengthSq() > 1e-12) {
        applyWorldOffset(target, offset);
        this.deps.onGizmoChanged(target);
        if (this.selectedObject && target !== this.selectedObject) {
          this.deps.onGizmoChanged(this.selectedObject);
        }
      }
    }
  }

  /** Entrée en Play : le gizmo se détache. */
  public detachGizmo(): void {
    this.transformControls.detach();
  }

  /** Sortie de Play : le gizmo se rattache à la sélection. */
  public attachGizmoToSelection(): void {
    if (this.selectedObject) {
      this.transformControls.attach(this.selectedObject);
    }
  }

  /** Met à jour l'unité de snap (ex. plan de travail) sans toucher au toggle. */
  public setTranslateSnapUnit(unit: number): void {
    this.setSnapSettings({ translateSnap: unit });
  }

  // -------------------------------------------------------------------------
  // Picking souris
  // -------------------------------------------------------------------------

  public raycastObjects(e: PointerEvent): THREE.Object3D | null {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const pickableObjects: THREE.Object3D[] = [];
    this.objects.forEach((obj) => {
      if (obj.visible) pickableObjects.push(obj);
    });

    const intersects = this.raycaster.intersectObjects(pickableObjects, true);
    if (intersects.length > 0) {
      let target: THREE.Object3D | null = intersects[0].object;
      while (target && !this.objects.has(target.uuid) && target.parent !== this.scene) {
        target = target.parent;
      }
      if (target && this.objects.has(target.uuid)) {
        return target;
      }
    }
    return null;
  }

  public performRaycast(e: PointerEvent): void {
    const isShift = e.shiftKey;
    const target = this.raycastObjects(e);

    if (target) {
      if (this.deps.isPlaying()) {
        const entity = this.ecsWorld.getEntity(target.uuid);
        if (entity) {
          this.deps.onClickedEntity(entity.id);
        }
      }
      if (isShift) {
        this.toggleMultiSelect(target);
      } else {
        this.selectObject(target);
      }
    } else {
      if (!isShift) {
        this.deselect();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Box-select 2D (drag-select)
  // -------------------------------------------------------------------------

  public beginDragSelect(x: number, y: number): void {
    this.isDragSelecting = true;
    this.selectionStartPos = { x, y };
    this.deps.setOrbitEnabled(false);
  }

  public get draggingBox(): boolean {
    return this.isDragSelecting;
  }

  public updateDragSelect(currentX: number, currentY: number): void {
    if (!this.isDragSelecting) return;
    if (!this.selectionBoxElement) {
      this.selectionBoxElement = document.createElement('div');
      this.selectionBoxElement.style.position = 'fixed';
      this.selectionBoxElement.style.border = '1.5px solid #38bdf8';
      this.selectionBoxElement.style.backgroundColor = 'rgba(56, 189, 248, 0.15)';
      this.selectionBoxElement.style.pointerEvents = 'none';
      this.selectionBoxElement.style.zIndex = '99999';
      this.selectionBoxElement.style.borderRadius = '4px';
      document.body.appendChild(this.selectionBoxElement);
    }

    const left = Math.min(this.selectionStartPos.x, currentX);
    const top = Math.min(this.selectionStartPos.y, currentY);
    const width = Math.abs(this.selectionStartPos.x - currentX);
    const height = Math.abs(this.selectionStartPos.y - currentY);

    this.selectionBoxElement.style.left = `${left}px`;
    this.selectionBoxElement.style.top = `${top}px`;
    this.selectionBoxElement.style.width = `${width}px`;
    this.selectionBoxElement.style.height = `${height}px`;
  }

  /** Fin de box-select : projette les objets dans le rectangle et applique. */
  public endDragSelect(shiftKey: boolean): void {
    this.isDragSelecting = false;
    this.deps.setOrbitEnabled(true);

    if (this.selectionBoxElement) {
      const rect = this.selectionBoxElement.getBoundingClientRect();
      document.body.removeChild(this.selectionBoxElement);
      this.selectionBoxElement = null;

      if (rect.width > 5 && rect.height > 5) {
        const newlySelected: THREE.Object3D[] = [];
        const tempV = new THREE.Vector3();

        this.objects.forEach((obj) => {
          if (!obj.visible) return;
          obj.getWorldPosition(tempV);
          tempV.project(this.camera);

          const rectDom = this.domElement.getBoundingClientRect();
          const x = rectDom.left + (tempV.x * 0.5 + 0.5) * rectDom.width;
          const y = rectDom.top + (tempV.y * -0.5 + 0.5) * rectDom.height;

          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            newlySelected.push(obj);
          }
        });

        if (newlySelected.length > 0) {
          this.setMultiSelection(newlySelected, shiftKey);
        }
      }
    }
  }

  public dispose(): void {
    if (this.selectionBoxElement) {
      document.body.removeChild(this.selectionBoxElement);
      this.selectionBoxElement = null;
    }
    this.transformControls.dispose();
  }
}
