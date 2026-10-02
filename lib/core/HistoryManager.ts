import type { SceneExportData } from '../../types/engine';
import { FORMAT_VERSION } from '../serialize/format';
import {
  prepareScene,
  NewerVersionError,
  stashRaw,
  backupCurrentScene,
  listBackups,
  readBackup,
  deleteBackup,
} from '../serialize';
import type { BackupInfo } from '../serialize';

/** Clé localStorage de l'autosave de scène (JSON exportScene). */
export const AUTOSAVE_STORAGE_KEY = 'aether.autosave.v1';
/** Version du format d'autosave = version canonique (voir serialize/format.ts). */
export const AUTOSAVE_FORMAT_VERSION = FORMAT_VERSION;
/** Délai de debounce de l'autosave après une mutation (ms). */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Opérations de scène requises par l'historique (fournies par SceneManager).
 * L'historique ne manipule jamais la scène directement : il passe par ce port.
 */
export interface HistoryScenePort {
  exportScene(): SceneExportData;
  importScene(data: SceneExportData, opts?: { skipValidation?: boolean }): void;
  clearUserScene(): void;
  seedInitialScene(): void;
  notifyHierarchy(): void;
}

/**
 * Opérations de sélection requises pour préserver la sélection
 * à travers un undo/redo (fournies par SelectionManager).
 */
export interface HistorySelectionPort {
  getSelectedIds(): string[];
  restoreSelection(ids: string[]): void;
  clearSelection(): void;
}

export interface HistoryDeps {
  scene: HistoryScenePort;
  selection: HistorySelectionPort;
  /** L'autosave et l'historique sont suspendus pendant le Play. */
  isPlaying: () => boolean;
}

/** Libellé par défaut quand l'appelant ne décrit pas la mutation. */
export const DEFAULT_HISTORY_LABEL = 'Modification';

/**
 * Une entrée de la pile : le snapshot ET le libellé lisible de l'action qui
 * l'a produit. Le libellé sert à renseigner les boutons Annuler/Rétablir
 * (« Annuler : Déplacer 3 objets ») et le toast de confirmation.
 */
export interface HistoryEntry {
  state: SceneExportData;
  label: string;
}

/** État d'autosave exposé à l'UI (point d'état « Sauvegardé / En cours »). */
export interface AutosaveInfo {
  /** Horodatage ISO du dernier autosave réussi, null si jamais. */
  savedAt: string | null;
  /** Un autosave est en attente (debounce en cours). */
  pending: boolean;
  /** Dernière erreur bloquante (quota, stockage indisponible). */
  error: string | null;
  /** L'autosave a dû se replier (heightmap/foliage retirés) faute de place. */
  degraded: boolean;
}

/**
 * HistoryManager — pile undo/redo + autosave persistant.
 *
 * - L'historique est une pile de snapshots SceneExportData (cap 50).
 * - L'autosave (localStorage, debouncé) garantit que le projet survit
 *   au rechargement de la page, avec repli sans heightmap/foliage si quota dépassé.
 * - `runWithoutAutosave()` permet les restaurations programmatiques
 *   (import, reset démo) sans déclencher d'écritures redondantes.
 */
export class HistoryManager {
  private readonly scene: HistoryScenePort;
  private readonly selection: HistorySelectionPort;
  private readonly isPlaying: () => boolean;

  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxHistory: number = 50;

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** true pendant restore/import programmatique : bloque l'autosave redondant. */
  private suppressAutosave = false;
  private boundFlushAutosave: () => void = () => {};
  /** Horodatage ISO du dernier autosave réussi (info/debug). */
  public lastAutosaveAt: string | null = null;
  /** Autosave planifié mais pas encore écrit (affiché par l'UI). */
  private autosavePending = false;
  /** Dernière erreur bloquante d'écriture, null si tout va bien. */
  private autosaveError: string | null = null;
  /** L'écriture a dû se replier faute de quota (heightmap/foliage retirés). */
  private autosaveDegraded = false;

  constructor(deps: HistoryDeps) {
    this.scene = deps.scene;
    this.selection = deps.selection;
    this.isPlaying = deps.isPlaying;
  }

  // -------------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------------

