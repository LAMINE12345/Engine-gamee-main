'use client';

import React from 'react';
import {
  PanelLeft,
  PanelLeftClose,
  HelpCircle,
  Map,
  UserRound,
  Zap,
  Rocket,
  Check,
  Search,
} from 'lucide-react';

export type WorkflowMode = 'decor' | 'character' | 'rules' | 'test';

interface WorkflowStepperProps {
  mode: WorkflowMode;
  /** Étapes déjà visitées : elles affichent une coche de progression. */
  visited: ReadonlySet<WorkflowMode>;
  isHierarchyOpen: boolean;
  onToggleHierarchy: () => void;
  onSelect: (mode: WorkflowMode) => void;
  onOpenHelp: () => void;
  onOpenCommandPalette: () => void;
}

interface Step {
  id: WorkflowMode;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Couleur d'accent utilisée par l'onglet actif et les pastilles. */
  accent: string;
}

const STEPS: Step[] = [
  { id: 'decor', label: 'Décor & Monde', short: 'Monde', icon: Map, accent: 'sky' },
  { id: 'character', label: 'Personnage & Anims', short: 'Héros', icon: UserRound, accent: 'violet' },
  { id: 'rules', label: 'Règles du Jeu', short: 'Règles', icon: Zap, accent: 'amber' },
  { id: 'test', label: 'Tester & Partager', short: 'Tester', icon: Rocket, accent: 'emerald' },
];

const ACCENT_RING: Record<string, string> = {
  sky: 'bg-sky-500 text-white shadow-sky-950/50 ring-sky-400/40',
  violet: 'bg-violet-500 text-white shadow-violet-950/50 ring-violet-400/40',
  amber: 'bg-amber-500 text-black shadow-amber-950/50 ring-amber-400/40',
  emerald: 'bg-emerald-500 text-white shadow-emerald-950/50 ring-emerald-400/40',
};



/**
 * Barre d'étapes « Canva / Roblox Studio » : le parcours débutant
 * (Décor → Personnage → Règles → Test) reste visible en permanence.
 *
 * Avant : des emojis 🗺️👤⚡🚀, aucun repère de progression, et un chip
 * « Mode : DECOR » qui faisait doublon avec l'onglet actif.
 */
export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  mode,
  visited,
  isHierarchyOpen,
  onToggleHierarchy,
  onSelect,
  onOpenHelp,
  onOpenCommandPalette,
}) => {
  const progress = visited.size / STEPS.length;

  return (
    <nav
      id="aether-workflow"
      aria-label="Étapes de création"
      className="ae-chrome relative z-30 flex h-12 w-full shrink-0 items-center gap-3 border-b px-3 shadow-[0_1px_0_0_rgba(255,255,255,0.02)]"
    >
      {/* Panneau hiérarchie */}
      <button
        id="btn-hierarchy"
        type="button"
        onClick={onToggleHierarchy}
        aria-pressed={isHierarchyOpen}
        className="ae-btn"
        title={isHierarchyOpen ? 'Masquer la hiérarchie' : 'Afficher la hiérarchie'}
      >
        {isHierarchyOpen ? (
          <PanelLeftClose className="h-3.5 w-3.5 text-sky-400" />
        ) : (
          <PanelLeft className="h-3.5 w-3.5 text-sky-400" />
        )}
        <span className="hidden xl:inline">Hiérarchie</span>
      </button>

      <span className="h-5 w-px shrink-0 bg-zinc-800" aria-hidden />

      {/* Étapes + rail de progression */}
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <ol className="flex min-w-0 items-center gap-1">
          {STEPS.map((step, i) => {
            const isActive = step.id === mode;
            const isDone = visited.has(step.id) && !isActive;
            const Icon = step.icon;
            const isLast = i === STEPS.length - 1;
            const connectorDone = isDone || (isActive && i > 0 && visited.has(STEPS[i - 1].id));

            return (
              <li key={step.id} className="flex min-w-0 items-center">
                <button
                  type="button"
                  onClick={() => onSelect(step.id)}
                  aria-current={isActive ? 'step' : undefined}
                  title={`${step.label}  ·  Alt+${i + 1}`}
                  className={`group flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
                    isActive
                      ? `${ACCENT_RING[step.accent]} ring-1`
                      : 'border-transparent text-zinc-400 hover:border-zinc-700/60 hover:bg-white/5 hover:text-zinc-100'
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
                      isActive
                        ? 'bg-white/25'
                        : isDone
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500 group-hover:bg-zinc-700'
                    }`}
                  >
                    {isDone ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? '' : 'opacity-70'}`} />
                  <span className="hidden truncate lg:inline">{step.label}</span>
                  <span className="truncate lg:hidden">{step.short}</span>
                </button>

                {!isLast && (
                  <span
                    aria-hidden
                    className={`mx-1 h-px w-4 shrink-0 transition-colors duration-300 sm:w-6 ${
                      connectorDone ? 'bg-emerald-500/50' : 'bg-zinc-800'
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Progression + actions */}
      <div className="flex shrink-0 items-center gap-2">
        <div
          className="hidden items-center gap-1.5 lg:flex"
          title={`${visited.size}/${STEPS.length} étapes parcourues`}
        >
          <div className="h-1 w-16 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-[width] duration-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-zinc-500">
            {visited.size}/{STEPS.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="ae-btn w-7 px-0"
          title="Palette de commandes (Ctrl+K)"
          aria-label="Ouvrir la palette de commandes"
        >
          <Search className="h-3.5 w-3.5 text-zinc-400" />
        </button>

        <button
          type="button"
          id="btn-help"
          onClick={onOpenHelp}
          className="ae-btn"
          title="Aide &amp; raccourcis (revoir l'introduction)"
        >
          <HelpCircle className="h-3.5 w-3.5 text-sky-400" />
          <span className="hidden sm:inline">Aide</span>
        </button>
      </div>
    </nav>
  );
};

export default WorkflowStepper;
