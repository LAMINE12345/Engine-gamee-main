import * as THREE from 'three';
import { NetTransport } from './transport';import type { TransportState } from './transport';
import { SnapshotBuilder } from './codec';
import { stepPlayer, createBodyState, DEFAULT_SIM_PARAMS } from './playerSim';
import type { PlayerBodyState, PlayerSimParams } from './playerSim';
import { NET_SNAPSHOT_HZ, NET_PING_HZ } from './types';
import type {
  NetMsg,
  NetEntityState,
  HelloMsg,
  InputMsg,
  NetEventMsg,
  PingMsg,
  PeerMeta,
} from './types';

export interface HostPlayerAvatar {
  /** UUID de l'objet scène (joueur distant, réel et visible par l'hôte). */
  uuid: string;
  netId: string;
  clientId: number;
  name: string;
  spectator: boolean;
  sim: PlayerBodyState;
  params: PlayerSimParams;
  lastInputSeq: number;
  lastInputBits: number;
  lastInputYaw: number;
  lastInputDt: number;
  hasInput: boolean;
  lastSeen: number;
}

interface ConnectedClient {
  clientId: number;
  name: string;
  transport: NetTransport;
  builder: SnapshotBuilder;
  avatar: HostPlayerAvatar | null;
  rttMs: number;
  pingId: number;
  lastPingAt: number;
  gone: string[];
}

export interface NetHostDeps {
  /** Crée l'avatar d'un client (objet scène réel) → uuid. */
  spawnPlayerAvatar: (clientId: number, name: string, x: number, y: number, z: number, yaw: number) => string;
  /** Supprime l'avatar d'un client. */
  removePlayerAvatar: (uuid: string) => void;
  /** Téléporte un avatar (respawn). */
  teleportAvatar: (uuid: string, x: number, y: number, z: number, yaw: number) => void;
  /** État du joueur local de l'hôte (inclus dans les snapshots). */
  getHostPlayerState: () => NetEntityState | null;
  /** Props réseau flaguées (host autoritaire). */
  getNetProps: () => NetEntityState[];
  /** Spawn projectile autoritaire (position/direction vues par le tireur). */
  spawnAuthoritativeProjectile: (
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
    speed: number, damage: number, prefab: string
  ) => void;
  /** Point de spawn (round-robin). */
  pickSpawn: () => { pos: { x: number; y: number; z: number }; yaw: number };
  isPlaying: () => boolean;
  onPeersChanged?: (peers: PeerMeta[]) => void;
}

/**
 * NetHost — pair autoritaire (le testeur qui héberge).
 *
 * Une connexion WebRTC par client (offre manuelle → réponse collée).
 * Simule les joueurs distants à partir de leurs inputs (même `stepPlayer`
 * que la réconciliation client), diffuse des snapshots delta à 15 Hz,
 * relaie les événements (tirs, respawns).
 */
export class NetHost {
  public onLog: ((line: string) => void) | null = null;

  private readonly deps: NetHostDeps;
  private clients = new Map<number, ConnectedClient>();
  private pending: NetTransport[] = [];
  private nextClientId = 1;
  private snapSeq = 0;
  private snapTimer = 0;
  private pingTimer = 0;
  private running = false;

