'use client';

import React from 'react';
import { Camera, Video, VideoOff, Crosshair, RotateCcw } from 'lucide-react';
import { FOLLOW_LIMITS, type CameraFollowConfig } from '../../lib/core/cameraFollow';
import { SliderRow } from './fields';
import type { SceneNode } from '../../types/engine';

/**
 * CameraFollowInspector — assignation d'une caméra à l'objet sélectionné.
 *
 * Le geste demandé par l'utilisateur est « je sélectionne l'objet dans la
 * scène, la caméra le suit ». Ce panneau porte donc le bouton d'assignation
 * (et sa libération) ; les réglages n'apparaissent qu'une fois la caméra
 * assignée, pour ne pas noyer l'inspecteur d'options inertes.
 */

export interface CameraFollowInspectorProps {
  node: SceneNode;
  /** UUID de l'objet actuellement suivi (null = caméra libre). */
  followTargetId: string | null;
  config: CameraFollowConfig;
  onAssign: () => void;
  onClear: () => void;
  onFrame: () => void;
  onConfigChange: (patch: Partial<CameraFollowConfig>) => void;
}

export function CameraFollowInspector({
  node,
  followTargetId,
  config,
  onAssign,
  onClear,
  onFrame,
  onConfigChange,
}: CameraFollowInspectorProps) {
  // La multi-sélection n'a pas de sens ici : une caméra, une cible.
  const isThis = followTargetId === node.id;
  const isFollowingOther = followTargetId !== null && !isThis;

  return (
    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-2.5 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Camera className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-[11px] font-semibold text-zinc-200">Caméra de suivi</span>
        {isThis && (
          <span className="ml-auto px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[9px] font-mono uppercase text-sky-300 font-semibold">
            Active
          </span>
        )}
      </div>

      {isFollowingOther ? (
        <p className="text-[10px] text-amber-300/90 leading-relaxed">
          Une autre cible est suivie. Libérez-la avant d&apos;assigner celle-ci.
        </p>
      ) : (
        <button
          type="button"
          onClick={isThis ? onClear : onAssign}
          className={`w-full py-1.5 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all border ${
            isThis
              ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-rose-950/40 hover:border-rose-800/60 hover:text-rose-300'
              : 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-300'
          }`}
        >
          {isThis ? (
            <>
              <VideoOff className="w-3.5 h-3.5" />
              <span>Libérer la caméra</span>
            </>
          ) : (
            <>
              <Video className="w-3.5 h-3.5" />
              <span>Suivre cet objet</span>
            </>
          )}
        </button>
      )}

      {isThis && (
        <>
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={onFrame}
              className="flex-1 py-1 px-2 rounded-lg text-[10px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors flex items-center justify-center gap-1.5"
              title="Recentre la caméra sur cet objet (garde l'orientation courante)"
            >
              <Crosshair className="w-3 h-3" />
              Cadrer
            </button>
            <button
              type="button"
              onClick={() => onConfigChange({ followRotation: !config.followRotation })}
              className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
                config.followRotation
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
              title="En Play : place la caméra derrière l'orientation de l'objet"
            >
              <RotateCcw className="w-3 h-3" />
              {config.followRotation ? 'Derrière' : 'Fixe'}
            </button>
          </div>

          <SliderRow
            label="Distance"
            display={`${config.distance.toFixed(1)} m`}
            value={config.distance}
            min={FOLLOW_LIMITS.distance.min}
            max={FOLLOW_LIMITS.distance.max}
            step={FOLLOW_LIMITS.distance.step}
            onChange={(distance) => onConfigChange({ distance })}
          />

          <SliderRow
            label="Hauteur"
            display={`${config.height.toFixed(1)} m`}
            value={config.height}
            min={FOLLOW_LIMITS.height.min}
            max={FOLLOW_LIMITS.height.max}
            step={FOLLOW_LIMITS.height.step}
            accent="accent-emerald-500"
            onChange={(height) => onConfigChange({ height })}
          />

          <SliderRow
            label="Décalage latéral"
            display={`${config.offsetX.toFixed(1)} m`}
            value={config.offsetX}
            min={FOLLOW_LIMITS.offsetX.min}
            max={FOLLOW_LIMITS.offsetX.max}
            step={FOLLOW_LIMITS.offsetX.step}
            accent="accent-blue-500"
            onChange={(offsetX) => onConfigChange({ offsetX })}
          />

          <SliderRow
            label="Hauteur visée"
            display={`${config.lookAtHeight.toFixed(1)} m`}
            value={config.lookAtHeight}
            min={FOLLOW_LIMITS.lookAtHeight.min}
            max={FOLLOW_LIMITS.lookAtHeight.max}
            step={FOLLOW_LIMITS.lookAtHeight.step}
            accent="accent-violet-500"
            onChange={(lookAtHeight) => onConfigChange({ lookAtHeight })}
          />

          <SliderRow
            label="Lissage"
            display={`${config.smoothing.toFixed(1)}`}
            value={config.smoothing}
            min={FOLLOW_LIMITS.smoothing.min}
            max={FOLLOW_LIMITS.smoothing.max}
            step={FOLLOW_LIMITS.smoothing.step}
            accent="accent-amber-500"
            onChange={(smoothing) => onConfigChange({ smoothing })}
          />

          <p className="text-[10px] text-zinc-500 leading-relaxed">
            En édition, la caméra orbite librement autour de l&apos;objet. En Play, elle se
            place à ces réglages derrière l&apos;objet.
          </p>
        </>
      )}
    </div>
  );
}
