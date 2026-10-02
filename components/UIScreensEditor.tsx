'use client';

import React, { useState } from 'react';
import { confirmBox } from '../lib/ui/overlays';
import {
  Plus,
  Trash2,
  Type,
  MousePointerClick,
  Image as ImageIcon,
  BarChart3,
  Minus,
  Folder,
  Play,
} from 'lucide-react';
import type { UIScreen, UINode, UINodeType, UIAction } from '../types/hud';
import { defaultUIScreen } from '../types/hud';

interface UIScreensEditorProps {
  screens: UIScreen[];
  onChange: (screens: UIScreen[]) => void;
  onStarterPreset: (kind: 'pause' | 'gameover' | 'mainmenu') => void;
}

const uid = (p: string): string => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const btnCls = 'px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors';

function newNode(type: UINodeType, name: string): UINode {
  const base: UINode = {
    id: uid('n'),
    type,
    name,
    style: {},
    children: type === 'container' ? [] : undefined,
  };
  if (type === 'text') {
    base.text = 'Nouveau texte {Score}';
    base.style = { fontSize: 20, color: '#ffffff', textAlign: 'center' };
  } else if (type === 'button') {
    base.text = 'Bouton';
    base.style = {
      fontSize: 16, color: '#ffffff', background: '#2563eb',
      hoverBackground: '#1d4ed8', borderRadius: 10, padding: 12, width: 200,
    };
    base.action = { kind: 'hide' };
  } else if (type === 'bar') {
    base.boundVariable = 'Health';
    base.maxValue = 100;
    base.style = { width: 220, height: 16, color: '#4ade80', background: 'rgba(255,255,255,0.15)', borderRadius: 8 };
  } else if (type === 'image') {
    base.style = { width: 96, height: 96, borderRadius: 8 };
  } else if (type === 'container') {
    base.style = { flexDirection: 'column', gap: 8, padding: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 12 };
  }
  return base;
}

function findNode(root: UINode, id: string): UINode | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

function removeNode(root: UINode, id: string): boolean {
  const kids = root.children ?? [];
  const i = kids.findIndex((c) => c.id === id);
  if (i >= 0) {
    kids.splice(i, 1);
    return true;
  }
  for (const c of kids) {
    if (removeNode(c, id)) return true;
  }
  return false;
}

function flatten(root: UINode, depth = 0): { node: UINode; depth: number }[] {
  const out: { node: UINode; depth: number }[] = [{ node: root, depth }];
  for (const c of root.children ?? []) out.push(...flatten(c, depth + 1));
  return out;
}

