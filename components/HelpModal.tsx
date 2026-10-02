'use client';

import React from 'react';
import {
  X,
  HelpCircle,
  Keyboard,
  MousePointer2,
  ListOrdered,
  RotateCcw,
  Play,
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReplayIntro: () => void;
}

const SHORTCUTS: Array<{ label: string; keys: string[] }> = [
  { label: 'Déplacer la sélection', keys: ['W'] },
  { label: 'Pivoter la sélection', keys: ['E'] },
  { label: 'Redimensionner la sélection', keys: ['R'] },
  { label: 'Centrer la vue sur l’objet', keys: ['F'] },
  { label: 'Lancer le jeu (depuis l’éditeur)', keys: ['Espace'] },
  { label: 'Annuler / rétablir', keys: ['Ctrl', 'Z'] },
  { label: 'Supprimer l’objet sélectionné', keys: ['Suppr'] },
  { label: 'Désélectionner', keys: ['Échap'] },
];

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: '1. Décor & Monde',
    body: 'Ajoutez des formes, des modèles et la bibliothèque d’objets low-poly. C’est la base de votre niveau.',
  },
  {
    title: '2. Personnage & Anims',
    body: 'Ajoutez un joueur (bouton Player), importez des modèles avec squelette et créez des animations.',
  },
  {
    title: '3. Règles du Jeu',
    body: 'Dans l’Inspecteur, ajoutez des cartes de comportement : pièces à ramasser, dégâts, zones, ennemis qui patrouillent.',
  },
  {
    title: '4. Tester & Partager',
    body: 'Cliquez sur Play pour jouer (ZQSD/WASD + Espace), puis exportez votre jeu ou partagez un lien.',
  },
];

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, onReplayIntro }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
            <HelpCircle className="w-4 h-4 text-sky-400" />
            <span>Aide & raccourcis</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
            aria-label="Fermer l’aide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-5 text-xs">
          {/* Workflow */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
              <ListOrdered className="w-3.5 h-3.5 text-sky-400" />
              <span>Les 4 étapes de création</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STEPS.map((s) => (
                <div
                  key={s.title}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 flex flex-col gap-1"
                >
                  <span className="font-semibold text-zinc-100">{s.title}</span>
                  <span className="text-[11px] leading-relaxed text-zinc-400">{s.body}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Courbe d'apprentissage en jeu */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Jouer à votre scène</span>
            </div>
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/30 p-3 text-[11px] leading-relaxed text-emerald-200/90">
              Cliquez sur <strong>Play</strong> (ou la barre d’espace) après avoir ajouté un{' '}
              <strong>joueur</strong> à la scène. Déplacement{' '}
              <kbd className="px-1 rounded bg-zinc-800 text-zinc-200 font-mono">ZQSD</kbd> ou{' '}
              <kbd className="px-1 rounded bg-zinc-800 text-zinc-200 font-mono">WASD</kbd>, saut{' '}
              <kbd className="px-1 rounded bg-zinc-800 text-zinc-200 font-mono">Espace</kbd>, regard
              à la souris. Pour revenir à l’éditeur, cliquez sur <strong>Stop</strong> en haut
              (<kbd className="px-1 rounded bg-zinc-800 text-zinc-200 font-mono">Échap</kbd> ouvre
              le menu de pause).
            </div>
          </section>

          {/* Raccourcis */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
              <Keyboard className="w-3.5 h-3.5 text-sky-400" />
              <span>Raccourcis clavier (éditeur)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {SHORTCUTS.map((s) => (
                <div key={s.label} className="flex justify-between items-center gap-2">
                  <span className="text-zinc-400">{s.label}</span>
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-zinc-200 text-[10px]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Souris */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
              <MousePointer2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Souris</span>
            </div>
            <ul className="text-[11px] text-zinc-400 leading-relaxed list-disc pl-5 space-y-1">
              <li>
                <strong className="text-zinc-300">Clic gauche</strong> : sélectionner / déplacer avec
                le gizmo.
              </li>
              <li>
                <strong className="text-zinc-300">Molette</strong> : zoomer ;{' '}
                <strong className="text-zinc-300">clic droit + glisser</strong> : orbit autour de la
                scène.
              </li>
              <li>
                <strong className="text-zinc-300">Glisser-déposer</strong> un objet depuis la
                bibliothèque (bas) ou l’arbre (gauche) dans la vue 3D pour le placer.
              </li>
            </ul>
          </section>

          <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
            <button
              type="button"
              onClick={onReplayIntro}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Revoir l’introduction</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold transition-colors"
            >
              Compris !
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
