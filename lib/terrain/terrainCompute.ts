/**
 * lib/terrain/terrainCompute.ts — calculs terrain purs (sans three.js).
 *
 * Importé par TerrainGenerator (repli synchrone) ET par le Web Worker :
 * les deux produisent des résultats bit-identiques (même seed → même bruit).
 */

// ---------------------------------------------------------------------------
// RNG déterministe
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Bruit simplex 2D (déplacé depuis TerrainGenerator, inchangé)
// ---------------------------------------------------------------------------

export class SimplexNoise2D {
  private perm: number[] = [];

  constructor(seed: number = 42) {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      const temp = p[i];
      p[i] = p[j];
      p[j] = temp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private grad2(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return (h & 1 ? -u : u) + (h & 2 ? -2.0 * v : 2.0 * v);
  }

  public noise(x: number, y: number): number {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    let i1 = 0;
    let j1 = 0;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm[ii + this.perm[jj]];
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]];
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      n0 = t0 * t0 * this.grad2(gi0, x0, y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      n1 = t1 * t1 * this.grad2(gi1, x1, y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      n2 = t2 * t2 * this.grad2(gi2, x2, y2);
    }
    return 70.0 * (n0 + n1 + n2);
  }

  public fbm(x: number, y: number, octaves: number = 4, roughness: number = 0.5): number {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      value += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= roughness;
      frequency *= 2.0;
    }
    return value / maxValue;
  }
}

// ---------------------------------------------------------------------------
// Heightfield
// ---------------------------------------------------------------------------

export interface HeightGenParams {
  seed: number;
  size: number;
  res: number; // segments (grille (res+1)²)
  heightScale: number;
  roughness: number;
  octaves: number;
}

/** Index du sommet (col,row) dans une grille (res+1)², x rapide. */
export function gridIndex(col: number, row: number, res: number): number {
  return row * (res + 1) + col;
}

/** Génère le heightfield procédural (mêmes maths que le legacy). */
export function genHeights(p: HeightGenParams): Float32Array {
  const noise = new SimplexNoise2D(p.seed);
  const n = p.res + 1;
  const out = new Float32Array(n * n);
  const halfSize = p.size / 2;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      // Convention PlaneGeometry + rotateX(-90°) : rangée 0 ↔ z=-half, x croissant.
      const vx = -halfSize + (col / p.res) * p.size;
      const vz = -halfSize + (row / p.res) * p.size;
      const nx = (vx + halfSize) * p.roughness;
      const nz = (vz + halfSize) * p.roughness;
      const elevation = noise.fbm(nx, nz, p.octaves, 0.5);
      const distFromCenter = Math.sqrt(vx * vx + vz * vz) / (halfSize * 1.05);
      const edgeFalloff = Math.max(0, 1 - Math.pow(distFromCenter, 2.8));
      out[gridIndex(col, row, p.res)] = elevation * p.heightScale * edgeFalloff;
    }
  }
  return out;
}

/**
 * Normales par différences centrales (cousues aux bords, sans coutures
 * inter-chunks — contrairement à computeVertexNormals par tuile).
 */
export function computeNormals(
  heights: Float32Array,
  res: number,
  size: number,
  out?: Float32Array
): Float32Array {
  const n = res + 1;
  const normals = out ?? new Float32Array(n * n * 3);
  const step = size / res;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const hl = heights[gridIndex(Math.max(0, col - 1), row, res)];
      const hr = heights[gridIndex(Math.min(res, col + 1), row, res)];
      const hd = heights[gridIndex(col, Math.max(0, row - 1), res)];
      const hu = heights[gridIndex(col, Math.min(res, row + 1), res)];
      // Grille : x → col, z → row (z décroît avec row, voir genHeights).
      const nx = (hl - hr) / (2 * step);
      const nz = (hd - hu) / (2 * step);
      const inv = 1 / Math.hypot(nx, 1, nz);
      const o = gridIndex(col, row, res) * 3;
      normals[o] = nx * inv;
      normals[o + 1] = inv;
      normals[o + 2] = nz * inv;
    }
  }
  return normals;
}

// ---------------------------------------------------------------------------
// Couches auto (miroir des règles updateColors, en poids continus)
// ---------------------------------------------------------------------------

