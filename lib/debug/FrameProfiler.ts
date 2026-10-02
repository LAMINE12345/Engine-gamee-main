/**
 * FrameProfiler — temps par système avec percentiles et historique.
 *
 * Usage (boucle render) :
 *   profiler.beginFrame();
 *   profiler.begin('physics'); ...; profiler.end('physics');
 *   ...
 *   profiler.endFrame();
 *
 * - Échantillons en anneau (300 frames) : avg / p50 / p95 / p99 / max par section.
 * - `enabled = false` rend begin/end quasi gratuits (un branch).
 * - Sections non fermées à endFrame() : comptées à 0 + warning unique.
 */

export interface SectionStats {
  name: string;
  /** Moyenne sur la fenêtre (ms). */
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Dernière mesure (ms). */
  last: number;
  /** Nombre de frames échantillonnées. */
  samples: number;
}

export interface FrameDistribution {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  count: number;
}

interface FrameSample {
  total: number;
  sections: Map<string, number>;
}

const MAX_SAMPLES = 300;
const SECTIONS_CAP = 24;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export class FrameProfiler {
  public enabled = true;

  private samples: FrameSample[] = [];
  private sampleCursor = 0;
  private frameStart = 0;
  private openSections = new Map<string, number>();
  private warnedLeaks = new Set<string>();
  private frameCount = 0;
  private lastFpsAt = performance.now();
  private currentFps = 0;

  // -------------------------------------------------------------------------
  // Boucle
  // -------------------------------------------------------------------------

  public beginFrame(): void {
    if (!this.enabled) return;
    this.frameStart = performance.now();
    this.openSections.clear();
  }

  public begin(name: string): void {
    if (!this.enabled) return;
    if (this.openSections.size >= SECTIONS_CAP) return;
    this.openSections.set(name, performance.now());
  }

  public end(name: string): void {
    if (!this.enabled) return;
    const start = this.openSections.get(name);
    if (start === undefined) return;
    this.openSections.delete(name);
    const dt = performance.now() - start;
    // Accumule : une section peut être ouverte plusieurs fois par frame.
    const pending = this.pendingSections();
    pending.set(name, (pending.get(name) ?? 0) + dt);
  }

  /** Mesure synchrone : `profiler.measure('x', () => ...)`. */
  public measure<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn();
    this.begin(name);
    try {
      return fn();
    } finally {
      this.end(name);
    }
  }

  public endFrame(): void {
    if (!this.enabled) return;
    const now = performance.now();
    // Sections oubliées : 0 + warning unique (évite les sections fantômes).
    for (const name of this.openSections.keys()) {
      if (!this.warnedLeaks.has(name)) {
        this.warnedLeaks.add(name);
        console.warn(`[Profiler] section '${name}' non fermée (end() manquant).`);
      }
      this.pendingSections().set(name, 0);
    }
    this.openSections.clear();

    const total = now - this.frameStart;
    const sample: FrameSample = { total, sections: this.pending };
    this.pending = new Map();
    if (this.samples.length < MAX_SAMPLES) {
      this.samples.push(sample);
    } else {
      this.samples[this.sampleCursor] = sample;
      this.sampleCursor = (this.sampleCursor + 1) % MAX_SAMPLES;
    }

    this.frameCount++;
    if (now - this.lastFpsAt >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsAt));
      this.frameCount = 0;
      this.lastFpsAt = now;
    }
  }

  // -------------------------------------------------------------------------
  // Lecture
  // -------------------------------------------------------------------------

  public getFPS(): number {
    return this.currentFps;
  }

  public getFrameDistribution(): FrameDistribution {
    const totals = this.orderedSamples().map((s) => s.total);
    return this.distribution(totals);
  }

  /** Totaux des N dernières frames (ordre chronologique, pour le graphe). */
  public getRecentTotals(count: number): number[] {
    const ordered = this.orderedSamples();
    return ordered.slice(Math.max(0, ordered.length - count)).map((s) => s.total);
  }

  public getSectionStats(): SectionStats[] {
    const ordered = this.orderedSamples();
    const names = new Set<string>();
    for (const s of ordered) {
      for (const name of s.sections.keys()) names.add(name);
    }
    const out: SectionStats[] = [];
    for (const name of names) {
      const values = ordered
        .map((s) => s.sections.get(name) ?? 0)
        .filter((v) => v > 0);
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      out.push({
        name,
        avg: sum / values.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted[sorted.length - 1],
        last: values[values.length - 1],
        samples: values.length,
      });
    }
    return out.sort((a, b) => b.avg - a.avg);
  }

  public reset(): void {
    this.samples = [];
    this.sampleCursor = 0;
    this.openSections.clear();
    this.pending = new Map();
    this.warnedLeaks.clear();
    this.frameCount = 0;
    this.currentFps = 0;
    this.lastFpsAt = performance.now();
  }

  // -------------------------------------------------------------------------
  // Interne
  // -------------------------------------------------------------------------

  private pending = new Map<string, number>();

  private pendingSections(): Map<string, number> {
    return this.pending;
  }

  private orderedSamples(): FrameSample[] {
    if (this.samples.length < MAX_SAMPLES) return this.samples;
    return [
      ...this.samples.slice(this.sampleCursor),
      ...this.samples.slice(0, this.sampleCursor),
    ];
  }

  private distribution(values: number[]): FrameDistribution {
    if (values.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0, count: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      avg: sum / values.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted[sorted.length - 1],
      count: values.length,
    };
  }
}