export const UIScreensEditor: React.FC<UIScreensEditorProps> = ({ screens, onChange, onStarterPreset }) => {
  const [selScreen, setSelScreen] = useState<string | null>(screens[0]?.id ?? null);
  const [selNode, setSelNode] = useState<string | null>(null);

  const screen = screens.find((s) => s.id === selScreen) ?? null;

  const patchScreen = (fn: (s: UIScreen) => void): void => {
    if (!screen) return;
    onChange(
      screens.map((s) => {
        if (s.id !== screen.id) return s;
        const next = JSON.parse(JSON.stringify(s)) as UIScreen;
        fn(next);
        return next;
      })
    );
  };

  const patchNode = (fn: (n: UINode) => void): void => {
    if (!screen || !selNode) return;
    patchScreen((s) => {
      const n = findNode(s.root, selNode);
      if (n) fn(n);
    });
  };

  const sel = screen && selNode ? findNode(screen.root, selNode) : null;

  return (
    <div className="flex-1 flex overflow-hidden text-xs">
      {/* Liste écrans */}
      <div className="w-60 border-r border-zinc-800/80 bg-zinc-900/30 flex flex-col p-3 gap-2 overflow-y-auto">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-zinc-300 uppercase tracking-wider font-mono text-[10px]">Écrans UI</span>
          <button
            type="button"
            onClick={() => {
              const s = defaultUIScreen(`Écran ${screens.length + 1}`);
              onChange([...screens, s]);
              setSelScreen(s.id);
              setSelNode(null);
            }}
            className={`${btnCls} bg-violet-500/15 border-violet-500/40 text-violet-200`}
          >
            <Plus className="w-3 h-3 inline" /> Écran
          </button>
        </div>
        {screens.map((s) => (
          <div
            key={s.id}
            onClick={() => {
              setSelScreen(s.id);
              setSelNode(null);
            }}
            className={`p-2 rounded-xl border cursor-pointer ${selScreen === s.id ? 'bg-violet-500/15 border-violet-500/40' : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800/60'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-100 truncate">{s.name}</span>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const ok = await confirmBox(`Supprimer l’écran "${s.name}" ?`, {
                    title: 'Supprimer l’écran',
                    okLabel: 'Supprimer',
                  });
                  if (ok) {
                    onChange(screens.filter((x) => x.id !== s.id));
                    if (selScreen === s.id) {
                      setSelScreen(null);
                      setSelNode(null);
                    }
                  }
                }}
                className="p-1 rounded text-zinc-600 hover:text-rose-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
              {s.visibleOnPlay ? 'visible au Play' : 'caché'} · {s.modal ? 'modal' : 'non-modal'}
            </div>
          </div>
        ))}
        <div className="pt-1 border-t border-zinc-800/80">
          <div className="text-[10px] font-mono text-zinc-500 mb-1">Presets :</div>
          <div className="flex flex-wrap gap-1">
            {(['pause', 'gameover', 'mainmenu'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onStarterPreset(k)}
                className={`${btnCls} bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-violet-500/40`}
              >
                + {k === 'pause' ? 'Pause' : k === 'gameover' ? 'Game Over' : 'Menu'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Arbre + ajout */}
      <div className="w-64 border-r border-zinc-800/80 bg-zinc-900/20 flex flex-col p-3 gap-2 overflow-y-auto">
        {!screen ? (
          <div className="text-zinc-600 text-[11px]">Sélectionnez un écran.</div>
        ) : (
          <>
            <div className="text-[10px] font-mono text-zinc-500 uppercase">Arborescence</div>
            <div className="flex flex-col gap-0.5">
              {flatten(screen.root).map(({ node, depth }) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelNode(node.id)}
                  style={{ paddingLeft: `${6 + depth * 12}px` }}
                  className={`flex items-center gap-1.5 py-1 pr-2 rounded-lg text-left text-[11px] border ${selNode === node.id ? 'bg-violet-500/15 border-violet-500/40 text-white' : 'bg-transparent border-transparent text-zinc-400 hover:bg-zinc-800/60'}`}
                >
                  <NodeIcon type={node.type} />
                  <span className="truncate font-mono">{node.name}</span>
                </button>
              ))}
            </div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase mt-1">Ajouter dans : {sel && sel.type === 'container' ? sel.name : 'racine'}</div>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['container', Folder, 'Bloc'],
                  ['text', Type, 'Texte'],
                  ['button', MousePointerClick, 'Bouton'],
                  ['image', ImageIcon, 'Image'],
                  ['bar', BarChart3, 'Barre'],
                  ['spacer', Minus, 'Espace'],
                ] as const
              ).map(([t, Icon, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    const parentId =
                      sel && sel.type === 'container' ? sel.id : screen.root.id;
                    patchScreen((s) => {
                      const parent = findNode(s.root, parentId);
                      if (!parent) return;
                      parent.children = parent.children ?? [];
                      const n = newNode(t, label);
                      parent.children.push(n);
                    });
                  }}
                  className="flex flex-col items-center gap-1 p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-violet-500/40 text-[10px]"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
            {sel && sel.id !== screen.root.id && (
              <button
                type="button"
                onClick={() => {
                  patchScreen((s) => {
                    removeNode(s.root, sel.id);
                  });
                  setSelNode(null);
                }}
                className={`${btnCls} bg-rose-500/10 border-rose-500/30 text-rose-300`}
              >
                <Trash2 className="w-3 h-3 inline mr-1" /> Supprimer le nœud
              </button>
            )}
          </>
        )}
      </div>

      {/* Propriétés */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3">
        {!screen ? (
          <div className="text-zinc-600 text-[11px]">Créez ou choisissez un écran, ajoutez des nœuds, réglez leurs propriétés — rendu en jeu via Play.</div>
        ) : !sel ? (
          <ScreenProps screen={screen} patchScreen={patchScreen} />
        ) : (
          <NodeProps
            node={sel}
            isRoot={sel.id === screen.root.id}
            patchNode={patchNode}
          />
        )}
      </div>
    </div>
  );
};

function NodeIcon({ type }: { type: UINode['type'] }): React.ReactElement {
  switch (type) {
    case 'container': return <Folder className="w-3 h-3 text-zinc-500 shrink-0" />;
    case 'text': return <Type className="w-3 h-3 text-sky-400 shrink-0" />;
    case 'button': return <MousePointerClick className="w-3 h-3 text-emerald-400 shrink-0" />;
    case 'image': return <ImageIcon className="w-3 h-3 text-amber-400 shrink-0" />;
    case 'bar': return <BarChart3 className="w-3 h-3 text-lime-400 shrink-0" />;
    default: return <Minus className="w-3 h-3 text-zinc-600 shrink-0" />;
  }
}

function ScreenProps({
  screen,
  patchScreen,
}: {
  screen: UIScreen;
  patchScreen: (fn: (s: UIScreen) => void) => void;
}): React.ReactElement {
  const F = ({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement => (
    <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
  const ic = 'px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-[11px] outline-none focus:border-violet-500/50 min-w-0';
  const trans = ['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale'] as const;
  return (
    <div className="space-y-2">
      <div className="font-semibold text-zinc-200">Écran : {screen.name}</div>
      <F label="Nom">
        <input value={screen.name} onChange={(e) => patchScreen((s) => { s.name = e.target.value; })} className={`${ic} w-40`} />
      </F>
      <F label="Visible au Play">
        <input type="checkbox" checked={screen.visibleOnPlay} onChange={(e) => patchScreen((s) => { s.visibleOnPlay = e.target.checked; })} className="accent-violet-500" />
      </F>
      <F label="Modal (bloque scène)">
        <input type="checkbox" checked={screen.modal} onChange={(e) => patchScreen((s) => { s.modal = e.target.checked; })} className="accent-violet-500" />
      </F>
      <F label="Transition entrée">
        <select value={screen.showTransition} onChange={(e) => patchScreen((s) => { s.showTransition = e.target.value as UIScreen['showTransition']; })} className={`${ic} w-32`}>
          {trans.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </F>
      <F label="Transition sortie">
        <select value={screen.hideTransition} onChange={(e) => patchScreen((s) => { s.hideTransition = e.target.value as UIScreen['hideTransition']; })} className={`${ic} w-32`}>
          {trans.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </F>
      <F label="Durée (s)">
        <input type="number" min={0} max={2} step={0.05} value={screen.transitionDuration} onChange={(e) => patchScreen((s) => { s.transitionDuration = Math.max(0, Number(e.target.value) || 0); })} className={`${ic} w-20 font-mono`} />
      </F>
      <F label="Voile (vide = aucun)">
        <input value={screen.dimColor ?? ''} onChange={(e) => patchScreen((s) => { s.dimColor = e.target.value || null; })} placeholder="rgba(0,0,0,0.55)" className={`${ic} w-40 font-mono`} />
      </F>
      <div className="text-[10px] text-zinc-600">Cliquez un nœud pour éditer ses propriétés. Testez via Play (passez en jeu).</div>
    </div>
  );
}

function NodeProps({
  node,
  isRoot,
  patchNode,
}: {
  node: UINode;
  isRoot: boolean;
  patchNode: (fn: (n: UINode) => void) => void;
}): React.ReactElement {
  const F = ({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement => (
    <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
  const ic = 'px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-[11px] outline-none focus:border-violet-500/50 min-w-0';
  const st = (node.style = node.style ?? {});
  const setS = (k: string, v: unknown): void => patchNode((n) => {
    n.style = n.style ?? {};
    (n.style as Record<string, unknown>)[k] = v;
  });
  const num = (v: string, fb: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  return (
    <div className="space-y-2">
      <div className="font-semibold text-zinc-200 font-mono">
        {node.type} · {node.name}
      </div>
      <F label="Nom">
        <input value={node.name} onChange={(e) => patchNode((n) => { n.name = e.target.value; })} className={`${ic} w-40`} />
      </F>
      <F label="Visible">
        <input type="checkbox" checked={node.visible !== false} onChange={(e) => patchNode((n) => { n.visible = e.target.checked; })} className="accent-violet-500" />
      </F>
      {(node.type === 'text' || node.type === 'button') && (
        <F label="Texte ({Var})">
          <input value={node.text ?? ''} onChange={(e) => patchNode((n) => { n.text = e.target.value; })} className={`${ic} w-40`} />
        </F>
      )}
      {(node.type === 'bar') && (
        <>
          <F label="Variable">
            <input value={node.boundVariable ?? ''} onChange={(e) => patchNode((n) => { n.boundVariable = e.target.value; })} className={`${ic} w-32 font-mono`} />
          </F>
          <F label="Max">
            <input type="number" value={node.maxValue ?? 100} onChange={(e) => patchNode((n) => { n.maxValue = num(e.target.value, 100); })} className={`${ic} w-20 font-mono`} />
          </F>
        </>
      )}
      {node.type === 'image' && (
        <F label="URL image">
          <input value={node.imageUrl ?? ''} onChange={(e) => patchNode((n) => { n.imageUrl = e.target.value; })} placeholder="https://… ou data:…" className={`${ic} w-40 font-mono`} />
        </F>
      )}
      {node.type === 'button' && (
        <ActionEditor
          action={node.action ?? null}
          onChange={(a) => patchNode((n) => { n.action = a; })}
        />
      )}
      {/* Layout */}
      <div className="pt-1 border-t border-zinc-800/80 space-y-2">
        <div className="text-[10px] font-mono text-zinc-500 uppercase">Layout & style</div>
        {!isRoot && (
          <F label="Ancre">
            <select
              value={node.anchor ?? 'top-left'}
              onChange={(e) => patchNode((n) => { n.anchor = e.target.value as UINode['anchor']; })}
              className={`${ic} w-32`}
            >
              {['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </F>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <F label="Larg.">
            <input value={st.width ?? ''} onChange={(e) => setS('width', e.target.value === '' ? undefined : (/^\d+%$/.test(e.target.value.trim()) ? e.target.value.trim() : num(e.target.value, 0)))} placeholder="auto" className={`${ic} w-20 font-mono`} />
          </F>
          <F label="Haut.">
            <input value={st.height ?? ''} onChange={(e) => setS('height', e.target.value === '' ? undefined : (/^\d+%$/.test(e.target.value.trim()) ? e.target.value.trim() : num(e.target.value, 0)))} placeholder="auto" className={`${ic} w-20 font-mono`} />
          </F>
          <F label="Gap">
            <input type="number" value={st.gap ?? 0} onChange={(e) => setS('gap', num(e.target.value, 0))} className={`${ic} w-20 font-mono`} />
          </F>
          <F label="Padding">
            <input type="number" value={st.padding ?? 0} onChange={(e) => setS('padding', num(e.target.value, 0))} className={`${ic} w-20 font-mono`} />
          </F>
          <F label="Opacité">
            <input type="number" min={0} max={1} step={0.05} value={st.opacity ?? 1} onChange={(e) => setS('opacity', Math.max(0, Math.min(1, num(e.target.value, 1))))} className={`${ic} w-20 font-mono`} />
          </F>
          <F label="Rayon">
            <input type="number" min={0} value={st.borderRadius ?? 0} onChange={(e) => setS('borderRadius', Math.max(0, num(e.target.value, 0)))} className={`${ic} w-20 font-mono`} />
          </F>
        </div>
        {node.type === 'container' && (
          <div className="grid grid-cols-3 gap-1.5">
            <F label="Dir.">
              <select value={st.flexDirection ?? 'column'} onChange={(e) => setS('flexDirection', e.target.value)} className={ic}>
                <option value="column">↓</option>
                <option value="row">→</option>
              </select>
            </F>
            <F label="Just.">
              <select value={st.justifyContent ?? 'start'} onChange={(e) => setS('justifyContent', e.target.value)} className={ic}>
                {['start', 'center', 'end', 'space-between', 'space-around'].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </F>
            <F label="Align.">
              <select value={st.alignItems ?? 'start'} onChange={(e) => setS('alignItems', e.target.value)} className={ic}>
                {['start', 'center', 'end', 'stretch'].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </F>
          </div>
        )}
        <F label="Fond">
          <span className="flex items-center gap-1.5">
            <input type="color" value={toColorInput(st.background)} onChange={(e) => setS('background', e.target.value)} className="w-8 h-6 rounded bg-transparent cursor-pointer" />
            <input value={st.background ?? ''} onChange={(e) => setS('background', e.target.value || null)} placeholder="aucun" className={`${ic} w-28 font-mono`} />
          </span>
        </F>
        {(node.type === 'text' || node.type === 'button') && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <F label="Taille">
                <input type="number" min={8} max={160} value={st.fontSize ?? 16} onChange={(e) => setS('fontSize', Math.max(8, num(e.target.value, 16)))} className={`${ic} w-20 font-mono`} />
              </F>
              <F label="Align.">
                <select value={st.textAlign ?? 'left'} onChange={(e) => setS('textAlign', e.target.value)} className={ic}>
                  {['left', 'center', 'right'].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
            </div>
            <F label="Couleur texte">
              <span className="flex items-center gap-1.5">
                <input type="color" value={toColorInput(st.color ?? '#ffffff')} onChange={(e) => setS('color', e.target.value)} className="w-8 h-6 rounded bg-transparent cursor-pointer" />
                <input value={st.color ?? ''} onChange={(e) => setS('color', e.target.value || '#ffffff')} className={`${ic} w-28 font-mono`} />
              </span>
            </F>
            <F label="Contour">
              <span className="flex items-center gap-1.5">
                <input type="color" value={toColorInput(st.outlineColor ?? '#000000')} onChange={(e) => setS('outlineColor', e.target.value)} className="w-8 h-6 rounded bg-transparent cursor-pointer" />
                <input type="number" min={0} max={8} step={0.5} value={st.outlineWidth ?? 0} onChange={(e) => setS('outlineWidth', Math.max(0, num(e.target.value, 0)))} className={`${ic} w-16 font-mono`} />
              </span>
            </F>
          </>
        )}
        {node.type === 'button' && (
          <>
            <F label="Fond survol">
              <input value={st.hoverBackground ?? ''} onChange={(e) => setS('hoverBackground', e.target.value || null)} placeholder="#…" className={`${ic} w-32 font-mono`} />
            </F>
            <F label="Échelle survol">
              <input type="number" min={1} max={1.3} step={0.02} value={st.hoverScale ?? 1} onChange={(e) => setS('hoverScale', Math.max(1, num(e.target.value, 1)))} className={`${ic} w-20 font-mono`} />
            </F>
          </>
        )}
        <F label="Intro">
          <select
            value={node.intro ?? 'none'}
            onChange={(e) => patchNode((n) => { n.intro = e.target.value === 'none' ? null : (e.target.value as UINode['intro']); })}
            className={`${ic} w-32`}
          >
            {(['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale'] as const).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </F>
      </div>
    </div>
  );
}

function toColorInput(v: string | null | undefined): string {
  if (!v) return '#000000';
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return '#000000';
}

function ActionEditor({
  action,
  onChange,
}: {
  action: UIAction | null;
  onChange: (a: UIAction | null) => void;
}): React.ReactElement {
  const ic = 'px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-[11px] outline-none focus:border-violet-500/50 min-w-0';
  const kind = action?.kind ?? 'hide';
  const setKind = (k: UIAction['kind']): void => {
    if (k === 'show' || k === 'toggle') onChange({ kind: k, screen: '' });
    else if (k === 'hide') onChange({ kind: 'hide' });
    else if (k === 'setVar') onChange({ kind: 'setVar', name: 'Score', value: 0 });
    else if (k === 'addVar') onChange({ kind: 'addVar', name: 'Score', delta: 1 });
    else if (k === 'resume' || k === 'restart') onChange({ kind: k });
    else onChange({ kind: 'custom', event: 'my_event' });
  };
  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-1.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Play className="w-3 h-3 text-emerald-400 shrink-0" />
        <select value={kind} onChange={(e) => setKind(e.target.value as UIAction['kind'])} className={`${ic} flex-1`}>
          <option value="hide">masquer écran</option>
          <option value="show">afficher écran</option>
          <option value="toggle">basculer écran</option>
          <option value="setVar">définir variable</option>
          <option value="addVar">ajouter variable</option>
          <option value="resume">reprendre</option>
          <option value="restart">recommencer</option>
          <option value="custom">événement custom</option>
        </select>
      </div>
      {(kind === 'show' || kind === 'toggle') && action && 'screen' in action && (
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          Écran (id)
          <input
            value={(action as { screen: string }).screen}
            onChange={(e) => onChange({ ...(action as object), screen: e.target.value } as UIAction)}
            placeholder="screen_…"
            className={`${ic} flex-1 font-mono`}
          />
        </label>
      )}
      {kind === 'setVar' && action?.kind === 'setVar' && (
        <div className="flex items-center gap-1.5">
          <input value={action.name} onChange={(e) => onChange({ ...action, name: e.target.value })} className={`${ic} flex-1 font-mono`} placeholder="Nom" />
          <input
            value={String(action.value)}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({ ...action, value: raw === 'true' ? true : raw === 'false' ? false : Number(raw) || 0 });
            }}
            className={`${ic} w-20 font-mono`}
            placeholder="Valeur"
          />
        </div>
      )}
      {kind === 'addVar' && action?.kind === 'addVar' && (
        <div className="flex items-center gap-1.5">
          <input value={action.name} onChange={(e) => onChange({ ...action, name: e.target.value })} className={`${ic} flex-1 font-mono`} placeholder="Nom" />
          <input
            type="number" value={action.delta}
            onChange={(e) => onChange({ ...action, delta: Number(e.target.value) || 0 })}
            className={`${ic} w-20 font-mono`}
          />
        </div>
      )}
      {kind === 'custom' && action?.kind === 'custom' && (
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          Événement
          <input value={action.event} onChange={(e) => onChange({ ...action, event: e.target.value })} className={`${ic} flex-1 font-mono`} placeholder="my_event" />
        </label>
      )}
      <div className="text-[10px] text-zinc-600">custom → script onCustomEvent + nœuds OnCustomEvent.</div>
    </div>
  );
}
