'use client';

import React from 'react';
import { Gamepad2, Rocket, FilePlus2, Sparkles, MousePointerClick } from 'lucide-react';

export type WelcomeChoice = 'demo' | 'minigame' | 'blank';

interface WelcomeScreenProps {
  open: boolean;
  /** Fermeture possible uniquement en relecture (l'introduction initiale se choisit). */
  canDismiss: boolean;
  onClose: () => void;
  onChoose: (choice: WelcomeChoice) => void;
}

const OPTIONS: Array<{
  choice: WelcomeChoice;
  icon: React.ReactNode;
  title: string;
  description: string;
  hint: string;
  accent: string;
}> = [
  {
    choice: 'demo',
    icon: <Sparkles className="w-6 h-6" />,
    title: 'Scène démo jouable',
    description:
      'Cube, sphère, tore + un joueur et 3 pièces à ramasser. Le meilleur point de départ pour découvrir l’éditeur.',
    hint: 'Recommandé pour débuter',
    accent: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  {
    choice: 'minigame',
    icon: <Rocket className="w-6 h-6" />,
    title: 'Mini-jeu prêt à jouer',
    description:
      'Un sol, un joueur, 8 pièces, un ennemi qui patrouille et une zone victoire. Cliquez sur Play et jouez.',
    hint: 'Résultat en 1 clic',
    accent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  {
    choice: 'blank',
    icon: <FilePlus2 className="w-6 h-6" />,
    title: 'Projet vide',
    description:
      'Commencez à partir de zéro avec une scène entièrement vide et tous les outils de l’éditeur.',
    hint: 'Pour les plus autonomes',
    accent: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
  },
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  open,
  canDismiss,
  onClose,
  onChoose,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
              <Gamepad2 className="w-4 h-4" />
              <span>Aether 3D Engine</span>
            </div>
            <h1 className="mt-2 text-xl font-bold text-zinc-100">
              Bienvenue ! Par où voulez-vous commencer ?
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Choisissez une base de départ — vous pourrez tout modifier ensuite. Ensuite : cliquez
              sur <span className="text-sky-300 font-medium">Play</span> pour lancer le jeu.
            </p>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 text-xs px-2 py-1 rounded hover:bg-zinc-800"
            >
              Fermer
            </button>
          )}
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OPTIONS.map((opt) => (
            <button
              key={opt.choice}
              type="button"
              onClick={() => onChoose(opt.choice)}
              className={`group flex flex-col gap-2 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${opt.accent}`}
            >
              <span className="flex items-center justify-between">
                <span>{opt.icon}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-70">{opt.hint}</span>
              </span>
              <span className="text-sm font-semibold text-zinc-100">{opt.title}</span>
              <span className="text-[11px] leading-relaxed text-zinc-400 group-hover:text-zinc-300">
                {opt.description}
              </span>
            </button>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-zinc-800 flex items-center gap-2 text-[11px] text-zinc-500">
          <MousePointerClick className="w-3.5 h-3.5" />
          <span>
            Astuce : déplacez-vous avec{' '}
            <kbd className="px-1 rounded bg-zinc-800 text-zinc-300">ZQSD</kbd> ou{' '}
            <kbd className="px-1 rounded bg-zinc-800 text-zinc-300">WASD</kbd>, sautez avec{' '}
            <kbd className="px-1 rounded bg-zinc-800 text-zinc-300">Espace</kbd> et regardez avec la
            souris. Revoir cette intro : bouton <strong>?</strong> en haut à droite.
          </span>
        </div>
      </div>
    </div>
  );
};
