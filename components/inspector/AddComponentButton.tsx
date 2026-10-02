'use client';

import React, { useState } from 'react';
import { Plus, Activity, Box, Gamepad2, Car, Sparkles, PersonStanding } from 'lucide-react';
import type { SceneNode } from '../../types/engine';
import type { EntityLogicData } from '../../types/logic';
import type { NodeUpdaters } from './types';
import { DEFAULT_LOGIC } from './LogicInspector';

interface AddableKind {
  kind: 'rigidbody' | 'collider' | 'characterController' | 'vehicleController' | 'logic' | 'rigAnim';
  label: string;
  desc: string;
  icon: React.ReactNode;
}

/**
 * AddComponentButton — ajoute Rigidbody / Collider / Character / Véhicule /
 * Logique sur les objets qui en sont dépourvus (bouton + menu déroulant,
 * style Unity "Add Component").
 */
export function AddComponentButton({
  nodes,
  onUpdatePhysics,
  onUpdateLogic,
  onUpdateRigAnim,
}: {
  nodes: SceneNode[];
  onUpdatePhysics: NodeUpdaters['onUpdatePhysics'];
  onUpdateLogic: NodeUpdaters['onUpdateLogic'];
  onUpdateRigAnim?: NodeUpdaters['onUpdateRigAnim'];
}) {
  const [open, setOpen] = useState(false);

  const missing = (pred: (n: SceneNode) => boolean): SceneNode[] =>
    nodes.filter((n) => n.type !== 'light' && pred(n));

  const kinds: Array<AddableKind & { targets: SceneNode[] }> = [
    {
      kind: 'rigidbody',
      label: 'Rigidbody',
      desc: 'Masse, rebond, friction (Rapier)',
      icon: <Activity className="w-3.5 h-3.5 text-sky-400" />,
      targets: missing((n) => !n.physics?.rigidbody),
    },
    {
      kind: 'collider',
      label: 'Collider',
      desc: 'Forme de collision (auto, box, sphere…)',
      icon: <Box className="w-3.5 h-3.5 text-emerald-400" />,
      targets: missing((n) => !n.physics?.collider),
    },
    {
      kind: 'characterController',
      label: 'Character Controller',
      desc: 'Joueur FPS / 3e personne',
      icon: <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />,
      targets: missing((n) => !n.physics?.characterController),
    },
    {
      kind: 'vehicleController',
      label: 'Contrôleur Véhicule',
      desc: 'Physique automobile arcade',
      icon: <Car className="w-3.5 h-3.5 text-sky-400" />,
      targets: missing((n) => !n.physics?.vehicleController),
    },
    {
      kind: 'logic',
      label: 'Comportement (Logique)',
      desc: 'Cartes, graphe, script',
      icon: <Sparkles className="w-3.5 h-3.5 text-violet-400" />,
      targets: nodes.filter((n) => !n.logic),
    },
    {
      kind: 'rigAnim',
      label: 'Animation Squelettique',
      desc: 'Rig bipède + auto (config : Rig Studio)',
      icon: <PersonStanding className="w-3.5 h-3.5 text-indigo-400" />,
      targets: nodes.filter((n) => !n.rigAnim),
    },
  ];
  const available = kinds.filter((k) => k.targets.length > 0);
  if (available.length === 0) return null;

  const applyAdd = (kind: AddableKind['kind'], targets: SceneNode[]) => {
    for (const n of targets) {
      if (kind === 'rigidbody') {
        onUpdatePhysics?.(n.id, {
          rigidbody: {
            enabled: true,
            type: 'dynamic',
            mass: 1.0,
            restitution: 0.4,
            friction: 0.5,
            lockRotations: false,
          },
          collider: n.physics?.collider || {
            shape: n.subType === 'sphere' ? 'sphere' : 'auto',
          },
        });
      } else if (kind === 'collider') {
        onUpdatePhysics?.(n.id, {
          collider: { shape: n.subType === 'sphere' ? 'sphere' : 'auto' },
        });
      } else if (kind === 'characterController') {
        onUpdatePhysics?.(n.id, {
          rigidbody: { enabled: true, type: 'kinematic', mass: 75, restitution: 0.0, friction: 0.2, lockRotations: true },
          collider: { shape: 'capsule', radius: 0.45, height: 1.8 },
          characterController: {
            enabled: true,
            mode: 'thirdPerson',
            speed: 7.0,
            jumpForce: 8.5,
            isGrounded: true,
            cameraDistance: 6.0,
            cameraHeight: 3.5,
            cameraOffsetX: 0.0,
            cameraLerpSpeed: 10.0,
          },
        });
      } else if (kind === 'vehicleController') {
        onUpdatePhysics?.(n.id, {
          rigidbody: { enabled: true, type: 'kinematic', mass: 1200, restitution: 0.1, friction: 0.8 },
          collider: { shape: 'box', size: { x: 2.0, y: 1.2, z: 4.2 } },
          vehicleController: {
            enabled: true,
            engineForce: 55.0,
            maxSpeed: 140.0,
            brakeForce: 70.0,
            steerAngle: 32,
            suspensionStiffness: 35.0,
            suspensionDamping: 4.5,
            suspensionRestLength: 0.6,
            gripFriction: 0.85,
            cameraDistance: 7.5,
            cameraHeight: 2.5,
          },
        });
      } else if (kind === 'logic') {
        onUpdateLogic?.(n.id, { ...(DEFAULT_LOGIC as EntityLogicData) });
      } else if (kind === 'rigAnim') {
        // Base saine (mapping vide, auto coupé) : la configuration
        // (clips, blend tree) se fait dans Rig Studio.
        onUpdateRigAnim?.(n.id, {
          enabled: true,
          rigType: 'biped',
          animationMapping: {},
          autoAnimate: false,
        });
      }
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full py-2 px-3 rounded-xl border border-dashed border-zinc-700 hover:border-sky-500/60 bg-zinc-900/40 hover:bg-sky-500/5 text-zinc-400 hover:text-sky-300 text-xs font-medium flex items-center justify-center gap-2 transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Ajouter un composant{nodes.length > 1 ? ` (${nodes.length} objets)` : ''}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1.5 left-0 right-0 z-50 p-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 shadow-2xl space-y-0.5">
            <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Composants disponibles
            </div>
            {available.map((k) => (
              <button
                key={k.kind}
                type="button"
                onClick={() => applyAdd(k.kind, k.targets)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-left transition-colors group"
              >
                {k.icon}
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-medium text-zinc-200 group-hover:text-white">
                    {k.label}
                  </span>
                  <span className="block text-[9px] text-zinc-500 truncate">{k.desc}</span>
                </span>
                {k.targets.length < nodes.length && (
                  <span className="text-[9px] font-mono text-zinc-500">
                    {k.targets.length}/{nodes.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
