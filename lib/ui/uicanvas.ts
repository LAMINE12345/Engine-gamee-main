import * as THREE from 'three';
import type { UINode, UIScreen, UIStyle } from '../../types/hud';
import { layoutTree, hitTest } from './layout';
import type { LayoutBox } from './layout';
import { TweenManager } from './tween';
import type { TweenProp } from './tween';

export interface NodeRuntime {
  opacity: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  hover: boolean;
  pressed: boolean;
}

export function newNodeRuntime(): NodeRuntime {
  return { opacity: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0, hover: false, pressed: false };
}

function fontOf(style: UIStyle | undefined, fontSize: number): string {
  const w = style?.fontWeight ?? 600;
  const fam = style?.fontFamily ?? 'system-ui, sans-serif';
  return `${w} ${fontSize}px ${fam}`;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number | null
): string[] {
  ctx.font = font;
  const paragraphs = text.split('\n');
  const out: string[] = [];
  for (const para of paragraphs) {
    if (maxWidth === null || maxWidth <= 0) {
      out.push(para);
      continue;
    }
    const words = para.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const trial = line + word;
      if (ctx.measureText(trial).width > maxWidth && line.trim().length > 0) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = trial;
      }
    }
    out.push(line);
  }
  return out.length > 0 ? out : [''];
}

/** Remplace `{Variable}` par les valeurs (nombres : 2 décimales max si non entier). */
export function interpolateVars(
  text: string,
  vars: Record<string, number | string | boolean>
): string {
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
    return String(v);
  });
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * UICanvas — un écran UI : layout flexbox → Canvas 2D HiDPI → texture.
 *
 * Redessine uniquement quand sale (état, variables, tweens, resize).
 * Texte vectoriel à devicePixelRatio : net à toute taille (équivalent
 * visuel SDF sans atlas ni dépendance).
 */
export class UICanvas {
  public screen: UIScreen;
  public readonly canvas: HTMLCanvasElement;
  public texture: THREE.CanvasTexture | null = null;
  public readonly tweens = new TweenManager();
  /** Runtime d'écran (transitions show/hide). */
  public readonly screenRuntime = { opacity: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
  public visible = false;
  public dirty = true;

  private readonly ctx: CanvasRenderingContext2D;
  private vw = 1;
  private vh = 1;
  private dpr = 1;
  private boxes: LayoutBox[] = [];
  private boxById = new Map<string, LayoutBox>();
  private nodeById = new Map<string, UINode>();
  private runtimes = new Map<string, NodeRuntime>();
  private linesById = new Map<string, string[]>();
  private images = new Map<string, HTMLImageElement>();
  private vars: Record<string, number | string | boolean> = {};
  private hoverId: string | null = null;
  private pressedId: string | null = null;

  constructor(screen: UIScreen) {
    this.screen = screen;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible.');
    this.ctx = ctx;
    this.indexNodes(screen.root);
  }

  public setScreen(screen: UIScreen): void {
    this.screen = screen;
    this.indexNodes(screen.root);
    this.markDirty();
  }

  private indexNodes(root: UINode): void {
    this.nodeById.clear();
    const walk = (n: UINode): void => {
      this.nodeById.set(n.id, n);
      if (!this.runtimes.has(n.id)) this.runtimes.set(n.id, newNodeRuntime());
      for (const c of n.children ?? []) walk(c);
    };
    walk(root);
  }

  public runtimeOf(id: string): NodeRuntime {
    let r = this.runtimes.get(id);
    if (!r) {
      r = newNodeRuntime();
      this.runtimes.set(id, r);
    }
    return r;
  }

  public setVariables(vars: Record<string, number | string | boolean>): void {
    this.vars = vars;
    this.markDirty();
  }

  public resize(w: number, h: number, dpr: number): void {
    const ndpr = Math.max(1, Math.min(2, dpr || 1));
    if (w === this.vw && h === this.vh && ndpr === this.dpr && this.canvas.width > 0) return;
    this.vw = Math.max(1, Math.round(w));
    this.vh = Math.max(1, Math.round(h));
    this.dpr = ndpr;
    this.canvas.width = this.vw * this.dpr;
    this.canvas.height = this.vh * this.dpr;
    this.markDirty();
  }

  public markDirty(): void {
    this.dirty = true;
  }

  public ensureTexture(): THREE.CanvasTexture {
    if (!this.texture) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
    }
    return this.texture;
  }

