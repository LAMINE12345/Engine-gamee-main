import * as THREE from 'three';
import { System, Entity, ToonMaterialComponent, OutlineComponent } from './ECS';

/**
 * Nom réservé aux hulls de contour ajoutés par ce système.
 */
export const TOON_OUTLINE_NAME = '__aether_outline_hull__';

/**
 * Clé userData stockant le matériau d'origine d'un mesh converti en toon,
 * afin de pouvoir restaurer le rendu PBR et garder les réglages synchronisés.
 */
export const TOON_SOURCE_MATERIAL_KEY = '__aetherToonSourceMaterial';

/** Clé userData mémorisant le nombre de bandes du matériau toon courant. */
const TOON_LEVELS_KEY = '__aetherToonLevels';

/** Flag userData apposé sur les hulls de contour. */
const OUTLINE_FLAG_KEY = '__aetherIsOutlineHull';

/** userData du hull : bases géométriques & état de l'expansion. */
const HULL_BASE_POS_KEY = '__aetherOutlineBasePositions';
const HULL_BASE_NORM_KEY = '__aetherOutlineBaseNormals';
const HULL_CENTER_KEY = '__aetherOutlineCenter';
const HULL_RADIUS_KEY = '__aetherOutlineRadius';
const HULL_DELTA_KEY = '__aetherOutlineDelta';

const WHITE = new THREE.Color(0xffffff);

/** Cache des gradient maps par nombre de bandes (partagé entre matériaux). */
const gradientCache: Map<number, THREE.DataTexture> = new Map();

/** Signature des maps par matériau toon (recompilation uniquement au besoin). */
const mapSignatureCache = new WeakMap<THREE.MeshToonMaterial, string>();

/**
 * Construit une gradient map discrète (NearestFilter) pour MeshToonMaterial :
 * `bands` paliers uniformément répartis du sombre au clair.
 */
