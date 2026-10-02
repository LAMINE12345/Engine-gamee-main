import { describe, expect, it } from 'vitest';
import {
  NAV_HELP_ROWS,
  resolveNavAction,
  resolveViewKey,
  type NavPointerState,
} from '../lib/input/navigation';

/** Construit un état pointeur souris avec des défauts neutres. */
const mouse = (over: Partial<NavPointerState> = {}): NavPointerState => ({
  button: 1, // molette
  pointerType: 'mouse',
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...over,
});

describe('resolveNavAction — molette du milieu (Blender)', () => {
  it('orbite par défaut', () => {
    expect(resolveNavAction(mouse())).toBe('orbit');
  });

  it('Maj + molette déplace la vue (pan)', () => {
    expect(resolveNavAction(mouse({ shiftKey: true }))).toBe('pan');
  });

  it('Ctrl + molette zoome', () => {
    expect(resolveNavAction(mouse({ ctrlKey: true }))).toBe('zoom');
  });

  it('Cmd (macOS) + molette zoome aussi', () => {
    expect(resolveNavAction(mouse({ metaKey: true }))).toBe('zoom');
  });

  it('Ctrl l’emporte sur Maj (le zoom est prioritaire)', () => {
    expect(resolveNavAction(mouse({ shiftKey: true, ctrlKey: true }))).toBe('zoom');
  });
});

describe('resolveNavAction — clic gauche réservé aux outils', () => {
  it('ne navigue pas au clic gauche nu (sélection, gizmo, sculpt)', () => {
    expect(resolveNavAction(mouse({ button: 0 }))).toBe('none');
  });

  it('ne navigue pas au clic gauche + Maj', () => {
    expect(resolveNavAction(mouse({ button: 0, shiftKey: true }))).toBe('none');
  });

  it('Alt + clic gauche orbite (repli « emulate 3 button mouse »)', () => {
    expect(resolveNavAction(mouse({ button: 0, altKey: true }))).toBe('orbit');
    expect(resolveNavAction(mouse({ button: 0, altKey: true, shiftKey: true }))).toBe('pan');
    expect(resolveNavAction(mouse({ button: 0, altKey: true, ctrlKey: true }))).toBe('zoom');
  });
});

describe('resolveNavAction — autres périphériques', () => {
  it('le clic droit ne navigue plus (menu contextuel)', () => {
    expect(resolveNavAction(mouse({ button: 2 }))).toBe('none');
    expect(resolveNavAction(mouse({ button: 2, shiftKey: true }))).toBe('none');
    expect(resolveNavAction(mouse({ button: 2, altKey: true }))).toBe('none');
  });

  it('le tactile et le stylet gardent la cartographie OrbitControls', () => {
    expect(resolveNavAction(mouse({ pointerType: 'touch' }))).toBe('none');
    expect(resolveNavAction(mouse({ pointerType: 'pen' }))).toBe('none');
  });
});

describe('resolveViewKey — pavé numérique', () => {
  const key = (code: string, ctrlKey = false) => resolveViewKey({ code, ctrlKey, metaKey: false });

  it('vues directes', () => {
    expect(key('Numpad1')).toBe('front');
    expect(key('Numpad3')).toBe('right');
    expect(key('Numpad7')).toBe('top');
  });

  it('vues opposées avec Ctrl', () => {
    expect(key('Numpad1', true)).toBe('back');
    expect(key('Numpad3', true)).toBe('left');
    expect(key('Numpad7', true)).toBe('bottom');
  });

  it('Cmd vaut Ctrl (portables Mac)', () => {
    expect(resolveViewKey({ code: 'Numpad7', ctrlKey: false, metaKey: true })).toBe('bottom');
  });

  it('cadrage de la scène et de la sélection', () => {
    expect(key('Home')).toBe('frameAll');
    expect(key('NumpadDecimal')).toBe('frameSelected');
  });

  it('repli sur la touche . principale (portables sans pavé)', () => {
    expect(key('Period')).toBe('frameSelected');
  });

  it('ignore les touches sans effet', () => {
    expect(key('Numpad5')).toBe('none');
    expect(key('KeyG')).toBe('none');
    expect(key('End')).toBe('none');
  });
});

describe('NAV_HELP_ROWS', () => {
  it('documente le clic droit comme menu contextuel', () => {
    const row = NAV_HELP_ROWS.find((r) => r.label === 'Menu contextuel');
    expect(row?.keys).toBe('Clic droit');
  });

  it('a des libellés et des touches uniques', () => {
    expect(NAV_HELP_ROWS.length).toBeGreaterThan(5);
    expect(new Set(NAV_HELP_ROWS.map((r) => r.label)).size).toBe(NAV_HELP_ROWS.length);
    for (const row of NAV_HELP_ROWS) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.keys.length).toBeGreaterThan(0);
    }
  });
});
