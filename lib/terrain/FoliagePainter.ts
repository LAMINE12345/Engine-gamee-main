import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FoliageType, FoliageInstance, FoliageLayer } from '../../types/terrain';
import type { LowPolyPaletteEntry } from '../../types/engine';

// =========================================================================
// Bibliothèque low-poly (LOW_POLY_set.glb) — palette 82 éléments
// =========================================================================

/** Entrée de la bibliothèque low-poly affichée dans la palette du panneau Terrain. */
export interface FoliageLibraryEntry {
  /** Identifiant unique = nom de node Blender (persisté dans la scène). */
  id: string;
  /** Nom nettoyé affiché dans l'UI. */
  name: string;
  /** Catégorie regroupée (Arbres, Rochers, …). */
  category: string;
  /** Couleur representative (hex sRGB) du premier materiau de l'element. */
  color: string;
  /** Hauteur normalisee (bbox apres recenter bas a y=0), en unites monde. */
  height: number;
  /** Zones de couleur éditables (une par matériau source du modèle). */
  palette: LowPolyPaletteEntry[];
  /**
   * Échelle appliquée quand l'élément est posé dans la scène. Absente = échelle
   * du pack LOW_POLY (modélisé ~5x trop grand, cf. LOW_POLY_IMPORT_SCALE).
   * Les bibliothèques annexes (modélisées à l'échelle réelle) la définissent.
   */
  importScale?: number;
}

/** Ordre d'affichage des categories dans la palette. */
export const FOLIAGE_CATEGORIES = [
  'Arbres',
  'Conifères',
  'Palmiers',
  'Bananes',
  'Rochers',
  'Pierres',
  'Plantes',
  'Divers',
] as const;

/** Sous-ensemble minimal de GLTFLoader utilise par loadLibrary. */
export interface GltfSceneLoader {
  loadAsync(url: string): Promise<{ scene: THREE.Object3D }>;
}

/** Options d'un chargement de bibliotheque GLB. */
export interface LoadLibraryOptions {
  /** Echelle de pose des elements charges (defaut : echelle du pack LOW_POLY). */
  importScale?: number;
  /** false = ne rejoue pas les calques sauvegardes (chargements en chaines). */
  replaySavedLayers?: boolean;
}

