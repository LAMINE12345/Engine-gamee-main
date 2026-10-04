/**
 * nodeBuilder.ts
 * Construction d'un `Object3D` à partir d'un `SceneNode`, pour les formes
 * simples (maillages primitifs et lumières).
 *
 * Pourquoi ce module existe
 * -------------------------
 * `SceneManager.importScene` et `SceneManager.instantiatePrefab` contenaient
 * chacun une copie de ce bloc — matériau, preset de texture, `switch` de
 * géométrie, branche lumière — Verbatim. Une scène sauvée puis relue par un
 * chemin et non par l'autre donnait deux objets différents pour le même nœud,
 * et corriger l'un des deux laissait l'autre faux.
 *
 * Ces deux appelants délèguent déjà les cas complexes (groupe, prefab bas
 * poly, rivière) à `NodeRestorer` ; il ne restait que ce bloc, qui est pur :
 * il ne touche aucun état du moteur. Extrait ici, il devient testable — ce que
 * le code inline n'était pas.
 *
 * Le comportement est repris à l'identique, défauts compris : c'est le format
 * des scènes déjà sauvegardées qui dictent ces valeurs, pas l'esthétique.
 */

import * as THREE from 'three';
import { TextureGenerator } from '../textureGenerator';
import type { MaterialData, LightData } from '../../types/engine';

/**
 * Le minimum lu par ce module. Volontairement plus permissif que `SceneNode` :
 * `importScene` manipule des nœuds partiels (un `SceneExportData` relu peut
 * n'avoir ni `id` ni `subType`), et exiger la forme complète obligeait les deux
 * appelants à reconstruire un objet pour rien.
 */
export interface SimpleNodeSource {
  type: string;
  subType?: string;
  material?: Partial<MaterialData>;
  light?: Partial<LightData>;
}

/**
 * Géométrie par `subType`. Les dimensions sont figées depuis l'origine : les
 * scènes sauvegardées ne stockent pas les dimensions, seulement le `subType`.
 * Un cube fait donc 1,5 unité de côté quelle que soit l'échelle appliquée.
 */
function geometryFor(subType: string): THREE.BufferGeometry {
  switch (subType) {
    case 'sphere':
      return new THREE.SphereGeometry(0.9, 36, 36);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.75, 0.75, 1.8, 36);
    case 'plane':
      return new THREE.PlaneGeometry(3, 3);
    case 'torus':
      return new THREE.TorusGeometry(0.8, 0.25, 24, 48);
    case 'cone':
      return new THREE.ConeGeometry(0.9, 1.8, 32);
    case 'postProcessVolume':
      return new THREE.BoxGeometry(8, 5, 8);
    case 'cube':
    default:
      return new THREE.BoxGeometry(1.5, 1.5, 1.5);
  }
}

/** Matériau standard d'un maillage, avec le preset de texture procédurale. */
function materialFor(item: SimpleNodeSource): THREE.MeshStandardMaterial {
  const m = item.material;
  const mat = new THREE.MeshStandardMaterial({
    color: m?.color || '#3b82f6',
    roughness: m?.roughness ?? 0.35,
    metalness: m?.metalness ?? 0.2,
    wireframe: m?.wireframe ?? false,
    opacity: m?.opacity ?? 1,
    transparent: m?.transparent ?? false,
    emissive: new THREE.Color(m?.emissive || '#000000'),
    emissiveIntensity: m?.emissiveIntensity || 0,
  });

  if (m?.texturePreset && m.texturePreset !== 'none') {
    const normalTex = TextureGenerator.getNormalMap(m.texturePreset);
    if (normalTex) {
      mat.normalMap = normalTex;
      mat.normalScale.set(0.6, 0.6);
    }
  }
  return mat;
}

/** Couleur par défaut du volume de post-traitement, quand rien n'est dit. */
const VOLUME_COLOR = '#d946ef';

/**
 * Construit l'objet d'un nœud simple, ou `null` si le nœud relève d'un
 * constructeur spécialisé (groupe, prefab bas poly, rivière) — que l'appelant
 * doit router vers `NodeRestorer`.
 */
export function buildSimpleNode(item: SimpleNodeSource, subType: string): THREE.Object3D | null {
  if (item.type === 'mesh') {
    const mat = materialFor(item);
    const mesh = new THREE.Mesh(geometryFor(subType), mat);

    if (subType === 'postProcessVolume') {
      // Le volume est un contour filaire translucide : on écrase les valeurs
      // par défaut du matériau, pas celles de la scène.
      mat.color.set(item.material?.color || VOLUME_COLOR);
      mat.wireframe = item.material?.wireframe ?? true;
      mat.transparent = true;
      mat.opacity = item.material?.opacity ?? 0.55;
    }

    mesh.userData = { subType, texturePreset: item.material?.texturePreset };
    return mesh;
  }

  if (item.type === 'light') {
    // `LightData.color` est une chaîne CSS dans le format persisté
    // (`updateLight` fait `color.set(...)`). Les défauts sont donc écrits dans
    // le même registre, même si `Color.set` accepte les deux.
    const light = item.light;
    if (subType === 'point') {
      const point = new THREE.PointLight(
        light?.color || '#38bdf8',
        light?.intensity || 3.5,
        light?.distance || 18
      );
      // Le helper est un objet de débogage : il est ajouté comme enfant et
      //ichier avec l'nœud parent, donc il part avec.
      point.add(new THREE.PointLightHelper(point, 0.3));
      point.userData = { subType: 'point' };
      return point;
    }
    const directional = new THREE.DirectionalLight(
      light?.color || '#ffffff',
      light?.intensity || 2.0
    );
    directional.userData = { subType: 'directional' };
    return directional;
  }

  return null;
}

/**
 * `true` quand le nœud doit être construit par `NodeRestorer` et non ici.
 * centralise les critères pour que les deux appelants ne puissent pas diverger.
 *
 * ⚠ Utilisé par le seul `importScene` : `instantiatePrefab` traite les groupes
 * autrement — il construit le `THREE.Group` lui-même pour pouvoir y appliquer
 * l'offset de la racine instanciée. Les deux chemins ne sont donc PAS
 * interchangeables sur les groupes, et le uniformiser casserait l'offset des
 * prefabs. Vérifié avant de l'appliquer au second appelant.
 */
export function needsNodeRestorer(item: SimpleNodeSource, subType: string): boolean {
  if (item.type === 'group') return true;
  if (item.type === 'mesh' && subType === 'lowPoly') return true;
  if (item.type === 'mesh' && subType === 'river') return true;
  return false;
}