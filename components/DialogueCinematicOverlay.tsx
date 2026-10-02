'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, FastForward, Film, Camera } from 'lucide-react';
import { SceneManager } from '../lib/SceneManager';

interface DialogueCinematicOverlayProps {
  sceneManagerRef: React.MutableRefObject<SceneManager | null>;
  isPlaying: boolean;
}

export const DialogueCinematicOverlay: React.FC<DialogueCinematicOverlayProps> = ({
  sceneManagerRef,
  isPlaying,
}) => {
  const [dialogue, setDialogue] = useState<{
    active: boolean;
    speaker: string;
    text: string;
    duration: number;
    timer: number;
  }>({
    active: false,
    speaker: '',
    text: '',
    duration: 5,
    timer: 0,
  });

  const [cinematic, setCinematic] = useState<{
    active: boolean;
    targetCameraName: string | null;
    depthOfFieldBlur: number;
  }>({
    active: false,
    targetCameraName: null,
    depthOfFieldBlur: 0,
  });

  const [displayedText, setDisplayedText] = useState<string>('');

  // Frame listener to sync state with LogicExecutor
  useEffect(() => {
    let animId: number;

    const syncState = () => {
      const sm = sceneManagerRef.current;
      const executor = sm?.logicExecutor;

      if (executor && isPlaying) {
        const dState = executor.dialogueState;
        const cState = executor.cinematicState;

        setDialogue({
          active: dState.active,
          speaker: dState.speaker || 'Narrateur',
          text: dState.text || '',
          duration: dState.duration || 5,
          timer: dState.timer || 0,
        });

        setCinematic({
          active: cState.active || dState.active,
          targetCameraName: cState.targetCameraName,
          depthOfFieldBlur: cState.depthOfFieldBlur || (dState.active ? 8 : 0),
        });
      } else {
        setDialogue((prev) => (prev.active ? { ...prev, active: false } : prev));
        setCinematic((prev) => (prev.active ? { ...prev, active: false } : prev));
      }

      animId = requestAnimationFrame(syncState);
    };

    if (isPlaying) {
      animId = requestAnimationFrame(syncState);
    }

    return () => cancelAnimationFrame(animId);
  }, [sceneManagerRef, isPlaying]);

  // Typewriter effect for dialogue text
  useEffect(() => {
    if (!dialogue.active || !dialogue.text) {
      return;
    }

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= dialogue.text.length) {
        setDisplayedText(dialogue.text.substring(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [dialogue.active, dialogue.text]);

  const handleSkip = () => {
    const sm = sceneManagerRef.current;
    if (sm?.logicExecutor) {
      sm.logicExecutor.dialogueState.active = false;
      sm.logicExecutor.dialogueState.timer = 0;
    }
  };

  const isCinematicActive = isPlaying && (cinematic.active || dialogue.active);

  return (
    <>
      {/* 1. TOP & BOTTOM CINEMA LETTERBOX BARS */}
      <div
        className={`absolute top-0 left-0 right-0 bg-black z-40 transition-all duration-700 ease-out pointer-events-none ${
          isCinematicActive ? 'h-14 opacity-100' : 'h-0 opacity-0'
        }`}
      >
        <div className="h-full px-6 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <div className="flex items-center gap-2 text-sky-400/80">
            <Film className="w-3.5 h-3.5 animate-pulse" />
            <span className="tracking-widest uppercase font-bold text-[10px]">MODE CINÉMATIQUE</span>
          </div>
          {cinematic.targetCameraName && (
            <div className="flex items-center gap-1.5 text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 text-[10px]">
              <Camera className="w-3 h-3" />
              <span>{cinematic.targetCameraName}</span>
            </div>
          )}
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 bg-black z-40 transition-all duration-700 ease-out pointer-events-none ${
          isCinematicActive ? 'h-14 opacity-100' : 'h-0 opacity-0'
        }`}
      />

      {/* 2. DEPTH OF FIELD (DOF) BACKDROP BLUR OVERLAY */}
      {isPlaying && cinematic.depthOfFieldBlur > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-10 transition-all duration-500"
          style={{
            backdropFilter: `blur(${Math.min(12, cinematic.depthOfFieldBlur / 2)}px)`,
            WebkitBackdropFilter: `blur(${Math.min(12, cinematic.depthOfFieldBlur / 2)}px)`,
          }}
        />
      )}

      {/* 3. DIALOGUE BANNER & SUBTITLES */}
      {isPlaying && dialogue.active && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="relative p-4 rounded-2xl bg-zinc-950/90 border border-sky-500/30 shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-zinc-100 flex flex-col gap-2.5">
            {/* Header: Speaker Name & Actions */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-sky-400 to-amber-300 bg-clip-text text-transparent">
                  {dialogue.speaker}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSkip}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-[10px] text-zinc-300 hover:text-white transition-all shadow-sm"
              >
                <span>Passer</span>
                <FastForward className="w-3 h-3 text-sky-400" />
              </button>
            </div>

            {/* Subtitle Body */}
            <div className="min-h-[2.5rem] flex items-center text-xs md:text-sm leading-relaxed text-zinc-200 font-medium pl-1">
              <p>
                {displayedText}
                <span className="inline-block w-1.5 h-4 ml-1 bg-sky-400 animate-pulse align-middle" />
              </p>
            </div>

            {/* Progress Bar Timer */}
            {dialogue.duration > 0 && (
              <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden mt-1">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-amber-400 transition-all ease-linear"
                  style={{
                    width: `${Math.max(0, Math.min(100, (dialogue.timer / dialogue.duration) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
