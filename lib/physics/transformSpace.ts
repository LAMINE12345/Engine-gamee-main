import * as THREE from 'three';

/**
 * transformSpace.ts — conversions monde ↔ local pour la hiérarchie parent-enfant.
 *
 * Les corps Rapier vivent dans l'espace MONDE ; les Object3D stockent des
 * transforms LOCALES. Toutes les passerelles physique ↔ scène DOIVENT passer
 * par ces helpers (objets racines : identité, coût nul).
 */

const _wq = new THREE.Quaternion();
const _wp = new THREE.Vector3();

/** Position monde (met à jour la chaîne de parents d'abord). */
export function getWorldPosition(obj: THREE.Object3D, target = new THREE.Vector3()): THREE.Vector3 {
  return obj.getWorldPosition(target);
}

/** Quaternion monde (met à jour la chaîne de parents d'abord). */
export function getWorldQuaternion(obj: THREE.Object3D, target = new THREE.Quaternion()): THREE.Quaternion {
  return obj.getWorldQuaternion(target);
}

/** Écrit une position MONDE dans la locale de l'objet (via parent inverse). */
export function setLocalFromWorldPosition(obj: THREE.Object3D, worldPos: THREE.Vector3): void {
  const parent = obj.parent;
  if (!parent) {
    obj.position.copy(worldPos);
    return;
  }
  obj.updateWorldMatrix(true, false);
  obj.position.copy(parent.worldToLocal(_wp.copy(worldPos)));
}

/** Écrit un quaternion MONDE dans la locale de l'objet (via parent inverse). */
export function setLocalFromWorldQuaternion(obj: THREE.Object3D, worldQuat: THREE.Quaternion): void {
  const parent = obj.parent;
  if (!parent) {
    obj.quaternion.copy(worldQuat);
    return;
  }
  parent.getWorldQuaternion(_wq).invert();
  obj.quaternion.copy(_wq.multiply(worldQuat));
}

/**
 * Convertit un déplacement MONDE en déplacement local (rotation parent
 * inverse, translation-normalisée). Pour les déplacements cinématiques
 * (CharacterController fallback...) appliqués à obj.position.
 */
export function worldDisplacementToLocal(
  obj: THREE.Object3D,
  worldDisp: THREE.Vector3,
  target = new THREE.Vector3()
): THREE.Vector3 {
  const parent = obj.parent;
  if (!parent) return target.copy(worldDisp);
  parent.getWorldQuaternion(_wq).invert();
  return target.copy(worldDisp).applyQuaternion(_wq);
}
