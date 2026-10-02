import type { UIScreen } from '../../types/hud';

const uid = (p: string): string => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Écrans starter (pause / game over / menu) prêts à jouer. */
export function buildUIStarterPreset(kind: 'pause' | 'gameover' | 'mainmenu'): UIScreen {
  const root = {
    id: uid('n'),
    type: 'container' as const,
    name: 'Racine',
    anchor: 'fullscreen' as const,
    style: {
      flexDirection: 'column' as const,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      gap: 10,
      padding: 24,
    },
    children: [] as UIScreen['root']['children'],
  };
  if (kind === 'pause') {
    return {
      id: `screen_pause_${Date.now().toString(36)}`,
      name: 'Menu Pause',
      visibleOnPlay: false,
      showTransition: 'scale',
      hideTransition: 'fade',
      transitionDuration: 0.25,
      modal: true,
      dimColor: 'rgba(0,0,0,0.55)',
      root: {
        ...root,
        children: [
          {
            id: uid('n'), type: 'text', name: 'Titre', text: 'PAUSE', intro: 'slide-down',
            style: { fontSize: 44, color: '#ffffff', textAlign: 'center', shadowColor: 'rgba(0,0,0,0.6)', shadowBlur: 12 },
          },
          {
            id: uid('n'), type: 'button', name: 'Bouton Reprendre', text: 'Reprendre', intro: 'slide-up', introDelay: 0.08,
            style: { fontSize: 17, color: '#ffffff', background: '#0284c7', hoverBackground: '#0369a1', borderRadius: 12, padding: 12, width: 220 },
            action: { kind: 'resume' },
          },
          {
            id: uid('n'), type: 'button', name: 'Bouton Recommencer', text: 'Recommencer', intro: 'slide-up', introDelay: 0.16,
            style: { fontSize: 17, color: '#e2e8f0', background: '#27272a', hoverBackground: '#3f3f46', borderRadius: 12, padding: 12, width: 220 },
            action: { kind: 'restart' },
          },
        ],
      },
    };
  }
  if (kind === 'gameover') {
    return {
      id: `screen_over_${Date.now().toString(36)}`,
      name: 'Game Over',
      visibleOnPlay: false,
      showTransition: 'fade',
      hideTransition: 'fade',
      transitionDuration: 0.4,
      modal: true,
      dimColor: 'rgba(60,0,0,0.6)',
      root: {
        ...root,
        children: [
          {
            id: uid('n'), type: 'text', name: 'Titre', text: 'PARTIE TERMINÉE', intro: 'scale',
            style: { fontSize: 40, color: '#fca5a5', textAlign: 'center' },
          },
          {
            id: uid('n'), type: 'text', name: 'Score', text: 'Score : {Score}', intro: 'fade', introDelay: 0.15,
            style: { fontSize: 22, color: '#ffffff', textAlign: 'center' },
          },
          {
            id: uid('n'), type: 'button', name: 'Bouton Rejouer', text: 'Rejouer', intro: 'slide-up', introDelay: 0.25,
            style: { fontSize: 17, color: '#ffffff', background: '#dc2626', hoverBackground: '#b91c1c', borderRadius: 12, padding: 12, width: 220 },
            action: { kind: 'restart' },
          },
        ],
      },
    };
  }
  return {
    id: `screen_menu_${Date.now().toString(36)}`,
    name: 'Menu Principal',
    visibleOnPlay: true,
    showTransition: 'fade',
    hideTransition: 'fade',
    transitionDuration: 0.3,
    modal: true,
    dimColor: 'rgba(0,0,0,0.45)',
    root: {
      ...root,
      children: [
        {
          id: uid('n'), type: 'text', name: 'Titre', text: 'MON JEU', intro: 'slide-down',
          style: { fontSize: 52, color: '#ffffff', textAlign: 'center', shadowColor: 'rgba(0,0,0,0.6)', shadowBlur: 14 },
        },
        {
          id: uid('n'), type: 'button', name: 'Bouton Jouer', text: '▶  Jouer', intro: 'scale', introDelay: 0.15,
          style: { fontSize: 20, color: '#ffffff', background: '#16a34a', hoverBackground: '#15803d', borderRadius: 14, padding: 14, width: 240 },
          action: { kind: 'hide' },
        },
      ],
    },
  };
}
