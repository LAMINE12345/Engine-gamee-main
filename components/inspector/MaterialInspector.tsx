'use client';

import React from 'react';
import { Palette, Sparkles, Compass } from 'lucide-react';
import type { MaterialData, TexturePreset } from '../../types/engine';
import { SectionProps, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { StyledSlider, MiniSwitch } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';

/**
 * MaterialInspector — PBR complet (albedo, roughness, metalness, émission,
 * normal maps, opacité, wireframe, toon & outline). Multi-edit ventilé.
 */
export function MaterialInspector({
  nodes,
  onUpdateMaterial,
  onToggleSmoothShading,
  collapsed,
  onToggleCollapse,
}: SectionProps) {
  const targets = nodes.filter((n) => n.material);
  if (targets.length === 0 || !onUpdateMaterial) return null;

  // Modèle low-poly avec palette : les couleurs viennent uniquement de la
  // section « Couleurs du modèle » (vertex colors), l'albedo est masqué.
  const paletteOnly = targets.every(
    (n) => n.subType === 'lowPoly' && Array.isArray(n.palette) && n.palette.length > 0
  );

  const updateAll = (patch: Partial<MaterialData>) => {
    targets.forEach((n) => onUpdateMaterial(n.id, patch));
  };
  const mv = <K extends keyof MaterialData>(key: K) =>
    mixedValue(targets, (n) => n.material?.[key] as MaterialData[K]);

  const color = mv('color');
  const roughness = mv('roughness');
  const metalness = mv('metalness');
  const emissive = mv('emissive');
  const emissiveIntensity = mv('emissiveIntensity');
  const hasNormalMap = mv('hasNormalMap');
  const texturePreset = mv('texturePreset');
  const normalScale = mv('normalScale');
  const hasRoughnessMap = mv('hasRoughnessMap');
  const opacity = mv('opacity');
  const wireframe = mv('wireframe');
  const toonIntensity = mv('toonIntensity');
  const outlineColor = mv('outlineColor');
  const outlineThickness = mv('outlineThickness');
  const smoothShading = mv('smoothShading');

  return (
    <div
      className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3.5"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'Matériau PBR', [
          {
            label: 'Copier les valeurs',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  targets.map((n) => ({ name: n.name, material: n.material })),
                  null,
                  2
                )
              ),
          },
          {
            label: 'Réinitialiser',
            onClick: () =>
              updateAll({
                ...(paletteOnly ? {} : { color: '#60a5fa' }),
                roughness: 0.35,
                metalness: 0.15,
                emissive: '#000000',
                emissiveIntensity: 0,
                wireframe: false,
                opacity: 1,
                transparent: false,
                normalScale: 1,
                texturePreset: 'none',
                hasNormalMap: false,
                hasRoughnessMap: false,
                toonIntensity: 0,
                outlineColor: '#000000',
                outlineThickness: 0,
              }),
          },
        ]);
      }}
    >
      <ComponentHeader
        icon={<Palette className="w-3.5 h-3.5 text-rose-400" />}
        title="Matériau PBR (Physique)"
        badge="MeshStandard"
        mixed={
          color.mixed || roughness.mixed || metalness.mixed || opacity.mixed
        }
        collapsed={collapsed ?? false}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
      />

      {!collapsed && (
        <>
          {/* 1. Albedo Color — masqué pour les modèles low-poly à palette */}
          {paletteOnly ? (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 font-medium">
                Couleur gérée par « Couleurs du modèle »
              </span>
              <span className="font-mono text-[10px] text-zinc-500">vertex colors</span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 font-medium">
                Couleur Albedo{color.mixed && <span className="ml-1 text-amber-400 font-bold">≠</span>}
              </span>
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-lg border border-zinc-700 shadow-inner relative overflow-hidden"
                  style={{ backgroundColor: color.value as string }}
                >
                  <input
                    type="color"
                    value={color.value as string}
                    onChange={(e) => updateAll({ color: e.target.value })}
                    className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                  />
                </div>
                <span className="font-mono text-[11px] text-zinc-300 uppercase">
                  {color.value as string}
                </span>
              </div>
            </div>
          )}

          {/* 2. Roughness Slider */}
          <div className="space-y-1">
            <StyledSlider
              label="Rugosité (Roughness)"
              display={(roughness.value as number).toFixed(2)}
              value={roughness.value as number}
              mixed={roughness.mixed}
              min={0}
              max={1}
              step={0.02}
              accent="accent-sky-500"
              labelClassName="text-zinc-400"
              displayClassName="font-mono text-zinc-300"
              onChange={(v) => updateAll({ roughness: v })}
            />
            <div className="flex justify-between text-[9px] text-zinc-500">
              <span>Poli / Brillant</span>
              <span>Mat / Diffus</span>
            </div>
          </div>

          {/* 3. Metalness Slider */}
          <div className="space-y-1">
            <StyledSlider
              label="Métal (Metalness)"
              display={(metalness.value as number).toFixed(2)}
              value={metalness.value as number}
              mixed={metalness.mixed}
              min={0}
              max={1}
              step={0.02}
              accent="accent-sky-500"
              labelClassName="text-zinc-400"
              displayClassName="font-mono text-zinc-300"
              onChange={(v) => updateAll({ metalness: v })}
            />
            <div className="flex justify-between text-[9px] text-zinc-500">
              <span>Diélectrique (Plastique/Bois)</span>
              <span>Conducteur (Chrome/Or)</span>
            </div>
          </div>

          {/* 4. Emission (Emissive Color & Intensity) */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Émission (Glow)</span>
              </span>
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded-md border border-zinc-700 relative overflow-hidden"
                  style={{ backgroundColor: (emissive.value as string) || '#000000' }}
                >
                  <input
                    type="color"
                    value={(emissive.value as string) || '#000000'}
                    onChange={(e) => updateAll({ emissive: e.target.value })}
                    className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                  />
                </div>
                <span className="font-mono text-[10px] text-zinc-400 uppercase">
                  {(emissive.value as string) || '#000000'}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <StyledSlider
                label="Intensité d'émission"
                display={`${((emissiveIntensity.value as number) || 0).toFixed(1)}x`}
                value={(emissiveIntensity.value as number) || 0}
                mixed={emissiveIntensity.mixed}
              min={0}
              max={5}
              step={0.1}
              accent="accent-amber-400"
              labelClassName="text-[10px] text-zinc-500"
              displayClassName="font-mono text-zinc-300"
                onChange={(v) => updateAll({ emissiveIntensity: v })}
              />
            </div>
          </div>

          {/* 5. Normal Map & Texture Patterns */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                <Compass className="w-3 h-3 text-sky-400" />
                <span>Texture Normal Map (Micro-reliefs)</span>
              </span>
              <MiniSwitch
                active={Boolean(hasNormalMap.value)}
                onToggle={() => updateAll({ hasNormalMap: !hasNormalMap.value })}
              />
            </div>

            {/* Texture Pattern Selector */}
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500">Motif de surface</span>
              <select
                value={(texturePreset.value as string) || 'none'}
                onChange={(e) =>
                  updateAll({
                    texturePreset: e.target.value as TexturePreset,
                    hasNormalMap: e.target.value !== 'none',
                  })
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
              >
                <option value="none">Aucun (Lisse pur)</option>
                <option value="carbon">Fibre de Carbone (Carbon Weave)</option>
                <option value="brushed">Métal Brossé (Brushed Streaks)</option>
                <option value="grid">Grille / Carrelage Céramique</option>
                <option value="pebbles">Galets & Reliefs Organiques</option>
                <option value="diamond">Tôle Striée Industrielle (Diamond)</option>
              </select>
            </div>

            {/* Normal Scale slider */}
            {Boolean(hasNormalMap.value) && (
              <div className="space-y-1 pt-1">
                <StyledSlider
                  label="Intensité du Relief (Normal Scale)"
                  display={((normalScale.value as number) ?? 1).toFixed(2)}
                  value={(normalScale.value as number) ?? 1}
                  mixed={normalScale.mixed}
              min={0.1}
              max={3}
              step={0.1}
              accent="accent-sky-400"
              labelClassName="text-[10px] text-zinc-500"
              displayClassName="font-mono text-zinc-300"
                  onChange={(v) => updateAll({ normalScale: v })}
                />
              </div>
            )}

            {/* 6. Material Finish Controls */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/60">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-200 uppercase tracking-wider text-[11px] mb-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Finitions Matériau</span>
              </div>

            </div>
          </div>

          {/* 6. Roughness Map Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
            <span className="text-[11px] text-zinc-400">Roughness Map (Variations)</span>
            <MiniSwitch
              active={Boolean(hasRoughnessMap.value)}
              onToggle={() => updateAll({ hasRoughnessMap: !hasRoughnessMap.value })}
            />
          </div>

          {/* 7. Opacity & Wireframe */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/60">
            <div className="space-y-1">
              <StyledSlider
                label="Opacité"
                display={(opacity.value as number).toFixed(2)}
                value={opacity.value as number}
                mixed={opacity.mixed}
              min={0.05}
              max={1}
              step={0.05}
              accent="accent-sky-500"
              labelClassName="text-zinc-400"
              displayClassName="font-mono text-zinc-300"
                onChange={(op) => updateAll({ opacity: op, transparent: op < 1 })}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-400">Mode Filaire (Wireframe)</span>
              <MiniSwitch
                active={Boolean(wireframe.value)}
                onToggle={() => updateAll({ wireframe: !wireframe.value })}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-400" title="Soude les sommets et moyenne les normales : surfaces douces au lieu de facettes">
                Lissage (Smooth Shading)
              </span>
              <MiniSwitch
                active={Boolean(smoothShading.value)}
                onToggle={() => {
                  const next = !smoothShading.value;
                  targets.forEach((n) => onToggleSmoothShading?.(n.id, next));
                }}
              />
            </div>
          </div>

          {/* 8. Toon Shader & Outline Controls */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/60">
            <span className="text-[11px] text-zinc-400 font-bold uppercase">Rendu Toon & Contours</span>

            <div className="space-y-1">
              <StyledSlider
                label="Intensité Toon"
                display={
                  ((toonIntensity.value as number) ?? 0) > 0
                    ? `${((toonIntensity.value as number) ?? 0).toFixed(1)} bandes`
                    : 'désactivé'
                }
                value={(toonIntensity.value as number) ?? 0}
                mixed={toonIntensity.mixed}
              min={0}
              max={5}
              step={1}
              accent="accent-indigo-500"
              labelClassName="text-zinc-400"
              displayClassName="font-mono text-zinc-300"
                onChange={(v) => updateAll({ toonIntensity: v })}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-400">Contour (Outline)</span>
              <input
                type="color"
                value={(outlineColor.value as string) ?? '#000000'}
                onChange={(e) => updateAll({ outlineColor: e.target.value })}
                className="w-8 h-6 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <StyledSlider
                label="Épaisseur Contour"
                display={
                  ((outlineThickness.value as number) ?? 0) > 0
                    ? ((outlineThickness.value as number) ?? 0).toFixed(2)
                    : 'désactivé'
                }
                value={(outlineThickness.value as number) ?? 0}
                mixed={outlineThickness.mixed}
              min={0}
              max={2}
              step={0.05}
              accent="accent-indigo-500"
              labelClassName="text-zinc-400"
              displayClassName="font-mono text-zinc-300"
                onChange={(v) => updateAll({ outlineThickness: v })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
