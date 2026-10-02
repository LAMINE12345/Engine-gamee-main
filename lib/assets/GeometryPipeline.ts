import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeshoptSimplifier as SimplifierValue } from 'meshoptimizer/simplifier';
import type { MeshoptEncoder as EncoderValue } from 'meshoptimizer/encoder';
import type { MeshoptDecoder as DecoderValue } from 'meshoptimizer/decoder';

type SimplifierT = typeof SimplifierValue;
type EncoderT = typeof EncoderValue;
type DecoderT = typeof DecoderValue;

/**
 * GeometryPipeline — optimisation + compression + LOD (meshoptimizer).
 *
 * Étapes :
 * 1. `prepareIndexed` : soudure des sommets (mergeVertices) → maillage indexé.
 * 2. `optimize` : réordonnancement d'indices (cache vertex GPU, lossless).
 * 3. `generateLODs` : simplification meshopt (bordures verrouillées).
 * 4. `encodeIndexBlob` / `decodeIndexBlob` : codec meshopt pour le stockage
 *    IndexedDB (ratios classe-Draco, décodage natif three.js, sans CDN).
 *
 * meshoptimizer est chargé en dynamique (code-split, ~wasm embarqué) :
 * si indisponible, chaque étape dégrade gracieusement (statut `unsupported`).
 */

export interface LODIndexData {
  ratio: number;
  indices: Uint32Array;
  error: number;
  triangleCount: number;
}

/** En-tête des blobs d'indices : magic + taille décompressée (pour le decode). */
const BLOB_MAGIC = 0x4d455348; // 'MESH'
const HEADER_BYTES = 8;

/** Seuil : en dessous, un LOD ne vaut pas le coût (statut `small`). */
export const LOD_MIN_TRIANGLES = 1000;

/** Version du pipeline LOD (weld + reorder + simplify). Les records plus
 *  anciens sont régénérés (leurs blobs référençaient un autre ordre). */
export const LOD_PIPELINE_VERSION = 2;

/**
 * Réordonne tous les attributs (réguliers ou entrelacés) selon le remap
 * meshopt. Convention officielle : `new[remap[old]] = old[old]`
 * (remap = old→new ; les sommets inutilisés portent ~0u et sont compactés).
 * Les attributs normalisés packés sont déballés en float (valeurs exactes).
 */
function remapGeometryAttributes(
  geometry: THREE.BufferGeometry,
  remap: Uint32Array,
  unique: number
): void {
  const oldCount = geometry.attributes.position.count;
  const remapOne = (
    attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    itemSize: number
  ): THREE.BufferAttribute => {
    type NumArray = { [i: number]: number; length: number };
    const normalized = (attr as THREE.BufferAttribute).normalized === true;
    const Ctor = (
      normalized ? Float32Array : (attr.array.constructor as new (n: number) => NumArray)
    );
    const dst = new Ctor(unique * itemSize);
    for (let o = 0; o < oldCount; o++) {
      const n = remap[o];
      if (n >= unique) continue; // sommet inutilisé : compacté
      for (let k = 0; k < itemSize; k++) {
        dst[n * itemSize + k] = attr.getComponent(o, k);
      }
    }
    const out = new THREE.BufferAttribute(dst as unknown as THREE.BufferAttribute['array'], itemSize, false);
    const usage = (attr as THREE.BufferAttribute).usage;
    if (typeof usage === 'number') out.setUsage(usage);
    return out;
  };

  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.attributes[name] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    geometry.setAttribute(name, remapOne(attr, attr.itemSize));
  }
  const morphs = geometry.morphAttributes as Record<string, (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[] | undefined>;
  for (const name of Object.keys(morphs)) {
    const list = morphs[name];
    if (!list) continue;
    (geometry.morphAttributes as Record<string, unknown>)[name] = list.map((m) => remapOne(m, m.itemSize));
  }
}

