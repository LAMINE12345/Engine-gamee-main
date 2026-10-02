import type { SceneExportData } from '../../types/engine';

/**
 * lib/share/shareUrl.ts — partage de scène par lien (5.3).
 *
 * La scène JSON est gzipée (CompressionStream) puis base64url dans le hash
 * `#s=…` (le hash ne part jamais au serveur). Limite pratique ~1.5 Mo
 * compressé (plafond URL navigateurs) : au-delà, refus explicite avec la
 * taille mesurée (piste : export fichier .aether existant).
 */

export const SHARE_URL_LIMIT = 1_500_000;
export const SHARE_HASH_PREFIX = '#s=';

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(code: string): Uint8Array {
  let s = code.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export interface ShareEncodeResult {
  url: string;
  rawBytes: number;
  compressedBytes: number;
}

/** Encode une scène en URL partageable (throw si trop lourde). */
export async function encodeSceneToUrl(scene: SceneExportData, baseUrl?: string): Promise<ShareEncodeResult> {
  const json = JSON.stringify(scene);
  const raw = new TextEncoder().encode(json);
  const compressed = await gzip(raw);
  if (compressed.length > SHARE_URL_LIMIT) {
    throw new Error(
      `Scène trop lourde pour un lien (${(compressed.length / 1048576).toFixed(2)} Mo compressés, limite ~1.4 Mo). Utilisez l'export .aether.`
    );
  }
  const base =
    baseUrl ??
    (typeof window !== 'undefined' ? `${window.location.origin}/preview` : '/preview');
  const url = `${base}${SHARE_HASH_PREFIX}${bytesToBase64Url(compressed)}`;
  return { url, rawBytes: raw.length, compressedBytes: compressed.length };
}

/** Décode le hash `#s=…` (ou le code seul) vers la scène. */
export async function decodeSceneFromHash(hash: string): Promise<SceneExportData> {
  let code = hash.trim();
  const idx = code.indexOf(SHARE_HASH_PREFIX);
  if (idx >= 0) code = code.slice(idx + SHARE_HASH_PREFIX.length);
  code = code.split('&')[0];
  if (!code) throw new Error('Lien de partage vide.');
  const raw = await gunzip(base64UrlToBytes(code));
  const text = new TextDecoder().decode(raw);
  const parsed = JSON.parse(text) as SceneExportData;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { nodes?: unknown }).nodes)) {
    throw new Error('Lien de partage invalide (scène illisible).');
  }
  return parsed;
}

export function formatShareBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1048576).toFixed(2)} Mo`;
}
