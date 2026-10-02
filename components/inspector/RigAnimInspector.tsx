'use client';

import React from 'react';
import { PersonStanding, Zap } from 'lucide-react';
import { SectionProps, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { MiniSwitch } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';

const MAPPABLE_SLOTS = [
  'idle',
  'walk',
  'run',
  'sprint',
  'jump',
  'crouch',
  'attack',
  'interact',
  'hit',
  'wave',
  'die',
] as const;

/**
 * RigAnimInspector — résumé de l'animation squelettique (type de rig,
 * auto-animation, slots mappés) + accès Rig Studio. Visible si `rigAnim`.
 * La configuration fine (mapping, blend tree, IK, ragdoll) reste dans
 * Rig Studio ; ici : enable, remove, raccourci.
 */
export function RigAnimInspector({
  nodes,
  onUpdateRigAnim,
  onRemoveComponent,
  onOpenRigStudio,
  collapsed,
  onToggleCollapse,
}: SectionProps & {
  onOpenRigStudio: () => void;
}) {
  const targets = nodes.filter((n) => n.rigAnim);
  if (targets.length === 0) return null;

  const setEnabledAll = (enabled: boolean) => {
    targets.forEach((n) => onUpdateRigAnim?.(n.id, { enabled }));
  };

  const enabled = mixedValue(targets, (n) => Boolean(n.rigAnim?.enabled));
  const rigType = mixedValue(targets, (n) => n.rigAnim?.rigType ?? 'biped');
  const autoAnimate = mixedValue(targets, (n) => Boolean(n.rigAnim?.autoAnimate));
  const mappedCount = mixedValue(
    targets,
    (n) =>
      MAPPABLE_SLOTS.filter(
        (slot) => Boolean((n.rigAnim?.animationMapping as Record<string, unknown> | undefined)?.[slot])
      ).length
  );

  return (
    <div
      className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, 'Animation Squelettique', [
          {
            label: 'Copier les valeurs',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  targets.map((n) => ({ name: n.name, rigAnim: n.rigAnim })),
                  null,
                  2
                )
              ),
          },
          {
            label: 'Ouvrir Rig Studio',
            onClick: () => onOpenRigStudio(),
          },
          ...(onRemoveComponent
            ? [
                {
                  label: "Retirer l'animation",
                  danger: true,
                  onClick: () => targets.forEach((n) => onRemoveComponent(n.id, 'rigAnim' as const)),
                },
              ]
            : []),
        ]);
      }}
    >
      <ComponentHeader
        icon={<PersonStanding className="w-3.5 h-3.5 text-indigo-400" />}
        title="Animation Squelettique"
        badge={String(rigType.value)}
        mixed={enabled.mixed || rigType.mixed}
        collapsed={collapsed ?? false}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
        enabled={Boolean(enabled.value)}
        onToggleEnabled={() => setEnabledAll(!enabled.value)}
        enableTitle={enabled.value ? "Désactiver l'animation auto" : "Activer l'animation auto"}
        onRemove={
          onRemoveComponent ? () => targets.forEach((n) => onRemoveComponent(n.id, 'rigAnim')) : undefined
        }
        removeTitle="Retirer l'animation squelettique"
        removeConfirm="Retirer la configuration d'animation (mapping, blend tree) des objets sélectionnés ?"
      />

      {!collapsed && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase">Slots</div>
              <div className="text-[11px] font-bold text-indigo-300">
                {mappedCount.value}/{MAPPABLE_SLOTS.length}
                {mappedCount.mixed ? '≠' : ''}
              </div>
            </div>
            <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase">Auto</div>
              <div className="text-[11px] font-bold text-zinc-200">
                {autoAnimate.value ? 'oui' : 'non'}
              </div>
            </div>
            <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase">État</div>
              <div
                className={`text-[11px] font-bold ${
                  enabled.value ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              >
                {enabled.value ? 'actif' : 'coupé'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Animation auto (vitesse → clips)</span>
            <MiniSwitch
              active={Boolean(autoAnimate.value)}
              activeColor="bg-indigo-500"
              onToggle={() =>
                targets.forEach((n) =>
                  onUpdateRigAnim?.(n.id, { autoAnimate: !n.rigAnim?.autoAnimate })
                )
              }
            />
          </div>

          <button
            type="button"
            onClick={onOpenRigStudio}
            className="w-full py-1.5 px-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>Ouvrir Rig Studio (mapping, blend, IK)</span>
          </button>
        </>
      )}
    </div>
  );
}
