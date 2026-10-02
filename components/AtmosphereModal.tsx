'use client';

import React, { useState } from 'react';
import {
  AtmosphereData,
  PostProcessingData,
  SkyPreset,
  WaterPreset,
  DEFAULT_ATMOSPHERE,
  DEFAULT_POST_PROCESSING,
} from '../types/atmosphere';
import {
  X,
  Sun,
  CloudSun,
  Sunset,
  Moon,
  Sparkles,
  
  
  SlidersHorizontal,
  
  CloudFog,
  Wind,
  CloudRain,
  
  
  Waves,
  Clock,
  Play,
  Pause,
  
  Anchor,
  Layers,
  Move,
} from 'lucide-react';

interface AtmosphereModalProps {
  isOpen: boolean;
  onClose: () => void;
  atmosphere: AtmosphereData;
  postProcessing: PostProcessingData;
  onUpdateAtmosphere: (data: Partial<AtmosphereData>) => void;
  onApplySkyPreset: (preset: SkyPreset) => void;
  onUpdatePostProcessing: (data: Partial<PostProcessingData>) => void;
  onSelectWaterNode?: () => void;
  onAddRiver?: () => void;
  nodes?: any[];
  onUpdateRiverConfig?: (id: string, config: any) => void;
}

export const AtmosphereModal: React.FC<AtmosphereModalProps> = ({
  isOpen,
  onClose,
  atmosphere,
  postProcessing,
  onUpdateAtmosphere,
  onApplySkyPreset,
  onUpdatePostProcessing,
  onSelectWaterNode,
  onAddRiver,
  nodes = [],
  onUpdateRiverConfig,
}) => {
  const [activeTab, setActiveTab] = useState<
    'weather' | 'water' | 'sky' | 'fog' | 'postprocess'
  >('water');

  if (!isOpen) return null;

  const windConfig = atmosphere.wind || DEFAULT_ATMOSPHERE.wind!;
  const rainConfig = atmosphere.rain || DEFAULT_ATMOSPHERE.rain!;
  const waterConfig = atmosphere.water || DEFAULT_ATMOSPHERE.water!;
  const dayNightCycle = atmosphere.dayNightCycle || DEFAULT_ATMOSPHERE.dayNightCycle!;
  const ssaoConfig = postProcessing.ssao || DEFAULT_POST_PROCESSING.ssao!;
  const aaMode = postProcessing.antiAliasing?.mode
    ?? (postProcessing.fxaa?.enabled === false ? 'none' : 'fxaa');
  const mbConfig = postProcessing.motionBlur || DEFAULT_POST_PROCESSING.motionBlur!;
  const dofConfig = postProcessing.depthOfField || DEFAULT_POST_PROCESSING.depthOfField!;
  const ssrConfig = postProcessing.ssr || DEFAULT_POST_PROCESSING.ssr!;
  const gradeConfig = postProcessing.colorGrading;
  const vigConfig = postProcessing.vignette;
  const caConfig = postProcessing.chromaticAberration;

  const formatHour = (h: number) => {
    const hours = Math.floor(h) % 24;
    const minutes = Math.floor((h % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  return (
    // Docké à droite, SANS voile ni flou : le viewport reste visible et
    // cliquable pendant qu'on règle (pointer-events passe à travers le vide).
    // top-14 : sous la barre d'outils (z-index 9999) pour garder le X cliquable.
    <div className="fixed top-14 bottom-0 right-0 z-50 flex p-3 pointer-events-none select-none">
      <div className="pointer-events-auto w-[min(620px,94vw)] h-full bg-zinc-950/95 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-16 px-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-md">
              <Waves className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Environnement Aquatique, Cycle Céleste & Rendu Post-Processing
              </h2>
              <p className="text-[11px] text-zinc-400">
                Océan Gerstner & Flottaison, Cycle 24h Jour/Nuit, Ombres de Contact SSAO, Météo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-2.5 border-b border-zinc-800/80 bg-zinc-900/40">
          <button
            type="button"
            onClick={() => setActiveTab('water')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'water'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            <span>Eau & Océan Dynamique</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sky')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'sky'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Cycle Jour / Nuit & Ciel</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('weather')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'weather'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5" />
            <span>Vent & Pluie Liquide</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fog')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'fog'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <CloudFog className="w-3.5 h-3.5" />
            <span>Brouillard</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('postprocess')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'postprocess'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>SSAO & Post-Processing</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* TAB 1: EAU & OCÉAN DYNAMIQUE (WATER & BUOYANCY) */}
          {activeTab === 'water' && (
            <div className="space-y-6">
              {/* Master Water Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    <Waves className="w-4 h-4 text-cyan-400" />
                    Activer le Plan d&apos;Eau & Océan Dynamique
                  </div>
                  <div className="text-xs text-zinc-400">
                    Génère une surface liquide avec ondes de Gerstner, réfraction, écume et flottaison physique.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={waterConfig.enabled}
                  onChange={(e) =>
                    onUpdateAtmosphere({
                      water: { ...waterConfig, enabled: e.target.checked },
                    })
                  }
                  className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
                />
              </div>

              {waterConfig.enabled && (
                <>
                  {/* Option manipulation direct dans la scene */}
                  <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-800/50 flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-cyan-200 flex items-center gap-2">
                        <Move className="w-4 h-4 text-cyan-400" />
                        <span>Sélection & Gizmo 3D (Déplacer, Pivoter, Redimensionner)</span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Activez le gizmo 3D pour positionner, orienter et redimensionner le système d&apos;eau directement dans le viewport.
                      </div>
                    </div>
                    {onSelectWaterNode && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectWaterNode();
                          onClose();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs shadow-lg shadow-cyan-950/50 transition-all flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Move className="w-3.5 h-3.5" />
                        <span>Sélectionner dans la Scène</span>
                      </button>
                    )}
                  </div>

                  {/* Section Rivière Procédurale 3D & Sculpt de Lit */}
                  <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                          <Waves className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            Rivière Procédurale 3D & Creusement de Lit
                          </div>
                          <div className="text-[10px] text-cyan-300/80">
                            Générez un cours d&apos;eau dynamique qui sculpte automatiquement le terrain et s&apos;écoule en temps réel.
                          </div>
                        </div>
                      </div>

                      {onAddRiver && (
                        <button
                          type="button"
                          onClick={() => {
                            onAddRiver();
                            onClose();
                          }}
                          className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-cyan-500/20 transition-all cursor-pointer"
                        >
                          <Waves className="w-3.5 h-3.5" />
                          <span>+ Créer Rivière 3D</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] text-zinc-300 bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800/80">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                        <span>Auto-Carving du Lit</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        <span>Écume & Courant Animé</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                        <span>Poignées Gizmo Spline</span>
                      </div>
                    </div>

                    {(() => {
                      const riverNode = nodes.find(n => n.subType === 'river');
                      if (!riverNode || !riverNode.riverConfig) return null;
                      const rConfig = riverNode.riverConfig;
                      return (
                        <div className="pt-3 border-t border-cyan-500/20 space-y-4">
                          <div className="text-xs font-bold text-cyan-300 flex items-center justify-between">
                            <span>⚙️ Réglages : {riverNode.name}</span>
                            <span className="text-[10px] text-zinc-500 font-mono">ID: {riverNode.id.substring(0, 6)}</span>
                          </div>
                          
                          {/* Speed & Flow Function */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-zinc-300">Vitesse du Courant (Écoulement)</span>
                                <span className="font-mono text-cyan-400">{rConfig.flowSpeed.toFixed(1)}x</span>
                              </div>
                              <input
                                type="range"
                                min="0.1"
                                max="3.5"
                                step="0.1"
                                value={rConfig.flowSpeed}
                                onChange={(e) =>
                                  onUpdateRiverConfig?.(riverNode.id, { flowSpeed: parseFloat(e.target.value) })
                                }
                                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-zinc-300">Largeur de Rivière</span>
                                <span className="font-mono text-cyan-400">{rConfig.width.toFixed(1)}m</span>
                              </div>
                              <input
                                type="range"
                                min="2"
                                max="15"
                                step="0.5"
                                value={rConfig.width}
                                onChange={(e) =>
                                  onUpdateRiverConfig?.(riverNode.id, { width: parseFloat(e.target.value) })
                                }
                                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                              />
                            </div>
                          </div>

                          {/* Curves & Turns */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-900/60">
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-zinc-300">Fréquence des Virages</span>
                                <span className="font-mono text-cyan-400">{rConfig.meanderFactor.toFixed(1)}x</span>
                              </div>
                              <input
                                type="range"
                                min="0.5"
                                max="3.0"
                                step="0.1"
                                value={rConfig.meanderFactor}
                                onChange={(e) =>
                                  onUpdateRiverConfig?.(riverNode.id, { meanderFactor: parseFloat(e.target.value) })
                                }
                                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-zinc-300">Amplitude (Profondeur des Virages)</span>
                                <span className="font-mono text-cyan-400">{rConfig.meanderAmplitude.toFixed(1)}m</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="20"
                                step="0.5"
                                value={rConfig.meanderAmplitude}
                                onChange={(e) =>
                                  onUpdateRiverConfig?.(riverNode.id, { meanderAmplitude: parseFloat(e.target.value) })
                                }
                                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                              />
                            </div>
                          </div>

                          {/* Color Customizer */}
                          <div className="pt-2 border-t border-zinc-900/60 flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-zinc-300">Couleur de l&apos;Eau</span>
                                <div className="relative overflow-hidden w-6 h-6 rounded-lg border border-zinc-700">
                                  <input
                                    type="color"
                                    value={rConfig.waterColor || '#0055ff'}
                                    onChange={(e) =>
                                      onUpdateRiverConfig?.(riverNode.id, { waterColor: e.target.value })
                                    }
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                  />
                                  <div className="w-full h-full" style={{ backgroundColor: rConfig.waterColor || '#0055ff' }} />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-zinc-300">Couleur de l&apos;Écume</span>
                                <div className="relative overflow-hidden w-6 h-6 rounded-lg border border-zinc-700">
                                  <input
                                    type="color"
                                    value={rConfig.foamColor || '#ffffff'}
                                    onChange={(e) =>
                                      onUpdateRiverConfig?.(riverNode.id, { foamColor: e.target.value })
                                    }
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                  />
                                  <div className="w-full h-full" style={{ backgroundColor: rConfig.foamColor || '#ffffff' }} />
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                              }}
                              className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold underline"
                            >
                              Fermer pour l&apos;éditer en 3D
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Option Suivre la Caméra vs Position Fixe */}
                  <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-zinc-200">Suivre la Caméra (Océan Infini)</div>
                      <div className="text-[10px] text-zinc-400">Si activé, l&apos;eau se déplace horizontalement avec la caméra. Décocher pour fixer le plan d&apos;eau dans la scène.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(waterConfig.followCamera)}
                      onChange={(e) =>
                        onUpdateAtmosphere({
                          water: { ...waterConfig, followCamera: e.target.checked },
                        })
                      }
                      className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                    />
                  </div>

                  {/* Presets rapides */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                      Préréglages Aquatiques
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        {
                          id: 'ocean',
                          name: 'Océan Pacifique',
                          desc: 'Vagues amples & reflets',
                          color: 'text-blue-400',
                        },
                        {
                          id: 'lake',
                          name: 'Lac Paisible',
                          desc: 'Ondulations douces & clarté',
                          color: 'text-sky-300',
                        },
                        {
                          id: 'tropical',
                          name: 'Mer Tropicale',
                          desc: 'Turquoise transparent',
                          color: 'text-cyan-400',
                        },
                        {
                          id: 'storm',
                          name: 'Tempête Océanique',
                          desc: 'Fortes houles & écume vive',
                          color: 'text-slate-400',
                        },
                        {
                          id: 'swamp',
                          name: 'Marais & Lagune',
                          desc: 'Teinte émeraude sombre',
                          color: 'text-lime-400',
                        },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                preset: p.id as WaterPreset,
                              },
                            });
                          }}
                          className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                            waterConfig.preset === p.id
                              ? 'bg-cyan-950/40 border-cyan-500/60 shadow-lg shadow-cyan-950/50'
                              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <span className={`text-xs font-bold ${p.color}`}>{p.name}</span>
                          <span className="text-[10px] text-zinc-400 line-clamp-1">{p.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Paramètres d'ondes de Gerstner */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                      <Waves className="w-4 h-4 text-cyan-400" />
                      Dynamique des Vagues (Ondes de Gerstner)
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Hauteur de l'eau (Niveau Y) */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Niveau de l&apos;eau (Hauteur Y)</span>
                          <span className="font-mono text-cyan-400">{waterConfig.waterLevel.toFixed(2)}m</span>
                        </div>
                        <input
                          type="range"
                          min={-5.0}
                          max={5.0}
                          step={0.1}
                          value={waterConfig.waterLevel}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                waterLevel: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      {/* Hauteur des vagues */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Amplitude des Vagues</span>
                          <span className="font-mono text-cyan-400">{waterConfig.waveHeight.toFixed(2)}m</span>
                        </div>
                        <input
                          type="range"
                          min={0.0}
                          max={2.5}
                          step={0.05}
                          value={waterConfig.waveHeight}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                waveHeight: Number(e.target.value),
                                preset: 'custom',
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      {/* Vitesse de propagation */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Vitesse de Propagation</span>
                          <span className="font-mono text-cyan-400">{waterConfig.waveSpeed.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={3.5}
                          step={0.1}
                          value={waterConfig.waveSpeed}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                waveSpeed: Number(e.target.value),
                                preset: 'custom',
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      {/* Cambrure / Pente (Steepness Q) */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Cambrure & Crêtes (Steepness Q)</span>
                          <span className="font-mono text-cyan-400">{Math.round(waterConfig.waveSteepness * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.95}
                          step={0.05}
                          value={waterConfig.waveSteepness}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                waveSteepness: Number(e.target.value),
                                preset: 'custom',
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rendu & Optique de l'eau */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      Optique, Réfraction & Écume
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {/* Couleur peu profonde */}
                      <div className="space-y-1">
                        <span className="text-xs text-zinc-300">Teinte de Surface</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={waterConfig.waterColor}
                            onChange={(e) =>
                              onUpdateAtmosphere({
                                water: {
                                  ...waterConfig,
                                  waterColor: e.target.value,
                                  preset: 'custom',
                                },
                              })
                            }
                            className="w-8 h-8 rounded-lg border border-zinc-700 cursor-pointer bg-transparent"
                          />
                          <span className="font-mono text-xs text-zinc-400">{waterConfig.waterColor}</span>
                        </div>
                      </div>

                      {/* Couleur profonde */}
                      <div className="space-y-1">
                        <span className="text-xs text-zinc-300">Teinte Abyssale</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={waterConfig.deepWaterColor}
                            onChange={(e) =>
                              onUpdateAtmosphere({
                                water: {
                                  ...waterConfig,
                                  deepWaterColor: e.target.value,
                                  preset: 'custom',
                                },
                              })
                            }
                            className="w-8 h-8 rounded-lg border border-zinc-700 cursor-pointer bg-transparent"
                          />
                          <span className="font-mono text-xs text-zinc-400">{waterConfig.deepWaterColor}</span>
                        </div>
                      </div>

                      {/* Couleur écume */}
                      <div className="space-y-1">
                        <span className="text-xs text-zinc-300">Écume des Vagues</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={waterConfig.foamColor}
                            onChange={(e) =>
                              onUpdateAtmosphere({
                                water: {
                                  ...waterConfig,
                                  foamColor: e.target.value,
                                  preset: 'custom',
                                },
                              })
                            }
                            className="w-8 h-8 rounded-lg border border-zinc-700 cursor-pointer bg-transparent"
                          />
                          <span className="font-mono text-xs text-zinc-400">{waterConfig.foamColor}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 pt-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Clarté / Transparence</span>
                          <span className="font-mono text-cyan-400">{Math.round(waterConfig.clarity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={waterConfig.clarity}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                clarity: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Reflets Spéculaires Soleil</span>
                          <span className="font-mono text-cyan-400">{waterConfig.sunReflection.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          value={waterConfig.sunReflection}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                sunReflection: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Opacité Globale</span>
                          <span className="font-mono text-cyan-400">{Math.round(waterConfig.opacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.3}
                          max={1.0}
                          step={0.05}
                          value={waterConfig.opacity}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                opacity: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Flottaison Physique (Archimedes & Buoyancy) */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                      <Anchor className="w-4 h-4 text-cyan-400" />
                      Physique de Flottaison (Poussée d&apos;Archimède & Viscosité)
                    </div>
                    <div className="text-xs text-zinc-400">
                      Les caisses, véhicules et objets physiques flottent sur les crêtes de vagues réelles avec amortissement hydrodynamique et extinction des feux.
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Poussée d&apos;Archimède</span>
                          <span className="font-mono text-cyan-400">{waterConfig.buoyancyFactor.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min={0.4}
                          max={3.0}
                          step={0.1}
                          value={waterConfig.buoyancyFactor}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                buoyancyFactor: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Résistance Visqueuse (Drag)</span>
                          <span className="font-mono text-cyan-400">{waterConfig.waterDrag.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min={0.4}
                          max={4.0}
                          step={0.1}
                          value={waterConfig.waterDrag}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              water: {
                                ...waterConfig,
                                waterDrag: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-cyan-500"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: CYCLE JOUR / NUIT & CIEL */}
          {activeTab === 'sky' && (
            <div className="space-y-6">
              {/* Automated Day/Night Cycle Section */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Cycle Jour / Nuit Automatisé (Horloge 24h)
                    </div>
                    <div className="text-xs text-zinc-400">
                      Transition fluide en continu : aurore dorée, zénith radieux, crépuscule flamboyant et nuit étoilée avec lune.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={dayNightCycle.enabled}
                    onChange={(e) =>
                      onUpdateAtmosphere({
                        dayNightCycle: {
                          ...dayNightCycle,
                          enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                  />
                </div>

                {dayNightCycle.enabled && (
                  <div className="pt-2 space-y-4">
                    {/* Clock Scrubber & Play/Pause */}
                    <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateAtmosphere({
                            dayNightCycle: {
                              ...dayNightCycle,
                              isPaused: !dayNightCycle.isPaused,
                            },
                          })
                        }
                        className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                      >
                        {dayNightCycle.isPaused ? (
                          <Play className="w-4 h-4" />
                        ) : (
                          <Pause className="w-4 h-4" />
                        )}
                      </button>

                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span className="font-semibold flex items-center gap-1.5">
                            {dayNightCycle.timeOfDay >= 6 && dayNightCycle.timeOfDay < 18 ? (
                              <Sun className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                              <Moon className="w-3.5 h-3.5 text-indigo-400" />
                            )}
                            Heure Solaire :
                          </span>
                          <span className="font-mono text-sm font-bold text-amber-400">
                            {formatHour(dayNightCycle.timeOfDay)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.0}
                          max={23.99}
                          step={0.05}
                          value={dayNightCycle.timeOfDay}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              dayNightCycle: {
                                ...dayNightCycle,
                                timeOfDay: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>
                    </div>

                    {/* Duration & Intensity Settings */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Durée d&apos;un cycle 24h</span>
                          <span className="font-mono text-amber-400">{dayNightCycle.durationMinutes} min</span>
                        </div>
                        <select
                          value={dayNightCycle.durationMinutes}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              dayNightCycle: {
                                ...dayNightCycle,
                                durationMinutes: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-300"
                        >
                          <option value={1.0}>1 minute (Accéléré)</option>
                          <option value={3.0}>3 minutes (Rapide)</option>
                          <option value={5.0}>5 minutes (Standard)</option>
                          <option value={10.0}>10 minutes (Cinématique)</option>
                          <option value={24.0}>24 minutes (Réaliste)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Étoiles Nocturnes</span>
                          <span className="font-mono text-amber-400">{Math.round((dayNightCycle.starsIntensity ?? 1.0) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.0}
                          max={2.0}
                          step={0.1}
                          value={dayNightCycle.starsIntensity ?? 1.0}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              dayNightCycle: {
                                ...dayNightCycle,
                                starsIntensity: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Lumière Lunaire</span>
                          <span className="font-mono text-amber-400">{((dayNightCycle.moonIntensity ?? 1.2)).toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          value={dayNightCycle.moonIntensity ?? 1.2}
                          onChange={(e) =>
                            onUpdateAtmosphere({
                              dayNightCycle: {
                                ...dayNightCycle,
                                moonIntensity: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sky Presets */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                  Préréglages Statiques de Ciel
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'daylight', name: 'Plein Jour', icon: Sun, color: 'text-amber-400' },
                    { id: 'golden_hour', name: 'Heure Dorée', icon: CloudSun, color: 'text-yellow-400' },
                    { id: 'sunset', name: 'Coucher de Soleil', icon: Sunset, color: 'text-orange-400' },
                    { id: 'scifi_night', name: 'Nuit Stellaire', icon: Moon, color: 'text-indigo-400' },
                    { id: 'cyberpunk', name: 'Cyberpunk Neon', icon: Sparkles, color: 'text-pink-400' },
                    { id: 'overcast', name: 'Ciel Couvert', icon: CloudFog, color: 'text-zinc-400' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onApplySkyPreset(preset.id as SkyPreset)}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                        atmosphere.skyPreset === preset.id
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <preset.icon className={`w-4 h-4 ${preset.color}`} />
                      <span className="text-xs font-semibold text-zinc-200">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VENT & PLUIE (WEATHER) */}
          {activeTab === 'weather' && (
            <div className="space-y-6">
              {/* Vent */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <Wind className="w-4 h-4 text-teal-400" />
                      Système de Vent & Aérodynamique
                    </div>
                    <div className="text-xs text-zinc-400">
                      Force de traînée sur les corps rigides, rafales turbulentes et traînées visibles.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={windConfig.enabled}
                    onChange={(e) =>
                      onUpdateAtmosphere({
                        wind: { ...windConfig, enabled: e.target.checked },
                      })
                    }
                    className="w-5 h-5 accent-teal-500 rounded cursor-pointer"
                  />
                </div>

                {windConfig.enabled && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-zinc-300">
                        <span>Vitesse du vent</span>
                        <span className="font-mono text-teal-400">{windConfig.speed} km/h</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={120}
                        value={windConfig.speed}
                        onChange={(e) =>
                          onUpdateAtmosphere({
                            wind: { ...windConfig, speed: Number(e.target.value) },
                          })
                        }
                        className="w-full accent-teal-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-zinc-300">
                        <span>Turbulence des rafales</span>
                        <span className="font-mono text-teal-400">{Math.round(windConfig.gustiness * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={windConfig.gustiness}
                        onChange={(e) =>
                          onUpdateAtmosphere({
                            wind: {
                              ...windConfig,
                              gustiness: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-teal-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Pluie */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <CloudRain className="w-4 h-4 text-sky-400" />
                      Pluie Réelle Liquide & Sol Mouillé
                    </div>
                    <div className="text-xs text-zinc-400">
                      Gouttes étirées, réduction d&apos;adhérence au sol, éclairs et tonnerre.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={rainConfig.enabled}
                    onChange={(e) =>
                      onUpdateAtmosphere({
                        rain: { ...rainConfig, enabled: e.target.checked },
                      })
                    }
                    className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                  />
                </div>

                {rainConfig.enabled && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-zinc-300">
                        <span>Intensité de pluie</span>
                        <span className="font-mono text-sky-400">{Math.round(rainConfig.intensity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={rainConfig.intensity}
                        onChange={(e) =>
                          onUpdateAtmosphere({
                            rain: {
                              ...rainConfig,
                              intensity: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-zinc-300">
                        <span>Taille des Gouttes</span>
                        <span className="font-mono text-sky-400">{((rainConfig.dropSize ?? 1.0)).toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={3.0}
                        step={0.1}
                        value={rainConfig.dropSize ?? 1.0}
                        onChange={(e) =>
                          onUpdateAtmosphere({
                            rain: {
                              ...rainConfig,
                              dropSize: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: BROUILLARD */}
          {activeTab === 'fog' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-white">Activer le Brouillard</div>
                  <div className="text-xs text-zinc-400">Atmosphère de profondeur et estompage de l&apos;horizon.</div>
                </div>
                <input
                  type="checkbox"
                  checked={atmosphere.fog.enabled}
                  onChange={(e) =>
                    onUpdateAtmosphere({
                      fog: {
                        ...atmosphere.fog,
                        enabled: e.target.checked,
                        type: e.target.checked ? 'exponential' : 'none',
                      },
                    })
                  }
                  className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                />
              </div>

              {atmosphere.fog.enabled && (
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span>Densité du Brouillard</span>
                      <span className="font-mono text-emerald-400">{atmosphere.fog.density.toFixed(4)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.001}
                      max={0.04}
                      step={0.001}
                      value={atmosphere.fog.density}
                      onChange={(e) =>
                        onUpdateAtmosphere({
                          fog: { ...atmosphere.fog, density: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SSAO & POST-PROCESSING */}
          {activeTab === 'postprocess' && (
            <div className="space-y-6">
              {/* Master Post-Processing */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    Pipeline Post-Processing & Rendu Graphique
                  </div>
                  <div className="text-xs text-zinc-400">
                    SSAO (Ombres de contact sous les objets), Bloom Unreal, Vignette & Étalonnage colorimétrique.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={postProcessing.enabled}
                  onChange={(e) =>
                    onUpdatePostProcessing({ enabled: e.target.checked })
                  }
                  className="w-5 h-5 accent-purple-500 rounded cursor-pointer"
                />
              </div>

              {postProcessing.enabled && (
                <div className="space-y-4">
                  {/* SSAO & OMBRES DE CONTACT */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-purple-400" />
                          Ombres de Contact & SSAO (Ambiance Occlusion)
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Assombrit les creux, cavités et le contact entre le sol et les caisses/véhicules pour ancrer les objets dans la scène.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={ssaoConfig.enabled}
                        onChange={(e) =>
                          onUpdatePostProcessing({
                            ssao: { ...ssaoConfig, enabled: e.target.checked },
                          })
                        }
                        className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                      />
                    </div>

                    {ssaoConfig.enabled && (
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Intensité de l&apos;Occlusion</span>
                            <span className="font-mono text-purple-400">{ssaoConfig.intensity.toFixed(1)}x</span>
                          </div>
                          <input
                            type="range"
                            min={0.2}
                            max={3.0}
                            step={0.1}
                            value={ssaoConfig.intensity}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                ssao: {
                                  ...ssaoConfig,
                                  intensity: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Rayon de Contact (Radius)</span>
                            <span className="font-mono text-purple-400">{ssaoConfig.radius.toFixed(2)}m</span>
                          </div>
                          <input
                            type="range"
                            min={0.1}
                            max={2.5}
                            step={0.05}
                            value={ssaoConfig.radius}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                ssao: {
                                  ...ssaoConfig,
                                  radius: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* BLOOM */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-zinc-200">Bloom & Éclat Lumineux</div>
                      <input
                        type="checkbox"
                        checked={postProcessing.bloom.enabled}
                        onChange={(e) =>
                          onUpdatePostProcessing({
                            bloom: {
                              ...postProcessing.bloom,
                              enabled: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                      />
                    </div>

                    {postProcessing.bloom.enabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Force de l&apos;éclat</span>
                            <span className="font-mono text-purple-400">{postProcessing.bloom.strength.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0.1}
                            max={2.5}
                            step={0.05}
                            value={postProcessing.bloom.strength}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                bloom: {
                                  ...postProcessing.bloom,
                                  strength: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Seuil de diffusion</span>
                            <span className="font-mono text-purple-400">{postProcessing.bloom.threshold.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0.1}
                            max={1.0}
                            step={0.05}
                            value={postProcessing.bloom.threshold}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                bloom: {
                                  ...postProcessing.bloom,
                                  threshold: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ANTI-ALIASING */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        Anti-aliasing
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Lisse les bords en staircase. TAA accumule plusieurs frames (plus net, plus coûteux).
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(['none', 'fxaa', 'smaa', 'taa'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            onUpdatePostProcessing({
                              antiAliasing: { mode: m },
                              fxaa: { enabled: m === 'fxaa' },
                            });
                          }}
                          className={`py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                            aaMode === m
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                              : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          {m === 'none' ? 'Aucun' : m.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* MOTION BLUR */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-zinc-200">Motion Blur (Vélocité)</div>
                        <div className="text-[11px] text-zinc-400">
                          Flou directionnel basé sur le mouvement caméra / objet entre les frames.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={mbConfig.enabled}
                        onChange={(e) =>
                          onUpdatePostProcessing({
                            motionBlur: { ...mbConfig, enabled: e.target.checked },
                          })
                        }
                        className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                      />
                    </div>
                    {mbConfig.enabled && (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Force</span>
                            <span className="font-mono text-purple-400">{mbConfig.strength.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={mbConfig.strength}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                motionBlur: { ...mbConfig, strength: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Échantillons</span>
                            <span className="font-mono text-purple-400">{mbConfig.samples}</span>
                          </div>
                          <input
                            type="range"
                            min={4}
                            max={16}
                            step={1}
                            value={mbConfig.samples}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                motionBlur: { ...mbConfig, samples: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Rayon max</span>
                            <span className="font-mono text-purple-400">{mbConfig.maxRadius.toFixed(3)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={0.1}
                            step={0.005}
                            value={mbConfig.maxRadius}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                motionBlur: { ...mbConfig, maxRadius: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* DEPTH OF FIELD */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-zinc-200">Depth of Field (Bokeh)</div>
                        <div className="text-[11px] text-zinc-400">
                          Flou de profondeur autour du plan focal, avec autofocus par raycast au centre.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={dofConfig.enabled}
                        onChange={(e) =>
                          onUpdatePostProcessing({
                            depthOfField: { ...dofConfig, enabled: e.target.checked },
                          })
                        }
                        className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                      />
                    </div>
                    {dofConfig.enabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex items-center justify-between text-xs text-zinc-300">
                          <span>Autofocus (centre écran)</span>
                          <input
                            type="checkbox"
                            checked={dofConfig.autoFocus}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                depthOfField: { ...dofConfig, autoFocus: e.target.checked },
                              })
                            }
                            className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                          />
                        </label>
                        {!dofConfig.autoFocus && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-zinc-300">
                              <span>Distance focale</span>
                              <span className="font-mono text-purple-400">{dofConfig.focusDistance.toFixed(1)} m</span>
                            </div>
                            <input
                              type="range"
                              min={0.1}
                              max={200}
                              step={0.5}
                              value={dofConfig.focusDistance}
                              onChange={(e) =>
                                onUpdatePostProcessing({
                                  depthOfField: { ...dofConfig, focusDistance: Number(e.target.value) },
                                })
                              }
                              className="w-full accent-purple-500"
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Ouverture</span>
                            <span className="font-mono text-purple-400">{dofConfig.aperture.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={dofConfig.aperture}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                depthOfField: { ...dofConfig, aperture: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Plage nette</span>
                            <span className="font-mono text-purple-400">{dofConfig.focalRange.toFixed(1)} m</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={0.5}
                            value={dofConfig.focalRange}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                depthOfField: { ...dofConfig, focalRange: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SSR */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-zinc-200">SSR (Reflets Écrans)</div>
                        <div className="text-[11px] text-zinc-400">
                          Reflets dynamiques sur les surfaces brillantes via marche de rayons en espace écran.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={ssrConfig.enabled}
                        onChange={(e) =>
                          onUpdatePostProcessing({ ssr: { ...ssrConfig, enabled: e.target.checked } })
                        }
                        className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                      />
                    </div>
                    {ssrConfig.enabled && (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Intensité</span>
                            <span className="font-mono text-purple-400">{ssrConfig.intensity.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={0.05}
                            value={ssrConfig.intensity}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                ssr: { ...ssrConfig, intensity: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Étapes</span>
                            <span className="font-mono text-purple-400">{ssrConfig.steps}</span>
                          </div>
                          <input
                            type="range"
                            min={4}
                            max={32}
                            step={1}
                            value={ssrConfig.steps}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                ssr: { ...ssrConfig, steps: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Épaisseur</span>
                            <span className="font-mono text-purple-400">{ssrConfig.thickness.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0.01}
                            max={1}
                            step={0.01}
                            value={ssrConfig.thickness}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                ssr: { ...ssrConfig, thickness: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* COLOR GRADING */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                          Étalonnage Colorimétrique
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Exposition, contraste, balance des blancs, courbes 3 zones et LUT 3D.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={gradeConfig.enabled}
                        onChange={(e) =>
                          onUpdatePostProcessing({
                            colorGrading: { ...gradeConfig, enabled: e.target.checked },
                          })
                        }
                        className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                      />
                    </div>
                    {gradeConfig.enabled && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          {([
                            ['exposure', 'Exposition', 0.2, 3, 0.05],
                            ['contrast', 'Contraste', 0.5, 2, 0.05],
                            ['saturation', 'Saturation', 0, 2, 0.05],
                          ] as const).map(([key, label, min, max, step]) => (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-xs text-zinc-300">
                                <span>{label}</span>
                                <span className="font-mono text-amber-400">
                                  {gradeConfig[key].toFixed(2)}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={min}
                                max={max}
                                step={step}
                                value={gradeConfig[key]}
                                onChange={(e) =>
                                  onUpdatePostProcessing({
                                    colorGrading: {
                                      ...gradeConfig,
                                      [key]: Number(e.target.value),
                                    },
                                  })
                                }
                                className="w-full accent-amber-500"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {([
                            ['temperature', 'Température (froid ↔ chaud)'],
                            ['tint', 'Teinte (vert ↔ magenta)'],
                            ['shadows', 'Ombres'],
                            ['midtones', 'Midtones'],
                            ['highlights', 'Hautes lumières'],
                          ] as const).map(([key, label]) => (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-xs text-zinc-300">
                                <span>{label}</span>
                                <span className="font-mono text-amber-400">
                                  {gradeConfig[key].toFixed(2)}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={-1}
                                max={1}
                                step={0.05}
                                value={gradeConfig[key]}
                                onChange={(e) =>
                                  onUpdatePostProcessing({
                                    colorGrading: {
                                      ...gradeConfig,
                                      [key]: Number(e.target.value),
                                    },
                                  })
                                }
                                className="w-full accent-amber-500"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-3 items-end pt-2 border-t border-zinc-800/60">
                          <div className="space-y-1">
                            <span className="text-xs text-zinc-300">LUT 3D (bande horizontale)</span>
                            <input
                              type="text"
                              value={gradeConfig.lutUrl || ''}
                              onChange={(e) =>
                                onUpdatePostProcessing({
                                  colorGrading: { ...gradeConfig, lutUrl: e.target.value },
                                })
                              }
                              placeholder="/textures/my-lut-strip.png"
                              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                            />
                          </div>
                          <div className="space-y-1 w-32">
                            <div className="flex justify-between text-xs text-zinc-300">
                              <span>Intensité LUT</span>
                              <span className="font-mono text-amber-400">{gradeConfig.lutIntensity.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={gradeConfig.lutIntensity}
                              onChange={(e) =>
                                onUpdatePostProcessing({
                                  colorGrading: {
                                    ...gradeConfig,
                                    lutIntensity: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full accent-amber-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* VIGNETTE */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-zinc-200">Vignette</div>
                      <input
                        type="checkbox"
                        checked={vigConfig.enabled}
                        onChange={(e) =>
                          onUpdatePostProcessing({
                            vignette: { ...vigConfig, enabled: e.target.checked },
                          })
                        }
                        className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                      />
                    </div>
                    {vigConfig.enabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Assombrissement</span>
                            <span className="font-mono text-purple-400">{vigConfig.darkness.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.05}
                            value={vigConfig.darkness}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                vignette: { ...vigConfig, darkness: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-300">
                            <span>Décalage</span>
                            <span className="font-mono text-purple-400">{vigConfig.offset.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={0.05}
                            value={vigConfig.offset}
                            onChange={(e) =>
                              onUpdatePostProcessing({
                                vignette: { ...vigConfig, offset: Number(e.target.value) },
                              })
                            }
                            className="w-full accent-purple-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CHROMATIC ABERRATION */}
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-zinc-200">Aberration Chromatique</div>
                        <div className="text-[11px] text-zinc-400">
                          Sépare légèrement les canaux RGB aux bords de l&apos;image (look objectif / glitch).
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={caConfig.enabled}
                        onChange={(e) =>
                          onUpdatePostProcessing({
                            chromaticAberration: { ...caConfig, enabled: e.target.checked },
                          })
                        }
                        className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                      />
                    </div>
                    {caConfig.enabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>Intensité</span>
                          <span className="font-mono text-purple-400">{caConfig.intensity.toFixed(3)}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={0.02}
                          step={0.001}
                          value={caConfig.intensity}
                          onChange={(e) =>
                            onUpdatePostProcessing({
                              chromaticAberration: {
                                ...caConfig,
                                intensity: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full accent-purple-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
