'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Zap,
  Repeat,
  
  Flame,
  Radio,
  Split,
  ChevronDown,
  
  Wind,
  CloudRain,
  Waves,
  Anchor,
  Aperture,
  Target,
  BoxSelect,
} from 'lucide-react';
import {
  BehaviorCard,
  BehaviorCardType,
  CollectableConfig,
  PatrolConfig,
  TriggerZoneConfig,
  DamageOnTouchConfig,
  WindZoneBehaviorConfig,
  FlammableBehaviorConfig,
  WeatherListenerConfig,
  BuoyantConfig,
  PostProcessVolumeBehaviorConfig,
  NavMeshAgentConfig,
  TriggerVolumeBehaviorConfig,
  NodeGraphData,
} from '../types/logic';
import { PostProcessVolumeOverrides } from '../types/atmosphere';
import { convertBehaviorToNodes } from '../lib/logic/NodeGraphConverter';
import { createDefaultConfig } from '../lib/logic/behaviorCardDefaults';
import { SoundEngine } from '../lib/audio/SoundSynth';

/** Scalar knobs a Post-Process Volume can override (fixed inspector list). */
const PPV_OVERRIDE_FIELDS: Array<{
  key: keyof PostProcessVolumeOverrides;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
}> = [
  { key: 'exposure', label: 'Exposition', min: 0.2, max: 3, step: 0.05 },
  { key: 'contrast', label: 'Contraste', min: 0.5, max: 2, step: 0.05 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.05 },
  { key: 'temperature', label: 'Température', min: -1, max: 1, step: 0.05 },
  { key: 'shadows', label: 'Ombres', min: -1, max: 1, step: 0.05 },
  { key: 'midtones', label: 'Midtones', min: -1, max: 1, step: 0.05 },
  { key: 'highlights', label: 'Hautes lumières', min: -1, max: 1, step: 0.05 },
  { key: 'bloomStrength', label: 'Bloom (Force)', min: 0, max: 3, step: 0.05 },
  { key: 'bloomThreshold', label: 'Bloom (Seuil)', min: 0, max: 1, step: 0.01 },
  { key: 'vignetteDarkness', label: 'Vignette', min: 0, max: 1.5, step: 0.05 },
  { key: 'chromaticAberration', label: 'Aberration Chromatique', min: 0, max: 0.02, step: 0.001, fmt: (v) => v.toFixed(3) },
  { key: 'ssaoIntensity', label: 'SSAO (Intensité)', min: 0, max: 3, step: 0.05 },
  { key: 'ssrIntensity', label: 'SSR (Intensité)', min: 0, max: 2, step: 0.05 },
  { key: 'dofFocus', label: 'DoF (Distance focale)', min: 0.1, max: 200, step: 0.5 },
  { key: 'dofAperture', label: 'DoF (Ouverture)', min: 0, max: 1, step: 0.05 },
  { key: 'motionBlurStrength', label: 'Motion Blur', min: 0, max: 1, step: 0.05 },
];

interface BehaviorCardsInspectorProps {
  entityId: string;
  cards: BehaviorCard[];
  onUpdateCards: (cards: BehaviorCard[]) => void;
  onOpenNodeGraph: (convertedGraph?: NodeGraphData) => void;
}

