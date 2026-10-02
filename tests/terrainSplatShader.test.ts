import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { injectSplatShaderChunks, TERRAIN_LAYER_COUNT } from '../lib/terrain/terrainLayers';

const V = THREE.ShaderLib.physical.vertexShader;
const F = THREE.ShaderLib.physical.fragmentShader;

function inject() {
  return injectSplatShaderChunks(V, F);
}

/**
 * Indices de toutes les utilisations d'un identifiant dans un source GLSL.
 * Permet d'affirmer qu'un usage précède (ou suit) sa déclaration.
 */
function indexesOf(src: string, token: string): number[] {
  const out: number[] = [];
  let i = src.indexOf(token);
  while (i !== -1) {
    out.push(i);
    i = src.indexOf(token, i + token.length);
  }
  return out;
}

describe('injection splat du terrain', () => {
  it('SIMULATION: l’ancien chunk (transformed après uv_vertex) est bien invalide', () => {
    // Ce test ne teste pas notre code : il rejoue l'ANCIENNE injection et vérifie
    // qu'elle place bien `transformed` avant sa déclaration. Il sert de témoin :
    // si un jour l'ordre des chunks Three change, le test principal doit être
    // revu plutôt que silencieusement faux.
    const bad = V.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    const usePos = bad.indexOf('vWPos = (modelMatrix');
    const beginPos = bad.indexOf('#include <begin_vertex>');
    expect(usePos).toBeGreaterThan(-1);
    expect(usePos).toBeLessThan(beginPos); // <- l'ordre cassé
  });

  it("n'utilise `transformed` qu'après sa déclaration par begin_vertex", () => {
    // Régression : `vWPos = (modelMatrix * vec4(transformed, 1.0))` était injecté
    // après <uv_vertex>, alors que `transformed` n'est déclaré que par
    // <begin_vertex> → « 'transformed' : undeclared identifier ».
    const { vertexShader } = inject();
    const decl = THREE.ShaderChunk.begin_vertex.indexOf('vec3 transformed');
    expect(decl).toBeGreaterThanOrEqual(0);

    // Le chunk begin_vertex est développé : on cherche sa première ligne utile.
    const beginPos = vertexShader.indexOf('#include <begin_vertex>');
    expect(beginPos).toBeGreaterThan(-1);

    // Tout usage de `transformed` par NOTRE code doit être après le point
    // d'injection (qui suit le chunk developpé).
    const ourUse = indexesOf(vertexShader, 'vWPos = (modelMatrix');
    expect(ourUse).toHaveLength(1);
    expect(ourUse[0]).toBeGreaterThan(beginPos);
  });

  it('injecte vSplatUv avant tout usage, et déclare les varyings', () => {
    const { vertexShader, fragmentShader } = inject();
    expect(vertexShader).toContain('varying vec2 vSplatUv;');
    expect(vertexShader).toContain('varying vec3 vWPos;');
    expect(fragmentShader).toContain('varying vec2 vSplatUv;');
    expect(fragmentShader).toContain('varying vec3 vWPos;');
    expect(vertexShader).toContain('vSplatUv = uv;');
  });

  it('n’indexe plus AUCUN tableau de samplers avec une variable', () => {
    // Régression : `texture2D(tDetail[k], ...)` dans une boucle
    // → « array index for samplers must be constant integral expressions ».
    const { fragmentShader } = inject();
    expect(fragmentShader).not.toMatch(/tDetail\[\s*k\s*\]/);
    expect(fragmentShader).not.toMatch(/tDetail\[\s*[a-z_]+\s*\]/);
    for (let i = 0; i < TERRAIN_LAYER_COUNT; i++) {
      expect(fragmentShader).toContain(`tDetail[${i}]`);
    }
  });

  it('n’indexe plus uTint dynamiquement', () => {
    const { fragmentShader } = inject();
    expect(fragmentShader).not.toMatch(/uTint\[\s*k\s*\]/);
    for (let i = 0; i < TERRAIN_LAYER_COUNT; i++) {
      expect(fragmentShader).toContain(`uTint[${i}]`);
    }
  });

  it('supprime la boucle for et conserve le mélange pondéré', () => {
    const { fragmentShader } = inject();
    expect(fragmentShader).not.toMatch(/for\s*\(\s*int\s+k/);
    // 4 couches pondérées par les 4 canaux du splat, facteur 2.0 conservé.
    expect(fragmentShader.match(/albedo \+=/g)).toHaveLength(TERRAIN_LAYER_COUNT);
    for (const chan of ['sw.r', 'sw.g', 'sw.b', 'sw.a']) {
      expect(fragmentShader).toContain(chan);
    }
    expect(fragmentShader).toContain('* 2.0;');
  });

  it('conserve les 4 composantes de uTileRepeat dans le bon ordre', () => {
    const { fragmentShader } = inject();
    const order = ['x', 'y', 'z', 'w'].map((c) => fragmentShader.indexOf(`uTileRepeat.${c}`));
    for (const o of order) expect(o).toBeGreaterThan(-1);
    // Ordre croissant = couches 0..3.
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('conserve le discard des trous et le masque de splat', () => {
    const { fragmentShader } = inject();
    expect(fragmentShader).toContain('if (hole > 0.5) discard;');
    expect(fragmentShader).toContain('texture2D(tHole, vSplatUv)');
    expect(fragmentShader).toContain('texture2D(tSplat, vSplatUv)');
    expect(fragmentShader).toContain('diffuseColor.rgb *= albedo;');
  });

  it('déclare les uniforms avec la taille de tableau attendue', () => {
    const { fragmentShader } = inject();
    expect(fragmentShader).toContain(`uniform sampler2D tDetail[${TERRAIN_LAYER_COUNT}];`);
    expect(fragmentShader).toContain(`uniform vec3 uTint[${TERRAIN_LAYER_COUNT}];`);
    expect(fragmentShader).toContain('uniform vec4 uTileRepeat;');
    expect(fragmentShader).toContain('uniform float uTerrainSize;');
  });

  it('applique la projection monde via modelMatrix', () => {
    const { vertexShader } = inject();
    expect(vertexShader).toContain('vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  });

  it('laisse les autres chunks du shader intacts', () => {
    const { vertexShader, fragmentShader } = inject();
    // Les includes non ciblés doivent subsister pour que Three les expanse.
    expect(vertexShader).toContain('#include <project_vertex>');
    expect(vertexShader).toContain('#include <fog_vertex>');
    expect(fragmentShader).toContain('#include <tonemapping_fragment>');
    expect(fragmentShader).toContain('#include <colorspace_fragment>');
  });
});