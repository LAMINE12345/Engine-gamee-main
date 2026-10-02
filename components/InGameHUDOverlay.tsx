'use client';

import React, { useState, useEffect } from 'react';
import { HUDConfig, HUDElement } from '../types/hud';
import { EngineStats } from '../types/engine';
import { SceneManager } from '../lib/SceneManager';
import { CompassStrip, RadarMinimap } from './MiniMapRadarHUD';
import { Coins, Heart, Trophy, Timer, Play, RotateCcw } from 'lucide-react';

interface InGameHUDOverlayProps {
  config: HUDConfig;
  isPlaying: boolean;
  /** Stats moteur (FPS / tris / draw calls) pour le widget `performance_stats`. */
  stats?: EngineStats;
  /** Source des données 3D pour la boussole et le radar. */
  sceneManagerRef?: React.MutableRefObject<SceneManager | null>;
  onRestart?: () => void;
  onResume?: () => void;
}

export const InGameHUDOverlay: React.FC<InGameHUDOverlayProps> = ({
  config,
  isPlaying,
  stats,
  sceneManagerRef,
  onRestart,
  onResume,
}) => {
  const [variables, setVariables] = useState<Record<string, number | string | boolean>>(
    config.variables || {}
  );
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Poll / Sync global variables from window or config
  useEffect(() => {
    const handleVarUpdate = (e: CustomEvent) => {
      if (e.detail) {
        setVariables((prev) => ({ ...prev, ...e.detail }));
      }
    };

    const handleToast = (e: CustomEvent<{ message: string; duration?: number }>) => {
      if (e.detail?.message) {
        setToastMessage(e.detail.message);
        setTimeout(() => setToastMessage(null), e.detail.duration || 3500);
      }
    };

    window.addEventListener('aether_update_var' as any, handleVarUpdate as any);
    window.addEventListener('aether_show_toast' as any, handleToast as any);

    return () => {
      window.removeEventListener('aether_update_var' as any, handleVarUpdate as any);
      window.removeEventListener('aether_show_toast' as any, handleToast as any);
    };
  }, []);

  // Handle Escape key for Pause Menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPlaying) {
        setIsPauseMenuOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  if (!config.enabled) return null;

  const renderElement = (el: HUDElement) => {
    if (!el.visible) return null;

    // Anchor positioning style
    const style: React.CSSProperties = {
      position: 'absolute',
    };

    switch (el.anchor) {
      case 'top-left':
        style.top = `${el.offsetY}px`;
        style.left = `${el.offsetX}px`;
        break;
      case 'top-center':
        style.top = `${el.offsetY}px`;
        style.left = '50%';
        style.transform = `translateX(-50%) translateX(${el.offsetX}px)`;
        break;
      case 'top-right':
        style.top = `${el.offsetY}px`;
        style.right = `${-el.offsetX}px`;
        break;
      case 'bottom-left':
        style.bottom = `${-el.offsetY}px`;
        style.left = `${el.offsetX}px`;
        break;
      case 'bottom-center':
        style.bottom = `${-el.offsetY}px`;
        style.left = '50%';
        style.transform = `translateX(-50%) translateX(${el.offsetX}px)`;
        break;
      case 'bottom-right':
        style.bottom = `${-el.offsetY}px`;
        style.right = `${-el.offsetX}px`;
        break;
      case 'center':
        style.top = '50%';
        style.left = '50%';
        style.transform = `translate(-50%, -50%) translate(${el.offsetX}px, ${el.offsetY}px)`;
        break;
    }

    const boundVal = el.boundVariable ? variables[el.boundVariable] : undefined;

    switch (el.type) {
      case 'health_bar': {
        const hp = typeof boundVal === 'number' ? boundVal : Number(variables['Health'] ?? 100);
        const maxHp = el.maxValue || 100;
        const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));

        return (
          <div
            key={el.id}
            style={style}
            className="flex items-center gap-2.5 p-2 rounded-2xl bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 shadow-2xl pointer-events-none select-none"
          >
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{ backgroundColor: el.colorScheme || '#ef4444' }}
            >
              <Heart className="w-4 h-4 fill-current" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
                <span>{el.label || 'HEALTH'}</span>
                {el.showPercent && <span>{Math.round(hp)} / {maxHp}</span>}
              </div>
              <div
                className="h-3 rounded-full bg-zinc-800/90 overflow-hidden p-0.5 border border-zinc-700/50"
                style={{ width: `${el.width || 180}px` }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300 shadow-sm"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: el.colorScheme || '#ef4444',
                  }}
                />
              </div>
            </div>
          </div>
        );
      }

      case 'coin_counter': {
        const coins = typeof boundVal === 'number' ? boundVal : Number(variables['Coins'] ?? 0);
        return (
          <div
            key={el.id}
            style={style}
            className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-zinc-950/80 backdrop-blur-md border border-amber-500/30 shadow-2xl text-amber-300 font-mono font-bold text-sm pointer-events-none select-none"
          >
            <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Coins className="w-3.5 h-3.5" />
            </div>
            <span>{coins}</span>
          </div>
        );
      }

      case 'score_counter': {
        const score = typeof boundVal === 'number' ? boundVal : Number(variables['Score'] ?? 0);
        return (
          <div
            key={el.id}
            style={style}
            className="flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-zinc-950/80 backdrop-blur-md border border-sky-500/30 shadow-2xl text-sky-300 font-mono font-bold text-sm pointer-events-none select-none"
          >
            <Trophy className="w-4 h-4 text-sky-400" />
            <span className="text-[10px] text-zinc-400 tracking-wider uppercase">{el.label || 'SCORE'}</span>
            <span className="text-base text-white">{score}</span>
          </div>
        );
      }

      case 'crosshair': {
        return (
          <div key={el.id} style={style} className="pointer-events-none select-none opacity-80">
            <div className="relative w-6 h-6 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-white/70" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-white/70" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-0.5 bg-white/70" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-0.5 bg-white/70" />
            </div>
          </div>
        );
      }

      case 'timer': {
        const timeSec = typeof boundVal === 'number' ? boundVal : Number(variables['Timer'] ?? 0);
        const mins = Math.floor(timeSec / 60);
        const secs = Math.floor(timeSec % 60);
        const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        return (
          <div
            key={el.id}
            style={style}
            className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-zinc-950/80 backdrop-blur-md border border-zinc-800 shadow-2xl text-zinc-200 font-mono text-xs pointer-events-none select-none"
          >
            <Timer className="w-3.5 h-3.5 text-indigo-400" />
            <span>{formatted}</span>
          </div>
        );
      }

      case 'performance_stats': {
        if (!stats) return null;
        return (
          <div
            key={el.id}
            style={style}
            className="flex items-center gap-3 px-3 py-1.5 rounded-2xl bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 shadow-2xl text-[11px] font-mono text-zinc-300 select-none"
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  stats.fps >= 50
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                    : stats.fps >= 30
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
              />
              <span className="font-semibold text-zinc-100">{stats.fps} FPS</span>
            </div>
            <span className="w-px h-3 bg-zinc-700/50" />
            <div className="flex items-center gap-1 text-zinc-400">
              <span>{stats.triangles.toLocaleString()}</span>
              <span className="text-zinc-500">tris</span>
            </div>
            <span className="w-px h-3 bg-zinc-700/50" />
            <div className="flex items-center gap-1 text-zinc-400">
              <span>{stats.drawCalls}</span>
              <span className="text-zinc-500">calls</span>
            </div>
          </div>
        );
      }

      case 'compass': {
        if (!sceneManagerRef) return null;
        return (
          <div key={el.id} style={style} className="pointer-events-none">
            <CompassStrip sceneManagerRef={sceneManagerRef} />
          </div>
        );
      }

      case 'minimap': {
        if (!sceneManagerRef) return null;
        return (
          <div key={el.id} style={style} className="pointer-events-auto">
            <RadarMinimap sceneManagerRef={sceneManagerRef} />
          </div>
        );
      }

      case 'message_toast': {
        const text = toastMessage || el.label;
        if (!text) return null;

        return (
          <div
            key={el.id}
            style={style}
            className="px-4 py-2 rounded-2xl bg-zinc-950/90 backdrop-blur-xl border border-indigo-500/40 text-xs font-medium text-white shadow-[0_0_25px_rgba(99,102,241,0.25)] pointer-events-none animate-bounce select-none"
          >
            {text}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {/* HUD Elements */}
      {config.elements.map(renderElement)}

      {/* Pause Menu Modal overlay when Escape pressed */}
      {isPauseMenuOpen && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto flex items-center justify-center z-50">
          <div className="w-80 p-6 rounded-3xl bg-zinc-950 border border-zinc-800 shadow-2xl text-center space-y-4">
            <h2 className="text-xl font-bold text-white tracking-tight">Partie en Pause</h2>
            <p className="text-xs text-zinc-400">
              Appuyez sur Reprendre ou Échap pour continuer votre exploration.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsPauseMenuOpen(false);
                  if (onResume) onResume();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-medium text-xs shadow-lg shadow-sky-500/25 transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Reprendre</span>
              </button>

              {onRestart && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setIsPauseMenuOpen(false);
                    onRestart();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-xs transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Recommencer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