export const BehaviorCardsInspector: React.FC<BehaviorCardsInspectorProps> = ({
  entityId,
  cards = [],
  onUpdateCards,
  onOpenNodeGraph,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Add a new card
  const handleAddCard = (type: BehaviorCardType) => {
    // Defaults live in lib/logic/behaviorCardDefaults.ts as an exhaustive
    // Record<BehaviorCardType, ...>, so a new card type cannot be added
    // without a config (createDefaultConfig returns a fresh deep copy).
    const config = createDefaultConfig(type);

    const newCard: BehaviorCard = {
      id: `card_${type.toLowerCase()}_${cards.length + 1}_${entityId}`,
      type,
      enabled: true,
      config,
    };

    onUpdateCards([...cards, newCard]);
    setShowAddMenu(false);
  };

  // Remove card
  const handleRemoveCard = (cardId: string) => {
    onUpdateCards(cards.filter((c) => c.id !== cardId));
  };

  // Toggle card
  const handleToggleCard = (cardId: string) => {
    onUpdateCards(
      cards.map((c) => (c.id === cardId ? { ...c, enabled: !c.enabled } : c))
    );
  };

  // Update card config field
  const handleUpdateConfig = (cardId: string, field: string, value: any) => {
    onUpdateCards(
      cards.map((c) => {
        if (c.id === cardId) {
          return {
            ...c,
            config: { ...c.config, [field]: value },
          };
        }
        return c;
      })
    );
  };

  // Update one scalar override inside PostProcessVolumeBehaviorConfig.overrides
  const handleUpdateOverride = (
    cardId: string,
    key: keyof PostProcessVolumeOverrides,
    value: number | undefined
  ) => {
    onUpdateCards(
      cards.map((c) => {
        if (c.id !== cardId) return c;
        const cfg = c.config as PostProcessVolumeBehaviorConfig;
        const overrides: PostProcessVolumeOverrides = { ...cfg.overrides };
        if (value === undefined) {
          delete overrides[key];
        } else {
          overrides[key] = value;
        }
        return { ...c, config: { ...cfg, overrides } };
      })
    );
  };

  // Convert card to Node Graph
  const handleConvertToNodeGraph = (card: BehaviorCard) => {
    const generatedGraph = convertBehaviorToNodes(card);
    onOpenNodeGraph(generatedGraph);
  };

  return (
    <div id="behavior-cards-container" className="space-y-3">
      {/* Header + Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Cartes de Comportement</span>
        </div>

        <div className="relative">
          <button
            type="button"
            id="btn-add-behavior-card"
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-medium border border-amber-500/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-60 p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-40 space-y-1">
              {[
                {
                  type: 'Collectable',
                  label: 'Collectable',
                  desc: 'Pièce ou gemme à ramasser (+Score)',
                  icon: Sparkles,
                  color: 'text-amber-400',
                },
                {
                  type: 'Patrol',
                  label: 'Patrouille',
                  desc: 'Aller-retour automatique sur axe',
                  icon: Repeat,
                  color: 'text-sky-400',
                },
                {
                  type: 'TriggerZone',
                  label: 'Zone de Détection',
                  desc: 'Déclenche un son ou événement',
                  icon: Radio,
                  color: 'text-emerald-400',
                },
                {
                  type: 'DamageOnTouch',
                  label: 'Dégâts au Contact',
                  desc: 'Inflige des dégâts et repousse',
                  icon: Zap,
                  color: 'text-rose-400',
                },
                {
                  type: 'WindZone',
                  label: 'Zone de Vent',
                  desc: 'Courant ascendant ou poussée d\'air',
                  icon: Wind,
                  color: 'text-cyan-400',
                },
                {
                  type: 'Flammable',
                  label: 'Inflammable',
                  desc: 'Brûle, propage le feu et s\'auto-détruit',
                  icon: Flame,
                  color: 'text-orange-400',
                },
                {
                  type: 'WeatherListener',
                  label: 'Écouteur Météo',
                  desc: 'Réagit à la pluie, orages ou vent',
                  icon: CloudRain,
                  color: 'text-blue-400',
                },
                {
                  type: 'Buoyant',
                  label: 'Flottaison Aquatique',
                  desc: 'Flotte sur les vagues avec poussée d\'Archimède',
                  icon: Waves,
                  color: 'text-cyan-400',
                },
                {
                  type: 'PostProcessVolume',
                  label: 'Volume Post-Process',
                  desc: 'Zone 3D qui override grading / bloom / DoF…',
                  icon: Aperture,
                  color: 'text-fuchsia-400',
                },
                {
                  type: 'NavMeshAgent',
                  label: 'Agent NavMesh',
                  desc: 'IA de poursuite avec pathfinding A*',
                  icon: Target,
                  color: 'text-rose-400',
                },
                {
                  type: 'TriggerVolume',
                  label: 'Volume Déclencheur',
                  desc: 'Checkpoint, téléport, cinématique ou piège',
                  icon: BoxSelect,
                  color: 'text-purple-400',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => handleAddCard(item.type as BehaviorCardType)}
                    className="w-full flex items-start gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-800 text-left transition-colors"
                  >
                    <Icon className={`w-4 h-4 mt-0.5 ${item.color}`} />
                    <div>
                      <div className="text-xs font-medium text-zinc-200">{item.label}</div>
                      <div className="text-[10px] text-zinc-400">{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cards List */}
      {cards.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-zinc-800 text-center text-zinc-500 text-xs">
          Aucun comportement attaché. Cliquez sur « Ajouter » pour configurer un Collectable, une Patrouille ou un Piège.
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => {
            return (
              <div
                key={card.id}
                className={`p-3 rounded-2xl border transition-all ${
                  card.enabled
                    ? 'bg-zinc-900/80 border-zinc-700/80 shadow-lg'
                    : 'bg-zinc-950/60 border-zinc-800/60 opacity-60'
                }`}
              >
                {/* Card Title & Controls */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    {card.type === 'Collectable' && <Sparkles className="w-4 h-4 text-amber-400" />}
                    {card.type === 'Patrol' && <Repeat className="w-4 h-4 text-sky-400" />}
                    {card.type === 'TriggerZone' && <Radio className="w-4 h-4 text-emerald-400" />}
                    {card.type === 'DamageOnTouch' && <Flame className="w-4 h-4 text-rose-400" />}
                    {card.type === 'WindZone' && <Wind className="w-4 h-4 text-cyan-400" />}
                    {card.type === 'Flammable' && <Flame className="w-4 h-4 text-orange-400" />}
                    {card.type === 'WeatherListener' && <CloudRain className="w-4 h-4 text-blue-400" />}
                    {card.type === 'Buoyant' && <Anchor className="w-4 h-4 text-cyan-400" />}
                    {card.type === 'NavMeshAgent' && <Target className="w-4 h-4 text-rose-400" />}
                    {card.type === 'TriggerVolume' && <BoxSelect className="w-4 h-4 text-purple-400" />}
                    {card.type === 'PostProcessVolume' && <Aperture className="w-4 h-4 text-fuchsia-400" />}

                    <span className="text-xs font-semibold text-zinc-200">
                      {card.type === 'Collectable' && 'Collectable (Objet Ramassable)'}
                      {card.type === 'Patrol' && 'Patrouille Aller-Retour'}
                      {card.type === 'TriggerZone' && 'Zone Déclencheur (Trigger)'}
                      {card.type === 'DamageOnTouch' && 'Dégâts au Contact (Piège)'}
                      {card.type === 'WindZone' && 'Zone de Vent (Air Flow)'}
                      {card.type === 'Flammable' && 'Inflammable (Propagation du Feu)'}
                      {card.type === 'WeatherListener' && 'Écouteur Météo (Conditions)'}
                      {card.type === 'Buoyant' && 'Flottaison Aquatique (Archimède)'}
                      {card.type === 'NavMeshAgent' && 'Agent NavMesh (Poursuite A*)'}
                      {card.type === 'TriggerVolume' && 'Volume Déclencheur (Boîte/Sphère)'}
                      {card.type === 'PostProcessVolume' && 'Volume Post-Process (Rendu Local)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleCard(card.id)}
                      className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors ${
                        card.enabled ? 'bg-emerald-500 justify-end' : 'bg-zinc-800 justify-start'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white shadow" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleRemoveCard(card.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Fields */}
                <div className="pt-2.5 space-y-2.5">
                  {/* COLLECTABLE CONFIG */}
                  {card.type === 'Collectable' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-zinc-400">Valeur en Points (Score)</span>
                          <span className="font-mono text-amber-400">
                            +{(card.config as CollectableConfig).scoreValue ?? 10} pts
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={(card.config as CollectableConfig).scoreValue ?? 10}
                          onChange={(e) =>
                            handleUpdateConfig(card.id, 'scoreValue', parseInt(e.target.value))
                          }
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400">Son de Récolte</span>
                          <select
                            value={(card.config as CollectableConfig).soundPreset || 'coin'}
                            onChange={(e) => {
                              handleUpdateConfig(card.id, 'soundPreset', e.target.value);
                              SoundEngine.play(e.target.value);
                            }}
                            className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                          >
                            <option value="coin">Pièce (Coin)</option>
                            <option value="gem">Gemme (Gem)</option>
                            <option value="powerup">Powerup</option>
                            <option value="chime">Carillon</option>
                            <option value="none">Aucun son</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400">Réapparition (s)</span>
                          <input
                            type="number"
                            min="0"
                            max="60"
                            value={(card.config as CollectableConfig).respawnTime ?? 0}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'respawnTime', parseFloat(e.target.value))
                            }
                            className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                            placeholder="0 = Pas de respawn"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* PATROL CONFIG */}
                  {card.type === 'Patrol' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-zinc-400">Vitesse de Déplacement</span>
                          <span className="font-mono text-sky-400">
                            {((card.config as PatrolConfig).speed ?? 3).toFixed(1)} m/s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="15"
                          step="0.5"
                          value={(card.config as PatrolConfig).speed ?? 3}
                          onChange={(e) =>
                            handleUpdateConfig(card.id, 'speed', parseFloat(e.target.value))
                          }
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400">Axe de Patrouille</span>
                          <select
                            value={(card.config as PatrolConfig).axis || 'x'}
                            onChange={(e) => handleUpdateConfig(card.id, 'axis', e.target.value)}
                            className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                          >
                            <option value="x">Axe X (Gauche / Droite)</option>
                            <option value="z">Axe Z (Avant / Arrière)</option>
                            <option value="y">Axe Y (Haut / Bas)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400">Distance Maximale (m)</span>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={(card.config as PatrolConfig).distance ?? 6}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'distance', parseFloat(e.target.value))
                            }
                            className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* TRIGGER ZONE CONFIG */}
                  {card.type === 'TriggerZone' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-zinc-400">Rayon de Détection</span>
                          <span className="font-mono text-emerald-400">
                            {((card.config as TriggerZoneConfig).radius ?? 3.5).toFixed(1)} m
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          step="0.5"
                          value={(card.config as TriggerZoneConfig).radius ?? 3.5}
                          onChange={(e) =>
                            handleUpdateConfig(card.id, 'radius', parseFloat(e.target.value))
                          }
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-400">Message Déclenché</span>
                        <input
                          type="text"
                          value={(card.config as TriggerZoneConfig).message || ''}
                          onChange={(e) => handleUpdateConfig(card.id, 'message', e.target.value)}
                          placeholder="Texte affiché à l'entrée"
                          className="w-full px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                        />
                      </div>
                    </>
                  )}

                  {/* DAMAGE ON TOUCH CONFIG */}
                  {card.type === 'DamageOnTouch' && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-zinc-400">Dégâts infligés</span>
                          <span className="font-mono text-rose-400">
                            -{(card.config as DamageOnTouchConfig).damage ?? 25} PV
                          </span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="100"
                          step="5"
                          value={(card.config as DamageOnTouchConfig).damage ?? 25}
                          onChange={(e) =>
                            handleUpdateConfig(card.id, 'damage', parseInt(e.target.value))
                          }
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-400"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-zinc-400">Force de Repoussement (Knockback)</span>
                          <span className="font-mono text-zinc-300">
                            {((card.config as DamageOnTouchConfig).knockbackForce ?? 8).toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="25"
                          step="1"
                          value={(card.config as DamageOnTouchConfig).knockbackForce ?? 8}
                          onChange={(e) =>
                            handleUpdateConfig(card.id, 'knockbackForce', parseFloat(e.target.value))
                          }
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-400"
                        />
                      </div>
                    </>
                  )}

                  {/* WIND ZONE CONFIG */}
                  {card.type === 'WindZone' && (
                    <>
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-400">Mode de Flux d&apos;Air</span>
                        <select
                          value={(card.config as WindZoneBehaviorConfig).mode || 'directional'}
                          onChange={(e) => handleUpdateConfig(card.id, 'mode', e.target.value)}
                          className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="directional">Directionnel (Flux d&apos;air)</option>
                          <option value="updraft">Courant Ascendant (Geyser / Aération)</option>
                          <option value="vortex">Vortex Tourbillon</option>
                          <option value="radial">Répulsion Radiale</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-zinc-400">Force</span>
                            <span className="font-mono text-cyan-400">
                              {(card.config as WindZoneBehaviorConfig).force ?? 25} N
                            </span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="100"
                            step="5"
                            value={(card.config as WindZoneBehaviorConfig).force ?? 25}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'force', parseFloat(e.target.value))
                            }
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-zinc-400">Rayon</span>
                            <span className="font-mono text-zinc-300">
                              {(card.config as WindZoneBehaviorConfig).radius ?? 6} m
                            </span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="30"
                            step="1"
                            value={(card.config as WindZoneBehaviorConfig).radius ?? 6}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'radius', parseFloat(e.target.value))
                            }
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* FLAMMABLE CONFIG */}
                  {card.type === 'Flammable' && (
                    <>
                      <div className="space-y-1">
                        <label className="flex items-center justify-between text-xs text-zinc-300">
                          <span>Enflammé au lancement</span>
                          <input
                            type="checkbox"
                            checked={Boolean((card.config as FlammableBehaviorConfig).autoIgniteOnStart)}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'autoIgniteOnStart', e.target.checked)
                            }
                            className="w-4 h-4 rounded text-orange-500 bg-zinc-900 border-zinc-700"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-zinc-400">Durée Flammes</span>
                            <span className="font-mono text-orange-400">
                              {(card.config as FlammableBehaviorConfig).burnDuration ?? 15}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="3"
                            max="60"
                            step="1"
                            value={(card.config as FlammableBehaviorConfig).burnDuration ?? 15}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'burnDuration', parseFloat(e.target.value))
                            }
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-zinc-400">Rayon Propagation</span>
                            <span className="font-mono text-zinc-300">
                              {(card.config as FlammableBehaviorConfig).spreadRadius ?? 3} m
                            </span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            step="0.5"
                            value={(card.config as FlammableBehaviorConfig).spreadRadius ?? 3}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'spreadRadius', parseFloat(e.target.value))
                            }
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-400"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* WEATHER LISTENER CONFIG */}
                  {card.type === 'WeatherListener' && (
                    <>
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-400">Réagir à</span>
                        <select
                          value={(card.config as WeatherListenerConfig).reactTo || 'rain'}
                          onChange={(e) => handleUpdateConfig(card.id, 'reactTo', e.target.value)}
                          className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="rain">Pluie / Orage</option>
                          <option value="wind">Vent Fort</option>
                          <option value="any">N&apos;importe quelle condition</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-400">Action Déclenchée</span>
                        <select
                          value={(card.config as WeatherListenerConfig).action || 'Extinguish'}
                          onChange={(e) => handleUpdateConfig(card.id, 'action', e.target.value)}
                          className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                        >
                          <option value="Extinguish">Éteindre les Flammes</option>
                          <option value="Ignite">Allumer le Feu (Impact de Foudre)</option>
                          <option value="PlaySound">Jouer un Son</option>
                        </select>
                      </div>
                    </>
                  )}

                  {/* BUOYANT CONFIG */}
                  {card.type === 'Buoyant' && (
                    <>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-zinc-400">Poussée d&apos;Archimède</span>
                            <span className="font-mono text-cyan-300">
                              {((card.config as BuoyantConfig).buoyancyMultiplier ?? 1.3).toFixed(1)}x
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="3.5"
                            step="0.1"
                            value={(card.config as BuoyantConfig).buoyancyMultiplier ?? 1.3}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'buoyancyMultiplier', parseFloat(e.target.value))
                            }
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-zinc-400">Frottement Visqueux</span>
                            <span className="font-mono text-cyan-300">
                              {((card.config as BuoyantConfig).waterDrag ?? 1.8).toFixed(1)}x
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="4.0"
                            step="0.1"
                            value={(card.config as BuoyantConfig).waterDrag ?? 1.8}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'waterDrag', parseFloat(e.target.value))
                            }
                            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <span className="text-zinc-300">Aligner sur la crête des vagues</span>
                          <input
                            type="checkbox"
                            checked={(card.config as BuoyantConfig).alignToWaveNormal ?? true}
                            onChange={(e) =>
                              handleUpdateConfig(card.id, 'alignToWaveNormal', e.target.checked)
                            }
                            className="w-3.5 h-3.5 accent-cyan-500 rounded cursor-pointer"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* POST-PROCESS VOLUME CONFIG */}
                  {card.type === 'PostProcessVolume' && (
                    (() => {
                      const cfg = card.config as PostProcessVolumeBehaviorConfig;
                      const overrides = cfg.overrides ?? {};
                      return (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            {(['x', 'y', 'z'] as const).map((axis) => (
                              <div key={axis} className="space-y-1">
                                <span className="text-[10px] text-zinc-400 uppercase">
                                  Taille {axis}
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  max="500"
                                  value={cfg.size?.[axis] ?? 8}
                                  onChange={(e) =>
                                    handleUpdateConfig(card.id, 'size', {
                                      ...cfg.size,
                                      [axis]: parseFloat(e.target.value) || 1,
                                    })
                                  }
                                  className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                />
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-zinc-400">Rayon de mélange</span>
                                <span className="font-mono text-fuchsia-300">
                                  {(cfg.blendRadius ?? 2).toFixed(1)} m
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="20"
                                step="0.5"
                                value={cfg.blendRadius ?? 2}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'blendRadius', parseFloat(e.target.value))
                                }
                                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-400"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-zinc-400">Priorité</span>
                                <span className="font-mono text-fuchsia-300">
                                  {cfg.priority ?? 0}
                                </span>
                              </div>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={cfg.priority ?? 0}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'priority', parseInt(e.target.value) || 0)
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-1 border-t border-zinc-800/60">
                            <span className="text-[10px] font-semibold text-fuchsia-400 uppercase tracking-wider">
                              Paramètres surchargés
                            </span>
                            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                              {PPV_OVERRIDE_FIELDS.map((f) => {
                                const current = overrides[f.key];
                                const enabled = typeof current === 'number';
                                const value = enabled ? (current as number) : (f.min + f.max) / 2;
                                return (
                                  <div key={String(f.key)} className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={enabled}
                                          onChange={(e) =>
                                            handleUpdateOverride(
                                              card.id,
                                              f.key,
                                              e.target.checked ? value : undefined
                                            )
                                          }
                                          className="w-3 h-3 accent-fuchsia-500 rounded cursor-pointer"
                                        />
                                        {f.label}
                                      </label>
                                      <span className="font-mono text-fuchsia-300">
                                        {enabled ? (f.fmt ? f.fmt(value) : value.toFixed(2)) : '—'}
                                      </span>
                                    </div>
                                    {enabled && (
                                      <input
                                        type="range"
                                        min={f.min}
                                        max={f.max}
                                        step={f.step}
                                        value={value}
                                        onChange={(e) =>
                                          handleUpdateOverride(
                                            card.id,
                                            f.key,
                                            parseFloat(e.target.value)
                                          )
                                        }
                                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-400"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      );
                    })()
                  )}

                  {/* NAVMESH AGENT CONFIG */}
                  {card.type === 'NavMeshAgent' && (
                    (() => {
                      const cfg = card.config as NavMeshAgentConfig;
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Cible de Poursuite</span>
                              <select
                                value={cfg.targetType ?? 'Player'}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'targetType', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              >
                                <option value="Player">Joueur</option>
                                <option value="Entity">Entité (par ID)</option>
                                <option value="Position">Position Fixe</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Vitesse (m/s)</span>
                              <input
                                type="number"
                                min="0"
                                max="40"
                                step="0.1"
                                value={cfg.speed ?? 3.5}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'speed', parseFloat(e.target.value) || 0)
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                          </div>
                          {cfg.targetType === 'Entity' && (
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">
                                ID de l&apos;Entité Cible
                              </span>
                              <input
                                type="text"
                                value={cfg.targetEntityId || ''}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'targetEntityId', e.target.value)
                                }
                                placeholder="uuid de l'entité à poursuivre"
                                className="w-full px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                          )}

                          {cfg.targetType === 'Position' && (
                            <div className="grid grid-cols-3 gap-2">
                              {(['x', 'y', 'z'] as const).map((axis) => (
                                <div key={axis} className="space-y-1">
                                  <span className="text-[10px] text-zinc-400 uppercase">
                                    Cible {axis}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={cfg.targetPosition?.[axis] ?? 0}
                                    onChange={(e) =>
                                      handleUpdateConfig(card.id, 'targetPosition', {
                                        ...(cfg.targetPosition ?? { x: 0, y: 0, z: 0 }),
                                        [axis]: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Arrêt (m)</span>
                              <input
                                type="number"
                                min="0"
                                max="20"
                                step="0.1"
                                value={cfg.stoppingDistance ?? 1.5}
                                onChange={(e) =>
                                  handleUpdateConfig(
                                    card.id,
                                    'stoppingDistance',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Accél. (m/s²)</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={cfg.acceleration ?? 8}
                                onChange={(e) =>
                                  handleUpdateConfig(
                                    card.id,
                                    'acceleration',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Rotation (°/s)</span>
                              <input
                                type="number"
                                min="0"
                                max="720"
                                step="5"
                                value={cfg.angularSpeed ?? 120}
                                onChange={(e) =>
                                  handleUpdateConfig(
                                    card.id,
                                    'angularSpeed',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">
                                Rayon d&apos;Évitement (m)
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="5"
                                step="0.1"
                                value={cfg.avoidanceRadius ?? 0.6}
                                onChange={(e) =>
                                  handleUpdateConfig(
                                    card.id,
                                    'avoidanceRadius',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Pente Max (°)</span>
                              <input
                                type="number"
                                min="0"
                                max="89"
                                step="1"
                                value={cfg.maxSlopeAngle ?? 45}
                                onChange={(e) =>
                                  handleUpdateConfig(
                                    card.id,
                                    'maxSlopeAngle',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5 pt-1 border-t border-zinc-800/60">
                            <label className="flex items-center justify-between text-[11px] text-zinc-300 cursor-pointer">
                              <span>Recalcul Automatique du Chemin (A*)</span>
                              <input
                                type="checkbox"
                                checked={cfg.autoRepath ?? true}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'autoRepath', e.target.checked)
                                }
                                className="w-3.5 h-3.5 accent-rose-500 rounded cursor-pointer"
                              />
                            </label>
                            <label className="flex items-center justify-between text-[11px] text-zinc-300 cursor-pointer">
                              <span>Éviter l&apos;Eau (cellules inondées)</span>
                              <input
                                type="checkbox"
                                checked={cfg.avoidWater ?? true}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'avoidWater', e.target.checked)
                                }
                                className="w-3.5 h-3.5 accent-rose-500 rounded cursor-pointer"
                              />
                            </label>
                          </div>
                        </>
                      );
                    })()
                  )}

                  {/* TRIGGER VOLUME CONFIG */}
                  {card.type === 'TriggerVolume' && (
                    (() => {
                      const cfg = card.config as TriggerVolumeBehaviorConfig;
                      const shape = cfg.shape ?? 'box';
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Forme du Volume</span>
                              <select
                                value={shape}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'shape', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              >
                                <option value="box">Boîte (Box)</option>
                                <option value="sphere">Sphère</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Déclenché Par</span>
                              <select
                                value={cfg.triggerOn ?? 'Player'}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'triggerOn', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              >
                                <option value="Player">Joueur</option>
                                <option value="Enemy">Ennemis</option>
                                <option value="NPC">PNJ</option>
                                <option value="Any">N&apos;importe qui</option>
                              </select>
                            </div>
                          </div>

                          {shape === 'box' ? (
                            <div className="grid grid-cols-3 gap-2">
                              {(['x', 'y', 'z'] as const).map((axis) => (
                                <div key={axis} className="space-y-1">
                                  <span className="text-[10px] text-zinc-400 uppercase">
                                    Taille {axis}
                                  </span>
                                  <input
                                    type="number"
                                    min="0.5"
                                    max="500"
                                    step="0.5"
                                    value={cfg.size?.[axis] ?? 4}
                                    onChange={(e) =>
                                      handleUpdateConfig(card.id, 'size', {
                                        ...(cfg.size ?? { x: 4, y: 3, z: 4 }),
                                        [axis]: parseFloat(e.target.value) || 1,
                                      })
                                    }
                                    className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-zinc-400">Rayon</span>
                                <span className="font-mono text-purple-300">
                                  {(cfg.radius ?? 3).toFixed(1)} m
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.5"
                                max="50"
                                step="0.5"
                                value={cfg.radius ?? 3}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'radius', parseFloat(e.target.value))
                                }
                                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
                              />
                            </div>
                          )}

                          <div className="space-y-1">
                            <span className="text-[10px] text-zinc-400">Action à l&apos;Entrée</span>
                            <select
                              value={cfg.actionType ?? 'checkpoint'}
                              onChange={(e) =>
                                handleUpdateConfig(card.id, 'actionType', e.target.value)
                              }
                              className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                            >
                              <option value="checkpoint">Checkpoint (Sauvegarde)</option>
                              <option value="teleport">Téléportation</option>
                              <option value="cinematic">Cinématique / Dialogue</option>
                              <option value="trap">Piège (Dégâts)</option>
                              <option value="custom">Personnalisé (Script)</option>
                            </select>
                          </div>
                          {cfg.actionType === 'checkpoint' && (
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">Nom du Checkpoint</span>
                              <input
                                type="text"
                                value={cfg.checkpointName || ''}
                                onChange={(e) =>
                                  handleUpdateConfig(card.id, 'checkpointName', e.target.value)
                                }
                                placeholder="ex. checkpoint_grotte"
                                className="w-full px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                              />
                            </div>
                          )}

                          {cfg.actionType === 'teleport' && (
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-400">
                                Destination du Téléporteur
                              </span>
                              <div className="grid grid-cols-3 gap-2">
                                {(['x', 'y', 'z'] as const).map((axis) => (
                                  <input
                                    key={axis}
                                    type="number"
                                    step="0.5"
                                    value={cfg.teleportDestination?.[axis] ?? 0}
                                    onChange={(e) =>
                                      handleUpdateConfig(card.id, 'teleportDestination', {
                                        ...(cfg.teleportDestination ?? { x: 0, y: 0, z: 0 }),
                                        [axis]: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {cfg.actionType === 'cinematic' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <span className="text-[10px] text-zinc-400">
                                    Caméra Cinématique
                                  </span>
                                  <input
                                    type="text"
                                    value={cfg.cinematicCameraName || ''}
                                    onChange={(e) =>
                                      handleUpdateConfig(
                                        card.id,
                                        'cinematicCameraName',
                                        e.target.value
                                      )
                                    }
                                    placeholder="ex. camera_intro"
                                    className="w-full px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[10px] text-zinc-400">Interlocuteur</span>
                                  <input
                                    type="text"
                                    value={cfg.cinematicSpeaker || ''}
                                    onChange={(e) =>
                                      handleUpdateConfig(card.id, 'cinematicSpeaker', e.target.value)
                                    }
                                    placeholder="ex. Gardien"
                                    className="w-full px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] text-zinc-400">Réplique / Texte</span>
                                <textarea
                                  rows={2}
                                  value={cfg.cinematicText || ''}
                                  onChange={(e) =>
                                    handleUpdateConfig(card.id, 'cinematicText', e.target.value)
                                  }
                                  placeholder="Texte affiché pendant la cinématique"
                                  className="w-full px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs resize-none"
                                />
                              </div>
                            </>
                          )}
                          {cfg.actionType === 'trap' && (
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <span className="text-[10px] text-zinc-400">Dégâts</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="500"
                                  step="1"
                                  value={cfg.trapDamage ?? 25}
                                  onChange={(e) =>
                                    handleUpdateConfig(card.id, 'trapDamage', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] text-zinc-400">Recul (m/s)</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={cfg.trapKnockback ?? 8}
                                  onChange={(e) =>
                                    handleUpdateConfig(
                                      card.id,
                                      'trapKnockback',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] text-zinc-400">Particules</span>
                                <input
                                  type="text"
                                  value={cfg.trapParticlePreset || ''}
                                  onChange={(e) =>
                                    handleUpdateConfig(card.id, 'trapParticlePreset', e.target.value)
                                  }
                                  placeholder="sparks"
                                  className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                                />
                              </div>
                            </div>
                          )}

                          <div className="space-y-1">
                            <span className="text-[10px] text-zinc-400">Son du Déclenchement</span>
                            <select
                              value={cfg.soundPreset ?? 'chime'}
                              onChange={(e) =>
                                handleUpdateConfig(card.id, 'soundPreset', e.target.value)
                              }
                              className="w-full px-2 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                            >
                              <option value="chime">Carillon</option>
                              <option value="checkpoint">Checkpoint</option>
                              <option value="alarm">Alarme</option>
                              <option value="warp">Warp</option>
                              <option value="explosion">Explosion</option>
                              <option value="none">Aucun son</option>
                            </select>
                          </div>

                          <label className="flex items-center justify-between text-[11px] text-zinc-300 cursor-pointer">
                            <span>Réutilisable (réarmement automatique)</span>
                            <input
                              type="checkbox"
                              checked={cfg.repeatable ?? true}
                              onChange={(e) =>
                                handleUpdateConfig(card.id, 'repeatable', e.target.checked)
                              }
                              className="w-3.5 h-3.5 accent-purple-500 rounded cursor-pointer"
                            />
                          </label>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-zinc-400">Délai de Réarmement</span>
                              <span className="font-mono text-purple-300">
                                {(cfg.cooldown ?? 1).toFixed(1)} s
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="30"
                              step="0.5"
                              value={cfg.cooldown ?? 1}
                              onChange={(e) =>
                                handleUpdateConfig(card.id, 'cooldown', parseFloat(e.target.value))
                              }
                              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
                            />
                          </div>

                          <label className="flex items-center justify-between text-[11px] text-zinc-300 cursor-pointer">
                            <span>Retour Visuel (pulse du gizmo)</span>
                            <input
                              type="checkbox"
                              checked={cfg.visualFeedback ?? true}
                              onChange={(e) =>
                                handleUpdateConfig(card.id, 'visualFeedback', e.target.checked)
                              }
                              className="w-3.5 h-3.5 accent-purple-500 rounded cursor-pointer"
                            />
                          </label>

                          <div className="space-y-1">
                            <span className="text-[10px] text-zinc-400">
                              Message à l&apos;Écran (optionnel)
                            </span>
                            <input
                              type="text"
                              value={cfg.triggerMessage || ''}
                              onChange={(e) =>
                                handleUpdateConfig(card.id, 'triggerMessage', e.target.value)
                              }
                              placeholder="Texte affiché à l'entrée"
                              className="w-full px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs"
                            />
                          </div>
                        </>
                      );
                    })()
                  )}
                  {card.type !== 'PostProcessVolume' && (
                    <div className="pt-2 border-t border-zinc-800/80">
                      <button
                        type="button"
                        onClick={() => handleConvertToNodeGraph(card)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-medium transition-all"
                      >
                        <Split className="w-3.5 h-3.5" />
                        <span>Convertir en Node Graph (Niveau 2)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
