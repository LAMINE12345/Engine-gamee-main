import type { AssetBundleManifest } from '../../types/assets';
import type { AssetStore } from './AssetStore';
import type { AssetDatabase } from './AssetDatabase';

export interface BundleManagerDeps {
  store: AssetStore;
  db: AssetDatabase;
}

function bundleKey(id: string): string {
  return `bundle:${id}`;
}

/**
 * AssetBundleManager — groupes nommés d'assets (zone, niveau, pack) pour le
 * chargement paresseux.
 *
 * - Les manifests vivent dans l'AssetStore (store `meta`, clés `bundle:<id>`).
 * - `preload()` réchauffe le cache mémoire (binaires sources + blobs LOD +
 *   variantes textures) sans décoder : le premier usage est instantané.
 * - `unload()` évince du cache mémoire ce qui n'est plus requis par d'autres
 *   bundles chargés (IndexedDB garde toujours tout).
 */
export class AssetBundleManager {
  private readonly store: AssetStore;
  private readonly db: AssetDatabase;
  private manifests = new Map<string, AssetBundleManifest>();
  private loaded = new Set<string>();
  private readonly readyPromise: Promise<void>;

  constructor(deps: BundleManagerDeps) {
    this.store = deps.store;
    this.db = deps.db;
    this.readyPromise = this.store
      .getAllBundles()
      .then((all) => {
        this.manifests.clear();
        for (const m of all) this.manifests.set(m.id, m);
      })
      .catch((err) => {
        console.warn('AssetBundleManager : chargement initial impossible.', err);
      });
  }

  public get ready(): Promise<void> {
    return this.readyPromise;
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  public async createBundle(name: string, opts?: { assetIds?: string[]; tags?: string[] }): Promise<AssetBundleManifest> {
    await this.readyPromise;
    const id = `bundle-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const manifest: AssetBundleManifest = {
      id,
      name,
      assetIds: [...(opts?.assetIds ?? [])],
      tags: [...(opts?.tags ?? [])],
      createdAt: now,
      updatedAt: now,
    };
    this.manifests.set(id, manifest);
    await this.store.putMeta(bundleKey(id), manifest);
    for (const assetId of manifest.assetIds) {
      await this.syncRecordBundle(assetId);
    }
    return manifest;
  }

  public async deleteBundle(id: string): Promise<boolean> {
    await this.readyPromise;
    const manifest = this.manifests.get(id);
    if (!manifest) return false;
    this.manifests.delete(id);
    this.loaded.delete(id);
    await this.store.deleteMeta(bundleKey(id)).catch(() => {});
    for (const assetId of manifest.assetIds) {
      await this.syncRecordBundle(assetId);
    }
    return true;
  }

  public async renameBundle(id: string, name: string): Promise<AssetBundleManifest | null> {
    await this.readyPromise;
    const manifest = this.manifests.get(id);
    if (!manifest) return null;
    manifest.name = name;
    manifest.updatedAt = new Date().toISOString();
    await this.store.putMeta(bundleKey(id), manifest);
    return manifest;
  }

  public async addAssets(bundleId: string, assetIds: string[]): Promise<AssetBundleManifest | null> {
    await this.readyPromise;
    const manifest = this.manifests.get(bundleId);
    if (!manifest) return null;
    let changed = false;
    for (const assetId of assetIds) {
      if (!manifest.assetIds.includes(assetId)) {
        manifest.assetIds.push(assetId);
        changed = true;
      }
    }
    if (!changed) return manifest;
    manifest.updatedAt = new Date().toISOString();
    await this.store.putMeta(bundleKey(bundleId), manifest);
    for (const assetId of assetIds) {
      await this.syncRecordBundle(assetId);
    }
    return manifest;
  }

  public async removeAssets(bundleId: string, assetIds: string[]): Promise<AssetBundleManifest | null> {
    await this.readyPromise;
    const manifest = this.manifests.get(bundleId);
    if (!manifest) return null;
    const drop = new Set(assetIds);
    const before = manifest.assetIds.length;
    manifest.assetIds = manifest.assetIds.filter((id) => !drop.has(id));
    if (manifest.assetIds.length === before) return manifest;
    manifest.updatedAt = new Date().toISOString();
    await this.store.putMeta(bundleKey(bundleId), manifest);
    for (const assetId of assetIds) {
      await this.syncRecordBundle(assetId);
    }
    return manifest;
  }

  public async listBundles(): Promise<AssetBundleManifest[]> {
    await this.readyPromise;
    return [...this.manifests.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  public async getBundle(id: string): Promise<AssetBundleManifest | null> {
    await this.readyPromise;
    return this.manifests.get(id) ?? null;
  }

  public isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  /** Synchronise `record.bundleIds` avec les manifests (index inverse). */
  private async syncRecordBundle(assetId: string): Promise<void> {
    const owners: string[] = [];
    for (const [bid, manifest] of this.manifests) {
      if (manifest.assetIds.includes(assetId)) owners.push(bid);
    }
    await this.db.updateRecord(assetId, { bundleIds: owners }).catch(() => {});
  }

  // -------------------------------------------------------------------------
  // Chargement paresseux
  // -------------------------------------------------------------------------

  /** Clés de blobs d'un asset : source + LOD + variantes + textures liées. */
  private async collectBlobKeys(assetId: string): Promise<string[]> {
    const keys = [assetId, `${assetId}:src`];
    const rec = await this.db.getRecord(assetId);
    if (rec?.lodLevels) {
      for (const lvl of rec.lodLevels) {
        if (lvl.blobKey) keys.push(lvl.blobKey);
      }
    }
    if (rec?.variants) {
      for (const size of rec.variants) keys.push(`${assetId}:tex:${size}`);
    }
    // Textures rattachées à un modèle (streaming au chargement du bundle).
    if (rec?.textureIds) {
      for (const texId of rec.textureIds) {
        keys.push(`${texId}:src`);
        const texRec = await this.db.getRecord(texId).catch(() => null);
        if (texRec?.variants) {
          for (const size of texRec.variants) keys.push(`${texId}:tex:${size}`);
        }
      }
    }
    return keys;
  }

  /** Précharge un bundle en cache mémoire. */
  public async preload(bundleId: string): Promise<{ warmed: number; bytes: number }> {
    await this.readyPromise;
    const manifest = this.manifests.get(bundleId);
    if (!manifest) throw new Error(`Bundle introuvable : ${bundleId}`);
    let warmed = 0;
    let bytes = 0;
    for (const assetId of manifest.assetIds) {
      const keys = await this.collectBlobKeys(assetId);
      const res = await this.store.warmCache(keys);
      warmed += res.warmed;
      bytes += res.bytes;
    }
    this.loaded.add(bundleId);
    return { warmed, bytes };
  }

  /** Décharge un bundle du cache mémoire (sauf blobs requis par d'autres bundles chargés). */
  public async unload(bundleId: string): Promise<{ evicted: number; bytes: number }> {
    await this.readyPromise;
    this.loaded.delete(bundleId);
    const keep = new Set<string>();
    for (const id of this.loaded) {
      const manifest = this.manifests.get(id);
      if (!manifest) continue;
      for (const assetId of manifest.assetIds) {
        for (const key of await this.collectBlobKeys(assetId)) keep.add(key);
      }
    }
    return this.store.evictCache(keep.size > 0 ? keep : undefined);
  }
}
