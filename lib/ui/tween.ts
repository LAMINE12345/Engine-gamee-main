import type { UITweenEase, UITransitionKind } from '../../types/hud';

export type TweenProp = 'opacity' | 'offsetX' | 'offsetY' | 'scale' | 'rotation' | 'weight';

export interface TweenOptions {
  duration?: number;
  delay?: number;
  ease?: UITweenEase;
  /** Répétitions après la première (0 = une fois, -1 = infini). */
  loop?: number;
  /** Aller-retour (yoyo) à chaque répétition. */
  yoyo?: boolean;
  onComplete?: () => void;
}

interface ActiveTween {
  id: number;
  target: object;
  prop: TweenProp;
  from: number;
  to: number;
  duration: number;
  delay: number;
  ease: UITweenEase;
  loop: number;
  yoyo: boolean;
  elapsed: number;
  onComplete?: () => void;
  done: boolean;
}

export function applyEase(ease: UITweenEase, t: number): number {
  let c = Math.max(0, Math.min(1, t));
  switch (ease) {
    case 'linear': return c;
    case 'easeIn': return c * c * c;
    case 'easeOut': return 1 - Math.pow(1 - c, 3);
    case 'easeInOut':
      return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
    case 'backOut': {
      const s = 1.70158;
      return 1 + (s + 1) * Math.pow(c - 1, 3) + s * Math.pow(c - 1, 2);
    }
    case 'bounceOut': {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (c < 1 / d1) return n1 * c * c;
      if (c < 2 / d1) return n1 * (c -= 1.5 / d1) * c + 0.75;
      if (c < 2.5 / d1) return n1 * (c -= 2.25 / d1) * c + 0.9375;
      return n1 * (c -= 2.625 / d1) * c + 0.984375;
    }
    case 'elasticOut': {
      if (c === 0) return 0;
      if (c === 1) return 1;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * c) * Math.sin((c * 10 - 0.75) * c4) + 1;
    }
    default: return c;
  }
}

/** Presets de transition d'écran (valeurs de départ, la fin = repos). */
export function transitionFrom(
  kind: UITransitionKind,
  w: number,
  h: number
): Partial<Record<TweenProp, number>> {
  switch (kind) {
    case 'fade': return { opacity: 0 };
    case 'slide-up': return { opacity: 0, offsetY: Math.min(120, h * 0.1) };
    case 'slide-down': return { opacity: 0, offsetY: -Math.min(120, h * 0.1) };
    case 'slide-left': return { opacity: 0, offsetX: Math.min(160, w * 0.12) };
    case 'slide-right': return { opacity: 0, offsetX: -Math.min(160, w * 0.12) };
    case 'scale': return { opacity: 0, scale: 0.92 };
    default: return {};
  }
}

/**
 * TweenManager — tweens numériques avec easings, délais, boucles et yoyo.
 * Les cibles sont des objets + props (runtime UI, pas de DOM).
 */
export class TweenManager {
  private tweens: ActiveTween[] = [];
  private seq = 0;

  public tween(
    target: object,
    prop: TweenProp,
    to: number,
    opts?: TweenOptions
  ): number {
    const cur = (target as Record<string, unknown>)[prop];
    const from = typeof cur === 'number' && Number.isFinite(cur) ? cur : 0;
    // Tue les tweens existants sur la même cible+prop (dernier arrivé gagne).
    for (const t of this.tweens) {
      if (!t.done && t.target === target && t.prop === prop) t.done = true;
    }
    const id = ++this.seq;
    this.tweens.push({
      id,
      target,
      prop,
      from,
      to,
      duration: Math.max(0.01, opts?.duration ?? 0.3),
      delay: Math.max(0, opts?.delay ?? 0),
      ease: opts?.ease ?? 'easeOut',
      loop: opts?.loop ?? 0,
      yoyo: opts?.yoyo ?? false,
      elapsed: 0,
      onComplete: opts?.onComplete,
      done: false,
    });
    return id;
  }

  public kill(target: object, prop?: TweenProp): void {
    for (const t of this.tweens) {
      if (!t.done && t.target === target && (!prop || t.prop === prop)) t.done = true;
    }
  }

  /** Retourne true si au moins un tween est actif (redraw nécessaire). */
  public update(dt: number): boolean {
    let active = false;
    for (const t of this.tweens) {
      if (t.done) continue;
      active = true;
      t.elapsed += dt;
      if (t.elapsed < t.delay) continue;
      const local = (t.elapsed - t.delay) / t.duration;
      if (local >= 1) {
        if (t.loop === 0) {
          (t.target as Record<string, number>)[t.prop] = t.to;
          t.done = true;
          try {
            t.onComplete?.();
          } catch {
            /* ignore */
          }
          continue;
        }
        // Boucle : yoyo inverse, sinon recommence.
        if (t.yoyo) {
          const tmp = t.from;
          t.from = t.to;
          t.to = tmp;
        }
        if (t.loop > 0) t.loop--;
        t.elapsed = t.delay;
        (t.target as Record<string, number>)[t.prop] = t.from;
        continue;
      }
      const v = t.from + (t.to - t.from) * applyEase(t.ease, local);
      (t.target as Record<string, number>)[t.prop] = v;
    }
    if (this.tweens.length > 64) {
      this.tweens = this.tweens.filter((t) => !t.done);
    }
    return active;
  }

  public clear(): void {
    this.tweens = [];
  }
}