  constructor(deps: NetHostDeps) {
    this.deps = deps;
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  public getPeers(): PeerMeta[] {
    const out: PeerMeta[] = [];
    for (const c of this.clients.values()) {
      out.push({
        clientId: c.clientId,
        name: c.name,
        spectator: c.avatar?.spectator ?? false,
        rttMs: Math.round(c.rttMs),
        lastSeen: Date.now(),
      });
    }
    return out;
  }

  // --- Salon ---

  public start(): void {
    this.running = true;
  }

  public async createInvite(): Promise<string> {
    const t = new NetTransport();
    this.pending.push(t);
    const code = await t.createInvite();
    this.log(`Invitation créée (en attente de réponse…).`);
    return code;
  }

  public async acceptAnswer(code: string): Promise<number> {
    const t = this.pending.shift();
    if (!t) throw new Error('Aucune invitation en attente (créez d’abord une invitation).');
    try {
      await t.acceptAnswer(code);
    } catch (err) {
      // Code invalide : l'invitation reste réutilisable.
      this.pending.unshift(t);
      throw err;
    }
    const clientId = this.nextClientId++;
    const client: ConnectedClient = {
      clientId,
      name: `Joueur ${clientId}`,
      transport: t,
      builder: new SnapshotBuilder(),
      avatar: null,
      rttMs: 0,
      pingId: 0,
      lastPingAt: 0,
      gone: [],
    };
    t.onMessage = (msg, channel) => this.handleMessage(client, msg, channel);
    t.onState = (s: TransportState) => {
      if (s === 'closed' || s === 'failed') this.dropClient(clientId, s);
    };
    this.clients.set(clientId, client);
    this.emitPeers();
    return clientId;
  }

  public stop(): void {
    this.running = false;
    for (const [, c] of this.clients) {
      try {
        c.transport.sendReliable({ t: 'bye' });
      } catch {
        /* ignore */
      }
      c.transport.close();
      if (c.avatar) this.deps.removePlayerAvatar(c.avatar.uuid);
    }
    for (const t of this.pending) t.close();
    this.clients.clear();
    this.pending = [];
    this.emitPeers();
  }

  // --- Messages ---

  private handleMessage(client: ConnectedClient, msg: NetMsg, channel: string): void {
    void channel;
    const now = Date.now();
    switch (msg.t) {
      case 'hello': {
        const m = msg as HelloMsg;
        client.name = (m.name || `Joueur ${client.clientId}`).slice(0, 24);
        const spawn = this.deps.pickSpawn();
        const uuid = this.deps.spawnPlayerAvatar(
          client.clientId,
          client.name,
          spawn.pos.x,
          spawn.pos.y,
          spawn.pos.z,
          spawn.yaw
        );
        client.avatar = {
          uuid,
          netId: `p:${client.clientId}`,
          clientId: client.clientId,
          name: client.name,
          spectator: m.spectator,
          sim: createBodyState(spawn.pos.x, spawn.pos.y, spawn.pos.z, spawn.yaw),
          params: { ...DEFAULT_SIM_PARAMS },
          lastInputSeq: 0,
          lastInputBits: 0,
          lastInputYaw: spawn.yaw,
          lastInputDt: 1 / 30,
          hasInput: false,
          lastSeen: now,
        };
        if (m.spectator && client.avatar) client.avatar.spectator = true;
        client.transport.sendReliable({
          t: 'welcome',
          clientId: client.clientId,
          playerId: `p:${client.clientId}`,
          spawn: [spawn.pos.x, spawn.pos.y, spawn.pos.z, spawn.yaw],
          snapRate: NET_SNAPSHOT_HZ,
        });
        this.log(`${client.name} a rejoint (${m.spectator ? 'spectateur' : 'joueur'}).`);
        this.emitPeers();
        break;
      }
      case 'input': {
        const m = msg as InputMsg;
        if (!client.avatar) break;
        client.avatar.lastInputSeq = m.seq;
        client.avatar.lastInputBits = m.bits;
        client.avatar.lastInputYaw = m.yaw;
        client.avatar.lastInputDt = Math.min(Math.max(m.dt, 0.005), 0.1);
        client.avatar.hasInput = true;
        client.avatar.lastSeen = now;
        // Tir : front montant géré côté client (event shoot séparé) ; l'input
        // ne fait que nourrir la simulation.
        break;
      }
      case 'event': {
        this.handleEvent(client, msg as NetEventMsg);
        break;
      }
      case 'ping': {
        const m = msg as PingMsg;
        client.transport.sendReliable({ t: 'pong', id: m.id, time: Date.now() });
        break;
      }
      case 'pong': {
        client.rttMs = Date.now() - client.lastPingAt;
        if (client.avatar) client.avatar.lastSeen = Date.now();
        this.emitPeers();
        break;
      }
      case 'bye':
        this.dropClient(client.clientId, 'bye');
        break;
      default:
        break;
    }
  }

  private handleEvent(client: ConnectedClient, ev: NetEventMsg): void {
    const avatar = client.avatar;
    if (!avatar) return;
    avatar.lastSeen = Date.now();
    switch (ev.name) {
      case 'shoot': {
        if (avatar.spectator) break;
        const d = ev.data ?? {};
        const num = (v: unknown, fb: number): number =>
          typeof v === 'number' && Number.isFinite(v) ? v : fb;
        const str = (v: unknown, fb: string): string => (typeof v === 'string' ? v : fb);
        const dir = new THREE.Vector3(
          -Math.sin(avatar.sim.yaw),
          num(d.dy, 0),
          -Math.cos(avatar.sim.yaw)
        ).normalize();
        const origin = new THREE.Vector3(
          avatar.sim.pos.x + dir.x * 1.2,
          avatar.sim.pos.y + 1.2,
          avatar.sim.pos.z + dir.z * 1.2
        );
        const speed = num(d.speed, 25);
        const damage = num(d.damage, 10);
        const prefab = str(d.prefab, 'fire');
        // Spawn autoritaire (dégâts hôte) + relais positionnel aux autres.
        this.deps.spawnAuthoritativeProjectile(
          origin.x, origin.y, origin.z,
          dir.x, dir.y, dir.z,
          speed, damage, prefab
        );
        // Relaie aux autres clients (l'origine a déjà son visuel prédit).
        this.broadcastEvent(
          {
            t: 'event',
            name: 'shoot',
            from: avatar.netId,
            data: {
              prefab,
              speed,
              damage,
              x: origin.x,
              y: origin.y,
              z: origin.z,
              dx: dir.x,
              dy: dir.y,
              dz: dir.z,
            },
          },
          client.clientId
        );
        break;
      }
      case 'respawn': {
        this.respawnAvatar(client);
        break;
      }
      case 'spectate': {
        const want = ev.data?.spectator === true;
        if (avatar.spectator === want) break;
        avatar.spectator = want;
        this.log(`${avatar.name} ${want ? 'passe spectateur' : 'rejoint la partie'}.`);
        this.emitPeers();
        break;
      }
      default:
        break;
    }
  }

  private respawnAvatar(client: ConnectedClient): void {
    const avatar = client.avatar;
    if (!avatar) return;
    const spawn = this.deps.pickSpawn();
    avatar.sim = createBodyState(spawn.pos.x, spawn.pos.y, spawn.pos.z, spawn.yaw);
    avatar.hasInput = false;
    this.deps.teleportAvatar(avatar.uuid, spawn.pos.x, spawn.pos.y, spawn.pos.z, spawn.yaw);
    client.transport.sendReliable({
      t: 'event',
      name: 'respawn',
      from: 'host',
      data: { x: spawn.pos.x, y: spawn.pos.y, z: spawn.pos.z, yaw: spawn.yaw },
    });
  }

  private broadcastEvent(ev: NetEventMsg, exceptClientId?: number): void {
    for (const [, c] of this.clients) {
      if (c.clientId === exceptClientId) continue;
      c.transport.sendReliable(ev);
    }
  }

  /** Relais d'un tir autoritaire vers tous les clients sauf le tireur. */
  public broadcastProjectileEvent(
    data: Record<string, number | string | boolean>,
    shooterUuid?: string
  ): void {
    let except = -1;
    if (shooterUuid) {
      for (const [id, c] of this.clients) {
        if (c.avatar?.uuid === shooterUuid) {
          except = id;
          break;
        }
      }
    }
    this.broadcastEvent(
      { t: 'event', name: 'shoot', from: except >= 0 ? `p:${except}` : 'host', data },
      except >= 0 ? except : undefined
    );
  }

  private dropClient(clientId: number, reason: string): void {
    const c = this.clients.get(clientId);
    if (!c) return;
    if (c.avatar) {
      c.gone.push(c.avatar.netId);
      this.deps.removePlayerAvatar(c.avatar.uuid);
      this.broadcastEvent({ t: 'event', name: 'despawn', from: c.avatar.netId }, clientId);
    }
    c.transport.close();
    this.clients.delete(clientId);
    this.log(`${c.name} déconnecté (${reason}).`);
    this.emitPeers();
  }

  // --- Boucle ---

  public update(dt: number): void {
    if (!this.running) return;
    const playing = this.deps.isPlaying();
    const now = Date.now();

    // Simulation autoritaire des joueurs distants.
    if (playing) {
      for (const c of this.clients.values()) {
        const avatar = c.avatar;
        if (!avatar || avatar.spectator || !avatar.hasInput) continue;
        const steps = 1;
        for (let i = 0; i < steps; i++) {
          stepPlayer(avatar.sim, avatar.lastInputBits, avatar.lastInputYaw, avatar.lastInputDt / steps, avatar.params);
        }
        avatar.sim.pos.y = Math.max(avatar.sim.pos.y, -50);
        // Chute → respawn.
        if (avatar.sim.pos.y < -20) {
          this.respawnAvatar(c);
          continue;
        }
        this.deps.teleportAvatar(
          avatar.uuid,
          avatar.sim.pos.x,
          avatar.sim.pos.y,
          avatar.sim.pos.z,
          avatar.sim.yaw
        );
      }
    }

    // Snapshots delta 15 Hz.
    this.snapTimer += dt;
    if (this.snapTimer >= 1 / NET_SNAPSHOT_HZ) {
      this.snapTimer = 0;
      this.broadcastSnapshot(now);
    }

    // Ping 1 Hz + timeout 10 s.
    this.pingTimer += dt;
    if (this.pingTimer >= 1 / NET_PING_HZ) {
      this.pingTimer = 0;
      for (const [id, c] of [...this.clients.entries()]) {
        if (now - (c.avatar?.lastSeen ?? now) > 10000) {
          this.dropClient(id, 'timeout');
          continue;
        }
        c.pingId++;
        c.lastPingAt = now;
        c.transport.sendReliable({ t: 'ping', id: c.pingId });
      }
    }
  }

  private broadcastSnapshot(now: number): void {
    this.snapSeq++;
    const states: NetEntityState[] = [];
    const ack: Record<string, number> = {};
    const hostState = this.deps.getHostPlayerState();
    if (hostState) states.push(hostState);
    for (const c of this.clients.values()) {
      const avatar = c.avatar;
      if (!avatar) continue;
      ack[avatar.netId] = avatar.lastInputSeq;
      states.push({
        id: avatar.netId,
        p: [avatar.sim.pos.x, avatar.sim.pos.y, avatar.sim.pos.z],
        v: [avatar.sim.vel.x, avatar.sim.vy, avatar.sim.vel.z],
        y: avatar.sim.yaw,
        f: (avatar.sim.grounded ? 1 : 0) | (avatar.spectator ? 2 : 0),
      });
    }
    for (const p of this.deps.getNetProps()) states.push(p);
    for (const c of this.clients.values()) {
      const snap = c.builder.build(this.snapSeq, ack, now, states, c.gone);
      c.gone = [];
      c.transport.sendState(snap);
    }
  }

  private emitPeers(): void {
    try {
      this.deps.onPeersChanged?.(this.getPeers());
    } catch {
      /* ignore */
    }
  }

  private log(line: string): void {
    try {
      this.onLog?.(line);
    } catch {
      /* ignore */
    }
  }

  public getStats(): { clients: number; snapSeq: number } {
    return { clients: this.clients.size, snapSeq: this.snapSeq };
  }
}
