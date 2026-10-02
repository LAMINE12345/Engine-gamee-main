'use client';

import React from 'react';
import { Sparkles, Zap } from 'lucide-react';
import type { ParticleEmitterData } from '../../types/engine';
import { SectionProps, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { StyledSlider, ColorSwatch, PillToggle } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';

/** Defaults par preset (valeurs d'origine, sorties du if/else historique). */
export const PRESET_DEFAULTS: Record<string, Partial<ParticleEmitterData>> = {
  magic_spell: { preset: 'magic_spell', rate: 100, maxParticles: 500, size: 0.5, speed: 1.5, color: '#3b82f6', colorEnd: '#ec4899', lifetime: 1.8, spread: 2.0, gravity: -0.2, loop: true },
  electric_sparks: { preset: 'electric_sparks', rate: 120, maxParticles: 600, size: 0.25, speed: 6.0, color: '#38bdf8', colorEnd: '#ffffff', lifetime: 0.6, spread: 3.0, gravity: 0.8, loop: true },
  volumetric_smoke: { preset: 'volumetric_smoke', rate: 35, maxParticles: 250, size: 2.2, speed: 0.8, color: '#a1a1aa', colorEnd: '#3f3f46', lifetime: 3.5, spread: 1.5, gravity: -0.3, loop: true },
  aurora: { preset: 'aurora', rate: 30, maxParticles: 300, size: 3.5, speed: 0.3, color: '#22c55e', colorEnd: '#a855f7', lifetime: 5.0, spread: 8.0, gravity: 0.0, loop: true },
  fire: { preset: 'fire', rate: 60, maxParticles: 300, size: 0.8, speed: 2.2, color: '#ff6600', colorEnd: '#cc0000', lifetime: 1.2, spread: 0.4, gravity: -1.5, loop: true },
  sparks: { preset: 'sparks', rate: 80, maxParticles: 400, size: 0.3, speed: 5.0, color: '#ffcc00', colorEnd: '#ff3300', lifetime: 0.8, spread: 1.2, gravity: 6.0, loop: true },
  cosmic_dust: { preset: 'cosmic_dust', rate: 30, maxParticles: 350, size: 0.6, speed: 0.5, color: '#a855f7', colorEnd: '#06b6d4', lifetime: 3.5, spread: 6.0, gravity: 0.0, loop: true },
  explosion: { preset: 'explosion', rate: 0, maxParticles: 500, size: 1.2, speed: 9.0, color: '#ff8800', colorEnd: '#ff0000', lifetime: 1.0, spread: 1.5, gravity: 2.0, loop: false, burstCount: 250 },
};

const PRESET_CARDS = [
  { key: 'magic_spell', label: 'Sort Magique', desc: "Spirale d'énergie", color: 'from-blue-600 to-pink-600' },
  { key: 'electric_sparks', label: 'Étincelles', desc: 'Décharges électriques', color: 'from-sky-500 to-white' },
  { key: 'volumetric_smoke', label: 'Fumée Vol.', desc: 'Nuages volumétriques', color: 'from-zinc-500 to-zinc-700' },
  { key: 'aurora', label: 'Aurore', desc: 'Vagues boréales', color: 'from-green-500 to-purple-500' },
  { key: 'fire', label: 'Feu', desc: 'Flammes chaudes', color: 'from-orange-500 to-red-600' },
  { key: 'sparks', label: 'Étincelles Feu', desc: 'Projections', color: 'from-yellow-400 to-red-500' },
  { key: 'cosmic_dust', label: 'Poussière', desc: 'Nébuleuse cosmique', color: 'from-purple-600 to-cyan-500' },
  { key: 'explosion', label: 'Explosion', desc: 'Onde de choc', color: 'from-orange-600 to-yellow-500' },
];

/**
 * ParticlesInspector — presets VFX + cycle de vie + dynamique.
 * Visible si subType 'particles'. Multi-edit ventilé par champ.
 */
export function ParticlesInspector({
  nodes,
  onUpdateParticles,
  onRemoveComponent,
  collapsed,
  onToggleCollapse,
}: SectionProps) {
  // Cibles : nœuds avec particules (multi hétérogène supporté).
  const targets = nodes.filter((n) => n.subType === 'particles' && n.particles);
  if (targets.length === 0) return null;
  const particles = targets[0].particles!;

  const updateAll = (patch: Partial<ParticleEmitterData>) => {
    targets.forEach((n) => onUpdateParticles?.(n.id, patch));
  };
  const mv = <K extends keyof ParticleEmitterData>(key: K) =>
    mixedValue(targets, (n) => n.particles?.[key] as ParticleEmitterData[K]);

  const lifetime = mv('lifetime');
  const gravity = mv('gravity');
  const speed = mv('speed');
  const size = mv('size');
  const spread = mv('spread');
  const rate = mv('rate');
  const maxParticles = mv('maxParticles');
  const color = mv('color');
  const colorEnd = mixedValue(targets, (n) => (n.particles?.colorEnd as string) || '#ff0000');
  const loop = mv('loop');

  return (
    <div
      className="p-4 rounded-2xl bg-purple-950/20 border border-purple-800/40 space-y-4 shadow-lg"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'VFX Particules', [
          {
            label: 'Copier les valeurs',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  targets.map((n) => ({ name: n.name, particles: n.particles })),
                  null,
                  2
                )
              ),
          },
          {
            label: 'Réinitialiser (preset courant)',
            onClick: () => {
              const defaults = PRESET_DEFAULTS[particles.preset as string];
              if (defaults) updateAll(defaults);
            },
          },
          ...(onRemoveComponent
            ? [
                {
                  label: 'Retirer les particules',
                  danger: true,
                  onClick: () =>
                    targets.forEach((n) => onRemoveComponent(n.id, 'particles' as const)),
                },
              ]
            : []),
        ]);
      }}
    >
      <ComponentHeader
        icon={<Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />}
        title="VFX Graph & Particules"
        badge="Interactif"
        mixed={lifetime.mixed || gravity.mixed || speed.mixed}
        collapsed={collapsed ?? false}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
        onRemove={onRemoveComponent ? () => targets.forEach((n) => onRemoveComponent(n.id, 'particles')) : undefined}
        removeTitle="Retirer les particules (devient un groupe vide)"
        removeConfirm="Convertir en groupe vide (émetteurs supprimés) ?"
      />

      {!collapsed && (
        <>
          {/* Subtitle / Preset selector title */}
          <div className="space-y-2">
            <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Sélecteur de Preset VFX
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESET_CARDS.map((presetItem) => (
                <button
                  key={presetItem.key}
                  type="button"
                  onClick={() => {
                    if (onUpdateParticles) {
                      updateAll(PRESET_DEFAULTS[presetItem.key]);
                    }
                  }}
                  className={`flex flex-col items-start p-2 rounded-xl border text-left transition-all ${
                    particles?.preset === presetItem.key
                      ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                      : 'border-zinc-800/80 bg-zinc-950/40 hover:bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${presetItem.color}`} />
                    <span className="text-[11px] font-bold text-zinc-100 truncate">{presetItem.label}</span>
                  </div>
                  <span className="text-[9px] text-zinc-500 truncate mt-0.5">{presetItem.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Customizer Parameters */}
          <div className="space-y-3.5 border-t border-purple-900/20 pt-3">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
              Contrôles Physiques & Cycle de Vie
            </span>

            {/* 1. Durée de vie (Lifetime) */}
            <StyledSlider
              label="Durée de vie (Lifetime)"
              display={`${(lifetime.value as number).toFixed(1)}s`}
              value={lifetime.value as number}
              mixed={lifetime.mixed}
              min={0.1}
              max={10.0}
              step={0.1}
              onChange={(v) => updateAll({ lifetime: v })}
            />

            {/* 2. Gravité (Gravity) */}
            <div className="space-y-1">
              <StyledSlider
                label="Gravité / Poussée"
                display={
                  <>
                    {(gravity.value as number) > 0 ? '+' : ''}
                    {(gravity.value as number).toFixed(1)}
                  </>
                }
                value={gravity.value as number}
                mixed={gravity.mixed}
                min={-15.0}
                max={20.0}
                step={0.5}
                onChange={(v) => updateAll({ gravity: v })}
              />
              <span className="text-[9px] text-zinc-500 block">
                Une gravité négative fait monter les particules (fumée/sorts), positive les fait tomber (pluie/étincelles).
              </span>
            </div>

            {/* 3. Dégradé de Couleur */}
            <div className="space-y-2 border-t border-purple-900/10 pt-2.5">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Dégradé Chromatique
              </span>
              <div className="grid grid-cols-2 gap-3.5">
                <ColorSwatch
                  label="Couleur Initiale"
                  value={color.value as string}
                  fallback="#ff6a00"
                  onChange={(hex) => updateAll({ color: hex })}
                />
                <ColorSwatch
                  label="Couleur Finale"
                  value={colorEnd.value}
                  fallback="#ff0000"
                  onChange={(hex) => updateAll({ colorEnd: hex })}
                />
              </div>

              {/* Gradient Preview Bar */}
              <div className="h-2 rounded-full w-full" style={{
                background: `linear-gradient(to right, ${color.value}, ${colorEnd.value})`
              }} />
            </div>

            {/* 4. Advanced Dynamics */}
            <div className="space-y-3.5 border-t border-purple-900/15 pt-3.5">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Dynamique Avancée
              </span>

              {/* Vitesse */}
              <StyledSlider
                label="Vitesse Initiale"
                display={`${(speed.value as number).toFixed(1)} m/s`}
                value={speed.value as number}
                mixed={speed.mixed}
                min={0.0}
                max={15.0}
                step={0.2}
                onChange={(v) => updateAll({ speed: v })}
              />

              {/* Taille */}
              <StyledSlider
                label="Taille des Particules"
                display={`${(size.value as number).toFixed(2)}m`}
                value={size.value as number}
                mixed={size.mixed}
                min={0.05}
                max={5.0}
                step={0.05}
                onChange={(v) => updateAll({ size: v })}
              />

              {/* Dispersion (Spread) */}
              <StyledSlider
                label="Dispersion (Spread)"
                display={`${(spread.value as number).toFixed(1)}m`}
                value={spread.value as number}
                mixed={spread.mixed}
                min={0.0}
                max={15.0}
                step={0.2}
                onChange={(v) => updateAll({ spread: v })}
              />

              {/* Taux d'émission (Emission Rate) */}
              {particles.loop && (
                <StyledSlider
                  label="Taux d'Émission (Rate)"
                  display={`${rate.value} part/s`}
                  value={rate.value as number}
                  mixed={rate.mixed}
                  min={5}
                  max={300}
                  step={5}
                  onChange={(v) => updateAll({ rate: parseInt(String(v)) })}
                />
              )}

              {/* Max Particles */}
              <StyledSlider
                label="Pool de Particules Max"
                display={`${maxParticles.value}`}
                value={maxParticles.value as number}
                mixed={maxParticles.mixed}
                min={10}
                max={2000}
                step={10}
                onChange={(v) => updateAll({ maxParticles: parseInt(String(v)) })}
              />

              {/* Loop / One Shot */}
              <PillToggle
                label="Boucle d'Émission"
                active={Boolean(loop.value)}
                activeLabel="Boucle Active"
                inactiveLabel="One Shot (Burst)"
                onToggle={() => updateAll({ loop: !particles?.loop })}
              />

              {/* Manual Burst Button if not looping */}
              {!particles.loop && (
                <button
                  type="button"
                  onClick={() => {
                    // Trigger manual burst
                    const currentBurst = particles?.burstCount || 100;
                    updateAll({
                      burstCount: currentBurst + (Math.random() > 0.5 ? 1 : -1)
                    });
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-1.5 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 shadow-md shadow-purple-950/40"
                >
                  <Zap className="w-3 h-3 text-yellow-300" />
                  <span>Déclencher le Burst</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
