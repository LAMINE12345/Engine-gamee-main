import { describe, expect, it } from 'vitest';
import { fuzzyScore, groupCommands, normalize, rankCommands, type CommandDef } from '../lib/commands';

const cmds: CommandDef[] = [
  { id: 'a', label: 'Ajouter : Cube', group: 'Créer', keywords: 'boite box bloc', run: () => {} },
  { id: 'b', label: 'Ajouter : Sphère', group: 'Créer', keywords: 'boule round', run: () => {} },
  { id: 'c', label: 'Atmosphère, Ciel & Post-Processing', group: 'Outils', run: () => {} },
  { id: 'd', label: 'Wireframe', group: 'Affichage', run: () => {} },
  { id: 'e', label: 'Supprimer la sélection', group: 'Scène', run: () => {} },
];

describe('normalize', () => {
  it('minuscule et retire les accents', () => {
    expect(normalize('Atmosphère')).toBe('atmosphere');
    expect(normalize('Créer')).toBe('creer');
    expect(normalize('ÉCHAPPEMENT')).toBe('echappement');
  });
});

describe('fuzzyScore', () => {
  it('retourne 0 sans requête (pas de filtre)', () => {
    expect(fuzzyScore('', 'Cube')).toBe(0);
    expect(fuzzyScore('   ', 'Cube')).toBe(0);
  });

  it('classe égalité > préfixe > mot > sous-chaîne > sous-séquence', () => {
    const exact = fuzzyScore('wireframe', 'wireframe')!;
    const prefix = fuzzyScore('wire', 'wireframe')!;
    const wordStart = fuzzyScore('manager', 'asset manager')!;
    const substring = fuzzyScore('frame', 'wireframe')!;
    const sequence = fuzzyScore('wrfr', 'wireframe')!;

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(sequence);
  });

  it('ignore casse et accents', () => {
    expect(fuzzyScore('ATMOSPHERE', 'Atmosphère')).not.toBeNull();
    expect(fuzzyScore('atmosphere', 'Atmosphère')).not.toBeNull();
    expect(fuzzyScore('creation', 'Création')).not.toBeNull();
  });

  it('trouve un mot en début de chaîne ("man" → "asset manager")', () => {
    // "man" démarre le 2e mot : détecté comme début de mot, pas comme
    // sous-chaîne quelconque.
    expect(fuzzyScore('man', 'Asset Manager')).toBe(780 + 40);
  });

  it('tolère les espaces dans la sous-séquence', () => {
    // "m g r" → m(7), g(11), r(14) dans "asset manager"
    expect(fuzzyScore('m g r', 'Asset Manager')).not.toBeNull();
    expect(fuzzyScore('a s', 'Asset Manager')).not.toBeNull();
  });

  it('retourne null quand aucun caractère ne matche', () => {
    expect(fuzzyScore('zzz', 'wireframe')).toBeNull();
  });
});

describe('rankCommands', () => {
  it('retourne tout quand la requête est vide, dans l’ordre d’insertion', () => {
    const ranked = rankCommands(cmds, '');
    expect(ranked.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('filtre les commandes non pertinentes', () => {
    const ranked = rankCommands(cmds, 'wireframe');
    expect(ranked[0].id).toBe('d');
    expect(ranked).toHaveLength(1);
  });

  it('cherche aussi dans les mots-clés', () => {
    const ranked = rankCommands(cmds, 'boite');
    expect(ranked[0].id).toBe('a');
  });

  it('trouve un objet via un mot-clé anglais', () => {
    const ranked = rankCommands(cmds, 'boule');
    expect(ranked[0].id).toBe('b');
  });

  it('ignore accents dans la requête utilisateur', () => {
    const ranked = rankCommands(cmds, 'atmosphere');
    expect(ranked[0].id).toBe('c');
  });

  it('trie par score décroissant', () => {
    const ranked = rankCommands(cmds, 'a');
    const scores = ranked.map((c) => c.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });
});

describe('groupCommands', () => {
  it('regroupe en conservant l’ordre d’apparition des groupes', () => {
    const ranked = rankCommands(cmds, '');
    const groups = groupCommands(ranked);
    expect(groups.map((g) => g.group)).toEqual(['Créer', 'Outils', 'Affichage', 'Scène']);
    expect(groups[0].items).toHaveLength(2);
  });

  it('préserve l’ordre des items dans un groupe', () => {
    const ranked = rankCommands(cmds, '');
    const groups = groupCommands(ranked);
    expect(groups[0].items.map((c) => c.id)).toEqual(['a', 'b']);
  });
});
