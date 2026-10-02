/**
 * uvAtlas.ts
 *
 * Analyse de la couche UV d'une géométrie pour visualiser où une texture
 * va réellement atterrir. Sans ça, appliquer un tiling à l'aveugle donne des
 * résultats incompréhensibles (une boîte a 6 îlots, pas un carré 0→1).
 */

export interface UvIsland {
  /** Coins du quadrilatère englobant l'îlot, en UV. */
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
  /** Nombre de triangles de l'îlot. */
  triangles: number;
}

export interface UvAnalysis {
  /** Les triangles existent-ils dans l'attribut `uv` ? */
  hasUv: boolean;
  vertexCount: number;
  /** Étendue réelle des UV (min/max), hors 0→1 si la géométrie déborde. */
  bounds: { minU: number; minV: number; maxU: number; maxV: number };
  /** Les UV débordent-elles de l'espace 0→1 (tiling par répétition) ? */
  overflows: boolean;
  islands: UvIsland[];
  /** Histogramme de densité : répartition des UV en grille 16×16. */
  density: number[][];
  /** Les UV couvrent-elles tout l'espace 0→1 (maillage « unwrappé ») ? */
  isFullSquare: boolean;
}

const DENSITY_CELLS = 16;

/**
 * Regroupe les triangles en îlots par TOPOLOGIE : deux triangles sont voisins
 * s'ils partagent la même paire d'indices de sommets sur une arête.
 *
 * On ne peut PAS regrouper par valeurs UV : BoxGeometry donne les mêmes UV
 * (0,0)-(1,1) à ses 6 faces, qui se confondraient alors en un seul îlot.
 * En revanche les sommets sont bien distincts par face, ce qui les sépare.
 *
 * Deux îlots ainsi obtenus peuvent recouvrir la même plage UV : c'est
 * exactement ce que « atlas » signifie (plusieurs faces superposées en UV,
 * exploitées par des índices de sommet distincts).
 */
function buildIslands(triIdx: number[][], uvs: ArrayLike<number>): UvIsland[] {
  // Clé canonique d'arête : paire d'indices triée.
  const edgeKey = (a: number, b: number): string =>
    a < b ? `${a}|${b}` : `${b}|${a}`;

  const parent: number[] = triIdx.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const edgeOwner = new Map<string, number>();
  triIdx.forEach((tri, ti) => {
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(tri[e], tri[(e + 1) % 3]);
      const owner = edgeOwner.get(key);
      if (owner === undefined) edgeOwner.set(key, ti);
      else union(owner, ti);
    }
  });

  const groups = new Map<number, { island: UvIsland; loU: number; loV: number; hiU: number; hiV: number }>();
  triIdx.forEach((tri, ti) => {
    const root = find(ti);
    let g = groups.get(root);
    if (!g) {
      g = {
        island: { minU: Infinity, minV: Infinity, maxU: -Infinity, maxV: -Infinity, triangles: 0 },
        loU: Infinity,
        loV: Infinity,
        hiU: -Infinity,
        hiV: -Infinity,
      };
      groups.set(root, g);
    }
    g.island.triangles++;
    for (const vi of tri) {
      const u = uvs[vi * 2];
      const v = uvs[vi * 2 + 1];
      if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
      if (u < g.loU) g.loU = u;
      if (u > g.hiU) g.hiU = u;
      if (v < g.loV) g.loV = v;
      if (v > g.hiV) g.hiV = v;
    }
  });

  const islands: UvIsland[] = [];
  for (const g of groups.values()) {
    // Îlot sans UV exploitable : on l'écarte plutôt que d'afficher NaN.
    if (!Number.isFinite(g.loU) || !Number.isFinite(g.loV)) continue;
    islands.push({ ...g.island, minU: g.loU, minV: g.loV, maxU: g.hiU, maxV: g.hiV });
  }
  return islands.sort((a, b) => b.triangles - a.triangles);
}