/** Tri par categorie puis nom, applique a la palette affichee. */
export function sortFoliageEntries(entries: FoliageLibraryEntry[]): FoliageLibraryEntry[] {
  return entries.sort((a, b) => {
    const d =
      (FOLIAGE_CATEGORIES as readonly string[]).indexOf(a.category) -
      (FOLIAGE_CATEGORIES as readonly string[]).indexOf(b.category);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

function categorizeFoliage(name: string): string {
  const s = name.toLowerCase();
  if (s.includes('palm')) return 'Palmiers';
  if (s.includes('conifer')) return 'Conifères';
  if (s.startsWith('tree')) return 'Arbres';
  if (s.includes('banan') || s.includes('baban')) return 'Bananes';
  if (s.includes('rock')) return 'Rochers';
  if (s.includes('stone')) return 'Pierres';
  if (s.startsWith('plane') || s.includes('grass') || s.includes('herbe')) return 'Plantes';
  return 'Divers';
}

function cleanFoliageDisplayName(name: string): string {
  return name.replace(/\s*mesh\.\d+$/, '');
}

// =========================================================================
// Factories geometrie & materiau proceduraux (types legacy des anciennes scenes)
// =========================================================================

function createPineTreeGeometry(): THREE.BufferGeometry {
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 0.8, 6);
  trunkGeo.translate(0, 0.4, 0);

  const foliage1 = new THREE.ConeGeometry(1.2, 1.4, 7);
  foliage1.translate(0, 1.3, 0);

  const foliage2 = new THREE.ConeGeometry(0.9, 1.2, 7);
  foliage2.translate(0, 2.0, 0);

  const foliage3 = new THREE.ConeGeometry(0.6, 1.0, 7);
  foliage3.translate(0, 2.7, 0);

  // Combine
  const merged = new THREE.BufferGeometry();
  const geos = [trunkGeo, foliage1, foliage2, foliage3];

  // Quick manual merge
  let totalPos = 0;
  geos.forEach((g) => (totalPos += g.attributes.position.count));

  const posArray = new Float32Array(totalPos * 3);
  const normArray = new Float32Array(totalPos * 3);
  let offset = 0;

  geos.forEach((g) => {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    posArray.set(p as ArrayLike<number>, offset * 3);
    normArray.set(n as ArrayLike<number>, offset * 3);
    offset += g.attributes.position.count;
  });

  merged.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
  merged.computeVertexNormals();

  return merged;
}

function createOakTreeGeometry(): THREE.BufferGeometry {
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 1.2, 6);
  trunkGeo.translate(0, 0.6, 0);

  const canopyGeo = new THREE.DodecahedronGeometry(1.4, 1);
  canopyGeo.translate(0, 2.0, 0);

  const totalPos = trunkGeo.attributes.position.count + canopyGeo.attributes.position.count;
  const posArray = new Float32Array(totalPos * 3);
  const normArray = new Float32Array(totalPos * 3);

  posArray.set(trunkGeo.attributes.position.array as ArrayLike<number>, 0);
  normArray.set(trunkGeo.attributes.normal.array as ArrayLike<number>, 0);

  const offset = trunkGeo.attributes.position.count * 3;
  posArray.set(canopyGeo.attributes.position.array as ArrayLike<number>, offset);
  normArray.set(canopyGeo.attributes.normal.array as ArrayLike<number>, offset);

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
  merged.computeVertexNormals();

  return merged;
}

function createRockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(0.75, 0);
  const pos = geo.attributes.position;
  // Jitter vertices for rocky look
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * (0.8 + (Math.sin(i * 3) * 0.25));
    const y = pos.getY(i) * (0.6 + (Math.cos(i * 5) * 0.2));
    const z = pos.getZ(i) * (0.8 + (Math.sin(i * 7) * 0.25));
    pos.setXYZ(i, x, Math.max(0.05, y + 0.35), z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createGrassTuftGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const bladeCount = 5;
  const posArray = new Float32Array(bladeCount * 3 * 3 * 2); // triangles

  let idx = 0;
  for (let b = 0; b < bladeCount; b++) {
    const angle = (b / bladeCount) * Math.PI + (Math.random() * 0.3);
    const height = 0.5 + Math.random() * 0.35;
    const width = 0.08;

    const dx = Math.cos(angle) * width;
    const dz = Math.sin(angle) * width;

    // Triangle 1
    posArray[idx++] = -dx;
    posArray[idx++] = 0;
    posArray[idx++] = -dz;

    posArray[idx++] = dx;
    posArray[idx++] = 0;
    posArray[idx++] = dz;

    posArray[idx++] = (Math.random() - 0.5) * 0.2;
    posArray[idx++] = height;
    posArray[idx++] = (Math.random() - 0.5) * 0.2;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  geo.computeVertexNormals();
  return geo;
}

function createFlowerGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4);
  stem.translate(0, 0.2, 0);

  const head = new THREE.SphereGeometry(0.08, 6, 6);
  head.translate(0, 0.42, 0);

  const total = stem.attributes.position.count + head.attributes.position.count;
  const pos = new Float32Array(total * 3);
  pos.set(stem.attributes.position.array as ArrayLike<number>, 0);
  pos.set(head.attributes.position.array as ArrayLike<number>, stem.attributes.position.count * 3);

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
}

function createCrystalGeometry(): THREE.BufferGeometry {
  const geo = new THREE.OctahedronGeometry(0.45, 0);
  geo.scale(0.6, 1.8, 0.6);
  geo.translate(0, 0.45, 0);
  return geo;
}

function createBushGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.65, 7, 6);
  geo.scale(1.2, 0.8, 1.2);
  geo.translate(0, 0.4, 0);
  return geo;
}

/** Types legacy reconnus sans la bibliotheque GLB (compat anciennes scenes). */
const LEGACY_TYPES: FoliageType[] = [
  'pine_tree',
  'oak_tree',
  'rock',
  'grass_tuft',
  'flower',
  'crystal',
  'bush',
];