function getGradientMap(levels: number): THREE.DataTexture {
  const bands = Math.max(2, Math.min(10, Math.round(levels)));
  let texture = gradientCache.get(bands);
  if (!texture) {
    const data = new Uint8Array(bands);
    for (let i = 0; i < bands; i++) {
      data[i] = Math.round(((i + 1) / bands) * 255);
    }
    texture = new THREE.DataTexture(data, bands, 1, THREE.RedFormat, THREE.UnsignedByteType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    gradientCache.set(bands, texture);
  }
  return texture;
}

/**
 * Signature des textures référencées par une source : permet de ne flagger
 * `needsUpdate` sur le matériau toon que lorsque les maps changent réellement
 * (sinon les maps n'apparaissent pas sans recompilation du shader).
 */
function getMapSignature(source: THREE.Material | undefined): string {
  const std = (source ?? {}) as Partial<THREE.MeshStandardMaterial>;
  return [
    std.map?.uuid ?? '-',
    std.alphaMap?.uuid ?? '-',
    std.normalMap?.uuid ?? '-',
    std.bumpMap?.uuid ?? '-',
    std.emissiveMap?.uuid ?? '-',
    std.aoMap?.uuid ?? '-',
  ].join('|');
}

// ---------------------------------------------------------------------------
// Injection toon dans les shaders custom (eau, rivières) & particules
// ---------------------------------------------------------------------------

const TOON_INJECT_KEY = '__aetherToonInjected';
const TOON_SHADER_REF_KEY = '__aetherToonShaderRef';

const AETHER_TOON_GLSL = `uniform float uAetherToonLevels;
vec3 aetherQuantize(vec3 color, float levels) {
  float n = max(levels, 2.0);
  return floor(clamp(color, 0.0, 1.0) * n + 0.5) / n;
}`;

type ToonShaderRef = { uniforms: Record<string, { value: number }> };

function setInjectedToonLevels(ref: unknown, levels: number): void {
  const shaderRef = ref as ToonShaderRef | undefined;
  if (shaderRef?.uniforms?.uAetherToonLevels) {
    shaderRef.uniforms.uAetherToonLevels.value = Math.max(2, Math.min(10, Math.round(levels)));
  }
}

/**
 * Eau (océan/lac) & rivières : quantisation toon injectée DANS le shader
 * custom — les vagues Gerstner, reflets, écume et animations restent
 * intacts, seule la palette finale est réduite en bandes cartoon.
 */
export function applyToonToShaderMaterial(material: THREE.ShaderMaterial, levels: number): void {
  if (!material.userData[TOON_INJECT_KEY]) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uAetherToonLevels = { value: Math.max(2, Math.min(10, Math.round(levels))) };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${AETHER_TOON_GLSL}\nvoid main() {`)
        .replace(
          'gl_FragColor = vec4(finalColor, alpha);',
          'finalColor = aetherQuantize(finalColor, uAetherToonLevels);\n      gl_FragColor = vec4(finalColor, alpha);'
        );
      material.userData[TOON_SHADER_REF_KEY] = shader;
    };
    material.userData[TOON_INJECT_KEY] = true;
    material.needsUpdate = true;
  } else {
    setInjectedToonLevels(material.userData[TOON_SHADER_REF_KEY], levels);
  }
}

export function removeToonFromShaderMaterial(material: THREE.ShaderMaterial): void {
  if (!material.userData[TOON_INJECT_KEY]) return;
  delete material.userData[TOON_INJECT_KEY];
  delete material.userData[TOON_SHADER_REF_KEY];
  material.onBeforeCompile = function () {};
  material.needsUpdate = true;
}

/**
 * Particules (feu, fumée, pluie/neige-VFX, aurore, étincelles...) :
 * quantisation toon injectée dans le PointsMaterial (vertexColors, blending
 * additif et animations préservés).
 */
export function applyToonToPointsMaterial(material: THREE.PointsMaterial, levels: number): void {
  if (!material.userData[TOON_INJECT_KEY]) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uAetherToonLevels = { value: Math.max(2, Math.min(10, Math.round(levels))) };
      let injectionPoint = '#include <tonemapping_fragment>';
      if (!shader.fragmentShader.includes(injectionPoint)) {
        injectionPoint = '#include <colorspace_fragment>';
      }
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${AETHER_TOON_GLSL}\nvoid main() {`)
        .replace(
          injectionPoint,
          `gl_FragColor = vec4(aetherQuantize(gl_FragColor.rgb, uAetherToonLevels), gl_FragColor.a);\n  ${injectionPoint}`
        );
      material.userData[TOON_SHADER_REF_KEY] = shader;
    };
    material.userData[TOON_INJECT_KEY] = true;
    material.needsUpdate = true;
  } else {
    setInjectedToonLevels(material.userData[TOON_SHADER_REF_KEY], levels);
  }
}

export function removeToonFromPointsMaterial(material: THREE.PointsMaterial): void {
  if (!material.userData[TOON_INJECT_KEY]) return;
  delete material.userData[TOON_INJECT_KEY];
  delete material.userData[TOON_SHADER_REF_KEY];
  material.onBeforeCompile = function () {};
  material.needsUpdate = true;
}

/**
 * System to apply Toon Shading and Outline properties to entities.
 *
 * Est exécuté à CHAQUE frame (mode édition ET lecture) par le SceneManager :
 * - Convertit les matériaux en MeshToonMaterial avec `colorLevels` bandes
 *   via une gradient map discrète ; toutes les propriétés PBR (couleur,
 *   maps, émissif, relief, opacité...) restent synchronisées avec la source.
 * - Conserve le matériau d'origine (restauration instantanée, réglages suivis).
 * - Dessine le contour par expansion des sommets le long des normales :
 *   épaisseur CONSTANTE quelle que soit la taille de l'objet, ajustable en
 *   direct via `outlineThickness`, sans jamais créer de hull dans un hull.
 */
export class ToonMaterialSystem extends System {
  readonly name = 'ToonMaterialSystem';

