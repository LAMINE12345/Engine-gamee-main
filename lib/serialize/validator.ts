import { FORMAT_VERSION } from './format';

/**
 * validator.ts — validation du schéma avant application.
 *
 * Deux passes :
 * - `gateScene` (pré-migration) : structure plausible ? Rejette le garbage
 *   (JSON valide mais pas une scène) avant toute réparation.
 * - `validateScene` (post-migration) : schéma canonique strict + garde-fous
 *   anti-DoS (caps sur nodes / heightmap / foliage).
 *
 * Champs inconnus = ignorés (compatibilité avant). Erreurs capées à 100.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export class SceneValidationError extends Error {
  public readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    const head = issues
      .slice(0, 5)
      .map((i) => `  • ${i.path} : ${i.message}`)
      .join('\n');
    const more = issues.length > 5 ? `\n  …et ${issues.length - 5} autre(s).` : '';
    super(`Scène invalide (${issues.length} erreur(s)) :\n${head}${more}`);
    this.name = 'SceneValidationError';
    this.issues = issues;
  }
}

/** Garde-fous anti-DoS / anti-corruption. */
export const VALIDATION_LIMITS = {
  maxNodes: 50_000,
  maxHeightmap: 16_777_216, // 4096²
  warnHeightmap: 1_048_576, // 1024²
  maxFoliageLayers: 20_000,
  maxIssues: 100,
} as const;

const NODE_TYPES = ['mesh', 'light', 'camera', 'group', 'helper'] as const;

type AnyObj = Record<string, unknown>;

class Collector {
  errors: ValidationIssue[] = [];
  warnings: ValidationIssue[] = [];
  get overflow(): boolean {
    return this.errors.length >= VALIDATION_LIMITS.maxIssues;
  }
  error(path: string, message: string): void {
    if (this.errors.length < VALIDATION_LIMITS.maxIssues) {
      this.errors.push({ path, message });
    }
  }
  warn(path: string, message: string): void {
    if (this.warnings.length < VALIDATION_LIMITS.maxIssues) {
      this.warnings.push({ path, message });
    }
  }
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Passe 1 — gate structurel pré-migration. */
export function gateScene(input: unknown): ValidationResult {
  const c = new Collector();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    c.error('$', 'objet scène attendu.');
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }
  const scene = input as AnyObj;
  if (scene.nodes !== undefined && !Array.isArray(scene.nodes)) {
    c.error('nodes', 'tableau attendu.');
  }
  if (scene.version !== undefined && typeof scene.version !== 'string') {
    c.error('version', 'chaîne attendue (ex. "1.2.0").');
  }
  return { ok: c.errors.length === 0, errors: c.errors, warnings: c.warnings };
}

function checkVec3(c: Collector, base: string, v: unknown): void {
  const o = (v ?? {}) as AnyObj;
  for (const k of ['x', 'y', 'z']) {
    if (!isFiniteNum(o[k])) c.error(`${base}.${k}`, 'nombre fini attendu.');
  }
}

