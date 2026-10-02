/**
 * types/assets.ts — types publics de l'Asset Pipeline.
 *
 * - AssetRecord : fiche d'un asset (modèle, texture, audio) avec métadonnées,
 *   stats géométriques, état LOD et suivi de références.
 * - AssetBundleManifest : groupe nommé d'assets (zone/scène) pour chargement paresseux.
 * - AssetStats / ModelImportReport : supervision pour l'UI.
 */

export type AssetKind = 'model' | 'texture' | 'audio';

/** Codec de compression du stockage (IndexedDB). */
export type AssetCodec = 'raw' | 'meshopt';

export type LODStatus = 'none' | 'pending' | 'ready' | 'unsupported' | 'small';

export interface LODLevelMeta {
  /** Ratio d'indices conservés (1 = niveau de base, pas de blob). */
  ratio: number;
  /** Distance max (m) avant de basculer vers ce niveau. */
  maxDistance: number;
  /** Clé du blob d'indices dans l'AssetStore (absent pour L0). */
  blobKey?: string;
  /** Erreur géométrique meshopt (0 pour L0). */
  error: number;
  /** Nombre de triangles de ce niveau. */
  triangleCount: number;
  /** Index du maillage dans l'ordre de parcours (modèles multi-mesh). */
  meshIndex?: number;
}

export interface AssetRecord {
  /** Identifiant stable (= storageId pour les modèles, ex. 'model-<uuid>'). */
  id: string;
  kind: AssetKind;
  /** Nom d'origine du fichier. */
  name: string;
  /** Extension/format source : 'glb' | 'fbx' | 'png' | 'webp' | 'wav' | ... */
  format: string;
  /** Octets du blob source. */
  byteLength: number;
  /** Octets après compression (si codec != raw). */
  compressedBytes?: number;
  codec: AssetCodec;
  createdAt: string;

  // --- Modèles ---
  triangleCount?: number;
  vertexCount?: number;
  meshCount?: number;
  animationCount?: number;
  textureIds?: string[];
  lodStatus?: LODStatus;
  lodLevels?: LODLevelMeta[];
  lodBytes?: number;
  /** Version du pipeline LOD (2 = weld + reorder + simplify cohérents). */
  lodPipelineVersion?: number;

  // --- Textures ---
  width?: number;
  height?: number;
  /** Tailles des variantes générées (ex. [256, 512, 1024]). */
  variants?: number[];

  // --- Suivi de références (refcount) ---
  refCount: number;
  /** UUIDs des objets de scène qui référencent cet asset. */
  referencedBy: string[];
  /** Bundles contenant cet asset. */
  bundleIds: string[];
  tags?: string[];
}

export interface AssetBundleManifest {
  id: string;
  name: string;
  assetIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetStats {
  models: number;
  textures: number;
  audio: number;
  bundles: number;
  /** Octets stockés (IndexedDB, source + LOD + variantes). */
  totalBytes: number;
  orphanCount: number;
  orphanBytes: number;
  /** Estimation VRAM (textures actives, fournie par le TextureStreamer). */
  vramBytes: number;
  /** Maillages suivis par le LODManager. */
  lodMeshes: number;
}

export interface ModelImportReport {
  assetId: string;
  triangleCount: number;
  vertexCount: number;
  meshCount: number;
  textureIds: string[];
  lodStatus: LODStatus;
  durationMs: number;
}

export interface OrphanPurgeResult {
  count: number;
  freedBytes: number;
}

export interface AssetDeleteResult {
  ok: boolean;
  deleted: boolean;
  /** true si aucun record (asset legacy) : l'appelant gère la suppression. */
  hasRecord: boolean;
  referencedBy?: string[];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(2)} Mo`;
  return `${(bytes / 1073741824).toFixed(2)} Go`;
}
