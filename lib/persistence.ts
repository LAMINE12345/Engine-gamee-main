/**
 * persistence.ts
 *
 * Petite couche de persistance pour l'éditeur :
 * - Autosave de la scène (JSON) -> localStorage (synchrone, debouncé côté SceneManager)
 * - Binaires des modèles importés (.glb/.fbx) -> IndexedDB (localStorage limité à ~5 Mo)
 * - Textures importées depuis le disque -> IndexedDB (idem : une data-URL
 *   ferait exploser l'autosave, une object URL meurt avec la session)
 *
 * Les blobs IndexedDB survivent au rechargement de la page, contrairement aux
 * object URLs / File handles qui meurent avec la session.
 */

const AUTOSAVE_DB = 'aether-persistence';
const MODEL_STORE = 'model-binaries';
/** Store dédié aux textures importées depuis le disque (cf. TextureAssignerPanel). */
const TEXTURE_STORE = 'texture-binaries';
/** v2 : ajout du store `texture-binaries` (textures importées du disque). */
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(AUTOSAVE_DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        db.createObjectStore(MODEL_STORE);
      }
      if (!db.objectStoreNames.contains(TEXTURE_STORE)) {
        db.createObjectStore(TEXTURE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Ouverture IndexedDB impossible"));
  });
}

/** Stocke le binaire d'un modèle importé (clé = ModelInfo.storageId). */
export async function saveModelBinary(storageId: string, data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, 'readwrite');
      tx.objectStore(MODEL_STORE).put(data, storageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Écriture modèle impossible'));
    });
  } finally {
    db.close();
  }
}

/** Relit le binaire d'un modèle (null si absent). */
export async function loadModelBinary(storageId: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  try {
    return await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, 'readonly');
      const req = tx.objectStore(MODEL_STORE).get(storageId);
      req.onsuccess = () => {
        const v = req.result as ArrayBuffer | undefined;
        resolve(v ? v : null);
      };
      req.onerror = () => reject(req.error || new Error('Lecture modèle impossible'));
    });
  } finally {
    db.close();
  }
}

/** Supprime le binaire d'un modèle (appelé à la suppression de l'objet). */
export async function deleteModelBinary(storageId: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, 'readwrite');
      tx.objectStore(MODEL_STORE).delete(storageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Suppression modèle impossible'));
    });
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Textures importées depuis le disque
// ---------------------------------------------------------------------------

/**
 * Préfixe des clés de textures locales dans `MaterialData.mapUrl`.
 * Distingue une référence « aether:texture:<id> » d'une vraie URL (http/https),
 * qui part directement chez TextureLoader.
 */
export const LOCAL_TEXTURE_PREFIX = 'aether:texture:';

/** Format de texture accepté par le panneau d'assignation. */
const ALLOWED_TEXTURE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
]);

export const MAX_TEXTURE_BYTES = 32 * 1024 * 1024;

/** Un fichier est-il une texture exploitable par le moteur ? */
export function isSupportedTextureFile(file: File): boolean {
  return ALLOWED_TEXTURE_MIME.has(file.type.toLowerCase());
}

/** Génère une clé de stockage unique pour une texture locale. */
export function makeLocalTextureKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${LOCAL_TEXTURE_PREFIX}${Date.now().toString(36)}-${rand}`;
}

/** Une `mapUrl` pointe-t-elle vers une texture locale (IndexedDB) ? */
export function isLocalTextureKey(url: string | undefined | null): boolean {
  return typeof url === 'string' && url.startsWith(LOCAL_TEXTURE_PREFIX);
}

/** Stocke le binaire d'une texture locale (clé = `aether:texture:<id>`). */
export async function saveTextureBinary(key: string, data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TEXTURE_STORE, 'readwrite');
      tx.objectStore(TEXTURE_STORE).put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Écriture texture impossible'));
    });
  } finally {
    db.close();
  }
}

/** Relit le binaire d'une texture locale (null si absent). */
export async function loadTextureBinary(key: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  try {
    return await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(TEXTURE_STORE, 'readonly');
      const req = tx.objectStore(TEXTURE_STORE).get(key);
      req.onsuccess = () => {
        const v = req.result as ArrayBuffer | undefined;
        resolve(v ? v : null);
      };
      req.onerror = () => reject(req.error || new Error('Lecture texture impossible'));
    });
  } finally {
    db.close();
  }
}

/** Supprime le binaire d'une texture locale. */
export async function deleteTextureBinary(key: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TEXTURE_STORE, 'readwrite');
      tx.objectStore(TEXTURE_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Suppression texture impossible'));
    });
  } finally {
    db.close();
  }
}

/**
 * Convertit une clé locale en object URL exploitable par THREE.TextureLoader.
 * L'object URL reste vivant jusqu'à la suppression de l'objet : on garde
 * l'URL précédente en cache (clé → object URL) pour ne pas en fuir une par
 * rechargement de texture.
 */
const localObjectUrlCache = new Map<string, string>();

export async function resolveTextureUrl(mapUrl: string): Promise<string | null> {
  if (!isLocalTextureKey(mapUrl)) return mapUrl;
  const cached = localObjectUrlCache.get(mapUrl);
  if (cached) return cached;

  const buf = await loadTextureBinary(mapUrl).catch(() => null);
  if (!buf) return null;

  const url = URL.createObjectURL(new Blob([buf]));
  localObjectUrlCache.set(mapUrl, url);
  return url;
}

/** Libère l'object URL d'une texture locale retirée de la scène. */
export function releaseTextureUrl(key: string): void {
  const url = localObjectUrlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    localObjectUrlCache.delete(key);
  }
}
