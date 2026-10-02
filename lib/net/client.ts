import * as THREE from 'three';
import { NetTransport } from './transport';
import type { TransportState } from './transport';
import { PredictionManager } from './prediction';
import { RemoteEntityManager } from './remotes';
import { stepPlayer, DEFAULT_SIM_PARAMS } from './playerSim';
import { NetInputBits } from './types';
import { NET_INPUT_HZ, NET_PING_HZ } from './types';
import type {
  NetMsg,
  WelcomeMsg,
  SnapshotMsg,
  NetEventMsg,
  PongMsg,
  InputMsg,
} from './types';

export interface LocalPlayerSnapshot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
}

export interface NetClientDeps {
  isPlaying: () => boolean;
  /** Échantillonne l'input local (null si pas de joueur / pause). */
  sampleInput: () => { bits: number; yaw: number; dt: number; attackEdge: boolean } | null;
  /** État post-simulation du joueur local (fin de frame). */
  getLocalState: () => LocalPlayerSnapshot | null;
  /** Applique une correction (snap + rejouage). */
  applyCorrection: (s: LocalPlayerSnapshot) => void;
  /** Téléporte le joueur local (respawn explicite). */
  teleportLocal: (x: number, y: number, z: number, yaw: number) => void;
  /** Vide l'historique de prédiction (respawn). */
  resetPrediction: () => void;
  /** Spawn visuel seul d'un projectile relayé (ni dégâts, ni relais). */
  spawnVisualProjectile: (
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
    speed: number, damage: number, prefab: string
  ) => void;
  resolveNode: ((nodeId: string) => THREE.Object3D | undefined) | null;
  onDisconnected: (reason: string) => void;
  onWelcome: (playerId: string) => void;
}

/**
 * NetClient — pair non-autoritaire.
 *
 * - Inputs à 30 Hz (+ immédiat sur front de saut) sur canal non fiable.
 * - Prédiction locale : l'historique est nourri chaque frame post-sim ;
 *   chaque snapshot réconcilie via `ack[playerId]`.
 * - Joueurs distants + props via RemoteEntityManager (interp./extrap.).
 * - Spectateur : flag envoyé à l'hôte, avatar local géré par la scène.
 */
export class NetClient {
  public onLog: ((line: string) => void) | null = null;

  public spectator = false;
  public rttMs = 0;
  public playerId: string | null = null;

  private readonly deps: NetClientDeps;
  private readonly transport = new NetTransport();
  private readonly prediction = new PredictionManager();
  private readonly remotes: RemoteEntityManager;

  private connected = false;
  private name = 'Joueur';
  private seq = 0;
  private pending: { seq: number; bits: number; yaw: number; dt: number } | null = null;
  private inputTimer = 0;
  private pingTimer = 0;
  private pingId = 0;
  private lastPingAt = 0;
  private lastSnapshotAt = 0;
  private lastJumpSent = false;

  constructor(scene: THREE.Scene, deps: NetClientDeps) {
    this.deps = deps;
    this.remotes = new RemoteEntityManager(scene);
    this.remotes.resolveNode = deps.resolveNode;
    this.transport.onMessage = (msg, channel) => this.handleMessage(msg, channel);
    this.transport.onState = (s: TransportState) => {
      if ((s === 'closed' || s === 'failed') && this.connected) {
        this.connected = false;
        this.deps.onDisconnected(s);
      }
    };
  }

  public get isConnected(): boolean {
    return this.connected;
  }

  public get reconciliations(): number {
    return this.prediction.reconciliations;
  }

  public get lastReconcileError(): number {
    return this.prediction.lastError;
  }

  public remoteStats(): { remotes: number; proxies: number } {
    return this.remotes.getStats();
  }

  // --- Connexion ---

