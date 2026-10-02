/**
 * Moteur de recherche floue partagé par la palette de commandes (Ctrl+K).
 *
 * Volontairement *pur* et sans dépendance : c'est la partie qui mérite
 * des tests unitaires (voir `tests/commands.test.ts`).
 *
 * Principe de scoring (du meilleur au pire) :
 *   - égalité exacte                       → 1000
 *   - préfixe                             →  900
 *   - mot entier commençant par la requête →  780
 *   - sous-chaîne contiguë                →  650 (+ bonus de position)
 *   - sous-séquence (lettres dans l'ordre) →  300..600
 *   - aucun match                         →  null (filtré)
 *
 * Les accents et la casse sont ignorés : « atelier » doit trouver « Ateliers ».
 */

/** Retire accents + met en minuscules pour comparer des chaînes FR/EN. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export interface FuzzyOptions {
  /** Champs additionnels(lowercased) abyssés dans la requête, ex. mots-clés. */
  keywords?: string;
}

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 900;
const SCORE_WORD_START = 780;
const SCORE_SUBSTRING = 650;
const SCORE_SEQUENCE_BASE = 300;
const SCORE_SEQUENCE_MAX = 600;

/** Bonus ajouté quand un caractère suit immédiatement le précédent (mot collant). */
const CONSECUTIVE_BONUS = 24;
/** Bonus si le match démarre sur une frontière de mot (début, espace, - _ /). */
const WORD_BOUNDARY_BONUS = 18;
/** Bonus si le match démarre tôt dans la chaîne. */
const LEADING_BONUS_MAX = 40;

/**
 * Score de `query` contre `target`.
 * Retourne `null` si la requête ne peut pas être satisfaite.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = normalize(query).trim();
  if (!q) return 0; // pas de filtre
  const t = normalize(target);
  if (!t) return null;

  if (t === q) return SCORE_EXACT;
  if (t.startsWith(q)) return SCORE_PREFIX + LEADING_BONUS_MAX;

  // Début d'un mot : "m at" doit trouver "Asset Manager"
  const wordIndex = t.search(new RegExp(`(^|[\\s\\-_/.])${escapeRegExp(q)}`));
  if (wordIndex !== -1) return SCORE_WORD_START + LEADING_BONUS_MAX;

  const subIndex = t.indexOf(q);
  if (subIndex !== -1) {
    return SCORE_SUBSTRING + Math.max(0, LEADING_BONUS_MAX - subIndex);
  }

  return sequenceScore(q, t);
}

/** Sous-séquence : les caractères de la requête apparaissent dans l'ordre. */
function sequenceScore(q: string, t: string): number | null {
  let ti = 0;
  let score = 0;
  let streak = 0;
  let firstHit = -1;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    // Ignore les espaces de la requête pour la sous-séquence.
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;

    if (firstHit === -1) firstHit = found;
    if (found === ti && ti > 0) {
      streak += 1;
      score += CONSECUTIVE_BONUS;
    } else {
      streak = 0;
    }
    score += isWordBoundary(t, found) ? WORD_BOUNDARY_BONUS : 0;
    ti = found + 1;
  }

  // Densité : plus le match est compact, meilleur est le score.
  const spread = firstHit >= 0 ? ti - firstHit : q.length;
  const density = Math.max(1, spread);
  const densityBonus = Math.round((q.length / density) * 120);
  const leadBonus = firstHit >= 0 ? Math.max(0, LEADING_BONUS_MAX - firstHit) : 0;

  return Math.min(SCORE_SEQUENCE_MAX, SCORE_SEQUENCE_BASE + score + densityBonus + leadBonus);
}

function isWordBoundary(text: string, index: number): boolean {
  if (index <= 0) return true;
  const prev = text[index - 1];
  return prev === ' ' || prev === '-' || prev === '_' || prev === '/' || prev === '.';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Commande exposée à la palette de commandes. */
export interface CommandDef {
  id: string;
  label: string;
  /** Regroupement affiché dans la palette (« Créer », « Affichage »…). */
  group: string;
  /** Texte d'aide affiché à droite de l'entrée. */
  hint?: string;
  /** Raccourci clavier affiché, ex. « Ctrl+Alt+P ». */
  shortcut?: string;
  /** Mots-clés supplémentaires pour la recherche. */
  keywords?: string;
  /** Icône (composant lucide) rendue par la palette. */
  icon?: React.ComponentType<{ className?: string }>;
  /** true si la commande est actuellement indisponible (affichée grisée). */
  disabled?: boolean;
  run: () => void;
}

export interface RankedCommand extends CommandDef {
  score: number;
}

/**
 * Classe une liste de commandes pour une requête.
 * - `keywords` sont matchés en plus du label.
 * - Résultats triés par score décroissant, puis par ordre d'insertion stable.
 */
export function rankCommands(commands: readonly CommandDef[], query: string): RankedCommand[] {
  const q = normalize(query).trim();
  const out: Array<{cmd: CommandDef; score: number; index: number}> = [];

  commands.forEach((cmd, index) => {
    if (q) {
      const label = fuzzyScore(q, cmd.label);
      const kw = cmd.keywords ? fuzzyScore(q, cmd.keywords) : null;
      const best = label === null ? kw : kw === null ? label : Math.max(label, kw - 60);
      if (best === null || best === 0) return;
      out.push({cmd, score: best, index});
    } else {
      out.push({cmd, score: 0, index});
    }
  });

  out.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return out.map(({cmd, score}) => ({...cmd, score}));
}

/** Regroupe les commandes classées en conservant l'ordre des groupes. */
export function groupCommands(commands: readonly RankedCommand[]): Array<{
  group: string;
  items: RankedCommand[];
}> {
  const buckets = new Map<string, RankedCommand[]>();
  for (const cmd of commands) {
    const list = buckets.get(cmd.group);
    if (list) list.push(cmd);
    else buckets.set(cmd.group, [cmd]);
  }
  return Array.from(buckets, ([group, items]) => ({group, items}));
}
