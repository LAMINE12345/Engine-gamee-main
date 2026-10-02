import { describe, it, expect } from 'vitest';
import {
  parseKeyBinding,
  keyMatches,
  matchesKeyValue,
  readMoveAxis,
  computeMove,
  parseTargetRef,
  targetRefEquals,
  describeKey,
  keyOptionGroups,
  KEY_OPTIONS,
} from '../lib/logic/inputLogic';

// ---------------------------------------------------------------------------
// Liaison de touche — le moteur compare des `KeyboardEvent.code` (physiques).
// ---------------------------------------------------------------------------

describe('parseKeyBinding — codes et disposition', () => {
  it('accepte un code standard tel quel', () => {
    expect(parseKeyBinding('KeyW').codes).toEqual(['KeyW']);
    expect(parseKeyBinding('ArrowUp').codes).toEqual(['ArrowUp']);
  });

  it('traduit les noms saisis en toutes lettres', () => {
    expect(parseKeyBinding('espace').codes).toEqual(['Space']);
    expect(parseKeyBinding('Espace').codes).toEqual(['Space']);
    expect(parseKeyBinding('ENTREE').codes).toContain('Enter');
    expect(parseKeyBinding('echap').codes).toEqual(['Escape']);
    expect(parseKeyBinding('haut').codes).toEqual(['ArrowUp']);
  });

  it('interprète une lettre seule comme position QWERTY (indépendant de la disposition)', () => {
    // L'utilisateur tape « w » sur un AZERTY : on veut la touche physique W,
    // pas la lettre affichée. C'est ce qui rend la liaison stable entre clavier.
    expect(parseKeyBinding('w').codes).toEqual(['KeyW']);
    expect(parseKeyBinding('z').codes).toEqual(['KeyZ']);
    expect(parseKeyBinding('A').codes).toEqual(['KeyA']);
  });

  it('regroupe les deux variantes d\'une touchemodifiable', () => {
    expect(parseKeyBinding('ShiftLeft').codes).toEqual(['ShiftLeft', 'ShiftRight']);
    expect(parseKeyBinding('ControlRight').codes).toEqual(['ControlRight', 'ControlLeft']);
    expect(parseKeyBinding('Enter').codes).toEqual(['Enter', 'NumpadEnter']);
  });

  it('fait tirer un chiffre sur la rangée du haut ET le pavé numérique', () => {
    expect(parseKeyBinding('1').codes).toEqual(['Digit1', 'Numpad1']);
  });

  it('ne confond PAS un chiffre avec une touche de fonction', () => {
    // Régression : une liaison « 1 » ne doit pas répondre sur F1.
    const one = parseKeyBinding('1');
    expect(keyMatches(one, 'F1')).toBe(false);
    expect(keyMatches(one, 'Digit1')).toBe(true);
    expect(keyMatches(parseKeyBinding('f1'), 'F1')).toBe(true);
    expect(keyMatches(parseKeyBinding('f1'), 'Digit1')).toBe(false);
  });

  it('traite « n\'importe quelle touche » comme un joker', () => {
    for (const raw of ['*', '', 'any', 'toutes']) {
      const b = parseKeyBinding(raw);
      expect(b.kind, raw).toBe('any');
      expect(keyMatches(b, 'KeyZ'), raw).toBe(true);
      expect(keyMatches(b, 'F7'), raw).toBe(true);
    }
  });

  it('rejette une saisie incompréhensible au lieu de tout déclencher', () => {
    // Une liaison illisible ne doit surtout pas devenir un joker silencieux.
    const b = parseKeyBinding('pas une touche');
    expect(b.kind).toBe('invalid');
    expect(keyMatches(b, 'KeyA')).toBe(false);
  });
});

