import { NetTransport } from '../net/transport';
import type { CollabOp } from '../collab/types';
import type { SceneExportData } from '../../types/engine';

/**
 * lib/live/link.ts — transport d'aperçu live (5.3).
 *
 * Même protocole sur deux backends : BroadcastChannel (même appareil,
 * zéro config) et WebRTC P2P (autre appareil, code manuel).
 */

export type LiveMsg =
  | { t: 'live-hello'; name: string }
  | { t: 'live-scene'; scene: SceneExportData }
  | { t: 'live-ops'; ops: CollabOp[] }
  | { t: 'live-camera'; pos: [number, number, number]; quat: [number, number, number, number]; fov: number }
  | { t: 'live-play'; playing: boolean }
  | { t: 'live-ping'; at: number };

export interface LiveLink {
  send(msg: LiveMsg): void;
  onMessage: ((msg: LiveMsg) => void) | null;
  close(): void;
}

/** Backend même-appareil (onglets) : aucun signaling. */
export class BroadcastLiveLink implements LiveLink {
  public onMessage: ((msg: LiveMsg) => void) | null = null;
  private readonly channel: BroadcastChannel | null;
  private readonly isHost: boolean;

  constructor(room: string, isHost: boolean) {
    this.isHost = isHost;
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(`aether-live-${room}`);
      ch.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as LiveMsg & { __from?: string };
        if (!msg || typeof msg !== 'object') return;
        // L'hôte ignore ses propres messages ; le viewer ignore ceux des viewers.
        if (this.isHost && msg.__from === 'host') return;
        if (!this.isHost && msg.__from !== 'host') return;
        this.onMessage?.(msg);
      };
    } catch {
      ch = null;
    }
    this.channel = ch;
  }

  public get available(): boolean {
    return this.channel !== null;
  }

  public send(msg: LiveMsg): void {
    try {
      this.channel?.postMessage({ ...msg, __from: this.isHost ? 'host' : 'viewer' });
    } catch {
      /* ignore */
    }
  }

  public close(): void {
    try {
      this.channel?.close();
    } catch {
      /* ignore */
    }
    this.onMessage = null;
  }
}

/** Backend inter-appareils via WebRTC (signalisation manuelle). */
export class WebRtcLiveLink implements LiveLink {
  public onMessage: ((msg: LiveMsg) => void) | null = null;
  private readonly transport: NetTransport;
  private readonly isHost: boolean;

  private constructor(transport: NetTransport, isHost: boolean) {
    this.transport = transport;
    this.isHost = isHost;
    void this.isHost;
    this.transport.onMessage = (msg) => {
      this.onMessage?.(msg as unknown as LiveMsg);
    };
  }

  public static async createHost(): Promise<{ link: WebRtcLiveLink; invite: string }> {
    const t = new NetTransport();
    const invite = await t.createInvite();
    return { link: new WebRtcLiveLink(t, true), invite };
  }

  public async acceptAnswer(code: string): Promise<void> {
    await this.transport.acceptAnswer(code);
  }

  public static async join(invite: string): Promise<{ link: WebRtcLiveLink; answer: string }> {
    const t = new NetTransport();
    const answer = await t.answerInvite(invite);
    return { link: new WebRtcLiveLink(t, false), answer };
  }

  public send(msg: LiveMsg): void {
    this.transport.sendReliable(msg as unknown as Parameters<NetTransport['sendReliable']>[0]);
  }

  public close(): void {
    try {
      this.transport.close();
    } catch {
      /* ignore */
    }
    this.onMessage = null;
  }
}
