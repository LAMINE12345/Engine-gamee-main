'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search, Sparkles } from 'lucide-react';
import { groupCommands, rankCommands, type CommandDef } from '../lib/commands';

interface CommandPaletteProps {
  open: boolean;
  commands: readonly CommandDef[];
  onClose: () => void;
}

/**
 * Palette de commandes (Ctrl+K / Cmd+K).
 *
 * L'éditeur expose ~80 actions réparties entre 6 modales et 4 panneaux :
 * sans palette, la moitié sont introuvables. Ce composant est 100 % local
 * (aucune dépendance) et ne fait qu'exécuter la commande sélectionnée.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, commands, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    // Le focus est posé après le tick de rendu pour saisir l'input.
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const ranked = useMemo(() => rankCommands(commands, query), [commands, query]);
  const groups = useMemo(() => groupCommands(ranked), [ranked]);

  // Index plat ↔ position dans la liste groupée.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Garde l'index valide quand la liste se resserre.
  useEffect(() => {
    if (activeIndex > flat.length - 1) setActiveIndex(Math.max(0, flat.length - 1));
  }, [flat.length, activeIndex]);

  // Fait défiler l'entrée active hors du champ de vision.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, groups]);

  const execute = useCallback(
    (cmd: CommandDef | undefined) => {
      if (!cmd || cmd.disabled) return;
      onClose();
      // Laisse le palette se fermer avant de lancer l'action (évite qu'un
      // focus/selecteur reste piégé pendant qu'une modale s'ouvre).
      window.setTimeout(() => cmd.run(), 0);
    },
    [onClose]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(Math.max(0, flat.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        execute(flat[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [activeIndex, execute, flat, onClose]
  );

  if (!open) return null;

  let cursor = -1;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="ae-panel ae-anim-pop-in w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl"
        onKeyDown={onKeyDown}
      >
        {/* Champ de recherche */}
        <div className="flex items-center gap-2.5 border-b border-zinc-800/80 px-4">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Rechercher une commande, un outil, un objet…"
            className="h-12 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            aria-label="Rechercher une commande"
            aria-autocomplete="list"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="ae-kbd shrink-0">Échap</kbd>
        </div>

        {/* Résultats */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
          {flat.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Sparkles className="h-5 w-5 text-zinc-700" />
              <p className="text-xs text-zinc-400">Aucune commande pour « {query} »</p>
              <p className="text-[11px] text-zinc-600">
                Essayez « cube », « export », « atmosphere », « wireframe », « multiplayer »…
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.group} className="mb-1 last:mb-0">
                <div className="ae-menu-label">{group.group}</div>
                {group.items.map((cmd) => {
                  cursor += 1;
                  const isActive = cursor === activeIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      aria-disabled={cmd.disabled}
                      data-active={isActive}
                      className="ae-menu-item"
                      onMouseMove={() => setActiveIndex(cursor)}
                      onClick={() => execute(cmd)}
                    >
                      <span className="ae-menu-icon flex h-5 w-5 items-center justify-center">
                        {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="h-1 w-1 rounded-full bg-current" />}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate ${cmd.disabled ? 'text-zinc-600' : ''}`}
                      >
                        {cmd.label}
                      </span>
                      {cmd.shortcut && <span className="ae-kbd shrink-0">{cmd.shortcut}</span>}
                      {cmd.hint && !cmd.shortcut && (
                        <span className="hidden shrink-0 truncate text-[10px] text-zinc-600 sm:block">
                          {cmd.hint}
                        </span>
                      )}
                      {isActive && <CornerDownLeft className="h-3 w-3 shrink-0 text-sky-400" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Pied : légende clavier */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="ae-kbd">↑</span>
            <span className="ae-kbd">↓</span>
            naviguer
            <span className="ae-kbd ml-2">⏎</span>
            exécuter
          </span>
          <span>{flat.length} commande{flat.length > 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;

/**
 * Ouvre/ferme la palette avec `Ctrl+K` (ou `Cmd+K` sur macOS).
 * Ignoré pendant une saisie et quand une modale native est ouverte.
 */
export function useCommandPaletteHotkey(
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      // Ctrl+K reste utile même dans un champ : on ne le bloque que si
      // l'utilisateur est en train de composer du texte.
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName) && target.isContentEditable) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setOpen]);
}
