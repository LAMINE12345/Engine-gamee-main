/**
 * lib/net/signaling.ts — signalisation manuelle (copier/coller, sans serveur).
 *
 * Pour le testing : l'hôte crée une invitation (offre SDP + candidats, sans
 * trickle — tout est figé dans un seul blob), le client la colle et produit
 * une réponse, l'hôte colle la réponse. Échange possible via chat, QR, etc.
 * STUN public pour traverser le NAT en LAN/Internet (host candidates seuls
 * suffisent déjà en local).
 */

export const NET_RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/** Offre ou réponse complète (SDP local après collecte ICE terminée). */
export interface SessionBlob {
  v: 1;
  kind: 'offer' | 'answer';
  sdp: string;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(code: string): string {
  const bin = atob(code.trim().replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSession(blob: SessionBlob): string {
  return toBase64(JSON.stringify(blob));
}

export function decodeSession(code: string): SessionBlob {
  const parsed = JSON.parse(fromBase64(code)) as Partial<SessionBlob>;
  if (!parsed || (parsed.kind !== 'offer' && parsed.kind !== 'answer') || typeof parsed.sdp !== 'string') {
    throw new Error('Code de session invalide.');
  }
  return { v: 1, kind: parsed.kind, sdp: parsed.sdp };
}

/** Attend la fin de la collecte ICE (non-trickle : un seul blob à copier). */
export function waitIceComplete(pc: RTCPeerConnection, timeoutMs = 8000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      reject(new Error('Collecte ICE trop longue (timeout).'));
    }, timeoutMs);
    const onChange = (): void => {
      if (pc.iceGatheringState === 'complete') {
        window.clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}