  update(_dt: number, entities: Entity[]): void {
    for (const entity of entities) {
      if (!entity.object3D) continue;

      const toonComp = entity.getComponent<ToonMaterialComponent>('ToonMaterial');
      const outlineComp = entity.getComponent<OutlineComponent>('Outline');

      const toonActive = !!toonComp && toonComp.enabled && toonComp.colorLevels > 0;
      const outlineActive = !!outlineComp && outlineComp.enabled && outlineComp.strength > 0;

      // Composants absents : rien à faire.
      // Composants présents mais désactivés : on nettoie les résidus.
      if (!toonActive && !outlineActive) {
        if (toonComp || outlineComp) {
          ToonMaterialSystem.cleanupObject(entity.object3D);
        }
        continue;
      }

      entity.object3D.traverse((child) => {
        // Ne jamais traiter un hull de contour comme un mesh ordinaire
        // (sinon : outline dans l'outline à chaque frame => explosion de meshes)
        if (child.name === TOON_OUTLINE_NAME || child.userData[OUTLINE_FLAG_KEY]) return;

        if (child instanceof THREE.Mesh) {
          const sourceMaterial = child.userData[TOON_SOURCE_MATERIAL_KEY] ?? child.material;
          // Surfaces à shader custom (eau, rivières) : plates, pas de hull
          const isShaderSurface = sourceMaterial instanceof THREE.ShaderMaterial;

          if (toonActive && toonComp) {
            this.applyToonMaterial(child, toonComp);
          } else {
            this.restoreOriginalMaterial(child);
          }

          if (outlineActive && outlineComp && !isShaderSurface) {
            this.ensureOutlineHull(child, outlineComp);
          } else {
            this.removeOutlineHull(child);
          }
        } else if (child instanceof THREE.Points) {
          // Particules (feu, fumée, pluie/neige-VFX, aurore, VFX) : bandes toon
          this.applyToonToParticles(child, toonActive && toonComp ? toonComp : null);
        }
      });
    }
  }

  // ------------------------------------------------------------------
  // Toon material
  // ------------------------------------------------------------------

  private applyToonMaterial(child: THREE.Mesh, comp: ToonMaterialComponent): void {
    const source = child.userData[TOON_SOURCE_MATERIAL_KEY] ?? child.material;
    child.userData[TOON_SOURCE_MATERIAL_KEY] = source;

    const sourceMats: THREE.Material[] = Array.isArray(source) ? source : [source];
    const levels = Math.max(2, Math.min(10, Math.round(comp.colorLevels)));

    // Surfaces à shader custom (eau océan/lac, rivières...) : on conserve le
    // shader (vagues Gerstner, reflets, écume) et on injecte les bandes toon.
    if (sourceMats[0] instanceof THREE.ShaderMaterial) {
      applyToonToShaderMaterial(sourceMats[0], levels);
      return;
    }

    const gradient = getGradientMap(levels);

    const current = child.material;
    const currentMats: THREE.Material[] = Array.isArray(current) ? current : [current];

    const reusable =
      sourceMats.length === currentMats.length &&
      currentMats.every((m) => m instanceof THREE.MeshToonMaterial) &&
      child.userData[TOON_LEVELS_KEY] === levels;

    if (!reusable) {
      for (const m of currentMats) {
        if (m instanceof THREE.MeshToonMaterial) m.dispose();
      }
    }

    const rebuilt = sourceMats.map((src, i) => {
      const toon = reusable
        ? (currentMats[i] as THREE.MeshToonMaterial)
        : new THREE.MeshToonMaterial();
      if (!reusable) {
        toon.gradientMap = gradient;
      }
      this.syncToonProperties(toon, src);

      // Les maps exigent une recompilation du shader : uniquement au changement.
      const signature = getMapSignature(src);
      if (mapSignatureCache.get(toon) !== signature) {
        mapSignatureCache.set(toon, signature);
        toon.needsUpdate = true;
      }
      return toon;
    });

    child.userData[TOON_LEVELS_KEY] = levels;
    child.material = Array.isArray(source) ? rebuilt : rebuilt[0];
  }