  // ---------------------------------------------------------- layout + draw

  public relayout(): void {
    // Mesure en px CSS (la transform DPR met à l'échelle) : mesure et dessin
    // partagent exactement les mêmes coupures de lignes.
    const measure = (
      text: string,
      fontSize: number,
      fontWeight: string | number | undefined,
      fontFamily: string | undefined,
      maxWidth: number | null
    ): { w: number; h: number; lines: string[] } => {
      const font = fontOf({ fontSize, fontWeight, fontFamily } as UIStyle, fontSize);
      const resolved = interpolateVars(text, this.vars);
      const lines = wrapLines(this.ctx, resolved, font, maxWidth);
      let w = 0;
      this.ctx.font = font;
      for (const l of lines) w = Math.max(w, this.ctx.measureText(l).width);
      return { w, h: lines.length * fontSize * 1.25, lines };
    };
    this.linesById.clear();
    this.boxes = layoutTree(this.screen.root, this.vw, this.vh, measure);
    this.boxById.clear();
    for (const b of this.boxes) this.boxById.set(b.nodeId, b);
    // Mémorise les lignes (mêmes coupures au dessin).
    for (const b of this.boxes) {
      const n = this.nodeById.get(b.nodeId);
      if (!n || (n.type !== 'text' && n.type !== 'button')) continue;
      const st = n.style ?? {};
      const font = fontOf(st, st.fontSize ?? 16);
      const maxW = this.contentWidth(n, b);
      this.linesById.set(
        n.id,
        wrapLines(this.ctx, interpolateVars(n.text ?? '', this.vars), font, maxW)
      );
    }
  }

  private contentWidth(node: UINode, box: LayoutBox): number | null {
    const st = node.style ?? {};
    if (typeof st.width === 'number') return Math.max(0, st.width - (node.type === 'button' ? 24 : 0));
    if (node.type === 'button') return Math.max(0, box.w - 24);
    return null;
  }

