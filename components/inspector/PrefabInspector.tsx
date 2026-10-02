'use client';

import React from 'react';
import { Package } from 'lucide-react';
import { SectionProps, firstNode } from './types';

/** Section instance prefab : Apply / Revert / Unlink. */
export function PrefabInspector({
  nodes,
  onApplyPrefab,
  onRevertPrefab,
  onUnlinkPrefab,
  prefabName,
}: SectionProps & {
  onApplyPrefab?: (id: string) => void;
  onRevertPrefab?: (id: string) => void;
  onUnlinkPrefab?: (id: string) => void;
  prefabName?: string | null;
}) {
  const node = firstNode(nodes);
  if (!node.prefabId) return null;
  return (
    <div className="rounded-xl bg-amber-500/5 border border-amber-500/25 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold text-amber-200">
          Instance prefab
        </span>
      </div>
      <div className="text-[10px] text-zinc-400 truncate" title={prefabName ?? node.prefabId}>
        {prefabName ?? node.prefabId}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onApplyPrefab?.(node.id)}
          className="px-1 py-1 rounded-lg text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-200 hover:bg-amber-500/25 transition-colors"
          title="Pousse les modifications de cette instance vers le prefab (template)"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => onRevertPrefab?.(node.id)}
          className="px-1 py-1 rounded-lg text-[10px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          title="Réinitialise cette instance depuis le prefab (abandonne les overrides)"
        >
          Revert
        </button>
        <button
          type="button"
          onClick={() => onUnlinkPrefab?.(node.id)}
          className="px-1 py-1 rounded-lg text-[10px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
          title="Détache du prefab (devient des objets ordinaires)"
        >
          Unlink
        </button>
      </div>
    </div>
  );
}
