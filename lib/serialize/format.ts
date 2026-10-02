/**
 * format.ts — version canonique du format de scène.
 *
 * Source unique de vérité : exportScene stamp `FORMAT_VERSION`,
 * HistoryManager et le validateur s'y réfèrent. Bump = ajouter un migrateur
 * dans migrations.ts (jamais de casse silencieuse).
 */

export const FORMAT_VERSION = '1.4.0';

/** Versions connues, ordre croissant (la migration les traverse une à une). */
export const KNOWN_VERSIONS = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0'] as const;

export type KnownVersion = (typeof KNOWN_VERSIONS)[number];

export function parseVersion(v: unknown): [number, number, number] | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/** -1 si a < b, 0 si égales, 1 si a > b. Versions illisibles = les plus vieilles. */
export function compareVersions(a: unknown, b: unknown): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export function isOlderThan(v: unknown, ref: string): boolean {
  return compareVersions(v, ref) < 0;
}

export function isNewerThanCurrent(v: unknown): boolean {
  return compareVersions(v, FORMAT_VERSION) > 0;
}

/** Version lisible : connue et ≤ courante. */
export function isSupported(v: unknown): boolean {
  return compareVersions(v, FORMAT_VERSION) <= 0;
}