  public async connect(inviteCode: string, name: string, spectator: boolean): Promise<string> {
    this.disconnect();
    this.name = (name || 'Joueur').slice(0, 24);
    this.spectator = spectator;
    const answer = await this.transport.answerInvite(inviteCode);
    // hello envoyé dès l'ouverture (les messages avant sont perdus).
    const prev = this.transport.onState;
    this.transport.onState = (s) => {
      prev?.(s);
      if (s === 'open') {
        this.connected = true;
        this.lastSnapshotAt = Date.now();
        this.transport.sendReliable({ t: 'hello', name: this.name, spectator: this.spectator });
        this.log('Connecté — attente du spawn…');
      }
    };
    return answer;
  }

  public disconnect(): void {
    if (this.connected) {
      try {
        this.transport.sendReliable({ t: 'bye' });
      } catch {
        /* ignore */
      }
    }
    this.connected = false;
    this.transport.close();
    this.prediction.reset();
    this.remotes.clear();
    this.playerId = null;
    this.pending = null;
    this.seq = 0;
  }

  // --- Boucle (appelée depuis SceneManager.animate) ---

  /** Échantillonne + envoie l'input (avant la simulation locale). */
  public beginFrame(dt: number): void {
    if (!this.connected || !this.transport.isOpen || !this.deps.isPlaying()) return;
    if (this.spectator) return;
    const sample = this.deps.sampleInput();
    if (!sample) return;
    this.inputTimer += dt;
    const jumpEdge = (sample.bits & NetInputBits.Jump) !== 0 && !this.lastJumpSent;
    this.lastJumpSent = (sample.bits & NetInputBits.Jump) !== 0;
    if (this.inputTimer < 1 / NET_INPUT_HZ && !jumpEdge) return;
    this.inputTimer = 0;
    this.seq++;
    const msg: InputMsg = { t: 'input', seq: this.seq, bits: sample.bits, yaw: sample.yaw, dt: sample.dt };
    this.transport.sendState(msg);
    this.pending = { seq: this.seq, bits: sample.bits, yaw: sample.yaw, dt: sample.dt };
  }

  /** Enregistre l'état post-simulation dans l'historique de prédiction. */
  public endFrame(): void {
    if (!this.connected || !this.pending) return;
    const st = this.deps.getLocalState();
    if (!st) {
      this.pending = null;
      return;
    }
    this.prediction.record({
      seq: this.pending.seq,
      bits: this.pending.bits,
      yaw: this.pending.yaw,
      dt: this.pending.dt,
      state: {
        pos: new THREE.Vector3(st.x, st.y, st.z),
        vel: new THREE.Vector3(st.vx, 0, st.vz),
        vy: st.vy,
        grounded: st.grounded,
        yaw: this.pending.yaw,
      },
    });
    this.pending = null;
  }

  public update(dt: number): void {
    if (!this.connected) return;
    this.remotes.update();
    const now = Date.now();
    if (now - this.lastSnapshotAt > 10000) {
      this.log('Timeout (aucun snapshot depuis 10 s).');
      this.disconnect();
      this.deps.onDisconnected('timeout');
      return;
    }
    this.pingTimer += dt;
    if (this.pingTimer >= 1 / NET_PING_HZ) {
      this.pingTimer = 0;
      this.pingId++;
      this.lastPingAt = now;
      this.transport.sendReliable({ t: 'ping', id: this.pingId });
    }
  }

  // --- Actions ---

  public setSpectator(spectator: boolean): void {
    this.spectator = spectator;
    this.prediction.reset();
    this.transport.sendReliable({
      t: 'event',
      name: 'spectate',
      from: this.playerId ?? 'client',
      data: { spectator },
    });
  }

  public requestRespawn(): void {
    this.transport.sendReliable({ t: 'event', name: 'respawn', from: this.playerId ?? 'client' });
  }

  /** Notifie un tir local à l'hôte (spawn autoritaire + relais). */
  public sendShootEvent(data: {
    prefab: string; speed: number; damage: number;
    x: number; y: number; z: number;
    dx: number; dy: number; dz: number;
  }): void {
    this.transport.sendReliable({ t: 'event', name: 'shoot', from: this.playerId ?? 'client', data });
  }

  // --- Messages ---

