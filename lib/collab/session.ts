import { NetTransport } from '../net/transport';
import type { TransportState } from '../net/transport';
import type { NetMsg } from '../net/types';
import type { CollabCommit, CollabEnvelope, CommitShareMsg, CollabWireMsg, PresenceMsg } from './types';

export interface CollabSessionDeps {
  onEnvelope: (env: CollabEnvelope, fromActor: string) => void;
  onPresence: (msg: PresenceMsg) => void;
  onCommit: (msg: CommitShareMsg) => void;
  onPeersChanged: () => void;
  onLog: (line: string) => void;
}

interface HostPeer {
  transport: NetTransport;
  actor: string | null;
}

/**
 * CollabSession — salon d'édition collaborative (5.2).
 *
 * Réutilise le transport WebRTC du multijoueur (signalisation manuelle,
 * canal fiable ordonné — les ops exigent la fiabilité). Topologie en étoile :
 * l'hôte relaie entre clients ; en 1:1 le relais est inutile.
 */
export class CollabSession {
  public role: 'none' | 'host' | 'client' = 'none';

  private readonly deps: CollabSessionDeps;
  private hostPeers: HostPeer[] = [];
  private pending: NetTransport[] = [];
  private clientTransport: NetTransport | null = null;

  constructor(deps: CollabSessionDeps) {
    this.deps = deps;
  }

  public get peerCount(): number {
    if (this.role === 'host') return this.hostPeers.length;
    return this.clientTransport ? 1 : 0;
  }

  // ---------------------------------------------------------- hôte

  public async createInvite(): Promise<string> {
    const t = new NetTransport();
    this.pending.push(t);
    this.role = 'host';
    const code = await t.createInvite();
    this.deps.onLog('Invitation collaborative créée.');
    return code;
  }

  public async acceptAnswer(code: string): Promise<void> {
    const t = this.pending.shift();
    if (!t) throw new Error('Aucune invitation en attente.');
    try {
      await t.acceptAnswer(code);
    } catch (err) {
      this.pending.unshift(t);
      throw err;
    }
    const peer: HostPeer = { transport: t, actor: null };
    t.onMessage = (msg) => this.handleMessage(peer, null, msg as unknown as CollabWireMsg);
    t.onState = (s: TransportState) => {
      if (s === 'closed' || s === 'failed') this.dropHostPeer(peer);
    };
    this.hostPeers.push(peer);
    this.deps.onPeersChanged();
    this.deps.onLog('Testeur connecté.');
  }

  private dropHostPeer(peer: HostPeer): void {
    const i = this.hostPeers.indexOf(peer);
    if (i < 0) return;
    try {
      peer.transport.close();
    } catch {
      /* ignore */
    }
    this.hostPeers.splice(i, 1);
    this.deps.onPeersChanged();
  }

  // ---------------------------------------------------------- client

  public async join(invite: string): Promise<string> {
    this.leave();
    const t = new NetTransport();
    const answer = await t.answerInvite(invite);
    this.clientTransport = t;
    this.role = 'client';
    t.onMessage = (msg) => this.handleMessage(null, t, msg as unknown as CollabWireMsg);
    t.onState = (s: TransportState) => {
      if ((s === 'closed' || s === 'failed') && this.clientTransport === t) {
        this.leave();
        this.deps.onPeersChanged();
        this.deps.onLog('Déconnecté du salon.');
      }
    };
    this.deps.onPeersChanged();
    return answer;
  }

  public leave(): void {
    for (const p of this.hostPeers) {
      try {
        p.transport.close();
      } catch {
        /* ignore */
      }
    }
    for (const t of this.pending) {
      try {
        t.close();
      } catch {
        /* ignore */
      }
    }
    this.hostPeers = [];
    this.pending = [];
    if (this.clientTransport) {
      try {
        this.clientTransport.close();
      } catch {
        /* ignore */
      }
      this.clientTransport = null;
    }
    if (this.role !== 'none') this.deps.onLog('Salon fermé.');
    this.role = 'none';
    this.deps.onPeersChanged();
  }

  // ---------------------------------------------------------- envoi

  public broadcast(msg: CollabWireMsg): void {
    if (this.role === 'host') {
      for (const p of this.hostPeers) p.transport.sendReliable(msg as unknown as NetMsg);
    } else if (this.role === 'client' && this.clientTransport) {
      this.clientTransport.sendReliable(msg as unknown as NetMsg);
    }
  }

  private handleMessage(fromPeer: HostPeer | null, _t: NetTransport | null, msg: CollabWireMsg): void {
    void _t;
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'collab-ops') {
      this.deps.onEnvelope(msg, msg.actor);
      // L'hôte relaie aux autres clients (le client n'a qu'un lien).
      if (this.role === 'host') {
        for (const p of this.hostPeers) {
          if (p !== fromPeer) p.transport.sendReliable(msg as unknown as NetMsg);
        }
      }
    } else if (msg.t === 'collab-presence') {
      this.deps.onPresence(msg);
      if (this.role === 'host') {
        for (const p of this.hostPeers) {
          if (p !== fromPeer) p.transport.sendReliable(msg as unknown as NetMsg);
        }
      }
    } else if (msg.t === 'collab-commit') {
      this.deps.onCommit(msg);
      if (this.role === 'host') {
        for (const p of this.hostPeers) {
          if (p !== fromPeer) p.transport.sendReliable(msg as unknown as NetMsg);
        }
      }
    }
  }

  public shareCommit(commit: CollabCommit, actor: string): void {
    this.broadcast({ t: 'collab-commit', actor, commit });
  }
}
