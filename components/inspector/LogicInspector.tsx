'use client';

import React from 'react';
import { Sparkles, Split, FileCode2 } from 'lucide-react';
import type { EntityLogicData, NodeGraphData } from '../../types/logic';
import type { SceneNode } from '../../types/engine';
import { SectionProps, firstNode, isMulti, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { BehaviorCardsInspector } from '../BehaviorCardsInspector';
import { CustomScriptEditor } from '../CustomScriptEditor';
import { fireComponentMenu } from './ComponentContextMenu';
import { confirmBox } from '../../lib/ui/overlays';
import { DEFAULT_SCRIPT_CODE } from '../../lib/logic/scriptTemplates';

/** Defaults partagés (AddComponent réutilise le même document initial). */
export const DEFAULT_LOGIC: EntityLogicData = {
  cards: [],
  nodeGraph: {
    enabled: true,
    nodes: [],
    connections: [],
    variables: { Score: 0, Health: 100 },
  },
  customScript: {
    enabled: true,
    code: DEFAULT_SCRIPT_CODE,
    compiledOk: true,
    breakpoints: [],
  },
  activeLevel: 'cards',
};

/**
 * LogicInspector — sélecteur de niveau (Cards/Graph/Script) + éditeurs.
 * Multi-edit : seul le niveau actif est ventilé ; les documents (cartes,
 * graphe, script) s'éditent par objet (message explicite).
 */
export function LogicInspector({
  nodes,
  onUpdateLogic,
  onRemoveComponent,
  onOpenNodeGraph,
  collapsed,
  onToggleCollapse,
  isPlaying,
}: SectionProps & {
  onOpenNodeGraph?: (node: SceneNode, initialGraph?: NodeGraphData) => void;
}) {
  const ref = firstNode(nodes);
  const multi = isMulti(nodes);
  const logicData: EntityLogicData = ref.logic || DEFAULT_LOGIC;

  const setLevelAll = (activeLevel: 'cards' | 'graph' | 'script') => {
    nodes.forEach((n) => {
      const current: EntityLogicData = n.logic || DEFAULT_LOGIC;
      onUpdateLogic?.(n.id, { ...current, activeLevel });
    });
  };

  const levelBadge =
    logicData.activeLevel === 'cards'
      ? 'N1: Cards'
      : logicData.activeLevel === 'graph'
        ? 'N2: Graph'
        : 'N3: Script';

  return (
    <div
      className="space-y-4"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'Logique', [
          {
            label: 'Copier la logique',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  nodes.map((n) => ({ name: n.name, logic: n.logic ?? null })),
                  null,
                  2
                )
              ),
          },
          {
            label: 'Réinitialiser (document vide)',
            onClick: async () => {
              const ok = await confirmBox(
                'Écraser cartes, graphe et script par un document vide ?',
                { title: 'Réinitialiser la logique', okLabel: 'Réinitialiser' }
              );
              if (ok) {
                nodes.forEach((n) => onUpdateLogic?.(n.id, { ...DEFAULT_LOGIC }));
              }
            },
          },
          ...(onRemoveComponent && ref.logic
            ? [
                {
                  label: 'Retirer toute la logique',
                  danger: true,
                  onClick: () => nodes.forEach((n) => onRemoveComponent(n.id, 'logic' as const)),
                },
              ]
            : []),
        ]);
      }}
    >
      {/* Level Selector Header */}
      <div className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-2.5">
        <ComponentHeader
          icon={<Sparkles className="w-3.5 h-3.5 text-violet-400" />}
          title="Niveau de Liberté Logique"
          badge={levelBadge}
          collapsed={collapsed ?? false}
          onToggleCollapse={onToggleCollapse ?? (() => {})}
          onRemove={
            onRemoveComponent && ref.logic
              ? () => nodes.forEach((n) => onRemoveComponent(n.id, 'logic'))
              : undefined
          }
          removeTitle="Retirer toute la logique"
          removeConfirm="Retirer cartes, graphe et script des objets sélectionnés ?"
        />

        {!collapsed && (
          <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800/90">
            <button
              type="button"
              onClick={() => setLevelAll('cards')}
              className={`py-1.5 px-1 flex flex-col items-center gap-0.5 rounded-lg text-center transition-all ${
                logicData.activeLevel === 'cards'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium leading-tight">N1: Cards</span>
            </button>

            <button
              type="button"
              onClick={() => setLevelAll('graph')}
              className={`py-1.5 px-1 flex flex-col items-center gap-0.5 rounded-lg text-center transition-all ${
                logicData.activeLevel === 'graph'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <Split className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium leading-tight">N2: Graph</span>
            </button>

            <button
              type="button"
              onClick={() => setLevelAll('script')}
              className={`py-1.5 px-1 flex flex-col items-center gap-0.5 rounded-lg text-center transition-all ${
                logicData.activeLevel === 'script'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium leading-tight">N3: Script</span>
            </button>
          </div>
        )}
      </div>

      {!collapsed &&
        (multi ? (
          <div className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 text-center">
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Sélection multiple ({nodes.length} objets) : cartes, graphe et script
              s&apos;éditent <span className="text-zinc-200 font-medium">objet par objet</span>.
              Sélectionnez un seul objet pour éditer sa logique.
            </p>
          </div>
        ) : (
          <>
            {/* TIER 1: BEHAVIOR CARDS */}
            {logicData.activeLevel === 'cards' && (
              <BehaviorCardsInspector
                key={ref.id}
                entityId={ref.id}
                cards={logicData.cards || []}
                onUpdateCards={(cards) =>
                  onUpdateLogic?.(ref.id, { cards, activeLevel: 'cards' })
                }
                onOpenNodeGraph={(convertedGraph) => {
                  if (convertedGraph) {
                    onUpdateLogic?.(ref.id, {
                      nodeGraph: convertedGraph,
                      activeLevel: 'graph',
                    });
                  }
                  onOpenNodeGraph?.(ref, convertedGraph);
                }}
              />
            )}

            {/* TIER 2: NODE GRAPH SUMMARY & LAUNCHER */}
            {logicData.activeLevel === 'graph' && (
              <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
                    <Split className="w-3.5 h-3.5 text-violet-400" />
                    <span>Graphe de Logique Visuel</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    Actif
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Connectez des nœuds d&apos;événements (OnStart, OnUpdate, OnCollision, OnTriggerEnter), de logique (If/Else, Math, Compare) et d&apos;actions (ApplyImpulse, PlaySound, DestroyEntity).
                </p>

                <div className="grid grid-cols-2 gap-2 text-center font-mono">
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase">Nœuds</div>
                    <div className="text-sm font-bold text-violet-300">
                      {logicData.nodeGraph?.nodes?.length || 0}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase">Connexions</div>
                    <div className="text-sm font-bold text-sky-400">
                      {logicData.nodeGraph?.connections?.length || 0}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenNodeGraph?.(ref, logicData.nodeGraph)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-violet-950/50 transition-all cursor-pointer"
                >
                  <Split className="w-4 h-4" />
                  <span>Ouvrir l&apos;Éditeur Node Graph Visuel</span>
                </button>
              </div>
            )}

            {/* TIER 3: CUSTOM SCRIPT EDITOR */}
            {logicData.activeLevel === 'script' && (
              <CustomScriptEditor
                key={ref.id}
                entityId={ref.id}
                initialScript={logicData.customScript}
                isPlaying={isPlaying}
                onUpdateScript={(customScript) =>
                  onUpdateLogic?.(ref.id, { customScript, activeLevel: 'script' })
                }
              />
            )}
          </>
        ))}
    </div>
  );
}