/** Poids [herbe, roche, sable, neige] normalisés. */
export function autoLayerWeights(h: number, slopeY: number, heightScale: number): [number, number, number, number] {
  // Pentes fortes → roche (transition douce 0.7→0.55).
  const rock = 1 - smoothstep(0.55, 0.72, slopeY);
  // Neige : altitude (transition 0.6→0.78 × heightScale).
  const snow = smoothstep(0.6 * heightScale, 0.78 * heightScale, h);
  // Sable : basse altitude (transition 0.6→0.15).
  const sand = 1 - smoothstep(0.15, 0.65, h);
  // Reste → herbe.
  let grass = Math.max(0, 1 - rock - snow - sand);
  let r = rock * (1 - snow);
  let sn = snow;
  let sa = sand * (1 - rock) * (1 - snow);
  grass = Math.max(0, 1 - r - sn - sa);
  const sum = grass + r + sa + sn || 1;
  return [grass / sum, r / sum, sa / sum, sn / sum];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Splat + trous (bake CPU, rejouable worker ou main thread)
// ---------------------------------------------------------------------------

export interface SplatBakeParams {
  heights: Float32Array;
  normals: Float32Array;
  res: number;
  size: number;
  heightScale: number;
  splatSize: number;
  strokes: { x: number; z: number; radius: number; layer: number; strength: number }[];
  holes: { x: number; z: number; radius: number }[];
}

export interface SplatBakeResult {
  splat: Uint8Array; // splatSize² × RGBA (poids 0-255)
  hole: Uint8Array; // splatSize² × R (0/255, bords adoucis par le shader)
}

/** Bake splatmap + masque de trous (texels mappés monde→uv 0-1). */
export function bakeSplat(p: SplatBakeParams): SplatBakeResult {
  const S = Math.max(32, p.splatSize);
  const splat = new Uint8Array(S * S * 4);
  const hole = new Uint8Array(S * S);
  const n = p.res + 1;
  for (let ty = 0; ty < S; ty++) {
    for (let tx = 0; tx < S; tx++) {
      // Monde : tx → x (-half..half), ty → z (-half..half, v=0 en bas comme three).
      const wx = (tx / (S - 1) - 0.5) * p.size;
      const wz = (ty / (S - 1) - 0.5) * p.size;
      // Échantillonne hauteur/pente (plus proche voisin sur la grille).
      const gx = Math.round(((wx + p.size / 2) / p.size) * p.res);
      const gz = Math.round(((wz + p.size / 2) / p.size) * p.res);
      const col = Math.max(0, Math.min(p.res, gx));
      const row = Math.max(0, Math.min(p.res, gz));
      const h = p.heights[gridIndex(col, row, p.res)];
      const slopeY = p.normals[gridIndex(col, row, p.res) * 3 + 1];
      void n;
      let w = autoLayerWeights(h, slopeY, p.heightScale);
      // Coups de pinceau (lerp vers la couche, noyau cosinus).
      for (const s of p.strokes) {
        const d = Math.hypot(wx - s.x, wz - s.z);
        if (d >= s.radius || s.radius <= 0) continue;
        const f = (0.5 * (1 + Math.cos((Math.PI * d) / s.radius))) * Math.min(1, s.strength);
        if (f <= 0) continue;
        const li = Math.max(0, Math.min(3, s.layer | 0));
        const nw: [number, number, number, number] = [w[0], w[1], w[2], w[3]];
        for (let k = 0; k < 4; k++) nw[k] *= 1 - f;
        nw[li] += f;
        const sum = nw[0] + nw[1] + nw[2] + nw[3] || 1;
        w = [nw[0] / sum, nw[1] / sum, nw[2] / sum, nw[3] / sum];
      }
      const o = (ty * S + tx) * 4;
      splat[o] = Math.round(w[0] * 255);
      splat[o + 1] = Math.round(w[1] * 255);
      splat[o + 2] = Math.round(w[2] * 255);
      splat[o + 3] = Math.round(w[3] * 255);
      // Trous : masque dur (le shader adoucit le bord sur ~1 texel).
      let inHole = 0;
      for (const hh of p.holes) {
        if (Math.hypot(wx - hh.x, wz - hh.z) < hh.radius) {
          inHole = 255;
          break;
        }
      }
      hole[ty * S + tx] = inHole;
    }
  }
  return { splat, hole };
}

/** Le centre d'un triangle (sommets monde XZ) est-il dans un trou ? */
export function triangleInHole(
  ax: number, az: number,
  bx: number, bz: number,
  cx: number, cz: number,
  holes: { x: number; z: number; radius: number }[]
): boolean {
  if (holes.length === 0) return false;
  const cx0 = (ax + bx + cx) / 3;
  const cz0 = (az + bz + cz) / 3;
  for (const h of holes) {
    if (Math.hypot(cx0 - h.x, cz0 - h.z) < h.radius) return true;
  }
  return false;
}

/** Le point monde est-il dans un trou (avec marge optionnelle) ? */
export function pointInHole(
  x: number,
  z: number,
  holes: { x: number; z: number; radius: number }[],
  margin = 0
): boolean {
  for (const h of holes) {
    if (Math.hypot(x - h.x, z - h.z) < h.radius + margin) return true;
  }
  return false;
}
