/**
 * nodeRestorer — restauration d'un nœud de scène depuis un instantané.
 * =========================================================================
 * Extrait de `SceneManager` (qui dépassait 8 000 lignes) : la logique
 * « rejouer un nœud sauvegardé » est autonome, pure côté politique de
 * restauration, et ne doit pas être mêlée à la construction de la scène.
 *
 * Le module ne connaît PAS `SceneManager` : il passe par un port explicite
 * (`NodeRestorePort`) déclaré ci-dessous. Chaque champ correspond à une
 * dépendance réellement utilisée, ce qui rend le contrat vérifiable.
 */

import * as THREE from 'three';
import { RiverMesh, type RiverConfig } from '../water/RiverMesh';
import { normalizeAnimatorController } from '../../types/animation';
import type { SceneExportData } from '../../types/engine';
import type { TransformComponent } from '../ecs/ECS';
import type { FoliagePainter } from '../terrain/FoliagePainter';
import type { AnimatorSystem } from '../animation/animator';
import type { ECSWorld } from '../ecs/ECS';

export type RestoredNode = NonNullable<SceneExportData['nodes']>[number];

/** Options de restauration d'un objet low-poly (offset de prefab, callback). */
export interface RestoreLowPolyOptions {
  /** Offset du monde (racines de prefab uniquement). */
  offset?: { x: number; y: number; z: number };
  /** Callback d'enregistrement (templateId + tag prefab + racine). */
  onCreated?: (obj: THREE.Object3D) => void;
}

/** Sous-types restitués via la factory de primitives (et non comme groupes vides). */
const FACTORY_SUBTYPES = [
  'player',
  'navMeshAgent',
  'vehicle',
  'particles',
  'triggerVolume',
  'checkpoint',
  'spawnPoint',
] as const;

export type FactorySubtype = (typeof FACTORY_SUBTYPES)[number];

export const isFactorySubtype = (subType: string): subType is FactorySubtype =>
  (FACTORY_SUBTYPES as readonly string[]).includes(subType);

/**
 * Dépendances du restaurateur. Chaque membre est une opération que
 * `SceneManager` sait faire ; le restaurateur ne détient aucun état global.
 */
export interface NodeRestorePort {
  // --- Monde ECS ---
  readonly ecsWorld: ECSWorld;
  readonly dirLight: THREE.DirectionalLight;
  readonly riverMeshes: RiverMesh[];

  // --- Assets ---
  readonly foliagePainter: FoliagePainter | undefined;
  readonly foliageLibraryPromise: Promise<unknown> | null | undefined;
  readonly animatorSystem: AnimatorSystem;

  // --- Création / enregistrement ---
  registerObject(obj: THREE.Object3D): void;
  addPrimitive(
    // La liste complète vit dans SceneManager ; le restaurateur n'appelle que
    // les sous-types « factory » (FACTORY_SUBTYPES), tous membres de l'union.
    type: FactorySubtype,
    pos: { x: number; y: number; z: number },
    opts: { silent: boolean; preserveId?: string }
  ): { id: string };
  /**
   * Restaure un modèle importé. Volontairement hors du restorer's scope : le
   * chemin est async et dépend du pipeline d'import complet de SceneManager
   * (GLTFLoader, réconciliation d'assets, prefab tagging). On ne déclare donc
   * que l'entrée, et `SceneManager.restoreModelNode` reste le maître d'œuvre.
   */
  restoreModelNode(item: RestoredNode): void;

  // --- Identités d'import (remap parentId) ---
  adoptImportId(obj: THREE.Object3D, id: string | undefined): void;
  trackImportId(item: RestoredNode, obj: THREE.Object3D): void;
  /**
   * Rattache un objet importé à son parent. Retourne false si le parent
   * n'existe pas encore (restaurations async) : l'appelant met alors en
   * file via `enqueuePendingParent` pour `sweepPendingParents`.
   */
  attachImportParent(item: RestoredNode, obj: THREE.Object3D): boolean;
  /** Met un rattachement en file d'attente. */
  enqueuePendingParent(item: RestoredNode, obj: THREE.Object3D): void;
  sweepPendingParents(): void;

