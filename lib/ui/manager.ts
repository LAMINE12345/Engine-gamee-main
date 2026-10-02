import * as THREE from 'three';
import type { UIScreen, UINode, UIAction, UITransitionKind } from '../../types/hud';
import { UICanvas } from './uicanvas';
import { transitionFrom } from './tween';

export interface UIManagerDeps {
  getSize: () => { w: number; h: number };
  getPixelRatio: () => number;
  onAction: (action: UIAction, screenId: string, nodeId: string) => void;
}

interface ScreenRuntime {
  canvas: UICanvas;
  quad: THREE.Mesh;
  visible: boolean;
  transitioning: boolean;
}

/**
 * GameUIManager — écrans UI moteur (4.4).
 *
 * Chaque écran = UICanvas (flexbox → Canvas 2D HiDPI → texture) plaqué sur
 * un quad plein écran dans une scène overlay orthographique, rendue après
 * la scène 3D (transparent, depthTest off). Variables liées (mêmes noms que
 * le HUD : `{Score}`, barres), transitions show/hide tweenées, intros
 * décalées par nœud, routage pointeur (hover/pressed/clic) avec actions.
 */
export class GameUIManager {
  public readonly uiScene = new THREE.Scene();
  public readonly uiCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly deps: UIManagerDeps;
  private readonly screens = new Map<string, ScreenRuntime>();
  private variables: Record<string, number | string | boolean> = {};
  private order: string[] = [];
  private varListener: ((e: Event) => void) | null = null;

  constructor(deps: UIManagerDeps) {
    this.deps = deps;
    if (typeof window !== 'undefined') {
      this.varListener = ((e: Event) => {
        const detail = (e as CustomEvent).detail as Record<string, number | string | boolean> | undefined;
        if (detail && typeof detail === 'object') this.setVariables(detail);
      }) as (e: Event) => void;
      window.addEventListener('aether_update_var', this.varListener);
    }
  }

  // ---------------------------------------------------------- écrans

  /** (Re)charge les écrans depuis la config (éditeur / import). */
  public syncScreens(screens: UIScreen[]): void {
    const seen = new Set<string>();
    for (const s of screens) {
      seen.add(s.id);
      const existing = this.screens.get(s.id);
      if (existing) {
        existing.canvas.setScreen(s);
      } else {
        this.addScreen(s);
      }
    }
    for (const id of [...this.screens.keys()]) {
      if (!seen.has(id)) this.removeScreen(id);
    }
  }

