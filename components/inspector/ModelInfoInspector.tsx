'use client';

import React from 'react';
import { FileCode2, ArrowDownToLine } from 'lucide-react';
import { SectionProps, firstNode, copyText } from './types';
import { fireComponentMenu } from './ComponentContextMenu';

/** Bandeau télémétrie des assets 3D importés (sommets / triangles / meshes). */
export function ModelInfoInspector({ nodes, onSnapToGround }: SectionProps) {
  const node = firstNode(nodes);
  const modelInfo = node.modelInfo;
  if (!modelInfo) return null;
  return (
    <div
      className="p-3 rounded-2xl bg-gradient-to-br from-indigo-950/40 to-sky-950/30 border border-indigo-800/40 space-y-2"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'Asset 3D', [
          {
            label: 'Copier les infos',
            hint: 'JSON',
            onClick: () => copyText(JSON.stringify(modelInfo, null, 2)),
          },
        ]);
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300 uppercase tracking-wider">
          <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Asset 3D ({modelInfo.format.toUpperCase()})</span>
        </div>
        <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900/80 px-2 py-0.5 rounded">
          {modelInfo.fileSize}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-indigo-900/30 text-center font-mono">
        <div className="p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/50">
          <div className="text-[10px] text-zinc-500">Sommets</div>
          <div className="text-[11px] font-bold text-sky-400">
            {modelInfo.vertexCount.toLocaleString()}
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/50">
          <div className="text-[10px] text-zinc-500">Triangles</div>
          <div className="text-[11px] font-bold text-emerald-400">
            {modelInfo.triangleCount.toLocaleString()}
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/50">
          <div className="text-[10px] text-zinc-500">Sous-Mesh</div>
          <div className="text-[11px] font-bold text-indigo-400">
            {modelInfo.meshCount}
          </div>
        </div>
      </div>
      {onSnapToGround && (
        <button
          type="button"
          onClick={() => onSnapToGround(node.id)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold transition-colors"
          title="Pose la base du modèle au niveau du sol (terrain ou Y=0)"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          <span>Poser au sol (niveau 0)</span>
        </button>
      )}
    </div>
  );
}
