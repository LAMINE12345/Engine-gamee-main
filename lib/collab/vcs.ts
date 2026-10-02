import type { SceneExportData } from '../../types/engine';
import { threeWayMerge, visualDiff, nodeKey } from './diff';
import type { CollabBranch, CollabCommit, MergeConflict, MergeResult, SceneDiff } from './types';

const MAX_COMMITS = 100;

function commitId(): string {
  return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * VersionControl — historique local + branches + merge 3-voies (5.2).
 *
 * Les snapshots sont des exports de scène complets (restauration exacte
 * via importScene). Partage : un commit reçu s'ajoute à l'historique et
 * peut être mergé dans la branche courante.
 */
export class VersionControl {
  public currentBranch = 'main';

  private readonly commits = new Map<string, CollabCommit>();
  private readonly branches = new Map<string, CollabBranch>();
  private mergeBase: { ours: string; theirs: string; base: string; merged: SceneExportData } | null = null;
  private pendingConflicts: MergeConflict[] = [];

  constructor() {
    this.branches.set('main', { name: 'main', head: null, createdAt: Date.now() });
  }

  // ---------------------------------------------------------- lecture

  public listCommits(branch?: string, limit = 60): CollabCommit[] {
    const b = branch ?? this.currentBranch;
    const out: CollabCommit[] = [];
    let head = this.branches.get(b)?.head ?? null;
    let guard = 0;
    while (head && guard++ < limit) {
      const c = this.commits.get(head);
      if (!c) break;
      out.push(c);
      head = c.parents[0] ?? null;
    }
    return out;
  }

  public listBranches(): CollabBranch[] {
    return [...this.branches.values()];
  }

  public head(branch?: string): CollabCommit | null {
    const id = this.branches.get(branch ?? this.currentBranch)?.head ?? null;
    return (id && this.commits.get(id)) || null;
  }

  public getCommit(id: string): CollabCommit | undefined {
    return this.commits.get(id);
  }

  public diffCommits(aId: string | null, b: SceneExportData): SceneDiff {
    const a = aId ? this.commits.get(aId)?.snapshot : null;
    const empty = { version: '', generator: '', timestamp: '', environment: {} as SceneExportData['environment'], nodes: [] } as SceneExportData;
    return visualDiff(a ?? empty, b);
  }

  // ---------------------------------------------------------- écriture

  public commit(message: string, actor: string, snapshot: SceneExportData): CollabCommit {
    const head = this.branches.get(this.currentBranch)?.head ?? null;
    const c: CollabCommit = {
      id: commitId(),
      parents: head ? [head] : [],
      branch: this.currentBranch,
      message: message || '(sans message)',
      actor,
      at: Date.now(),
      snapshot: JSON.parse(JSON.stringify(snapshot)) as SceneExportData,
    };
    this.store(c);
    const br = this.branches.get(this.currentBranch);
    if (br) br.head = c.id;
    return c;
  }

  private store(c: CollabCommit): void {
    this.commits.set(c.id, c);
    if (!this.branches.has(c.branch)) {
      this.branches.set(c.branch, { name: c.branch, head: c.id, createdAt: Date.now() });
    }
    if (this.commits.size > MAX_COMMITS) {
      // Élague les commits les plus vieux non pointés par une branche.
      const heads = new Set([...this.branches.values()].map((b) => b.head));
      const sorted = [...this.commits.values()].sort((a, b) => a.at - b.at);
      for (const old of sorted) {
        if (this.commits.size <= MAX_COMMITS) break;
        if (!heads.has(old.id)) this.commits.delete(old.id);
      }
    }
  }

  public receiveCommit(c: CollabCommit): boolean {
    if (this.commits.has(c.id)) return false;
    this.store({ ...c, snapshot: JSON.parse(JSON.stringify(c.snapshot)) as SceneExportData });
    return true;
  }

  public createBranch(name: string): void {
    const clean = name.trim().slice(0, 32) || `branche-${this.branches.size + 1}`;
    if (this.branches.has(clean)) throw new Error(`La branche "${clean}" existe déjà.`);
    const head = this.branches.get(this.currentBranch)?.head ?? null;
    this.branches.set(clean, { name: clean, head, createdAt: Date.now() });
  }

  public checkoutBranch(name: string): SceneExportData | null {
    const br = this.branches.get(name);
    if (!br) return null;
    this.currentBranch = name;
    const head = br.head ? this.commits.get(br.head) : undefined;
    return head ? (JSON.parse(JSON.stringify(head.snapshot)) as SceneExportData) : null;
  }

  // ---------------------------------------------------------- merge

  /** Ancêtre commun le plus récent (BFS depuis les deux têtes). */
  public mergeBaseId(oursHead: string | null, theirsHead: string | null): string | null {
    if (!oursHead || !theirsHead) return oursHead ?? theirsHead;
    const oursAnc = new Set<string>();
    let h: string | null | undefined = oursHead;
    let guard = 0;
    while (h && guard++ < 200) {
      oursAnc.add(h);
      const c = this.commits.get(h);
      h = c?.parents[0] ?? null;
    }
    h = theirsHead;
    guard = 0;
    while (h && guard++ < 200) {
      if (oursAnc.has(h)) return h;
      const c = this.commits.get(h);
      h = c?.parents[0] ?? null;
    }
    return null;
  }

  /**
   * Prépare un merge : calcule base/ours/theirs + conflits. Le résultat
   * (version `ours` pour les conflits) est rejouable après résolution.
   */
  public prepareMerge(theirsHeadId: string, oursWork: SceneExportData): MergeResult & { baseId: string | null } {
    const theirs = this.commits.get(theirsHeadId);
    if (!theirs) throw new Error('Commit distant introuvable.');
    const oursHead = this.branches.get(this.currentBranch)?.head ?? null;
    const baseId = this.mergeBaseId(oursHead, theirsHeadId);
    const baseSnap = (baseId && this.commits.get(baseId)?.snapshot) || null;
    const empty = { version: '', generator: '', timestamp: '', environment: {} as SceneExportData['environment'], nodes: [] } as SceneExportData;
    const result = threeWayMerge(baseSnap ?? empty, oursWork, theirs.snapshot);
    this.mergeBase = { ours: oursHead ?? '', theirs: theirsHeadId, base: baseId ?? '', merged: result.merged };
    this.pendingConflicts = result.conflicts;
    return { ...result, baseId };
  }

  public pendingMergeConflicts(): MergeConflict[] {
    return [...this.pendingConflicts];
  }

  /** Applique les résolutions (ours/theirs par index) → snapshot final. */
  public resolveMerge(resolutions: ('ours' | 'theirs')[]): SceneExportData | null {
    if (!this.mergeBase) return null;
    let merged: SceneExportData = JSON.parse(JSON.stringify(this.mergeBase.merged)) as SceneExportData;
    this.pendingConflicts.forEach((conflict, i) => {
      if (resolutions[i] !== 'theirs') return;
      const nodes = (merged.nodes ?? []) as Parameters<typeof nodeKey>[0][];
      const idx = nodes.findIndex((n) => {
        const k = (() => {
          try {
            return nodeKey(n as Parameters<typeof nodeKey>[0]);
          } catch {
            return '';
          }
        })();
        return k === conflict.key;
      });
      if (conflict.field === '__deleted') {
        if (idx >= 0) nodes.splice(idx, 1);
      } else if (idx >= 0) {
        (nodes[idx] as Record<string, unknown>)[conflict.field] = JSON.parse(
          JSON.stringify(conflict.theirs)
        );
      }
    });
    this.mergeBase.merged = merged;
    this.pendingConflicts = [];
    return merged;
  }

  /** Committe le merge préparé (2 parents). */
  public commitMerge(message: string, actor: string): CollabCommit | null {
    if (!this.mergeBase) return null;
    const { ours, theirs, merged } = this.mergeBase;
    const parents = [ours, theirs].filter((p) => p) as string[];
    const c: CollabCommit = {
      id: commitId(),
      parents,
      branch: this.currentBranch,
      message: message || 'Merge',
      actor,
      at: Date.now(),
      snapshot: merged,
    };
    this.store(c);
    const br = this.branches.get(this.currentBranch);
    if (br) br.head = c.id;
    this.mergeBase = null;
    return c;
  }

  public discardMerge(): void {
    this.mergeBase = null;
    this.pendingConflicts = [];
  }
}
