import type { SceneExportData } from '../../types/engine';
import { COLLAB_FIELDS } from './types';
import type {
  CollabField,
  CollabNodeData,
  CollabOp,
  MergeConflict,
  MergeResult,
  NodeDiff,
  SceneDiff,
} from './types';

/** Clé de suivi : l'UUID du nœud (stable : même fichier chargé des deux
 *  côtés, UUID adopté à la création distante via preserveId). */
export function nodeKey(n: CollabNodeData): string {
  return `u:${n.id ?? n.name}`;
}

function fieldOf(n: CollabNodeData, f: CollabField): unknown {
  return (n as Record<string, unknown>)[f];
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) {
    // undefined ≣ absent ; null est une valeur.
    return a === undefined && b === undefined;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/**
 * Diff deux snapshots → ops minimales (adds/dels/sets par champ).
 * `base` = dernier état synchronisé, `current` = état local.
 */
export function diffSnapshots(
  base: SceneExportData,
  current: SceneExportData
): CollabOp[] {
  const ops: CollabOp[] = [];
  const baseMap = new Map<string, CollabNodeData>();
  for (const n of base.nodes ?? []) baseMap.set(nodeKey(n), n);
  const curMap = new Map<string, CollabNodeData>();
  for (const n of current.nodes ?? []) curMap.set(nodeKey(n), n);

  for (const [key, n] of curMap) {
    const b = baseMap.get(key);
    if (!b) {
      ops.push({ k: 'add', id: key, node: clone(n) });
      continue;
    }
    for (const f of COLLAB_FIELDS) {
      if (!sameValue(fieldOf(b, f), fieldOf(n, f))) {
        ops.push({ k: 'set', id: key, field: f, value: clone(fieldOf(n, f)) });
      }
    }
  }
  for (const key of baseMap.keys()) {
    if (!curMap.has(key)) ops.push({ k: 'del', id: key });
  }
  return ops;
}

/** Diff visuel pour l'UI (regroupé added/removed/modified). */
export function visualDiff(base: SceneExportData, current: SceneExportData): SceneDiff {
  const ops = diffSnapshots(base, current);
  const added: NodeDiff[] = [];
  const removed: NodeDiff[] = [];
  const modMap = new Map<string, NodeDiff>();
  const nameOf = (key: string): string => {
    const n = (current.nodes ?? []).find((x) => nodeKey(x) === key)
      ?? (base.nodes ?? []).find((x) => nodeKey(x) === key);
    return n?.name ?? key;
  };
  for (const op of ops) {
    if (op.k === 'add') {
      added.push({ kind: 'added', key: op.id, name: op.node.name || op.id, fields: [] });
    } else if (op.k === 'del') {
      removed.push({ kind: 'removed', key: op.id, name: nameOf(op.id), fields: [] });
    } else {
      let d = modMap.get(op.id);
      if (!d) {
        d = { kind: 'modified', key: op.id, name: nameOf(op.id), fields: [] };
        modMap.set(op.id, d);
      }
      d.fields.push(op.field);
    }
  }
  const settingsChanged =
    !sameValue(stripNodes(base), stripNodes(current));
  const modified = [...modMap.values()];
  return {
    added,
    removed,
    modified,
    settingsChanged,
    totalChanges: added.length + removed.length + modified.length + (settingsChanged ? 1 : 0),
  };
}

function stripNodes(s: SceneExportData): unknown {
  const { nodes: _n, ...rest } = s as SceneExportData & { nodes?: unknown };
  void _n;
  return rest;
}

/** Applique des ops sur un snapshot (pur, pour merge/preview). */
export function applyOpsToSnapshot(snap: SceneExportData, ops: CollabOp[]): SceneExportData {
  const out: SceneExportData = JSON.parse(JSON.stringify(snap)) as SceneExportData;
  const nodes = (out.nodes ?? []) as CollabNodeData[];
  const byKey = new Map(nodes.map((n) => [nodeKey(n), n]));
  for (const op of ops) {
    if (op.k === 'add') {
      if (!byKey.has(op.id)) {
        const copy = clone(op.node);
        nodes.push(copy);
        byKey.set(op.id, copy);
      }
    } else if (op.k === 'del') {
      const idx = nodes.findIndex((n) => nodeKey(n) === op.id);
      if (idx >= 0) {
        byKey.delete(op.id);
        nodes.splice(idx, 1);
      }
    } else {
      const n = byKey.get(op.id);
      if (n) (n as Record<string, unknown>)[op.field] = clone(op.value);
    }
  }
  out.nodes = nodes as SceneExportData['nodes'];
  return out;
}

/**
 * Merge 3-voies (base, ours, theirs) au niveau champ.
 * Conflits : même champ modifié des deux côtés différemment, ou
 * delete-vs-modify. Le résultat contient `ours` pour les conflits
 * (résolution explicite via resolveConflicts).
 */
export function threeWayMerge(
  base: SceneExportData,
  ours: SceneExportData,
  theirs: SceneExportData
): MergeResult {
  const oursOps = diffSnapshots(base, ours);
  const theirsOps = diffSnapshots(base, theirs);
  let merged: SceneExportData = JSON.parse(JSON.stringify(ours)) as SceneExportData;
  const conflicts: MergeConflict[] = [];
  let autoApplied = 0;

  // Indexe nos changements par (id, champ).
  const oursTouched = new Map<string, CollabOp[]>();
  for (const op of oursOps) {
    const list = oursTouched.get(op.id) ?? [];
    list.push(op);
    oursTouched.set(op.id, list);
  }
  const nameOf = (key: string): string => {
    const n = [ours, theirs, base].flatMap((s) => s.nodes ?? []).find((x) => nodeKey(x) === key);
    return (n?.name as string | undefined) ?? key;
  };

  for (const op of theirsOps) {
    const mine = oursTouched.get(op.id) ?? [];
    if (op.k === 'add') {
      const already = (merged.nodes ?? []).some((n) => nodeKey(n as CollabNodeData) === op.id);
      if (!already) {
        (merged.nodes as CollabNodeData[]).push(clone(op.node));
        autoApplied++;
      }
      continue;
    }
    if (op.k === 'del') {
      const myMods = mine.filter((o) => o.k === 'set');
      const baseNode = (base.nodes ?? []).find((n) => nodeKey(n as CollabNodeData) === op.id);
      if (myMods.length > 0 && baseNode) {
        conflicts.push({ key: op.id, name: nameOf(op.id), field: '__deleted', ours: 'modifié', theirs: 'supprimé' });
        continue;
      }
      merged = applyOpsToSnapshot(merged, [op]);
      autoApplied++;
      continue;
    }
    // op set : conflit si on a touché le même champ avec une autre valeur.
    const conflict = mine.find(
      (o) => o.k === 'set' && o.field === op.field && !sameValue(o.value, op.value)
    );
    if (conflict && conflict.k === 'set') {
      conflicts.push({
        key: op.id,
        name: nameOf(op.id),
        field: op.field,
        ours: conflict.value,
        theirs: op.value,
      });
      continue;
    }
    const alreadySame = mine.some((o) => o.k === 'set' && o.field === op.field && sameValue(o.value, op.value));
    if (!alreadySame) {
      merged = applyOpsToSnapshot(merged, [op]);
      autoApplied++;
    }
  }
  return { merged, conflicts, autoApplied };
}
