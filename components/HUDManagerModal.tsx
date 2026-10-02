'use client';

import React, { useState } from 'react';
import {
  HUDConfig,
  HUDElement,
  HUDElementType,
  HUDAnchor,
  DEFAULT_HUD_CONFIG,
} from '../types/hud';
import { UIScreensEditor } from './UIScreensEditor';
import { buildUIStarterPreset } from '../lib/ui/presets';
import {
  X,
  
  Trash2,
  Eye,
  EyeOff,
  Heart,
  Coins,
  Trophy,
  Timer,
  Crosshair,
  MessageSquare,
  Sparkles,
  Layout,
  Save,
  Check,
  Gauge,
  Compass,
  Radar,
} from 'lucide-react';

interface HUDManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: HUDConfig;
  onSave: (config: HUDConfig) => void;
}

export const HUDManagerModal: React.FC<HUDManagerModalProps> = ({
  isOpen,
  onClose,
  config: initialConfig,
  onSave,
}) => {
  const [config, setConfig] = useState<HUDConfig>(() => ({
    ...initialConfig,
    elements: initialConfig?.elements ? [...initialConfig.elements] : [...DEFAULT_HUD_CONFIG.elements],
    variables: { ...initialConfig?.variables },
    screens: initialConfig?.screens ? [...initialConfig.screens] : [],
  }));

  const [activeTab, setActiveTab] = useState<'hud' | 'screens'>('hud');

  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    config.elements[0]?.id || null
  );
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  if (!isOpen) return null;

  const selectedElement = config.elements.find((el) => el.id === selectedElementId);

  const handleUpdateElement = (id: string, partial: Partial<HUDElement>) => {
    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...partial } : el)),
    }));
  };

  const handleAddElement = (type: HUDElementType) => {
    let name = 'Nouvel Élément';
    let anchor: HUDAnchor = 'top-left';
    let boundVariable = 'Score';
    let colorScheme = '#38bdf8';
    let label = 'VALEUR';

    if (type === 'health_bar') {
      name = 'Barre de Vie';
      anchor = 'top-left';
      boundVariable = 'Health';
      colorScheme = '#ef4444';
      label = 'HP';
    } else if (type === 'coin_counter') {
      name = 'Compteur de Pièces';
      anchor = 'top-right';
      boundVariable = 'Coins';
      colorScheme = '#eab308';
      label = 'Pièces';
    } else if (type === 'score_counter') {
      name = 'Score';
      anchor = 'top-center';
      boundVariable = 'Score';
      colorScheme = '#38bdf8';
      label = 'SCORE';
    } else if (type === 'timer') {
      name = 'Chronomètre';
      anchor = 'top-right';
      boundVariable = 'Timer';
      colorScheme = '#818cf8';
      label = 'TEMPS';
    } else if (type === 'crosshair') {
      name = 'Réticule de Visée';
      anchor = 'center';
      colorScheme = '#ffffff';
    } else if (type === 'message_toast') {
      name = 'Notification Message';
      anchor = 'bottom-center';
      colorScheme = '#a855f7';
      label = 'Zone de mission atteinte !';
    } else if (type === 'performance_stats') {
      name = 'Statistiques Perf (FPS)';
      anchor = 'top-right';
      boundVariable = '';
      colorScheme = '#34d399';
      label = '';
    } else if (type === 'compass') {
      name = 'Boussole Directionnelle';
      anchor = 'top-center';
      boundVariable = '';
      colorScheme = '#38bdf8';
      label = '';
    } else if (type === 'minimap') {
      name = 'Radar Minimap';
      anchor = 'bottom-right';
      boundVariable = '';
      colorScheme = '#06b6d4';
      label = '';
    }

    const newId = `hud_${type}_${Date.now()}`;
    const newElem: HUDElement = {
      id: newId,
      type,
      name,
      visible: true,
      anchor,
      offsetX: anchor.includes('right') ? -24 : anchor === 'top-center' ? 0 : 24,
      offsetY: anchor.includes('bottom') ? -24 : 24,
      boundVariable: boundVariable || undefined,
      label,
      colorScheme,
      width: type === 'health_bar' ? 200 : undefined,
      height: type === 'health_bar' ? 20 : undefined,
      maxValue: 100,
      showPercent: true,
    };

    setConfig((prev) => ({
      ...prev,
      enabled: true,
      showInEditor: true,
      elements: [...prev.elements, newElem],
    }));
    setSelectedElementId(newId);
  };

  const handleDeleteElement = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      elements: prev.elements.filter((el) => el.id !== id),
    }));
    if (selectedElementId === id) {
      setSelectedElementId(null);
    }
  };

  const handleApplyPreset = (presetName: 'platformer' | 'fps' | 'rpg' | 'minimal') => {
    if (presetName === 'platformer') {
      setConfig({
        screens: config.screens ?? [],
        enabled: true,
        showInEditor: true,
        variables: { Health: 100, Coins: 0, Score: 0, Lives: 3 },
        elements: [
          {
            id: 'hud_hp',
            type: 'health_bar',
            name: 'Barre de Vie',
            visible: true,
            anchor: 'top-left',
            offsetX: 24,
            offsetY: 24,
            width: 200,
            boundVariable: 'Health',
            label: 'HP',
            maxValue: 100,
            showPercent: true,
            colorScheme: '#ef4444',
          },
          {
            id: 'hud_coins',
            type: 'coin_counter',
            name: 'Pièces d’Or',
            visible: true,
            anchor: 'top-right',
            offsetX: -24,
            offsetY: 24,
            boundVariable: 'Coins',
            label: 'Pièces',
            colorScheme: '#eab308',
          },
          {
            id: 'hud_score',
            type: 'score_counter',
            name: 'Score Global',
            visible: true,
            anchor: 'top-center',
            offsetX: 0,
            offsetY: 20,
            boundVariable: 'Score',
            label: 'SCORE',
            colorScheme: '#38bdf8',
          },
        ],
      });
    } else if (presetName === 'fps') {
      setConfig({
        screens: config.screens ?? [],
        enabled: true,
        showInEditor: true,
        variables: { Health: 100, Ammo: 30, Score: 0 },
        elements: [
          {
            id: 'hud_cross',
            type: 'crosshair',
            name: 'Réticule FPS',
            visible: true,
            anchor: 'center',
            offsetX: 0,
            offsetY: 0,
            colorScheme: '#ffffff',
          },
          {
            id: 'hud_hp',
            type: 'health_bar',
            name: 'Santé',
            visible: true,
            anchor: 'bottom-left',
            offsetX: 24,
            offsetY: -24,
            width: 220,
            boundVariable: 'Health',
            label: 'SANTÉ',
            colorScheme: '#10b981',
          },
          {
            id: 'hud_score',
            type: 'score_counter',
            name: 'Score Éliminations',
            visible: true,
            anchor: 'top-right',
            offsetX: -24,
            offsetY: 24,
            boundVariable: 'Score',
            label: 'KILLS',
            colorScheme: '#f43f5e',
          },
        ],
      });
    } else if (presetName === 'minimal') {
      setConfig({
        screens: config.screens ?? [],
        enabled: true,
        showInEditor: true,
        variables: { Score: 0 },
        elements: [
          {
            id: 'hud_score',
            type: 'score_counter',
            name: 'Score Minimal',
            visible: true,
            anchor: 'top-right',
            offsetX: -24,
            offsetY: 24,
            boundVariable: 'Score',
            label: 'PTS',
            colorScheme: '#38bdf8',
          },
        ],
      });
    }
  };

  const handleSaveAll = () => {
    onSave(config);
    setIsSavedNotice(true);
    setTimeout(() => {
      setIsSavedNotice(false);
      onClose();
    }, 400);
  };

  return (
    // Docké à droite, sans voile ni flou : le viewport reste visible et cliquable.
    <div className="fixed top-14 bottom-0 right-0 z-50 flex p-3 pointer-events-none select-none">
      <div className="pointer-events-auto w-[min(880px,94vw)] h-full bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-16 px-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-md">
              <Layout className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Éditeur UI In-Game (WYSIWYG HUD Manager)
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 text-[10px] font-mono border border-indigo-500/30">
                  Zero-Code
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Créez et personnalisez vos barres de vie, compteurs de score et interfaces de jeu.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Preset Buttons */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl">
              <span className="text-[10px] font-mono text-zinc-500 px-2">Presets:</span>
              <button
                type="button"
                onClick={() => handleApplyPreset('platformer')}
                className="px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
              >
                Platformer
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('fps')}
                className="px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
              >
                FPS Shooter
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('minimal')}
                className="px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
              >
                Minimal
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveAll}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-medium text-xs shadow-lg shadow-sky-500/25 transition-all"
            >
              {isSavedNotice ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{isSavedNotice ? 'Enregistré !' : 'Enregistrer le HUD'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Layout : HUD classique OU écrans UI moteur (4.4) */}
        <div className="px-6 pt-3 flex items-center gap-1.5">
          {(['hud', 'screens'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${activeTab === t ? 'bg-violet-500/20 text-violet-100 border border-violet-500/40' : 'text-zinc-500 hover:text-zinc-200 border border-transparent'}`}
            >
              {t === 'hud' ? 'HUD Widgets' : `Écrans UI Moteur (${config.screens?.length ?? 0})`}
            </button>
          ))}
        </div>
        {activeTab === 'screens' ? (
          <UIScreensEditor
            screens={config.screens ?? []}
            onChange={(screens) => setConfig((prev) => ({ ...prev, screens }))}
            onStarterPreset={(kind) =>
              setConfig((prev) => ({ ...prev, screens: [...(prev.screens ?? []), buildUIStarterPreset(kind)] }))
            }
          />
        ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Elements Hierarchy & Add palette */}
          <div className="w-72 border-r border-zinc-800/80 bg-zinc-900/30 flex flex-col p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                  Éléments HUD
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {config.elements.length} actifs
                </span>
              </div>

              {/* Elements List */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {config.elements.map((el) => (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all cursor-pointer ${
                      selectedElementId === el.id
                        ? 'bg-sky-500/15 border-sky-500/40 text-white shadow-sm'
                        : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs truncate">
                      {el.type === 'health_bar' && <Heart className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      {el.type === 'coin_counter' && <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      {el.type === 'score_counter' && <Trophy className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                      {el.type === 'crosshair' && <Crosshair className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                      {el.type === 'timer' && <Timer className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                      {el.type === 'message_toast' && <MessageSquare className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                      {el.type === 'performance_stats' && <Gauge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      {el.type === 'compass' && <Compass className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                      {el.type === 'minimap' && <Radar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                      <span className="truncate font-medium">{el.name}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateElement(el.id, { visible: !el.visible });
                        }}
                        className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      >
                        {el.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-600" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteElement(el.id);
                        }}
                        className="p-1 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Add Widget Menu */}
            <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                + Ajouter un Composant
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddElement('health_bar')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                  <span>Barre de Vie</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('coin_counter')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pièces</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('score_counter')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <Trophy className="w-3.5 h-3.5 text-sky-400" />
                  <span>Score</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('crosshair')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <Crosshair className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Réticule</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('timer')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <Timer className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Chrono</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('message_toast')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                  <span>Notification</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('performance_stats')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Stats Perf</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('compass')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <Compass className="w-3.5 h-3.5 text-sky-400" />
                  <span>Boussole</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddElement('minimap')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                  <Radar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Radar Minimap</span>
                </button>
              </div>
            </div>
          </div>

          {/* Center Panel: WYSIWYG Canvas Preview */}
          <div className="flex-1 bg-zinc-950 p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-3 left-6 text-xs text-zinc-500 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Aperçu Écran de Jeu (16:9)</span>
            </div>

            {/* Virtual Screen Frame */}
            <div className="w-full max-w-2xl aspect-video rounded-2xl bg-zinc-900/80 border border-zinc-800 relative overflow-hidden shadow-2xl backdrop-blur-sm">
              {/* Background 3D placeholder grid */}
              <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#38bdf812_1px,transparent_1px),linear-gradient(to_bottom,#38bdf812_1px,transparent_1px)] bg-[size:24px_24px]" />

              {/* Render visual HUD items */}
              {config.elements.map((el) => {
                if (!el.visible) return null;
                const isSelected = selectedElementId === el.id;

                const style: React.CSSProperties = {
                  position: 'absolute',
                };
                if (el.anchor === 'top-left') {
                  style.top = `${el.offsetY * 0.75}px`;
                  style.left = `${el.offsetX * 0.75}px`;
                } else if (el.anchor === 'top-center') {
                  style.top = `${el.offsetY * 0.75}px`;
                  style.left = '50%';
                  style.transform = `translateX(-50%)`;
                } else if (el.anchor === 'top-right') {
                  style.top = `${el.offsetY * 0.75}px`;
                  style.right = `${-el.offsetX * 0.75}px`;
                } else if (el.anchor === 'bottom-left') {
                  style.bottom = `${-el.offsetY * 0.75}px`;
                  style.left = `${el.offsetX * 0.75}px`;
                } else if (el.anchor === 'bottom-center') {
                  style.bottom = `${-el.offsetY * 0.75}px`;
                  style.left = '50%';
                  style.transform = `translateX(-50%)`;
                } else if (el.anchor === 'bottom-right') {
                  style.bottom = `${-el.offsetY * 0.75}px`;
                  style.right = `${-el.offsetX * 0.75}px`;
                } else if (el.anchor === 'center') {
                  style.top = '50%';
                  style.left = '50%';
                  style.transform = 'translate(-50%, -50%)';
                }

                return (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    style={style}
                    className={`cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-zinc-950 rounded-2xl scale-105' : ''
                    }`}
                  >
                    {el.type === 'health_bar' && (
                      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-[10px]">
                        <Heart className="w-3.5 h-3.5 text-rose-500 fill-current" />
                        <div className="w-24 h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: '75%', backgroundColor: el.colorScheme || '#ef4444' }}
                          />
                        </div>
                      </div>
                    )}

                    {el.type === 'coin_counter' && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-950/80 border border-amber-500/40 text-amber-400 font-mono text-xs font-bold">
                        <Coins className="w-3 h-3" />
                        <span>12</span>
                      </div>
                    )}

                    {el.type === 'score_counter' && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-950/80 border border-sky-500/40 text-sky-400 font-mono text-xs font-bold">
                        <Trophy className="w-3 h-3" />
                        <span>{el.label || 'SCORE'}: 450</span>
                      </div>
                    )}

                    {el.type === 'crosshair' && (
                      <div className="w-4 h-4 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                      </div>
                    )}

                    {el.type === 'timer' && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-950/80 border border-zinc-800 text-indigo-300 font-mono text-xs">
                        <Timer className="w-3 h-3" />
                        <span>01:45</span>
                      </div>
                    )}

                    {el.type === 'message_toast' && (
                      <div className="px-3 py-1.5 rounded-xl bg-purple-950/80 border border-purple-500/50 text-purple-200 text-[10px]">
                        {el.label}
                      </div>
                    )}

                    {el.type === 'performance_stats' && (
                      <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-zinc-950/85 border border-zinc-800 text-[9px] font-mono text-zinc-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="font-semibold text-zinc-100">60 FPS</span>
                        <span className="w-px h-2.5 bg-zinc-700/50" />
                        <span className="text-zinc-400">12,4k tris</span>
                        <span className="w-px h-2.5 bg-zinc-700/50" />
                        <span className="text-zinc-400">48 calls</span>
                      </div>
                    )}

                    {el.type === 'compass' && (
                      <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-zinc-950/85 border border-sky-500/30 text-[9px] font-mono font-bold text-zinc-300">
                        <Compass className="w-3 h-3 text-sky-400" />
                        <span className="text-amber-400">N</span>
                        <span>45°</span>
                        <span className="text-sky-400">E</span>
                        <span className="text-sky-300">31°</span>
                      </div>
                    )}

                    {el.type === 'minimap' && (
                      <div className="w-16 h-16 rounded-2xl bg-zinc-950/90 border border-sky-500/30 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full border border-sky-500/40 relative">
                          <div className="absolute top-1/2 left-0 right-0 h-px bg-sky-500/25" />
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-sky-500/25" />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 border-x-[3px] border-x-transparent border-b-[6px] border-b-sky-400" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Selected Element Inspector */}
          <div className="w-80 border-l border-zinc-800/80 bg-zinc-900/30 p-4 space-y-4 overflow-y-auto">
            {selectedElement ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Propriétés du Widget
                  </h3>
                  <span className="text-[10px] text-sky-400 font-mono">{selectedElement.type}</span>
                </div>

                {/* Name */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Nom du composant</label>
                  <input
                    type="text"
                    value={selectedElement.name}
                    onChange={(e) => handleUpdateElement(selectedElement.id, { name: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-medium"
                  />
                </div>

                {/* Variable Binding */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Liaison Variable Globale</label>
                  <input
                    type="text"
                    value={selectedElement.boundVariable || ''}
                    onChange={(e) =>
                      handleUpdateElement(selectedElement.id, { boundVariable: e.target.value })
                    }
                    placeholder="Ex: Health, Score, Coins, Timer"
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-sky-400 font-mono focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Se synchronise automatiquement avec la logique de jeu.
                  </p>
                </div>

                {/* Anchor */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Point d’Ancrage (Anchor)</label>
                  <select
                    value={selectedElement.anchor}
                    onChange={(e) =>
                      handleUpdateElement(selectedElement.id, { anchor: e.target.value as HUDAnchor })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="top-left">Haut Gauche (Top-Left)</option>
                    <option value="top-center">Haut Centre (Top-Center)</option>
                    <option value="top-right">Haut Droite (Top-Right)</option>
                    <option value="bottom-left">Bas Gauche (Bottom-Left)</option>
                    <option value="bottom-center">Bas Centre (Bottom-Center)</option>
                    <option value="bottom-right">Bas Droite (Bottom-Right)</option>
                    <option value="center">Centre de l’Écran (Center)</option>
                  </select>
                </div>

                {/* Offsets */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-mono">Offset X (px)</label>
                    <input
                      type="number"
                      value={selectedElement.offsetX}
                      onChange={(e) =>
                        handleUpdateElement(selectedElement.id, { offsetX: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-mono">Offset Y (px)</label>
                    <input
                      type="number"
                      value={selectedElement.offsetY}
                      onChange={(e) =>
                        handleUpdateElement(selectedElement.id, { offsetY: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                </div>

                {/* Color Scheme */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Couleur d’Accent</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedElement.colorScheme || '#38bdf8'}
                      onChange={(e) =>
                        handleUpdateElement(selectedElement.id, { colorScheme: e.target.value })
                      }
                      className="w-8 h-8 rounded-xl cursor-pointer bg-transparent border-0 p-0"
                    />
                    <input
                      type="text"
                      value={selectedElement.colorScheme || '#38bdf8'}
                      onChange={(e) =>
                        handleUpdateElement(selectedElement.id, { colorScheme: e.target.value })
                      }
                      className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200 uppercase"
                    />
                  </div>
                </div>

                {/* Specific Health Bar options */}
                {selectedElement.type === 'health_bar' && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400">Valeur Maximale (Max HP)</label>
                      <input
                        type="number"
                        value={selectedElement.maxValue || 100}
                        onChange={(e) =>
                          handleUpdateElement(selectedElement.id, {
                            maxValue: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                <Sparkles className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-xs">Sélectionnez un élément pour ajuster ses propriétés</p>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
