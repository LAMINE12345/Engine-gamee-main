'use client';

import React from 'react';
import { ChevronDown, Power, X } from 'lucide-react';
import { confirmBox } from '../../lib/ui/overlays';

/**
 * ComponentHeader — en-tête pliable Unity-style pour chaque section :
 * icône + titre + badge + toggle enable (optionnel) + suppression (optionnel).
 * L'état plié/déplié est contrôlé par l'orchestrateur (persisté localStorage).
 */
export function ComponentHeader({
  icon,
  title,
  badge,
  mixed,
  collapsed,
  onToggleCollapse,
  enabled,
  onToggleEnabled,
  enableTitle,
  onRemove,
  removeTitle,
  removeConfirm,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  /** Plusieurs objets aux valeurs divergentes. */
  mixed?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  enabled?: boolean;
  onToggleEnabled?: () => void;
  enableTitle?: string;
  onRemove?: () => void;
  removeTitle?: string;
  /** Texte de confirmation (défaut générique). */
  removeConfirm?: string;
  /** Bouton d'action à droite (ex. reset) — rendu avant enable/remove. */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center gap-1.5 font-bold text-zinc-200 uppercase tracking-wider text-[11px] hover:text-white transition-colors"
        title={collapsed ? 'Déplier' : 'Replier'}
      >
        <span className="flex items-center">{icon}</span>
        <span>{title}</span>
        {badge && (
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] font-mono text-zinc-400 normal-case tracking-normal">
            {badge}
          </span>
        )}
        {mixed && (
          <span className="text-amber-400 font-bold normal-case" title="Valeurs différentes selon les objets">
            ≠
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 text-zinc-500 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>
      <div className="flex items-center gap-1">
        {action}
        {onToggleEnabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled();
            }}
            className={`p-1 rounded transition-colors ${
              enabled ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-zinc-600 hover:bg-zinc-800'
            }`}
            title={enableTitle ?? (enabled ? 'Désactiver' : 'Activer')}
          >
            <Power className="w-3 h-3" />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              const ok = await confirmBox(removeConfirm ?? 'Retirer ce composant ?', {
                title: 'Retirer le composant',
                okLabel: 'Retirer',
              });
              if (ok) onRemove();
            }}
            className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title={removeTitle ?? 'Retirer le composant'}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
