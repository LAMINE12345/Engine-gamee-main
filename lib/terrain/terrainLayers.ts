import * as THREE from 'three';
import { DEFAULT_TERRAIN_LAYERS } from '../../types/terrain';
import type { TerrainLayerDef } from '../../types/terrain';
import { mulberry32 } from './terrainCompute';

// ---------------------------------------------------------------------------
// Textures de détail procédurales (canvas, déterministes, tuilables)
// ---------------------------------------------------------------------------

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  return [canvas, ctx];
}

function tileNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  base: [number, number, number],
  amp: number,
  cell: number
): void {
  const img = ctx.createImageData(size, size);
  // Bruit valeur tuilable (lattice périodique).
  const lattice: number[][] = [];
  for (let y = 0; y < cell; y++) {
    lattice[y] = [];
    for (let x = 0; x < cell; x++) lattice[y][x] = rand();
  }
  const at = (x: number, y: number): number =>
    lattice[((y % cell) + cell) % cell][((x % cell) + cell) % cell];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cell;
      const fy = (y / size) * cell;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const v =
        at(x0, y0) * (1 - sx) * (1 - sy) +
        at(x0 + 1, y0) * sx * (1 - sy) +
        at(x0, y0 + 1) * (1 - sx) * sy +
        at(x0 + 1, y0 + 1) * sx * sy;
      const v2 = (v - 0.5) * 2; // -1..1
      const o = (y * size + x) * 4;
      img.data[o] = Math.max(0, Math.min(255, base[0] + v2 * amp));
      img.data[o + 1] = Math.max(0, Math.min(255, base[1] + v2 * amp));
      img.data[o + 2] = Math.max(0, Math.min(255, base[2] + v2 * amp));
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function grassBlades(
  ctx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  base: [number, number, number]
): void {
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, size, size);
  // Brins verticaux avec wrap horizontal (tuilable en x, distorsion en y OK).
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 9;
    const shade = 0.75 + rand() * 0.5;
    ctx.strokeStyle = `rgb(${Math.min(255, base[0] * shade) | 0},${Math.min(255, base[1] * shade) | 0},${Math.min(255, base[2] * shade) | 0})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Wrap manuel pour la tuilabilité horizontale.
    const x2 = x + (rand() - 0.5) * 3;
    ctx.lineTo(x2, y - len);
    ctx.stroke();
    if (x2 < 0 || x2 >= size) {
      ctx.beginPath();
      ctx.moveTo(x2 < 0 ? x2 + size : x2 - size, y);
      ctx.lineTo(x2 < 0 ? x2 + size : x2 - size, y - len);
      ctx.stroke();
    }
  }
}

const detailTextureCache = new Map<string, THREE.CanvasTexture>();

/** Texture de détail 256² par couche (cache partagé). */
export function getDetailTexture(layerId: string): THREE.CanvasTexture {
  const cached = detailTextureCache.get(layerId);
  if (cached) return cached;
  const rand = mulberry32(1000 + layerId.length * 77 + layerId.charCodeAt(0));
  const [canvas, ctx] = makeCanvas(256);
  if (layerId === 'grass') {
    tileNoise(ctx, 256, rand, [110, 140, 80], 26, 6);
    grassBlades(ctx, 256, rand, [95, 135, 70]);
  } else if (layerId === 'rock') {
    tileNoise(ctx, 256, rand, [105, 105, 115], 34, 5);
    // Strates horizontales.
    ctx.globalAlpha = 0.25;
    for (let y = 0; y < 256; y += 8 + Math.floor(rand() * 10)) {
      ctx.fillStyle = rand() > 0.5 ? '#6b6b75' : '#3f3f46';
      ctx.fillRect(0, y, 256, 2);
    }
    ctx.globalAlpha = 1;
  } else if (layerId === 'sand') {
    tileNoise(ctx, 256, rand, [205, 180, 135], 18, 9);
  } else {
    tileNoise(ctx, 256, rand, [235, 240, 248], 12, 7);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  detailTextureCache.set(layerId, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Matériau terrain : MeshStandardMaterial + splat ×4 + discard trous
// ---------------------------------------------------------------------------

export interface TerrainMaterialOptions {
  layers?: TerrainLayerDef[];
  terrainSize: number;
  wireframe?: boolean;
  flatShading?: boolean;
}

/** Nombre de couches melangeables par le splat (contrainte du shader). */
export const TERRAIN_LAYER_COUNT = 4;

/**
 * Chunk vertex injecté dans `#include <uv_vertex>`.
 * On n'y lit QUE `uv`, déclaré par le préfixe vertex.
 */
function splatUvChunk(): string {
  return `#include <uv_vertex>
        vSplatUv = uv;`;
}

/**
 * Chunk vertex injecté dans `#include <begin_vertex>`.
 * `transformed` est déclaré par ce chunk (« vec3 transformed = vec3(position) ») :
 * l'injecter plus tôt — typiquement après `<uv_vertex>` — fait échouer la
 * compilation avec « 'transformed' : undeclared identifier », car le meshphysical
 *_vertex place `<uv_vertex>` AVANT `<begin_vertex>`.
 */
function splatWorldPosChunk(): string {
  return `#include <begin_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`;
}

/**
 * Chunk fragment injecté dans `#include <color_fragment>`.
 *
 * La boucle `for (int k = 0; k < 4; k++) { ... tDetail[k] ... }` est
 * volontairement dépliée : en GLSL ES 1.00 un tableau de SAMPLERS doit être
 * indexé par une expression entière constante (« array index for samplers must
 * be constant integral expressions »). Les indices de boucle n'en sont pas
 * une, sur tous les pilotes. On déplie aussi `uTint[k]` par la même occasion,
 * l'indexation dynamique n'étant pas garantie pour un tableau de uniforms non
 * sampler dans un fragment shader.
 */
function splatAlbedoChunk(): string {
  const repeatComp = ['x', 'y', 'z', 'w'];
  const splatChannel = ['sw.r', 'sw.g', 'sw.b', 'sw.a'];
  const lines: string[] = [];
  for (let i = 0; i < TERRAIN_LAYER_COUNT; i++) {
    lines.push(
      `            albedo += texture2D(tDetail[${i}], vWPos.xz / uTerrainSize * uTileRepeat.${repeatComp[i]}).rgb * uTint[${i}] * ${splatChannel[i]} * 2.0;`
    );
  }
  return `#include <color_fragment>
        {
          float hole = texture2D(tHole, vSplatUv).r;
          if (hole > 0.5) discard;
          vec4 sw = texture2D(tSplat, vSplatUv);
          vec3 albedo = vec3(0.0);
${lines.join('\n')}
          diffuseColor.rgb *= albedo;
        }`;
}

/**
 * Applique les injections splat à un couple de shaders.
 * Exporté pour être testé hors WebGL : on rejoue l'injection sur les vrais
 * sources de Three.js et on vérifie l'ordre des déclarations.
 */
export function injectSplatShaderChunks(vertexShader: string, fragmentShader: string): {
  vertexShader: string;
  fragmentShader: string;
} {
  return {
    vertexShader: vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vSplatUv;
        varying vec3 vWPos;`
      )
      .replace('#include <uv_vertex>', splatUvChunk())
      .replace('#include <begin_vertex>', splatWorldPosChunk()),
    fragmentShader: fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tSplat;
        uniform sampler2D tHole;
        uniform sampler2D tDetail[${TERRAIN_LAYER_COUNT}];
        uniform vec3 uTint[${TERRAIN_LAYER_COUNT}];
        uniform vec4 uTileRepeat;
        uniform float uTerrainSize;
        varying vec2 vSplatUv;
        varying vec3 vWPos;`
      )
      .replace('#include <color_fragment>', splatAlbedoChunk()),
  };
}

