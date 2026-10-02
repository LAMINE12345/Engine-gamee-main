import * as THREE from 'three';
import { setLocalFromWorldPosition } from '../physics/transformSpace';

/**
 * SnapService — accrochages hors grille (TIER 2.4).
 *
 * - Surface : pose le bas de l'AABB de l'objet sur la surface sous lui.
 * - Vertex  : aligne le sommet le plus proche de l'objet mobile sur un
 *   sommet d'une cible statique (seuil monde).
 *
 * Pure helpers — l'état de drag vit dans SelectionManager.
 */

const _down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _center = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function isSelfOrDescendant(hitObj: THREE.Object3D, self: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = hitObj;
  while (o) {
    if (o === self) return true;
    o = o.parent;
  }
  return false;
}

/** Échantillonne des sommets en espace monde (cap pour la frame). */
export function collectWorldVertices(root: THREE.Object3D, max = 256): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (out.length >= max) return;
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / Math.min(48, max)));
    for (let i = 0; i < pos.count && out.length < max; i += step) {
      _tmp.fromBufferAttribute(pos, i);
      _tmp.applyMatrix4(mesh.matrixWorld);
      out.push(_tmp.clone());
    }
  });
  return out;
}

/**
 * Pose l'objet pour que le bas de son AABB repose sur la surface hitée
 * sous son centre (raycast −Y). Retourne true si un snap a été appliqué.
 */
export function applySurfaceSnap(
  object: THREE.Object3D,
  raycaster: THREE.Raycaster,
  candidates: THREE.Object3D[],
  opts?: { maxDrop?: number }
): boolean {
  const maxDrop = opts?.maxDrop ?? 25;
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;

  box.getCenter(_center);
  // Origine juste au-dessus du haut de l'AABB → descente sur la surface.
  _origin.set(_center.x, box.max.y + 0.05, _center.z);
  raycaster.set(_origin, _down);
  raycaster.near = 0;
  raycaster.far = maxDrop + (box.max.y - box.min.y) + 0.1;

  const hits = raycaster.intersectObjects(candidates, true);
  const hit = hits.find((h) => !isSelfOrDescendant(h.object, object));
  if (!hit) return false;

  object.getWorldPosition(_worldPos);
  const deltaY = hit.point.y - box.min.y;
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) > maxDrop + 1) return false;
  // Déjà collé (epsilon) → pas de micro-saut.
  if (Math.abs(deltaY) < 1e-4) return false;

  _worldPos.y += deltaY;
  setLocalFromWorldPosition(object, _worldPos);
  return true;
}

/**
 * Cherche le meilleur couple (sommet mobile → sommet cible) sous le seuil.
 * Retourne le vecteur à appliquer en position monde, ou null.
 */
export function findVertexSnapOffset(
  moving: readonly THREE.Vector3[],
  targets: readonly THREE.Vector3[],
  threshold: number
): THREE.Vector3 | null {
  if (moving.length === 0 || targets.length === 0 || threshold <= 0) return null;
  let bestDist = threshold;
  let best: THREE.Vector3 | null = null;
  for (let i = 0; i < moving.length; i++) {
    const m = moving[i];
    for (let j = 0; j < targets.length; j++) {
      const t = targets[j];
      const d = m.distanceTo(t);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
  }
  if (!best) return null;
  // Offset = cible − (le moving le plus proche re-pairé) — on re-trouve m.
  let nearestM = moving[0];
  let nd = nearestM.distanceTo(best);
  for (let i = 1; i < moving.length; i++) {
    const d = moving[i].distanceTo(best);
    if (d < nd) {
      nd = d;
      nearestM = moving[i];
    }
  }
  return best.clone().sub(nearestM);
}

/** Applique un offset monde sur `object` (parent-aware). */
export function applyWorldOffset(object: THREE.Object3D, offset: THREE.Vector3): void {
  object.getWorldPosition(_worldPos);
  _worldPos.add(offset);
  setLocalFromWorldPosition(object, _worldPos);
}
