/**
 * InputBindings — Dynamic keybinding core for the Aether 3D Engine.
 * =================================================================
 * - All gameplay actions are identified by stable ids (GameplayActionId).
 * - Physical keys are stored as `KeyboardEvent.code` values (layout-independent:
 *   KeyW = physical W position on QWERTY, Z position on AZERTY...). Defaults
 *   cover both AZERTY (ZQSD) and QWERTY (WASD) layouts.
 * - Persisted to localStorage + exportable/importable as a local JSON file.
 */

export type GameplayActionId =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'attack'
  | 'interact'
  | 'crouch'
  | 'wave';

export const GAMEPLAY_ACTIONS: GameplayActionId[] = [
  'forward',
  'backward',
  'left',
  'right',
  'jump',
  'sprint',
  'attack',
  'interact',
  'crouch',
  'wave',
];

export type ActionCategory = 'move' | 'gesture';

export const ACTION_META: Record<GameplayActionId, { label: string; category: ActionCategory }> = {
  forward: { label: 'Avancer', category: 'move' },
  backward: { label: 'Reculer', category: 'move' },
  left: { label: 'Aller à gauche', category: 'move' },
  right: { label: 'Aller à droite', category: 'move' },
  jump: { label: 'Sauter', category: 'move' },
  sprint: { label: 'Sprinter', category: 'move' },
  attack: { label: 'Attaque (geste)', category: 'gesture' },
  interact: { label: 'Interagir (geste)', category: 'gesture' },
  crouch: { label: "S'accroupir (maintenir)", category: 'gesture' },
  wave: { label: 'Saluer / Emote (geste)', category: 'gesture' },
};

export interface MouseLookSettings {
  enabled: boolean;
  /** 0.5 (lent) → 10 (très rapide). 2.5 = défaut. */
  sensitivity: number;
  invert: boolean;
}

export interface InputConfig {
  version: 1;
  bindings: Record<GameplayActionId, string[]>;
  mouse: MouseLookSettings;
}

export const DEFAULT_INPUT_CONFIG: InputConfig = {
  version: 1,
  bindings: {
    forward: ['KeyW', 'KeyZ', 'ArrowUp'],
    backward: ['KeyS', 'ArrowDown'],
    left: ['KeyQ', 'KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    attack: ['KeyE'],
    interact: ['KeyF'],
    crouch: ['KeyC'],
    wave: ['KeyV'],
  },
  mouse: {
    enabled: false,
    sensitivity: 2.5,
    invert: false,
  },
};

export const INPUT_STORAGE_KEY = 'aether.input.config.v1';

/** Codes that must never become gameplay bindings (browser / UI reserved). */
export const BLOCKED_CODES: Record<string, string> = {
  Tab: 'Tab est réservée à la navigation UI.',
  F5: 'F5 est réservée au navigateur (rechargement).',
  F11: 'F11 est réservée au navigateur (plein écran).',
  F12: 'F12 est réservée aux outils développeur.',
};

/** Deep clone of a config (safe to mutate the result). */
export function cloneInputConfig(cfg: InputConfig): InputConfig {
  return {
    version: 1,
    bindings: Object.fromEntries(
      GAMEPLAY_ACTIONS.map((a) => [a, [...(cfg.bindings[a] || [])]])
    ) as Record<GameplayActionId, string[]>,
    mouse: { ...cfg.mouse },
  };
}

/** Merge a partial/stored object over defaults (forward-compatible validation). */
export function normalizeInputConfig(raw: unknown): InputConfig {
  const base = cloneInputConfig(DEFAULT_INPUT_CONFIG);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<InputConfig>;
  if (r.bindings && typeof r.bindings === 'object') {
    for (const action of GAMEPLAY_ACTIONS) {
      const codes = (r.bindings as Record<string, unknown>)[action];
      if (Array.isArray(codes)) {
        const clean = codes.filter((c): c is string => typeof c === 'string' && c.length > 0);
        if (clean.length > 0) base.bindings[action] = [...new Set(clean)];
      }
    }
  }
  if (r.mouse && typeof r.mouse === 'object') {
    const m = r.mouse as Partial<MouseLookSettings>;
    if (typeof m.enabled === 'boolean') base.mouse.enabled = m.enabled;
    if (typeof m.sensitivity === 'number' && Number.isFinite(m.sensitivity)) {
      base.mouse.sensitivity = Math.min(10, Math.max(0.5, m.sensitivity));
    }
    if (typeof m.invert === 'boolean') base.mouse.invert = m.invert;
  }
  return base;
}

export function loadInputConfig(): InputConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return cloneInputConfig(DEFAULT_INPUT_CONFIG);
  }
  try {
    const raw = window.localStorage.getItem(INPUT_STORAGE_KEY);
    if (!raw) return cloneInputConfig(DEFAULT_INPUT_CONFIG);
    return normalizeInputConfig(JSON.parse(raw));
  } catch {
    return cloneInputConfig(DEFAULT_INPUT_CONFIG);
  }
}

export function saveInputConfig(cfg: InputConfig): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(INPUT_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Stockage indisponible (quota, navigation privée) : on ignore silencieusement.
  }
}

/** All actions (except `except`) currently using `code`. */
export function findConflicts(
  bindings: Record<GameplayActionId, string[]>,
  code: string,
  except?: GameplayActionId
): GameplayActionId[] {
  return GAMEPLAY_ACTIONS.filter((a) => a !== except && (bindings[a] || []).includes(code));
}

/** French-friendly label for a KeyboardEvent.code. */
export function codeLabel(code: string): string {
  if (code === 'Space') return 'Espace';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const named: Record<string, string> = {
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Enter: 'Entrée',
    Escape: 'Échap',
    CapsLock: 'Verr Maj',
  };
  return named[code] || code;
}
