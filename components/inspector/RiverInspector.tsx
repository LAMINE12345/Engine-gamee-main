'use client';

import React from 'react';
import { Waves } from 'lucide-react';
import { SectionProps, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { StyledSlider, InlineColorRow, SwitchToggle } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';
import { DEFAULT_RIVER_CONFIG } from '../../lib/water/RiverMesh';

/**
 * RiverInspector — dimensions, courant, méandres, couleurs, sculpture.
 * Visible si subType 'river'. Multi-edit ventilé par champ.
 */
export function RiverInspector({
  nodes,
  onUpdateRiverConfig,
  collapsed,
  onToggleCollapse,
}: SectionProps) {
  const targets = nodes.filter((n) => n.subType === 'river' && n.riverConfig);
  if (targets.length === 0 || !onUpdateRiverConfig) return null;
  const cfg = targets[0].riverConfig as Record<string, number | string | boolean>;

  const updateAll = (patch: Record<string, number | string | boolean>) => {
    targets.forEach((n) => onUpdateRiverConfig(n.id, patch));
  };
  const mv = (key: string) => mixedValue(targets, (n) => (n.riverConfig as Record<string, number | string | boolean>)?.[key]);

  const width = mv('width') as { value: number; mixed: boolean };
  const length = mv('length') as { value: number; mixed: boolean };
  const flowSpeed = mv('flowSpeed') as { value: number; mixed: boolean };
  const meanderFactor = mv('meanderFactor') as { value: number; mixed: boolean };
  const meanderAmplitude = mv('meanderAmplitude') as { value: number; mixed: boolean };
  const waterColor = mv('waterColor') as { value: string; mixed: boolean };
  const deepWaterColor = mv('deepWaterColor') as { value: string; mixed: boolean };
  const foamColor = mv('foamColor') as { value: string; mixed: boolean };
  const foamIntensity = mv('foamIntensity') as { value: number; mixed: boolean };
  const autoCarve = mixedValue(targets, (n) => Boolean((n.riverConfig as Record<string, unknown>)?.autoCarveTerrain));

  return (
    <div
      className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-800/40 space-y-3.5 shadow-md"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'Rivière', [
          {
            label: 'Copier les valeurs',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  targets.map((n) => ({ name: n.name, riverConfig: n.riverConfig })),
                  null,
                  2
                )
              ),
          },
          {
            label: 'Réinitialiser',
            onClick: () => updateAll({ ...DEFAULT_RIVER_CONFIG }),
          },
        ]);
      }}
    >
      <ComponentHeader
        icon={<Waves className="w-3.5 h-3.5 text-cyan-400" />}
        title="Paramètres de la Rivière"
        badge="3D Spline"
        mixed={width.mixed || flowSpeed.mixed}
        collapsed={collapsed ?? false}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
      />

      {!collapsed && (
        <>
          {/* 1. Dimensions & Courant */}
          <div className="space-y-3">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Dimensions & Courant</span>

            {/* Largeur */}
            <StyledSlider
              label="Largeur du Lit"
              display={`${width.value.toFixed(1)}m`}
              value={width.value}
              mixed={width.mixed}
              min={2}
              max={15}
              step={0.5}
              accent="accent-cyan-400"
              displayClassName="font-mono text-cyan-400"
              onChange={(v) => updateAll({ width: v })}
            />

            {/* Longueur */}
            <StyledSlider
              label="Longueur du Cours"
              display={`${length.value.toFixed(0)}m`}
              value={length.value}
              mixed={length.mixed}
              min={20}
              max={150}
              step={5}
              accent="accent-cyan-400"
              displayClassName="font-mono text-cyan-400"
              onChange={(v) => updateAll({ length: v })}
            />

            {/* Vitesse du Courant */}
            <StyledSlider
              label="Vitesse du Courant"
              display={`${flowSpeed.value.toFixed(1)}x`}
              value={flowSpeed.value}
              mixed={flowSpeed.mixed}
              min={0.1}
              max={3.5}
              step={0.1}
              accent="accent-cyan-400"
              displayClassName="font-mono text-cyan-400"
              onChange={(v) => updateAll({ flowSpeed: v })}
            />
          </div>

          {/* 2. Virages & Méandres */}
          <div className="space-y-3 pt-2.5 border-t border-zinc-800/60">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Virages & Méandres</span>

            {/* Facteur de Méandre (Fréquence de virage) */}
            <StyledSlider
              label="Fréquence des Virages"
              display={`${meanderFactor.value.toFixed(1)}x`}
              value={meanderFactor.value}
              mixed={meanderFactor.mixed}
              min={0.5}
              max={3.0}
              step={0.1}
              accent="accent-cyan-400"
              displayClassName="font-mono text-cyan-400"
              onChange={(v) => updateAll({ meanderFactor: v })}
            />

            {/* Amplitude de Méandre (Profondeur de virage) */}
            <StyledSlider
              label="Amplitude des Virages"
              display={`${meanderAmplitude.value.toFixed(1)}m`}
              value={meanderAmplitude.value}
              mixed={meanderAmplitude.mixed}
              min={0}
              max={20}
              step={0.5}
              accent="accent-cyan-400"
              displayClassName="font-mono text-cyan-400"
              onChange={(v) => updateAll({ meanderAmplitude: v })}
            />
          </div>

          {/* 3. Couleurs de la rivière */}
          <div className="space-y-3 pt-2.5 border-t border-zinc-800/60">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Couleurs de l&apos;Eau</span>

            {/* Couleur de surface */}
            <InlineColorRow
              label="Teinte de Surface"
              value={waterColor.value}
              onChange={(hex) => updateAll({ waterColor: hex })}
            />

            {/* Couleur profonde */}
            <InlineColorRow
              label="Teinte Abyssale"
              value={deepWaterColor.value}
              onChange={(hex) => updateAll({ deepWaterColor: hex })}
            />

            {/* Couleur écume */}
            <InlineColorRow
              label="Écume & Turbulences"
              value={foamColor.value}
              onChange={(hex) => updateAll({ foamColor: hex })}
            />

            {/* Intensité de l'écume */}
            <StyledSlider
              label="Intensité de l'Écume"
              display={`${Math.round(foamIntensity.value * 100)}%`}
              value={foamIntensity.value}
              mixed={foamIntensity.mixed}
              min={0}
              max={1.5}
              step={0.05}
              accent="accent-cyan-400"
              displayClassName="font-mono text-cyan-400"
              onChange={(v) => updateAll({ foamIntensity: v })}
            />
          </div>

          {/* 4. Options de sculpture de terrain */}
          <SwitchToggle
            label="Sculpter le lit du terrain"
            desc="Creuse automatiquement la hauteur du terrain sous la rivière"
            active={autoCarve.value}
            onToggle={() => updateAll({ autoCarveTerrain: !cfg.autoCarveTerrain })}
          />
          {autoCarve.mixed && (
            <span className="text-[9px] text-amber-400">≠ valeurs différentes selon les objets</span>
          )}
        </>
      )}
    </div>
  );
}
