/**
 * types/debug.ts — snapshot du profiler pour l'UI (polling à 4 Hz).
 * Formes structurelles (pas d'import lib → pas de cycle).
 */

export interface ProfilerSectionSnapshot {
  name: string;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  last: number;
  samples: number;
}

export interface ProfilerFrameSnapshot {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  count: number;
}

export interface ProfilerMemorySnapshot {
  label: string;
  time: number;
  geometries: number;
  textures: number;
  materials: number;
  programs: number;
  triangles: number;
  gpuBytesEstimate: number;
  /** Alertes de fuites play-start → play-stop (si les deux snapshots existent). */
  leaks: string[];
}

export interface ProfilerSnapshot {
  fps: number;
  frame: ProfilerFrameSnapshot;
  sections: ProfilerSectionSnapshot[];
  /** Totaux des dernières frames, ordre chronologique (graphe). */
  recentTotals: number[];
  memory: ProfilerMemorySnapshot | null;
  physicsDebug: boolean;
  physicsBodies: number;
  isPlaying: boolean;
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  return ms < 10 ? ms.toFixed(2) : ms.toFixed(1);
}
