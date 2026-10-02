/**
 * types/culling.ts — configuration globale LOD / occlusion / impostors (3.4).
 *
 * Persistée dans `SceneExportData.settings` (bloc additif, défauts si absente).
 */

export interface LODGlobalConfig {
  /** Master switch du LOD géométrique (index-swap). */
  enabled: boolean;
  /** Active le dernier niveau billboard (impostors 2D au-delà du LOD grossier). */
  billboardEnabled: boolean;
  /** Rayon min (m) d'un maillage pour devenir candidat impostor. */
  impostorMinRadius: number;
  /** Facteur × dernière distance LOD pour la bascule billboard (défaut si pas de LOD). */
  billboardFactor: number;
  /** Distance billboard (m) quand le maillage n'a pas de niveaux LOD. */
  billboardFallbackDistance: number;
  /** Taille (px) de la capture d'impostor. */
  impostorCaptureSize: number;
}

export const DEFAULT_LOD_CONFIG: LODGlobalConfig = {
  enabled: true,
  billboardEnabled: true,
  impostorMinRadius: 2,
  billboardFactor: 1.8,
  billboardFallbackDistance: 150,
  impostorCaptureSize: 128,
};

export function normalizeLODConfig(data?: Partial<LODGlobalConfig> | null): LODGlobalConfig {
  const d = data ?? {};
  const finite = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    enabled: typeof d.enabled === 'boolean' ? d.enabled : DEFAULT_LOD_CONFIG.enabled,
    billboardEnabled:
      typeof d.billboardEnabled === 'boolean'
        ? d.billboardEnabled
        : DEFAULT_LOD_CONFIG.billboardEnabled,
    impostorMinRadius: Math.max(
      0.25,
      finite(d.impostorMinRadius, DEFAULT_LOD_CONFIG.impostorMinRadius)
    ),
    billboardFactor: Math.max(1.1, finite(d.billboardFactor, DEFAULT_LOD_CONFIG.billboardFactor)),
    billboardFallbackDistance: Math.max(
      10,
      finite(d.billboardFallbackDistance, DEFAULT_LOD_CONFIG.billboardFallbackDistance)
    ),
    impostorCaptureSize: Math.max(
      32,
      Math.min(512, Math.round(finite(d.impostorCaptureSize, DEFAULT_LOD_CONFIG.impostorCaptureSize)))
    ),
  };
}

export interface CullingConfig {
  /** Master switch de l'occlusion culling (raycast échelonné). */
  occlusionEnabled: boolean;
  /** Raycasts d'occlusion max par frame (budget). */
  raysPerFrame: number;
  /** En deçà (m), un objet n'est jamais occlus. */
  minDistance: number;
  /** Rayon min (m) pour qu'un maillage soit classé occluder. */
  occluderMinRadius: number;
  /** Rayon max (m) d'un maillage pour être testé comme occludee. */
  occludeeMaxRadius: number;
  /** Frames consécutives "caché" avant de masquer (hystérésis). */
  hideAfterFrames: number;
}

export const DEFAULT_CULLING_CONFIG: CullingConfig = {
  occlusionEnabled: true,
  raysPerFrame: 4,
  minDistance: 5,
  occluderMinRadius: 8,
  occludeeMaxRadius: 30,
  hideAfterFrames: 2,
};

export function normalizeCullingConfig(data?: Partial<CullingConfig> | null): CullingConfig {
  const d = data ?? {};
  const finite = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    occlusionEnabled:
      typeof d.occlusionEnabled === 'boolean'
        ? d.occlusionEnabled
        : DEFAULT_CULLING_CONFIG.occlusionEnabled,
    raysPerFrame: Math.max(
      1,
      Math.min(32, Math.round(finite(d.raysPerFrame, DEFAULT_CULLING_CONFIG.raysPerFrame)))
    ),
    minDistance: Math.max(0, finite(d.minDistance, DEFAULT_CULLING_CONFIG.minDistance)),
    occluderMinRadius: Math.max(
      1,
      finite(d.occluderMinRadius, DEFAULT_CULLING_CONFIG.occluderMinRadius)
    ),
    occludeeMaxRadius: Math.max(
      2,
      finite(d.occludeeMaxRadius, DEFAULT_CULLING_CONFIG.occludeeMaxRadius)
    ),
    hideAfterFrames: Math.max(
      1,
      Math.min(10, Math.round(finite(d.hideAfterFrames, DEFAULT_CULLING_CONFIG.hideAfterFrames)))
    ),
  };
}

export interface CullingStats {
  lodMeshes: number;
  impostors: number;
  impostorCaptures: number;
  occluders: number;
  occludees: number;
  occludedHidden: number;
  occlusionRaysLastFrame: number;
}

export interface FrustumAuditResult {
  totalMeshes: number;
  /** Maillages dont la boundingSphere a été (re)calculée par l'audit. */
  fixedBounds: number;
  /** Objets avec frustumCulled=false (attendu : helpers, particules, ciel). */
  unculledCount: number;
  unculledNames: string[];
  checkedAt: string;
}
