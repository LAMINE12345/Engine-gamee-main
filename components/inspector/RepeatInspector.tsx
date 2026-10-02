'use client';

import React from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { RepeatData } from '../../types/engine';
import { SectionProps, isMulti, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { FieldLabel, SliderRow, SwitchToggle } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';

const AXES: ReadonlyArray<RepeatData['axis']> = ['x', 'y', 'z'];
/** Recouvrement maximal : au-delà les copies se confondent visuellement. */
const MAX_OVERLAP = 0.95;
const MAX_COPIES = 24;

/**
 * RepeatInspector — répétition automatique d'un objet.
 *
 * Un objet, N copies alignées sur un axe local, espacées de
 * `taille × (1 - superposition)` : 0 % = bout à bout, 50 % = moitié chevauchées.
 * Les copies sont des enfants de la source (elles suivent ses déplacements) et
 * partagent sa géométrie/matériau.
 */
export function RepeatInspector({
  nodes,
  onUpdateRepeat,
  onGetRepeatInfo,
  collapsed,
  onToggleCollapse,
}: SectionProps) {
  const multi = isMulti(nodes);
  const node = nodes[0];

  const count = mixedValue(nodes, (n) => n.repeat?.count ?? 0);
  const axis = mixedValue(nodes, (n) => n.repeat?.axis ?? 'x');
  const overlap = mixedValue(nodes, (n) => n.repeat?.overlap ?? 0);
  const followGround = mixedValue(nodes, (n) => n.repeat?.followGround ?? false);
  const active = (count.value ?? 0) > 0;

  const info = onGetRepeatInfo ? onGetRepeatInfo(node.id) : null;
  const extent = info ? info.size[axis.value] : 0;
  const worldExtent = info ? extent * info.scale[axis.value] : 0;
  const spacing = worldExtent > 0 ? worldExtent * (1 - overlap.value) : 0;

  /** Applique un patch en préservant la config propre à chaque nœud sélectionné. */
  const push = (patch: Partial<RepeatData>): void => {
    if (!onUpdateRepeat) return;
    nodes.forEach((n) => {
      onUpdateRepeat(n.id, {
        count: n.repeat?.count ?? 0,
        axis: n.repeat?.axis ?? 'x',
        overlap: n.repeat?.overlap ?? 0,
        followGround: n.repeat?.followGround ?? false,
        ...patch,
      });
    });
  };

  const handleSpacing = (value: number): void => {
    if (!Number.isFinite(value) || value <= 0 || worldExtent <= 0) return;
    push({ overlap: Math.min(Math.max(1 - value / worldExtent, 0), MAX_OVERLAP) });
  };

  const handleClear = (): void => push({ count: 0 });

  return (
    <div
      className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, multi ? `Répétition (×${nodes.length})` : 'Répétition', [
          {
            label: 'Copier les valeurs',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  nodes.map((n) => ({ name: n.name, repeat: n.repeat ?? null })),
                  null,
                  2
                )
              ),
          },
          { label: 'Supprimer les copies', onClick: handleClear },
        ]);
      }}
    >
      <ComponentHeader
        icon={<Copy className="w-3.5 h-3.5 text-emerald-400" />}
        title={multi ? `Répétition (${nodes.length})` : '🔁 Répétition'}
        badge={active ? `×${count.value}` : undefined}
        mixed={multi && (count.mixed || axis.mixed || overlap.mixed)}
        collapsed={collapsed ?? false}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
        action={
          active ? (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Supprimer les copies"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          ) : undefined
        }
      />

      {!collapsed && (
        <div className="space-y-3">
          <SliderRow
            label="Copies"
            display={`${count.value ?? 0}  ·  ${1 + (count.value ?? 0)} objets`}
            value={count.value ?? 0}
            min={0}
            max={MAX_COPIES}
            step={1}
            accent="accent-emerald-500"
            mixed={count.mixed}
            onChange={(val) => push({ count: Math.round(val) })}
          />

          <div className="space-y-1.5">
            <FieldLabel>Axe de répétition</FieldLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {AXES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => push({ axis: a })}
                  className={`py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors border ${
                    axis.value === a
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'bg-zinc-800 text-zinc-500 border-zinc-700/50 hover:text-zinc-300'
                  }`}
                  title={`Répéter le long de l'axe ${a.toUpperCase()}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <SliderRow
            label="Superposition"
            display={`${Math.round((overlap.value ?? 0) * 100)} %${overlap.mixed ? ' ≠' : ''}`}
            value={(overlap.value ?? 0) * 100}
            min={0}
            max={MAX_OVERLAP * 100}
            step={1}
            accent="accent-emerald-500"
            mixed={overlap.mixed}
            onChange={(val) => push({ overlap: Math.min(Math.max(val / 100, 0), MAX_OVERLAP) })}
          />

          <div className="space-y-1.5">
            <FieldLabel>Espacement (m)</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.001}
                step={0.05}
                value={Number(spacing.toFixed(3))}
                disabled={worldExtent <= 0}
                onChange={(e) => handleSpacing(parseFloat(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg px-2 py-1 text-[11px] text-zinc-200 font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                title="Distance entre deux copies (mètres) — équivalent de la superposition"
              />
              <span className="text-[9px] text-zinc-500 whitespace-nowrap">
                objet&nbsp;: {worldExtent > 0 ? worldExtent.toFixed(2) : '—'}&nbsp;m
              </span>
            </div>
          </div>

          <SwitchToggle
            label="Suivre le terrain"
            desc="Recalle chaque copie au sol au moment de la génération"
            active={Boolean(followGround.value)}
            onToggle={() => push({ followGround: !followGround.value })}
            activeColor="bg-emerald-500"
          />

          <p className="text-[9px] leading-relaxed text-zinc-500 border-t border-zinc-800/50 pt-2">
            {active
              ? 'Les copies sont des enfants de cet objet : elles suivent ses déplacements. Réglez Superposition pour les faire se chevaucher.'
              : 'Activez des copies pour aligner cet objet (haies, colonnes, graminées…) avec un chevauchement réglable.'}
          </p>
        </div>
      )}
    </div>
  );
}
