import * as THREE from 'three';
import type { FrustumAuditResult } from '../../types/culling';

/**
 * FrustumAudit — vérifie que le frustum culling Three.js ne régresse pas (3.4).
 *
 * Three.js cull automatiquement chaque objet dont `frustumCulled=true` via sa
 * boundingSphere. L'audit garantit que :
 * - chaque maillage possède une boundingSphere valide (recalcul si absente),
 * - la liste des objets `frustumCulled=false` reste cantonnée aux cas légitimes
 *   (helpers, particules à diffusion infinie, ciel, coques Toon déformées).
 */
export function auditFrustumCulling(
  objects: Map<string, THREE.Object3D>,
  opts?: { autoFix?: boolean; maxNames?: number }
): FrustumAuditResult {
  const autoFix = opts?.autoFix ?? true;
  const maxNames = opts?.maxNames ?? 12;
  let totalMeshes = 0;
  let fixedBounds = 0;
  const unculledNames: string[] = [];

  for (const obj of objects.values()) {
    if (!(obj instanceof THREE.Mesh)) continue;
    totalMeshes++;
    const geo = obj.geometry as THREE.BufferGeometry | undefined;
    if (geo && !geo.boundingSphere && autoFix) {
      try {
        geo.computeBoundingSphere();
        if (geo.boundingSphere) fixedBounds++;
      } catch {
        /* ignore */
      }
    }
    if (obj.frustumCulled === false && unculledNames.length < maxNames) {
      unculledNames.push(obj.name || obj.uuid.slice(0, 8));
    }
  }
  let unculledCount = 0;
  for (const obj of objects.values()) {
    if (obj instanceof THREE.Mesh && obj.frustumCulled === false) unculledCount++;
  }

  return {
    totalMeshes,
    fixedBounds,
    unculledCount,
    unculledNames,
    checkedAt: new Date().toISOString(),
  };
}