/**
 * Analyse la couche UV.
 * @param uvs      Attribut `uv` brut : [u0,v0, u1,v1, ...] (format Three).
 * @param vertexCount Nombre de sommets du maillage.
 * @param index    Buffer d'index si le maillage est indexé. OBLIGATOIRE dans ce
 *   cas : les UV brutes ne décrivent PAS les triangles. Sans lui, une
 *   BoxGeometry (24 sommets, 12 triangles) serait analysée comme si elle en
 *   avait 8 — et ses 6 faces se confondraient en un seul îlot.
 */
export function analyzeUv(
  uvs: ArrayLike<number> | null,
  vertexCount: number,
  index?: ArrayLike<number> | null
): UvAnalysis {
  const empty: UvAnalysis = {
    hasUv: false,
    vertexCount,
    bounds: { minU: 0, minV: 0, maxU: 1, maxV: 1 },
    overflows: false,
    islands: [],
    density: Array.from({ length: DENSITY_CELLS }, () => new Array<number>(DENSITY_CELLS).fill(0)),
    isFullSquare: false,
  };
  if (!uvs || uvs.length < 2 || vertexCount === 0) return empty;

  let loU = Infinity;
  let hiU = -Infinity;
  let loV = Infinity;
  let hiV = -Infinity;
  for (let i = 0; i + 1 < uvs.length; i += 2) {
    const u = uvs[i];
    const v = uvs[i + 1];
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
    if (u < loU) loU = u;
    if (u > hiU) hiU = u;
    if (v < loV) loV = v;
    if (v > hiV) hiV = v;
  }
  if (!Number.isFinite(loU) || !Number.isFinite(loV)) return empty;

  const EPS = 1e-4;
  const overflows = loU < -EPS || loV < -EPS || hiU > 1 + EPS || hiV > 1 + EPS;

  // Triangles réels : via le buffer d'index quand le maillage en a un, sinon
  // par tranches de 3 sommets. On conserve les INDICES (topologie) pour le
  // regroupement en îlots : les UV seules ne suffisent pas (cf. buildIslands).
  const triIdx: number[][] = [];
  if (index && index.length >= 3) {
    for (let i = 0; i + 2 < index.length; i += 3) {
      const a = index[i];
      const b = index[i + 1];
      const c = index[i + 2];
      if (a >= vertexCount || b >= vertexCount || c >= vertexCount) continue;
      triIdx.push([a, b, c]);
    }
  } else {
    for (let i = 0; i + 2 < vertexCount; i += 3) {
      triIdx.push([i, i + 1, i + 2]);
    }
  }
  const islands = buildIslands(triIdx, uvs);

  // Densité en grille : où tombent réellement les UV. On compte les TRIANGLES
  // (pas les sommets) pour que la densité soit comparable entre maillages
  // indexés et non indexés.
  const density = Array.from({ length: DENSITY_CELLS }, () => new Array<number>(DENSITY_CELLS).fill(0));
  const bump = (u: number, v: number): void => {
    if (!Number.isFinite(u) || !Number.isFinite(v)) return;
    // Ramène dans 0→1 via répétition (le tiling gère le débordement).
    const cu = ((u % 1) + 1) % 1;
    const cv = ((v % 1) + 1) % 1;
    const cx = Math.min(DENSITY_CELLS - 1, Math.floor(cu * DENSITY_CELLS));
    const cy = Math.min(DENSITY_CELLS - 1, Math.floor(cv * DENSITY_CELLS));
    density[DENSITY_CELLS - 1 - cy][cx]++; // ligne 0 = haut de l'image
  };
  if (triIdx.length > 0) {
    for (const tri of triIdx) {
      for (const vi of tri) bump(uvs[vi * 2], uvs[vi * 2 + 1]);
    }
  } else {
    for (let i = 0; i + 1 < uvs.length; i += 2) bump(uvs[i], uvs[i + 1]);
  }

  const spanU = hiU - loU;
  const spanV = hiV - loV;
  const coversFull =
    loU <= EPS && loV <= EPS && hiU >= 1 - EPS && hiV >= 1 - EPS;

  return {
    hasUv: true,
    vertexCount,
    bounds: { minU: loU, minV: loV, maxU: hiU, maxV: hiV },
    overflows,
    islands,
    density,
    isFullSquare: coversFull && spanU > 0 && spanV > 0,
  };
}