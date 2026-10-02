import { encode, decode } from '@msgpack/msgpack';
import type { SceneExportData } from '../../types/engine';
import { FORMAT_VERSION } from './format';

/**
 * binary.ts — sérialisation binaire MessagePack (extension `.aether`).
 *
 * Enveloppe : `[magic "AET1"(4 o)][versionLen u16 BE][version utf8][payload msgpack]`
 * - Le heightmap (souvent le gros du fichier) est stocké en float32 binaire
 *   (`bin`) plutôt qu'en tableau JSON : ~4× plus compact, décodage rapide.
 *   Perte float64→float32 négligeable (le GPU travaille en float32 de toute façon).
 * - Le décodage restaure un objet plain (heightmap → number[]) prêt pour
 *   migration + validation. Version lue depuis l'enveloppe AVANT décodage.
 */

export const BINARY_MAGIC = 'AET1';
export const BINARY_EXT = '.aether';
/** Marqueur d'un heightmap float32 binaire dans le payload. */
const F32_MARKER = '__aether_f32_heightmap__';

function heightmapToBin(heightmap: number[] | undefined): unknown {
  if (!heightmap || heightmap.length === 0) return [];
  const f32 = new Float32Array(heightmap);
  // Copie exacte des octets (pas de vue partagée).
  const bytes = new Uint8Array(f32.buffer.slice(0));
  return { [F32_MARKER]: true, data: bytes };
}

function binToHeightmap(value: unknown): number[] {
  if (Array.isArray(value)) return value as number[];
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o[F32_MARKER] === true && o.data instanceof Uint8Array) {
      const bytes = o.data;
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return Array.from(new Float32Array(buf));
    }
  }
  return [];
}

/** Encode une scène exportée vers le format binaire `.aether`. */
export function encodeSceneBinary(data: SceneExportData): Uint8Array<ArrayBuffer> {
  const version = data.version || FORMAT_VERSION;
  const payload = {
    ...data,
    terrain: data.terrain
      ? { ...data.terrain, heightmap: heightmapToBin(data.terrain.heightmap) }
      : undefined,
  };
  const encoded: Uint8Array = encode(payload);
  const versionBytes = new TextEncoder().encode(version);
  if (versionBytes.length > 65535) throw new Error('Version trop longue.');
  const out = new Uint8Array(4 + 2 + versionBytes.length + encoded.length);
  out[0] = BINARY_MAGIC.charCodeAt(0);
  out[1] = BINARY_MAGIC.charCodeAt(1);
  out[2] = BINARY_MAGIC.charCodeAt(2);
  out[3] = BINARY_MAGIC.charCodeAt(3);
  new DataView(out.buffer).setUint16(4, versionBytes.length, false);
  out.set(versionBytes, 6);
  out.set(encoded, 6 + versionBytes.length);
  // Copie sur ArrayBuffer frais (BlobPart exige ArrayBuffer, pas SharedArrayBuffer).
  const fresh = new Uint8Array(out.length);
  fresh.set(out);
  return fresh;
}

export interface DecodedScene {
  /** Version lue depuis l'enveloppe (avant migration). */
  version: string;
  /** Objet plain prêt pour migrateScene(). */
  data: unknown;
}

/** Décode un buffer `.aether` (vérifie magic + version, restaure le heightmap). */
export function decodeSceneBinary(bytes: Uint8Array): DecodedScene {
  if (!(bytes instanceof Uint8Array) || bytes.length < 7) {
    throw new Error('Fichier .aether trop court ou illisible.');
  }
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== BINARY_MAGIC) {
    throw new Error(`Magic invalide (attendu ${BINARY_MAGIC}). Pas un fichier .aether ?`);
  }
  const versionLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(4, false);
  if (6 + versionLen > bytes.length) {
    throw new Error('En-tête .aether tronqué.');
  }
  const version = new TextDecoder().decode(bytes.slice(6, 6 + versionLen));
  const payloadBytes = bytes.slice(6 + versionLen);
  let decoded: unknown;
  try {
    decoded = decode(payloadBytes);
  } catch (err) {
    throw new Error(`Payload MessagePack illisible : ${err instanceof Error ? err.message : err}`);
  }
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Payload .aether invalide (objet attendu).');
  }
  const obj = decoded as Record<string, unknown>;
  const terrain = obj.terrain as Record<string, unknown> | undefined;
  if (terrain && typeof terrain === 'object') {
    terrain.heightmap = binToHeightmap(terrain.heightmap);
  }
  // La version d'enveloppe fait foi (le payload peut être plus vieux).
  (obj as Record<string, unknown>).version = version;
  return { version, data: obj };
}