function createLegacyAssets(
  type: FoliageType
): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } | null {
  switch (type) {
    case 'pine_tree':
      return {
        geometry: createPineTreeGeometry(),
        material: new THREE.MeshStandardMaterial({
          color: '#2d6a4f',
          roughness: 0.8,
          metalness: 0.05,
          flatShading: true,
        }),
      };
    case 'oak_tree':
      return {
        geometry: createOakTreeGeometry(),
        material: new THREE.MeshStandardMaterial({
          color: '#40916c',
          roughness: 0.85,
          metalness: 0.05,
          flatShading: true,
        }),
      };
    case 'rock':
      return {
        geometry: createRockGeometry(),
        material: new THREE.MeshStandardMaterial({
          color: '#64748b',
          roughness: 0.9,
          metalness: 0.2,
          flatShading: true,
        }),
      };
    case 'grass_tuft':
      return {
        geometry: createGrassTuftGeometry(),
        material: new THREE.MeshStandardMaterial({
          color: '#52b788',
          roughness: 0.7,
          side: THREE.DoubleSide,
        }),
      };
    case 'flower':
      return {
        geometry: createFlowerGeometry(),
        material: new THREE.MeshStandardMaterial({
          color: '#f43f5e',
          roughness: 0.6,
        }),
      };
    case 'crystal':
      return {
        geometry: createCrystalGeometry(),
        material: new THREE.MeshStandardMaterial({
          color: '#38bdf8',
          emissive: '#0284c7',
          emissiveIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.8,
        }),
      };
    case 'bush':
      return {
        geometry: createBushGeometry(),
        material: new THREE.MeshStandardMaterial({
          color: '#1b4332',
          roughness: 0.85,
          flatShading: true,
        }),
      };
    default:
      return null;
  }
}

// =========================================================================
// FoliagePainter — InstancedMesh lazys + chargement de la bibliotheque GLB
// =========================================================================

/** Resultat du picking d'une instance peinte. */
export interface FoliagePick {
  type: FoliageType;
  instanceId: number;
  /** Distance raycast (pour test d'occlusion par le terrain). */
  distance: number;
}

interface FoliageLayerData {
  mesh: THREE.InstancedMesh;
  instances: FoliageInstance[];
  material: THREE.MeshStandardMaterial;
}

interface LibraryItem {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  entry: FoliageLibraryEntry;
}

export class FoliagePainter {
  private scene: THREE.Scene;
  private maxInstancesPerType: number = 2000;

  private layers: Map<FoliageType, FoliageLayerData> = new Map();
  /** Elements de LOW_POLY_set.glb, crees a la demande par ensureLayer. */
  private library: Map<FoliageType, LibraryItem> = new Map();
  /** Scenes restaurees avant la fin du chargement GLB (rejouees en fin de loadLibrary). */
  private pendingSavedLayers: FoliageLayer[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // -------------------------------------------------------------------------
  // Selection & edition d'une instance (mode Sélection du panneau Terrain)
  // -------------------------------------------------------------------------

  /** Cle de selection courante `${type}#${instanceId}` ; null = rien de selectionne. */
  private selectionKey: string | null = null;
  /** Boite de surbrillance autour de l'instance selectionnee (creee a la demande). */
  private selectionBox: THREE.LineSegments | null = null;

  /** Raycast InstancedMesh actifs : renvoie l'instance la plus proche sous le rayon. */
  public pick(raycaster: THREE.Raycaster): FoliagePick | null {
    const meshes: THREE.InstancedMesh[] = [];
    this.layers.forEach((layer) => {
      if (layer.mesh.count > 0) meshes.push(layer.mesh);
    });
    if (meshes.length === 0) return null;

    const hits = raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      const type = hit.object.userData?.foliageType as FoliageType | undefined;
      if (type !== undefined && hit.instanceId !== undefined) {
        return { type, instanceId: hit.instanceId, distance: hit.distance };
      }
    }
    return null;
  }

  public getInstance(type: FoliageType, instanceId: number): FoliageInstance | null {
    const layer = this.layers.get(type);
    if (!layer || instanceId < 0 || instanceId >= layer.instances.length) return null;
    return layer.instances[instanceId];
  }

  /** Entree de la bibliotheque low-poly pour un type (null = legacy / inconnu). */
  public getEntry(type: FoliageType): FoliageLibraryEntry | null {
    return this.library.get(type)?.entry ?? null;
  }

  /** Vrai des que LOW_POLY_set.glb est charge (palette & vignettes disponibles). */
  public get isLibraryLoaded(): boolean {
    return this.library.size > 0;
  }

  /** Cle de bibliotheque chargees (les 112 ids de la palette). */
  public get libraryIds(): string[] {
    return Array.from(this.library.keys());
  }

