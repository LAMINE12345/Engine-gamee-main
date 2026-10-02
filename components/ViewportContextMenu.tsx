'use client';

import React from 'react';
import {
  Box,
  Circle,
  Cylinder,
  Disc,
  Lightbulb,
  Gamepad2,
  Copy,
  Scissors,
  ClipboardPaste,
  Focus,
  Plus,
} from 'lucide-react';

/**
 * ViewportContextMenu — clic droit dans le viewport 3D :
 * créer un objet au point cliqué, cadrer la sélection, copier / couper / coller.
 * Entièrement contrôlé par Viewport (position + ouverture).
 */

export interface ViewportMenuAction {
  onCreate: (type: string) => void;
  onFrameSelection: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
}

const CREATE_ITEMS = [
  { type: 'cube', label: 'Cube', icon: <Box className="w-3.5 h-3.5 text-sky-400" /> },
  { type: 'sphere', label: 'Sphère', icon: <Circle className="w-3.5 h-3.5 text-rose-400" /> },
  { type: 'cylinder', label: 'Cylindre', icon: <Cylinder className="w-3.5 h-3.5 text-emerald-400" /> },
  { type: 'plane', label: 'Plan', icon: <Disc className="w-3.5 h-3.5 text-zinc-400" /> },
  { type: 'pointLight', label: 'Lumière', icon: <Lightbulb className="w-3.5 h-3.5 text-amber-300" /> },
  { type: 'player', label: 'Joueur', icon: <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" /> },
];

function MenuButton({
  label,
  hint,
  icon,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px] ${
        danger
          ? 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
          : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
      } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[9px] font-mono text-zinc-600">{hint}</span>}
    </button>
  );
}

export function ViewportContextMenu({
  x,
  y,
  hasSelection,
  canPaste,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  hasSelection: boolean;
  canPaste: boolean;
  actions: ViewportMenuAction;
  onClose: () => void;
}) {
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div
      className="fixed z-[100] w-56 p-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 shadow-2xl text-xs"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
        <Plus className="w-3 h-3" />
        <span>Créer un objet ici</span>
      </div>
      <div className="grid grid-cols-2 gap-0.5 px-0.5">
        {CREATE_ITEMS.map((item) => (
          <button
            key={item.type}
            type="button"
            onClick={run(() => actions.onCreate(item.type))}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-left text-[11px]"
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="my-1 border-t border-zinc-800" />

      <MenuButton
        label="Cadrer la sélection"
        hint="F"
        icon={<Focus className="w-3.5 h-3.5 text-sky-400" />}
        disabled={!hasSelection}
        onClick={run(actions.onFrameSelection)}
      />
      <MenuButton
        label="Copier"
        hint="Ctrl+C"
        icon={<Copy className="w-3.5 h-3.5 text-zinc-400" />}
        disabled={!hasSelection}
        onClick={run(actions.onCopy)}
      />
      <MenuButton
        label="Couper"
        hint="Ctrl+X"
        icon={<Scissors className="w-3.5 h-3.5 text-zinc-400" />}
        disabled={!hasSelection}
        onClick={run(actions.onCut)}
      />
      <MenuButton
        label="Coller ici"
        hint="Ctrl+V"
        icon={<ClipboardPaste className="w-3.5 h-3.5 text-emerald-400" />}
        disabled={!canPaste}
        onClick={run(actions.onPaste)}
      />
    </div>
  );
}