  public get canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get undoDepth(): number {
    return this.undoStack.length;
  }

  /**
   * Empile l'état courant. `label` décrit la mutation que l'utilisateur vient
   * de faire — c'est ce texte qui affichera « Annuler : <label> ».
   * Une nouvelle entrée invalide le redo, comme dans tout éditeur.
   */
  public saveHistoryState(label: string = DEFAULT_HISTORY_LABEL): void {
    const state = this.scene.exportScene();
    this.undoStack.push({ state, label });
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.scheduleAutosave();
  }

  /** Libellé de l'action que le prochain undo annulerait (null si aucune). */
  public getUndoLabel(): string | null {
    if (this.undoStack.length <= 1) return null;
    return this.undoStack[this.undoStack.length - 1].label;
  }

  /** Libellé de l'action que le prochain redo réappliquerait (null si aucune). */
  public getRedoLabel(): string | null {
    if (this.redoStack.length === 0) return null;
    return this.redoStack[this.redoStack.length - 1].label;
  }

  /** Annule la dernière action. Retourne son libellé, ou null si rien à faire. */
  public undo(): string | null {
    if (this.undoStack.length <= 1) return null;
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);

    const prevEntry = this.undoStack[this.undoStack.length - 1];
    this.applyHistoryState(prevEntry.state);
    return current.label;
  }

  /** Rétablit l'action annulée. Retourne son libellé, ou null si rien à faire. */
  public redo(): string | null {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(next);
    this.applyHistoryState(next.state);
    return next.label;
  }

  private applyHistoryState(state: SceneExportData): void {
    const selectedIds = this.selection.getSelectedIds();

    // Snapshots internes (undo/redo) : déjà au format courant, pas de
    // re-validation (évite clone profond + scan à chaque annulation).
    this.scene.importScene(state, { skipValidation: true });

    // Restore selected states safely
    this.selection.restoreSelection(selectedIds);
  }

  /** Exécute fn sans déclencher d'autosave (restore/import programmatique). */
  public runWithoutAutosave(fn: () => void): void {
    this.suppressAutosave = true;
    try {
      fn();
    } finally {
      this.suppressAutosave = false;
    }
  }

  // -------------------------------------------------------------------------
  // Autosave / restauration (le projet survit au rechargement de la page)
  // -------------------------------------------------------------------------

  /** Planifie un autosave debouncé. Appelé sur chaque mutation de la scène. */
  public scheduleAutosave(): void {
    if (this.suppressAutosave || this.isPlaying()) return;
    if (typeof window === 'undefined' || !window.localStorage) return;
    this.autosavePending = true;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.persistSceneNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /** Instantané de l'autosave pour l'indicateur d'état de la Toolbar. */
  public getAutosaveInfo(): AutosaveInfo {
    return {
      savedAt: this.lastAutosaveAt,
      pending: this.autosavePending,
      error: this.autosaveError,
      degraded: this.autosaveDegraded,
    };
  }

  /** Écrit la scène immédiatement dans localStorage (avec repli si quota dépassé). */
  public persistSceneNow(): void {
    if (this.suppressAutosave || this.isPlaying()) return;
    if (typeof window === 'undefined' || !window.localStorage) return;
    this.autosavePending = false;
    const data = this.scene.exportScene();
    try {
      window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(data));
      this.lastAutosaveAt = data.timestamp;
      this.autosaveError = null;
      this.autosaveDegraded = false;
    } catch (err) {
      const quotaExceeded =
        (err instanceof DOMException && err.name === 'QuotaExceededError') ||
        (err as { code?: number })?.code === 22;
      if (!quotaExceeded) {
        this.autosaveError = "Sauvegarde automatique impossible (stockage indisponible).";
        return;
      }
      // Repli : on sauvegarde sans le heightmap ni le foliage (volumineux).
      try {
        if (data.terrain) {
          data.terrain.heightmap = [];
          data.terrain.foliageLayers = [];
        }
        window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(data));
        this.lastAutosaveAt = data.timestamp;
        this.autosaveError = null;
        this.autosaveDegraded = true;
        console.warn('Autosave : quota dépassé, scène sauvegardée sans heightmap/foliage.');
      } catch {
        /* stockage indisponible, on ignore silencieusement */
        this.autosaveError = 'Sauvegarde automatique impossible : espace de stockage saturé.';
      }
    }
  }

  /** Démarrage : restaure l'autosave si présent et valide, sinon charge la scène démo. */
  public restoreOrSeed(): void {
    const restored = this.tryRestoreAutosave();
    if (!restored) {
      this.scene.seedInitialScene();
    }
    // Flush de sécurité à la fermeture / au rechargement de l'onglet.
    this.boundFlushAutosave = () => this.persistSceneNow();
    window.addEventListener('beforeunload', this.boundFlushAutosave);
    window.addEventListener('pagehide', this.boundFlushAutosave);
  }

  private tryRestoreAutosave(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const raw = window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
      if (!raw) return false;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // JSON tronqué/corrompu : on le met de côté AVANT de charger la démo.
        stashRaw(`autosave-corrupt-${Date.now()}`, raw.slice(0, 2_000_000));
        console.warn('Autosave illisible, mis de côté, chargement de la scène démo.');
        try {
          window.localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return false;
      }
      let prepared;
      try {
        prepared = prepareScene(parsed);
      } catch (err) {
        if (err instanceof NewerVersionError) {
          // Version FUTURE : on garde l'autosave intact (pas de suppression !)
          // et on démarre sur la démo. Mise à jour de l'éditeur requise.
          console.warn(`${err.message} Autosave conservé, chargement de la scène démo.`);
          return false;
        }
        // Invalide même après migration : mis de côté, pas supprimé en silence.
        stashRaw(`autosave-invalid-${Date.now()}`, raw.slice(0, 2_000_000));
        console.warn('Autosave invalide, mis de côté, chargement de la scène démo.', err);
        try {
          window.localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return false;
      }
      for (const w of [...prepared.applied, ...prepared.warnings]) {
        console.info(`[Scene] autosave : ${w}`);
      }
      this.runWithoutAutosave(() => {
        this.scene.importScene(prepared.data, { skipValidation: true });
      });
      return true;
    } catch (err) {
      console.warn('Autosave illisible, chargement de la scène démo.', err);
      try {
        window.localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return false;
    }
  }

  /** Un autosave existe-t-il ? */
  public hasAutosave(): boolean {
    try {
      return !!window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Sauvegardes locales (slots aether.backup.*, cap 5)
  // -------------------------------------------------------------------------

  /** Copie la scène courante dans un slot horodaté. Retourne la clé. */
  public backupNow(): string {
    return backupCurrentScene(this.scene.exportScene());
  }

  public listBackups(): BackupInfo[] {
    return listBackups();
  }

  public deleteBackup(key: string): void {
    deleteBackup(key);
  }

  /**
   * Restaure un slot (validation + migration incluses, sans autosave redondant).
   * Retourne false si le slot est illisible.
   */
  public restoreBackup(key: string): boolean {
    const raw = readBackup(key);
    if (!raw) return false;
    let prepared;
    try {
      prepared = prepareScene(raw);
    } catch (err) {
      console.warn(`Backup ${key} non restaurable.`, err);
      return false;
    }
    this.runWithoutAutosave(() => {
      this.scene.importScene(prepared.data, { skipValidation: true });
    });
    this.saveHistoryState();
    return true;
  }

  /** Supprime l'autosave (sans toucher à la scène courante). */
  public clearAutosave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    try {
      window.localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.lastAutosaveAt = null;
    this.autosavePending = false;
    this.autosaveError = null;
    this.autosaveDegraded = false;
  }

  /** Réinitialise vers la scène démo (vide l'autosave puis re-seed). */
  public resetToSeedScene(): void {
    this.clearAutosave();
    this.runWithoutAutosave(() => {
      this.selection.clearSelection();
      this.scene.clearUserScene();
      this.scene.seedInitialScene();
      this.scene.notifyHierarchy();
    });
    // Réamorce l'historique et planifie un autosave du seed.
    this.saveHistoryState();
  }

  public dispose(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    window.removeEventListener('beforeunload', this.boundFlushAutosave);
    window.removeEventListener('pagehide', this.boundFlushAutosave);
  }
}
