import * as THREE from 'three';
import type { AssetStore } from './AssetStore';
import type { AssetDatabase } from './AssetDatabase';

export interface TextureStreamerDeps {
  store: AssetStore;
  db: AssetDatabase;
}

export type TextureImageSource =
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | Blob;

type TextureSlot = 'map' | 'normalMap' | 'emissiveMap' | 'roughnessMap';
type LevelKey = number | 'full';

interface TrackEntry {
  key: string;
  ownerUuid: string;
  material: THREE.Material;
  slot: TextureSlot;
  assetId: string;
  mesh: THREE.Object3D;
  original: THREE.Texture | null;
  current: LevelKey;
  wanted: LevelKey;
}

interface VariantEntry {
  texture: THREE.Texture;
  bytes: number;
  lastUsed: number;
  users: Set<string>;
  owned: boolean;
}

const VARIANT_SIZES = [256, 512, 1024];
/** Distances (m) : full ≤20, 1024 ≤60, 512 ≤150, sinon 256. */
const DIST_THRESHOLDS: Array<{ size: LevelKey; maxDist: number }> = [
  { size: 'full', maxDist: 20 },
  { size: 1024, maxDist: 60 },
  { size: 512, maxDist: 150 },
  { size: 256, maxDist: Number.POSITIVE_INFINITY },
];
const HYSTERESIS = 0.25;
const DEFAULT_MAX_SWAPS_PER_FRAME = 4;
const DEFAULT_VRAM_CAP = 256 * 1024 * 1024;

function runIdle(fn: () => void): void {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (ric) ric(fn);
  else setTimeout(fn, 0);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality = 0.9): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * TextureStreamer — variantes de résolution par distance avec budget VRAM.
 *
 * - À l'enregistrement : la source est stockée (`<id>:src`) et des variantes
 *   256/512/1024 (webp, fallback png) sont générées en arrière-plan.
 * - Par frame : chaque matériau suivi bascule vers la variante adaptée à la
 *   distance (hystérésis 25 %, budget de swaps), les variantes GPU partagées
 *   sont mutualisées par (asset, taille) et évincées en LRU au-delà du cap.
 * - Les textures d'origine (loader/possédées par les matériaux) ne sont
 *   jamais disposées par le streamer.
 */
export class TextureStreamer {
  private readonly store: AssetStore;
  private readonly db: AssetDatabase;
  private readonly tracks = new Map<string, TrackEntry>();
  private readonly variants = new Map<string, VariantEntry>();
  private readonly pendingLoads = new Map<string, Promise<{ key: string; size: number; tex: THREE.Texture } | null>>();
  /** Miroir synchrone des variantes connues (évite les allers-retours IDB/frame). */
  private readonly knownVariants = new Map<string, number[]>();
  /** Clés de blobs confirmées absentes (pas de retry par frame). */
  private readonly missingBlobs = new Set<string>();
  private readonly maxSwapsPerFrame: number;
  private readonly vramCap: number;
  private readonly tmpVec = new THREE.Vector3();

  constructor(deps: TextureStreamerDeps, opts?: { maxSwapsPerFrame?: number; vramCapBytes?: number }) {
    this.store = deps.store;
    this.db = deps.db;
    this.maxSwapsPerFrame = opts?.maxSwapsPerFrame ?? DEFAULT_MAX_SWAPS_PER_FRAME;
    this.vramCap = opts?.vramCapBytes ?? DEFAULT_VRAM_CAP;
  }

  // -------------------------------------------------------------------------
  // Enregistrement des sources + génération des variantes
  // -------------------------------------------------------------------------

