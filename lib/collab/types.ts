import type { SceneExportData } from '../../types/engine';

/**
 * lib/collab/types.ts — collaboration temps réel (5.2).
 *
 * Convergence CRDT : LWW-element-set (existence des nœuds) + registres LWW
 * par champ, ordonnés par (lamport, actor). Les horloges de Lamport avancent
 * à chaque op locale et au max vu à chaque réception.
 */

export type CollabField =
  | 'name'
  | 'parentId'
  | 'transform'
  | 'material'
  | 'light'
  | 'physics'
  | 'logic'
  | 'visible'
  | 'castShadow'
  | 'receiveShadow';

export const COLLAB_FIELDS: CollabField[] = [
  'name',
  'parentId',
  'transform',
  'material',
  'light',
  'physics',
  'logic',
  'visible',
  'castShadow',
  'receiveShadow',
];

export type CollabNodeData = NonNullable<SceneExportData['nodes']>[number];

export type CollabOp =
  | { k: 'add'; id: string; node: CollabNodeData }
  | { k: 'del'; id: string }
  | { k: 'set'; id: string; field: CollabField; value: unknown };

export interface CollabEnvelope {
  t: 'collab-ops';
  lamport: number;
  actor: string;
  ops: CollabOp[];
}

export interface PresenceMsg {
  t: 'collab-presence';
  actor: string;
  name: string;
  selected: string | null;
  selectedName: string | null;
  at: number;
}

export interface CommitShareMsg {
  t: 'collab-commit';
  actor: string;
  commit: CollabCommit;
}

export type CollabWireMsg = CollabEnvelope | PresenceMsg | CommitShareMsg;

/** Version d'un registre LWW : (lamport, actor) croissant gagne. */
export interface FieldVersion {
  lamport: number;
  actor: string;
}

export function versionWins(a: FieldVersion, b: FieldVersion): boolean {
  if (a.lamport !== b.lamport) return a.lamport > b.lamport;
  return a.actor > b.actor;
}

// ---------------------------------------------------------------------------
// Version control
// ---------------------------------------------------------------------------

export interface CollabCommit {
  id: string;
  parents: string[];
  branch: string;
  message: string;
  actor: string;
  at: number;
  snapshot: SceneExportData;
}

export interface CollabBranch {
  name: string;
  head: string | null;
  createdAt: number;
}

export type NodeChangeKind = 'added' | 'removed' | 'modified';

export interface NodeDiff {
  kind: NodeChangeKind;
  /** Clé de suivi (collabId ou uuid:…). */
  key: string;
  name: string;
  /** Champs modifiés (vide pour added/removed). */
  fields: CollabField[];
}

export interface SceneDiff {
  added: NodeDiff[];
  removed: NodeDiff[];
  modified: NodeDiff[];
  settingsChanged: boolean;
  totalChanges: number;
}

export interface MergeConflict {
  key: string;
  name: string;
  field: CollabField | '__deleted';
  ours: unknown;
  theirs: unknown;
}

export interface MergeResult {
  merged: SceneExportData;
  conflicts: MergeConflict[];
  autoApplied: number;
}

export interface PeerPresence {
  actor: string;
  name: string;
  selected: string | null;
  selectedName: string | null;
  lastSeen: number;
  color: string;
}
