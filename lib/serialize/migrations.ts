import type { SceneExportData } from '../../types/engine';
import { FORMAT_VERSION, compareVersions } from './format';

/**
 * migrations.ts — montée de version des scènes anciennes vers FORMAT_VERSION.
 *
 * - Entrée inconnue/sans version → traitée comme 1.0.0 (+ warning).
 * - Version plus récente que le moteur → NewerVersionError (ON NE TOUCHE À
 *   RIEN : ni migration descendante silencieuse, ni suppression).
 * - Chaque migrateur est additif et défensif (champs manquants = défauts).
 * - Travaille sur un clone profond : l'objet d'entrée n'est jamais muté.
 */

export class NewerVersionError extends Error {
  public readonly foundVersion: string;
  constructor(foundVersion: string) {
    super(
      `Scène en version ${foundVersion}, plus récente que le moteur (${FORMAT_VERSION}). ` +
        `Mettez à jour l'éditeur pour l'ouvrir.`
    );
    this.name = 'NewerVersionError';
    this.foundVersion = foundVersion;
  }
}

export interface MigrationResult {
  data: SceneExportData;
  /** Versions traversées, ex. ['1.0.0→1.1.0', '1.1.0→1.2.0']. */
  applied: string[];
  warnings: string[];
}

type MutableNode = Record<string, unknown>;
type MutableScene = Record<string, unknown>;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function vec3(v: unknown, fallback: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const o = (v ?? {}) as Record<string, unknown>;
  return { x: num(o.x, fallback.x), y: num(o.y, fallback.y), z: num(o.z, fallback.z) };
}

/** 1.0.0 → 1.1.0 : squelette de nœud garanti (nom, type, transform, visibilité). */
function to1_1_0(scene: MutableScene, warnings: string[]): void {
  if (!Array.isArray(scene.nodes)) {
    scene.nodes = [];
    warnings.push('nodes absent : scène vide reconstituée.');
    return;
  }
  scene.nodes = (scene.nodes as unknown[]).map((raw, i) => {
    const n = ((raw ?? {}) as MutableNode);
    const t = (n.transform ?? {}) as MutableNode;
    return {
      ...n,
      name: str(n.name, `Objet_${i}`),
      type: n.type === 'light' || n.type === 'camera' || n.type === 'group' || n.type === 'helper' ? n.type : 'mesh',
      transform: {
        position: vec3(t.position, { x: 0, y: 0, z: 0 }),
        rotation: vec3(t.rotation, { x: 0, y: 0, z: 0 }),
        scale: vec3(t.scale, { x: 1, y: 1, z: 1 }),
      },
      visible: bool(n.visible, true),
      castShadow: bool(n.castShadow, true),
      receiveShadow: bool(n.receiveShadow, true),
    };
  });
  if (!scene.environment || typeof scene.environment !== 'object') {
    scene.environment = {
      backgroundColor: '#0c0e14',
      ambientIntensity: 0.85,
      sunIntensity: 2.2,
      sunPosition: { x: 5, y: 10, z: 7 },
    };
    warnings.push('environment absent : éclairage par défaut.');
  } else {
    const env = scene.environment as MutableNode;
    env.backgroundColor = str(env.backgroundColor, '#0c0e14');
    env.ambientIntensity = num(env.ambientIntensity, 0.85);
    env.sunIntensity = num(env.sunIntensity, 2.2);
    env.sunPosition = vec3(env.sunPosition, { x: 5, y: 10, z: 7 });
  }
}

/** 1.1.0 → 1.2.0 : défauts matériaux + terrain/hud sûrs (champs 1.2 pass-through). */
function to1_2_0(scene: MutableScene, warnings: string[]): void {
  let fixedMaterials = 0;
  for (const raw of scene.nodes as MutableNode[]) {
    if (raw.material === undefined || raw.material === null) {
      // Pas de clé fantôme : msgpack décode `undefined` en `null`.
      delete raw.material;
      continue;
    }
    const m = raw.material as MutableNode;
    const before = JSON.stringify(m);
    raw.material = {
      ...m,
      color: str(m.color, '#3b82f6'),
      roughness: num(m.roughness, 0.35),
      metalness: num(m.metalness, 0.2),
      wireframe: bool(m.wireframe, false),
      opacity: num(m.opacity, 1),
      transparent: bool(m.transparent, false),
    };
    if (JSON.stringify(raw.material) !== before) fixedMaterials++;
  }
  if (fixedMaterials > 0) {
    warnings.push(`${fixedMaterials} matériau(x) complété(s) avec les défauts 1.2.`);
  }
  const terrain = scene.terrain as MutableNode | undefined;
  if (terrain && typeof terrain === 'object') {
    if (!Array.isArray(terrain.foliageLayers)) terrain.foliageLayers = [];
    if (terrain.heightmap !== undefined && !Array.isArray(terrain.heightmap)) {
      terrain.heightmap = [];
      warnings.push('heightmap illisible : ignoré.');
    }
  }
  // physics / logic / rigAnim / modelInfo / particles / riverConfig : optionnels, pass-through.
}