  public async registerSource(opts: {
    id?: string;
    name: string;
    image: TextureImageSource;
    format?: string;
  }): Promise<string> {
    // Idempotent : si le record existe (restauration), on réutilise les
    // variantes stockées sans ré-encoder la source.
    if (opts.id) {
      const existing = await this.db.getRecord(opts.id).catch(() => null);
      if (existing && existing.kind === 'texture') {
        this.knownVariants.set(opts.id, [...(existing.variants ?? [])]);
        runIdle(() => {
          void this.ensureVariants(opts.id!, existing.width ?? 0, existing.height ?? 0).catch(() => {});
        });
        return opts.id;
      }
    }
    const { bitmap, owned } = await this.toBitmapOwned(opts.image);
    try {
      const width = bitmap.width;
      const height = bitmap.height;
      const srcBytes = await this.encodeSource(bitmap);

      const rec = await this.db.registerTexture({
        id: opts.id,
        name: opts.name,
        format: opts.format ?? 'webp',
        bytes: srcBytes,
        width,
        height,
      });

      // Génération des variantes en arrière-plan (idempotent : skip si présentes).
      runIdle(() => {
        void this.ensureVariants(rec.id, width, height).catch((err) =>
          console.warn(`TextureStreamer : variantes impossibles (${rec.id}).`, err)
        );
      });
      return rec.id;
    } finally {
      // Ne jamais fermer un bitmap partagé (image vivante d'une texture GPU).
      if (owned) bitmap.close?.();
    }
  }

  private async toBitmapOwned(src: TextureImageSource): Promise<{ bitmap: ImageBitmap; owned: boolean }> {
    if (src instanceof ImageBitmap) return { bitmap: src, owned: false };
    if (src instanceof Blob) return { bitmap: await createImageBitmap(src), owned: true };
    return { bitmap: await createImageBitmap(src), owned: true };
  }

  private async encodeSource(bitmap: ImageBitmap): Promise<ArrayBuffer> {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contexte 2D indisponible.');
    ctx.drawImage(bitmap, 0, 0);
    let blob = await canvasToBlob(canvas, 'image/webp', 0.9);
    if (!blob) blob = await canvasToBlob(canvas, 'image/png');
    if (!blob) throw new Error('Encodage source impossible.');
    return blob.arrayBuffer();
  }

  private async ensureVariants(id: string, width: number, height: number): Promise<void> {
    const rec = await this.db.getRecord(id);
    if (!rec || rec.kind !== 'texture') return;
    this.knownVariants.set(id, [...(rec.variants ?? [])]);
    const maxDim = Math.max(width, height);
    const wanted = VARIANT_SIZES.filter((s) => s < maxDim);
    const existing = new Set(rec.variants ?? []);
    const missing = wanted.filter((s) => !existing.has(s));
    if (missing.length === 0) return;

    const srcBlob = await this.store.getBlob(`${id}:src`);
    if (!srcBlob) return;
    const srcBitmap = await createImageBitmap(new Blob([srcBlob]));
    try {
      const done: number[] = [...(rec.variants ?? [])];
      for (const size of missing) {
        const scale = size / maxDim;
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(srcBitmap, 0, 0, w, h);
        let blob = await canvasToBlob(canvas, 'image/webp', 0.85);
        if (!blob) blob = await canvasToBlob(canvas, 'image/png');
        if (!blob) continue;
        const bytes = await blob.arrayBuffer();
        await this.store.putBlob(`${id}:tex:${size}`, bytes);
        done.push(size);
      }
      await this.db.updateRecord(id, { variants: done.sort((a, b) => a - b) });
      this.knownVariants.set(id, [...done].sort((a, b) => a - b));
    } finally {
      srcBitmap.close?.();
    }
  }

  // -------------------------------------------------------------------------
  // Suivi des matériaux
  // -------------------------------------------------------------------------

  public track(
    ownerUuid: string,
    material: THREE.Material,
    slot: TextureSlot,
    assetId: string,
    mesh: THREE.Object3D
  ): void {
    const key = `${ownerUuid}:${(material as { uuid: string }).uuid}:${slot}`;
    if (this.tracks.has(key)) return;
    const mat = material as unknown as Record<string, THREE.Texture | null>;
    this.tracks.set(key, {
      key,
      ownerUuid,
      material,
      slot,
      assetId,
      mesh,
      original: (mat[slot] as THREE.Texture | null) ?? null,
      current: 'full',
      wanted: 'full',
    });
    // Remplit le miroir des variantes (covers les redémarrages).
    void this.db
      .getRecord(assetId)
      .then((rec) => {
        if (rec?.variants) this.knownVariants.set(assetId, [...rec.variants]);
      })
      .catch(() => {});
  }

  public untrackOwner(ownerUuid: string): void {
    for (const [key, entry] of this.tracks) {
      if (entry.ownerUuid !== ownerUuid) continue;
      this.restoreOriginal(entry);
      this.releaseVariant(entry, entry.current);
      this.tracks.delete(key);
    }
  }

