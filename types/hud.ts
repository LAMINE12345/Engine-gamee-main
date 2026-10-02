export type HUDElementType =
  | 'health_bar'
  | 'score_counter'
  | 'coin_counter'
  | 'crosshair'
  | 'timer'
  | 'message_toast'
  | 'pause_menu'
  | 'button_action'
  | 'performance_stats'
  | 'compass'
  | 'minimap';

export type HUDAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'center';

export interface HUDElement {
  id: string;
  type: HUDElementType;
  name: string;
  visible: boolean;
  anchor: HUDAnchor;
  offsetX: number; // in pixels
  offsetY: number; // in pixels
  width?: number;
  height?: number;
  boundVariable?: string; // e.g. 'Health', 'Score', 'Coins', 'Timer'
  label?: string;
  icon?: string;
  colorScheme?: string; // hex or preset
  maxValue?: number;
  showPercent?: boolean;
  style?: {
    fontSize?: number;
    backgroundColor?: string;
    borderColor?: string;
    borderRadius?: number;
    opacity?: number;
  };
}

export interface HUDConfig {
  enabled: boolean;
  showInEditor: boolean;
  elements: HUDElement[];
  variables: Record<string, number | string | boolean>;
  /** 4.4 : écrans UI moteur (menus in-game rendus WebGL). */
  screens: UIScreen[];
}

export const DEFAULT_HUD_CONFIG: HUDConfig = {
  enabled: false,
  showInEditor: false,
  variables: {
    Health: 100,
    MaxHealth: 100,
    Score: 0,
    Coins: 0,
    Timer: 0,
    Lives: 3,
  },
  elements: [],
  screens: [],
};

// =========================================================================
// 4.4 — UI Engine in-game : Canvas 2D, layout flexbox, texte HiDPI, tweens
// =========================================================================

/** Nœud d'arbre UI (Canvas 2D moteur, rendu WebGL overlay). */
export type UINodeType = 'container' | 'text' | 'button' | 'image' | 'bar' | 'spacer';

export type UIFlexDirection = 'row' | 'column';
export type UIJustify = 'start' | 'center' | 'end' | 'space-between' | 'space-around';
export type UIAlign = 'start' | 'center' | 'end' | 'stretch';
export type UIAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'fullscreen';

export interface UIStyle {
  flexDirection?: UIFlexDirection;
  justifyContent?: UIJustify;
  alignItems?: UIAlign;
  gap?: number;
  padding?: number;
  /** Largeur : px, % du parent, ou null = auto/contenu. */
  width?: number | string | null;
  height?: number | string | null;
  flexGrow?: number;
  background?: string | null;
  borderColor?: string | null;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  // Texte
  fontSize?: number;
  fontWeight?: string | number;
  fontFamily?: string;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  outlineColor?: string | null;
  outlineWidth?: number;
  shadowColor?: string | null;
  shadowBlur?: number;
  // Bouton
  hoverBackground?: string | null;
  pressedBackground?: string | null;
  hoverScale?: number;
}

export interface UINode {
  id: string;
  type: UINodeType;
  name: string;
  visible?: boolean;
  style?: UIStyle;
  /** Ancre écran (racine) ou absolu dans le parent. */
  anchor?: UIAnchor;
  offsetX?: number;
  offsetY?: number;
  /** Texte (supporte `{Variable}`), label bouton, URL image, valeur barre. */
  text?: string;
  /** Variable liée (barre 0-1 via max, texte via {Nom}). */
  boundVariable?: string;
  maxValue?: number;
  imageUrl?: string;
  /** Animation d'intro (jouée à l'affichage de l'écran). */
  intro?: UITransitionKind | null;
  introDelay?: number;
  /** Action bouton. */
  action?: UIAction | null;
  children?: UINode[];
}

export type UITransitionKind = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'scale' | 'slide-left' | 'slide-right';

export type UIAction =
  | { kind: 'show'; screen: string; transition?: UITransitionKind }
  | { kind: 'hide'; screen?: string; transition?: UITransitionKind }
  | { kind: 'toggle'; screen: string }
  | { kind: 'setVar'; name: string; value: number | string | boolean }
  | { kind: 'addVar'; name: string; delta: number }
  | { kind: 'resume' }
  | { kind: 'restart' }
  | { kind: 'custom'; event: string };

export interface UIScreen {
  id: string;
  name: string;
  /** Visible au démarrage du Play. */
  visibleOnPlay: boolean;
  showTransition: UITransitionKind;
  hideTransition: UITransitionKind;
  transitionDuration: number;
  /** Bloque les inputs scène quand visible (menu modal). */
  modal: boolean;
  /** Couleur de voile plein écran (null = transparent). */
  dimColor?: string | null;
  root: UINode;
}

export type UITweenEase =
  | 'linear'
  | 'easeOut'
  | 'easeIn'
  | 'easeInOut'
  | 'backOut'
  | 'bounceOut'
  | 'elasticOut';

export function defaultUIScreen(name: string): UIScreen {
  return {
    id: `screen_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    name,
    visibleOnPlay: false,
    showTransition: 'fade',
    hideTransition: 'fade',
    transitionDuration: 0.25,
    modal: true,
    dimColor: 'rgba(0,0,0,0.55)',
    root: {
      id: `node_${Date.now().toString(36)}`,
      type: 'container',
      name: 'Racine',
      anchor: 'fullscreen',
      style: {
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: 24,
      },
      children: [],
    },
  };
}
