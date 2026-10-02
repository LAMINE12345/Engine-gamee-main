import type { SceneExportData } from '../../types/engine';

/**
 * conflicts.ts — résolution quand un import JSON/binaire percute la scène
 * courante (autosave), + slots de sauvegarde locale.
 *
 * Politiques d'import :
 * - 'replace' : l'import gagne ; la scène courante est d'abord copiée dans
 *   un slot `aether.backup.<ts>` (restauration possible, cap 5 slots).
 * - 'merge' : les nœuds entrants sont AJOUTÉS (nouveaux UUIDs, collisions de
 *   noms suffixées) ; environnement/atmosphère/terrain courants conservés.
 * - 'cancel' : rien n'est appliqué.
 */

export type ImportPolicy = 'replace' | 'merge' | 'cancel';

export interface SceneConflict {
  hasConflict: boolean;
  reason?: string;
  currentNodes?: number;
  incomingNodes?: number;
  currentAt?: string;
  incomingAt?: string;
}

const BACKUP_PREFIX = 'aether.backup.';
/** Nombre de slots de sauvegarde conservés (exporté pour l'UI de sauvegarde). */
export const MAX_BACKUPS = 5;

/** Summary léger pour la détection (pas d'export complet requis... mais on l'accepte). */
export interface SceneSummary {
  timestamp?: string;
  nodes: number;
  projectName?: string;
}

/**
 * Conflit = les deux scènes sont non vides et différentes.
 * Cas typiques : fichier plus vieux que le travail courant, ou deux
 * sessions divergentes.
 */
export function detectImportConflict(
  current: SceneSummary | null,
  incoming: SceneExportData
): SceneConflict {
  const incomingNodes = Array.isArray(incoming.nodes) ? incoming.nodes.length : 0;
  if (!current || current.nodes === 0 || incomingNodes === 0) {
    return { hasConflict: false };
  }
  if (current.timestamp && incoming.timestamp && current.timestamp === incoming.timestamp) {
    return { hasConflict: false };
  }
  const direction =
    current.timestamp && incoming.timestamp && incoming.timestamp < current.timestamp
      ? `le fichier (${incoming.timestamp}) est plus vieux que le travail courant (${current.timestamp})`
      : 'les deux scènes contiennent des objets différents';
  return {
    hasConflict: true,
    reason: `Import de ${incomingNodes} nœud(s) sur une scène de ${current.nodes} nœud(s) : ${direction}.`,
    currentNodes: current.nodes,
    incomingNodes,
    currentAt: current.timestamp,
    incomingAt: incoming.timestamp,
  };
}

/** Fusion pure : nœuds entrants ajoutés avec nouveaux UUIDs. */
export function mergeScenes(
  current: SceneExportData,
  incoming: SceneExportData
): { data: SceneExportData; warnings: string[] } {
  const warnings: string[] = [];
  const existingIds = new Set(current.nodes.map((n) => n.id));
  const existingNames = new Set(current.nodes.map((n) => n.name));
  const mergedNodes: SceneExportData['nodes'] = [
    ...current.nodes.map((n) => ({ ...n })),
  ];

  const genId = () =>
    `node-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  let renamed = 0;
  for (const node of incoming.nodes) {
    const copy = { ...(node as object) } as SceneExportData['nodes'][number];
    if (!copy.id || existingIds.has(copy.id)) {
      copy.id = genId();
    }
    existingIds.add(copy.id);
    if (existingNames.has(copy.name)) {
      copy.name = `${copy.name} (import)`;
      renamed++;
    }
    existingNames.add(copy.name);
    mergedNodes.push(copy);
  }
  if (renamed > 0) {
    warnings.push(`${renamed} nœud(s) renommé(s) (collision de noms).`);
  }
  warnings.push(
    'Fusion : environnement, atmosphère et terrain courants conservés (ceux du fichier sont ignorés).'
  );

  return {
    data: {
      ...current,
      timestamp: new Date().toISOString(),
      nodes: mergedNodes,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Slots de sauvegarde locale (localStorage, cap 5, les plus vieux purgés)
// ---------------------------------------------------------------------------

function backupKey(ts: string): string {
  return `${BACKUP_PREFIX}${ts}`;
}

export interface BackupInfo {
  key: string;
  at: string;
  nodes: number;
  projectName?: string;
}

/** Sauvegarde la scène courante dans un slot horodaté. Retourne la clé. */
export function backupCurrentScene(current: SceneExportData): string {
  const ts = new Date().toISOString().replaceAll(':', '-');
  const key = backupKey(ts);
  try {
    window.localStorage.setItem(key, JSON.stringify(current));
  } catch (err) {
    throw new Error(
      `Sauvegarde impossible (quota ?) : ${err instanceof Error ? err.message : err}`
    );
  }
  pruneBackups();
  return key;
}

/** Sauvegarde un brut (fichier entrant invalide, autosave corrompu...). */
export function stashRaw(key: string, raw: string): void {
  try {
    window.localStorage.setItem(`${BACKUP_PREFIX}raw-${key}`, raw);
  } catch {
    /* stockage plein : on ignore */
  }
  pruneBackups();
}

export function listBackups(): BackupInfo[] {
  const out: BackupInfo[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(BACKUP_PREFIX) || key.includes('raw-')) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as {
          timestamp?: unknown;
          nodes?: unknown;
          projectName?: unknown;
        } | null;
        out.push({
          key,
          at: typeof parsed?.timestamp === 'string' ? parsed.timestamp : key,
          nodes: Array.isArray(parsed?.nodes) ? parsed.nodes.length : 0,
          projectName:
            typeof parsed?.projectName === 'string' ? parsed.projectName : undefined,
        });
      } catch {
        /* entrée illisible : ignorée */
      }
    }
  } catch {
    /* stockage indisponible */
  }
  return out.sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** Relit un backup (objet brut, à valider/migrer par l'appelant). */
export function readBackup(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deleteBackup(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function pruneBackups(): void {
  const all = listBackups();
  for (const extra of all.slice(MAX_BACKUPS)) {
    deleteBackup(extra.key);
  }
  // Purge aussi les bruts surnuméraires (même cap).
  try {
    const raws: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(`${BACKUP_PREFIX}raw-`)) raws.push(key);
    }
    raws.sort().reverse();
    for (const extra of raws.slice(MAX_BACKUPS)) {
      window.localStorage.removeItem(extra);
    }
  } catch {
    /* ignore */
  }
}