  private handleMessage(msg: NetMsg, channel: string): void {
    void channel;
    switch (msg.t) {
      case 'welcome': {
        const m = msg as WelcomeMsg;
        this.playerId = m.playerId;
        this.remotes.localPlayerId = m.playerId;
        this.prediction.reset();
        this.deps.teleportLocal(m.spawn[0], m.spawn[1], m.spawn[2], m.spawn[3]);
        this.deps.resetPrediction();
        this.deps.onWelcome(m.playerId);
        this.log(`Spawn reçu (${m.playerId}).`);
        break;
      }
      case 'snapshot': {
        const m = msg as SnapshotMsg;
        this.lastSnapshotAt = Date.now();
        this.remotes.ingest(m);
        this.reconcile(m);
        break;
      }
      case 'event': {
        this.handleEvent(msg as NetEventMsg);
        break;
      }
      case 'pong': {
        const m = msg as PongMsg;
        const now = Date.now();
        this.rttMs = now - this.lastPingAt;
        // Recalage horloge : temps host ≈ time + rtt/2.
        this.remotes.setClockOffset(m.time + this.rttMs / 2 - now);
        break;
      }
      case 'bye':
        this.disconnect();
        this.deps.onDisconnected('bye');
        break;
      default:
        break;
    }
  }

  private handleEvent(ev: NetEventMsg): void {
    switch (ev.name) {
      case 'shoot': {
        const d = ev.data ?? {};
        const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        this.deps.spawnVisualProjectile(
          num(d.x), num(d.y), num(d.z),
          num(d.dx), num(d.dy), num(d.dz),
          num(d.speed) || 25,
          num(d.damage) || 10,
          typeof d.prefab === 'string' ? (d.prefab as string) : 'fire'
        );
        break;
      }
      case 'respawn': {
        const d = ev.data ?? {};
        const num = (v: unknown, fb: number): number =>
          typeof v === 'number' && Number.isFinite(v) ? v : fb;
        this.deps.teleportLocal(num(d.x, 0), num(d.y, 1.05), num(d.z, 0), num(d.yaw, 0));
        this.prediction.reset();
        this.deps.resetPrediction();
        break;
      }
      case 'despawn': {
        this.remotes.remove(ev.from);
        break;
      }
      default:
        break;
    }
  }

  private reconcile(snap: SnapshotMsg): void {
    if (!this.playerId) return;
    const ackSeq = snap.ack[this.playerId] ?? 0;
    if (ackSeq <= 0) return;
    const server = this.remotes.latest(this.playerId);
    if (!server) return;
    const res = this.prediction.reconcile(
      new THREE.Vector3(server.p[0], server.p[1], server.p[2]),
      new THREE.Vector3(server.v[0], 0, server.v[2]),
      server.v[1],
      (server.f & 1) !== 0,
      ackSeq,
      (s, bits, yaw, dt) => stepPlayer(s, bits, yaw, dt, DEFAULT_SIM_PARAMS),
      DEFAULT_SIM_PARAMS
    );
    if (res) {
      this.deps.applyCorrection({
        x: res.corrected.pos.x,
        y: res.corrected.pos.y,
        z: res.corrected.pos.z,
        vx: res.corrected.vel.x,
        vy: res.corrected.vy,
        vz: res.corrected.vel.z,
        grounded: res.corrected.grounded,
      });
    }
  }

  private log(line: string): void {
    try {
      this.onLog?.(line);
    } catch {
      /* ignore */
    }
  }

  public getStats(): {
    connected: boolean;
    rttMs: number;
    seq: number;
    reconciliations: number;
    lastError: number;
    remotes: number;
    transport: { bytesIn: number; bytesOut: number; msgsIn: number; msgsOut: number };
  } {
    return {
      connected: this.connected,
      rttMs: Math.round(this.rttMs),
      seq: this.seq,
      reconciliations: this.prediction.reconciliations,
      lastError: Math.round(this.prediction.lastError * 100) / 100,
      remotes: this.remotes.getStats().remotes,
      transport: {
        bytesIn: this.transport.bytesIn,
        bytesOut: this.transport.bytesOut,
        msgsIn: this.transport.msgsIn,
        msgsOut: this.transport.msgsOut,
      },
    };
  }
}
