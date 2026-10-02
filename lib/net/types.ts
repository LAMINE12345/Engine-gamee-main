/**
 * lib/net/types.ts — protocole multijoueur P2P (WebRTC DataChannel, JSON).
 *
 * Topologie : host autoritaire (le pair qui héberge simule), clients avec
 * prédiction + réconciliation. Deux canaux par connexion :
 * - `reliable` (ordonné) : handshake, spawn, événements, ping.
 * - `state` (non ordonné, sans retransmission) : inputs + snapshots.
 */

/** Bits d'entrée (8 directions + actions), échantillonnés depuis InputManager. */
export const NetInputBits = {
  Forward: 1 << 0,
  Backward: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Sprint: 1 << 5,
  Crouch: 1 << 6,
  Attack: 1 << 7,
} as const;

/** État quantifié d'une entité synchronisée. */
export interface NetEntityState {
  /** Identifiant réseau stable (joueurs : `p:<clientId>`, props : `n:<nodeId>`). */
  id: string;
  /** Position (m, quantifiée à 0.01). */
  p: [number, number, number];
  /** Vélocité horizontale + verticale (m/s, quantifiée à 0.01). */
  v: [number, number, number];
  /** Yaw (rad, quantifié à 0.01). */
  y: number;
  /** Flags : bit0 grounded, bit1 spectator, bit2 crouch. */
  f: number;
  /** Quaternion complet (props physiques) — absent = yaw seul. */
  q?: [number, number, number, number];
}

export type NetMsgType =
  | 'hello'
  | 'welcome'
  | 'input'
  | 'snapshot'
  | 'event'
  | 'ping'
  | 'pong'
  | 'bye';

export interface NetMsgBase {
  t: NetMsgType;
}

export interface HelloMsg extends NetMsgBase {
  t: 'hello';
  name: string;
  spectator: boolean;
}

export interface WelcomeMsg extends NetMsgBase {
  t: 'welcome';
  clientId: number;
  /** netId du joueur attribué (`p:<clientId>`). */
  playerId: string;
  /** Position de spawn (x, y, z) + yaw. */
  spawn: [number, number, number, number];
  /** Fréquence snapshots host (Hz). */
  snapRate: number;
}

export interface InputMsg extends NetMsgBase {
  t: 'input';
  /** Numéro de séquence (prédiction + ack). */
  seq: number;
  bits: number;
  /** Yaw caméra (rad). */
  yaw: number;
  /** dt client (s) pour la sim host. */
  dt: number;
}

export interface SnapshotMsg extends NetMsgBase {
  t: 'snapshot';
  seq: number;
  /** Dernier input appliqué par entité joueur (`{ [playerId]: seq }`). */
  ack: Record<string, number>;
  /** Horloge host (ms) pour l'interpolation. */
  time: number;
  states: NetEntityState[];
  /** Entités disparues depuis le dernier envoi (nettoyage côté client). */
  gone?: string[];
}

export interface NetEventMsg extends NetMsgBase {
  t: 'event';
  name: 'shoot' | 'respawn' | 'despawn' | 'chat' | 'spectate';
  from: string;
  data?: Record<string, number | string | boolean>;
}

export interface PingMsg extends NetMsgBase {
  t: 'ping';
  id: number;
}

export interface PongMsg extends NetMsgBase {
  t: 'pong';
  id: number;
  /** Horloge host (ms) — base temps pour l'interpolation. */
  time: number;
}

export type NetMsg =
  | HelloMsg
  | WelcomeMsg
  | InputMsg
  | SnapshotMsg
  | NetEventMsg
  | PingMsg
  | PongMsg
  | { t: 'bye' };

/** Cadences réseau. */
export const NET_SNAPSHOT_HZ = 15;
export const NET_INPUT_HZ = 30;
export const NET_PING_HZ = 1;
/** Délai de rendu interpolation (ms) — absorbe la gigue. */
export const NET_INTERP_DELAY_MS = 120;
/** Extrapolation max (ms) avant gel. */
export const NET_EXTRAPOLATE_MAX_MS = 300;
/** Seuil de réconciliation (m) avant snap + rejouage. */
export const NET_RECONCILE_EPS = 0.25;

/** Quantifications (delta compression). */
export function q2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function qYaw(v: number): number {
  return Math.round(v * 100) / 100;
}

export function q3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export interface PeerMeta {
  clientId: number;
  name: string;
  spectator: boolean;
  rttMs: number;
  lastSeen: number;
}
