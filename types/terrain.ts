export type TerrainSculptMode =
  | 'none'
  | 'raise'
  | 'lower'
  | 'smooth'
  | 'flatten'
  | 'paint_grass'
  | 'paint_rock'
  | 'paint_sand'
  | 'paint_snow';

/**
 * Identifiant d'élément instancié de la végétation.
 * - ids de la bibliothèque low-poly `LOW_POLY_set.glb` (nom de node Blender, ex. `conifer2_Cylinder.001`)
 * - ids legacy procéduraux conservés pour les anciennes scènes (`pine_tree`, `rock`, …)
 */
export type FoliageType = string;

export interface FoliageInstance {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  colorHex?: string;
  /** Décalage altitude par rapport au terrain (y = terrainY + yOff). */
  yOff?: number;
}

/** Selection d'une instance foliage peinte (objets low-poly du panneau Terrain). */
export interface FoliageSelectionInfo {
  type: FoliageType;
  /** Index de l'instance dans son calque (identique à l'instanceId GPU). */
  instanceId: number;
  /** Nom affiché (bibliothèque low-poly) ou id legacy. */
  name: string;
  category: string;
  scale: number;
  /** Rotation Y en radians. */
  rotY: number;
  /** Altitude relative au terrain, en mètres. */
  yOff: number;
}

/** Patch d'édition d'une instance sélectionnée. */
export interface FoliageEditPatch {
  scale?: number;
  rotY?: number;
  yOff?: number;
}

export interface FoliageLayer {
  type: FoliageType;
  name: string;
  instances: FoliageInstance[];
}

export interface TerrainConfig {
  enabled: boolean;
  size: number; // e.g. 60 meters
  resolution: number; // segments, e.g. 64 or 128
  heightScale: number; // max elevation, e.g. 8m
  seed: number;
  roughness: number; // noise frequency
  octaves: number;
  wireframe: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  colors: {
    grass: string;
    rock: string;
    sand: string;
    snow: string;
  };
  // --- 4.3 : couches, chunks, détails, worker ---
  /** Côtés de la grille de chunks (1 = mesh unique legacy, 2 ou 4). */
  chunks: number;
  /** Distance (m) de bascule LOD simplifié par chunk. */
  chunkLodDistance: number;
  /** Distance (m) max de construction des détails. */
  detailDistance: number;
  /** Densité auto des détails (0-10, 0 = que la peinture manuelle). */
  detailDensity: number;
  /** Résolution de la splatmap (px). */
  splatSize: number;
  /** Génération lourde dans un Web Worker (repli synchrone si indisponible). */
  useWorker: boolean;
}

export interface TerrainBrushConfig {
  mode: TerrainSculptMode | 'foliage_paint' | 'foliage_erase' | 'layer_paint' | 'hole_paint' | 'hole_erase' | 'detail_paint' | 'detail_erase';
  radius: number; // 1 to 15 meters
  strength: number; // 0.1 to 2.0
  flattenHeight: number;
  selectedFoliage: FoliageType;
  foliageDensity: number; // 1 to 10
  foliageScaleMin: number;
  foliageScaleMax: number;
  /** Couche active pour layer_paint (0 herbe, 1 roche, 2 sable, 3 neige). */
  selectedLayer: number;
  /** Type de détail pour detail_paint. */
  selectedDetail: 'grass' | 'pebble';
  detailDensity: number; // 1 to 10
}

export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  enabled: false,
  size: 64,
  resolution: 64,
  heightScale: 7.5,
  seed: 42,
  roughness: 0.04,
  octaves: 4,
  wireframe: false,
  castShadow: true,
  receiveShadow: true,
  colors: {
    grass: '#3d7a36',
    rock: '#52525b',
    sand: '#d4b483',
    snow: '#f1f5f9',
  },
  chunks: 1,
  chunkLodDistance: 60,
  detailDistance: 45,
  detailDensity: 5,
  splatSize: 256,
  useWorker: true,
};

export const DEFAULT_TERRAIN_BRUSH: TerrainBrushConfig = {
  mode: 'none',
  radius: 4.5,
  strength: 0.6,
  flattenHeight: 1.0,
  selectedFoliage: 'conifer2_Cylinder.001',
  foliageDensity: 3,
  foliageScaleMin: 0.7,
  foliageScaleMax: 1.3,
  selectedLayer: 0,
  selectedDetail: 'grass',
  detailDensity: 4,
};

// =========================================================================
// 4.3 — couches (splatmap), trous, détails
// =========================================================================

/** Couche de terrain Unity-like : texture procédurale + règles auto. */
export interface TerrainLayerDef {
  id: 'grass' | 'rock' | 'sand' | 'snow';
  name: string;
  /** Teinte multipliée à la texture de détail. */
  tint: string;
  /** Répétitions de la texture sur la taille du terrain. */
  tileRepeat: number;
}

export const DEFAULT_TERRAIN_LAYERS: TerrainLayerDef[] = [
  { id: 'grass', name: 'Herbe', tint: '#3d7a36', tileRepeat: 24 },
  { id: 'rock', name: 'Roche', tint: '#52525b', tileRepeat: 18 },
  { id: 'sand', name: 'Sable', tint: '#d4b483', tileRepeat: 30 },
  { id: 'snow', name: 'Neige', tint: '#f1f5f9', tileRepeat: 20 },
];

/** Coup de pinceau couche (persisté, rejoué après les règles auto). */
export interface SplatStroke {
  x: number;
  z: number;
  radius: number;
  layer: number; // 0-3
  strength: number;
}

/** Trou circulaire (persisté, faces découpées + discard shader). */
export interface TerrainHole {
  x: number;
  z: number;
  radius: number;
}

export type DetailKind = 'grass' | 'pebble';

/** Coup de pinceau détail (persisté). */
export interface DetailStroke {
  x: number;
  z: number;
  radius: number;
  kind: DetailKind;
  add: boolean;
  density: number;
}

/** Bloc terrain étendu persisté dans la scène. */
export interface TerrainDetailData {
  splatStrokes: SplatStroke[];
  holes: TerrainHole[];
  detailPaint: DetailStroke[];
}
