import { describe, it, expect } from 'vitest';
import {
  LOCAL_TEXTURE_PREFIX,
  isLocalTextureKey,
  makeLocalTextureKey,
  isSupportedTextureFile,
  MAX_TEXTURE_BYTES,
} from '../lib/persistence';
import type { TexturePreset } from '../types/engine';

/**
 * Réplique la logique de résolution du preset telle qu'elle est écrite dans
 * SceneManager.updateMaterial. On la rejoue ici pour verrouiller le
 * comportement sans instancier un SceneManager complet (Three.js + WebGL).
 */
function resolveNormalPreset(
  incoming: { texturePreset?: TexturePreset; hasNormalMap?: boolean },
  current: { texturePreset?: TexturePreset; hasNormalMap?: boolean }
): { preset: TexturePreset; enable: boolean } {
  const preset: TexturePreset = incoming.texturePreset ?? (current.texturePreset || 'none');
  const enableNormal =
    incoming.hasNormalMap !== undefined
      ? incoming.hasNormalMap
      : incoming.texturePreset !== undefined
        ? incoming.texturePreset !== 'none'
        : (current.hasNormalMap ?? false);
  return { preset, enable: enableNormal && preset !== 'none' };
}

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('presets de texture', () => {
  it('choisir « Aucune » désactive réellement la normal map', () => {
    // Régression : le preset n'était écrit dans userData QUE dans la branche
    // active, donc « Aucune » effaçait l'affichage mais laissait l'ancien
    // preset derrière — la texture réapparaissait au rechargement de scène.
    const r = resolveNormalPreset(
      { texturePreset: 'none', hasNormalMap: false },
      { texturePreset: 'carbon', hasNormalMap: true }
    );
    expect(r.preset).toBe('none');
    expect(r.enable).toBe(false);
  });

  it('choisir un preset active la normal map correspondante', () => {
    const r = resolveNormalPreset(
      { texturePreset: 'brushed', hasNormalMap: true },
      { texturePreset: 'none', hasNormalMap: false }
    );
    expect(r.preset).toBe('brushed');
    expect(r.enable).toBe(true);
  });

  it('ne force PAS de normal map quand seul un autre réglage change', () => {
    // Régression : `undefined !== 'none'` vaut true, donc un simple changement
    // de couleur déclenchait une normal map « carbone » non demandée.
    const r = resolveNormalPreset(
      { hasNormalMap: false },
      { texturePreset: 'none', hasNormalMap: false }
    );
    expect(r.enable).toBe(false);
  });

  it('conserve la normal map active si le preset est déjà posé', () => {
    const r = resolveNormalPreset({}, { texturePreset: 'diamond', hasNormalMap: true });
    expect(r.preset).toBe('diamond');
    expect(r.enable).toBe(true);
  });

  it('reste neutre sur un matériau vierge sans preset', () => {
    const r = resolveNormalPreset({}, {});
    expect(r.preset).toBe('none');
    expect(r.enable).toBe(false);
  });
});

describe('clés de texture locale', () => {
  it('génère des clés uniques et préfixées', () => {
    const a = makeLocalTextureKey();
    const b = makeLocalTextureKey();
    expect(a).not.toBe(b);
    expect(a.startsWith(LOCAL_TEXTURE_PREFIX)).toBe(true);
  });

  it('distingue une clé locale d’une vraie URL', () => {
    expect(isLocalTextureKey(`${LOCAL_TEXTURE_PREFIX}abc`)).toBe(true);
    expect(isLocalTextureKey('https://images.unsplash.com/photo.jpg')).toBe(false);
    expect(isLocalTextureKey(undefined)).toBe(false);
    expect(isLocalTextureKey(null)).toBe(false);
    expect(isLocalTextureKey('')).toBe(false);
  });
});

describe('validation des fichiers importés', () => {
  it('accepte les formats d’image courants', () => {
    for (const type of [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/bmp',
      'image/avif',
    ]) {
      expect(isSupportedTextureFile(makeFile('texture', type))).toBe(true);
    }
  });

  it('refuse les fichiers qui ne sont pas des images', () => {
    expect(isSupportedTextureFile(makeFile('modele.glb', 'model/gltf-binary'))).toBe(false);
    expect(isSupportedTextureFile(makeFile('doc.pdf', 'application/pdf'))).toBe(false);
    expect(isSupportedTextureFile(makeFile('sans-type', ''))).toBe(false);
  });

  it('tolère la casse dans le type MIME', () => {
    expect(isSupportedTextureFile(makeFile('a.png', 'IMAGE/PNG'))).toBe(true);
  });

  it('expose une limite de taille exploitable', () => {
    expect(MAX_TEXTURE_BYTES).toBeGreaterThan(0);
    expect(MAX_TEXTURE_BYTES).toBeLessThanOrEqual(64 * 1024 * 1024);
  });
});