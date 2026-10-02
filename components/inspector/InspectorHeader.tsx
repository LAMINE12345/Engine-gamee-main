'use client';

import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Focus,
  Trash2,
  Copy,
  Film,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { SceneNode } from '../../types/engine';
import { firstNode, isMulti } from './types';

/**
 * InspectorHeader — badge type, actions, nom, visibilité, UUID, timeline,
 * Rig Studio. En multi-sélection : nom désactivé ("N objets"), actions
 * ventilées par l'orchestrateur.
 */
export function InspectorHeader({
  nodes,
  onUpdateName,
  onToggleVisibility,
  onFocusObject,
  onDuplicateObject,
  onDeleteObject,
  onSaveAsPrefab,
  onOpenTimeline,
  onOpenRigStudio,
}: {
  nodes: SceneNode[];
  onUpdateName: (name: string) => void;
  onToggleVisibility: () => void;
  onFocusObject: () => void;
  onDuplicateObject: () => void;
  onDeleteObject: () => void;
  onSaveAsPrefab: () => void;
  onOpenTimeline?: () => void;
  onOpenRigStudio: () => void;
}) {
  const [copiedId, setCopiedId] = useState(false);
  const node = firstNode(nodes);
  const multi = isMulti(nodes);
  const anyVisible = nodes.some((n) => n.visible);

  const copyIdToClipboard = () => {
    navigator.clipboard?.writeText(node.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  return (
    <div className="p-3.5 border-b border-zinc-800/80 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-[10px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
            {node.type}
          </span>
          <span className="text-zinc-500 text-[10px] uppercase font-mono">
            {node.subType || ''}
          </span>
          {multi && (
            <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-[10px] font-mono text-violet-300 font-semibold">
              ×{nodes.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onOpenTimeline && (
            <button
              type="button"
              onClick={onOpenTimeline}
              className="p-1.5 rounded-lg hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 transition-colors border border-sky-500/30"
              title="Ouvrir l'éditeur de Trajectoire & Timeline Keyframes"
            >
              <Film className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onFocusObject}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-sky-400 transition-colors"
            title="Centrer la caméra sur l'objet (F)"
          >
            <Focus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDuplicateObject}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Dupliquer (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onSaveAsPrefab}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors"
            title="Sauvegarder comme Préfabriqué (Prefab)"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDeleteObject}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition-colors"
            title="Supprimer (Suppr)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Name input */}
      <div className="flex items-center gap-2">
        <input
          id="inspector-object-name"
          type="text"
          value={multi ? `${nodes.length} objets sélectionnés` : node.name}
          disabled={multi}
          onChange={(e) => onUpdateName(e.target.value)}
          className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-medium text-white focus:outline-none focus:border-sky-500/80 transition-colors disabled:opacity-60"
          placeholder="Nom de l'objet"
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className={`p-2 rounded-lg border transition-colors ${
            anyVisible
              ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
              : 'bg-rose-950/40 border-rose-800/40 text-rose-400'
          }`}
          title={anyVisible ? "Masquer l'objet" : 'Rendre visible'}
        >
          {anyVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      {onOpenTimeline && (
        <button
          type="button"
          onClick={onOpenTimeline}
          className="w-full py-1.5 px-3 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          <Film className="w-3.5 h-3.5 text-sky-400" />
          <span>Éditeur de Trajectoire (Timeline)</span>
        </button>
      )}

      {/* UUID snippet */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <span className="truncate max-w-[190px]">UUID: {node.id}</span>
        <button
          type="button"
          onClick={copyIdToClipboard}
          className="hover:text-zinc-300 transition-colors text-[10px]"
        >
          {copiedId ? <span className="text-emerald-400">Copié</span> : 'Copier'}
        </button>
      </div>

      {(node.type === 'mesh' || node.type === 'group') && node.subType === 'model' && (
        <button
          onClick={onOpenRigStudio}
          className="w-full py-1.5 px-3 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md mt-2 ring-1 ring-indigo-500/20"
        >
          <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400/20" />
          <span>OUVRIR RIG STUDIO</span>
        </button>
      )}
    </div>
  );
}
