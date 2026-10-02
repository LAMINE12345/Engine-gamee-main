/**
 * FloatingDamageHUD.tsx
 * Renders player health bar, inventory items, and floating damage numbers (-25 HP) in real-time during simulation.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Heart, Key } from 'lucide-react';
import { SceneManager } from '../lib/SceneManager';

interface FloatingDamageHUDProps {
  sceneManagerRef: React.MutableRefObject<SceneManager | null>;
  isPlaying: boolean;
}

export const FloatingDamageHUD: React.FC<FloatingDamageHUDProps> = ({
  sceneManagerRef,
  isPlaying,
}) => {
  const [health, setHealth] = useState<number>(100);
  const [inventory, setInventory] = useState<string[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<
    Array<{ id: string; text: string; x: number; y: number; z: number; color: string }>
  >([]);

  useEffect(() => {
    let animId: number;

    const syncHUD = () => {
      const sm = sceneManagerRef.current;
      const executor = sm?.logicExecutor;

      if (executor && isPlaying) {
        setHealth(executor.globalState.health ?? 100);
        setInventory([...(executor.globalState.inventory || [])]);
        setFloatingTexts(
          (executor.floatingTexts || []).map((ft) => ({
            id: ft.id,
            text: ft.text,
            x: ft.x,
            y: ft.y,
            z: ft.z,
            color: ft.color,
          }))
        );
      } else {
        setHealth(100);
        setInventory([]);
        setFloatingTexts([]);
      }

      animId = requestAnimationFrame(syncHUD);
    };

    if (isPlaying) {
      animId = requestAnimationFrame(syncHUD);
    }

    return () => cancelAnimationFrame(animId);
  }, [sceneManagerRef, isPlaying]);

  if (!isPlaying) return null;

  return (
    <>
      {/* 1. PLAYER HEALTH & INVENTORY HUD (Top Left) */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-4 bg-zinc-950/80 border border-zinc-800/80 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl text-zinc-100 select-none">
        {/* Health Bar */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <Heart className="w-4 h-4 fill-rose-500/30 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
              <span>SANTÉ</span>
              <span className="text-rose-400 font-mono">{health} / 100</span>
            </div>
            <div className="w-28 h-2 rounded-full bg-zinc-800 overflow-hidden mt-1">
              <div
                className="h-full bg-gradient-to-r from-rose-600 to-amber-500 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, health))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Inventory Keys / Items */}
        <div className="h-6 w-[1px] bg-zinc-800 mx-1" />
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" />
          <div className="flex items-center gap-1.5">
            {inventory.length === 0 ? (
              <span className="text-[11px] text-zinc-500 italic">Inventaire vide</span>
            ) : (
              inventory.map((item, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-medium text-amber-300"
                >
                  {item}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 2. FLOATING DAMAGE TEXTS */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {floatingTexts.map((ft) => {
          // Project 3D world position to 2D screen coordinates if possible, or render centered
          return (
            <div
              key={ft.id}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-rose-500 font-extrabold text-lg md:text-xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-50 duration-300"
              style={{
                transform: `translate(-50%, -80px)`,
              }}
            >
              <span className="bg-zinc-950/90 px-3 py-1 rounded-xl border border-rose-500/40 shadow-xl">
                {ft.text}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
};
