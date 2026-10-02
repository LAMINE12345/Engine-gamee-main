import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * smoothShading.ts
 * Lissage des normales (smooth shading) pour les éléments 3D.
 *
 * Lisser = souder les sommets dupliqués (indexation) puis recalculer des
 * normales moyennées par sommet (computeVertexNormals) + flatShading=false.
 * Sans soudure, computeVertexNormals seul ne change rien sur une géométrie
 * non-indexée (chaque face garde ses propres normales = facettes visibles).
 */

export interface SmoothShadeReport {
  /** Meshes parcourus (géométries uniques dédupliquées). */
  meshes: number;
  /** Géométries effectivement lissées. */
  smoothed: number;
  /** Géométries ignorées (sans position, vides ou en échec). */
  skipped: number;
}

/** Géométries uniques (partagées entre meshes) sous une racine. */
function collectGeometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  const seen = new Set<THREE.BufferGeometry>();
  const out: THREE.BufferGeometry[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geo = child.geometry as THREE.BufferGeometry | undefined;
      if (geo && !seen.has(geo)) {
        seen.add(geo);
        out.push(geo);
      }
    }
  });
  return out;
}

function eachMaterial(root: THREE.Object3D, fn: (mat: THREE.Material) => void): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m) fn(m as THREE.Material);
      }
    }
  });
}

const _COMP_GETTERS = ['getX', 'getY', 'getZ', 'getW'] as const;

/**
 * Recompacte les attributs d'une géométrie selon une table d'index fusionnés :
 * chaque sommet fusionné garde les données de sa PREMIÈRE occurrence
 * (les coutures d'uv adoptent le premier uv vu — compromis standard du lissage).
 */
function compactAttributes(
  geo: THREE.BufferGeometry,
  indexArr: ArrayLike<number>,
  uniqueCount: number
): void {
  const first = new Int32Array(uniqueCount).fill(-1);
  for (let i = 0; i < indexArr.length; i++) {
    const m = indexArr[i];
    if (first[m] === -1) first[m] = i;
  }
  for (const name of Object.keys(geo.attributes)) {
    if (name === 'position' || name === 'normal') continue;
    const attr = geo.getAttribute(name) as THREE.BufferAttribute;
    const itemSize = attr.itemSize;
    const compact = new Float32Array(uniqueCount * itemSize);
    for (let m = 0; m < uniqueCount; m++) {
      const src = first[m];
      for (let k = 0; k < itemSize; k++) {
        compact[m * itemSize + k] = (attr as unknown as Record<string, (i: number) => number>)[
          _COMP_GETTERS[k]
        ](src);
      }
    }
    geo.setAttribute(
      name,
      new THREE.BufferAttribute(compact, itemSize, attr.normalized)
    );
  }
}

/**
 * Lisse UNE géométrie en place (soudure + normales moyennées).
 * La soudure se fait sur la POSITION seule (comme "Shade Smooth") : les
 * normales/uv existantes diffèrent par face et empêcheraient toute fusion.
 * Retourne true si soudée (était non-indexée), false si déjà indexée ou ignorée.
 */
export function smoothShadeGeometry(geo: THREE.BufferGeometry): boolean {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count === 0) return false;
  // Cibles de morphing : la compaction désynchroniserait les morphs.
  if (Object.keys(geo.morphAttributes).length > 0) {
    geo.computeVertexNormals();
    return false;
  }
  let welded = false;
  try {
    if (!geo.index) {
      // mergeVertices préserve l'ordre des triangles : les groupes
      // (multi-matériaux) restent valides après soudure.
      const posOnly = new THREE.BufferGeometry();
      posOnly.setAttribute('position', pos);
      const merged = mergeVertices(posOnly);
      if (merged.index) {
        const uniqueCount = (merged.getAttribute('position') as THREE.BufferAttribute).count;
        geo.setAttribute('position', merged.getAttribute('position'));
        compactAttributes(geo, merged.index.array as unknown as ArrayLike<number>, uniqueCount);
        geo.deleteAttribute('normal');
        geo.setIndex(merged.index);
        geo.boundingSphere = null;
        geo.boundingBox = null;
        welded = true;
      }
    }
    geo.computeVertexNormals();
    const normal = geo.getAttribute('normal');
    if (normal) normal.needsUpdate = true;
    return welded;
  } catch {
    return false;
  }
}

/**
 * Lisse tous les meshes sous `root` (objet, groupe ou scène) :
 * normales douces + flatShading désactivé sur les matériaux standards.
 */
export function smoothShadeObject(root: THREE.Object3D): SmoothShadeReport {
  const report: SmoothShadeReport = { meshes: 0, smoothed: 0, skipped: 0 };
  const geos = collectGeometries(root);
  report.meshes = geos.length;
  for (const geo of geos) {
    // Les cibles de morphing / skins complexes gardent leurs normales d'origine.
    const anyGeo = geo as THREE.BufferGeometry & {
      morphAttributes?: Record<string, unknown[]>;
    };
    if (anyGeo.morphAttributes && Object.keys(anyGeo.morphAttributes).length > 0) {
      report.skipped += 1;
      continue;
    }
    smoothShadeGeometry(geo);
    report.smoothed += 1;
  }
  eachMaterial(root, (m) => {
    if (m instanceof THREE.MeshStandardMaterial) {
      m.flatShading = false;
      m.needsUpdate = true;
    }
  });
  return report;
}

/**
 * Retour au facetté (flat shading) : dé-indexe + normales par face.
 * Les géométries partagées restent partagées (même remplacement partout).
 */
export function flattenShadeObject(root: THREE.Object3D): SmoothShadeReport {
  const report: SmoothShadeReport = { meshes: 0, smoothed: 0, skipped: 0 };
  const remap = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geo = child.geometry as THREE.BufferGeometry | undefined;
    if (!geo) {
      report.skipped += 1;
      return;
    }
    report.meshes += 1;
    let flat = remap.get(geo);
    if (!flat) {
      try {
        flat = geo.index ? geo.toNonIndexed() : geo;
        flat.computeVertexNormals();
        remap.set(geo, flat);
      } catch {
        report.skipped += 1;
        return;
      }
    }
    child.geometry = flat;
    report.smoothed += 1;
  });
  eachMaterial(root, (m) => {
    if (m instanceof THREE.MeshStandardMaterial) {
      m.flatShading = true;
      m.needsUpdate = true;
    }
  });
  return report;
}

/** L'état de lissage d'un objet (vrai si le matériau source est en smooth). */
export function isSmoothShaded(root: THREE.Object3D): boolean {
  let smooth = false;
  root.traverse((child) => {
    if (smooth || !(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial && m.flatShading === false) {
        smooth = true;
        return;
      }
    }
  });
  return smooth;
}