  public addScreen(screen: UIScreen): void {
    if (this.screens.has(screen.id)) return;
    const canvas = new UICanvas(screen);
    const { w, h } = this.deps.getSize();
    canvas.resize(w, h, this.deps.getPixelRatio());
    canvas.setVariables(this.variables);
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: canvas.ensureTexture(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    quad.renderOrder = 9999;
    quad.frustumCulled = false;
    quad.visible = false;
    quad.name = `__AETHER_UI_${screen.id}__`;
    // Raycast neutre : le routage pointeur passe par les boîtes layout.
    quad.raycast = () => {};
    this.uiScene.add(quad);
    this.order.push(screen.id);
    this.screens.set(screen.id, { canvas, quad, visible: false, transitioning: false });
    // Z-order : dernier écran = devant.
    this.order.forEach((id, i) => {
      const rt = this.screens.get(id);
      if (rt) rt.quad.renderOrder = 9990 + i;
    });
  }

  public removeScreen(id: string): void {
    const rt = this.screens.get(id);
    if (!rt) return;
    this.uiScene.remove(rt.quad);
    (rt.quad.geometry as THREE.BufferGeometry).dispose();
    (rt.quad.material as THREE.Material).dispose();
    rt.canvas.dispose();
    this.screens.delete(id);
    this.order = this.order.filter((x) => x !== id);
  }

  public clear(): void {
    for (const id of [...this.screens.keys()]) this.removeScreen(id);
    this.order = [];
  }

  public hasScreens(): boolean {
    return this.screens.size > 0;
  }

  public isVisible(id: string): boolean {
    return this.screens.get(id)?.visible ?? false;
  }

  /** Un écran modal visible bloque les inputs scène. */
  public blocksSceneInput(): boolean {
    for (const rt of this.screens.values()) {
      if (rt.visible && (rt.canvas.screen.modal || rt.transitioning)) return true;
    }
    return false;
  }

  public anyInteractive(): boolean {
    for (const rt of this.screens.values()) {
      if (rt.visible) return true;
    }
    return false;
  }

  // ---------------------------------------------------------- visibilité

  public showScreen(id: string, transition?: UITransitionKind, instant = false): void {
    const rt = this.screens.get(id);
    if (!rt || rt.visible) return;
    rt.visible = true;
    rt.canvas.visible = true;
    rt.quad.visible = true;
    const { w, h } = this.deps.getSize();
    rt.canvas.resize(w, h, this.deps.getPixelRatio());
    const kind = transition ?? rt.canvas.screen.showTransition ?? 'fade';
    const dur = Math.max(0.01, rt.canvas.screen.transitionDuration ?? 0.25);
    const sr = rt.canvas.screenRuntime;
    if (instant || kind === 'none') {
      sr.opacity = 1;
      sr.offsetX = 0;
      sr.offsetY = 0;
      sr.scale = 1;
      rt.transitioning = false;
    } else {
      const from = transitionFrom(kind, w, h);
      sr.opacity = from.opacity ?? 1;
      sr.offsetX = from.offsetX ?? 0;
      sr.offsetY = from.offsetY ?? 0;
      sr.scale = from.scale ?? 1;
      rt.transitioning = true;
      const tw = rt.canvas.tweens;
      tw.tween(sr, 'opacity', 1, { duration: dur, ease: 'easeOut' });
      if (from.offsetX !== undefined) tw.tween(sr, 'offsetX', 0, { duration: dur, ease: 'easeOut' });
      if (from.offsetY !== undefined) tw.tween(sr, 'offsetY', 0, { duration: dur, ease: 'easeOut' });
      if (from.scale !== undefined) {
        tw.tween(sr, 'scale', 1, {
          duration: dur,
          ease: 'backOut',
          onComplete: () => {
            rt.transitioning = false;
          },
        });
      } else {
        tw.tween(sr, 'opacity', 1, {
          duration: dur,
          ease: 'easeOut',
          onComplete: () => {
            rt.transitioning = false;
          },
        });
      }
    }
    this.playIntros(rt);
    rt.canvas.markDirty();
  }

  public hideScreen(id: string, transition?: UITransitionKind, instant = false): void {
    const rt = this.screens.get(id);
    if (!rt || !rt.visible) return;
    const kind = transition ?? rt.canvas.screen.hideTransition ?? 'fade';
    const dur = Math.max(0.01, rt.canvas.screen.transitionDuration ?? 0.25);
    const sr = rt.canvas.screenRuntime;
    if (instant || kind === 'none') {
      rt.visible = false;
      rt.canvas.visible = false;
      rt.quad.visible = false;
      rt.transitioning = false;
      return;
    }
    const { w, h } = this.deps.getSize();
    const from = transitionFrom(kind, w, h);
    rt.transitioning = true;
    const tw = rt.canvas.tweens;
    const hide = (): void => {
      rt.visible = false;
      rt.canvas.visible = false;
      rt.quad.visible = false;
      rt.transitioning = false;
      sr.opacity = 1;
      sr.offsetX = 0;
      sr.offsetY = 0;
      sr.scale = 1;
    };
    tw.tween(sr, 'opacity', from.opacity ?? 0, { duration: dur, ease: 'easeIn', onComplete: hide });
    if (from.offsetX !== undefined) tw.tween(sr, 'offsetX', from.offsetX, { duration: dur, ease: 'easeIn' });
    if (from.offsetY !== undefined) tw.tween(sr, 'offsetY', from.offsetY, { duration: dur, ease: 'easeIn' });
    if (from.scale !== undefined) tw.tween(sr, 'scale', from.scale, { duration: dur, ease: 'easeIn' });
  }

  /** Intros décalées des nœuds marqués (fade/slide/scale). */
  private playIntros(rt: ScreenRuntime): void {
    const walk = (n: UINode): void => {
      if (n.intro && n.intro !== 'none') {
        const { w, h } = this.deps.getSize();
        const from = transitionFrom(n.intro, w, h);
        const r = rt.canvas.runtimeOf(n.id);
        const delay = Math.max(0, n.introDelay ?? 0);
        if (from.opacity !== undefined) {
          r.opacity = from.opacity;
          rt.canvas.tweens.tween(r, 'opacity', 1, { duration: 0.35, delay, ease: 'easeOut' });
        }
        if (from.offsetX !== undefined) {
          r.offsetX = from.offsetX;
          rt.canvas.tweens.tween(r, 'offsetX', 0, { duration: 0.35, delay, ease: 'easeOut' });
        }
        if (from.offsetY !== undefined) {
          r.offsetY = from.offsetY;
          rt.canvas.tweens.tween(r, 'offsetY', 0, { duration: 0.35, delay, ease: 'easeOut' });
        }
        if (from.scale !== undefined) {
          r.scale = from.scale;
          rt.canvas.tweens.tween(r, 'scale', 1, { duration: 0.35, delay, ease: 'backOut' });
        }
      }
      for (const c of n.children ?? []) walk(c);
    };
    walk(rt.canvas.screen.root);
  }

  /** Affiche les écrans `visibleOnPlay` (entrée en Play). */
  public showOnPlayScreens(): void {
    for (const [id, rt] of this.screens) {
      if (rt.canvas.screen.visibleOnPlay) this.showScreen(id);
      else this.hideScreen(id, 'none', true);
    }
  }

  // ---------------------------------------------------------- variables

  public setVariable(name: string, value: number | string | boolean): void {
    this.variables[name] = value;
    for (const rt of this.screens.values()) {
      if (rt.visible) {
        rt.canvas.setVariables(this.variables);
      }
    }
  }

  public setVariables(vars: Record<string, number | string | boolean>): void {
    Object.assign(this.variables, vars);
    for (const rt of this.screens.values()) {
      if (rt.visible) rt.canvas.setVariables(this.variables);
    }
  }

  public syncVariables(vars: Record<string, number | string | boolean>): void {
    this.variables = { ...vars };
    for (const rt of this.screens.values()) rt.canvas.setVariables(this.variables);
  }

  // ---------------------------------------------------------- boucle

  /** Tweens + redraws. Retourne true si un overlay est affiché. */
  public update(dt: number): boolean {
    let anyVisible = false;
    const { w, h } = this.deps.getSize();
    const dpr = this.deps.getPixelRatio();
    for (const rt of this.screens.values()) {
      if (!rt.visible) continue;
      anyVisible = true;
      rt.canvas.resize(w, h, dpr);
      const tweenActive = rt.canvas.tweens.update(dt);
      if (tweenActive || rt.canvas.dirty) {
        rt.canvas.draw();
      }
    }
    return anyVisible;
  }

  /** Rendu overlay après la scène 3D (pas de clear couleur). */
  public renderOverlay(renderer: THREE.WebGLRenderer): void {
    let any = false;
    for (const rt of this.screens.values()) {
      if (rt.visible) {
        any = true;
        break;
      }
    }
    if (!any) return;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.uiScene, this.uiCamera);
    renderer.autoClear = prevAutoClear;
  }