  private syncToonProperties(toon: THREE.MeshToonMaterial, source: THREE.Material): void {
    const std = source as Partial<THREE.MeshStandardMaterial>;
    toon.color.copy(std.color ?? WHITE);
    toon.map = std.map ?? null;
    toon.alphaMap = std.alphaMap ?? null;
    toon.opacity = std.opacity ?? 1.0;
    toon.transparent = std.transparent ?? false;
    toon.wireframe = std.wireframe ?? false;
    toon.side = std.side ?? THREE.FrontSide;

    // Relief, émission, environnement : suivent les réglages PBR de la source
    toon.normalMap = std.normalMap ?? null;
    if (std.normalScale) toon.normalScale.copy(std.normalScale);
    toon.bumpMap = std.bumpMap ?? null;
    toon.bumpScale = std.bumpScale ?? 1;
    toon.emissiveMap = std.emissiveMap ?? null;
    toon.aoMap = std.aoMap ?? null;

    if (std.emissive) {
      toon.emissive.copy(std.emissive);
      toon.emissiveIntensity = std.emissiveIntensity ?? 1.0;
    } else {
      toon.emissive.setRGB(0, 0, 0);
    }

    // Couleurs du modèle (vertex colors / palette low-poly) : sans ce flag le
    // toon ignore l'attribut `color` et rend l'objet entièrement blanc.
    const vertexColors = std.vertexColors ?? false;
    if (toon.vertexColors !== vertexColors) {
      toon.vertexColors = vertexColors;
      toon.needsUpdate = true;
    }
  }

  private restoreOriginalMaterial(child: THREE.Mesh): void {
    const source = child.userData[TOON_SOURCE_MATERIAL_KEY];
    if (source === undefined) return;

    // Surface à shader custom : retirer l'injection toon du shader
    if (source instanceof THREE.ShaderMaterial) {
      removeToonFromShaderMaterial(source);
    }

    const current = child.material;
    const mats = Array.isArray(current) ? current : [current];
    for (const m of mats) {
      if (m instanceof THREE.MeshToonMaterial) m.dispose();
    }

    child.material = source;
    delete child.userData[TOON_SOURCE_MATERIAL_KEY];
    delete child.userData[TOON_LEVELS_KEY];
  }

  // ------------------------------------------------------------------
  // Outline (expansion le long des normales, épaisseur constante)
  // ------------------------------------------------------------------

  private ensureOutlineHull(child: THREE.Mesh, comp: OutlineComponent): void {
    if (child instanceof THREE.SkinnedMesh) {
      // Un hull non skinné ne suivrait pas le squelette : on évite les artefacts
      this.removeOutlineHull(child);
      return;
    }

    let hull = child.getObjectByName(TOON_OUTLINE_NAME) as THREE.Mesh | undefined;
    if (!hull) {
      if (!child.geometry || !child.geometry.attributes.position) return;

      const geometry = child.geometry.clone();
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(comp.color),
        side: THREE.BackSide,
      });
      hull = new THREE.Mesh(geometry, material);
      hull.name = TOON_OUTLINE_NAME;
      hull.userData[OUTLINE_FLAG_KEY] = true;
      hull.castShadow = false;
      hull.receiveShadow = false;
      hull.frustumCulled = false; // le hull déformé ne doit jamais être culled
      hull.raycast = () => {}; // le hull ne doit jamais capter la sélection

      // Bases géométriques pour une épaisseur constante et ajustable en direct
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
      const boundingBox = child.geometry.boundingBox ?? new THREE.Box3();
      hull.userData[HULL_CENTER_KEY] = boundingBox.getCenter(new THREE.Vector3());
      hull.userData[HULL_RADIUS_KEY] = child.geometry.boundingSphere?.radius ?? 1;

