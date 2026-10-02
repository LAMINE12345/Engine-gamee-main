/**
 * inputLogic — logique pure d'entrée clavier et de déplacement relatif.
 *
 * Aucun accès au DOM ni à three.js. Ce module est partagé entre l'éditeur de
 * graphe (libellés de touches, capture au clavier) et le runtime
 * (LogicExecutor), et se teste donc sans navigateur.
 */

// ==========================================
// 1. NORMALISATION DES TOUCHES
// ==========================================

/**
 * `KeyboardEvent.code` est le code PHYSIQUE de la touche : `KeyW` désigne la
 * touche W du QWERTY, qui affiche Z sur un clavier AZERTY. C'est le bon
 * niveau pour lier une touche, car il ne bouge pas quand l'utilisateur
 * change de disposition. Chaque entrée regroupe les codes qui doivent
 * déclencher la même action (par exemple Shift gauche et droit).
 */
const CODE_GROUPS: Record<string, string[]> = {
  Space: ['Space'],
  Enter: ['Enter', 'NumpadEnter'],
  NumpadEnter: ['Enter', 'NumpadEnter'],
  Escape: ['Escape'],
  Tab: ['Tab'],
  Backspace: ['Backspace'],
  CapsLock: ['CapsLock'],
  Delete: ['Delete'],
  Insert: ['Insert'],
  Home: ['Home'],
  End: ['End'],
  PageUp: ['PageUp'],
  PageDown: ['PageDown'],
  ArrowUp: ['ArrowUp'],
  ArrowDown: ['ArrowDown'],
  ArrowLeft: ['ArrowLeft'],
  ArrowRight: ['ArrowRight'],
  ShiftLeft: ['ShiftLeft', 'ShiftRight'],
  ShiftRight: ['ShiftRight', 'ShiftLeft'],
  ControlLeft: ['ControlLeft', 'ControlRight'],
  ControlRight: ['ControlRight', 'ControlLeft'],
  AltLeft: ['AltLeft', 'AltRight'],
  AltRight: ['AltRight', 'AltLeft'],
  MetaLeft: ['MetaLeft', 'MetaRight'],
  MetaRight: ['MetaRight', 'MetaLeft'],
  Minus: ['Minus', 'NumpadSubtract'],
  Equal: ['Equal', 'NumpadEqual'],
  Comma: ['Comma', 'NumpadComma'],
  Period: ['Period', 'NumpadDecimal'],
  Slash: ['Slash', 'NumpadDivide'],
  Semicolon: ['Semicolon'],
  Quote: ['Quote'],
  BracketLeft: ['BracketLeft'],
  BracketRight: ['BracketRight'],
  Backslash: ['Backslash'],
  Backquote: ['Backquote'],
};