  public draw(): void {
    const { ctx, vw, vh } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    if (this.screen.dimColor) {
      ctx.fillStyle = this.screen.dimColor;
      ctx.fillRect(0, 0, vw, vh);
    }
    this.relayout();
    const sr = this.screenRuntime;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, sr.opacity));
    if (sr.offsetX !== 0 || sr.offsetY !== 0) ctx.translate(sr.offsetX, sr.offsetY);
    if (sr.scale !== 1 || sr.rotation !== 0) {
      ctx.translate(vw / 2, vh / 2);
      ctx.rotate(((sr.rotation as number) * Math.PI) / 180);
      const s = sr.scale as number;
      ctx.scale(s, s);
      ctx.translate(-vw / 2, -vh / 2);
    }
    this.drawNode(this.screen.root);
    ctx.restore();
    if (this.texture) this.texture.needsUpdate = true;
    this.dirty = false;
  }

  private drawNode(node: UINode): void {
    if (node.visible === false) return;
    const box = this.boxById.get(node.id);
    if (!box) return;
    const rt = this.runtimeOf(node.id);
    const st = node.style ?? {};
    const ctx = this.ctx;
    const alpha = Math.max(0, Math.min(1, (st.opacity ?? 1) * rt.opacity));
    if (alpha <= 0.001) {
      // Toujours dessiner les enfants ? Non : parent invisible = enfants invisibles.
      return;
    }
    const x = box.x + rt.offsetX;
    const y = box.y + rt.offsetY;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (rt.scale !== 1 || rt.rotation !== 0) {
      ctx.translate(x + box.w / 2, y + box.h / 2);
      ctx.rotate((rt.rotation * Math.PI) / 180);
      ctx.scale(rt.scale, rt.scale);
      ctx.translate(-(x + box.w / 2), -(y + box.h / 2));
    }

    if (node.type === 'text') {
      this.drawText(node, x, y, box.w);
    } else if (node.type === 'button') {
      this.drawButton(node, x, y, box.w, box.h, rt);
    } else if (node.type === 'image') {
      this.drawImage(node, x, y, box.w, box.h);
    } else if (node.type === 'bar') {
      this.drawBar(node, x, y, box.w, box.h);
    } else {
      this.drawContainerBg(node, x, y, box.w, box.h, null);
    }
    ctx.restore();

    // Enfants (par-dessus le fond ; seuls les conteneurs en ont).
    if (node.type === 'container') {
      for (const c of node.children ?? []) this.drawNode(c);
    }
  }

  private drawContainerBg(
    node: UINode,
    x: number,
    y: number,
    w: number,
    h: number,
    hover: boolean | null
  ): void {
    const st = node.style ?? {};
    let bg = st.background ?? null;
    if (node.type === 'button') {
      if (this.runtimeOf(node.id).pressed && st.pressedBackground) bg = st.pressedBackground;
      else if (hover && st.hoverBackground) bg = st.hoverBackground;
    }
    if (!bg || w <= 0 || h <= 0) return;
    const ctx = this.ctx;
    roundRectPath(ctx, x, y, w, h, st.borderRadius ?? 0);
    ctx.fillStyle = bg;
    ctx.fill();
    if (st.borderColor && (st.borderWidth ?? 0) > 0) {
      ctx.lineWidth = st.borderWidth ?? 1;
      ctx.strokeStyle = st.borderColor;
      ctx.stroke();
    }
  }

  private drawText(node: UINode, x: number, y: number, w: number): void {
    const st = node.style ?? {};
    const fs = st.fontSize ?? 16;
    const ctx = this.ctx;
    const lines = this.linesById.get(node.id) ?? [interpolateVars(node.text ?? '', this.vars)];
    const lh = 1.25 * (st.fontSize ?? 16);
    const align = st.textAlign ?? 'left';
    ctx.font = fontOf(st, fs);
    ctx.textBaseline = 'top';
    if (st.shadowColor) {
      ctx.shadowColor = st.shadowColor;
      ctx.shadowBlur = st.shadowBlur ?? 8;
    } else {
      ctx.shadowBlur = 0;
    }
    // Hauteur totale pour centrage vertical si boîte plus haute.
    const box = this.boxById.get(node.id);
    const totalH = lines.length * lh;
    let ly = y;
    if (box && box.h > totalH + 1) ly = y + (box.h - totalH) / 2;
    for (const line of lines) {
      let lx = x;
      if (align === 'center') lx = x + (w - ctx.measureText(line).width) / 2;
      else if (align === 'right') lx = x + w - ctx.measureText(line).width;
      if (st.outlineColor && (st.outlineWidth ?? 0) > 0) {
        ctx.lineWidth = st.outlineWidth ?? 1;
        ctx.strokeStyle = st.outlineColor;
        ctx.strokeText(line, lx, ly);
      }
      ctx.fillStyle = st.color ?? '#ffffff';
      ctx.fillText(line, lx, ly);
      ly += lh;
    }
    ctx.shadowBlur = 0;
  }

  private drawButton(
    node: UINode,
    x: number,
    y: number,
    w: number,
    h: number,
    rt: NodeRuntime
  ): void {
    const st = node.style ?? {};
    const ctx = this.ctx;
    let bg = st.background ?? '#2563eb';
    if (rt.pressed && st.pressedBackground) bg = st.pressedBackground;
    else if (rt.hover && st.hoverBackground) bg = st.hoverBackground;
    const scaleBoost = rt.hover ? (st.hoverScale ?? 1) : 1;
    if (scaleBoost !== 1) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(scaleBoost, scaleBoost);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    roundRectPath(ctx, x, y, w, h, st.borderRadius ?? 10);
    ctx.fillStyle = bg;
    ctx.fill();
    if (st.borderColor && (st.borderWidth ?? 0) > 0) {
      ctx.lineWidth = st.borderWidth ?? 1;
      ctx.strokeStyle = st.borderColor;
      ctx.stroke();
    }
    // Label centré.
    const fs = st.fontSize ?? 15;
    const lines = this.linesById.get(node.id) ?? [interpolateVars(node.text ?? '', this.vars)];
    const lh = 1.25 * (st.fontSize ?? 15);
    ctx.font = fontOf(st, fs);
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 0;
    if (st.outlineColor && (st.outlineWidth ?? 0) > 0) {
      ctx.lineWidth = st.outlineWidth ?? 1;
      ctx.strokeStyle = st.outlineColor;
    }
    ctx.fillStyle = st.color ?? '#ffffff';
    const totalH = lines.length * lh;
    let ly = y + Math.max(0, (h - totalH) / 2);
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      const lx = x + (w - lw) / 2;
      if (st.outlineColor && (st.outlineWidth ?? 0) > 0) ctx.strokeText(line, lx, ly);
      ctx.fillText(line, lx, ly);
      ly += lh;
    }
  }

  private drawImage(node: UINode, x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    const url = node.imageUrl ?? '';
    if (!url || w <= 0 || h <= 0) return;
    let img = this.images.get(url);
    if (!img) {
      img = new Image();
      img.onload = () => this.markDirty();
      img.src = url;
      this.images.set(url, img);
      // Placeholder pendant le chargement.
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, w, h);
      return;
    }
    if (!img.complete || img.naturalWidth === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, w, h);
      return;
    }
    // Cover (remplit, rogne le dépassement).
    const ir = img.naturalWidth / img.naturalHeight;
    const br = w / h;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (ir > br) sw = sh * br;
    else sh = sw / br;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) / 2;
    ctx.save();
    const st = node.style ?? {};
    if ((st.borderRadius ?? 0) > 0) {
      roundRectPath(ctx, x, y, w, h, st.borderRadius ?? 0);
      ctx.clip();
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  }

  private drawBar(node: UINode, x: number, y: number, w: number, h: number): void {
    const st = node.style ?? {};
    const ctx = this.ctx;
    roundRectPath(ctx, x, y, w, h, st.borderRadius ?? 7);
    ctx.fillStyle = st.background ?? 'rgba(255,255,255,0.15)';
    ctx.fill();
    let v = 0;
    if (node.boundVariable) {
      const raw = this.vars[node.boundVariable];
      const max = node.maxValue && node.maxValue > 0 ? node.maxValue : 100;
      v = typeof raw === 'number' ? raw / max : 0;
    } else if (node.text) {
      v = Math.max(0, Math.min(1, Number(node.text) || 0));
    }
    v = Math.max(0, Math.min(1, v));
    if (v > 0) {
      const pad = Math.min(3, h / 4);
      roundRectPath(ctx, x + pad, y + pad, Math.max(0.5, (w - pad * 2) * v), h - pad * 2, Math.max(0, (st.borderRadius ?? 7) - pad));
      ctx.fillStyle = st.color ?? '#4ade80';
      ctx.fill();
    }
    if (st.borderColor && (st.borderWidth ?? 0) > 0) {
      roundRectPath(ctx, x, y, w, h, st.borderRadius ?? 7);
      ctx.lineWidth = st.borderWidth ?? 1;
      ctx.strokeStyle = st.borderColor;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------- hit-test

  /** Bouton le plus haut sous le point (coordonnées CSS px). */
  public pickButton(px: number, py: number): { node: UINode; box: LayoutBox } | null {
    const hit = hitTest(this.boxes, px, py);
    if (!hit) return null;
    // Remonte au bouton ancêtre le plus proche (clic sur label/enfant).
    let node: UINode | undefined = this.nodeById.get(hit.nodeId);
    // D'abord : le hit lui-même s'il est bouton.
    if (node && node.type === 'button' && node.visible !== false) {
      return { node, box: hit };
    }
    // Sinon cherche le bouton parent (boîte englobante).
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      const n = this.nodeById.get(b.nodeId);
      if (!n || n.type !== 'button' || n.visible === false) continue;
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
        return { node: n, box: b };
      }
    }
    return null;
  }

  public setHover(id: string | null): boolean {
    if (this.hoverId === id) return false;
    if (this.hoverId) this.runtimeOf(this.hoverId).hover = false;
    this.hoverId = id;
    if (id) this.runtimeOf(id).hover = true;
    this.markDirty();
    return true;
  }

  public setPressed(id: string | null): boolean {
    if (this.pressedId === id) return false;
    if (this.pressedId) this.runtimeOf(this.pressedId).pressed = false;
    this.pressedId = id;
    if (id) this.runtimeOf(id).pressed = true;
    this.markDirty();
    return true;
  }

  /** Consomme l'appui : true si le bouton donné était pressé (→ clic valide). */
  public consumePress(id: string): boolean {
    const ok = this.pressedId === id;
    this.setPressed(null);
    return ok;
  }

  public tweenProp(id: string, prop: TweenProp, to: number, opts?: Parameters<TweenManager['tween']>[3]): number {
    const idNum = this.tweens.tween(this.runtimeOf(id), prop, to, opts);
    this.markDirty();
    return idNum;
  }

  public dispose(): void {
    this.texture?.dispose();
    this.texture = null;
    this.tweens.clear();
  }
}