  private restoreOriginal(entry: TrackEntry): void {
    try {
      const mat = entry.material as unknown as Record<string, THREE.Texture | null>;
      if (mat[entry.slot] !== entry.original) {
        mat[entry.slot] = entry.original;
        if (entry.original) entry.material.needsUpdate = true;
      }
    } catch {
      /* matériau disposé */
    }
  }

  public clear(): void {
    for (const key of [...this.tracks.keys()]) {
      const entry = this.tracks.get(key);
      if (entry) {
        this.restoreOriginal(entry);
        this.releaseVariant(entry, entry.current);
      }
      this.tracks.delete(key);
    }
  }

  // -------------------------------------------------------------------------
  // Mise à jour par frame
  // -------------------------------------------------------------------------

  public update(camera: THREE.PerspectiveCamera): void {
    if (this.tracks.size === 0) return;
    let swaps = 0;
    for (const entry of this.tracks.values()) {
      if (swaps >= this.maxSwapsPerFrame) break;
      entry.mesh.getWorldPosition(this.tmpVec);
      const dist = camera.position.distanceTo(this.tmpVec);
      const wanted = this.pickLevel(entry, dist);
      if (wanted === entry.current && wanted === entry.wanted) continue;
      entry.wanted = wanted;
      if (wanted === entry.current) continue;
      if (this.applyLevel(entry, wanted)) swaps++;
    }
  }

  private pickLevel(entry: TrackEntry, dist: number): LevelKey {
    let desired: LevelKey = 256;
    for (const t of DIST_THRESHOLDS) {
      if (dist <= t.maxDist) {
        desired = t.size;
        break;
      }
    }
    // Hystérésis : on ne redescend en résolution que franchement au-delà.
    if (entry.current !== 'full' && desired !== 'full') {
      const curSize = entry.current as number;
      const desSize = typeof desired === 'number' ? desired : curSize;
      if (desSize < curSize && dist < this.thresholdFor(curSize) * (1 + HYSTERESIS)) {
        return entry.current;
      }
    }
    return desired;
  }

  private thresholdFor(size: number): number {
    const found = DIST_THRESHOLDS.find((t) => t.size === size);
    return found ? found.maxDist : Number.POSITIVE_INFINITY;
  }

  /**
   * Résout un niveau désiré vers un niveau réellement disponible
   * ('full' toujours disponible, sinon plus grande variante ≤ demandée).
   * null = rien de disponible (pas de retry par frame grâce à missingBlobs).
   */
  private resolveAvailable(assetId: string, desired: LevelKey): LevelKey | null {
    if (desired === 'full') return 'full';
    const avail = this.knownVariants.get(assetId);
    if (!avail) return desired; // Miroir pas encore rempli : tente le chargement.
    const below = avail.filter((s) => s <= desired).sort((a, b) => b - a);
    if (below[0] !== undefined) return below[0];
    const smallest = avail.slice().sort((a, b) => a - b)[0];
    return smallest ?? null;
  }

  /** Retourne true si le swap est appliqué (false = chargement en cours). */
  private applyLevel(entry: TrackEntry, level: LevelKey): boolean {
    const eff = this.resolveAvailable(entry.assetId, level);
    if (eff === null || eff === entry.current) {
      if (eff === entry.current) entry.wanted = entry.current;
      return false;
    }
    if (eff === 'full') {
      const mat = entry.material as unknown as Record<string, THREE.Texture | null>;
      if (mat[entry.slot] !== entry.original) {
        this.releaseVariant(entry, entry.current);
        mat[entry.slot] = entry.original;
        if (entry.original) entry.material.needsUpdate = true;
        entry.current = 'full';
        return true;
      }
      entry.current = 'full';
      return false;
    }
    const cacheKey = `${entry.assetId}:${eff}`;
    if (this.missingBlobs.has(cacheKey)) return false;
    const cached = this.variants.get(cacheKey);
    if (cached) {
      this.assignVariant(entry, cached, eff);
      return true;
    }
    if (this.pendingLoads.has(cacheKey)) return false;
    const load = this.loadVariant(entry.assetId, eff, entry.slot);
    this.pendingLoads.set(cacheKey, load);
    void load.then((res) => {
      this.pendingLoads.delete(cacheKey);
      if (!res) {
        this.missingBlobs.add(cacheKey);
        return;
      }
      this.missingBlobs.delete(cacheKey);
      const live = this.tracks.get(entry.key);
      if (!live) return;
      // N'assigne que si ce niveau est toujours le bon choix.
      if (this.resolveAvailable(live.assetId, live.wanted) !== res.size) return;
      const variant = this.variants.get(res.key);
      if (!variant) return;
      this.assignVariant(live, variant, res.size);
    });
    return false;
  }

