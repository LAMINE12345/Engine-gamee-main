import { describe, it, expect } from 'vitest';
import {
  FORMAT_VERSION,
  KNOWN_VERSIONS,
  parseVersion,
  compareVersions,
  isOlderThan,
  isNewerThanCurrent,
  isSupported,
} from '../lib/serialize/format';
import {
  gateScene,
  validateScene,
  assertValidScene,
  SceneValidationError,
  VALIDATION_LIMITS,
} from '../lib/serialize/validator';
import { prepareScene } from '../lib/serialize/index';

/** Minimal valid scene payload at the canonical version. */
function scene(overrides: Record<string, unknown> = {}) {
  return {
    version: FORMAT_VERSION,
    nodes: [],
    environment: {
      backgroundColor: '#000000',
      ambientIntensity: 1,
      sunIntensity: 1,
      sunPosition: { x: 0, y: 1, z: 0 },
    },
    ...overrides,
  };
}

describe('serialize/format — version parsing', () => {
  it('exposes the canonical version in KNOWN_VERSIONS', () => {
    expect(KNOWN_VERSIONS).toContain(FORMAT_VERSION);
  });

  it('parses dotted semver strings', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion(' 1.2.3 ')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2.3-beta.1')).toEqual([1, 2, 3]);
  });

  it('rejects malformed versions', () => {
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('abc')).toBeNull();
    expect(parseVersion(123)).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  it('compares versions numerically, not lexically', () => {
    // Lexical comparison would wrongly rank "1.10.0" below "1.9.0".
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('treats unreadable versions as the oldest', () => {
    expect(compareVersions('garbage', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', 'garbage')).toBe(1);
    expect(compareVersions(null, undefined)).toBe(0);
  });

  it('classifies older / newer / supported versions', () => {
    expect(isOlderThan('1.0.0', FORMAT_VERSION)).toBe(true);
    expect(isOlderThan(FORMAT_VERSION, FORMAT_VERSION)).toBe(false);
    expect(isNewerThanCurrent('99.0.0')).toBe(true);
    expect(isSupported('99.0.0')).toBe(false);
    expect(isSupported(FORMAT_VERSION)).toBe(true);
  });
});

describe('serialize/validator — gateScene (pass 1)', () => {
  it('rejects non-object payloads and arrays', () => {
    for (const bad of [null, undefined, 42, 'scene', [], true]) {
      const res = gateScene(bad);
      expect(res.ok).toBe(false);
      expect(res.errors[0].path).toBe('$');
    }
  });

  it('accepts a structurally plausible scene', () => {
    const res = gateScene(scene());
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('accepts an empty object (repairable legacy input)', () => {
    expect(gateScene({}).ok).toBe(true);
  });

  it('rejects a non-array nodes field', () => {
    const res = gateScene({ nodes: 'not-an-array' });
    expect(res.ok).toBe(false);
    expect(res.errors[0].path).toBe('nodes');
  });

  it('rejects a non-string version field', () => {
    const res = gateScene({ version: 1.4 });
    expect(res.ok).toBe(false);
    expect(res.errors[0].path).toBe('version');
  });
});

describe('serialize/validator — validateScene (pass 2)', () => {
  it('requires the post-migration canonical version', () => {
    const res = validateScene(scene({ version: '1.0.0' }));
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.path === 'version')).toBe(true);
  });

  it('requires a nodes array', () => {
    const res = validateScene({ version: FORMAT_VERSION });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.path === 'nodes')).toBe(true);
  });

  it('validates node name and type', () => {
    const res = validateScene(
      scene({ nodes: [{ name: '', type: 'mesh' }, { name: 'ok', type: 'banana' }] })
    );
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.path === 'nodes[0].name')).toBe(true);
    expect(res.errors.some((e) => e.path === 'nodes[1].type')).toBe(true);
  });

  it('rejects non-object entries inside nodes', () => {
    const res = validateScene(scene({ nodes: [null] }));
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.path === 'nodes[0]')).toBe(true);
  });

  it('enforces the anti-DoS node cap', () => {
    const nodes = new Array(VALIDATION_LIMITS.maxNodes + 1)
      .fill(0)
      .map(() => ({ name: 'n', type: 'mesh' }));
    const res = validateScene(scene({ nodes }));
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.path === 'nodes' && e.message.includes('cap'))).toBe(true);
  });

  it('caps reported errors to avoid huge payloads', () => {
    const nodes = new Array(500).fill(0).map(() => ({ name: '', type: 'mesh' }));
    const res = validateScene(scene({ nodes }));
    expect(res.errors.length).toBeLessThanOrEqual(VALIDATION_LIMITS.maxIssues);
  });

  it('ignores unknown fields (forward compatibility)', () => {
    const res = validateScene(scene({ somethingUnknown: { a: 1 } }));
    expect(res.ok).toBe(true);
  });

  // `riverConfig` était typé `any` dans le document : le validateur, qui
  // travaille sur du JSON brut, ne le contrôlait pas du tout. Un lien de scène
  // partagé pouvait donc injecter `width: "NaN"` et faire explode le shader.
  describe('riverConfig', () => {
    const river = (riverConfig: unknown) =>
      scene({ nodes: [{ name: 'riv', type: 'mesh', riverConfig }] });

    it('accepte une configuration valide', () => {
      const res = validateScene(
        river({
          width: 6.5,
          length: 75,
          meanderFactor: 1.2,
          meanderAmplitude: 8,
          flowSpeed: 1.2,
          waterColor: '#0284c7',
          deepWaterColor: '#042f2e',
          foamColor: '#e0f2fe',
          foamIntensity: 0.75,
          autoCarveTerrain: true,
        })
      );
      expect(res.errors.filter((e) => e.path.includes('riverConfig'))).toEqual([]);
    });

    it('refuse une largeur non numérique', () => {
      const res = validateScene(river({ width: 'large' }));
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.path === 'nodes[0].riverConfig.width')).toBe(true);
    });

    it('refuse une couleur non textuelle', () => {
      const res = validateScene(river({ waterColor: 0x0284c7 }));
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.path === 'nodes[0].riverConfig.waterColor')).toBe(true);
    });

    it('refuse un autoCarveTerrain non booléen', () => {
      const res = validateScene(river({ autoCarveTerrain: 'oui' }));
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.path === 'nodes[0].riverConfig.autoCarveTerrain')).toBe(true);
    });

    it('tolère les champs absents (scène enregistrée avant l\'option)', () => {
      // Une scène plus ancienne n'a pas forcément toutes les clés : le
      // validateur ne doit pas exiger la présence de chaque paramètre.
      const res = validateScene(river({ width: 6.5 }));
      expect(res.errors.filter((e) => e.path.includes('riverConfig'))).toEqual([]);
    });
  });
});

describe('serialize/validator — assertValidScene', () => {
  it('throws SceneValidationError carrying the issues', () => {
    let caught: unknown;
    try {
      assertValidScene({ version: '0.0.1', nodes: [] });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SceneValidationError);
    expect((caught as SceneValidationError).issues.length).toBeGreaterThan(0);
    expect((caught as SceneValidationError).name).toBe('SceneValidationError');
  });

  it('does not throw on a valid scene', () => {
    expect(() => assertValidScene(scene())).not.toThrow();
  });
});

describe('serialize/index — prepareScene pipeline', () => {
  it('rejects garbage before any application', () => {
    expect(() => prepareScene('not-a-scene')).toThrow(SceneValidationError);
  });

  it('accepts a canonical scene with no migrations applied', () => {
    const out = prepareScene(scene());
    expect(out.data.version).toBe(FORMAT_VERSION);
    expect(out.applied).toEqual([]);
  });

  it('migrates a legacy scene up to the canonical version', () => {
    const out = prepareScene({ version: '1.0.0', nodes: [] });
    expect(out.data.version).toBe(FORMAT_VERSION);
    expect(out.applied.length).toBeGreaterThan(0);
  });
});
