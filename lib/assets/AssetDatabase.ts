import type {
  AssetDeleteResult,
  AssetKind,
  AssetRecord,
  OrphanPurgeResult,
} from '../../types/assets';
import { AssetStore } from './AssetStore';

/**
 * AssetDatabase — registre centralisé de tous les assets (modèles, textures,
 * sons) avec métadonnées, suivi de références (refcount) et réconciliation.
 *
 * - Chaque méthode attend le chargement initial (`ready`) en interne :
 *   utilisable dès la construction, sans await explicite.
 * - Les records vivent dans l'AssetStore (IndexedDB) + cache mémoire.
 * - `acquire`/`release` maintiennent refCount + referencedBy par objet de scène.
 * - `reconcile()` reconstruit les compteurs depuis la scène (mark-and-sweep).
 */
export class AssetDatabase {
  private readonly store: AssetStore;
  private records = new Map<string, AssetRecord>();
  private readonly readyPromise: Promise<void>;

  constructor(store: AssetStore) {
    this.store = store;
    this.readyPromise = this.loadAll().catch((err) => {
      console.warn('AssetDatabase : chargement initial impossible.', err);
    });
  }

  public get ready(): Promise<void> {
    return this.readyPromise;
  }

  private async loadAll(): Promise<void> {
    const all = await this.store.getAllRecords();
    this.records.clear();
    for (const rec of all) this.records.set(rec.id, rec);
  }

  private async persist(rec: AssetRecord): Promise<void> {
    this.records.set(rec.id, rec);
    await this.store.putMeta(rec.id, rec);
  }

  // -------------------------------------------------------------------------
  // Création
  // -------------------------------------------------------------------------

  /** Importe un binaire de modèle brut (avant traitement géométrique). */
  public async importModelBinary(opts: {
    id: string;
    name: string;
    format: string;
    bytes: ArrayBuffer;
  }): Promise<AssetRecord> {
    await this.readyPromise;
    await this.store.putBlob(opts.id, opts.bytes);
    const rec: AssetRecord = {
      id: opts.id,
      kind: 'model',
      name: opts.name,
      format: opts.format,
      byteLength: opts.bytes.byteLength,
      codec: 'raw',
      createdAt: new Date().toISOString(),
      lodStatus: 'none',
      refCount: 0,
      referencedBy: [],
      bundleIds: [],
    };
    await this.persist(rec);
    return rec;
  }

  /** Enregistre une texture (source + variantes générées par le streamer). */
  public async registerTexture(opts: {
    id?: string;
    name: string;
    format: string;
    bytes: ArrayBuffer;
    width: number;
    height: number;
  }): Promise<AssetRecord> {
    await this.readyPromise;
    const id =
      opts.id ??
      `tex-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const existing = this.records.get(id);
    if (existing) return existing;
    await this.store.putBlob(`${id}:src`, opts.bytes);
    const rec: AssetRecord = {
      id,
      kind: 'texture',
      name: opts.name,
      format: opts.format,
      byteLength: opts.bytes.byteLength,
      codec: 'raw',
      createdAt: new Date().toISOString(),
      width: opts.width,
      height: opts.height,
      variants: [],
      refCount: 0,
      referencedBy: [],
      bundleIds: [],
    };
    await this.persist(rec);
    return rec;
  }

  /** Importe un fichier audio (stockage + record, décodage à la demande). */
  public async importAudio(opts: {
    id?: string;
    name: string;
    format: string;
    bytes: ArrayBuffer;
  }): Promise<AssetRecord> {
    await this.readyPromise;
    const id =
      opts.id ??
      `audio-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const existing = this.records.get(id);
    if (existing) return existing;
    await this.store.putBlob(id, opts.bytes);
    const rec: AssetRecord = {
      id,
      kind: 'audio',
      name: opts.name,
      format: opts.format,
      byteLength: opts.bytes.byteLength,
      codec: 'raw',
      createdAt: new Date().toISOString(),
      refCount: 0,
      referencedBy: [],
      bundleIds: [],
    };
    await this.persist(rec);
    return rec;
  }