  private assignVariant(entry: TrackEntry, variant: VariantEntry, level: LevelKey): void {
    const mat = entry.material as unknown as Record<string, THREE.Texture | null>;
    if (mat[entry.slot] === variant.texture && entry.current === level) return;
    this.releaseVariant(entry, entry.current);
    const prev = mat[entry.slot];
    // Hérite du wrapping/anisotropie de la texture d'origine.
    if (entry.original) {
      variant.texture.wrapS = entry.original.wrapS;
      variant.texture.wrapT = entry.original.wrapT;
      variant.texture.anisotropy = entry.original.anisotropy;
    }
    mat[entry.slot] = variant.texture;
    variant.users.add(entry.key);
    variant.lastUsed = Date.now();
    // Premier passage null → texture : recompile le programme.
    if (!prev && variant.texture) entry.material.needsUpdate = true;
    entry.current = level;
  }

  private releaseVariant(entry: TrackEntry, level: LevelKey): void {
    if (level === 'full') return;
    const cacheKey = `${entry.assetId}:${level}`;
    const variant = this.variants.get(cacheKey);
    if (!variant) return;
    variant.users.delete(entry.key);
  }

  private async loadVariant(
    assetId: string,
    size: number,
    slot: TextureSlot
  ): Promise<{ key: string; size: number; tex: THREE.Texture } | null> {
    const cacheKey = `${assetId}:${size}`;
    try {
      const blob = await this.store.getBlob(cacheKey);
      if (!blob) return null;
      const bitmap = await createImageBitmap(new Blob([blob]));
      const tex = new THREE.Texture(bitmap);
      tex.needsUpdate = true;
      if (slot === 'map' || slot === 'emissiveMap') {
        tex.colorSpace = THREE.SRGBColorSpace;
      }
      const bytes = bitmap.width * bitmap.height * 4;
      this.variants.set(cacheKey, {
        texture: tex,
        bytes,
        lastUsed: Date.now(),
        users: new Set(),
        owned: true,
      });
      const known = this.knownVariants.get(assetId) ?? [];
      if (!known.includes(size)) this.knownVariants.set(assetId, [...known, size]);
      this.evictIfNeeded();
      return { key: cacheKey, size, tex };
    } catch (err) {
      console.warn(`TextureStreamer : variante ${size}px illisible (${assetId}).`, err);
      return null;
    }
  }

  private evictIfNeeded(): void {
    let total = 0;
    for (const v of this.variants.values()) total += v.bytes;
    if (total <= this.vramCap) return;
    const ordered = [...this.variants.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, v] of ordered) {
      if (total <= this.vramCap) break;
      if (v.users.size > 0) continue;
      if (v.owned) v.texture.dispose();
      total -= v.bytes;
      this.variants.delete(key);
    }
  }

  // -------------------------------------------------------------------------
  // Stats / cycle de vie
  // -------------------------------------------------------------------------

  public estimateVRAM(): number {
    let total = 0;
    const seen = new Set<THREE.Texture>();
    for (const v of this.variants.values()) {
      if (!seen.has(v.texture)) {
        seen.add(v.texture);
        total += v.bytes;
      }
    }
    return total;
  }

  public getStats(): { tracked: number; variants: number; vramBytes: number } {
    return { tracked: this.tracks.size, variants: this.variants.size, vramBytes: this.estimateVRAM() };
  }

  public dispose(): void {
    for (const entry of this.tracks.values()) this.restoreOriginal(entry);
    this.tracks.clear();
    for (const v of this.variants.values()) {
      if (v.owned) v.texture.dispose();
    }
    this.variants.clear();
    this.pendingLoads.clear();
  }
}