export function makeTerrainMaterial(opts: TerrainMaterialOptions): THREE.MeshStandardMaterial {
  const layers = opts.layers ?? DEFAULT_TERRAIN_LAYERS;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.05,
    wireframe: opts.wireframe ?? false,
    flatShading: opts.flatShading ?? true,
  });

  const details = [getDetailTexture('grass'), getDetailTexture('rock'), getDetailTexture('sand'), getDetailTexture('snow')];
  const tints = layers.map((l) => new THREE.Color(l.tint ?? '#ffffff'));
  while (tints.length < 4) tints.push(new THREE.Color('#ffffff'));
  const repeats = new THREE.Vector4(
    layers[0]?.tileRepeat ?? 24,
    layers[1]?.tileRepeat ?? 18,
    layers[2]?.tileRepeat ?? 30,
    layers[3]?.tileRepeat ?? 20
  );

  const splatTex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  splatTex.needsUpdate = true;
  const holeTex = new THREE.DataTexture(new Uint8Array(1), 1, 1);
  holeTex.needsUpdate = true;
  // Porteur mutable : la compilation (1ère frame) lit les textures COURANTES,
  // pas celles du moment de la création du matériau.
  const texHolder = { splat: splatTex as THREE.Texture, hole: holeTex as THREE.Texture };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tSplat = { value: texHolder.splat };
    shader.uniforms.tHole = { value: texHolder.hole };
    shader.uniforms.tDetail = { value: details };
    shader.uniforms.uTint = { value: tints };
    shader.uniforms.uTileRepeat = { value: repeats };
    shader.uniforms.uTerrainSize = { value: Math.max(1, opts.terrainSize) };
    (mat.userData as Record<string, unknown>).splatShader = shader;

    // Deux injections distinctes : `uv` existe dès <uv_vertex>, mais
    // `transformed` n'apparaît qu'au chunk <begin_vertex>, plus bas.
    const injected = injectSplatShaderChunks(shader.vertexShader, shader.fragmentShader);
    shader.vertexShader = injected.vertexShader;
    shader.fragmentShader = injected.fragmentShader;
  };
  // La clé de cache inclut le code GLSL : le changer force la recompilation
  // chez les visiteurs qui avaient déjà compilé l'ancienne version.
  mat.customProgramCacheKey = () => 'aether-terrain-splat-v2';
  (mat.userData as Record<string, unknown>).terrainSplat = { splatTex, holeTex, texHolder };
  return mat;
}

/** Remplace les textures splat/trous du matériau (rebake). */
export function setTerrainSplatTextures(
  mat: THREE.Material | null | undefined,
  splat: THREE.DataTexture,
  hole: THREE.DataTexture
): void {
  if (!mat) return;
  const ud = mat.userData as Record<string, unknown>;
  const prev = ud.terrainSplat as
    | { splatTex: THREE.Texture; holeTex: THREE.Texture; texHolder: { splat: THREE.Texture; hole: THREE.Texture } }
    | undefined;
  // Libère les anciennes textures (pas les neuves).
  if (prev && prev.splatTex !== splat) prev.splatTex.dispose();
  if (prev && prev.holeTex !== hole) prev.holeTex.dispose();
  const texHolder = prev?.texHolder ?? { splat: splat as THREE.Texture, hole: hole as THREE.Texture };
  texHolder.splat = splat;
  texHolder.hole = hole;
  ud.terrainSplat = { splatTex: splat, holeTex: hole, texHolder };
  const shader = ud.splatShader as { uniforms: Record<string, { value: unknown }> } | undefined;
  if (shader) {
    shader.uniforms.tSplat.value = splat;
    shader.uniforms.tHole.value = hole;
  }
}
