import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HistoryManager, AUTOSAVE_STORAGE_KEY, DEFAULT_HISTORY_LABEL } from '../lib/core/HistoryManager';
import { FORMAT_VERSION } from '../lib/serialize/format';
import type { SceneExportData } from '../types/engine';

/**
 * Faux store localStorage : le HistoryManager écrit directement dedans et
 * `window` n'existe pas sous vitest (environnement node).
 */
class MemoryStorage {
  private map = new Map<string, string>();
  public throwOnSet: Error | null = null;
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.throwOnSet) throw this.throwOnSet;
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

/**
 * Une vraie `QuotaExceededError` : le HistoryManager teste
 * `err instanceof DOMException && err.name === 'QuotaExceededError'`.
 * Une Error ordinaire ne serait pas reconnue comme quota et partirait dans
 * la branche « stockage indisponible » — c'est exactement l'assertion du test.
 */
function quotaError(): Error {
  return new DOMException('quota exceeded', 'QuotaExceededError');
}

/**
 * Scène réellement conforme au schéma canonique : `restoreBackup()` repasse
 * par `prepareScene()` (validation stricte), donc un jeu de données à moitié
 * rempli échouerait — et l'échec masquerait la logique de l'historique.
 */
function makeScene(nodes: number, timestamp: string): SceneExportData {
  return {
    version: FORMAT_VERSION,
    timestamp,
    nodes: Array.from({ length: nodes }, (_, i) => ({
      id: `n${i}`,
      name: `Objet ${i}`,
      type: 'mesh',
      transform: {
        position: { x: i, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      visible: true,
      castShadow: true,
      receiveShadow: true,
      material: { color: '#ffffff', roughness: 0.5, metalness: 0, opacity: 1 },
    })),
    environment: {
      backgroundColor: '#000000',
      ambientIntensity: 1,
      sunIntensity: 1,
      sunPosition: { x: 0, y: 1, z: 0 },
    },
  } as unknown as SceneExportData;
}

interface Harness {
  history: HistoryManager;
  store: MemoryStorage;
  /** État actuellement « chargé » dans la scène. */
  current: { nodes: number; timestamp: string };
  imports: SceneExportData[];
}

function harness(opts: { isPlaying?: boolean } = {}): Harness {
  const store = new MemoryStorage();
  (globalThis as { window?: unknown }).window = {
    localStorage: store,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: globalThis.setTimeout,
  };

  const h: Harness = {
    store,
    current: { nodes: 1, timestamp: '2026-01-01T00:00:00.000Z' },
    imports: [],
    history: null as unknown as HistoryManager,
  };

  h.history = new HistoryManager({
    scene: {
      // L'état « courant » est la source de vérité du harness ; `importScene`
      // enregistre seulement ce qui est réinjecté. `undo()` réimporte un
      // instantané plus ancien : on vérifie le snapshot reçu, pas `h.current`.
      exportScene: () => makeScene(h.current.nodes, h.current.timestamp),
      importScene: (data) => {
        h.imports.push(data);
      },
      clearUserScene: () => {
        h.current.nodes = 0;
      },
      seedInitialScene: () => {
        h.current.nodes = 1;
      },
      notifyHierarchy: () => {},
    },
    selection: {
      getSelectedIds: () => [],
      restoreSelection: () => {},
      clearSelection: () => {},
    },
    isPlaying: () => opts.isPlaying ?? false,
  });

  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: unknown }).window;
});

