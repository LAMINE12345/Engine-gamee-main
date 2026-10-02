import type { UINode, UIAnchor } from '../../types/hud';

export interface LayoutBox {
  nodeId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Profondeur (ordre de dessin / hit-test : les profonds d'abord en dessous). */
  depth: number;
}

export interface MeasureText {
  (text: string, fontSize: number, fontWeight: string | number | undefined, fontFamily: string | undefined, maxWidth: number | null): {
    w: number;
    h: number;
    lines: string[];
  };
}

interface Ctx {
  measure: MeasureText;
  boxes: LayoutBox[];
}

function anchorOffset(
  anchor: UIAnchor | undefined,
  pw: number,
  ph: number,
  w: number,
  h: number,
  ox: number,
  oy: number
): { x: number; y: number } {
  const a = anchor ?? 'top-left';
  let x = 0;
  let y = 0;
  switch (a) {
    case 'top-left': x = ox; y = oy; break;
    case 'top-center': x = (pw - w) / 2 + ox; y = oy; break;
    case 'top-right': x = pw - w + ox; y = oy; break;
    case 'middle-left': x = ox; y = (ph - h) / 2 + oy; break;
    case 'center': x = (pw - w) / 2 + ox; y = (ph - h) / 2 + oy; break;
    case 'middle-right': x = pw - w + ox; y = (ph - h) / 2 + oy; break;
    case 'bottom-left': x = ox; y = ph - h + oy; break;
    case 'bottom-center': x = (pw - w) / 2 + ox; y = ph - h + oy; break;
    case 'bottom-right': x = pw - w + ox; y = ph - h + oy; break;
    case 'fullscreen': x = 0; y = 0; break;
    default: x = ox; y = oy; break;
  }
  return { x, y };
}

function resolveSize(
  v: number | string | null | undefined,
  parent: number,
  fallback: number
): number {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return Math.max(0, v);
  const s = v.trim();
  if (s.endsWith('%')) {
    const pct = Number(s.slice(0, -1));
    if (Number.isFinite(pct)) return Math.max(0, (parent * pct) / 100);
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/**
 * Layout flexbox (sous-ensemble Yoga) : row/column, justify, align, gap,
 * padding, flexGrow, tailles px/%/auto (texte mesuré, wrap), ancre + offsets.
 * Retourne les boîtes à plat (ordre de dessin = ordre d'ajout).
 */
export function layoutTree(
  root: UINode,
  viewportW: number,
  viewportH: number,
  measure: MeasureText
): LayoutBox[] {
  const ctx: Ctx = { measure, boxes: [] };
  const st = root.style ?? {};
  const rw = resolveSize(st.width, viewportW, viewportW);
  const rh = resolveSize(st.height, viewportH, viewportH);
  const pos =
    root.anchor === 'fullscreen' ? { x: 0, y: 0 } : anchorOffset(root.anchor, viewportW, viewportH, rw, rh, root.offsetX ?? 0, root.offsetY ?? 0);
  layoutNode(root, pos.x, pos.y, rw, rh, 0, ctx);
  return ctx.boxes;
}

function intrinsicSize(
  node: UINode,
  maxW: number,
  ctx: Ctx
): { w: number; h: number; lines: string[] } {
  if (node.type === 'container') return measureContainer(node, maxW, ctx);
  return intrinsicSizeLeaf(node, maxW, ctx);
}

function intrinsicSizeLeaf(
  node: UINode,
  maxW: number,
  ctx: Ctx
): { w: number; h: number; lines: string[] } {
  const st = node.style ?? {};
  const fs = st.fontSize ?? 16;
  if (node.type === 'text' || node.type === 'button') {
    const text = node.text ?? '';
    const explicitW = typeof st.width === 'number' ? st.width : null;
    const m = ctx.measure(text, fs, st.fontWeight, st.fontFamily, explicitW ?? (maxW > 0 ? maxW : null));
    const h = node.type === 'button' ? m.h + (st.padding ?? 10) * 2 : m.h;
    const w = explicitW ?? m.w + (node.type === 'button' ? (st.padding ?? 10) * 2 + 24 : 0);
    return { w, h, lines: m.lines };
  }
  if (node.type === 'bar') {
    return {
      w: resolveSize(st.width, maxW, 180),
      h: resolveSize(st.height, 0, 14),
      lines: [],
    };
  }
  if (node.type === 'image') {
    return {
      w: resolveSize(st.width, maxW, 96),
      h: resolveSize(st.height, 0, 96),
      lines: [],
    };
  }
  if (node.type === 'spacer') {
    return { w: 0, h: 0, lines: [] };
  }
  return { w: 0, h: 0, lines: [] };
}

function measureContainer(
  node: UINode,
  maxW: number,
  ctx: Ctx
): { w: number; h: number; lines: string[] } {
  const kids = (node.children ?? []).filter((c) => c.visible !== false);
  if (kids.length === 0) return { w: 0, h: 0, lines: [] };
  const stc = node.style ?? {};
  const cdir = stc.flexDirection ?? 'column';
  const cisRow = cdir === 'row';
  const cgap = Math.max(0, stc.gap ?? 0);
  const cpad = Math.max(0, stc.padding ?? 0);
  let mainSum = 0;
  let crossMax = 0;
  for (const k of kids) {
    const sub = intrinsicSize(k, maxW, ctx);
    const kmain = cisRow ? sub.w : sub.h;
    const kcross = cisRow ? sub.h : sub.w;
    mainSum += kmain;
    crossMax = Math.max(crossMax, kcross);
  }
  mainSum += cgap * Math.max(0, kids.length - 1) + cpad * 2;
  crossMax += cpad * 2;
  return cisRow ? { w: mainSum, h: crossMax, lines: [] } : { w: crossMax, h: mainSum, lines: [] };
}

function layoutNode(
  node: UINode,
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  ctx: Ctx
): void {
  if (node.visible === false) return;
  ctx.boxes.push({ nodeId: node.id, x, y, w, h, depth });
  const children = (node.children ?? []).filter((c) => c.visible !== false);
  if (children.length === 0) return;
  const st = node.style ?? {};
  const dir = st.flexDirection ?? 'column';
  const justify = st.justifyContent ?? 'start';
  const align = st.alignItems ?? 'start';
  const gap = Math.max(0, st.gap ?? 0);
  const pad = Math.max(0, st.padding ?? 0);
  const isRow = dir === 'row';
  const mainAvail = Math.max(0, (isRow ? w : h) - pad * 2);
  const crossAvail = Math.max(0, (isRow ? h : w) - pad * 2);

  interface Item {
    node: UINode;
    main: number;
    cross: number;
    grow: number;
  }
  const items: Item[] = children.map((c) => {
    const cs = c.style ?? {};
    const intrinsic = intrinsicSize(c, isRow ? mainAvail : crossAvail, ctx);
    const crossExplicit =
      cs.width !== undefined && !isRow
        ? resolveSize(cs.width, crossAvail, intrinsic.w)
        : cs.height !== undefined && isRow
          ? resolveSize(cs.height, crossAvail, intrinsic.h)
          : null;
    const mainExplicit =
      cs.width !== undefined && isRow
        ? resolveSize(cs.width, mainAvail, intrinsic.w)
        : cs.height !== undefined && !isRow
          ? resolveSize(cs.height, mainAvail, intrinsic.h)
          : null;
    // % résolus contre l'espace dispo ; auto = intrinsèque.
    const main = mainExplicit ?? (isRow ? intrinsic.w : intrinsic.h);
    let cross = crossExplicit ?? (isRow ? intrinsic.h : intrinsic.w);
    if (align === 'stretch' && crossExplicit === null) cross = crossAvail;
    return { node: c, main, cross, grow: Math.max(0, cs.flexGrow ?? (c.type === 'spacer' ? 1 : 0)) };
  });

  const totalMain = items.reduce((s, it) => s + it.main, 0) + gap * Math.max(0, items.length - 1);
  const totalGrow = items.reduce((s, it) => s + it.grow, 0);
  const free = mainAvail - totalMain;
  if (free > 0 && totalGrow > 0) {
    for (const it of items) it.main += (free * it.grow) / totalGrow;
  }
  const used = items.reduce((s, it) => s + it.main, 0) + gap * Math.max(0, items.length - 1);
  let cursor: number;
  let step = 0;
  if (justify === 'center') cursor = (isRow ? x + pad : y + pad) + Math.max(0, mainAvail - used) / 2;
  else if (justify === 'end') cursor = (isRow ? x + pad : y + pad) + Math.max(0, mainAvail - used);
  else cursor = isRow ? x + pad : y + pad;
  if (justify === 'space-between' && items.length > 1) {
    step = Math.max(0, mainAvail - items.reduce((s, it) => s + it.main, 0)) / (items.length - 1);
  } else if (justify === 'space-around' && items.length > 0) {
    const extra = Math.max(0, mainAvail - items.reduce((s, it) => s + it.main, 0));
    step = extra / items.length;
    cursor += step / 2;
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const cs = it.node.style ?? {};
    let cx: number;
    let cy: number;
    let cw: number;
    let ch: number;
    if (isRow) {
      cw = it.main;
      ch = it.cross;
      cx = cursor;
      // Align cross (vertical).
      if (align === 'center') cy = y + pad + Math.max(0, (crossAvail - ch) / 2);
      else if (align === 'end') cy = y + pad + Math.max(0, crossAvail - ch);
      else cy = y + pad;
    } else {
      cw = it.cross;
      ch = it.main;
      cy = cursor;
      if (align === 'center') cx = x + pad + Math.max(0, (crossAvail - cw) / 2);
      else if (align === 'end') cx = x + pad + Math.max(0, crossAvail - cw);
      else cx = x + pad;
    }
    // Nœud absolu : positionné par ancre dans le parent.
    if (it.node.anchor && it.node.anchor !== 'top-left') {
      const p = anchorOffset(it.node.anchor, w, h, cw, ch, it.node.offsetX ?? 0, it.node.offsetY ?? 0);
      cx = x + p.x;
      cy = y + p.y;
    } else if ((it.node.offsetX ?? 0) !== 0 || (it.node.offsetY ?? 0) !== 0) {
      cx += it.node.offsetX ?? 0;
      cy += it.node.offsetY ?? 0;
    }
    void cs;
    layoutNode(it.node, cx, cy, Math.max(0, cw), Math.max(0, ch), depth + 1, ctx);
    cursor += (isRow ? cw : ch) + gap + step;
  }
}

/** Retrouve la boîte la plus haute (dernier dessiné) contenant le point. */
export function hitTest(boxes: LayoutBox[], px: number, py: number): LayoutBox | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
  }
  return null;
}