  /**
   * Clone geometrie + materiau d'un element de la bibliotheque pour en faire un
   * Mesh autonome (instanciable / deposable dans la scene).
   * Retourne null si la bibliotheque n'est pas chargee ou l'id est inconnu.
   */
  public createLibraryMesh(id: string): THREE.Mesh | null {
    const item = this.library.get(id);
    if (!item) return null;
    const mesh = new THREE.Mesh(item.geometry.clone(), item.material.clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Zones de couleur (nom + hex) d'un modele de la bibliotheque (null = inconnu). */
  public getLibraryPalette(id: string): LowPolyPaletteEntry[] | null {
    return this.library.get(id)?.entry.palette ?? null;
  }

  /**
   * Recolore les zones d'un mesh clone depuis la bibliotheque (vertex colors).
   * `colors` est indexe par zone (matIdx) ; les zones sans couleur fournie
   * gardent leur couleur par defaut du modele. `colors` null = tout reinitialise.
   */
  public applyMeshPalette(obj: THREE.Object3D, colors: string[] | null): boolean {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return false;
    const geo = mesh.geometry;
    const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!colorAttr) return false;
    const idxAttr = geo.getAttribute('matIdx') as THREE.BufferAttribute | undefined;
    const lowPolyId = (mesh.userData as { lowPolyId?: string } | undefined)?.lowPolyId;
    const palette = lowPolyId ? this.library.get(lowPolyId)?.entry.palette : null;

    const tmp = new THREE.Color();
    for (let v = 0; v < colorAttr.count; v++) {
      const zone = idxAttr ? Math.round(idxAttr.getX(v)) : 0;
      const hex = colors && colors[zone] ? colors[zone] : palette?.[zone]?.color ?? null;
      if (!hex) continue;
      tmp.setStyle(hex);
      colorAttr.setXYZ(v, tmp.r, tmp.g, tmp.b);
    }
    colorAttr.needsUpdate = true;
    return true;
  }

  /** Met a jour position/rotation/echelle d'une instance et rebuild ses matrices. */
  public updateInstance(
    type: FoliageType,
    instanceId: number,
    patch: Partial<Pick<FoliageInstance, 'x' | 'y' | 'z' | 'rotY' | 'scale' | 'yOff'>>
  ): boolean {
    const inst = this.getInstance(type, instanceId);
    if (!inst) return false;
    Object.assign(inst, patch);
    this.rebuildLayerMatrices(type);
    this.refreshSelection();
    return true;
  }

  /** Supprime une instance (les index suivants decalent). */
  public removeInstance(type: FoliageType, instanceId: number): boolean {
    const layer = this.layers.get(type);
    if (!layer || instanceId < 0 || instanceId >= layer.instances.length) return false;
    layer.instances.splice(instanceId, 1);
    this.rebuildLayerMatrices(type);
    return true;
  }

  public setSelection(type: FoliageType, instanceId: number): void {
    this.selectionKey = `${type}#${instanceId}`;
    this.refreshSelection();
  }

  public clearSelection(): void {
    this.selectionKey = null;
    if (this.selectionBox) this.selectionBox.visible = false;
  }

  public get hasSelection(): boolean {
    return this.selectionKey !== null;
  }

  /** Repositionne la boite de surbrillance sur l'instance selectionnee. */
  public refreshSelection(): void {
    if (!this.selectionKey) return;
    const box = this.ensureSelectionBox();

    const sep = this.selectionKey.lastIndexOf('#');
    const type = this.selectionKey.slice(0, sep);
    const id = Number(this.selectionKey.slice(sep + 1));
    const inst = this.getInstance(type, id);
    const layer = this.layers.get(type);
    if (!inst || !layer) {
      box.visible = false;
      return;
    }

    const geo = layer.mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) {
      box.visible = false;
      return;
    }

    const s = inst.scale;
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    // Centre du bbox tourne autour de Y (rotation de l'instance).
    const sin = Math.sin(inst.rotY);
    const cos = Math.cos(inst.rotY);
    box.position.set(inst.x + (cx * cos + cz * sin) * s, inst.y + cy * s, inst.z + (-cx * sin + cz * cos) * s);
    box.rotation.set(0, inst.rotY, 0);
    box.scale.set(
      Math.max(0.05, (bb.max.x - bb.min.x) * s),
      Math.max(0.05, (bb.max.y - bb.min.y) * s),
      Math.max(0.05, (bb.max.z - bb.min.z) * s)
    );
    box.visible = true;
  }