describe('HistoryManager — pile undo/redo', () => {
  it('annule puis rétablit, et retourne le libellé de l’action', () => {
    const h = harness(); const { history } = h;
    history.saveHistoryState('Init');
    h.current = { nodes: 5, timestamp: '2026-01-01T00:01:00.000Z' };
    history.saveHistoryState('Déplacer 3 objets');

    expect(history.canUndo).toBe(true);
    expect(history.getUndoLabel()).toBe('Déplacer 3 objets');

    expect(history.undo()).toBe('Déplacer 3 objets');
    expect(history.canRedo).toBe(true);
    expect(history.getRedoLabel()).toBe('Déplacer 3 objets');

    expect(history.redo()).toBe('Déplacer 3 objets');
    expect(history.canRedo).toBe(false);
  });

  it('une nouvelle entrée invalide la pile de redo', () => {
    const h = harness(); const { history } = h;
    history.saveHistoryState('A');
    history.saveHistoryState('B');
    history.undo();
    expect(history.canRedo).toBe(true);
    history.saveHistoryState('C');
    expect(history.canRedo).toBe(false);
  });

  it('undo/redo sans pile ne font rien et ne renvoient pas de libellé', () => {
    const h = harness(); const { history } = h;
    history.saveHistoryState('A');
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('utilise un libellé générique quand l’appelant n’en fournit pas', () => {
    const h = harness(); const { history } = h;
    history.saveHistoryState();
    h.current = { nodes: 2, timestamp: '2026-01-01T00:02:00.000Z' };
    history.saveHistoryState();
    expect(history.undo()).toBe(DEFAULT_HISTORY_LABEL);
  });

  it('plafonne la pile à 50 entrées', () => {
    const h = harness(); const { history } = h;
    for (let i = 0; i < 70; i++) {
      h.current = { nodes: i, timestamp: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z` };
      history.saveHistoryState(`Action ${i}`);
    }
    expect(history.undoDepth).toBe(50);
  });

  it('restaure bien le snapshot précédent (pas l’état courant)', () => {
    const h = harness(); const { history, imports } = h;
    history.saveHistoryState('Début');
    h.current = { nodes: 9, timestamp: '2026-01-01T00:05:00.000Z' };
    history.saveHistoryState('Ajout');
    expect(imports).toHaveLength(0);

    history.undo();

    // Le snapshot réinjecté contient bien 1 nœud (l'état d'avant), pas 9.
    expect(imports).toHaveLength(1);
    expect((imports[0].nodes as unknown[]).length).toBe(1);
  });
});

describe('HistoryManager — autosave', () => {
  it('n’écrit pas immédiatement : c’est débouncé', () => {
    const h = harness(); const { history, store } = h;
    history.saveHistoryState('A');
    expect(store.getItem(AUTOSAVE_STORAGE_KEY)).toBeNull();
    expect(history.getAutosaveInfo().pending).toBe(true);
  });

  it('démarre avec une seule entrée : rien à annuler', () => {
    const h = harness(); const { history } = h;
    history.saveHistoryState();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undoDepth).toBe(1);
  });

  it('écrit après le délai de debounce et marque “saved”', () => {
    const h = harness(); const { history, store } = h;
    history.saveHistoryState('A');
    vi.advanceTimersByTime(1000);
    expect(store.getItem(AUTOSAVE_STORAGE_KEY)).not.toBeNull();
    const info = history.getAutosaveInfo();
    expect(info.pending).toBe(false);
    expect(info.savedAt).not.toBeNull();
    expect(info.error).toBeNull();
  });

  it('ne s’écrit pas pendant le Play', () => {
    const h = harness({ isPlaying: true }); const { history, store } = h;
    history.saveHistoryState('A');
    vi.advanceTimersByTime(2000);
    expect(store.getItem(AUTOSAVE_STORAGE_KEY)).toBeNull();
  });

  it('se replie sans heightmap/foliage quand le quota est dépassé', () => {
    const h = harness(); const { history, store } = h;
    // La scène contient un terrain volumineux.
    const fat = makeScene(1, '2026-01-01T00:09:00.000Z');
    (fat as unknown as { terrain: unknown }).terrain = {
      heightmap: [1, 2, 3],
      foliageLayers: [{ id: 'f1' }],
    };
    (history as unknown as { scene: { exportScene: () => unknown } }).scene.exportScene = () => fat;

    // Le PREMIER setItem échoue (quota) ; le second passe.
    let calls = 0;
    const realSet = store.setItem.bind(store);
    store.setItem = (k: string, v: string) => {
      if (calls++ === 0) throw quotaError();
      realSet(k, v);
    };

    history.persistSceneNow();

    const info = history.getAutosaveInfo();
    expect(info.error).toBeNull();
    expect(info.degraded).toBe(true);
    const saved = JSON.parse(store.getItem(AUTOSAVE_STORAGE_KEY) as string);
    expect(saved.terrain.heightmap).toEqual([]);
    expect(saved.terrain.foliageLayers).toEqual([]);
  });

  it('signale une erreur quand même le repli échoue', () => {
    const h = harness(); const { history, store } = h;
    // Les DEUX écritures échouent : le repli est impossible aussi.
    store.throwOnSet = quotaError();
    history.persistSceneNow();
    expect(history.getAutosaveInfo().error).toMatch(/saturé/i);
  });

  it('clearAutosave réinitialise l’état visible', () => {
    const h = harness(); const { history } = h;
    history.saveHistoryState('A');
    vi.advanceTimersByTime(1000);
    history.clearAutosave();
    const info = history.getAutosaveInfo();
    expect(info.savedAt).toBeNull();
    expect(info.pending).toBe(false);
    expect(info.degraded).toBe(false);
  });

  it('runWithoutAutosave empêche l’écriture', () => {
    const h = harness(); const { history, store } = h;
    history.runWithoutAutosave(() => history.persistSceneNow());
    expect(store.getItem(AUTOSAVE_STORAGE_KEY)).toBeNull();
  });
});

describe('HistoryManager — sauvegardes horodatées', () => {
  it('crée un slot et le liste', () => {
    const h = harness(); const { history } = h;
    history.saveHistoryState('A');
    const key = history.backupNow();
    expect(key).toMatch(/^aether\.backup\./);
    expect(history.listBackups().map((b) => b.key)).toContain(key);
  });

  it('restaure un slot et empile un état d’historique', () => {
    const h = harness(); const { history, imports } = h;
    history.saveHistoryState('Avant');
    const key = history.backupNow();
    h.current = { nodes: 42, timestamp: '2026-01-01T00:10:00.000Z' };
    history.saveHistoryState('Apres');

    expect(history.restoreBackup(key)).toBe(true);
    // Le snapshot restauré contient bien l'état sauvegardé (1 nœud).
    expect((imports[imports.length - 1].nodes as unknown[]).length).toBe(1);
    // Avant restauration : 2 entrées (Avant, Apres). La restauration en
    // ajoute une (état restauré) → 3.
    expect(history.undoDepth).toBe(3);
    // Et elle est bien annulable.
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toBe(DEFAULT_HISTORY_LABEL);
  });

  it('renvoie false sur une clé absente', () => {
    const h = harness(); const { history } = h;
    expect(history.restoreBackup('aether.backup.inexistant')).toBe(false);
  });

  it('supprime un slot', () => {
    const h = harness(); const { history } = h;
    const key = history.backupNow();
    history.deleteBackup(key);
    expect(history.listBackups().map((b) => b.key)).not.toContain(key);
  });

  it('plafonne les slots et garde les plus récents', () => {
    const h = harness(); const { history } = h;
    // Les clés sont horodatées à la milliseconde : on avance l'horloge entre
    // chaque sauvegarde, sinon la purge « garde les plus récents » est ambiguë.
    let t = Date.parse('2026-01-01T00:00:00.000Z');
    const keys: string[] = [];
    for (let i = 0; i < 8; i++) {
      vi.setSystemTime(t);
      h.current = { nodes: i, timestamp: new Date(t).toISOString() };
      keys.push(history.backupNow());
      t += 60_000; // +1 min : garantit un tri stable et distinct
    }
    const listed = history.listBackups();
    expect(listed.length).toBe(5);
    // Les plus récents sont conservés, les plus anciens purgés.
    expect(listed[0].key).toBe(keys[keys.length - 1]);
    expect(listed.map((b) => b.key)).not.toContain(keys[0]);
  });
});
