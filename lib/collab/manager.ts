import type { SceneExportData } from '../../types/engine';
import { diffSnapshots, nodeKey } from './diff';
import { versionWins } from './types';
import type {
  CollabEnvelope,
  CollabField,
  CollabOp,
  FieldVersion,
  PeerPresence,
  PresenceMsg,
} from './types';

export interface CollabManagerDeps {
  exportScene: () => SceneExportData;
  resolveSelected: () => { id: string; name: string } | null;
  applyRemoteOps: (ops: CollabOp[]) => { applied: number };
  setApplyingRemote: (active: boolean) => void;
  sendEnvelope: (env: CollabEnvelope) => void;
  sendPresence: (msg: PresenceMsg) => void;
  onPeersChanged: (peers: PeerPresence[]) => void;
  onRemoteActivity: (summary: string) => void;
}

const FLUSH_DEBOUNCE_MS = 400;
const PRESENCE_INTERVAL_MS = 2000;
const PRESENCE_TIMEOUT_MS = 8000;
const PEER_COLORS = ['#f472b6', '#4ade80', '#facc15', '#38bdf8', '#c084fc', '#fb923c'];

/**
 * CollabManager — convergence CRDT temps réel (5.2).
 *
 * Capture : chaque mutation locale (via saveHistoryState/undo/redo) déclenche
 * un diff debouncé contre la base synchronisée → ops estampillées
 * (lamport, actor) → broadcast. Réception : LWW par champ, application
 * granulaire sans écho (flag applyingRemote + versions + base rafraîchie).
 */
export class CollabManager {
  public actorId: string;
  public displayName = 'Éditeur';
  public sessionActive = false;

  private readonly deps: CollabManagerDeps;
  private lamport = 0;
  private counter = 0;
  private readonly versions = new Map<string, FieldVersion>();
  private base: SceneExportData | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private readonly peers = new Map<string, PeerPresence>();

  constructor(deps: CollabManagerDeps, actorId?: string) {
    this.deps = deps;
    this.actorId =
      actorId ?? `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  }

  // ---------------------------------------------------------- session

  public startSession(displayName: string): void {
    this.displayName = (displayName || 'Éditeur').slice(0, 24);
    this.sessionActive = true;
    try {
      this.base = this.deps.exportScene();
    } catch {
      this.base = null;
    }
    this.presenceTimer = setInterval(() => this.broadcastPresence(), PRESENCE_INTERVAL_MS);
    this.broadcastPresence();
  }

  public stopSession(): void {
    this.sessionActive = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
    this.peers.clear();
    this.base = null;
    this.deps.onPeersChanged([]);
  }

  /** Réancre la base (import, checkout, undo distant…) sans diffuser. */
  public rebase(): void {
    try {
      this.base = this.deps.exportScene();
    } catch {
      this.base = null;
    }
  }

  public nextCollabId(): string {
    this.counter++;
    return `${this.actorId}:${this.counter}`;
  }

  // ---------------------------------------------------------- émission

  public notifyLocalMutation(): void {
    if (!this.sessionActive) return;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  public flushNow(): void {
    if (!this.sessionActive) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (!this.sessionActive || !this.base) return;
    try {
      const current = this.deps.exportScene();
      const ops = diffSnapshots(this.base, current);
      this.base = current;
      if (ops.length === 0) return;
      this.lamport++;
      for (const op of ops) this.stamp(op);
      this.deps.sendEnvelope({ t: 'collab-ops', lamport: this.lamport, actor: this.actorId, ops });
    } catch (err) {
      console.warn('[Collab] flush impossible.', err);
    }
  }

  private stamp(op: CollabOp): void {
    const v: FieldVersion = { lamport: this.lamport, actor: this.actorId };
    if (op.k === 'add' || op.k === 'del') {
      this.versions.set(`${op.id}:__exists`, v);
    } else {
      this.versions.set(`${op.id}:${op.field}`, v);
    }
  }

  // ---------------------------------------------------------- réception

  public receive(envelope: CollabEnvelope): void {
    if (!this.sessionActive) return;
    this.lamport = Math.max(this.lamport, envelope.lamport);
    const accepted: CollabOp[] = [];
    for (const op of envelope.ops) {
      const key =
        op.k === 'add' || op.k === 'del' ? `${op.id}:__exists` : `${op.id}:${(op as { field: CollabField }).field}`;
      const incoming: FieldVersion = { lamport: envelope.lamport, actor: envelope.actor };
      const stored = this.versions.get(key);
      if (!stored || versionWins(incoming, stored)) {
        this.versions.set(key, incoming);
        accepted.push(op);
      }
    }
    if (accepted.length === 0) return;
    this.deps.setApplyingRemote(true);
    try {
      const { applied } = this.deps.applyRemoteOps(accepted);
      if (applied > 0) {
        this.deps.onRemoteActivity(`${envelope.actor.slice(0, 8)} : ${applied} changement(s) appliqué(s).`);
      }
    } finally {
      this.deps.setApplyingRemote(false);
    }
    // Réancre (les ops acceptées font partie de l'état synchronisé).
    try {
      this.base = this.deps.exportScene();
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------- présence

  private broadcastPresence(): void {
    if (!this.sessionActive) return;
    const sel = this.deps.resolveSelected();
    this.deps.sendPresence({
      t: 'collab-presence',
      actor: this.actorId,
      name: this.displayName,
      selected: sel?.id ?? null,
      selectedName: sel?.name ?? null,
      at: Date.now(),
    });
    // Expire les pairs silencieux.
    const now = Date.now();
    let changed = false;
    for (const [actor, p] of this.peers) {
      if (now - p.lastSeen > PRESENCE_TIMEOUT_MS) {
        this.peers.delete(actor);
        changed = true;
      }
    }
    if (changed) this.deps.onPeersChanged(this.getPeers());
  }

  public receivePresence(msg: PresenceMsg): void {
    if (!this.sessionActive || msg.actor === this.actorId) return;
    const existing = this.peers.get(msg.actor);
    const color = existing?.color ?? PEER_COLORS[this.peers.size % PEER_COLORS.length];
    this.peers.set(msg.actor, {
      actor: msg.actor,
      name: msg.name,
      selected: msg.selected,
      selectedName: msg.selectedName,
      lastSeen: Date.now(),
      color,
    });
    this.deps.onPeersChanged(this.getPeers());
  }

  public getPeers(): PeerPresence[] {
    return [...this.peers.values()];
  }

  public getStats(): { lamport: number; peers: number; tracked: number } {
    return { lamport: this.lamport, peers: this.peers.size, tracked: this.versions.size };
  }

  public dispose(): void {
    this.stopSession();
  }
}

/** Clé de suivi exportée pour l'applicateur distant. */
export { nodeKey };