/** Noms saisis à la main (FR ou EN) → code physique de référence. */
const NAME_TO_CODE: Record<string, string> = {
  espace: 'Space',
  space: 'Space',
  entree: 'Enter',
  enter: 'Enter',
  retour: 'Enter',
  echap: 'Escape',
  escape: 'Escape',
  esc: 'Escape',
  tabulation: 'Tab',
  tab: 'Tab',
  supr: 'Delete',
  delete: 'Delete',
  retourarriere: 'Backspace',
  backspace: 'Backspace',
  maj: 'ShiftLeft',
  shift: 'ShiftLeft',
  ctrl: 'ControlLeft',
  control: 'ControlLeft',
  alt: 'AltLeft',
  altgr: 'AltRight',
  cmd: 'MetaLeft',
  meta: 'MetaLeft',
  super: 'MetaLeft',
  windows: 'MetaLeft',
  haut: 'ArrowUp',
  up: 'ArrowUp',
  bas: 'ArrowDown',
  down: 'ArrowDown',
  gauche: 'ArrowLeft',
  left: 'ArrowLeft',
  droite: 'ArrowRight',
  right: 'ArrowRight',
  debut: 'Home',
  home: 'Home',
  fin: 'End',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const F_KEY_RE = /^f([1-9]|1[0-2])$/i;
const ANY_ALIASES = new Set(['', '*', 'any', 'all', 'toutes', 'nimporte', 'nimportequelle']);

export type KeyBindingKind = 'any' | 'code' | 'invalid';

export interface KeyBinding {
  kind: KeyBindingKind;
  /** Codes physiques acceptés. Vide lorsque `kind === 'any'`. */
  codes: string[];
  /** Libellé d'origine, conservé pour l'affichage dans l'éditeur. */
  raw: string;
}

/**
 * Traduit une saisie libre (« Espace », « KeyE », « 1 », « F5 », « * ») en
 * liaison exploitable. Une lettre seule désigne la touche physique de cette
 * position sur un QWERTY : « w » → KeyW, qui affiche Z en AZERTY.
 */
export function parseKeyBinding(raw: unknown): KeyBinding {
  const text = String(raw ?? '').trim();
  const lowered = text.toLowerCase();

  if (ANY_ALIASES.has(lowered)) {
    return { kind: 'any', codes: [], raw: text };
  }

  const direct = CODE_GROUPS[text];
  if (direct) return { kind: 'code', codes: [...direct], raw: text };

  const named = NAME_TO_CODE[lowered];
  if (named) return { kind: 'code', codes: [...CODE_GROUPS[named]], raw: text };

  // Lettre seule -> position physique sur QWERTY.
  if (/^[a-z]$/.test(lowered)) {
    const code = `Key${lowered.toUpperCase()}`;
    return { kind: 'code', codes: [code], raw: text };
  }

  // Chiffre seul : la rangée du haut ET le pavé numérique, mais surtout
  // PAS les touches de fonction (une liaison « 1 » ne doit pas tirer sur F1).
  if (/^[0-9]$/.test(lowered)) {
    return { kind: 'code', codes: [`Digit${lowered}`, `Numpad${lowered}`], raw: text };
  }

  if (F_KEY_RE.test(lowered)) {
    const code = lowered.toUpperCase();
    return { kind: 'code', codes: [code], raw: text };
  }

  // Code arbitraire déjà bien formé (utilisé par la capture au clavier).
  if (/^(Key|Digit|Numpad|F\d{1,2})[A-Za-z0-9]$/.test(text)) {
    return { kind: 'code', codes: [...(CODE_GROUPS[text] ?? [text])], raw: text };
  }

  return { kind: 'invalid', codes: [], raw: text };
}

/** Une liaison donnée correspond-elle à un code physique appuyé ? */
export function keyMatches(binding: KeyBinding, code: string): boolean {
  if (binding.kind === 'any') return true;
  if (binding.kind === 'invalid') return false;
  return binding.codes.includes(code);
}

/** Raccourci : teste directement une valeur de nœud contre un `event.code`. */
export function matchesKeyValue(raw: unknown, code: string): boolean {
  return keyMatches(parseKeyBinding(raw), code);
}

// ==========================================
// 2. AXE DE DÉPLACEMENT (avancer / reculer)
// ==========================================

/** Action combinée d'un touches avant/arrière et d'une touche latérale. */
export interface MoveAxisConfig {
  /** Touches qui font avancer (W, Z, flèche haut). */
  forward?: unknown;
  /** Touches qui font reculer (S, flèche bas). */
  back?: unknown;
  /** Touches latérales gauche (A, Q, flèche gauche). */
  left?: unknown;
  /** Touches latérales droites (D, flèche droite). */
  right?: unknown;
  /** Bouton de marche rapide (Maj). Vide = désactivé. */
  sprint?: unknown;
  /** Bouton de marche lente (Ctrl / C). Vide = désactivé. */
  slow?: unknown;
  /** Distance morte sous laquelle l'axe est considéré nul. */
  deadzone?: number;
}

export interface MoveAxis {
  /** -1 (reculer) → 0 (arrêt) → 1 (avancer), normalisé. */
  forward: number;
  /** -1 (gauche) → 0 → 1 (droite), normalisé. */
  right: number;
  /** Multiplicateur de sprint (1 par défaut). */
  sprint: number;
  /** Longueur du vecteur, 0 → 1 (1 = diagonale à pleine vitesse). */
  magnitude: number;
  /** Vrai si au moins une touche de déplacement est active. */
  moving: boolean;
}

const NEUTRAL_AXIS: MoveAxis = {
  forward: 0,
  right: 0,
  sprint: 1,
  magnitude: 0,
  moving: false,
};

/** Normalise un axe brut pour qu'une diagonale ne soit pas plus rapide. */
function normalizeAxis(x: number, y: number, deadzone: number): { x: number; y: number; mag: number } {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return { x: 0, y: 0, mag: 0 };
  const scale = Math.min(1, len);
  return { x: (x / len) * scale, y: (y / len) * scale, mag: scale };
}

/**
 * Traduit l'état du clavier en axe de déplacement. `isDown` est injecté pour
 * garder cette fonction pure et testable hors navigateur.
 */
export function readMoveAxis(config: MoveAxisConfig, isDown: (code: string) => boolean): MoveAxis {
  const fwd = parseKeyBinding(config.forward ?? 'KeyW');
  const back = parseKeyBinding(config.back ?? 'KeyS');
  const left = parseKeyBinding(config.left ?? 'KeyA');
  const right = parseKeyBinding(config.right ?? 'KeyD');
  const sprintKey = parseKeyBinding(config.sprint ?? 'ShiftLeft');
  const slowKey = parseKeyBinding(config.slow ?? '');

  const rawY =
    (fwd.kind !== 'invalid' && isDownAny(fwd, isDown) ? 1 : 0) -
    (back.kind !== 'invalid' && isDownAny(back, isDown) ? 1 : 0);
  const rawX =
    (right.kind !== 'invalid' && isDownAny(right, isDown) ? 1 : 0) -
    (left.kind !== 'invalid' && isDownAny(left, isDown) ? 1 : 0);

  const deadzone = clampNumber(config.deadzone, 0, 0.9, 0.15);
  const { x, y, mag } = normalizeAxis(rawX, rawY, deadzone);
  if (mag === 0) return { ...NEUTRAL_AXIS };

  const sprinting = sprintKey.kind === 'code' && isDownAny(sprintKey, isDown);
  const slowing = slowKey.kind === 'code' && isDownAny(slowKey, isDown);
  const sprint = sprinting ? 2 : slowing ? 0.5 : 1;

  return { forward: y, right: x, sprint, magnitude: mag, moving: true };
}

function isDownAny(binding: KeyBinding, isDown: (code: string) => boolean): boolean {
  if (binding.kind === 'any') return true;
  return binding.codes.some((c) => isDown(c));
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ==========================================
// 3. CIBLE : « soi-même » ou un objet nommé
// ==========================================

export type TargetRef =
  | { kind: 'self' }
  | { kind: 'id'; id: string }
  | { kind: 'name'; name: string };

/**
 * Une cible d'action. `'self'` ou vide = l'objet porteur du graphe ; un UUID
 * pointe un objet précis ; sinon c'est un nom d'objet de la scène.
 */
export function parseTargetRef(raw: unknown): TargetRef {
  const text = String(raw ?? '').trim();
  if (text === '' || text.toLowerCase() === 'self' || text.toLowerCase() === 'soi') {
    return { kind: 'self' };
  }
  if (UUID_RE.test(text)) return { kind: 'id', id: text };
  return { kind: 'name', name: text };
}

/** Correspondance d'un TargetRef (utilisé par les tests et l'UI). */
export function targetRefEquals(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'id' && b.kind === 'id') return a.id === b.id;
  if (a.kind === 'name' && b.kind === 'name') return a.name === b.name;
  return true;
}

// ==========================================
// 4. MOUVEMENT « AVANCER / RECULER »
// ==========================================

export type MoveMode =
  /** Le long de l'orientation de l'objet (tiers personne). */
  | 'self'
  /** Selon l'axe monde, sans rotation. */
  | 'world'
  /** Vers / à l'écart de la caméra du studio. */
  | 'camera';

export interface MoveRequest {
  /** -1 recule, 0 immobile, +1 avance. Absent = 0. */
  forward?: number;
  /** -1 à gauche, 0, +1 à droite. Absent = 0. */
  right?: number;
  /** Rotation Y courante de l'objet (radians). */
  heading: number;
  /** Vitesse de base (unités/seconde). */
  speed: number;
  /** Pas de temps de la frame. */
  dt: number;
  /** Repère de déplacement. */
  mode: MoveMode;
  /** Rotation Y de la caméra, pour le mode 'camera'. */
  cameraHeading?: number;
  /** Verrouille la rotation Y de l'objet sur son cap (mode 'self'). */
  faceHeading?: boolean;
  /** Plafond de vitesse diagonale. */
  maxSpeed?: number;
}

export interface MoveResult {
  /** Déplacement horizontal à appliquer, en unités monde. */
  dx: number;
  dz: number;
  /** Cap à appliquer (radians), ou null si l'objet ne doit pas pivoter. */
  heading: number | null;
  /** Vitesse scalaire réellement appliquée (pour les animations). */
  speed: number;
}

const NO_MOVE: MoveResult = { dx: 0, dz: 0, heading: null, speed: 0 };

/**
 * Calcule le déplacement d'un frame. La diagonale est normalisée pour que
 * marcher en avant et à gauche ne soit pas ~41 % plus rapide qu'avancer seul —
 * c'est le bug le plus courant des contrôleurs clavier maison.
 */
export function computeMove(req: MoveRequest): MoveResult {
  const fwd = clampNumber(req.forward, -1, 1, 0);
  const strafe = clampNumber(req.right, -1, 1, 0);
  if (fwd === 0 && strafe === 0) return { ...NO_MOVE };

  // Le repère détermine le cap de référence :
  // - 'self'   : l'orientation de l'objet (tiers personne)
  // - 'camera' : ce que l'utilisateur voit à l'écran
  // - 'world'  : axes fixes, l'orientation de l'objet est IGNORÉE
  const heading =
    req.mode === 'self' ? req.heading : req.mode === 'camera' ? req.cameraHeading ?? 0 : 0;
  const len = Math.hypot(fwd, strafe);
  const scale = len > 1 ? 1 / len : 1;
  const speed = clampNumber(req.speed, 0, 1e4, 0) * scale;
  const dt = Math.max(0, Number(req.dt) || 0);
  const maxSpeed = req.maxSpeed ?? Infinity;

  // three.js : +Z est l'arrière d'un objet, on avance donc vers -Z.
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  const forwardX = -sinH;
  const forwardZ = -cosH;
  const rightX = cosH;
  const rightZ = -sinH;

  let dx = (forwardX * fwd + rightX * strafe) * speed * dt;
  let dz = (forwardZ * fwd + rightZ * strafe) * speed * dt;

  if (maxSpeed !== Infinity) {
    const mag = Math.hypot(dx, dz);
    if (mag > maxSpeed) {
      const k = maxSpeed / mag;
      dx *= k;
      dz *= k;
    }
  }

  // -0 === 0 est vrai pour `===` mais faux pour `Object.is` : sans cette
  // normalisation, un appelant comparant le résultat à 0 « à l'identique »
  // (JSON round-trip, snapshots de test) croirait que l'objet a bougé.
  if (dx === 0) dx = 0;
  if (dz === 0) dz = 0;

  let newHeading: number | null = null;
  if (req.mode === 'self' && req.faceHeading && fwd !== 0) {
    newHeading = Math.atan2(-dx, -dz);
  }

  return { dx, dz, heading: newHeading, speed: Math.hypot(dx, dz) / (dt || 1) };
}

// ==========================================
// 5. CATALOGUE DE TOUCHES (pour l'éditeur)
// ==========================================

export interface KeyOption {
  /** Valeur enregistrée dans le nœud. */
  value: string;
  /** Libellé affiché. */
  label: string;
  group: string;
}

/**
 * Touches proposées dans le sélecteur. Le libellé rappelle l'autre
 * disposition quand AZERTY et QWERTY divergent, car `KeyW` se lit « Z » en
 * AZERTY et beaucoup d'utilisateurs s'attendent à voir les deux.
 */
export const KEY_OPTIONS: KeyOption[] = [
  { value: 'Space', label: 'Espace', group: 'Action' },
  { value: 'Enter', label: 'Entrée', group: 'Action' },
  { value: 'KeyE', label: 'E', group: 'Action' },
  { value: 'KeyF', label: 'F (interagir)', group: 'Action' },
  { value: 'KeyR', label: 'R (recharger)', group: 'Action' },
  { value: 'KeyQ', label: 'Q', group: 'Action' },
  { value: 'Escape', label: 'Échap', group: 'Action' },
  { value: 'Tab', label: 'Tabulation', group: 'Action' },

  { value: 'KeyW', label: 'Avancer — W (Z en AZERTY)', group: 'Déplacement' },
  { value: 'KeyS', label: 'Reculer — S', group: 'Déplacement' },
  { value: 'KeyA', label: 'Gauche — A (Q en AZERTY)', group: 'Déplacement' },
  { value: 'KeyD', label: 'Droite — D', group: 'Déplacement' },
  { value: 'ArrowUp', label: 'Flèche haut', group: 'Déplacement' },
  { value: 'ArrowDown', label: 'Flèche bas', group: 'Déplacement' },
  { value: 'ArrowLeft', label: 'Flèche gauche', group: 'Déplacement' },
  { value: 'ArrowRight', label: 'Flèche droite', group: 'Déplacement' },

  { value: 'ShiftLeft', label: 'Maj gauche (sprint)', group: 'Modificateur' },
  { value: 'ShiftRight', label: 'Maj droite', group: 'Modificateur' },
  { value: 'ControlLeft', label: 'Ctrl gauche (ralenti)', group: 'Modificateur' },
  { value: 'AltLeft', label: 'Alt gauche', group: 'Modificateur' },

  { value: 'Digit1', label: '1', group: 'Chiffre' },
  { value: 'Digit2', label: '2', group: 'Chiffre' },
  { value: 'Digit3', label: '3', group: 'Chiffre' },
  { value: 'Digit4', label: '4', group: 'Chiffre' },
  { value: 'Digit5', label: '5', group: 'Chiffre' },
  { value: 'KeyX', label: 'X', group: 'Chiffre' },
  { value: 'KeyC', label: 'C', group: 'Chiffre' },
  { value: 'KeyV', label: 'V', group: 'Chiffre' },

  { value: '*', label: 'N’importe quelle touche', group: 'Spécial' },
];

/** Libellé lisible d'une touche (pour l'affichage dans le nœud). */
export function describeKey(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (text === '') return 'Aucune';
  const hit = KEY_OPTIONS.find((o) => o.value === text || o.value.toLowerCase() === text.toLowerCase());
  if (hit) return hit.label;
  if (KEY_OPTIONS.some((o) => parseKeyBinding(o.value).codes.includes(text))) return text;
  return text;
}

/** Liste les groupes de touches pour un <optgroup> (ordre stable). */
export function keyOptionGroups(): string[] {
  const groups: string[] = [];
  for (const opt of KEY_OPTIONS) if (!groups.includes(opt.group)) groups.push(opt.group);
  return groups;
}


