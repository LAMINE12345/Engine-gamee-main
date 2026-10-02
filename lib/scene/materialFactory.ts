/**
 * materialFactory.ts
 * Small material helpers extracted from SceneManager.
 *
 * `ensurePBRMaterial()` was a private method that never touched `this`; it is
 * used on imported-model materials, so exposing it as a free function keeps it
 * reusable (and testable) outside the giant SceneManager class.
 *
 * NOTE: the `|| 0x94a3b8` fallback below is effectively unreachable — every
 * THREE.Material exposes `.color` (white when unset), so the `||` never fires.
 * It is kept verbatim from SceneManager to avoid changing import-time
 * behaviour; see tests/sceneFactories.test.ts, which pins this down.
 */

import * as THREE from 'three';

/**
 * Returns `mat` unchanged when it already is a MeshStandardMaterial, otherwise
 * a new standard material approximating it.
 */
export function ensurePBRMaterial(mat: THREE.Material): THREE.MeshStandardMaterial {
  if (mat instanceof THREE.MeshStandardMaterial) {
    return mat;
  }
  const standard = new THREE.MeshStandardMaterial({
    color: (mat as unknown as { color?: THREE.Color }).color || new THREE.Color(0x94a3b8),
    roughness: 0.4,
    metalness: 0.1,
  });
  return standard;
}
