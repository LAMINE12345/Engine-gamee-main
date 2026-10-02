'use client';

import React, { useEffect, useState } from 'react';

/**
 * ComponentContextMenu — menu clic droit des sections de l'Inspector
 * (Copy Value, Reset to Default, Remove...).
 *
 * Event-bus (pas de prop-drilling) : les sections appellent
 * `fireComponentMenu(e, title, items)`, l'hôte unique (rendu par
 * l'orchestrateur Inspector) affiche le menu.
 */

export interface ComponentMenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface MenuState {
  x: number;
  y: number;
  title: string;
  items: ComponentMenuItem[];
}

const EVENT_NAME = 'aether:component-menu';

export function fireComponentMenu(
  e: { clientX: number; clientY: number },
  title: string,
  items: ComponentMenuItem[]
): void {
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { x: e.clientX, y: e.clientY, title, items } })
  );
}

export function ComponentContextMenuHost() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const onFire = (e: Event) => {
      const detail = (e as CustomEvent).detail as MenuState;
      // Clamp dans la fenêtre (menu ~220px).
      setMenu({
        ...detail,
        x: Math.min(detail.x, window.innerWidth - 228),
        y: Math.min(detail.y, window.innerHeight - detail.items.length * 34 - 60),
      });
    };
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener(EVENT_NAME, onFire);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(EVENT_NAME, onFire);
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!menu) return null;

  return (
    <div
      className="fixed z-[100] w-56 p-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 shadow-2xl text-xs"
      style={{ left: menu.x, top: Math.max(8, menu.y) }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider truncate">
        {menu.title}
      </div>
      {menu.items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            setMenu(null);
            item.onClick();
          }}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-[11px] ${
            item.danger
              ? 'text-rose-300 hover:bg-rose-500/10'
              : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
          } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
        >
          <span className="flex-1">{item.label}</span>
          {item.hint && <span className="text-[9px] font-mono text-zinc-600">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}
