/**
 * navigation — cartographie « façon Blender » du viewport 3D.
 * =========================================================================
 * Volontairement *pur* et sans dépendance (voir `tests/navigation.test.ts`) :
 *
 *   - la souris : molette = orbite, Maj = pan, Ctrl = zoom ; le clic gauche
 *     reste réservé aux outils (sélection, gizmo, sculpt) et le clic droit au
 *     menu contextuel, exactement comme dans le viewport Blender ;
 *   - les raccourcis : pavé numérique pour les vues, `Home` pour cadrer la
 *     scène, `Num .` pour cadrer la sélection.
 *
 * OrbitControls ne lit pas les modificateurs : on remappe `mouseButtons` à
 * chaque appui (voir `CameraManager.attachControls`).
 */

/** Action de navigation produite par un appui souris. */
export type NavAction = 'orbit' | 'pan' | 'zoom' | 'none';

/** Sous-ensemble des `KeyboardEvent` nécessaires au calcul. */
export interface NavPointerState {
  /** 0 = gauche, 1 = molette, 2 = droit. */
  button: number;
  /** `PointerEvent.pointerType` : 'mouse' | 'touch' | 'pen'. */
  pointerType?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const MOUSE_LEFT = 0;
const MOUSE_MIDDLE = 1;

/**
 * Le modificateur « zoom » est Ctrl hors macOS et Cmd (meta) sur macOS :
 * le navigateur réserve Ctrl+molette au zoom de page, pas Cmd.
 */
function isZoomModifier(s: NavPointerState): boolean {
  return s.ctrlKey || s.metaKey;
}

/**
 * Traduit un appui souris en action de navigation Blender.
 *
 * Molette-milieu : `orbit` | `pan` (Maj) | `zoom` (Ctrl/Cmd).
 * Clic gauche : uniquement avec Alt, en repli du « emulate 3 button mouse »
 * de Blender (utile sur trackpad et souris 2 boutons).
 * Clic droit : jamais — il ouvre le menu contextuel.
 * Tactile / stylet : jamais — OrbitControls garde sa cartographie standard
 * (1 doigt = orbite, 2 doigts = zoom/pan), Blender n'a pas d'équivalent.
 */
export function resolveNavAction(s: NavPointerState): NavAction {
  if (s.pointerType && s.pointerType !== 'mouse') return 'none';

  if (s.button === MOUSE_MIDDLE) {
    if (isZoomModifier(s)) return 'zoom';
    if (s.shiftKey) return 'pan';
    return 'orbit';
  }

  if (s.button === MOUSE_LEFT && s.altKey) {
    if (isZoomModifier(s)) return 'zoom';
    if (s.shiftKey) return 'pan';
    return 'orbit';
  }

  return 'none';
}

/** Vue atteignable au clavier (mêmes noms que `CameraViewPreset`). */
export type NavView = 'top' | 'bottom' | 'front' | 'back' | 'side' | 'right' | 'left' | 'iso';

/** Ce que produit une touche : une vue, un cadrage, ou rien. */
export type NavKeyAction = NavView | 'frameAll' | 'frameSelected' | 'none';

/** Sous-ensemble des `KeyboardEvent` nécessaires au calcul. */
export interface NavKeyState {
  /** `KeyboardEvent.code` (position physique, indépendant de la disposition). */
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Pavé numérique « Blender » : 1/3/7 pour Face/Droite/Dessus, Ctrl pour les
 * vues opposées. `Home` cadre la scène, `Num .` cadre la sélection — avec un
 * repli sur la touche `.` de la rangée principale, car beaucoup de portables
 * n'ont pas de pavé numérique.
 */
export function resolveViewKey(s: NavKeyState): NavKeyAction {
  const opposite = s.ctrlKey || s.metaKey;

  switch (s.code) {
    case 'Numpad1':
      return opposite ? 'back' : 'front';
    case 'Numpad3':
      return opposite ? 'left' : 'right';
    case 'Numpad7':
      return opposite ? 'bottom' : 'top';
    case 'NumpadDecimal':
    case 'Period':
      return 'frameSelected';
    case 'Home':
      return 'frameAll';
    default:
      return 'none';
  }
}

/** Une entrée de l'aide « Contrôles Éditeur 3D » affichée dans le viewport. */
export interface NavHelpRow {
  label: string;
  /** Rendu clavier, séparé par `+`. Vide = pas de raccourci. */
  keys: string;
}

/** Bloc « Navigation » de l'aide, dans l'ordre d'importance. */
export const NAV_HELP_ROWS: readonly NavHelpRow[] = [
  { label: 'Orbite (tournaround)', keys: 'Molette' },
  { label: 'Déplacer la vue', keys: 'Maj + Molette' },
  { label: 'Zoom', keys: 'Ctrl + Molette' },
  { label: 'Zoom (molette)', keys: 'Molette' },
  { label: 'Sans bouton du milieu', keys: 'Alt + Clic G' },
  { label: 'Cadrer la scène', keys: 'Home' },
  { label: 'Cadrer la sélection', keys: 'Num .' },
  { label: 'Vue Face / Arrière', keys: 'Num 1 / Ctrl+Num 1' },
  { label: 'Vue Droite / Gauche', keys: 'Num 3 / Ctrl+Num 3' },
  { label: 'Vue Dessus / Dessous', keys: 'Num 7 / Ctrl+Num 7' },
  { label: 'Menu contextuel', keys: 'Clic droit' },
] as const;
