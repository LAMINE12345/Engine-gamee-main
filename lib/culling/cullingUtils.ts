import * as THREE from 'three';

/** Sous-types jamais soumis au LOD / impostors / occlusion (volumes, helpers, eau). */
const NON_SOLID_SUBTYPES = new Set([
  'triggerVolume',
  'checkpoint',
  'postProcessVolume',
  'water',
  'river',
]);

/** Fragments de noms exclus (ciel, helpers, gizmos, sprites d'impostor, PPV). */
const NON_SOLID_NAME_HINTS = [
  '__aether_sky',
  '__aether_impostor',
  '__aether_ppv',
  'helper',
  'gizmo',
];

export function isNonSolid(obj: THREE.Object3D): boolean {
  const ud = (obj.userData ?? {}) as Record<string, unknown>;
  const sub = ud.subType;
  if (typeof sub === 'string' && NON_SOLID_SUBTYPES.has(sub)) return true;
  if (ud.isWaterSystem === true) return true;
  const name = (obj.name || '').toLowerCase();
  return NON_SOLID_NAME_HINTS.some((h) => name.includes(h));
}

/** Animé / instancié / terrain : jamais d'impostor (pose figée ou volume aberrant). */
export function isImpostorEligible(obj: THREE.Object3D): boolean {
  if (!(obj instanceof THREE.Mesh)) return false;
  if ((obj as THREE.SkinnedMesh).isSkinnedMesh || (obj as THREE.InstancedMesh).isInstancedMesh) {
    return false;
  }
  const ud = (obj.userData ?? {}) as Record<string, unknown>;
  if (ud.isTerrain === true || ud.isFoliage === true || ud.rigAnim !== undefined) return false;
  return !isNonSolid(obj);
}

/** L'occlusion culling ignore l'instancié (pop par chunk) et l'eau (transparente). */
export function isOcclusionEligible(obj: THREE.Object3D): boolean {
  if (!(obj instanceof THREE.Mesh)) return false;
  if ((obj as THREE.InstancedMesh).isInstancedMesh) return false;
  return !isNonSolid(obj);
}

/** Rayon monde de la boundingSphere (0 si indisponible). */
export function meshRadius(obj: THREE.Object3D): number {
  if (!(obj instanceof THREE.Mesh)) return 0;
  const geo = obj.geometry as THREE.BufferGeometry | undefined;
  if (!geo) return 0;
  if (!geo.boundingSphere) {
    try {
      geo.computeBoundingSphere();
    } catch {
      return 0;
    }
  }
  const r = geo.boundingSphere?.radius ?? 0;
  if (!Number.isFinite(r) || r <= 0) return 0;
  const s = obj.scale;
  const maxScale = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z), 1e-6);
  return r * maxScale;
}

/** Centre monde de la boundingSphere (retombe sur la position). */
export function meshCenter(obj: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  if (obj instanceof THREE.Mesh) {
    const geo = obj.geometry as THREE.BufferGeometry | undefined;
    if (geo?.boundingSphere) {
      out.copy(geo.boundingSphere.center).applyMatrix4(obj.matrixWorld);
      return out;
    }
  }
  return obj.getWorldPosition(out);
}