  // --- Composants ---
  updatePhysics(id: string, physics: unknown): void;
  updateLogic(id: string, logic: unknown): void;
  updateParticlesConfig(id: string, config: unknown): void;
  setRigAnim(id: string, data: unknown): void;
  syncECSComponents(id: string, data: Record<string, unknown>): void;

  // --- Scène ---
  readonly scene: THREE.Scene;

  // --- Vues ---
  notifyHierarchy(): void;
  readonly objects: Map<string, THREE.Object3D>;
}

/**
 * Restaure un nœud (mesh ou groupe) et retourne l'objet créé.
 * `null` = rien à créer immédiatement (modèles asynchrones).
 */
export class NodeRestorer {
  constructor(private readonly port: NodeRestorePort) {}

  /**
   * Applique les données sauvegardées (nom, transform, physique, logique,
   * anims…) sur un objet déjà reconstruit.
   */
  applyOverlay(obj: THREE.Object3D, item: RestoredNode): void {
    obj.name = item.name || obj.name;
    obj.position.set(
      item.transform.position.x,
      item.transform.position.y,
      item.transform.position.z
    );
    obj.rotation.set(
      THREE.MathUtils.degToRad(item.transform.rotation.x),
      THREE.MathUtils.degToRad(item.transform.rotation.y),
      THREE.MathUtils.degToRad(item.transform.rotation.z)
    );
    obj.scale.set(item.transform.scale.x, item.transform.scale.y, item.transform.scale.z);
    obj.visible = item.visible;
    obj.castShadow = item.castShadow;
    obj.receiveShadow = item.receiveShadow;

    const entity = this.port.ecsWorld.getEntity(obj.uuid);
    const trans = entity?.getComponent<TransformComponent>('Transform');
    if (trans) trans.syncFromObject3D(obj);

    if (item.physics) this.port.updatePhysics(obj.uuid, item.physics);
    if (item.logic) this.port.updateLogic(obj.uuid, item.logic);
    if (item.modelInfo) {
      obj.userData = obj.userData || {};
      obj.userData.modelInfo = item.modelInfo;
    }
    // Rattachement prefab (Apply/Revert/Unlink dans l'Inspector).
    if (item.prefabId) {
      obj.userData = obj.userData || {};
      (obj.userData as { prefabId?: string }).prefabId = item.prefabId;
    }
    if (item.prefabInstanceId) {
      obj.userData = obj.userData || {};
      (obj.userData as { prefabInstanceId?: string }).prefabInstanceId = item.prefabInstanceId;
    }
    // Répétition automatique : la config (source) et le marqueur de copie
    // survivent au cycle export/import ; aucune régénération à la restauration
    // (les copies sont déjà réimportées comme enfants).
    if (item.repeat) {
      obj.userData = obj.userData || {};
      obj.userData.repeat = JSON.parse(JSON.stringify(item.repeat));
    }
    if (item.repeatOf) {
      obj.userData = obj.userData || {};
      (obj.userData as { repeatOf?: string }).repeatOf = item.repeatOf;
    }
    if (item.particles && obj.userData?.subType === 'particles') {
      this.port.updateParticlesConfig(obj.uuid, item.particles);
    }
    if (item.spawnPoint) {
      obj.userData = obj.userData || {};
      obj.userData.spawnPoint = JSON.parse(JSON.stringify(item.spawnPoint));
    }
    if (item.animator) {
      obj.userData = obj.userData || {};
      obj.userData.animator = normalizeAnimatorController(item.animator);
      this.port.animatorSystem.bind(obj.uuid);
    }
    if (item.collabId) {
      obj.userData = obj.userData || {};
      (obj.userData as { collabId?: string }).collabId = item.collabId;
    }
    if (item.rigAnim) {
      try {
        this.port.setRigAnim(obj.uuid, item.rigAnim);
      } catch (err) {
        console.warn(`RigAnim non restauré sur '${obj.name}'.`, err);
      }
    }
  }