/** 1.3.0 → 1.4.0 : hiérarchie (parentId) + rattachement prefab. */
function to1_4_0(scene: MutableScene, warnings: string[]): void {
  let orphans = 0;
  const ids = new Set<string>();
  for (const raw of scene.nodes as MutableNode[]) {
    if (typeof raw.id === 'string') ids.add(raw.id);
  }
  for (const raw of scene.nodes as MutableNode[]) {
    if (raw.parentId !== undefined && raw.parentId !== null && typeof raw.parentId !== 'string') {
      delete raw.parentId;
      orphans++;
    } else if (typeof raw.parentId === 'string' && !ids.has(raw.parentId)) {
      // Parent inexistant (fichier édité à la main) : racine + warning.
      delete raw.parentId;
      orphans++;
    }
    for (const k of ['prefabId', 'prefabInstanceId']) {
      if (raw[k] !== undefined && typeof raw[k] !== 'string') delete raw[k];
    }
  }
  if (orphans > 0) {
    warnings.push(`${orphans} lien(s) parent/prefab invalide(s) : replacé(s) à la racine.`);
  }
  const meta = (scene.meta ?? {}) as MutableNode;
  meta.formatVersion = FORMAT_VERSION;
  scene.meta = meta;
}

/** 1.2.0 → 1.3.0 : bloc meta + settings (workPlane, renderMode, snapping). */
function to1_3_0(scene: MutableScene, warnings: string[]): void {
  const nodes = scene.nodes as unknown[];
  scene.meta = {
    generator: str((scene.meta as MutableNode | undefined)?.generator, str(scene.generator, 'Aether 3D Engine Studio')),
    exportedAt: str(scene.timestamp, new Date().toISOString()),
    nodeCount: Array.isArray(nodes) ? nodes.length : 0,
    formatVersion: FORMAT_VERSION,
  };
  if (scene.settings !== undefined && (typeof scene.settings !== 'object' || scene.settings === null)) {
    warnings.push('settings illisible : ignoré.');
    delete scene.settings;
  }
  if (scene.projectName !== undefined && typeof scene.projectName !== 'string') {
    delete scene.projectName;
  }
}

/**
 * Monte `input` vers FORMAT_VERSION (clone profond, entrée intacte).
 * Throw NewerVersionError si plus récent que le moteur.
 */
export function migrateScene(input: unknown): MigrationResult {
  if (!input || typeof input !== 'object') {
    throw new Error('Scène vide ou illisible (objet attendu).');
  }
  const scene = deepClone(input) as MutableScene;
  const warnings: string[] = [];
  const applied: string[] = [];

  const rawVersion = (scene.version as unknown) ?? (scene as { formatVersion?: unknown }).formatVersion;
  let version = typeof rawVersion === 'string' ? rawVersion : null;
  if (!version) {
    version = '1.0.0';
    warnings.push('Version absente : traitée comme 1.0.0.');
  }
  if (compareVersions(version, FORMAT_VERSION) > 0) {
    throw new NewerVersionError(version);
  }

  const steps: Array<{ from: string; to: string; run: (s: MutableScene, w: string[]) => void }> = [
    { from: '1.0.0', to: '1.1.0', run: to1_1_0 },
    { from: '1.1.0', to: '1.2.0', run: to1_2_0 },
    { from: '1.2.0', to: '1.3.0', run: to1_3_0 },
    { from: '1.3.0', to: '1.4.0', run: to1_4_0 },
  ];
  for (const step of steps) {
    if (compareVersions(version, step.to) < 0) {
      step.run(scene, warnings);
      applied.push(`${version}→${step.to}`);
      version = step.to;
    }
  }

  scene.version = FORMAT_VERSION;
  if (typeof scene.timestamp !== 'string') scene.timestamp = new Date().toISOString();
  if (typeof scene.generator !== 'string') scene.generator = 'Aether 3D Engine Studio';

  return { data: scene as unknown as SceneExportData, applied, warnings };
}
