import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { analyzeUv } from '../lib/texture/uvAtlas';

/** Analyse une géométrie Three réelle (attribut uv + buffer d'index). */
function analyzeGeometry(geo: THREE.BufferGeometry) {
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute | undefined;
  const arr = uvAttr?.array;
  return analyzeUv(
    arr ? (arr as ArrayLike<number>) : null,
    geo.attributes.position.count,
    geo.index ? (geo.index.array as ArrayLike<number>) : null
  );
}

describe('analyzeUv — cas limites', () => {
  it('signale l’absence d’UV sans planter', () => {
    const r = analyzeUv(null, 8);
    expect(r.hasUv).toBe(false);
    expect(r.islands).toHaveLength(0);
    expect(r.density).toHaveLength(16);
  });

  it('traite un tableau de longueur nulle', () => {
    expect(analyzeUv([], 0).hasUv).toBe(false);
  });

  it('ignore les NaN sans contaminer les bornes', () => {
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, NaN, NaN]);
    const r = analyzeUv(uvs, 4);
    expect(r.hasUv).toBe(true);
    expect(Number.isFinite(r.bounds.maxU)).toBe(true);
    expect(r.bounds.maxU).toBeCloseTo(1, 5);
  });
});

describe('analyzeUv — primitives Three', () => {
  it('détecte 6 îlots sur une boîte (une face chacune)', () => {
    // Le cas qui motive la feature : une boîte n'est PAS un carré 0→1 mais
    // 6 îlots empilés, tous en 0→1. Une texture "de face" n'en remplit qu'un.
    const r = analyzeGeometry(new THREE.BoxGeometry(1, 1, 1));
    expect(r.hasUv).toBe(true);
    expect(r.islands).toHaveLength(6);
    expect(r.isFullSquare).toBe(true);
    expect(r.overflows).toBe(false);
  });

  it('donne un seul îlot pour un plan', () => {
    const r = analyzeGeometry(new THREE.PlaneGeometry(2, 2));
    expect(r.islands).toHaveLength(1);
    expect(r.bounds.minU).toBeCloseTo(0, 5);
    expect(r.bounds.maxU).toBeCloseTo(1, 5);
  });

  it('repère le débordement du mapping sphérique', () => {
    // Three produit U dans [-0.03, 1.03] sur SphereGeometry : les UV sortent
    // de 0→1 et le tiling doit en tenir compte.
    const r = analyzeGeometry(new THREE.SphereGeometry(1, 16, 12));
    expect(r.hasUv).toBe(true);
    expect(r.overflows).toBe(true);
    expect(r.bounds.minU).toBeLessThan(0);
    expect(r.bounds.maxU).toBeGreaterThan(1);
  });

  it('reste borné sur un tore et un cylindre', () => {
    for (const geo of [new THREE.TorusGeometry(1, 0.4, 8, 16), new THREE.CylinderGeometry(1, 1, 2, 16)]) {
      const r = analyzeGeometry(geo);
      expect(r.hasUv).toBe(true);
      expect(Number.isFinite(r.bounds.minU)).toBe(true);
      expect(r.islands.length).toBeGreaterThan(0);
    }
  });

  it('compte les triangles dans les îlots', () => {
    const geo = new THREE.PlaneGeometry(2, 2, 3, 3); // 3×3 subdivisions
    const r = analyzeGeometry(geo);
    expect(r.islands).toHaveLength(1);
    expect(r.islands[0].triangles).toBe(3 * 3 * 2);
  });
});