  /**
   * Restaure un nœud groupe via la factory (jamais abandonné).
   * Retourne l'objet créé (pour le remap parentId de l'import).
   */
  restoreGroup(item: RestoredNode): THREE.Object3D | null {
    const subType = item.subType || '';
    if (subType === 'model') {
      // La restauration d'un modèle importé est ASYNC (binaire IndexedDB) et
      // reste entière dans SceneManager : elle a besoin du pipeline d'import
      // complet (GLTFLoader + réconciliation d'assets), pas seulement d'un port.
      // Le suivi se fait via importIdRemap,alimenté par ce qui termine plus tard.
      this.port.restoreModelNode(item);
      return null;
    }

    if (!isFactorySubtype(subType)) {
      // Groupe inconnu : conteneur vide avec la transform sauvegardée.
      const fallback = new THREE.Group();
      fallback.userData = { subType: subType || 'group' };
      this.port.adoptImportId(fallback, item.id);
      this.applyOverlay(fallback, item);
      this.port.registerObject(fallback);
      this.port.trackImportId(item, fallback);
      return fallback;
    }

    try {
      const created = this.port.addPrimitive(
        subType,
        { x: item.transform.position.x, y: item.transform.position.y, z: item.transform.position.z },
        { silent: true, preserveId: item.id }
      );
      const obj = this.port.objects.get(created.id);
      if (!obj) return null;
      this.applyOverlay(obj, item);
      this.port.trackImportId(item, obj);
      return obj;
    } catch (err) {
      console.warn(`Restauration du groupe '${item.name}' impossible, ignoré.`, err);
      return null;
    }
  }

  /**
   * Restaure une rivière procédurale (sans re-sculptage : le heightmap importé
   * contient déjà le lit).
   */
  restoreRiver(item: RestoredNode): void {
    try {
      const river = new RiverMesh({
        ...((item.riverConfig || {}) as Partial<RiverConfig>),
        autoCarveTerrain: false,
      });
      river.mesh.position.set(
        item.transform.position.x,
        item.transform.position.y,
        item.transform.position.z
      );
      river.setSunDirection(this.port.dirLight.position, this.port.dirLight.color);
      this.port.scene.add(river.mesh);
      this.port.riverMeshes.push(river);
      this.port.adoptImportId(river.mesh, item.id);
      this.port.registerObject(river.mesh);
      this.port.trackImportId(item, river.mesh);
      river.mesh.name = item.name || river.mesh.name;
    } catch (err) {
      console.warn(`Restauration de la rivière '${item.name}' impossible, ignorée.`, err);
    }
  }

