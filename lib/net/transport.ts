import { NET_RTC_CONFIG, waitIceComplete, encodeSession } from './signaling';
import type { SessionBlob } from './signaling';
import type { NetMsg } from './types';

export type TransportState = 'new' | 'connecting' | 'open' | 'closed' | 'failed';

/**
 * NetTransport — une connexion WebRTC P2P + 2 DataChannels :
 * - `reliable` (ordonné) : handshake, spawn, événements, ping.
 * - `state` (non ordonné, `maxRetransmits: 0`) : inputs + snapshots (le frais
 *   remplace l'ancien, aucune retransmission).
 */
export class NetTransport {
  public onMessage: ((msg: NetMsg, channel: 'reliable' | 'state') => void) | null = null;
  public onState: ((state: TransportState) => void) | null = null;

  public bytesIn = 0;
  public bytesOut = 0;
  public msgsIn = 0;
  public msgsOut = 0;

  private pc: RTCPeerConnection | null = null;
  private reliable: RTCDataChannel | null = null;
  private state: RTCDataChannel | null = null;
  private connState: TransportState = 'new';
  private openChannels = 0;

  public get connectionState(): TransportState {
    return this.connState;
  }

  public get isOpen(): boolean {
    return this.connState === 'open';
  }

  private setState(s: TransportState): void {
    this.connState = s;
    try {
      this.onState?.(s);
    } catch {
      /* ignore */
    }
  }

  private makePc(): RTCPeerConnection {
    this.close();
    const pc = new RTCPeerConnection(NET_RTC_CONFIG);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.setState('failed');
      if (pc.connectionState === 'closed') this.setState('closed');
    };
    this.pc = pc;
    this.openChannels = 0;
    this.setState('connecting');
    return pc;
  }

  private wireChannel(dc: RTCDataChannel, kind: 'reliable' | 'state'): void {
    dc.onopen = () => {
      this.openChannels++;
      if (this.openChannels >= 2) this.setState('open');
    };
    dc.onclose = () => {
      if (this.connState === 'open') this.setState('connecting');
    };
    dc.onmessage = (ev) => {
      try {
        const text = typeof ev.data === 'string' ? ev.data : '';
        if (!text) return;
        this.bytesIn += text.length;
        this.msgsIn++;
        const msg = JSON.parse(text) as NetMsg;
        this.onMessage?.(msg, kind);
      } catch {
        /* message illisible : ignoré */
      }
    };
  }

  // --- Côté hôte : crée une invitation (offre) pour UN client ---

  public async createInvite(): Promise<string> {
    const pc = this.makePc();
    const reliable = pc.createDataChannel('reliable', { ordered: true });
    const state = pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
    this.wireChannel(reliable, 'reliable');
    this.wireChannel(state, 'state');
    this.reliable = reliable;
    this.state = state;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    const blob: SessionBlob = { v: 1, kind: 'offer', sdp: pc.localDescription?.sdp ?? '' };
    return encodeSession(blob);
  }

  public async acceptAnswer(code: string): Promise<void> {
    if (!this.pc) throw new Error('Aucune invitation en cours.');
    const { decodeSession } = await import('./signaling');
    const blob = decodeSession(code);
    if (blob.kind !== 'answer') throw new Error('Réponse attendue (answer).');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: blob.sdp });
  }

  // --- Côté client : répond à une invitation ---

  public async answerInvite(code: string): Promise<string> {
    const { decodeSession } = await import('./signaling');
    const blob = decodeSession(code);
    if (blob.kind !== 'offer') throw new Error('Invitation attendue (offer).');
    const pc = this.makePc();
    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      if (dc.label === 'reliable') {
        this.reliable = dc;
        this.wireChannel(dc, 'reliable');
      } else if (dc.label === 'state') {
        this.state = dc;
        this.wireChannel(dc, 'state');
      }
    };
    await pc.setRemoteDescription({ type: 'offer', sdp: blob.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    const out: SessionBlob = { v: 1, kind: 'answer', sdp: pc.localDescription?.sdp ?? '' };
    return encodeSession(out);
  }

  // --- Envoi ---

  public sendReliable(msg: NetMsg): boolean {
    if (!this.reliable || this.reliable.readyState !== 'open') return false;
    try {
      const text = JSON.stringify(msg);
      this.reliable.send(text);
      this.bytesOut += text.length;
      this.msgsOut++;
      return true;
    } catch {
      return false;
    }
  }

  public sendState(msg: NetMsg): boolean {
    if (!this.state || this.state.readyState !== 'open') return false;
    try {
      const text = JSON.stringify(msg);
      this.state.send(text);
      this.bytesOut += text.length;
      this.msgsOut++;
      return true;
    } catch {
      return false;
    }
  }

  public close(): void {
    try {
      this.reliable?.close();
    } catch {
      /* ignore */
    }
    try {
      this.state?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.reliable = null;
    this.state = null;
    this.pc = null;
    this.openChannels = 0;
    if (this.connState !== 'new') this.setState('closed');
  }
}
