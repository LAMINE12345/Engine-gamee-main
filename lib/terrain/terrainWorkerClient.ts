/**
 * Client du Web Worker terrain (4.3) avec repli synchrone.
 *
 * Si la construction du Worker échoue (SSR, CSP, bundler), chaque appel
 * retombe sur les fonctions pures de terrainCompute — même résultat,
 * juste sur le thread principal.
 */
import { genHeights, computeNormals, bakeSplat } from './terrainCompute';
import type { HeightGenParams, SplatBakeParams, SplatBakeResult } from './terrainCompute';

interface Pending {
  resolve: (v: { heights?: Float32Array; splat?: Uint8Array; hole?: Uint8Array }) => void;
  reject: (e: Error) => void;
}

export class TerrainWorkerClient {
  public readonly workerAvailable: boolean;
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();

  constructor() {
    let w: Worker | null = null;
    try {
      if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
        w = new Worker(new URL('./terrainWorkerEntry.ts', import.meta.url));
        w.onmessage = (ev: MessageEvent) => this.handleMessage(ev);
        w.onerror = () => this.failAll();
      }
    } catch {
      w = null;
    }
    this.worker = w;
    this.workerAvailable = w !== null;
  }

  private handleMessage(ev: MessageEvent): void {
    const msg = ev.data as { id: number; ok: boolean; heights?: Float32Array; splat?: Uint8Array; hole?: Uint8Array; error?: string };
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.ok) p.resolve({ heights: msg.heights, splat: msg.splat, hole: msg.hole });
    else p.reject(new Error(msg.error ?? 'Worker terrain : échec.'));
  }

  private failAll(): void {
    for (const [, p] of this.pending) p.reject(new Error('Worker terrain indisponible.'));
    this.pending.clear();
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
  }

  private call<T extends object>(type: 'gen' | 'bake', params: T): Promise<{
    heights?: Float32Array;
    splat?: Uint8Array;
    hole?: Uint8Array;
  }> {
    if (!this.worker) return Promise.reject(new Error('Pas de worker.'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker?.postMessage({ id, type, params });
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Heightfield (worker si possible, sinon synchrone). */
  public async genHeights(params: HeightGenParams): Promise<Float32Array> {
    if (this.worker) {
      try {
        const res = await this.call('gen', params);
        if (res.heights) return res.heights;
      } catch {
        /* repli synchrone */
      }
    }
    return genHeights(params);
  }

  /** Bake splat + trous (worker si possible, sinon synchrone). */
  public async bakeSplat(params: SplatBakeParams): Promise<SplatBakeResult> {
    if (this.worker) {
      try {
        const res = await this.call('bake', params);
        if (res.splat && res.hole) return { splat: res.splat, hole: res.hole };
      } catch {
        /* repli synchrone */
      }
    }
    return bakeSplat(params);
  }

  public dispose(): void {
    this.failAll();
  }
}

/** Normales : calcul synchrone rapide (différences centrales). */
export function computeTerrainNormals(
  heights: Float32Array,
  res: number,
  size: number
): Float32Array {
  return computeNormals(heights, res, size);
}