  // -------------------------------------------------------------------------
  // Lecture / mise à jour
  // -------------------------------------------------------------------------

  public async getRecord(id: string): Promise<AssetRecord | null> {
    await this.readyPromise;
    return this.records.get(id) ?? null;
  }

  public async listRecords(kind?: AssetKind): Promise<AssetRecord[]> {
    await this.readyPromise;
    const all = [...this.records.values()];
    const filtered = kind ? all.filter((r) => r.kind === kind) : all;
    return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  public async updateRecord(id: string, patch: Partial<AssetRecord>): Promise<AssetRecord | null> {
    await this.readyPromise;
    const rec = this.records.get(id);
    if (!rec) return null;
    const next: AssetRecord = { ...rec, ...patch, id: rec.id, kind: rec.kind };
    await this.persist(next);
    return next;
  }

  /** Binaire source d'un asset (modèle, audio, source texture). */
  public async getBinary(id: string): Promise<ArrayBuffer | null> {
    await this.readyPromise;
    // Textures : la source vit sous `<id>:src`.
    const rec = this.records.get(id);
    if (rec?.kind === 'texture') {
      return this.store.getBlob(`${id}:src`);
    }
    return this.store.getBlob(id);
  }

  // -------------------------------------------------------------------------
  // Références (refcount)
  // -------------------------------------------------------------------------

  /**
   * Marque un asset comme utilisé par un objet de scène.
   * Retourne false si aucun record (asset legacy : l'appelant gère le repli).
   */
  public async acquire(id: string, ownerObjectUuid: string): Promise<boolean> {
    await this.readyPromise;
    const rec = this.records.get(id);
    if (!rec) return false;
    if (!rec.referencedBy.includes(ownerObjectUuid)) {
      rec.referencedBy.push(ownerObjectUuid);
      rec.refCount = rec.referencedBy.length;
      await this.persist(rec);
    }
    return true;
  }

  /**
   * Libère une référence. Quand le compteur tombe à zéro, le blob source,
   * les blobs dérivés (LOD, variantes) et le record sont supprimés.
   */
  public async release(id: string, ownerObjectUuid: string): Promise<AssetDeleteResult> {
    await this.readyPromise;
    const rec = this.records.get(id);
    if (!rec) return { ok: true, deleted: false, hasRecord: false };
    rec.referencedBy = rec.referencedBy.filter((u) => u !== ownerObjectUuid);
    rec.refCount = rec.referencedBy.length;
    if (rec.refCount > 0) {
      await this.persist(rec);
      return { ok: true, deleted: false, hasRecord: true };
    }
    await this.deleteRecordAndBlobs(rec);
    return { ok: true, deleted: true, hasRecord: true };
  }

  /**
   * Libère TOUTES les références détenues par un objet (modèle + textures).
   * Les assets dont le compteur tombe à zéro sont supprimés (blobs + record).
   */
  public async releaseOwner(ownerObjectUuid: string): Promise<AssetDeleteResult[]> {
    await this.readyPromise;
    const results: AssetDeleteResult[] = [];
    for (const rec of [...this.records.values()]) {
      if (!rec.referencedBy.includes(ownerObjectUuid)) continue;
      rec.referencedBy = rec.referencedBy.filter((u) => u !== ownerObjectUuid);
      rec.refCount = rec.referencedBy.length;
      if (rec.refCount > 0) {
        await this.persist(rec);
        results.push({ ok: true, deleted: false, hasRecord: true });
      } else {
        await this.deleteRecordAndBlobs(rec);
        results.push({ ok: true, deleted: true, hasRecord: true });
      }
    }
    return results;
  }

  /** Un asset peut-il être supprimé ? (refusé s'il est encore référencé). */
  public async canDelete(id: string): Promise<{ ok: boolean; referencedBy: string[] }> {
    await this.readyPromise;
    const rec = this.records.get(id);
    if (!rec) return { ok: true, referencedBy: [] };
    return { ok: rec.refCount === 0, referencedBy: [...rec.referencedBy] };
  }

  /**
   * Suppression explicite (UI). Échoue si référencé, sauf `force`
   * (déréférence tous les propriétaires — la scène doit être réconciliée après).
   */
  public async deleteAsset(id: string, force = false): Promise<AssetDeleteResult> {
    await this.readyPromise;
    const rec = this.records.get(id);
    if (!rec) return { ok: true, deleted: false, hasRecord: false };
    if (rec.refCount > 0 && !force) {
      return { ok: false, deleted: false, hasRecord: true, referencedBy: [...rec.referencedBy] };
    }
    await this.deleteRecordAndBlobs(rec);
    return { ok: true, deleted: true, hasRecord: true };
  }

  private async deleteRecordAndBlobs(rec: AssetRecord): Promise<void> {
    const keys = [rec.id, `${rec.id}:src`];
    if (rec.lodLevels) {
      for (const lvl of rec.lodLevels) {
        if (lvl.blobKey) keys.push(lvl.blobKey);
      }
    }
    if (rec.variants) {
      for (const size of rec.variants) keys.push(`${rec.id}:tex:${size}`);
    }
    await Promise.all(keys.map((k) => this.store.deleteBlob(k).catch(() => {})));
    await this.store.deleteMeta(rec.id).catch(() => {});
    this.records.delete(rec.id);
  }

  // -------------------------------------------------------------------------
  // Orphelins (refCount === 0)
  // -------------------------------------------------------------------------

  public async findOrphans(): Promise<AssetRecord[]> {
    await this.readyPromise;
    return [...this.records.values()].filter((r) => r.refCount === 0);
  }

  public async purgeOrphans(): Promise<OrphanPurgeResult> {
    await this.readyPromise;
    const orphans = await this.findOrphans();
    let freedBytes = 0;
    for (const rec of orphans) {
      freedBytes += rec.byteLength + (rec.compressedBytes ?? 0) + (rec.lodBytes ?? 0);
      await this.deleteRecordAndBlobs(rec);
    }
    return { count: orphans.length, freedBytes };
  }

  // -------------------------------------------------------------------------
  // Réconciliation mark-and-sweep depuis la scène
  // -------------------------------------------------------------------------

  /**
   * Reconstruit les compteurs depuis les références réelles de la scène.
   * `referenced` : assetId → uuids des objets propriétaires.
   */
  public async reconcile(referenced: Map<string, Set<string>>): Promise<{ fixed: number }> {
    await this.readyPromise;
    let fixed = 0;
    for (const rec of this.records.values()) {
      const owners = referenced.get(rec.id);
      const next = owners ? [...owners] : [];
      const changed =
        next.length !== rec.referencedBy.length ||
        next.some((u) => !rec.referencedBy.includes(u));
      if (changed) {
        rec.referencedBy = next;
        rec.refCount = next.length;
        await this.persist(rec);
        fixed++;
      }
    }
    return { fixed };
  }

  // -------------------------------------------------------------------------
  // Stats stockage
  // -------------------------------------------------------------------------

  public async getStorageStats(): Promise<{
    models: number;
    textures: number;
    audio: number;
    totalBytes: number;
    orphanCount: number;
    orphanBytes: number;
  }> {
    await this.readyPromise;
    let models = 0;
    let textures = 0;
    let audio = 0;
    let totalBytes = 0;
    let orphanCount = 0;
    let orphanBytes = 0;
    for (const rec of this.records.values()) {
      if (rec.kind === 'model') models++;
      else if (rec.kind === 'texture') textures++;
      else if (rec.kind === 'audio') audio++;
      const size = rec.byteLength + (rec.lodBytes ?? 0);
      // + variantes textures (approximation : 4 o/px).
      const variantBytes = (rec.variants ?? []).reduce((s, v) => s + v * v * 4, 0);
      totalBytes += size + variantBytes;
      if (rec.refCount === 0) {
        orphanCount++;
        orphanBytes += size + variantBytes;
      }
    }
    return { models, textures, audio, totalBytes, orphanCount, orphanBytes };
  }
}
