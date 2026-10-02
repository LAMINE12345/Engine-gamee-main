import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  smoothShadeGeometry,
  smoothShadeObject,
  flattenShadeObject,
  isSmoothShaded,
} from '../lib/scene/smoothShading';

function mesh(geo: THREE.BufferGeometry): THREE.Mesh {
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#3b82f6' }));
}

describe('smoothShading', () => {
  it('soude une géométrie non-indexée puis moyenne les normales', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    expect(geo.index).toBeNull();
    const welded = smoothShadeGeometry(geo);
    expect(welded).toBe(true);
    expect(geo.index).not.toBeNull();
    const nor = geo.getAttribute('normal');
    expect(nor).toBeDefined();
    // Coin (+x,+y,+z) : 4 triangles le partagent (tessellation du cube) —
    // normale lissée = (1,1,2)/√6 ≈ (0.408, 0.408, 0.816)
    const pos = geo.getAttribute('position');
    let found = false;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) === 0.5 && pos.getY(i) === 0.5 && pos.getZ(i) === 0.5) {
        found = true;
        expect(nor.getX(i)).toBeCloseTo(0.4082, 3);
        expect(nor.getY(i)).toBeCloseTo(0.4082, 3);
        expect(nor.getZ(i)).toBeCloseTo(0.8165, 3);
      }
    }
    expect(found).toBe(true);
  });

  it('laisse une géométrie déjà indexée indexée (normales recalculées)', () => {
    const geo = new THREE.SphereGeometry(1, 12, 8);
    const welded = smoothShadeGeometry(geo);
    expect(welded).toBe(false);
    expect(geo.index).not.toBeNull();
    expect(geo.getAttribute('normal')).toBeDefined();
  });

  it('smoothShadeObject lisse + désactive flatShading', () => {
    const m = mesh(new THREE.ConeGeometry(1, 2, 7).toNonIndexed());
    (m.material as THREE.MeshStandardMaterial).flatShading = true;
    const group = new THREE.Group();
    group.add(m);
    const report = smoothShadeObject(group);
    expect(report.smoothed).toBe(1);
    expect(m.geometry.index).not.toBeNull();
    expect((m.material as THREE.MeshStandardMaterial).flatShading).toBe(false);
    expect(isSmoothShaded(group)).toBe(true);
  });

  it('flattenShadeObject revient au facetté', () => {
    const m = mesh(new THREE.SphereGeometry(1, 10, 6));
    const group = new THREE.Group();
    group.add(m);
    smoothShadeObject(group);
    const report = flattenShadeObject(group);
    expect(report.smoothed).toBe(1);
    expect(m.geometry.index).toBeNull();
    expect((m.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    expect(isSmoothShaded(group)).toBe(false);
  });

  it('ignore les géométries vides sans crash', () => {
    const empty = new THREE.BufferGeometry();
    expect(smoothShadeGeometry(empty)).toBe(false);
    const group = new THREE.Group();
    group.add(mesh(empty));
    const report = smoothShadeObject(group);
    expect(report.smoothed).toBe(1); // matériaux quand même synchronisés
  });

  it('ne duplique pas les géométries partagées', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const group = new THREE.Group();
    group.add(mesh(geo));
    group.add(mesh(geo));
    const report = smoothShadeObject(group);
    expect(report.meshes).toBe(1);
  });
});
