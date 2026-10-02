import type { AssetBundleManifest, AssetRecord } from '../../types/assets';
import { loadModelBinary as loadLegacyModelBinary } from '../persistence';

/**
 * AssetStore — stockage binaire de l'Asset Pipeline (IndexedDB).
 *
 * Base `aether-assets` :
 * - store `blobs` : clé → ArrayBuffer (sources, indices LOD, variantes textures)
 * - store `meta`  : clé → AssetRecord | AssetBundleManifest
 *   (records sous leur id, bundles sous `bundle:<id>`)
 *
 * - Cache mémoire LRU (cap configurable) pour éviter les lectures IDB par frame.
 * - Repli legacy : les binaires `model-*` importés avant le pipeline sont
 *   relus depuis l'ancienne base `aether-persistence` puis migrés à la volée.
 */

const ASSET_DB = 'aether-assets';
const BLOB_STORE = 'blobs';
const META_STORE = 'meta';
const DB_VERSION = 1;

const DEFAULT_CACHE_BYTES = 256 * 1024 * 1024;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(ASSET_DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Ouverture IndexedDB assets impossible'));
  });
}

function txDone<T>(tx: IDBTransaction, value: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error || new Error('Transaction assets impossible'));
  });
}

export class AssetStore {
  private memCache = new Map<string, { bytes: ArrayBuffer; size: number; lastUsed: number }>();
  private memBytes = 0;
  private readonly memCap: number;

  constructor(memCapBytes = DEFAULT_CACHE_BYTES) {
    this.memCap = memCapBytes;
  }

  // -------------------------------------------------------------------------
  // Blobs
  // -------------------------------------------------------------------------

  public async putBlob(key: string, data: ArrayBuffer): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction(BLOB_STORE, 'readwrite');
      tx.objectStore(BLOB_STORE).put(data, key);
      await txDone(tx, undefined);
    } finally {
      db.close();
    }
    this.rememberInCache(key, data);
  }

  /** Lecture avec cache mémoire + migration legacy à la volée (`model-*`). */
  public async getBlob(key: string): Promise<ArrayBuffer | null> {
    const cached = this.memCache.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.bytes.slice(0);
    }
    const db = await openDB();
    try {
      const data = await new Promise<ArrayBuffer | null>((resolve, reject) => {
        const tx = db.transaction(BLOB_STORE, 'readonly');
        const req = tx.objectStore(BLOB_STORE).get(key);
        req.onsuccess = () => {
          const v = req.result as ArrayBuffer | undefined;
          resolve(v ? v : null);
        };
        req.onerror = () => reject(req.error || new Error('Lecture blob asset impossible'));
      });
      if (data) {
        this.rememberInCache(key, data);
        return data.slice(0);
      }
    } finally {
      db.close();
    }
    // Repli legacy : ancien store `model-binaries` (importé avant le pipeline).
    if (key.startsWith('model-')) {
      try {
        const legacy = await loadLegacyModelBinary(key);
        if (legacy) {
          // Migration à la volée vers le nouveau store.
          await this.putBlob(key, legacy).catch(() => {});
          return legacy.slice(0);
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  public async deleteBlob(key: string): Promise<void> {
    this.memCache.delete(key);
    const db = await openDB();
    try {
      const tx = db.transaction(BLOB_STORE, 'readwrite');
      tx.objectStore(BLOB_STORE).delete(key);
      await txDone(tx, undefined);
    } finally {
      db.close();
    }
  }

  public async listBlobKeys(): Promise<string[]> {
    const db = await openDB();
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(BLOB_STORE, 'readonly');
        const req = tx.objectStore(BLOB_STORE).getAllKeys();
        req.onsuccess = () => resolve((req.result as string[]) ?? []);
        req.onerror = () => reject(req.error || new Error('Listage blobs impossible'));
      });
    } finally {
      db.close();
    }
  }

  /** Précharge en cache mémoire (bundles) sans décoder. */
  public async warmCache(keys: string[]): Promise<{ warmed: number; bytes: number }> {
    let warmed = 0;
    let bytes = 0;
    for (const key of keys) {
      if (this.memCache.has(key)) continue;
      const data = await this.getBlob(key);
      if (data) {
        warmed++;
        bytes += data.byteLength;
      }
    }
    return { warmed, bytes };
  }

  /** Évince du cache mémoire (garde IndexedDB). Conserve les clés listées. */
  public evictCache(keepKeys?: Set<string>): { evicted: number; bytes: number } {
    let evicted = 0;
    let bytes = 0;
    for (const [key, entry] of this.memCache) {
      if (keepKeys?.has(key)) continue;
      bytes += entry.size;
      evicted++;
      this.memBytes -= entry.size;
      this.memCache.delete(key);
    }
    return { evicted, bytes };
  }

  public getCacheStats(): { entries: number; bytes: number } {
    return { entries: this.memCache.size, bytes: this.memBytes };
  }

  private rememberInCache(key: string, data: ArrayBuffer): void {
    const prev = this.memCache.get(key);
    if (prev) this.memBytes -= prev.size;
    this.memCache.set(key, { bytes: data, size: data.byteLength, lastUsed: Date.now() });
    this.memBytes += data.byteLength;
    // Éviction LRU au-delà du cap.
    if (this.memBytes > this.memCap) {
      const ordered = [...this.memCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (const [k, entry] of ordered) {
        if (this.memBytes <= this.memCap) break;
        this.memCache.delete(k);
        this.memBytes -= entry.size;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Métadonnées (records + manifests de bundles)
  // -------------------------------------------------------------------------

  public async putMeta(key: string, value: AssetRecord | AssetBundleManifest): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(value, key);
      await txDone(tx, undefined);
    } finally {
      db.close();
    }
  }

  public async getMeta<T>(key: string): Promise<T | null> {
    const db = await openDB();
    try {
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const req = tx.objectStore(META_STORE).get(key);
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
        req.onerror = () => reject(req.error || new Error('Lecture meta impossible'));
      });
    } finally {
      db.close();
    }
  }

  public async deleteMeta(key: string): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).delete(key);
      await txDone(tx, undefined);
    } finally {
      db.close();
    }
  }

  public async getAllRecords(): Promise<AssetRecord[]> {
    const db = await openDB();
    try {
      return await new Promise<AssetRecord[]>((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const req = tx.objectStore(META_STORE).getAll();
        req.onsuccess = () => {
          const all = (req.result as Array<AssetRecord | AssetBundleManifest>) ?? [];
          resolve(all.filter((v) => (v as AssetRecord).kind !== undefined) as AssetRecord[]);
        };
        req.onerror = () => reject(req.error || new Error('Listage records impossible'));
      });
    } finally {
      db.close();
    }
  }

  public async getAllBundles(): Promise<AssetBundleManifest[]> {
    const db = await openDB();
    try {
      return await new Promise<AssetBundleManifest[]>((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const req = tx.objectStore(META_STORE).getAll();
        req.onsuccess = () => {
          const all = (req.result as Array<AssetRecord | AssetBundleManifest>) ?? [];
          resolve(
            all.filter(
              (v) =>
                (v as AssetRecord).kind === undefined &&
                Array.isArray((v as AssetBundleManifest).assetIds)
            ) as AssetBundleManifest[]
          );
        };
        req.onerror = () => reject(req.error || new Error('Listage bundles impossible'));
      });
    } finally {
      db.close();
    }
  }
}
