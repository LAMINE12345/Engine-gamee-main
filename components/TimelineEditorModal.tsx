'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  
  Move,
  RotateCw,
  Maximize2,
  Clock,
  Sparkles,
  Repeat,
  ArrowLeftRight,
  Film,
  
  
  
  
} from 'lucide-react';
import { SceneNode } from '../types/engine';
import { AnimationTrack, KeyframeData, EasingFunctionType } from '../types/animation';
import { AnimationManager } from '../lib/animation/AnimationManager';

import { SceneManager } from '../lib/SceneManager';

interface TimelineEditorModalProps {
  isOpen: boolean;
  selectedNode: SceneNode | null;
  sceneManagerRef: React.MutableRefObject<SceneManager | null>;
  onClose: () => void;
}

export const TimelineEditorModal: React.FC<TimelineEditorModalProps> = ({
  isOpen,
  selectedNode,
  sceneManagerRef,
  onClose,
}) => {
  const [activeTrack, setActiveTrack] = useState<AnimationTrack | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed] = useState<number>(1.0);
  const [, setTrackName] = useState<string>('');

  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Load tracks for selected object on modal open or node change
  useEffect(() => {
    if (!isOpen || !selectedNode) return;

    const am = sceneManagerRef.current?.animationManager;
    if (!am) return;

    const tracks = am.getTracksForObject(selectedNode.id);
    if (tracks.length > 0) {
      const track = tracks[0];
      setActiveTrack(track);
      setTrackName(track.name);
      if (track.keyframes.length > 0) {
        setSelectedKeyframeId(track.keyframes[0].id);
      }
    } else {
      if (!selectedNode) return;
      const newTrack: AnimationTrack = {
        id: `track_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `${selectedNode.name}_Trajectoire`,
        targetNodeId: selectedNode.id,
        duration: 4.0,
        loop: true,
        pingPong: false,
        autoplay: true,
        keyframes: [
          {
            id: `kf_${Date.now()}_1`,
            time: 0.0,
            position: { ...selectedNode.transform.position },
            rotation: { ...selectedNode.transform.rotation },
            scale: { ...selectedNode.transform.scale },
            easing: 'easeInOut',
          },
          {
            id: `kf_${Date.now()}_2`,
            time: 2.0,
            position: {
              x: selectedNode.transform.position.x + 3,
              y: selectedNode.transform.position.y + 1,
              z: selectedNode.transform.position.z,
            },
            rotation: { ...selectedNode.transform.rotation },
            scale: { ...selectedNode.transform.scale },
            easing: 'easeInOut',
          },
          {
            id: `kf_${Date.now()}_3`,
            time: 4.0,
            position: { ...selectedNode.transform.position },
            rotation: { ...selectedNode.transform.rotation },
            scale: { ...selectedNode.transform.scale },
            easing: 'easeInOut',
          },
        ],
      };

      am.addTrack(newTrack);
      setActiveTrack(newTrack);
      setTrackName(newTrack.name);
      if (newTrack.keyframes.length > 0) {
        setSelectedKeyframeId(newTrack.keyframes[0].id);
      }
      setCurrentTime(0);
    }
  }, [isOpen, selectedNode, sceneManagerRef]);

  // Animation preview loop inside timeline editor
  useEffect(() => {
    const am = sceneManagerRef.current?.animationManager;
    if (!isPlaying || !activeTrack || !am || !selectedNode) return;

    lastTimeRef.current = performance.now();

    const loop = () => {
      const now = performance.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentTime((prevTime) => {
        let newTime = prevTime + dt * playbackSpeed;
        if (newTime >= activeTrack.duration) {
          if (activeTrack.loop) {
            newTime = 0;
          } else {
            newTime = activeTrack.duration;
            setIsPlaying(false);
          }
        }

        // Seek animation manager to reflect preview in 3D viewport
        am.seekTrack(activeTrack.id, newTime);
        return newTime;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, activeTrack, playbackSpeed, selectedNode, sceneManagerRef]);

  if (!isOpen || !selectedNode) return null;

  const handleApplyPreset = (
    presetType: 'slideDoor' | 'elevator' | 'movingPlatform' | 'swing' | 'cameraTravel'
  ) => {
    const am = sceneManagerRef.current?.animationManager;
    if (!selectedNode || !am) return;
    const track = AnimationManager.createPresetTrack(
      presetType,
      selectedNode.id,
      selectedNode.transform.position
    );

    am.addTrack(track);
    setActiveTrack(track);
    setTrackName(track.name);
    if (track.keyframes.length > 0) {
      setSelectedKeyframeId(track.keyframes[0].id);
    }
    setCurrentTime(0);
  };

  const handleCaptureCurrentTransform = () => {
    const am = sceneManagerRef.current?.animationManager;
    if (!activeTrack || !selectedNode || !am) return;

    // Check if keyframe exists at close timestamp (<= 0.1s tolerance)
    const existingIndex = activeTrack.keyframes.findIndex(
      (kf) => Math.abs(kf.time - currentTime) < 0.1
    );

    const updatedKeyframes = [...activeTrack.keyframes];

    if (existingIndex >= 0) {
      // Overwrite existing keyframe
      updatedKeyframes[existingIndex] = {
        ...updatedKeyframes[existingIndex],
        position: { ...selectedNode.transform.position },
        rotation: { ...selectedNode.transform.rotation },
        scale: { ...selectedNode.transform.scale },
      };
      setSelectedKeyframeId(updatedKeyframes[existingIndex].id);
    } else {
      // Add new keyframe
      const newKf: KeyframeData = {
        id: `kf_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        time: parseFloat(currentTime.toFixed(2)),
        position: { ...selectedNode.transform.position },
        rotation: { ...selectedNode.transform.rotation },
        scale: { ...selectedNode.transform.scale },
        easing: 'easeInOut',
      };
      updatedKeyframes.push(newKf);
      updatedKeyframes.sort((a, b) => a.time - b.time);
      setSelectedKeyframeId(newKf.id);
    }

    const updatedTrack = {
      ...activeTrack,
      keyframes: updatedKeyframes,
    };

    am.addTrack(updatedTrack);
    setActiveTrack(updatedTrack);
  };

  const handleDeleteKeyframe = (kfId: string) => {
    const am = sceneManagerRef.current?.animationManager;
    if (!activeTrack || !am) return;
    if (activeTrack.keyframes.length <= 1) return; // Keep at least 1 keyframe

    const updatedKeyframes = activeTrack.keyframes.filter((kf) => kf.id !== kfId);
    const updatedTrack = {
      ...activeTrack,
      keyframes: updatedKeyframes,
    };

    am.addTrack(updatedTrack);
    setActiveTrack(updatedTrack);
    if (selectedKeyframeId === kfId) {
      setSelectedKeyframeId(updatedKeyframes[0].id);
    }
  };

  const handleUpdateKeyframeField = (
    kfId: string,
    updates: Partial<KeyframeData>
  ) => {
    const am = sceneManagerRef.current?.animationManager;
    if (!activeTrack || !am) return;

    const updatedKeyframes = activeTrack.keyframes.map((kf) => {
      if (kf.id === kfId) {
        return { ...kf, ...updates };
      }
      return kf;
    });

    updatedKeyframes.sort((a, b) => a.time - b.time);

    const updatedTrack = {
      ...activeTrack,
      keyframes: updatedKeyframes,
    };

    am.addTrack(updatedTrack);
    setActiveTrack(updatedTrack);
  };

  const selectedKeyframe = activeTrack?.keyframes.find(
    (kf) => kf.id === selectedKeyframeId
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pointer-events-auto flex justify-center">
      <div className="w-full max-w-5xl rounded-2xl bg-zinc-950/95 border border-zinc-800/90 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col text-zinc-100 animate-in slide-in-from-bottom duration-300">
        {/* Header Bar */}
        <div className="px-5 py-3 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-white">
                  Éditeur de Trajectoire & Keyframes
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  {selectedNode.name}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Créez des déplacements fluides, des cinématiques et des ouvertures automatiques.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preset Selector Bar */}
        <div className="px-5 py-2.5 bg-zinc-900/40 border-b border-zinc-800/60 flex items-center justify-between gap-2 overflow-x-auto text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Presets Rapides :</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            <button
              type="button"
              onClick={() => handleApplyPreset('slideDoor')}
              className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all text-left flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>🚪 Porte Coulissante</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('elevator')}
              className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all text-left flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>🛗 Ascenseur Vertical</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('movingPlatform')}
              className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all text-left flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>🛹 Plateforme Mouvante</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('swing')}
              className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all text-left flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>🎡 Balançoire</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('cameraTravel')}
              className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all text-left flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>🎥 Cinématique Caméra</span>
            </button>
          </div>
        </div>

        {/* Timeline Control Toolbar */}
        <div className="px-5 py-3 border-b border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between gap-4">
          {/* Transport Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded-xl border font-medium text-xs flex items-center gap-1.5 transition-all ${
                isPlaying
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30 shadow-lg shadow-sky-500/10'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-amber-300" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-sky-300" />
                  <span>Lecture</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentTime(0);
                setIsPlaying(false);
                const am = sceneManagerRef.current?.animationManager;
                if (activeTrack && am) {
                  am.seekTrack(activeTrack.id, 0);
                }
              }}
              className="p-2 rounded-xl bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
              title="Retour au début (0s)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Time display */}
            <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 font-mono text-xs text-sky-400 font-medium">
              {currentTime.toFixed(2)}s / {activeTrack?.duration.toFixed(2) || '4.00'}s
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCaptureCurrentTransform}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/10"
              title="Enregistre la position actuelle de l'objet 3D comme point de passage à ce timestamp"
            >
              <Plus className="w-4 h-4" />
              <span>Capturer Position Actuelle</span>
            </button>

            {/* Loop Toggles */}
            {activeTrack && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const am = sceneManagerRef.current?.animationManager;
                    const updated = { ...activeTrack, loop: !activeTrack.loop };
                    setActiveTrack(updated);
                    am?.addTrack(updated);
                  }}
                  className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                    activeTrack.loop
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="Boucle infinie"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>Boucle</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const am = sceneManagerRef.current?.animationManager;
                    const updated = { ...activeTrack, pingPong: !activeTrack.pingPong };
                    setActiveTrack(updated);
                    am?.addTrack(updated);
                  }}
                  className={`px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                    activeTrack.pingPong
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="Aller-Retour (Ping-Pong)"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Ping-Pong</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Timeline Canvas & Keyframe Track View */}
        <div className="p-5 bg-zinc-950 flex flex-col gap-4">
          {/* Time Ruler & Scrub Track */}
          <div className="relative w-full h-20 rounded-xl bg-zinc-900/90 border border-zinc-800/80 p-3 select-none flex flex-col justify-between">
            {/* Time Ticks */}
            <div className="relative w-full h-4 border-b border-zinc-800 text-[10px] font-mono text-zinc-500 flex justify-between px-2">
              <span>0.0s</span>
              <span>1.0s</span>
              <span>2.0s</span>
              <span>3.0s</span>
              <span>4.0s</span>
              <span>5.0s</span>
            </div>

            {/* Clickable Track Bar */}
            <div
              className="relative w-full h-8 bg-zinc-950/80 rounded-lg border border-zinc-800/60 cursor-pointer overflow-hidden flex items-center"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                const targetTime = ratio * (activeTrack?.duration || 4.0);
                setCurrentTime(targetTime);
                const am = sceneManagerRef.current?.animationManager;
                if (activeTrack && am) {
                  am.seekTrack(activeTrack.id, targetTime);
                }
              }}
            >
              {/* Animated Progress Fill */}
              <div
                className="absolute inset-y-0 left-0 bg-sky-500/15 border-r border-sky-500/30 pointer-events-none"
                style={{
                  width: `${((currentTime / (activeTrack?.duration || 4.0)) * 100).toFixed(2)}%`,
                }}
              />

              {/* Keyframe Markers */}
              {activeTrack?.keyframes.map((kf) => {
                const percent = (kf.time / activeTrack.duration) * 100;
                const isSelected = kf.id === selectedKeyframeId;

                return (
                  <button
                    key={kf.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedKeyframeId(kf.id);
                      setCurrentTime(kf.time);
                      const am = sceneManagerRef.current?.animationManager;
                      if (am) {
                        am.seekTrack(activeTrack.id, kf.time);
                      }
                    }}
                    className={`absolute -translate-x-1/2 top-1/2 -translate-y-1/2 w-4 h-4 rotate-45 border-2 transition-transform hover:scale-125 z-10 ${
                      isSelected
                        ? 'bg-amber-400 border-white shadow-lg shadow-amber-400/50 scale-125'
                        : 'bg-sky-500 border-sky-300 shadow-md shadow-sky-500/30'
                    }`}
                    style={{ left: `${percent}%` }}
                    title={`Keyframe à ${kf.time}s - Courbe: ${kf.easing}`}
                  />
                );
              })}

              {/* Playhead Cursor */}
              <div
                className="absolute inset-y-0 -translate-x-1/2 w-0.5 bg-rose-500 z-20 pointer-events-none flex flex-col items-center"
                style={{
                  left: `${((currentTime / (activeTrack?.duration || 4.0)) * 100).toFixed(2)}%`,
                }}
              >
                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full -mt-1 shadow-md shadow-rose-500/50" />
              </div>
            </div>
          </div>

          {/* Selected Keyframe Detail Inspector */}
          {selectedKeyframe && (
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-amber-400 rotate-45 rounded-xs" />
                  <span className="text-xs font-semibold text-zinc-200">
                    Propriétés du Point de Passage (Keyframe)
                  </span>
                  <span className="text-[11px] font-mono text-amber-300">
                    @{selectedKeyframe.time.toFixed(2)}s
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteKeyframe(selectedKeyframe.id)}
                  className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer</span>
                </button>
              </div>

              {/* Inspector Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                {/* Time & Easing */}
                <div className="flex flex-col gap-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
                  <label className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    <span>Temps (s) & Courbe d&apos;Accélération</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={activeTrack?.duration || 10}
                      value={selectedKeyframe.time}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          time: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-20 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-sky-300 font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                    <select
                      value={selectedKeyframe.easing}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          easing: e.target.value as EasingFunctionType,
                        })
                      }
                      className="flex-1 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="linear">Lineaire (Constant)</option>
                      <option value="easeIn">Ease-In (Départ doux)</option>
                      <option value="easeOut">Ease-Out (Arrivée douce)</option>
                      <option value="easeInOut">Ease-In-Out (Fluide Pro)</option>
                      <option value="bounce">Bounce (Rebond)</option>
                      <option value="elastic">Elastic (Ressort)</option>
                    </select>
                  </div>
                </div>

                {/* Position X, Y, Z */}
                <div className="flex flex-col gap-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
                  <label className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                    <Move className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Position (X, Y, Z)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
                    <input
                      type="number"
                      step="0.5"
                      value={selectedKeyframe.position.x}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          position: {
                            ...selectedKeyframe.position,
                            x: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-emerald-400 text-center"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={selectedKeyframe.position.y}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          position: {
                            ...selectedKeyframe.position,
                            y: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-emerald-400 text-center"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={selectedKeyframe.position.z}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          position: {
                            ...selectedKeyframe.position,
                            z: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-emerald-400 text-center"
                    />
                  </div>
                </div>

                {/* Rotation X, Y, Z */}
                <div className="flex flex-col gap-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
                  <label className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rotation (X, Y, Z °)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
                    <input
                      type="number"
                      step="15"
                      value={selectedKeyframe.rotation.x}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          rotation: {
                            ...selectedKeyframe.rotation,
                            x: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-amber-400 text-center"
                    />
                    <input
                      type="number"
                      step="15"
                      value={selectedKeyframe.rotation.y}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          rotation: {
                            ...selectedKeyframe.rotation,
                            y: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-amber-400 text-center"
                    />
                    <input
                      type="number"
                      step="15"
                      value={selectedKeyframe.rotation.z}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          rotation: {
                            ...selectedKeyframe.rotation,
                            z: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-amber-400 text-center"
                    />
                  </div>
                </div>

                {/* Scale X, Y, Z */}
                <div className="flex flex-col gap-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60">
                  <label className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Échelle (Scale X, Y, Z)</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
                    <input
                      type="number"
                      step="0.2"
                      value={selectedKeyframe.scale.x}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          scale: {
                            ...selectedKeyframe.scale,
                            x: parseFloat(e.target.value) || 1,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-purple-400 text-center"
                    />
                    <input
                      type="number"
                      step="0.2"
                      value={selectedKeyframe.scale.y}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          scale: {
                            ...selectedKeyframe.scale,
                            y: parseFloat(e.target.value) || 1,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-purple-400 text-center"
                    />
                    <input
                      type="number"
                      step="0.2"
                      value={selectedKeyframe.scale.z}
                      onChange={(e) =>
                        handleUpdateKeyframeField(selectedKeyframe.id, {
                          scale: {
                            ...selectedKeyframe.scale,
                            z: parseFloat(e.target.value) || 1,
                          },
                        })
                      }
                      className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-purple-400 text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
