import type { SceneExportData } from '../../types/engine';
import { gateScene, assertValidScene, SceneValidationError } from './validator';
import { migrateScene } from './migrations';

export * from './format';
export { migrateScene, NewerVersionError } from './migrations';
export type { MigrationResult } from './migrations';
export {
  gateScene,
  validateScene,
  assertValidScene,
  SceneValidationError,
  VALIDATION_LIMITS,
} from './validator';
export type { ValidationIssue, ValidationResult } from './validator';
export {
  encodeSceneBinary,
  decodeSceneBinary,
  BINARY_MAGIC,
  BINARY_EXT,
} from './binary';
export type { DecodedScene } from './binary';
export {
  detectImportConflict,
  mergeScenes,
  backupCurrentScene,
  stashRaw,
  listBackups,
  readBackup,
  deleteBackup,
  MAX_BACKUPS,
} from './backups';
export type { ImportPolicy, SceneConflict, SceneSummary, BackupInfo } from './backups';

export interface PreparedScene {
  data: SceneExportData;
  /** Versions traversées par la migration (vide si déjà courante). */
  applied: string[];
  /** Warnings migration + validation souple. */
  warnings: string[];
}

/**
 * Pipeline d'entrée unique : gate structurel → migration → validation stricte.
 * - Fichiers legacy : réparés puis acceptés (applied/warnings documentent).
 * - Garbage : rejeté AVANT toute application (SceneValidationError).
 * - Version future : NewerVersionError (l'appelant ne doit RIEN supprimer).
 */
export function prepareScene(input: unknown): PreparedScene {
  const gate = gateScene(input);
  if (!gate.ok) {
    throw new SceneValidationError(gate.errors);
  }
  const { data, applied, warnings } = migrateScene(input);
  assertValidScene(data);
  return { data, applied, warnings };
}
