'use client';

import React, { useState } from 'react';
import { Sliders, Activity, Sparkles } from 'lucide-react';
import {
  SceneNode,
  TransformData,
  MaterialData,
  LightData,
  PhysicsNodeData,
  ParticleEmitterData,
  RepeatData,
  RepeatInfo,
} from '../types/engine';
import { RigStudioModal } from './RigStudioModal';
import type { InputManager } from '../lib/physics/CharacterControllerSystem';
import { DEFAULT_FOLLOW_CONFIG, type CameraFollowConfig } from '../lib/core/cameraFollow';
import {
  EntityLogicData,
  NodeGraphData,
} from '../types/logic';
import { RigAnimData } from '../types/engine';
import { InspectorHeader } from './inspector/InspectorHeader';
import { PrefabInspector } from './inspector/PrefabInspector';
import { ModelInfoInspector } from './inspector/ModelInfoInspector';
import { TransformInspector } from './inspector/TransformInspector';
import { RepeatInspector } from './inspector/RepeatInspector';
import { ParticlesInspector } from './inspector/ParticlesInspector';
import { RiverInspector } from './inspector/RiverInspector';
import { MaterialInspector } from './inspector/MaterialInspector';
import { PaletteInspector } from './inspector/PaletteInspector';
import { LightInspector, ShadowsInspector } from './inspector/LightInspector';
import { PhysicsInspector } from './inspector/PhysicsInspector';
import { LogicInspector } from './inspector/LogicInspector';
import { AudioInspector } from './inspector/AudioInspector';
import { RigAnimInspector } from './inspector/RigAnimInspector';
import { CameraFollowInspector } from './inspector/CameraFollowInspector';
import { AddComponentButton } from './inspector/AddComponentButton';
import { ComponentContextMenuHost } from './inspector/ComponentContextMenu';

interface InspectorProps {
  selectedNode: SceneNode | null;
  onUpdateTransform: (id: string, transform: Partial<TransformData>) => void;
  onUpdateMaterial: (id: string, material: Partial<MaterialData>) => void;
  onUpdateLight: (id: string, light: Partial<LightData>) => void;
  onUpdatePhysics?: (id: string, physics: Partial<PhysicsNodeData>) => void;
  onUpdateLogic?: (id: string, logic: Partial<EntityLogicData>) => void;
  onOpenNodeGraph?: (node: SceneNode, initialGraph?: NodeGraphData) => void;
  onOpenTimeline?: (node: SceneNode) => void;
  onUpdateName: (id: string, name: string) => void;
  /** (Re)génère les copies de répétition (count = 0 → suppression totale). */
  onUpdateRepeat?: (id: string, config: Partial<RepeatData>) => void;
  /** Étendue locale + échelle monde (superposition ⇄ espacement). */
  onGetRepeatInfo?: (id: string) => RepeatInfo | null;
  onToggleVisibility: (id: string, visible: boolean) => void;
  onToggleShadows: (id: string, cast: boolean, receive: boolean) => void;
  onFocusObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onDeleteObject: (id: string) => void;
  onUpdateRigAnim?: (id: string, rig: Partial<RigAnimData>) => void;
  onGetChildNames?: (id: string) => string[];
  onAppendAnimations?: (id: string, file: File) => Promise<string[]>;
  onTestAnimation?: (id: string, clipName: string) => void;
  onStopTestAnimation?: (id: string) => void;
  onTestRagdoll?: (id: string) => void;
  onToggleDebugWireframes?: (id: string, show: boolean) => void;
  onUpdateRiverConfig?: (id: string, config: Partial<any>) => void;
  onUpdateParticles?: (id: string, config: Partial<ParticleEmitterData>) => void;
  onUpdateLowPolyPalette?: (id: string, colors: string[] | null) => void;
  onToggleSmoothShading?: (id: string, smooth: boolean) => void;
  onSnapToGround?: (id: string) => void;
  onSaveAsPrefab?: (id: string) => void;
  /** Caméra de suivi : cible assignée (null = caméra libre). */
  cameraFollowTargetId?: string | null;
  cameraFollowConfig?: CameraFollowConfig;
  onAssignCamera?: (id: string) => void;
  onClearCameraFollow?: () => void;
  onFrameFollowed?: () => void;
  onUpdateCameraFollow?: (patch: Partial<CameraFollowConfig>) => void;
  onApplyPrefab?: (id: string) => void;
  onRevertPrefab?: (id: string) => void;
  onUnlinkPrefab?: (id: string) => void;
  prefabName?: string | null;
  workflowMode?: 'decor' | 'character' | 'rules' | 'test';
  getInputManager?: () => InputManager | null;
  /** Tous les nÅ“uds sÃ©lectionnÃ©s (multi-edit). DÃ©faut : [selectedNode]. */
  selectedNodes?: SceneNode[];
  /** Simulation Play active (bannières hot-reload / debugger scripts). */
  isPlaying?: boolean;
  onRemoveComponent?: (
    id: string,
    kind:
      | 'rigidbody'
      | 'collider'
      | 'characterController'
      | 'vehicleController'
      | 'logic'
      | 'rigAnim'
      | 'particles'
  ) => void;
}