let simplifierPromise: Promise<SimplifierT | null> | null = null;
let encoderPromise: Promise<EncoderT | null> | null = null;
let decoderPromise: Promise<DecoderT | null> | null = null;

async function loadSimplifier(): Promise<SimplifierT | null> {
  if (!simplifierPromise) {
    simplifierPromise = (async () => {
      try {
        const mod = await import('meshoptimizer/simplifier');
        const s = mod.MeshoptSimplifier as SimplifierT;
        await s.ready;
        return s.supported ? s : null;
      } catch (err) {
        console.warn('GeometryPipeline : meshopt simplifier indisponible.', err);
        return null;
      }
    })();
  }
  return simplifierPromise;
}

async function loadEncoder(): Promise<EncoderT | null> {
  if (!encoderPromise) {
    encoderPromise = (async () => {
      try {
        const mod = await import('meshoptimizer/encoder');
        const e = mod.MeshoptEncoder as EncoderT;
        await e.ready;
        return e.supported ? e : null;
      } catch (err) {
        console.warn('GeometryPipeline : meshopt encoder indisponible.', err);
        return null;
      }
    })();
  }
  return encoderPromise;
}

async function loadDecoder(): Promise<DecoderT | null> {
  if (!decoderPromise) {
    decoderPromise = (async () => {
      try {
        const mod = await import('meshoptimizer/decoder');
        const d = mod.MeshoptDecoder as DecoderT;
        await d.ready;
        return d.supported ? d : null;
      } catch (err) {
        console.warn('GeometryPipeline : meshopt decoder indisponible.', err);
        return null;
      }
    })();
  }
  return decoderPromise;
}

