'use client';

import React from 'react';
import { Activity, Gamepad2, Car, Zap } from 'lucide-react';
import type { ColliderData, PhysicsNodeData } from '../../types/engine';
import { SectionProps, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { StyledSlider, MiniSwitch } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';

export interface CollapseApi {
  isCollapsed: (key: string) => boolean;
  toggle: (key: string) => void;
}

/**
 * PhysicsInspector — Rigidbody (+Collider), CharacterController,
 * VehicleController, Ragdoll. Chaque bloc est pliable / activable /
 * supprimable indépendamment. Multi-edit ventilé par objet.
 */
export function PhysicsInspector({
  nodes,
  onUpdatePhysics,
  onRemoveComponent,
  onOpenRigStudio,
  onTestRagdoll,
  collapseApi,
}: SectionProps & {
  onOpenRigStudio: () => void;
  onTestRagdoll?: (id: string) => void;
  collapseApi?: CollapseApi;
}) {
  const targets = nodes.filter((n) => n.type !== 'light');
  const isC = (key: string) => collapseApi?.isCollapsed(key) ?? false;
  const toggle = (key: string) => collapseApi?.toggle(key);

  if (targets.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 text-center space-y-2">
        <Activity className="w-6 h-6 text-zinc-600 mx-auto" />
        <p className="text-xs text-zinc-400">
          Les sources lumineuses n&apos;ont pas de corps physique. Sélectionnez un Mesh ou un Groupe 3D.
        </p>
      </div>
    );
  }

  const updateAll = (build: (n: (typeof targets)[number]) => Partial<PhysicsNodeData>) => {
    targets.forEach((n) => onUpdatePhysics?.(n.id, build(n)));
  };
  const removeAll = (kind: 'rigidbody' | 'collider' | 'characterController' | 'vehicleController') => {
    targets.forEach((n) => onRemoveComponent?.(n.id, kind));
  };

  const rbTargets = targets.filter((n) => n.physics?.rigidbody);
  const ccTargets = targets.filter((n) => n.physics?.characterController);
  const vcTargets = targets.filter((n) => n.physics?.vehicleController);

  const rbEnabled = mixedValue(targets, (n) => Boolean(n.physics?.rigidbody?.enabled));
  const ccEnabled = mixedValue(targets, (n) => Boolean(n.physics?.characterController?.enabled));
  const vcEnabled = mixedValue(targets, (n) => Boolean(n.physics?.vehicleController?.enabled));

  const enableRigidbody = (n: (typeof targets)[number]) => {
    const currentRb = n.physics?.rigidbody;
    const enabled = !currentRb?.enabled;
    onUpdatePhysics?.(n.id, {
      rigidbody: {
        enabled,
        type: currentRb?.type || 'dynamic',
        mass: currentRb?.mass ?? 1.0,
        restitution: currentRb?.restitution ?? 0.4,
        friction: currentRb?.friction ?? 0.5,
        lockRotations: currentRb?.lockRotations ?? false,
      },
      collider: n.physics?.collider || {
        shape: n.subType === 'sphere' ? 'sphere' : 'auto',
      },
    });
  };

  const enableCharacter = (n: (typeof targets)[number]) => {
    const currentCc = n.physics?.characterController;
    const enabled = !currentCc?.enabled;
    onUpdatePhysics?.(n.id, {
      rigidbody: {
        enabled: true,
        type: 'kinematic',
        mass: 75,
        restitution: 0.0,
        friction: 0.2,
        lockRotations: true,
      },
      collider: {
        shape: 'capsule',
        radius: 0.45,
        height: 1.8,
      },
      characterController: {
        enabled,
        mode: currentCc?.mode || 'thirdPerson',
        speed: currentCc?.speed ?? 7.0,
        jumpForce: currentCc?.jumpForce ?? 8.5,
        isGrounded: true,
        cameraDistance: currentCc?.cameraDistance ?? 6.0,
        cameraHeight: currentCc?.cameraHeight ?? 3.5,
        cameraOffsetX: currentCc?.cameraOffsetX ?? 0.0,
        cameraLerpSpeed: currentCc?.cameraLerpSpeed ?? 10.0,
      },
    });
  };

  const enableVehicle = (n: (typeof targets)[number]) => {
    const currentVc = n.physics?.vehicleController;
    const enabled = !currentVc?.enabled;
    onUpdatePhysics?.(n.id, {
      rigidbody: {
        enabled: true,
        type: 'kinematic',
        mass: 1200,
        restitution: 0.1,
        friction: 0.8,
      },
      collider: {
        shape: 'box',
        size: { x: 2.0, y: 1.2, z: 4.2 },
      },
      vehicleController: {
        enabled,
        engineForce: currentVc?.engineForce ?? 55.0,
        maxSpeed: currentVc?.maxSpeed ?? 140.0,
        brakeForce: currentVc?.brakeForce ?? 70.0,
        steerAngle: currentVc?.steerAngle ?? 32,
        suspensionStiffness: currentVc?.suspensionStiffness ?? 35.0,
        suspensionDamping: currentVc?.suspensionDamping ?? 4.5,
        suspensionRestLength: currentVc?.suspensionRestLength ?? 0.6,
        gripFriction: currentVc?.gripFriction ?? 0.85,
        cameraDistance: currentVc?.cameraDistance ?? 7.5,
        cameraHeight: currentVc?.cameraHeight ?? 2.5,
      },
    });
  };

  const rbRef = rbTargets[0];
  const ccRef = ccTargets[0];
  const vcRef = vcTargets[0];

  return (
    <>
      {/* Rigidbody (+Collider) */}
      <div
        className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          fireComponentMenu(e, 'Rigidbody', [
            {
              label: 'Copier les valeurs',
              hint: 'JSON',
              onClick: () =>
                copyText(
                  JSON.stringify(
                    rbTargets.map((n) => ({ name: n.name, physics: n.physics })),
                    null,
                    2
                  )
                ),
            },
            {
              label: 'Réinitialiser',
              onClick: () =>
                updateAll((n) => ({
                  rigidbody: {
                    enabled: n.physics?.rigidbody?.enabled ?? true,
                    type: 'dynamic',
                    mass: 1.0,
                    restitution: 0.4,
                    friction: 0.5,
                    lockRotations: false,
                  },
                  collider: { shape: 'auto' as const },
                })),
            },
            ...(onRemoveComponent && rbTargets.length > 0
              ? [
                  {
                    label: 'Retirer le Rigidbody',
                    danger: true,
                    onClick: () => removeAll('rigidbody' as const),
                  },
                ]
              : []),
          ]);
        }}
      >
        <ComponentHeader
          icon={<Activity className="w-3.5 h-3.5 text-sky-400" />}
          title="Physique Rapier 3D"
          badge="ECS"
          mixed={rbEnabled.mixed}
          collapsed={isC('physics.rigidbody')}
          onToggleCollapse={() => toggle('physics.rigidbody')}
          onRemove={onRemoveComponent && rbTargets.length > 0 ? () => removeAll('rigidbody') : undefined}
          removeTitle="Retirer le Rigidbody (+Collider)"
          removeConfirm="Retirer le Rigidbody des objets sélectionnés ?"
        />

        {!isC('physics.rigidbody') && (
          <>
            {/* Rigidbody Toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-300">Activer Rigidbody</span>
              <MiniSwitch
                active={Boolean(rbEnabled.value)}
                onToggle={() => targets.forEach((n) => enableRigidbody(n))}
              />
            </div>

            {rbRef?.physics?.rigidbody?.enabled && (
              <div className="space-y-3 pt-1 border-t border-zinc-800/60">
                {/* Sync réseau multijoueur (hôte autoritaire) */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-300" title="Synchronise la transform en multijoueur P2P (interpolation côté clients)">
                    Sync réseau (multi)
                  </span>
                  <MiniSwitch
                    active={rbRef.physics?.netSync === true}
                    onToggle={() =>
                      updateAll((n) => ({ netSync: !(n.physics?.netSync === true) }))
                    }
                  />
                </div>
                {/* Rigidbody Type Buttons */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-zinc-400">Type de Corps</span>
                  <div className="grid grid-cols-3 gap-1 p-0.5 bg-zinc-950 rounded-xl border border-zinc-800">
                    {(['dynamic', 'static', 'kinematic'] as const).map((bType) => (
                      <button
                        key={bType}
                        type="button"
                        onClick={() =>
                          updateAll((n) => ({
                            rigidbody: {
                              ...n.physics!.rigidbody!,
                              type: bType,
                            },
                          }))
                        }
                        className={`py-1 text-[10px] font-medium rounded-lg capitalize transition-all ${
                          rbRef.physics?.rigidbody?.type === bType
                            ? 'bg-sky-500 text-white shadow'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {bType}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Collider Shape */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-zinc-400">Forme du Collider</span>
                  <select
                    value={rbRef.physics?.collider?.shape || 'auto'}
                    onChange={(e) =>
                      updateAll((n) => ({
                        collider: {
                          ...n.physics?.collider,
                          shape: e.target.value as ColliderData['shape'],
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="auto">Auto-Fit Intelligent</option>
                    <option value="box">Boîte (Box)</option>
                    <option value="sphere">Sphère (Sphere)</option>
                    <option value="capsule">Capsule</option>
                    <option value="cylinder">Cylindre</option>
                    <option value="trimesh">Trimesh (Auto-fit Modèle 3D)</option>
                  </select>
                </div>

                {/* Mass (if dynamic) */}
                {rbRef.physics?.rigidbody?.type === 'dynamic' && (
                  <div className="space-y-1">
                    <StyledSlider
                      label="Masse (kg)"
                      display={`${(rbRef.physics.rigidbody.mass ?? 1).toFixed(1)} kg`}
                      value={rbRef.physics.rigidbody.mass ?? 1}
                      mixed={mixedValue(rbTargets, (n) => n.physics?.rigidbody?.mass ?? 1).mixed}
                      min={0.1}
                      max={50}
                      step={0.5}
                      accent="accent-sky-400"
                      labelClassName="text-zinc-400"
                      displayClassName="font-mono text-zinc-300"
                      onChange={(v) =>
                        updateAll((n) => ({
                          rigidbody: { ...n.physics!.rigidbody!, mass: v },
                        }))
                      }
                    />
                  </div>
                )}

                {/* Restitution (Bounciness) */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Rebond (Restitution)"
                    display={(rbRef.physics?.rigidbody?.restitution ?? 0.4).toFixed(2)}
                    value={rbRef.physics?.rigidbody?.restitution ?? 0.4}
                    mixed={mixedValue(rbTargets, (n) => n.physics?.rigidbody?.restitution ?? 0.4).mixed}
                    min={0}
                    max={1}
                    step={0.05}
                    accent="accent-sky-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        rigidbody: { ...n.physics!.rigidbody!, restitution: v },
                      }))
                    }
                  />
                </div>

                {/* Friction */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Friction"
                    display={(rbRef.physics?.rigidbody?.friction ?? 0.5).toFixed(2)}
                    value={rbRef.physics?.rigidbody?.friction ?? 0.5}
                    mixed={mixedValue(rbTargets, (n) => n.physics?.rigidbody?.friction ?? 0.5).mixed}
                    min={0}
                    max={1}
                    step={0.05}
                    accent="accent-sky-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        rigidbody: { ...n.physics!.rigidbody!, friction: v },
                      }))
                    }
                  />
                </div>

                {/* Lock Rotations */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-zinc-400">Bloquer Rotations (Freeze)</span>
                  <MiniSwitch
                    active={Boolean(rbRef.physics?.rigidbody?.lockRotations)}
                    onToggle={() =>
                      updateAll((n) => ({
                        rigidbody: {
                          ...n.physics!.rigidbody!,
                          lockRotations: !n.physics?.rigidbody?.lockRotations,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Character Controller Section (Ready-to-use FPS / 3rd Person) */}
      <div
        className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          fireComponentMenu(e, 'Character Controller', [
            {
              label: 'Copier les valeurs',
              hint: 'JSON',
              onClick: () =>
                copyText(
                  JSON.stringify(
                    ccTargets.map((n) => ({
                      name: n.name,
                      characterController: n.physics?.characterController,
                    })),
                    null,
                    2
                  )
                ),
            },
            {
              label: 'Réinitialiser',
              onClick: () =>
                updateAll((n) => ({
                  characterController: {
                    enabled: n.physics?.characterController?.enabled ?? true,
                    mode: 'thirdPerson' as const,
                    speed: 7.0,
                    jumpForce: 8.5,
                    isGrounded: true,
                    cameraDistance: 6.0,
                    cameraHeight: 3.5,
                    cameraOffsetX: 0.0,
                    cameraLerpSpeed: 10.0,
                  },
                })),
            },
            ...(onRemoveComponent && ccTargets.length > 0
              ? [
                  {
                    label: 'Retirer le Character Controller',
                    danger: true,
                    onClick: () => removeAll('characterController' as const),
                  },
                ]
              : []),
          ]);
        }}
      >
        <ComponentHeader
          icon={<Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />}
          title="Character Controller"
          badge="Playable"
          mixed={ccEnabled.mixed}
          collapsed={isC('physics.character')}
          onToggleCollapse={() => toggle('physics.character')}
          onRemove={onRemoveComponent && ccTargets.length > 0 ? () => removeAll('characterController') : undefined}
          removeTitle="Retirer le Character Controller"
          removeConfirm="Retirer le Character Controller des objets sélectionnés ?"
        />

        {!isC('physics.character') && (
          <>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-300">Contrôleur Joueur</span>
              <MiniSwitch
                active={Boolean(ccEnabled.value)}
                activeColor="bg-emerald-500"
                onToggle={() => targets.forEach((n) => enableCharacter(n))}
              />
            </div>

            {ccRef?.physics?.characterController?.enabled && (
              <div className="space-y-3 pt-1 border-t border-zinc-800/60">
                {/* Controller Mode */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-zinc-400">Mode Caméra & Déplacement</span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-zinc-950 rounded-xl border border-zinc-800">
                    {(
                      [
                        ['thirdPerson', '3rd Person'],
                        ['firstPerson', 'FPS (1st Person)'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          updateAll((n) => ({
                            characterController: {
                              ...n.physics!.characterController!,
                              mode,
                            },
                          }))
                        }
                        className={`py-1 text-[10px] font-medium rounded-lg transition-all ${
                          ccRef.physics?.characterController?.mode === mode
                            ? 'bg-emerald-500 text-white shadow'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speed */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Vitesse de Course"
                    display={`${(ccRef.physics.characterController.speed ?? 7).toFixed(1)} m/s`}
                    value={ccRef.physics.characterController.speed ?? 7}
                    mixed={mixedValue(ccTargets, (n) => n.physics?.characterController?.speed ?? 7).mixed}
                    min={1}
                    max={15}
                    step={0.5}
                    accent="accent-emerald-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        characterController: { ...n.physics!.characterController!, speed: v },
                      }))
                    }
                  />
                </div>

                {/* Jump Force */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Force de Saut"
                    display={(ccRef.physics.characterController.jumpForce ?? 8.5).toFixed(1)}
                    value={ccRef.physics.characterController.jumpForce ?? 8.5}
                    mixed={mixedValue(ccTargets, (n) => n.physics?.characterController?.jumpForce ?? 8.5).mixed}
                    min={3}
                    max={15}
                    step={0.5}
                    accent="accent-emerald-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        characterController: { ...n.physics!.characterController!, jumpForce: v },
                      }))
                    }
                  />
                </div>

                {ccRef.physics.characterController.mode === 'thirdPerson' && (
                  <div className="space-y-3 pt-3 border-t border-zinc-800/60">
                    <span className="text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider block">
                      Paramètres de Caméra
                    </span>

                    {/* Camera Distance */}
                    <div className="space-y-1">
                      <StyledSlider
                        label="Recul de Caméra"
                        display={`${(ccRef.physics.characterController.cameraDistance ?? 6.0).toFixed(1)} m`}
                        value={ccRef.physics.characterController.cameraDistance ?? 6.0}
                        mixed={mixedValue(ccTargets, (n) => n.physics?.characterController?.cameraDistance ?? 6.0).mixed}
                        min={2}
                        max={15}
                        step={0.5}
                        accent="accent-emerald-400"
                        labelClassName="text-zinc-400"
                        displayClassName="font-mono text-zinc-300"
                        onChange={(v) =>
                          updateAll((n) => ({
                            characterController: { ...n.physics!.characterController!, cameraDistance: v },
                          }))
                        }
                      />
                    </div>

                    {/* Camera Height */}
                    <div className="space-y-1">
                      <StyledSlider
                        label="Hauteur de Caméra"
                        display={`${(ccRef.physics.characterController.cameraHeight ?? 3.5).toFixed(1)} m`}
                        value={ccRef.physics.characterController.cameraHeight ?? 3.5}
                        mixed={mixedValue(ccTargets, (n) => n.physics?.characterController?.cameraHeight ?? 3.5).mixed}
                        min={0.5}
                        max={10}
                        step={0.5}
                        accent="accent-emerald-400"
                        labelClassName="text-zinc-400"
                        displayClassName="font-mono text-zinc-300"
                        onChange={(v) =>
                          updateAll((n) => ({
                            characterController: { ...n.physics!.characterController!, cameraHeight: v },
                          }))
                        }
                      />
                    </div>

                    {/* Camera Offset X */}
                    <div className="space-y-1">
                      <StyledSlider
                        label="Décalage Épaule (X)"
                        display={`${(ccRef.physics.characterController.cameraOffsetX ?? 0.0).toFixed(1)} m`}
                        value={ccRef.physics.characterController.cameraOffsetX ?? 0.0}
                        mixed={mixedValue(ccTargets, (n) => n.physics?.characterController?.cameraOffsetX ?? 0.0).mixed}
                        min={-4}
                        max={4}
                        step={0.2}
                        accent="accent-emerald-400"
                        labelClassName="text-zinc-400"
                        displayClassName="font-mono text-zinc-300"
                        onChange={(v) =>
                          updateAll((n) => ({
                            characterController: { ...n.physics!.characterController!, cameraOffsetX: v },
                          }))
                        }
                      />
                    </div>

                    {/* Follow Smoothness */}
                    <div className="space-y-1">
                      <StyledSlider
                        label="Vitesse de Suivi (Lerp)"
                        display={`${ccRef.physics.characterController.cameraLerpSpeed ?? 10} Hz`}
                        value={ccRef.physics.characterController.cameraLerpSpeed ?? 10}
                        mixed={mixedValue(ccTargets, (n) => n.physics?.characterController?.cameraLerpSpeed ?? 10).mixed}
                        min={1}
                        max={25}
                        step={1}
                        accent="accent-emerald-400"
                        labelClassName="text-zinc-400"
                        displayClassName="font-mono text-zinc-300"
                        onChange={(v) =>
                          updateAll((n) => ({
                            characterController: { ...n.physics!.characterController!, cameraLerpSpeed: parseInt(String(v)) },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Controls Banner */}
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                    Contrôles en mode Play :
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-400">
                    <span>• ZQSD / Flèches</span>
                    <span>• Espace : Sauter</span>
                    <span>• Shift : Sprint</span>
                    <span>• E / F / C / V : Gestes</span>
                    <span className="col-span-2 text-emerald-400/80">• Touches modifiables : Rig Studio → Contrôles</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Vehicle Controller Section (3D Car Driving Physics) */}
      <div
        className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          fireComponentMenu(e, 'Contrôleur Véhicule', [
            {
              label: 'Copier les valeurs',
              hint: 'JSON',
              onClick: () =>
                copyText(
                  JSON.stringify(
                    vcTargets.map((n) => ({
                      name: n.name,
                      vehicleController: n.physics?.vehicleController,
                    })),
                    null,
                    2
                  )
                ),
            },
            {
              label: 'Réinitialiser',
              onClick: () =>
                updateAll((n) => ({
                  vehicleController: {
                    enabled: n.physics?.vehicleController?.enabled ?? true,
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
                })),
            },
            ...(onRemoveComponent && vcTargets.length > 0
              ? [
                  {
                    label: 'Retirer le Contrôleur Véhicule',
                    danger: true,
                    onClick: () => removeAll('vehicleController' as const),
                  },
                ]
              : []),
          ]);
        }}
      >
        <ComponentHeader
          icon={<Car className="w-3.5 h-3.5 text-sky-400" />}
          title="Contrôleur Véhicule 3D"
          badge="Drive Physics"
          mixed={vcEnabled.mixed}
          collapsed={isC('physics.vehicle')}
          onToggleCollapse={() => toggle('physics.vehicle')}
          onRemove={onRemoveComponent && vcTargets.length > 0 ? () => removeAll('vehicleController') : undefined}
          removeTitle="Retirer le Contrôleur Véhicule"
          removeConfirm="Retirer le Contrôleur Véhicule des objets sélectionnés ?"
        />

        {!isC('physics.vehicle') && (
          <>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-zinc-300">Physique Automobile</span>
              <MiniSwitch
                active={Boolean(vcEnabled.value)}
                onToggle={() => targets.forEach((n) => enableVehicle(n))}
              />
            </div>

            {vcRef?.physics?.vehicleController?.enabled && (
              <div className="space-y-3 pt-1 border-t border-zinc-800/60 text-xs">
                {/* Accélération / Engine Force */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Force d'Accélération"
                    display={`${(vcRef.physics.vehicleController.engineForce ?? 55).toFixed(0)} N`}
                    value={vcRef.physics.vehicleController.engineForce ?? 55}
                    mixed={mixedValue(vcTargets, (n) => n.physics?.vehicleController?.engineForce ?? 55).mixed}
                    min={10}
                    max={150}
                    step={5}
                    accent="accent-sky-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        vehicleController: { ...n.physics!.vehicleController!, engineForce: v },
                      }))
                    }
                  />
                </div>

                {/* Max Speed */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Vitesse Maximale"
                    display={`${(vcRef.physics.vehicleController.maxSpeed ?? 140).toFixed(0)} km/h`}
                    value={vcRef.physics.vehicleController.maxSpeed ?? 140}
                    mixed={mixedValue(vcTargets, (n) => n.physics?.vehicleController?.maxSpeed ?? 140).mixed}
                    min={30}
                    max={300}
                    step={5}
                    accent="accent-sky-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        vehicleController: { ...n.physics!.vehicleController!, maxSpeed: v },
                      }))
                    }
                  />
                </div>

                {/* Steering Angle */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Angle de Braquage"
                    display={`${(vcRef.physics.vehicleController.steerAngle ?? 32).toFixed(0)}°`}
                    value={vcRef.physics.vehicleController.steerAngle ?? 32}
                    mixed={mixedValue(vcTargets, (n) => n.physics?.vehicleController?.steerAngle ?? 32).mixed}
                    min={10}
                    max={50}
                    step={1}
                    accent="accent-sky-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        vehicleController: { ...n.physics!.vehicleController!, steerAngle: v },
                      }))
                    }
                  />
                </div>

                {/* Brake Force */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Puissance de Freinage"
                    display={(vcRef.physics.vehicleController.brakeForce ?? 70).toFixed(0)}
                    value={vcRef.physics.vehicleController.brakeForce ?? 70}
                    mixed={mixedValue(vcTargets, (n) => n.physics?.vehicleController?.brakeForce ?? 70).mixed}
                    min={20}
                    max={180}
                    step={5}
                    accent="accent-sky-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        vehicleController: { ...n.physics!.vehicleController!, brakeForce: v },
                      }))
                    }
                  />
                </div>

                {/* Grip Friction / Drift */}
                <div className="space-y-1">
                  <StyledSlider
                    label="Adhérence / Drift (Pneus)"
                    display={(vcRef.physics.vehicleController.gripFriction ?? 0.85).toFixed(2)}
                    value={vcRef.physics.vehicleController.gripFriction ?? 0.85}
                    mixed={mixedValue(vcTargets, (n) => n.physics?.vehicleController?.gripFriction ?? 0.85).mixed}
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    accent="accent-sky-400"
                    labelClassName="text-zinc-400"
                    displayClassName="font-mono text-zinc-300"
                    onChange={(v) =>
                      updateAll((n) => ({
                        vehicleController: { ...n.physics!.vehicleController!, gripFriction: v },
                      }))
                    }
                  />
                  <div className="flex justify-between text-[9px] text-zinc-500">
                    <span>Drift Glissant</span>
                    <span>Accroche Maximale</span>
                  </div>
                </div>

                {/* Controls Banner */}
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] font-semibold text-sky-400 uppercase tracking-wider">
                    Contrôles Véhicule en Play :
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-400">
                    <span>• Z/S : Accélérer / Reculer</span>
                    <span>• Q/D : Diriger le Volant</span>
                    <span>• Espace : Frein à Main (Drift)</span>
                    <span>• Shift : Nitro Boost</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Ragdoll & Poupée de Chiffon Quick Section */}
      <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3">
        <ComponentHeader
          icon={<Activity className="w-3.5 h-3.5 text-amber-400" />}
          title="Physique Ragdoll 3D"
          badge="Poupée de Chiffon"
          collapsed={isC('physics.ragdoll')}
          onToggleCollapse={() => toggle('physics.ragdoll')}
        />

        {!isC('physics.ragdoll') && (
          <>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Colliders capsules sur le squelette (bassin, torse, membres) avec déclenchement automatique lors des dégâts ou chutes.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onOpenRigStudio}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Configurer Ragdoll</span>
              </button>
              {onTestRagdoll && (
                <button
                  type="button"
                  onClick={() => onTestRagdoll(targets[0].id)}
                  className="py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs transition-all flex items-center gap-1"
                  title="Activer/Désactiver le ragdoll immédiatement"
                >
                  <span>Tester</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