export const Inspector: React.FC<InspectorProps> = ({
  selectedNode,
  onUpdateTransform,
  onUpdateMaterial,
  onUpdateLight,
  onUpdatePhysics,
  onUpdateLogic,
  onOpenNodeGraph,
  onOpenTimeline,
  onUpdateName,
  onUpdateRepeat,
  onGetRepeatInfo,
  onToggleVisibility,
  onToggleShadows,
  onFocusObject,
  onDuplicateObject,
  onDeleteObject,
  onUpdateRigAnim,
  onGetChildNames,
  onAppendAnimations,
  onTestAnimation,
  onStopTestAnimation,
  onTestRagdoll,
  onToggleDebugWireframes,
  onUpdateRiverConfig,
  onUpdateParticles,
  onUpdateLowPolyPalette,
  onToggleSmoothShading,
  onSnapToGround,
  onSaveAsPrefab,
  cameraFollowTargetId,
  cameraFollowConfig,
  onAssignCamera,
  onClearCameraFollow,
  onFrameFollowed,
  onUpdateCameraFollow,
  onApplyPrefab,
  onRevertPrefab,
  onUnlinkPrefab,
  prefabName,
  workflowMode = 'decor',
  getInputManager,
  selectedNodes,
  onRemoveComponent,
  isPlaying,
}: InspectorProps) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'physics' | 'logic' | 'audio'>('properties');
  const [isRigStudioOpen, setIsRigStudioOpen] = useState(false);
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(
        typeof window !== 'undefined'
          ? window.localStorage.getItem('aether.inspector.collapsed') || '{}'
          : '{}'
      );
    } catch {
      return {};
    }
  });

  const toggleSection = (key: string) => {
    setCollapsedMap((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem('aether.inspector.collapsed', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const sectionState = (key: string) => ({
    collapsed: Boolean(collapsedMap[key]),
    onToggleCollapse: () => toggleSection(key),
  });
  const collapseApi = {
    isCollapsed: (key: string) => Boolean(collapsedMap[key]),
    toggle: toggleSection,
  };

  React.useEffect(() => {
    if (workflowMode === 'decor') {
      setActiveTab('properties');
    } else if (workflowMode === 'rules') {
      setActiveTab('logic');
    } else if (workflowMode === 'character') {
      setActiveTab('properties');
    }
  }, [workflowMode]);

  const nodes: SceneNode[] =
    selectedNodes && selectedNodes.length > 0
      ? selectedNodes
      : selectedNode
        ? [selectedNode]
        : [];

  if (nodes.length === 0) {
    let title = "Aucun objet sélectionné";
    let desc = "Sélectionnez un élément dans le Viewport 3D, l'arborescence ou glissez un asset depuis le panneau inférieur.";
    let icon = <Sliders className="w-5 h-5 text-zinc-400" />;

    if (workflowMode === 'decor') {
      title = "Créer le monde 🗺️";
      desc = "Sélectionnez un objet ou ajoutez des éléments (cube, rivière, soleil) depuis la bibliothèque en bas pour décorer votre monde.";
    } else if (workflowMode === 'character') {
      title = "Studio Personnage 👤";
      desc = "Ajoutez un 'Joueur FPS/3P' depuis le panneau inférieur, puis sélectionnez-le pour paramétrer ses animations et vitesses.";
    } else if (workflowMode === 'rules') {
      title = "Règles & Comportements ⚡";
      desc = "Sélectionnez n'importe quel objet pour lui ajouter des règles de jeu, des scripts ou des cartes de logique visuelle.";
    } else if (workflowMode === 'test') {
      title = "Tester & Publier 🚀";
      desc = "Cliquez sur le bouton vert Play en haut pour jouer (ajoutez d'abord un joueur depuis la barre d'outils), puis exportez ou partagez votre jeu.";
    }

    return (
      <div
        id="inspector-panel-empty"
        className="w-80 h-full flex flex-col items-center justify-center p-6 bg-zinc-950/95 border-l border-zinc-800/80 text-center select-none z-20"
      >
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 shadow-inner">
          {icon}
        </div>
        <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider mb-1">
          {title}
        </h3>
        <p className="text-[11px] text-zinc-400 max-w-[210px] leading-relaxed">
          {desc}
        </p>
      </div>
    );
  }

  const sectionUpdaters = {
    onUpdateTransform,
    onUpdateMaterial,
    onUpdateLight,
    onUpdatePhysics,
    onUpdateLogic,
    onUpdateRigAnim,
    onUpdateRiverConfig,
    onUpdateParticles,
    onUpdateLowPolyPalette,
    onUpdateRepeat,
    onGetRepeatInfo,
    onToggleSmoothShading,
    onRemoveComponent,
    onSnapToGround,
  };

  return (
    <div
      id="inspector-panel"
      className="w-80 h-full flex flex-col bg-zinc-950/95 border-l border-zinc-800/80 select-none z-20 text-xs overflow-hidden"
    >
      <InspectorHeader
        nodes={nodes}
        onUpdateName={(name) => nodes.forEach((n) => onUpdateName(n.id, name))}
        onToggleVisibility={() =>
          nodes.forEach((n) => onToggleVisibility(n.id, n.visible))
        }
        onFocusObject={() => onFocusObject(nodes[0].id)}
        onDuplicateObject={() => onDuplicateObject(nodes[0].id)}
        onDeleteObject={() => onDeleteObject(nodes[0].id)}
        onSaveAsPrefab={() => onSaveAsPrefab?.(nodes[0].id)}
        onOpenTimeline={onOpenTimeline ? () => onOpenTimeline(nodes[0]) : undefined}
        onOpenRigStudio={() => setIsRigStudioOpen(true)}
      />

      <CameraFollowInspector
        node={nodes[0]}
        followTargetId={cameraFollowTargetId ?? null}
        config={cameraFollowConfig ?? DEFAULT_FOLLOW_CONFIG}
        onAssign={() => onAssignCamera?.(nodes[0].id)}
        onClear={() => onClearCameraFollow?.()}
        onFrame={() => onFrameFollowed?.()}
        onConfigChange={(patch) => onUpdateCameraFollow?.(patch)}
      />

      <PrefabInspector
        nodes={nodes}
        {...sectionUpdaters}
        onApplyPrefab={onApplyPrefab}
        onRevertPrefab={onRevertPrefab}
        onUnlinkPrefab={onUnlinkPrefab}
        prefabName={prefabName}
      />

      {isRigStudioOpen && (
        <RigStudioModal
          isOpen={isRigStudioOpen}
          node={nodes[0]}
          onClose={() => setIsRigStudioOpen(false)}
          onSave={(data) => onUpdateRigAnim?.(nodes[0].id, data)}
          availableAnimations={nodes[0].modelInfo?.animations || []}
          childNodeNames={onGetChildNames?.(nodes[0].id) || []}
          onAppendAnimations={
            onAppendAnimations ? (file) => onAppendAnimations(nodes[0].id, file) : undefined
          }
          onTestAnimation={
            onTestAnimation ? (clipName) => onTestAnimation(nodes[0].id, clipName) : undefined
          }
          onStopTestAnimation={
            onStopTestAnimation ? () => onStopTestAnimation(nodes[0].id) : undefined
          }
          onTestRagdoll={onTestRagdoll ? () => onTestRagdoll(nodes[0].id) : undefined}
          onToggleDebugWireframes={
            onToggleDebugWireframes
              ? (show) => onToggleDebugWireframes(nodes[0].id, show)
              : undefined
          }
          getInputManager={getInputManager}
        />
      )}

      {/* 3-Mode Segmented Tabs (Propriétés / Physique / Logique) */}
      {workflowMode !== 'decor' && (
        <div className="grid grid-cols-4 gap-1 px-3.5 pt-2 pb-1 bg-zinc-950 border-b border-zinc-800/60 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('properties')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
              activeTab === 'properties'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <Sliders className="w-3 h-3 text-sky-400" />
            <span>Propriétés</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('physics')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
              activeTab === 'physics'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <Activity className="w-3 h-3 text-amber-400" />
            <span>Physique</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logic')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
              activeTab === 'logic'
                ? 'bg-violet-950/60 text-violet-200 shadow-sm border border-violet-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <Sparkles className="w-3 h-3 text-violet-400" />
            <span>Logique</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
              activeTab === 'audio'
                ? 'bg-emerald-950/60 text-emerald-200 shadow-sm border border-emerald-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>Audio</span>
          </button>
        </div>
      )}

      {/* Scrollable Properties body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {activeTab === 'properties' && (
          <>
            <ModelInfoInspector nodes={nodes} {...sectionUpdaters} />
            <TransformInspector nodes={nodes} {...sectionUpdaters} {...sectionState('transform')} />
            <RepeatInspector nodes={nodes} {...sectionUpdaters} {...sectionState('repeat')} />
            <RigAnimInspector
              nodes={nodes}
              {...sectionUpdaters}
              onOpenRigStudio={() => setIsRigStudioOpen(true)}
              {...sectionState('riganim')}
            />
            <ParticlesInspector nodes={nodes} {...sectionUpdaters} {...sectionState('particles')} />
            <RiverInspector nodes={nodes} {...sectionUpdaters} {...sectionState('river')} />
            <MaterialInspector nodes={nodes} {...sectionUpdaters} {...sectionState('material')} />
            <PaletteInspector nodes={nodes} {...sectionUpdaters} {...sectionState('palette')} />
            <LightInspector nodes={nodes} {...sectionUpdaters} {...sectionState('light')} />
            <ShadowsInspector
              nodes={nodes}
              {...sectionUpdaters}
              onToggleShadows={onToggleShadows}
              {...(() => sectionState('shadows'))()}
            />
          </>
        )}

        {activeTab === 'physics' && (
          <PhysicsInspector
            nodes={nodes}
            {...sectionUpdaters}
            onOpenRigStudio={() => setIsRigStudioOpen(true)}
            onTestRagdoll={onTestRagdoll}
            collapseApi={collapseApi}
          />
        )}

        {activeTab === 'logic' && (
          <LogicInspector
            nodes={nodes}
            {...sectionUpdaters}
            onOpenNodeGraph={onOpenNodeGraph}
            isPlaying={isPlaying}
            {...sectionState('logic')}
          />
        )}

        {activeTab === 'audio' && (
          <AudioInspector
            nodes={nodes}
            {...sectionUpdaters}
            isPlaying={isPlaying}
            {...sectionState('audio')}
          />
        )}

        <AddComponentButton
          nodes={nodes}
          onUpdatePhysics={onUpdatePhysics}
          onUpdateLogic={onUpdateLogic}
          onUpdateRigAnim={onUpdateRigAnim}
        />
      </div>

      {/* Hôte du menu contextuel des composants (event-bus) */}
      <ComponentContextMenuHost />
    </div>
  );
};