export const GeometryPipeline = {
  /** Précharge les modules wasm (appelée au démarrage, non bloquante). */
  preload(): void {
    void loadSimplifier();
    void loadEncoder();
    void loadDecoder();
  },

  async isSupported(): Promise<boolean> {
    return (await loadSimplifier()) !== null;
  },

  /**
   * Garantit une géométrie indexée SUR LE MESH VIVANT (soudure à 1e-4 si
   * non indexée, visuellement identique). Requis car les indices LOD
   * simplifiés référencent l'ordre des sommets du mesh affiché.
   * Retourne null si l'indexation est impossible (mesh ignoré pour le LOD).
   */
  ensureIndexedLive(mesh: THREE.Mesh): THREE.BufferGeometry | null {
    const current = mesh.geometry as THREE.BufferGeometry;
    if (!current) return null;
    if (current.index) return current;
    try {
      const welded = mergeVertices(current, 1e-4);
      if (!welded.index) return null;
      welded.computeBoundingSphere();
      mesh.geometry = welded;
      current.dispose();
      return welded;
    } catch {
      return null;
    }
  },

  /**
   * Extrait positions + index d'une géométrie DÉJÀ indexée.
   * La géométrie d'origine n'est jamais mutée.
   */
  prepareIndexed(geometry: THREE.BufferGeometry): {
    positions: Float32Array;
    index: Uint32Array;
  } {
    if (!geometry.index) throw new Error('Géométrie non indexée (voir ensureIndexedLive).');
    const posAttr = geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!posAttr) throw new Error('Géométrie sans positions.');
    return {
      positions: posAttr.array as Float32Array,
      index: new Uint32Array(geometry.index.array as ArrayLike<number>),
    };
  },

  /**
   * Réordonne les indices pour le cache vertex GPU (lossless).
   * Retourne le nombre de triangles.
   *
   * `reorderMesh` fait cache + FETCH : il renumérote les sommets (compaction)
   * et retourne le remap — il faut donc réordonner TOUS les attributs
   * (positions, normales, UV, skin, morphs…) sans quoi l'index pointe vers
   * de mauvais sommets (modèle visiblement détruit).
   * Garde-fous : géométries multi-matériaux (groups) ignorées — le reorder
   * global invaliderait les plages de groupes.
   */
  async optimize(geometry: THREE.BufferGeometry): Promise<{ triangles: number; optimized: boolean }> {
    const triCount = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    const encoder = await loadEncoder();
    if (!encoder || !geometry.index) return { triangles: Math.floor(triCount), optimized: false };
    if (geometry.groups && geometry.groups.length > 0) {
      return { triangles: Math.floor(triCount), optimized: false };
    }
    try {
      const src = new Uint32Array(geometry.index.array as ArrayLike<number>);
      const [remap, unique] = encoder.reorderMesh(src, true, true);
      if (unique <= 0 || unique > geometry.attributes.position.count) {
        return { triangles: Math.floor(triCount), optimized: false };
      }
      remapGeometryAttributes(geometry, remap, unique);
      geometry.setIndex(new THREE.BufferAttribute(src, 1));
      geometry.computeBoundingSphere();
      if (geometry.boundingBox) geometry.computeBoundingBox();
      return { triangles: Math.floor(triCount), optimized: true };
    } catch {
      return { triangles: Math.floor(triCount), optimized: false };
    }
  },

  /**
   * Génère des niveaux LOD (indices simplifiés, attributs partagés avec L0).
   * `ratios` : fractions d'indices conservées, ex. [0.5, 0.25].
   */
  async generateLODs(
    positions: Float32Array,
    index: Uint32Array,
    ratios: number[]
  ): Promise<LODIndexData[]> {
    const simplifier = await loadSimplifier();
    if (!simplifier) throw new Error('Simplifier indisponible.');
    const levels: LODIndexData[] = [];
    for (const ratio of ratios) {
      const target = Math.max(12, Math.floor(index.length * ratio));
      if (target >= index.length) continue;
      const [simplified, error] = simplifier.simplify(
        index,
        positions,
        3,
        target,
        1e-2,
        ['LockBorder']
      );
      levels.push({
        ratio,
        indices: simplified,
        error,
        triangleCount: Math.floor(simplified.length / 3),
      });
    }
    return levels;
  },

  /** Encode un buffer d'indices (Uint32) avec en-tête de taille. */
  async encodeIndexBlob(indices: Uint32Array): Promise<ArrayBuffer> {
    const encoder = await loadEncoder();
    const raw = new Uint8Array(indices.buffer.slice(0));
    let payload: Uint8Array = raw;
    if (encoder) {
      try {
        const encoded = encoder.encodeIndexBuffer(raw, indices.length, 4);
        // Ne garde l'encodé que s'il est strictement plus petit (le décodeur
        // distingue encodé/brut par comparaison de taille).
        if (encoded.length < raw.length) payload = encoded;
      } catch {
        payload = raw;
      }
    }
    const out = new Uint8Array(HEADER_BYTES + payload.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, BLOB_MAGIC);
    view.setUint32(4, raw.length);
    out.set(payload, HEADER_BYTES);
    return out.buffer;
  },

  /** Décode un blob d'indices (meshopt si disponible, sinon brut). */
  async decodeIndexBlob(blob: ArrayBuffer): Promise<Uint32Array> {
    const bytes = new Uint8Array(blob);
    const view = new DataView(blob);
    if (bytes.length < HEADER_BYTES || view.getUint32(0) !== BLOB_MAGIC) {
      throw new Error('Blob LOD invalide.');
    }
    const decodedLen = view.getUint32(4);
    const payload = bytes.slice(HEADER_BYTES);
    // Heuristique : payload < brut ⇒ encodé meshopt.
    if (payload.length < decodedLen) {
      const decoder = await loadDecoder();
      if (!decoder) throw new Error('Decodeur meshopt indisponible.');
      const target = new Uint8Array(decodedLen);
      decoder.decodeIndexBuffer(target, decodedLen / 4, 4, payload);
      return new Uint32Array(target.buffer);
    }
    return new Uint32Array(payload.buffer.slice(0));
  },
};