/** Passe 2 — schéma canonique strict post-migration. */
export function validateScene(data: unknown): ValidationResult {
  const c = new Collector();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    c.error('$', 'objet scène attendu.');
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }
  const scene = data as AnyObj;

  if (scene.version !== FORMAT_VERSION) {
    c.error('version', `attendue "${FORMAT_VERSION}" après migration.`);
  }

  // --- Nœuds ---
  if (!Array.isArray(scene.nodes)) {
    c.error('nodes', 'tableau attendu.');
  } else {
    if (scene.nodes.length > VALIDATION_LIMITS.maxNodes) {
      c.error('nodes', `${scene.nodes.length} nœuds > cap ${VALIDATION_LIMITS.maxNodes}.`);
    }
    scene.nodes.forEach((raw, i) => {
      if (c.overflow) return;
      const p = `nodes[${i}]`;
      if (!raw || typeof raw !== 'object') {
        c.error(p, 'objet nœud attendu.');
        return;
      }
      const n = raw as AnyObj;
      if (typeof n.name !== 'string' || n.name.length === 0) {
        c.error(`${p}.name`, 'nom non vide attendu.');
      }
      if (!(NODE_TYPES as readonly unknown[]).includes(n.type)) {
        c.error(`${p}.type`, `l'un de ${(NODE_TYPES as readonly string[]).join(', ')}.`);
      }
      // Hiérarchie + prefab (1.4.0, optionnels) : id/parentId string ou null.
      for (const k of ['parentId', 'prefabId', 'prefabInstanceId', 'repeatOf']) {
        if (n[k] !== undefined && n[k] !== null && typeof n[k] !== 'string') {
          c.error(`${p}.${k}`, 'chaîne ou null attendu.');
        }
      }
      // Répétition automatique (4.x, optionnelle) : bornes alignées sur applyRepeat.
      if (n.repeat !== undefined && n.repeat !== null) {
        const r = n.repeat as AnyObj;
        if (typeof r !== 'object' || Array.isArray(r)) {
          c.error(`${p}.repeat`, 'objet attendu.');
        } else {
          if (!isFiniteNum(r.count) || (r.count as number) < 0) {
            c.error(`${p}.repeat.count`, 'nombre ≥ 0 attendu.');
          }
          if (r.axis !== 'x' && r.axis !== 'y' && r.axis !== 'z') {
            c.error(`${p}.repeat.axis`, "l'un de x, y, z.");
          }
          if (
            !isFiniteNum(r.overlap) ||
            (r.overlap as number) < 0 ||
            (r.overlap as number) > 0.95
          ) {
            c.error(`${p}.repeat.overlap`, 'nombre entre 0 et 0.95 attendu.');
          }
        }
      }
      const t = (n.transform ?? {}) as AnyObj;
      checkVec3(c, `${p}.transform.position`, t.position);
      checkVec3(c, `${p}.transform.rotation`, t.rotation);
      checkVec3(c, `${p}.transform.scale`, t.scale);
      for (const k of ['visible', 'castShadow', 'receiveShadow']) {
        if (typeof n[k] !== 'boolean') c.error(`${p}.${k}`, 'booléen attendu.');
      }
      if (n.material !== undefined && n.material !== null) {
        const m = n.material as AnyObj;
        if (typeof m.color !== 'string') c.error(`${p}.material.color`, 'chaîne couleur attendue.');
        for (const k of ['roughness', 'metalness', 'opacity']) {
          if (m[k] !== undefined && !isFiniteNum(m[k])) c.error(`${p}.material.${k}`, 'nombre fini attendu.');
        }
      }
      if (n.light !== undefined && n.light !== null) {
        const l = n.light as AnyObj;
        if (typeof l.color !== 'string') c.error(`${p}.light.color`, 'chaîne couleur attendue.');
        if (!isFiniteNum(l.intensity)) c.error(`${p}.light.intensity`, 'nombre fini attendu.');
      }
      if (n.physics !== undefined && typeof n.physics !== 'object') {
        c.error(`${p}.physics`, 'objet attendu.');
      }
      // `riverConfig` est typé dans le document (`RiverConfigData`) mais le
      // validateur travaille sur du `AnyObj` : sans ces contrôles, un lien de
      // scène malveillant (ou une version antérieure du format) pouvait
      // injecter `width: "NaN"` et faire planter le shader de rivière.
      if (n.riverConfig !== undefined && n.riverConfig !== null) {
        const r = n.riverConfig as AnyObj;
        if (typeof r !== 'object') {
          c.error(`${p}.riverConfig`, 'objet attendu.');
        } else {
          for (const k of ['width', 'length', 'meanderFactor', 'meanderAmplitude', 'flowSpeed', 'foamIntensity']) {
            if (r[k] !== undefined && !isFiniteNum(r[k])) {
              c.error(`${p}.riverConfig.${k}`, 'nombre fini attendu.');
            }
          }
          for (const k of ['waterColor', 'deepWaterColor', 'foamColor']) {
            if (r[k] !== undefined && typeof r[k] !== 'string') {
              c.error(`${p}.riverConfig.${k}`, 'chaîne couleur attendue.');
            }
          }
          if (r.autoCarveTerrain !== undefined && typeof r.autoCarveTerrain !== 'boolean') {
            c.error(`${p}.riverConfig.autoCarveTerrain`, 'booléen attendu.');
          }
        }
      }
    });
  }

  // --- Environnement ---
  const env = scene.environment as AnyObj | undefined;
  if (!env || typeof env !== 'object') {
    c.error('environment', 'objet attendu.');
  } else {
    if (typeof env.backgroundColor !== 'string') c.error('environment.backgroundColor', 'chaîne attendue.');
    for (const k of ['ambientIntensity', 'sunIntensity']) {
      if (!isFiniteNum(env[k])) c.error(`environment.${k}`, 'nombre fini attendu.');
    }
    checkVec3(c, 'environment.sunPosition', env.sunPosition);
  }

  // --- Terrain (caps + échantillon de finitude) ---
  const terrain = scene.terrain as AnyObj | undefined;
  if (terrain !== undefined && terrain !== null) {
    if (typeof terrain !== 'object') {
      c.error('terrain', 'objet attendu.');
    } else {
      const hm = terrain.heightmap as unknown;
      if (hm !== undefined) {
        if (!Array.isArray(hm)) {
          c.error('terrain.heightmap', 'tableau attendu.');
        } else {
          if (hm.length > VALIDATION_LIMITS.maxHeightmap) {
            c.error('terrain.heightmap', `${hm.length} > cap ${VALIDATION_LIMITS.maxHeightmap}.`);
          } else if (hm.length > VALIDATION_LIMITS.warnHeightmap) {
            c.warn('terrain.heightmap', `${hm.length} valeurs : import potentiellement lent.`);
          }
          for (let i = 0; i < hm.length; i++) {
            if (!isFiniteNum(hm[i])) {
              c.error(`terrain.heightmap[${i}]`, 'nombre fini attendu.');
              break;
            }
          }
        }
      }
      const fol = terrain.foliageLayers as unknown;
      if (fol !== undefined) {
        if (!Array.isArray(fol)) {
          c.error('terrain.foliageLayers', 'tableau attendu.');
        } else if (fol.length > VALIDATION_LIMITS.maxFoliageLayers) {
          c.error('terrain.foliageLayers', `${fol.length} > cap ${VALIDATION_LIMITS.maxFoliageLayers}.`);
        }
      }
    }
  }

  return { ok: c.errors.length === 0, errors: c.errors, warnings: c.warnings };
}

/** Valide ou throw SceneValidationError (pour importScene). */
export function assertValidScene(data: unknown): void {
  const res = validateScene(data);
  if (!res.ok) throw new SceneValidationError(res.errors);
}