  // ---------------------------------------------------------- pointeur

  private toLocal(e: { clientX: number; clientY: number }, rect: DOMRect): { x: number; y: number } {
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Survol (pointermove). Retourne true si un bouton est survolé. */
  public handleMove(e: { clientX: number; clientY: number }, rect: DOMRect): boolean {
    const p = this.toLocal(e, rect);
    for (let i = this.order.length - 1; i >= 0; i--) {
      const rt = this.screens.get(this.order[i]);
      if (!rt || !rt.visible) continue;
      const hit = rt.canvas.pickButton(p.x, p.y);
      rt.canvas.setHover(hit ? hit.node.id : null);
      if (hit) return true;
    }
    return false;
  }

  /** Appui (pointerdown). Retourne true si consommé (bouton pressé / modal). */
  public handleDown(e: { clientX: number; clientY: number }, rect: DOMRect): boolean {
    const p = this.toLocal(e, rect);
    for (let i = this.order.length - 1; i >= 0; i--) {
      const rt = this.screens.get(this.order[i]);
      if (!rt || !rt.visible) continue;
      const hit = rt.canvas.pickButton(p.x, p.y);
      if (hit) {
        rt.canvas.setPressed(hit.node.id);
        return true;
      }
      // Écran modal : bloque la scène même sans bouton touché.
      if (rt.canvas.screen.modal) return true;
    }
    return false;
  }

  /** Relâche (pointerup). Retourne true si consommé. */
  public handleUp(e: { clientX: number; clientY: number }, rect: DOMRect): boolean {
    const p = this.toLocal(e, rect);
    let consumed = false;
    for (let i = this.order.length - 1; i >= 0; i--) {
      const rt = this.screens.get(this.order[i]);
      if (!rt || !rt.visible) continue;
      const hit = rt.canvas.pickButton(p.x, p.y);
      if (hit) {
        consumed = true;
        if (rt.canvas.consumePress(hit.node.id) && hit.node.action) {
          try {
            this.deps.onAction(hit.node.action, rt.canvas.screen.id, hit.node.id);
          } catch {
            /* ignore */
          }
        }
        break;
      }
      rt.canvas.setPressed(null);
      if (rt.canvas.screen.modal) {
        consumed = true;
        break;
      }
    }
    return consumed;
  }

  public setPressedNull(): void {
    for (const rt of this.screens.values()) rt.canvas.setPressed(null);
  }

  public getStats(): { screens: number; visible: number } {
    let visible = 0;
    for (const rt of this.screens.values()) if (rt.visible) visible++;
    return { screens: this.screens.size, visible };
  }

  public dispose(): void {
    if (this.varListener && typeof window !== 'undefined') {
      window.removeEventListener('aether_update_var', this.varListener);
    }
    this.clear();
  }
}
