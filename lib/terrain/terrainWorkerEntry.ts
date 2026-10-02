/// <reference lib="webworker" />
/**
 * Point d'entrée du Web Worker terrain (4.3) : génération heightfield +
 * bake splat/trous hors du thread principal. Même code pur que le main
 * thread (terrainCompute) → résultats bit-identiques.
 */
import { genHeights, bakeSplat } from './terrainCompute';

type InMsg =
  | { id: number; type: 'gen'; params: Parameters<typeof genHeights>[0] }
  | { id: number; type: 'bake'; params: Parameters<typeof bakeSplat>[0] };

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as InMsg;
  try {
    if (msg.type === 'gen') {
      const heights = genHeights(msg.params);
      ctx.postMessage(
        { id: msg.id, ok: true, heights },
        [heights.buffer as Transferable]
      );
    } else if (msg.type === 'bake') {
      const { splat, hole } = bakeSplat(msg.params);
      ctx.postMessage(
        { id: msg.id, ok: true, splat, hole },
        [splat.buffer as Transferable, hole.buffer as Transferable]
      );
    }
  } catch (err) {
    ctx.postMessage({ id: msg.id, ok: false, error: String(err) });
  }
};

export {};
