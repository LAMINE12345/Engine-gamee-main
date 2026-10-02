import { q2, qYaw, q3 } from './types';
import type { NetEntityState, SnapshotMsg } from './types';

/** Seuils de changement significatif (delta compression). */
const POS_EPS = 0.005;
const VEL_EPS = 0.02;
const YAW_EPS = 0.005;

/**
 * SnapshotBuilder — delta compression côté hôte, par client.
 *
 * Chaque client possède une baseline (`lastSent`) : seuls les états dont un
 * champ a bougé au-delà de l'epsilon sont inclus, quantifiés (0.01). Les
 * entités disparues sont signalées via `gone` (snapshots pleins
 * périodiques pour resynchroniser).
 */
export class SnapshotBuilder {
  private lastSent = new Map<string, NetEntityState>();
  private sendCount = 0;

  public build(
    seq: number,
    ack: Record<string, number>,
    time: number,
    current: NetEntityState[],
    gone: string[]
  ): SnapshotMsg {
    this.sendCount++;
    const forceFull = this.sendCount % 20 === 1;
    const states: NetEntityState[] = [];
    const seen = new Set<string>();
    for (const s of current) {
      seen.add(s.id);
      const q: NetEntityState = {
        id: s.id,
        p: [q2(s.p[0]), q2(s.p[1]), q2(s.p[2])],
        v: [q2(s.v[0]), q2(s.v[1]), q2(s.v[2])],
        y: qYaw(s.y),
        f: s.f,
      };
      if (s.q) q.q = [q3(s.q[0]), q3(s.q[1]), q3(s.q[2]), q3(s.q[3])];
      const prev = this.lastSent.get(s.id);
      if (forceFull || !prev || stateChanged(prev, q)) {
        states.push(q);
      }
      this.lastSent.set(s.id, q);
    }
    // Entités parties depuis le dernier envoi (ou snapshot plein).
    const goneOut = forceFull ? [...this.lastSent.keys()].filter((id) => !seen.has(id)) : [...gone];
    for (const id of goneOut) this.lastSent.delete(id);
    return { t: 'snapshot', seq, ack, time, states, gone: goneOut.length > 0 ? goneOut : undefined };
  }

  public drop(id: string): void {
    this.lastSent.delete(id);
  }

  public reset(): void {
    this.lastSent.clear();
    this.sendCount = 0;
  }
}

function stateChanged(a: NetEntityState, b: NetEntityState): boolean {
  if (a.f !== b.f) return true;
  if (Math.abs(a.y - b.y) > YAW_EPS) return true;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.p[i] - b.p[i]) > POS_EPS) return true;
    if (Math.abs(a.v[i] - b.v[i]) > VEL_EPS) return true;
  }
  if (!!a.q !== !!b.q) return true;
  if (a.q && b.q) {
    for (let i = 0; i < 4; i++) {
      if (Math.abs(a.q[i] - b.q[i]) > 0.002) return true;
    }
  }
  return false;
}

/** Applique un snapshot delta sur un cache local (retourne les états à jour). */
export function applySnapshotDelta(
  cache: Map<string, { state: NetEntityState; recvAt: number }>,
  snap: SnapshotMsg,
  now: number
): string[] {
  const changed: string[] = [];
  for (const s of snap.states) {
    cache.set(s.id, { state: s, recvAt: now });
    changed.push(s.id);
  }
  return changed;
}
