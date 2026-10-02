'use client';

import React from 'react';
import { Sun, Layers } from 'lucide-react';
import { SectionProps, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { StyledSlider, MiniSwitch } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';

/**
 * LightInspector — source lumineuse (couleur, intensité) + ombres
 * (cast/receive). Multi-edit ventilé.
 */
export function LightInspector({
  nodes,
  onUpdateLight,
  collapsed,
  onToggleCollapse,
}: SectionProps) {
  const lightTargets = nodes.filter((n) => n.light);
  const light = lightTargets.length > 0 ? lightTargets[0].light! : null;
  if (!light) return null;

  const updateLightAll = (patch: { color?: string; intensity?: number }) => {
    lightTargets.forEach((n) => onUpdateLight(n.id, patch));
  };

  const lightColor = mixedValue(lightTargets, (n) => n.light?.color ?? '#ffffff');
  const lightIntensity = mixedValue(lightTargets, (n) => n.light?.intensity ?? 1);
  return (
    <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3">
      <ComponentHeader
        icon={<Sun className="w-3.5 h-3.5 text-amber-400" />}
        title="Source Lumineuse"
        mixed={lightColor.mixed || lightIntensity.mixed}
        collapsed={collapsed ?? false}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
      />

      {!collapsed && (
        <>
          {/* Color */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Couleur d&apos;émission</span>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-lg border border-zinc-700 shadow-inner relative overflow-hidden"
                style={{ backgroundColor: lightColor.value }}
              >
                <input
                  type="color"
                  value={lightColor.value}
                  onChange={(e) => updateLightAll({ color: e.target.value })}
                  className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                />
              </div>
              <span className="font-mono text-[11px] text-zinc-300 uppercase">{lightColor.value}</span>
            </div>
          </div>

          {/* Intensity */}
          <div className="space-y-1">
            <StyledSlider
              label="Intensité"
              display={(lightIntensity.value as number).toFixed(1)}
              value={lightIntensity.value as number}
              mixed={lightIntensity.mixed}
              min={0}
              max={10}
              step={0.2}
              accent="accent-amber-400"
              labelClassName="text-zinc-400"
              displayClassName="font-mono text-zinc-300"
              onChange={(v) => updateLightAll({ intensity: v })}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Section ombres (toujours visible, tous types). */
export function ShadowsInspector({
  nodes,
  onToggleShadows,
  collapsed,
  onToggleCollapse,
}: SectionProps & {
  onToggleShadows: (id: string, cast: boolean, receive: boolean) => void;
}) {
  const updateShadowsAll = (flip: 'cast' | 'receive') => {
    nodes.forEach((n) => {
      if (flip === 'cast') onToggleShadows(n.id, !n.castShadow, n.receiveShadow);
      else onToggleShadows(n.id, n.castShadow, !n.receiveShadow);
    });
  };

  const castMixed = mixedValue(nodes, (n) => n.castShadow);
  const receiveMixed = mixedValue(nodes, (n) => n.receiveShadow);
  const anyCast = nodes.some((n) => n.castShadow);
  const anyReceive = nodes.some((n) => n.receiveShadow);

  return (
    <div
      className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-2.5"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'Ombres', [
          {
            label: 'Copier les valeurs',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  nodes.map((n) => ({
                    name: n.name,
                    castShadow: n.castShadow,
                    receiveShadow: n.receiveShadow,
                  })),
                  null,
                  2
                )
              ),
          },
          {
            label: 'Réinitialiser (cast + receive)',
            onClick: () => nodes.forEach((n) => onToggleShadows(n.id, true, true)),
          },
        ]);
      }}
    >
      <ComponentHeader
        icon={<Layers className="w-3.5 h-3.5 text-indigo-400" />}
        title="Ombres (Shadow Maps)"
        mixed={castMixed.mixed || receiveMixed.mixed}
        collapsed={collapsed ?? false}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
      />

      {!collapsed && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Projeter des ombres (Cast)</span>
            <MiniSwitch
              active={anyCast}
              onToggle={() => updateShadowsAll('cast')}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Recevoir des ombres (Receive)</span>
            <MiniSwitch
              active={anyReceive}
              onToggle={() => updateShadowsAll('receive')}
            />
          </div>
        </>
      )}
    </div>
  );
}