      const sourcePosition = geometry.attributes.position;
      const sourceNormal = geometry.attributes.normal;
      if (sourcePosition instanceof THREE.BufferAttribute) {
        hull.userData[HULL_BASE_POS_KEY] = new Float32Array(
          sourcePosition.array as Float32Array
        );
      }
      if (sourceNormal instanceof THREE.BufferAttribute) {
        hull.userData[HULL_BASE_NORM_KEY] = new Float32Array(
          sourceNormal.array as Float32Array
        );
      }
      hull.userData[HULL_DELTA_KEY] = null;

      child.add(hull);
    }

    // 0.03 unité locale par point d'épaisseur — identique pour tous les objets
    const delta = 0.03 * comp.strength;
    if (hull.userData[HULL_DELTA_KEY] !== delta) {
      this.applyOutlineDelta(hull, delta);
      hull.userData[HULL_DELTA_KEY] = delta;
    }

    const mat = hull.material as THREE.MeshBasicMaterial;
    if (mat.color.getHexString() !== comp.color.replace('#', '').toLowerCase()) {
      mat.color.set(comp.color);
    }
  }

  private applyOutlineDelta(hull: THREE.Mesh, delta: number): void {
    const position = hull.geometry.attributes.position as
      | THREE.BufferAttribute
      | undefined;
    const basePositions = hull.userData[HULL_BASE_POS_KEY] as Float32Array | undefined;
    const baseNormals = hull.userData[HULL_BASE_NORM_KEY] as Float32Array | null | undefined;

    const canWarp =
      position instanceof THREE.BufferAttribute &&
      !!basePositions &&
      !!baseNormals &&
      baseNormals.length === basePositions.length &&
      basePositions.length === (position.array as Float32Array).length;

    if (canWarp && position && basePositions && baseNormals) {
      // Expansion le long des normales : épaisseur constante en unités locales
      hull.position.set(0, 0, 0);
      hull.scale.setScalar(1);
      const array = position.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        array[i] = basePositions[i] + baseNormals[i] * delta;
        array[i + 1] = basePositions[i + 1] + baseNormals[i + 1] * delta;
        array[i + 2] = basePositions[i + 2] + baseNormals[i + 2] * delta;
      }
      position.needsUpdate = true;
    } else {
      // Géométrie entrelacée ou sans normales : expansion uniforme centrée
      const center = hull.userData[HULL_CENTER_KEY] as THREE.Vector3 | undefined;
      const radius = hull.userData[HULL_RADIUS_KEY] as number | undefined;
      if (!center || radius === undefined) return;
      const factor = 1 + delta / Math.max(radius, 1e-4);
      hull.position.copy(center);
      hull.scale.setScalar(factor);
    }
  }

  private removeOutlineHull(child: THREE.Mesh): void {
    const hull = child.getObjectByName(TOON_OUTLINE_NAME);
    if (!hull) return;

    hull.parent?.remove(hull);
    const mesh = hull as THREE.Mesh;
    mesh.geometry?.dispose();
    (mesh.material as THREE.Material | undefined)?.dispose();
  }

  /**
   * Particules : applique (ou retire) les bandes toon sur le PointsMaterial.
   * Idempotent et auto-réparé : si l'émetteur est recréé (nouveau matériau),
   * l'injection est ré-appliquée au frame suivant automatiquement.
   */
  private applyToonToParticles(points: THREE.Points, comp: ToonMaterialComponent | null): void {
    const material = points.material;
    if (!(material instanceof THREE.PointsMaterial)) return;

    if (comp && comp.enabled && comp.colorLevels > 0) {
      applyToonToPointsMaterial(material, comp.colorLevels);
    } else {
      removeToonFromPointsMaterial(material);
    }
  }

  // ------------------------------------------------------------------
  // Outils statiques (appelés par le SceneManager)
  // ------------------------------------------------------------------

  /** Restaure les matériaux PBR d'origine de tous les meshes convertis en toon. */
  public static restoreMaterials(root: THREE.Object3D | null | undefined): void {
    if (!root) return;
    const system = new ToonMaterialSystem();
    root.traverse((child) => {
      if (child instanceof THREE.Points) {
        if (child.material instanceof THREE.PointsMaterial) {
          removeToonFromPointsMaterial(child.material);
        }
      } else if (child instanceof THREE.Mesh) {
        if (child.userData[TOON_SOURCE_MATERIAL_KEY] !== undefined) {
          system.restoreOriginalMaterial(child);
        } else if (child.material instanceof THREE.ShaderMaterial) {
          removeToonFromShaderMaterial(child.material);
        }
      }
    });
  }

  /** Supprime (et dispose) tous les hulls de contour sous `root`. */
  public static removeOutlineMeshes(root: THREE.Object3D | null | undefined): void {
    if (!root) return;
    const hulls: THREE.Object3D[] = [];
    root.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        (child.name === TOON_OUTLINE_NAME || child.userData[OUTLINE_FLAG_KEY])
      ) {
        hulls.push(child);
      }
    });
    for (const hull of hulls) {
      hull.parent?.remove(hull);
      const mesh = hull as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    }
  }

  /** Affiche ou masque les hulls de contour (modes wireframe/normals). */
  public static setOutlineVisibility(root: THREE.Object3D | null | undefined, visible: boolean): void {
    if (!root) return;
    root.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        (child.name === TOON_OUTLINE_NAME || child.userData[OUTLINE_FLAG_KEY])
      ) {
        child.visible = visible;
      }
    });
  }

  /** Restaure les matériaux et retire tous les hulls de contour. */
  public static cleanupObject(root: THREE.Object3D | null | undefined): void {
    ToonMaterialSystem.restoreMaterials(root);
    ToonMaterialSystem.removeOutlineMeshes(root);
  }

  /**
   * Nettoie un clone issu de `duplicateSingleObject` :
   * - ré-attribue de VRAIS matériaux (clones des sources PBR, jamais les
   *   matériaux toon/hull générés à la volée ni les références partagées) ;
   * - supprime les hulls clonés (le système les recréera au besoin) ;
   * - purge les clés userData toon (corrompues par JSON.stringify).
   */
  public static sanitizeClonedPair(
    sourceRoot: THREE.Object3D,
    cloneRoot: THREE.Object3D,
    opts?: {
      /**
       * Le clone PARTAGE géométrie/matériau avec la source (copies de
       * répétition) : on conserve la référence matériau et on ne libère jamais
       * la géométrie d'un hull retiré (elle appartient encore à la source).
       */
      sharedResources?: boolean;
    }
  ): void {
    const shared = opts?.sharedResources === true;
    const sourceMeshes: THREE.Mesh[] = [];
    const cloneMeshes: THREE.Mesh[] = [];
    sourceRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) sourceMeshes.push(child);
    });
    cloneRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) cloneMeshes.push(child);
    });

    const count = Math.min(sourceMeshes.length, cloneMeshes.length);
    for (let i = 0; i < count; i++) {
      const sourceMesh = sourceMeshes[i];
      const cloneMesh = cloneMeshes[i];

      const isHull =
        sourceMesh.name === TOON_OUTLINE_NAME || sourceMesh.userData[OUTLINE_FLAG_KEY];
      if (isHull) {
        // Le hull sera recréé automatiquement si le contour est actif
        cloneMesh.parent?.remove(cloneMesh);
        if (!shared) cloneMesh.geometry?.dispose();
        continue;
      }

      if (shared) {
        cloneMesh.material = sourceMesh.material;
      } else {
        const rawSource =
          sourceMesh.userData[TOON_SOURCE_MATERIAL_KEY] ?? sourceMesh.material;
        cloneMesh.material = Array.isArray(rawSource)
          ? rawSource.map((m) => m.clone())
          : rawSource.clone();
      }

      delete cloneMesh.userData[TOON_SOURCE_MATERIAL_KEY];
      delete cloneMesh.userData[TOON_LEVELS_KEY];
    }
  }
}
