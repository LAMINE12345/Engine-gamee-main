'use client';

import React from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import type { LowPolyPaletteEntry } from '../../types/engine';
import { SectionProps, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { fireComponentMenu } from './ComponentContextMenu';

/**
 * PaletteInspector — couleurs éditables d'un modèle préfabriqué low-poly.
 * Chaque zone correspond à un matériau source du GLB (feuillage, tronc, …) :
 * la couleur est écrite dans les vertex colors du mesh (pas un simple tint).
 */
export function PaletteInspector({
  nodes,
  onUpdateLowPolyPalette,
  collapsed,
  onToggleCollapse,
}: SectionProps) {
  const targets = nodes.filter(
    (n) => n.subType === 'lowPoly' && Array.isArray(n.palette) && n.palette.length > 0
  );
  if (targets.length === 0 || !onUpdateLowPolyPalette) return null;
  const palette = targets[0].palette as LowPolyPaletteEntry[];

  const setColor = (zoneIdx: number, color: string) => {
    targets.forEach((n) => {
      const p = n.palette ?? [];
      const colors = p.map((z, i) => (i === zoneIdx ? color : z.color));
      onUpdateLowPolyPalette(n.id, colors);
    });
  };
  const reset = () => targets.forEach((n) => onUpdateLowPolyPalette(n.id, null));
  const mv = (zoneIdx: number) =>
    mixedValue(targets, (n) => n.palette?.[zoneIdx]?.color ?? null);

  return (
    <div
      className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'Couleurs du modèle', [
          {
            label: 'Copier les couleurs',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  targets.map((n) => ({ name: n.name, palette: n.palette })),
                  null,
                  2
                )
              ),
          },
          { label: 'Réinitialiser', onClick: reset },
        ]);
      }}
    >
      <ComponentHeader
        icon={<Palette className="w-3 h-3 text-orange-400" />}
        title="Couleurs du modèle"
        badge={`${palette.length} zone${palette.length > 1 ? 's' : ''}`}
        collapsed={Boolean(collapsed)}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
        action={
          <button
            type="button"
            onClick={reset}
            className="p-1 rounded text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            title="Réinitialiser les couleurs du modèle"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        }
      />

      {!collapsed && (
        <div className="space-y-1.5">
          {palette.map((zone, i) => {
            const { value, mixed } = mv(i);
            return (
              <label
                key={`${zone.name}-${i}`}
                className="flex items-center gap-2 group"
                title={mixed ? 'Couleurs différentes selon les objets' : zone.name}
              >
                <input
                  type="color"
                  value={value ?? zone.color}
                  onChange={(e) => setColor(i, e.target.value)}
                  className="w-7 h-7 rounded-md border border-zinc-700/70 bg-zinc-950 p-0.5 cursor-pointer group-hover:border-zinc-500 transition-colors"
                />
                <span className="flex-1 truncate text-[11px] text-zinc-300 group-hover:text-zinc-100">
                  {zone.name}
                </span>
                <span className="font-mono text-[10px] uppercase text-zinc-500">
                  {mixed ? '≠' : value ?? zone.color}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