describe('matchesKeyValue — pas de correspondance par sous-chaîne', () => {
  it('« E » ne se déclenche pas sur Escape', () => {
    // Régression : l'ancien test `keyCode.includes(node.values.key)` faisait
    // tirer un nœud « E » sur Escape, car 'Escape'.includes('E') est vrai.
    expect(matchesKeyValue('KeyE', 'Escape')).toBe(false);
    expect(matchesKeyValue('KeyE', 'KeyE')).toBe(true);
  });

  it('« S » ne se déclenche pas sur Shift', () => {
    expect(matchesKeyValue('KeyS', 'ShiftLeft')).toBe(false);
    expect(matchesKeyValue('KeyS', 'KeyS')).toBe(true);
  });

  it('couvre les deux Maj avec une seule liaison', () => {
    expect(matchesKeyValue('ShiftLeft', 'ShiftRight')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lecture de l'axe clavier
// ---------------------------------------------------------------------------

/** Fabrique un test d'enfoncé à partir d'une liste de codes. */
const down = (...codes: string[]) => {
  const set = new Set(codes);
  return (code: string) => set.has(code);
};

describe('readMoveAxis — avancer / reculer', () => {
  const def = {} as const;

  it('est neutre au repos', () => {
    const axis = readMoveAxis(def, down());
    expect(axis.forward).toBe(0);
    expect(axis.right).toBe(0);
    expect(axis.moving).toBe(false);
    expect(axis.magnitude).toBe(0);
  });

  it('donne +1 en avant et -1 en arrière avec les liaisons par défaut', () => {
    expect(readMoveAxis(def, down('KeyW')).forward).toBe(1);
    expect(readMoveAxis(def, down('KeyS')).forward).toBe(-1);
  });

  it('n\'avance PAS sur une flèche si le nœud est laissé par défaut', () => {
    // Le défaut est KeyW/KeyS (ZQSD). Les flèches ne répondent qu'une fois
    // affectées explicitement : sinon un jeu au ZQSD déclencherait par surprise.
    expect(readMoveAxis(def, down('ArrowUp')).forward).toBe(0);
  });

  it('donne +1 à droite et -1 à gauche', () => {
    expect(readMoveAxis(def, down('KeyD')).right).toBe(1);
    expect(readMoveAxis(def, down('KeyA')).right).toBe(-1);
  });

  it('s\'annule quand deux touches opposées sont enfoncées ensemble', () => {
    const axis = readMoveAxis(def, down('KeyW', 'KeyS'));
    expect(axis.forward).toBe(0);
    expect(axis.moving).toBe(false);
  });

  it('normalise la diagonale (pas de bonus de vitesse)', () => {
    const diag = readMoveAxis(def, down('KeyW', 'KeyD'));
    // Diagonale : magnitude 1, chaque composante à 1/√2.
    expect(diag.magnitude).toBeCloseTo(1, 5);
    expect(Math.hypot(diag.forward, diag.right)).toBeCloseTo(1, 5);
    expect(diag.forward).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('double la vitesse en sprint et la réduit en marche lente', () => {
    expect(readMoveAxis(def, down('KeyW', 'ShiftLeft')).sprint).toBe(2);
    expect(readMoveAxis({ slow: 'ControlLeft' }, down('KeyW', 'ControlLeft')).sprint).toBe(0.5);
    expect(readMoveAxis(def, down('KeyW')).sprint).toBe(1);
  });

  it('accepte des touches personnalisées (flèches uniquement)', () => {
    const cfg = { forward: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    const axis = readMoveAxis(cfg, down('ArrowDown'));
    expect(axis.forward).toBe(-1);
    expect(readMoveAxis(cfg, down('ArrowRight')).right).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Calcul du déplacement
// ---------------------------------------------------------------------------

describe('computeMove — déplacement dans le monde', () => {
  const base = { heading: 0, speed: 5, dt: 0.1, mode: 'self' as const };

  it('ne bouge rien quand l\'axe est neutre', () => {
    const res = computeMove({ ...base, forward: 0, right: 0 });
    expect(res.dx).toBe(0);
    expect(res.dz).toBe(0);
    expect(res.speed).toBe(0);
    expect(res.heading).toBeNull();
  });

  it('avance vers -Z quand l\'objet regarde le monde devant lui', () => {
    // three.js : un objet non pivoté a son « devant » sur -Z.
    const res = computeMove({ ...base, forward: 1 });
    expect(res.dz).toBeCloseTo(-0.5, 6);
    expect(res.dx).toBeCloseTo(0, 6);
  });

  it('recule quand l\'axe avant est négatif', () => {
    const res = computeMove({ ...base, forward: -1 });
    expect(res.dz).toBeCloseTo(0.5, 6);
  });

  it('suit l\'orientation de l\'objet (mode self)', () => {
    // Cap à +90° : Ry(90°) appliqué à l'avant par défaut (0,0,-1) donne (-1,0,0),
    // c'est-à-dire -X. C'est vérifié, pas supposé.
    const res = computeMove({ ...base, heading: Math.PI / 2, forward: 1 });
    expect(res.dx).toBeCloseTo(-0.5, 6);
    expect(res.dz).toBeCloseTo(0, 6);
  });

  it('ignore l\'orientation de l\'objet en mode monde', () => {
    const res = computeMove({ ...base, heading: Math.PI / 2, forward: 1, mode: 'world' });
    expect(res.dz).toBeCloseTo(-0.5, 6);
    expect(res.dx).toBeCloseTo(0, 6);
  });

  it('suit la caméra en mode camera', () => {
    const res = computeMove({ ...base, heading: 0, forward: 1, mode: 'camera', cameraHeading: Math.PI / 2 });
    expect(res.dx).toBeCloseTo(-0.5, 6);
  });

  it('pivote l\'objet dans sa direction quand faceHeading est actif', () => {
    const res = computeMove({ ...base, forward: 1, faceHeading: true });
    expect(res.heading).not.toBeNull();
    expect(res.heading).toBeCloseTo(0, 5);
  });

  it('ne pivote PAS en marche latérale', () => {
    // Marcher à droite ne doit pas faire demi-tour à l'objet.
    const res = computeMove({ ...base, right: 1, faceHeading: true });
    expect(res.heading).toBeNull();
  });

  it('ne pivote pas si faceHeading est désactivé', () => {
    expect(computeMove({ ...base, forward: 1, faceHeading: false }).heading).toBeNull();
  });

  it('déplace proportionnellement à la vitesse et au dt', () => {
    const slow = computeMove({ ...base, speed: 2, dt: 1, forward: 1 });
    const fast = computeMove({ ...base, speed: 8, dt: 1, forward: 1 });
    expect(Math.abs(fast.dz)).toBeCloseTo(Math.abs(slow.dz) * 4, 6);
  });

  it('ne recule pas dans le temps avec un dt négatif', () => {
    const res = computeMove({ ...base, forward: 1, dt: -1 });
    expect(res.dz).toBe(0);
  });

  it('borne une entrée aberrante (avant = 99)', () => {
    const res = computeMove({ ...base, forward: 99 });
    expect(Math.abs(res.dz)).toBeCloseTo(0.5, 6);
  });

  it('normalise la diagonale pour ne pas accélérer', () => {
    const straight = computeMove({ ...base, forward: 1 });
    const diag = computeMove({ ...base, forward: 1, right: 1 });
    expect(Math.hypot(diag.dx, diag.dz)).toBeCloseTo(Math.abs(straight.dz), 5);
  });
});

// ---------------------------------------------------------------------------
// Cible d'action
// ---------------------------------------------------------------------------

describe('parseTargetRef', () => {
  it('traite vide / self / soi comme l\'objet courant', () => {
    for (const raw of ['', 'self', 'SELF', 'soi', undefined, null]) {
      expect(parseTargetRef(raw), String(raw)).toEqual({ kind: 'self' });
    }
  });

  it('reconnaît un UUID', () => {
    const id = '9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
    expect(parseTargetRef(id)).toEqual({ kind: 'id', id });
  });

  it('retombe sur un nom pour tout le reste', () => {
    expect(parseTargetRef('Cube_1')).toEqual({ kind: 'name', name: 'Cube_1' });
  });

  it('compare deux TargetRef', () => {
    expect(targetRefEquals({ kind: 'self' }, { kind: 'self' })).toBe(true);
    expect(targetRefEquals({ kind: 'self' }, { kind: 'name', name: 'a' })).toBe(false);
    expect(targetRefEquals({ kind: 'name', name: 'a' }, { kind: 'name', name: 'b' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Catalogue pour l'éditeur
// ---------------------------------------------------------------------------

describe('catalogue de touches', () => {
  it('expose des valeurs uniques', () => {
    const values = KEY_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('inclut les touches de déplacement par défaut', () => {
    const values = KEY_OPTIONS.map((o) => o.value);
    for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'Space']) {
      expect(values, k).toContain(k);
    }
  });

  it('signale l\'AZERTY dans le libellé des touches divergentes', () => {
    // Sans cette mention, un utilisateur AZERTY cherche « Z » et ne le trouve pas.
    const w = KEY_OPTIONS.find((o) => o.value === 'KeyW');
    expect(w?.label).toMatch(/AZERTY/);
  });

  it('décrit une touche inconnue sans planter', () => {
    expect(describeKey('Space')).toBeTruthy();
    expect(describeKey('')).toBe('Aucune');
    expect(describeKey('KeyP')).toBeTruthy();
  });

  it('expose des groupes stables et non vides', () => {
    const groups = keyOptionGroups();
    expect(groups.length).toBeGreaterThan(0);
    expect(groups).toContain('Déplacement');
  });
});