describe('analyzeUv — densité', () => {
  it('place un UV en haut à gauche dans la bonne cellule', () => {
    // Ligne 0 = haut de l'image (convention d'affichage), donc V=1 → ligne 0.
    const uvs = new Float32Array([0.02, 0.98, 0.02, 0.98, 0.02, 0.98]);
    const r = analyzeUv(uvs, 3);
    const row = 0;
    const col = 0;
    expect(r.density[row][col]).toBe(3);
    // Rien dans le coin bas-droit.
    expect(r.density[15][15]).toBe(0);
  });

  it('ramène les UV hors 0→1 dans la grille (répétition)', () => {
    const uvs = new Float32Array([1.5, 0.5, 1.5, 0.5, 1.5, 0.5]);
    const r = analyzeUv(uvs, 3);
    expect(r.overflows).toBe(true);
    // 1.5 % 1 = 0.5 → colonne centrale.
    expect(r.density[7][8]).toBe(3);
  });

  it('renseigne toute la grille (16×16)', () => {
    const r = analyzeGeometry(new THREE.BoxGeometry(1, 1, 1));
    expect(r.density).toHaveLength(16);
    for (const row of r.density) expect(row).toHaveLength(16);
  });
});

describe('analyzeUv — regroupement des îlots', () => {
  it('fusionne en un seul îlot ce qui partage une arête de sommets', () => {
    // Deux triangles collés par une arête = un seul îlot (déploiement continu).
    // L'arête est donnée par les INDEX (0,1,2) puis (1,3,2), pas par les UV :
    // les UV brutes ne suffisent pas, c'est tout l'objet de l'index.
    const uvs = new Float32Array([
      0, 0, 1, 0, 0, 1,
      1, 0, 1, 1, 0, 1,
    ]);
    const r = analyzeUv(uvs, 6, new Uint16Array([0, 1, 2, 1, 3, 2]));
    expect(r.islands).toHaveLength(1);
    expect(r.islands[0].triangles).toBe(2);
    expect(r.isFullSquare).toBe(true);
  });

  it('sépare les îlots sans arête partagée', () => {
    const uvs = new Float32Array([
      0, 0, 0.5, 0, 0, 0.5,
      0.5, 0, 1, 0, 0.5, 0.5,
    ]);
    // 6 sommets distincts, aucune arête commune.
    const r = analyzeUv(uvs, 6);
    expect(r.islands).toHaveLength(2);
  });

  it('ne fusionne PAS deux faces qui partagent les mêmes UV', () => {
    // Régression : BoxGeometry donne les mêmes UV (0,0)-(1,1) à ses 6 faces.
    // Un regroupement par VALEURS UV les confondrait en un seul îlot — on
    // verrait « 1 îlot » sur une boîte alors qu'elle en a 6.
    const uvs = new Float32Array([
      0, 0, 1, 0, 1, 1,
      0, 0, 1, 0, 1, 1,
    ]);
    const r = analyzeUv(uvs, 6, new Uint16Array([0, 1, 2, 3, 4, 5]));
    expect(r.islands).toHaveLength(2);
  });

  it('tolère le bruit flottant sur une arête partagée', () => {
    // La fusion repose sur les INDICES de sommet, pas sur les valeurs UV :
    // le bruit flottant est donc sans effet. Une fois l'index fourni, deux
    // triangles partageant une arête forment un seul îlot.
    const uvs = new Float32Array([
      0, 0, 1, 0, 0, 1,
      1 + 1e-6, 0, 1, 1, 0, 1,
    ]);
    // T1 = (0,1,2), T2 = (1,3,2) : arête 1-2 commune.
    const r = analyzeUv(uvs, 6, new Uint16Array([0, 1, 2, 1, 3, 2]));
    expect(r.islands).toHaveLength(1);
    expect(r.islands[0].triangles).toBe(2);
  });

  it('classe le plus grand îlot en premier', () => {
    const uvs = new Float32Array([
      // petit îlot isolé
      0, 0, 0.1, 0, 0, 0.1,
      // grand îlot
      0.2, 0, 0.9, 0, 0.2, 0.7,
      0.9, 0, 0.8, 0.7, 0.2, 0.7,
    ]);
    const r = analyzeUv(uvs, 9);
    expect(r.islands.length).toBeGreaterThanOrEqual(2);
    expect(r.islands[0].triangles).toBeGreaterThanOrEqual(r.islands[1].triangles);
  });
});