  private ensureSelectionBox(): THREE.LineSegments {
    if (!this.selectionBox) {
      const unit = new THREE.BoxGeometry(1, 1, 1);
      const geo = new THREE.EdgesGeometry(unit);
      unit.dispose();
      const mat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      });
      const box = new THREE.LineSegments(geo, mat);
      box.name = '__AETHER_FOLIAGE_SELECTION__';
      box.renderOrder = 999;
      box.frustumCulled = false;
      box.raycast = () => {}; // jamais intercepte par le picking
      this.scene.add(box);
      this.selectionBox = box;
    }
    return this.selectionBox;
  }

  /**
   * Charge la bibliotheque low-poly et retourne les entrees pour la palette UI.
   * Les calques sauvegardes arrives avant le chargement sont rejoues en fin de parcours.
   */
  public async loadLibrary(
    url: string,
    loader: GltfSceneLoader,
    opts?: LoadLibraryOptions
  ): Promise<FoliageLibraryEntry[]> {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    const entries: FoliageLibraryEntry[] = [];

    for (const node of root.children) {
      const meshes: THREE.Mesh[] = [];
      node.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) meshes.push(mesh);
      });
      if (meshes.length === 0) continue;

      const parts: THREE.BufferGeometry[] = [];
      let anyDoubleSided = false;
      let baseColor = new THREE.Color(0x888888);

      // Palette du modele : une entree par materiau source unique (nom + couleur),
      // dans l'ordre de premiere rencontre. Sert de zones editer dans l'Inspector.
      const palette: LowPolyPaletteEntry[] = [];
      const paletteIndexByKey = new Map<string, number>();
      const paletteIndexOf = (matName: string, matColor: THREE.Color): number => {
        const hex = `#${matColor.getHexString(THREE.SRGBColorSpace)}`;
        const key = `${matName}|${hex}`;
        const existing = paletteIndexByKey.get(key);
        if (existing !== undefined) return existing;
        const index = palette.length;
        palette.push({ name: matName || `Zone ${index + 1}`, color: hex });
        paletteIndexByKey.set(key, index);
        return index;
      };
      const colorTmp = new THREE.Color();

      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const srcMat = srcMats[0] as THREE.MeshStandardMaterial;
        const color = srcMat && srcMat.color ? srcMat.color : new THREE.Color(0xffffff);
        if (i === 0) baseColor = color.clone();
        if (srcMat && srcMat.side === THREE.DoubleSide) anyDoubleSided = true;

        // Clone + bake de la transform du node (translation/scale/rotation du node racine).
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);

        // Attributs conserves : position, normal, couleur, index de zone.
        for (const attr of Object.keys(geo.attributes)) {
          if (attr !== 'position' && attr !== 'normal' && attr !== 'color' && attr !== 'matIdx') {
            geo.deleteAttribute(attr);
          }
        }

        // Couleurs des materiaux bakees en vertex colors (materiaux plats & opaques)
        // + matIdx = index de zone par sommet pour recolorer ulterieurement.
        const count = geo.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const matIdx = new Float32Array(count);
        const zones = srcMats.map((m) =>
          paletteIndexOf((m as THREE.Material)?.name ?? '', (m as THREE.MeshStandardMaterial)?.color ?? color)
        );
        const defaultZone = zones[0] ?? 0;
        const writeZone = (vertex: number, zone: number) => {
          matIdx[vertex] = zone;
          colorTmp.setStyle(palette[zone]?.color ?? '#888888');
          colors[vertex * 3] = colorTmp.r;
          colors[vertex * 3 + 1] = colorTmp.g;
          colors[vertex * 3 + 2] = colorTmp.b;
        };
        for (let v = 0; v < count; v++) writeZone(v, defaultZone);

        // Chaque groupe (= face d'un materiau) garde sa propre zone de couleur.
        const indexAttr = geo.index;
        if (zones.length > 1 && geo.groups.length > 0) {
          for (const group of geo.groups) {
            const zone =
              group.materialIndex !== undefined
                ? (zones[group.materialIndex] ?? defaultZone)
                : defaultZone;
            const groupEnd = group.start + group.count;
            if (indexAttr) {
              for (let gi = group.start; gi < groupEnd; gi++) writeZone(indexAttr.getX(gi), zone);
            } else {
              for (let gi = group.start; gi < groupEnd && gi < count; gi++) writeZone(gi, zone);
            }
          }
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('matIdx', new THREE.BufferAttribute(matIdx, 1));
        parts.push(geo);
      }

      let merged: THREE.BufferGeometry | null;
      if (parts.length === 1) {
        merged = parts[0];
      } else {
        // Meshes multi-primitives (2-4 materiaux) : fusion en une seule geo avec vertex colors.
        merged = mergeGeometries(parts, false);
        parts.forEach((p) => p.dispose());
      }
      if (!merged) continue;

      // Recenter : centre en X/Z, base a y=0 (certains nodes Blender flottent a minY ~15).
      merged.computeBoundingBox();
      const bb = merged.boundingBox;
      if (!bb) {
        merged.dispose();
        continue;
      }
      merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      merged.computeBoundingBox();
      const height = Math.max(0.01, merged.boundingBox ? merged.boundingBox.max.y : 1);

      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: anyDoubleSided ? THREE.DoubleSide : THREE.FrontSide,
        roughness: 0.85,
        metalness: 0.05,
      });

      const id = node.name || `lowpoly_${this.library.size}`;
      // Id deja charge (collision entre GLB) : on garde le premier maillage.
      if (this.library.has(id)) {
        merged.dispose();
        continue;
      }
      const entry: FoliageLibraryEntry = {
        id,
        name: cleanFoliageDisplayName(id),
        category: categorizeFoliage(id),
        color: `#${baseColor.getHexString(THREE.SRGBColorSpace)}`,
        height,
        palette,
        importScale: opts?.importScale,
      };
      this.library.set(id, { geometry: merged, material, entry });
      entries.push(entry);
    }

    // Liberation de la scene source (les geometries clonees sont independantes).
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => m && m.dispose());
      }
    });

    sortFoliageEntries(entries);

    // Rejouer les calques sauvegardes restaures avant la fin du chargement.
    if (opts?.replaySavedLayers !== false) this.flushPendingSavedLayers();

    return entries;
  }

  /**
   * Rejoue les calques sauvegardes arrives avant le chargement des GLB.
   * A appeler une fois TOUTES les bibliotheques chargees (chargements en chaines).
   */
  public flushPendingSavedLayers(): void {
    if (this.pendingSavedLayers.length === 0) return;
    const pending = this.pendingSavedLayers;
    this.pendingSavedLayers = [];
    this.loadLayers(pending);
  }

  /** Crée (a la demande) le calque InstancedMesh pour un type : entree GLB, sinon legacy. */
  private ensureLayer(type: FoliageType): FoliageLayerData | null {
    const existing = this.layers.get(type);
    if (existing) return existing;

    let geometry: THREE.BufferGeometry;
    let material: THREE.MeshStandardMaterial;

    const item = this.library.get(type);
    if (item) {
      geometry = item.geometry;
      material = item.material;
    } else if (LEGACY_TYPES.includes(type)) {
      const legacy = createLegacyAssets(type);
      if (!legacy) return null;
      geometry = legacy.geometry;
      material = legacy.material;
    } else {
      return null;
    }

    const instMesh = new THREE.InstancedMesh(geometry, material, this.maxInstancesPerType);
    instMesh.count = 0;
    instMesh.castShadow = true;
    instMesh.receiveShadow = true;
    instMesh.frustumCulled = false;
    instMesh.name = `__AETHER_FOLIAGE_${type.toUpperCase()}__`;
    instMesh.userData = { isFoliage: true, foliageType: type };
    instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.scene.add(instMesh);
    const layer: FoliageLayerData = { mesh: instMesh, instances: [], material };
    this.layers.set(type, layer);
    return layer;
  }

  public paintAt(
    worldPoint: THREE.Vector3,
    type: FoliageType,
    radius: number,
    density: number,
    scaleMin: number,
    scaleMax: number,
    _surfaceNormal?: THREE.Vector3
  ): void {
    const layer = this.ensureLayer(type);
    if (!layer) return;

    const countToSpawn = Math.max(1, Math.round(density * (radius / 2.5)));

    for (let i = 0; i < countToSpawn; i++) {
      if (layer.instances.length >= this.maxInstancesPerType) break;

      // Random offset in circle radius
      const r = Math.sqrt(Math.random()) * radius;
      const theta = Math.random() * Math.PI * 2;
      const x = worldPoint.x + r * Math.cos(theta);
      const z = worldPoint.z + r * Math.sin(theta);
      const y = worldPoint.y + (Math.random() - 0.5) * 0.05;

      const rotY = Math.random() * Math.PI * 2;
      const scale = scaleMin + Math.random() * (scaleMax - scaleMin);

      const inst: FoliageInstance = { x, y, z, rotY, scale };
      layer.instances.push(inst);
    }

    this.rebuildLayerMatrices(type);
  }

  public eraseAt(worldPoint: THREE.Vector3, radius: number): void {
    this.layers.forEach((layer, type) => {
      const remaining = layer.instances.filter((inst) => {
        const dist = Math.hypot(inst.x - worldPoint.x, inst.z - worldPoint.z);
        return dist >= radius;
      });

      if (remaining.length !== layer.instances.length) {
        layer.instances = remaining;
        this.rebuildLayerMatrices(type);
      }
    });
  }

  public rebuildLayerMatrices(type: FoliageType): void {
    const layer = this.layers.get(type);
    if (!layer) return;

    const dummy = new THREE.Object3D();
    const instances = layer.instances;
    layer.mesh.count = instances.length;

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      dummy.position.set(inst.x, inst.y, inst.z);
      dummy.rotation.set(0, inst.rotY, 0);
      dummy.scale.set(inst.scale, inst.scale, inst.scale);
      dummy.updateMatrix();

      layer.mesh.setMatrixAt(i, dummy.matrix);
    }

    layer.mesh.instanceMatrix.needsUpdate = true;
  }

  public loadLayers(savedLayers: FoliageLayer[]): void {
    this.clearSelection();
    savedLayers.forEach((saved) => {
      const layer = this.ensureLayer(saved.type);
      if (layer) {
        layer.instances = [...saved.instances];
        this.rebuildLayerMatrices(saved.type);
      } else {
        // Type GLB pas encore charge : rejoue apres loadLibrary.
        this.pendingSavedLayers.push(saved);
      }
    });
  }

  public importLayers(savedLayers: FoliageLayer[]): void {
    this.loadLayers(savedLayers);
  }

  public exportLayers(): FoliageLayer[] {
    const result: FoliageLayer[] = [];
    this.layers.forEach((layer, type) => {
      if (layer.instances.length > 0) {
        result.push({
          type,
          name: type,
          instances: [...layer.instances],
        });
      }
    });
    return result;
  }

  public adjustFoliageHeights(terrainGenerator: {
    getHeightAt: (x: number, z: number) => number;
  }): void {
    this.layers.forEach((layer, type) => {
      let changed = false;
      for (let i = 0; i < layer.instances.length; i++) {
        const inst = layer.instances[i];
        const off = inst.yOff ?? 0;
        const targetY = terrainGenerator.getHeightAt(inst.x, inst.z) + off;
        if (Math.abs(inst.y - targetY) > 0.001) {
          inst.y = targetY;
          changed = true;
        }
      }
      if (changed) {
        this.rebuildLayerMatrices(type);
      }
    });
    this.refreshSelection();
  }

  public clear(): void {
    this.clearSelection();
    this.layers.forEach((layer) => {
      layer.instances = [];
      layer.mesh.count = 0;
      layer.mesh.instanceMatrix.needsUpdate = true;
    });
  }

  public clearAll(): void {
    this.clear();
  }

  public dispose(): void {
    const libGeometries = new Set<THREE.BufferGeometry>();
    const libMaterials = new Set<THREE.Material>();
    this.library.forEach((item) => {
      libGeometries.add(item.geometry);
      libMaterials.add(item.material);
    });

    this.layers.forEach((layer) => {
      this.scene.remove(layer.mesh);
      if (!libGeometries.has(layer.mesh.geometry)) layer.mesh.geometry.dispose();
      if (!libMaterials.has(layer.material)) layer.material.dispose();
    });
    this.layers.clear();

    libGeometries.forEach((g) => g.dispose());
    libMaterials.forEach((m) => m.dispose());
    this.library.clear();
    this.pendingSavedLayers = [];

    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.geometry.dispose();
      (this.selectionBox.material as THREE.Material).dispose();
      this.selectionBox = null;
    }
    this.selectionKey = null;
  }
}
