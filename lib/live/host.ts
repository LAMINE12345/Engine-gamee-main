import type { SceneExportData } from '../../types/engine';
import { diffSnapshots } from '../collab/diff';
import type { CollabOp } from '../collab/types';
import type { LiveLink, LiveMsg } from './link';

export interface LivePreviewHostDeps {
  exportScene: () => SceneExportData;
  getCameraPose: () => { pos: [number, number, number]; quat: [number, number, number, number]; fov: number };
  isPlaying: () => boolean;
  onLog?: (line: string) => void;
}

const CAMERA_HZ = 10;

/**
 * LivePreviewHost — diffuse la session de jeu (5.3).
 *
 * Protocole : scène complète à la connexion (ou sur changement majeur),
 * puis ops incrémentales (même diff que la collab), pose caméra à 10 Hz
 * et état Play. Plusieurs liens simultanés (broadcast local + N WebRTC).
 */
export class LivePreviewHost {
  public viewers = 0;

  private readonly deps: LivePreviewHostDeps;
  private readonly links = new Set<LiveLink>();
  private base: SceneExportData | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private camTimer = 0;
  private lastPlaying = false;
  private lastCamSent = 0;

  constructor(deps: LivePreviewHostDeps) {
    this.deps = deps;
  }

  public addLink(link: LiveLink, sendFullState = true): void {
    this.links.add(link);
    this.viewers = this.links.size;
    link.onMessage = (msg) => {
      if (msg.t === 'live-hello' && sendFullState) {
        this.sendFull(link);
      }
    };
    if (sendFullState) this.sendFull(link);
  }

  public removeLink(link: LiveLink): void {
    link.close();
    this.links.delete(link);
    this.viewers = this.links.size;
  }

  public clear(): void {
    for (const l of this.links) {
      try {
        l.close();
      } catch {
        /* ignore */
      }
    }
    this.links.clear();
    this.viewers = 0;
    this.base = null;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  public get active(): boolean {
    return this.links.size > 0;
  }

  /** Appelé après chaque mutation (debouncé, comme la collab). */
  public notifyChange(): void {
    if (this.links.size === 0) return;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushOps();
    }, 400);
  }

  private sendFull(link: LiveLink): void {
    try {
      const scene = this.deps.exportScene();
      if (!this.base) this.base = scene;
      link.send({ t: 'live-scene', scene });
      link.send({ t: 'live-play', playing: this.deps.isPlaying() });
      this.lastPlaying = this.deps.isPlaying();
    } catch (err) {
      this.deps.onLog?.(`Aperçu : envoi complet impossible (${String(err)}).`);
    }
  }

  private flushOps(): void {
    if (this.links.size === 0 || !this.base) {
      // Pas de base : prochain hello enverra le complet.
      if (this.links.size > 0 && !this.base) {
        try {
          this.base = this.deps.exportScene();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    let current: SceneExportData;
    try {
      current = this.deps.exportScene();
    } catch {
      return;
    }
    let ops: CollabOp[] = [];
    try {
      ops = diffSnapshots(this.base, current);
    } catch {
      return;
    }
    this.base = current;
    if (ops.length === 0) return;
    // Les scènes complètes transitent par live-scene si trop d'ops (gros reset).
    if (ops.length > 400) {
      for (const l of this.links) this.sendFull(l);
      return;
    }
    const msg: LiveMsg = { t: 'live-ops', ops };
    for (const l of this.links) {
      try {
        l.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  /** Boucle (appelée depuis animate) : caméra + état Play. */
  public update(dt: number): void {
    if (this.links.size === 0) return;
    const now = performance.now();
    const playing = this.deps.isPlaying();
    if (playing !== this.lastPlaying) {
      this.lastPlaying = playing;
      const msg: LiveMsg = { t: 'live-play', playing };
      for (const l of this.links) {
        try {
          l.send(msg);
        } catch {
          /* ignore */
        }
      }
    }
    if (!playing) return;
    this.camTimer += dt;
    if (this.camTimer < 1 / CAMERA_HZ || now - this.lastCamSent < 90) return;
    this.camTimer = 0;
    this.lastCamSent = now;
    try {
      const pose = this.deps.getCameraPose();
      const msg: LiveMsg = { t: 'live-camera', pos: pose.pos, quat: pose.quat, fov: pose.fov };
      for (const l of this.links) {
        try {
          l.send(msg);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
}