  /**
   * Restaure un objet low-poly peint (feuillage) : modèle de la bibliothèque,
   * retouches matériau et palette de couzones. Retourne le mesh, ou null si le
   * modèle est introuvable (un placeholder est alors créé).
   */
  async restoreLowPoly(
    item: RestoredNode,
    opts?: RestoreLowPolyOptions
  ): Promise<THREE.Object3D | null> {
    let lowPolyId: string | undefined =
      typeof item.lowPolyId === 'string' ? item.lowPolyId : undefined;

    const finish = (obj: THREE.Object3D): void => {
      this.port.adoptImportId(obj, item.id);
      this.applyOverlay(obj, item);
      if (opts?.offset) {
        obj.position.x += opts.offset.x;
        obj.position.y += opts.offset.y;
        obj.position.z += opts.offset.z;
      }
      this.port.registerObject(obj);
      this.port.trackImportId(item, obj);
      const toonIntensity = item.material?.toonIntensity;
      const outlineColor = item.material?.outlineColor;
      const outlineThickness = item.material?.outlineThickness;
      if (toonIntensity !== undefined || outlineColor !== undefined || outlineThickness !== undefined) {
        this.port.syncECSComponents(obj.uuid, { toonIntensity, outlineColor, outlineThickness });
      }
      opts?.onCreated?.(obj);
      if (!opts?.onCreated) {
        if (!this.port.attachImportParent(item, obj)) {
          this.port.enqueuePendingParent(item, obj);
        }
        this.port.sweepPendingParents();
      }
      this.port.notifyHierarchy();
    };

    const spawnPlaceholder = (): THREE.Object3D => {
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true })
      );
      placeholder.userData = { subType: 'lowPoly', lowPolyId, placeholder: true };
      finish(placeholder);
      return placeholder;
    };

    if (!lowPolyId) {
      // Scènes anciennes : l'id n'était pas persisté → on le déduit du nom
      // d'instance (`tree_1_9` → `tree_1`, suffixe `_<n>` retiré récursivement).
      await this.port.foliageLibraryPromise?.catch(() => null);
      lowPolyId = this.resolveLowPolyIdFromName(item.name);
    }
    if (!lowPolyId) {
      console.warn(`Objet low-poly '${item.name}' sans identifiant : placeholder.`);
      spawnPlaceholder();
      return null;
    }

    await this.port.foliageLibraryPromise?.catch(() => null);
    let mesh: THREE.Mesh | null = null;
    try {
      mesh = this.port.foliagePainter?.createLibraryMesh(lowPolyId) ?? null;
    } catch (err) {
      console.warn(`Modèle low-poly '${lowPolyId}' inaccessible.`, err);
    }
    if (!mesh) {
      console.warn(`Modèle low-poly '${lowPolyId}' introuvable : placeholder.`);
      spawnPlaceholder();
      return null;
    }

    mesh.userData = {
      ...(mesh.userData as Record<string, unknown>),
      subType: 'lowPoly',
      lowPolyId,
    };

    // Retouches matériau sauvegardées (teinte/roughness appliquées à la palette).
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const m = item.material;
    if (mat instanceof THREE.MeshStandardMaterial && m) {
      if (m.color) mat.color.set(m.color);
      if (typeof m.roughness === 'number') mat.roughness = m.roughness;
      if (typeof m.metalness === 'number') mat.metalness = m.metalness;
      if (typeof m.opacity === 'number') mat.opacity = m.opacity;
      if (typeof m.transparent === 'boolean') mat.transparent = m.transparent;
      if (typeof m.wireframe === 'boolean') mat.wireframe = m.wireframe;
      if (m.emissive) mat.emissive.set(m.emissive);
      if (typeof m.emissiveIntensity === 'number') mat.emissiveIntensity = m.emissiveIntensity;
    }

    // Palette de couzones sauvegardée (sinon couleurs par défaut du modèle).
    const palette = item.palette;
    const restoredPalette =
      palette && palette.length
        ? palette
        : this.port.foliagePainter?.getLibraryPalette(lowPolyId) ?? undefined;
    mesh.userData = {
      ...(mesh.userData as Record<string, unknown>),
      palette: restoredPalette,
    };
    if (palette && palette.length) {
      this.port.foliagePainter?.applyMeshPalette(mesh, palette.map((z) => z.color));
    }

    finish(mesh);
    return mesh;
  }

  /**
   * Déduit l'id d'un modèle low-poly à partir de son nom d'instance
   * (`tree_1_9` → `tree_1`) quand l'ancienne persistance n'a pas gardé `lowPolyId`.
   */
  resolveLowPolyIdFromName(name?: string): string | undefined {
    if (!name || !this.port.foliagePainter) return undefined;
    let candidate = name;
    for (;;) {
      if (this.port.foliagePainter.getEntry(candidate)) return candidate;
      const shorter = candidate.replace(/_\d+$/, '');
      if (shorter === candidate) return undefined;
      candidate = shorter;
    }
  }
}

export default NodeRestorer;
