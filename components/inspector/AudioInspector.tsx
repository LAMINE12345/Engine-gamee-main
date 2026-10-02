'use client';

import React, { useEffect, useState } from 'react';
import { Music, Volume2, Headphones, Waves } from 'lucide-react';
import type { SectionProps } from './types';
import { ComponentHeader } from './ComponentHeader';
import { StyledSlider, MiniSwitch } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';
import { soundManager, MixerBusName, BGMMode } from '../../lib/SoundManager';
import { copyText } from './types';

const BUS_LABELS: { bus: MixerBusName; label: string; color: string }[] = [
  { bus: 'master', label: 'Master', color: 'text-zinc-200' },
  { bus: 'music', label: 'Musique', color: 'text-purple-300' },
  { bus: 'sfx', label: 'SFX', color: 'text-sky-300' },
  { bus: 'ambient', label: 'Ambiance', color: 'text-emerald-300' },
  { bus: 'ui', label: 'Interface', color: 'text-amber-300' },
];

/**
 * AudioInspector — Mixer bus (Master→Music/SFX/Ambient/UI), spatial params,
 * audio zone toggles, music mode (exploration/combat/off).
 */
export function AudioInspector({
  nodes,
  collapsed,
  onToggleCollapse,
  isPlaying,
}: SectionProps) {
  const [busGains, setBusGains] = useState(() => soundManager.getBusGains());
  const [bgmMode, setBgmMode] = useState<BGMMode>(() => soundManager.getBGMMode());
  const [spatialOn, setSpatialOn] = useState(true);
  const [dopplerOn, setDopplerOn] = useState(true);
  const [occlusionOn, setOcclusionOn] = useState(true);

  useEffect(() => {
    // Sync from live manager
    setBusGains(soundManager.getBusGains());
    setBgmMode(soundManager.getBGMMode());
  }, []);

  const setBus = (bus: MixerBusName, v: number) => {
    soundManager.setBusGain(bus, v);
    setBusGains(soundManager.getBusGains());
  };

  const applyBgm = (mode: BGMMode) => {
    soundManager.setBGMMode(mode);
    setBgmMode(soundManager.getBGMMode());
  };

  const spatialEnabled = nodes.some((n) => n.physics?.rigidbody || n.type === 'mesh' || n.type === 'group');

  return (
    <div
      className="space-y-4"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'Audio', [
          {
            label: 'Copier le mixer',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify({ buses: busGains, bgm: bgmMode, spatial: { spatialOn, dopplerOn, occlusionOn } }, null, 2)
              ),
          },
          {
            label: 'Réinitialiser le mixer',
            onClick: () => {
              BUS_LABELS.forEach(({ bus }) => soundManager.setBusGain(bus, bus === 'master' ? 0.7 : bus === 'music' ? 0.4 : 0.8));
              setBusGains(soundManager.getBusGains());
            },
          },
        ]);
      }}
    >
      {/* Mixer Bus */}
      <div className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-3">
        <ComponentHeader
          icon={<Volume2 className="w-3.5 h-3.5 text-sky-400" />}
          title="Mixer Audio"
          badge="Bus"
          collapsed={collapsed ?? false}
          onToggleCollapse={onToggleCollapse ?? (() => {})}
        />

        {!collapsed && (
          <>
            {BUS_LABELS.map(({ bus, label, color }) => (
              <StyledSlider
                key={bus}
                label={<span className={color}>{label}</span>}
                display={`${Math.round(busGains[bus] * 100)}%`}
                value={busGains[bus]}
                min={0}
                max={1}
                step={0.01}
                accent="accent-sky-400"
                labelClassName="text-zinc-400"
                displayClassName="font-mono text-zinc-300"
                onChange={(v) => setBus(bus, v)}
              />
            ))}
          </>
        )}
      </div>

      {/* Spatial Audio */}
      <div className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-3">
        <ComponentHeader
          icon={<Headphones className="w-3.5 h-3.5 text-emerald-400" />}
          title="Audio Spatial 3D"
          badge="3D"
          collapsed={collapsed ?? false}
          onToggleCollapse={onToggleCollapse ?? (() => {})}
        />

        {!collapsed && (
          <>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-300">Atténuation distance + stéréo</span>
              <MiniSwitch active={spatialOn} onToggle={() => setSpatialOn((s) => !s)} activeColor="bg-emerald-500" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-300">Doppler (vitesse source)</span>
              <MiniSwitch active={dopplerOn} onToggle={() => setDopplerOn((s) => !s)} activeColor="bg-emerald-500" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-300">Occlusion (raycast mur)</span>
              <MiniSwitch active={occlusionOn} onToggle={() => setOcclusionOn((s) => !s)} activeColor="bg-emerald-500" />
            </div>
            {!spatialEnabled && (
              <p className="text-[10px] text-zinc-500">
                Sélectionnez un objet 3D pour activer la spatialisation de ses sources.
              </p>
            )}
          </>
        )}
      </div>

      {/* Music System */}
      <div className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-3">
        <ComponentHeader
          icon={<Music className="w-3.5 h-3.5 text-purple-400" />}
          title="Système Musical"
          badge="Crossfade"
          collapsed={collapsed ?? false}
          onToggleCollapse={onToggleCollapse ?? (() => {})}
        />

        {!collapsed && (
          <>
            <div className="grid grid-cols-3 gap-1 p-0.5 bg-zinc-950 rounded-xl border border-zinc-800">
              {(
                [
                  ['exploration', 'Exploration'],
                  ['combat', 'Combat'],
                  ['off', 'Off'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => applyBgm(mode)}
                  className={`py-1.5 text-[10px] font-medium rounded-lg transition-all ${
                    bgmMode === mode
                      ? 'bg-purple-500 text-white shadow'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Crossfade procedural entre couches Exploration (doux) et Combat (agressif).
              {isPlaying && <span className="text-emerald-400 ml-1">● Play actif</span>}
            </p>
          </>
        )}
      </div>

      {/* Audio Zones Info */}
      <div className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 space-y-2">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
          <Waves className="w-3.5 h-3.5 text-amber-400" />
          <span>Zones Audio</span>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Les zones (TriggerVolume) appliquent reverb, lowpass d&apos;occlusion et atténuation
          à l&apos;entrée/sortie du joueur. Raycast mur → volume + filtre lowpass sur le bus SFX.
        </p>
      </div>
    </div>
  );
}
