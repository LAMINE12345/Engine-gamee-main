'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import {
  Box,
  Circle,
  Cylinder,
  Layers,
  LifeBuoy,
  Triangle,
  Sun,
  Zap,
  Camera,
  Car,
  Sparkles,
  Waves,
  Target,
  BoxSelect,
  Flag,
  MapPin,
  Aperture,
  Gamepad2,
  Copy,
  ClipboardCopy,
  ClipboardPaste,
  Trash2,
  Group,
  Ungroup,
  Focus,
  Compass,
  Undo2,
  Redo2,
  History,
  RotateCcw,
  Eraser,
  PanelLeft,
  PanelLeftClose,
  FolderOpen,
  Maximize2,
  Minimize2,
  Activity,
  Scan,
  Magnet,
  CloudSun,
  LayoutTemplate,
  Image as ImageIcon,
  Drama,
  Film,
  Users,
  GitBranch,
  Share2,
  Rocket,
  Upload,
  Play,
  Square,
  // `Map` est importé sous l'alias `MapIcon` : l'application utilise aussi
  // la classe `Map` native de JS dans page.tsx.
  Map as MapIcon,
  UserRound,
  HelpCircle,
} from 'lucide-react';
import { SceneManager } from '../lib/SceneManager';
import type { CameraViewPreset } from '../lib/core/CameraManager';
import {
  DEFAULT_FOLLOW_CONFIG,
  type CameraFollowConfig,
} from '../lib/core/cameraFollow';
import { Viewport } from '../components/Viewport';
import { Hierarchy } from '../components/Hierarchy';
import { Inspector } from '../components/Inspector';
import { Toolbar } from '../components/Toolbar';
import { AssetManager } from '../components/AssetManager';
import { NodeGraphModal } from '../components/NodeGraphModal';
import { AtmosphereModal } from '../components/AtmosphereModal';
import { MultiplayerModal } from '../components/MultiplayerModal';
import { CollabModal } from '../components/CollabModal';
import { ShareModal } from '../components/ShareModal';
import { PwaRegister, promptPwaInstall } from '../components/PwaRegister';
import { encodeSceneToUrl } from '../lib/share/shareUrl';
import { AnimatorModal } from '../components/AnimatorModal';
import type { AnimatorCandidate } from '../components/AnimatorModal';
import type { PeerMeta } from '../lib/net/types';
import type { AnimatorControllerData } from '../types/animation';
import { buildLocomotionController } from '../lib/animation/animator';
import type { FoliageLibraryEntry } from '../lib/terrain/FoliagePainter';
import { renderLowPolyThumbnails } from '../lib/lowPolyThumbnails';
import { HUDManagerModal } from '../components/HUDManagerModal';
import { InGameHUDOverlay } from '../components/InGameHUDOverlay';
import { FloatingDamageHUD } from '../components/FloatingDamageHUD';
import { DialogueCinematicOverlay } from '../components/DialogueCinematicOverlay';
import { ExportModal } from '../components/ExportModal';
import { AetherExporter } from '../lib/export/AetherExporter';
import { TimelineEditorModal } from '../components/TimelineEditorModal';
import { ProfilerPanel } from '../components/ProfilerPanel';
import { TextureAssignerPanel } from '../components/TextureAssignerPanel';
import { WelcomeScreen, type WelcomeChoice } from '../components/WelcomeScreen';
import { HelpModal } from '../components/HelpModal';
import { WorkflowStepper, type WorkflowMode } from '../components/WorkflowStepper';
import { CommandPalette, useCommandPaletteHotkey } from '../components/CommandPalette';
import type { CommandDef } from '../lib/commands';
import { pickFile } from '../lib/pickFile';
import {
  isSupportedTextureFile,
  makeLocalTextureKey,
  saveTextureBinary,
  MAX_TEXTURE_BYTES,
} from '../lib/persistence';
import { OverlayHost } from '../components/ui/OverlayHost';
import { toast, alertBox, confirmBox, promptBox } from '../lib/ui/overlays';
import { BackupsModal } from '../components/BackupsModal';
import type { AutosaveInfo } from '../lib/core/HistoryManager';
import { EntityLogicData, NodeGraphData } from '../types/logic';
import {
  AtmosphereData,
  PostProcessingData,
  SkyPreset,
  DEFAULT_ATMOSPHERE,
  DEFAULT_POST_PROCESSING,
  normalizePostProcessing,
} from '../types/atmosphere';
import { HUDConfig, DEFAULT_HUD_CONFIG } from '../types/hud';
import {
  AssetBundleManifest,
  AssetRecord,
  AssetStats,
} from '../types/assets';
import type {
  LODGlobalConfig,
  CullingConfig,
  CullingStats,
  FrustumAuditResult,
} from '../types/culling';
import type { BackupInfo } from '../lib/serialize/backups';
import {
  SceneNode,
  GizmoMode,
  GizmoSpace,
  RenderMode,
  EngineStats,
  TransformData,
  MaterialData,
  LightData,
  PhysicsNodeData,
  RigAnimData,
  SceneExportData,
  WorkPlaneConfig,
  DEFAULT_WORK_PLANE_CONFIG,
  SnapSettings,
  DEFAULT_SNAP_SETTINGS,
  ParticleEmitterData,
  RepeatData,
  RepeatInfo,
  RiverConfigData,
} from '../types/engine';

export default function AetherStudioPage() {
  const sceneManagerRef = useRef<SceneManager | null>(null);
  /** Conteneur du viewport, renseigné par <Viewport> — héberge le renderer. */
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);

  // Studio Reactive State
  const [nodes, setNodes] = useState<SceneNode[]>([]);
  // Noms proposés comme cibles dans l'éditeur de graphe (nœuds d'action).
  const entityNameOptions = useMemo(() => nodes.map((n) => n.name), [nodes]);
  const [selectedNode, setSelectedNode] = useState<SceneNode | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [gizmoSpace, setGizmoSpace] = useState<GizmoSpace>('world');
  const [renderMode, setRenderMode] = useState<RenderMode>('shaded');
  const [snapping, setSnapping] = useState<boolean>(false);
  const [snapSettings, setSnapSettings] = useState<SnapSettings>(DEFAULT_SNAP_SETTINGS);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAssetManagerOpen, setIsAssetManagerOpen] = useState<boolean>(true);
  const [isHierarchyOpen, setIsHierarchyOpen] = useState<boolean>(true);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('decor');
  /** Étapes déjà parcourues : alimente la barre de progression du stepper. */
  const [workflowVisited, setWorkflowVisited] = useState<ReadonlySet<WorkflowMode>>(
    () => new Set<WorkflowMode>(['decor'])
  );
  /** Mode Zen : masque la barre d'étapes pour donner toute la hauteur au viewport. */
  const [zenMode, setZenMode] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  // Onboarding débutant : écran d'accueil (1re visite) + aide contextuelle.
  const [welcomeOpen, setWelcomeOpen] = useState<boolean>(false);
  const [welcomeCanDismiss, setWelcomeCanDismiss] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Tools & Modals State
  const [isAtmosphereModalOpen, setIsAtmosphereModalOpen] = useState<boolean>(false);
  // --- Multijoueur P2P (WebRTC, test) ---
  const [isMultiplayerOpen, setIsMultiplayerOpen] = useState<boolean>(false);  const [netRole, setNetRole] = useState<'none' | 'host' | 'client'>('none');
  const [netPlayerName, setNetPlayerName] = useState<string>('Joueur');
  const [netSpectator, setNetSpectator] = useState<boolean>(false);
  const [netPeers, setNetPeers] = useState<PeerMeta[]>([]);
  // --- Animator Controller (4.2) ---
  const [isAnimatorOpen, setIsAnimatorOpen] = useState<boolean>(false);  const [animatorCandidates, setAnimatorCandidates] = useState<AnimatorCandidate[]>([]);
  const [animatorUuid, setAnimatorUuid] = useState<string | null>(null);
  const [animatorController, setAnimatorController] = useState<AnimatorControllerData | null>(null);
  // --- Collaboration temps réel (5.2) ---
  const [isCollabOpen, setIsCollabOpen] = useState<boolean>(false);
  const [collabName, setCollabName] = useState<string>('Éditeur');
  // --- Web-natif (5.3 : partage, live, PWA) ---
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [pwaInstallable, setPwaInstallable] = useState<boolean>(false);

  useEffect(() => {
    const onInstallable = (): void => {
      setPwaInstallable(
        !(window as unknown as { __aetherInstallPrompt?: unknown }).__aetherInstallPrompt ? false : true
      );
    };
    const onGone = (): void => setPwaInstallable(false);
    window.addEventListener('aether-pwa-installable', onInstallable);
    window.addEventListener('appinstalled', onGone);
    return () => {
      window.removeEventListener('aether-pwa-installable', onInstallable);
      window.removeEventListener('appinstalled', onGone);
    };
  }, []);

  // 1re visite : on propose les 3 points de départ (démo / mini-jeu / vide).
  useEffect(() => {
    try {
      if (window.localStorage.getItem('aether.onboarding.v1') !== '1') {
        setWelcomeCanDismiss(false);
        setWelcomeOpen(true);
      }
    } catch {
      /* stockage indisponible : on n'affiche pas l'intro */
    }
  }, []);

  const handleWelcomeChoice = useCallback((choice: WelcomeChoice) => {
    const sm = sceneManagerRef.current;
    try {
      if (choice === 'demo') {
        sm?.resetToSeedScene();
      } else if (choice === 'minigame') {
        sm?.seedMiniGameScene();
        setWorkflowMode('test');
        setWorkflowVisited((prev) => new Set([...prev, 'test' as WorkflowMode]));
      } else {
        sm?.clearUserScene();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Impossible de préparer la scène.', 'error');
    }
    try {
      window.localStorage.setItem('aether.onboarding.v1', '1');
    } catch {
      /* stockage indisponible */
    }
    setWelcomeOpen(false);
    if (choice === 'minigame') {
      toast('Mini-jeu chargé : cliquez sur Play pour jouer !', 'success');
    } else if (choice === 'demo') {
      toast('Scène démo chargée. Cliquez sur Play pour l’essayer.', 'success');
    } else {
      toast('Projet vide : ajoutez un décor depuis la bibliothèque.', 'info');
    }
  }, []);

  const handleReplayIntro = useCallback(() => {
    setIsHelpOpen(false);
    setWelcomeCanDismiss(true);
    setWelcomeOpen(true);
  }, []);

  /**
   * Point d'entrée unique pour changer d'étape de workflow : le stepper,
   * la palette de commandes et les raccourcis Alt+1..4 passent tous par ici
   * (le chip redondant « Mode : DECOR » a été supprimé au profit de l'onglet actif).
   */
  const selectWorkflowMode = useCallback((mode: WorkflowMode) => {
    setWorkflowMode(mode);
    setWorkflowVisited((prev) => (prev.has(mode) ? prev : new Set([...prev, mode])));
    if (mode === 'decor') {
      setIsAssetManagerOpen(true);
    } else {
      setIsAssetManagerOpen(false);
    }
    if (mode === 'test') setIsHierarchyOpen(false);
  }, []);

  // Ctrl+K ouvre la palette de commandes (global, hors modale).
  useCommandPaletteHotkey(setIsCommandPaletteOpen);

  // Raccourcis globaux : Alt+1..4 (étapes), Ctrl+. (mode Zen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        const modes: WorkflowMode[] = ['decor', 'character', 'rules', 'test'];
        const next = modes[Number(e.key) - 1];
        if (next) selectWorkflowMode(next);
        return;
      }
      if (e.ctrlKey && e.key === '.') {
        e.preventDefault();
        setZenMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectWorkflowMode]);

  // Synchronise l'affichage de l'historique et de l'autosave avec le moteur.
  // On ne déclenche un re-render que si une valeur a réellement changé, sinon
  // la Toolbar se re-rend 2,5 fois par seconde pour rien.
  useEffect(() => {
    const read = () => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      setHistoryUi((prev) => {
        const next = {
          canUndo: sm.canUndo,
          canRedo: sm.canRedo,
          undoLabel: sm.getUndoLabel(),
          redoLabel: sm.getRedoLabel(),
        };
        return prev.canUndo === next.canUndo &&
          prev.canRedo === next.canRedo &&
          prev.undoLabel === next.undoLabel &&
          prev.redoLabel === next.redoLabel
          ? prev
          : next;
      });
      setAutosaveUi((prev) => {
        const info = sm.getAutosaveInfo();
        return prev &&
          prev.savedAt === info.savedAt &&
          prev.pending === info.pending &&
          prev.error === info.error &&
          prev.degraded === info.degraded
          ? prev
          : info;
      });
    };
    read();
    const id = window.setInterval(read, 400);
    return () => window.clearInterval(id);
  }, [sceneManagerRef]);

  const handleUndo = useCallback(() => {
    const label = sceneManagerRef.current?.undo();
    if (label) toast(`Annulé : ${label}`, 'info', 2200);
  }, [sceneManagerRef]);

  const handleRedo = useCallback(() => {
    const label = sceneManagerRef.current?.redo();
    if (label) toast(`Rétabli : ${label}`, 'info', 2200);
  }, [sceneManagerRef]);

  /** backupCurrentScene() lève en cas de quota : on convertit en null. */
  const handleBackupNow = useCallback((): string | null => {
    try {
      return sceneManagerRef.current?.backupSceneNow() ?? null;
    } catch (err) {
      console.warn('[Sauvegarde] échec', err);
      return null;
    }
  }, [sceneManagerRef]);

  const listBackups = useCallback((): BackupInfo[] => {
    return sceneManagerRef.current?.listSceneBackups() ?? [];
  }, [sceneManagerRef]);

  const restoreBackup = useCallback(
    (key: string): boolean => sceneManagerRef.current?.restoreSceneBackup(key) ?? false,
    [sceneManagerRef]
  );

  const deleteBackup = useCallback(
    (key: string): void => {
      sceneManagerRef.current?.deleteSceneBackup(key);
    },
    [sceneManagerRef]
  );
  const [isProfilerOpen, setIsProfilerOpen] = useState<boolean>(false);
  const [physicsDebugVisible, setPhysicsDebugVisible] = useState<boolean>(false);
  const [isHUDModalOpen, setIsHUDModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isTexturePanelOpen, setIsTexturePanelOpen] = useState<boolean>(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState<boolean>(false);
  const [exportSceneData, setExportSceneData] = useState<SceneExportData | null>(null);

  // --- Historique + sauvegarde -------------------------------------------
  // L'undo/redo et l'autosave fonctionnaient déjà côté moteur (Ctrl+Z), mais
  // rien ne les rendait visibles : ni bouton, ni état, ni sauvegarde navigable.
  const [isBackupsOpen, setIsBackupsOpen] = useState<boolean>(false);
  const [historyUi, setHistoryUi] = useState<{
    canUndo: boolean;
    canRedo: boolean;
    undoLabel: string | null;
    redoLabel: string | null;
  }>({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
  const [autosaveUi, setAutosaveUi] = useState<AutosaveInfo | null>(null);

  // Prefab System State
  const [prefabs, setPrefabs] = useState<Array<{ id: string; name: string; nodes: any[] }>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aether_prefabs');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const handleSaveAsPrefab = useCallback(async (id: string) => {
    if (!sceneManagerRef.current) return;
    const sm = sceneManagerRef.current;

    // Get selected objects or fallback to single clicked object
    let rootIds: string[] = [];
    if (sm.selectedObjects.length > 1 && sm.selectedObjects.some((o) => o.uuid === id)) {
      rootIds = sm.selectedObjects.map((o) => o.uuid);
    } else {
      rootIds = [id];
    }

    const defaultName =
      rootIds.length === 1
        ? sm.objects.get(rootIds[0])?.name || 'Nouveau Préfabriqué'
        : 'Nouveau Préfabriqué';
    const name = await promptBox(
      `Nommer le préfabriqué (${rootIds.length} racine(s) sélectionnée(s), enfants inclus) :`,
      { defaultValue: defaultName, title: 'Nouveau préfabriqué' }
    );
    if (!name) return;

    // Capture les sous-arbres complets (hiérarchie + locales, sans linkage).
    const nodes = rootIds.flatMap((rootId) => sm.captureSubtree(rootId));
    if (nodes.length === 0) return;

    const newPrefab = {
      id: `prefab_${Date.now()}`,
      name,
      nodes,
    };

    setPrefabs((prev) => {
      const next = [...prev, newPrefab];
      localStorage.setItem('aether_prefabs', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleAddPrefab = useCallback((nodes: any[], prefabId?: string) => {
    if (!sceneManagerRef.current) return;
    sceneManagerRef.current.instantiatePrefab(nodes, undefined, prefabId ? { prefabId } : undefined);
  }, []);

  const handleApplyPrefab = useCallback(
    (id: string) => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const rootId = sm.getPrefabInstanceRoot(id) ?? id;
      const root = sm.objects.get(rootId);
      const prefabId = (root?.userData as { prefabId?: string } | undefined)?.prefabId;
      if (!root || !prefabId) {
        void alertBox("Aucune instance prefab sélectionnée.");
        return;
      }
      const nodes = sm.captureSubtree(rootId);
      setPrefabs((prev) => {
        const next = prev.map((p) => (p.id === prefabId ? { ...p, nodes } : p));
        localStorage.setItem('aether_prefabs', JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const handleRevertPrefab = useCallback(
    async (id: string) => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const rootId = sm.getPrefabInstanceRoot(id) ?? id;
      const root = sm.objects.get(rootId);
      const prefabId = (root?.userData as { prefabId?: string } | undefined)?.prefabId;
      const template = prefabs.find((p) => p.id === prefabId);
      if (!root || !prefabId || !template) {
        await alertBox("Prefab d'origine introuvable (supprimé ?).");
        return;
      }
      const ok = await confirmBox(
        `Réinitialiser l'instance depuis "${template.name}" ? (overrides perdus)`
      );
      if (!ok) return;
      sm.revertPrefabInstance(rootId, template.nodes);
    },
    [prefabs]
  );

  const handleUnlinkPrefab = useCallback((id: string) => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    const rootId = sm.getPrefabInstanceRoot(id) ?? id;
    sm.unlinkPrefabInstance(rootId);
  }, []);

  // --- Presse-papiers hiérarchique (TIER 2.3 : copier / couper / coller) ---
  const [clipboard, setClipboard] = useState<SceneExportData['nodes']>([]);

  const collectCopyRoots = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return { sm: null as SceneManager | null, rootIds: [] as string[] };
    const ids = selectedIds.length > 0 ? selectedIds : selectedNode ? [selectedNode.id] : [];
    const idSet = new Set(ids);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // Racines uniquement (un enfant déjà couvert par son parent n'est pas dupliqué).
    const rootIds = ids.filter((id) => {
      const n = byId.get(id);
      return n && (!n.parentId || !idSet.has(n.parentId));
    });
    return { sm, rootIds };
  }, [nodes, selectedIds, selectedNode]);

  const handleCopySelection = useCallback(() => {
    const { sm, rootIds } = collectCopyRoots();
    if (!sm || rootIds.length === 0) return;
    const copied = rootIds.flatMap((id) => sm.captureSubtree(id));
    if (copied.length > 0) setClipboard(copied);
  }, [collectCopyRoots]);

  const handleCutSelection = useCallback(() => {
    const { sm, rootIds } = collectCopyRoots();
    if (!sm || rootIds.length === 0) return;
    const copied = rootIds.flatMap((id) => sm.captureSubtree(id));
    if (copied.length === 0) return;
    setClipboard(copied);
    rootIds.forEach((id) => sm.deleteObject(id));
  }, [collectCopyRoots]);

  const handlePasteAt = useCallback(
    (pos: { x: number; y: number; z: number }) => {
      if (clipboard.length === 0) return;
      sceneManagerRef.current?.instantiatePrefab(clipboard, pos);
    },
    [clipboard]
  );

  // Raccourcis globaux copier / couper / coller (hors champs de saisie).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        handleCopySelection();
      } else if (key === 'x') {
        e.preventDefault();
        handleCutSelection();
      } else if (key === 'v') {
        e.preventDefault();
        const sm = sceneManagerRef.current;
        if (sm && clipboard.length > 0) {
          const ground = sm.getGroundIntersection(
            window.innerWidth / 2,
            window.innerHeight / 2
          );
          handlePasteAt({ x: ground.x, y: ground.y, z: ground.z });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCopySelection, handleCutSelection, handlePasteAt, clipboard.length]);

  const handleRemoveComponent = useCallback(
    (
      id: string,
      kind:
        | 'rigidbody'
        | 'collider'
        | 'characterController'
        | 'vehicleController'
        | 'logic'
        | 'rigAnim'
        | 'particles'
    ) => {
      sceneManagerRef.current?.removeNodeComponent(id, kind);
    },
    []
  );

  const handleDeletePrefab = useCallback((prefabId: string) => {
    setPrefabs((prev) => {
      const next = prev.filter((p) => p.id !== prefabId);
      localStorage.setItem('aether_prefabs', JSON.stringify(next));
      return next;
    });
  }, []);

  // Engine Subsystem States
  const [workPlaneConfig, setWorkPlaneConfig] = useState<WorkPlaneConfig>(DEFAULT_WORK_PLANE_CONFIG);
  const [atmosphere, setAtmosphere] = useState<AtmosphereData>(DEFAULT_ATMOSPHERE);
  const [postProcessing, setPostProcessing] = useState<PostProcessingData>(DEFAULT_POST_PROCESSING);
  // Elements de la palette low-poly (LOW_POLY_set.glb) ; null = chargement en cours.
  const [foliageLibrary, setFoliageLibrary] = useState<FoliageLibraryEntry[] | null>(null);
  // Vignettes 3D (dataURL) générées une fois la palette résolue.
  const [lowPolyThumbnails, setLowPolyThumbnails] = useState<Record<string, string>>({});

  const [hudConfig, setHudConfig] = useState<HUDConfig>(DEFAULT_HUD_CONFIG);

  // Node Graph Modal State
  const [isNodeGraphOpen, setIsNodeGraphOpen] = useState<boolean>(false);
  const [nodeGraphTargetNode, setNodeGraphTargetNode] = useState<SceneNode | null>(null);
  const [nodeGraphInitialData, setNodeGraphInitialData] = useState<NodeGraphData | undefined>(undefined);
  const [stats, setStats] = useState<EngineStats>({
    fps: 60,
    triangles: 0,
    drawCalls: 0,
    objectsCount: 0,
  });

  // Track selection id in ref to keep sync across re-renders
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedNode?.id || null;
  }, [selectedNode?.id]);

  // Initialize Three.js SceneManager once canvas container is mounted
  useEffect(() => {
    // La ref est renseignée par le `ref` callback de <Viewport>, qui pointe le
    // même div que `#aether-viewport`. On ne cherche plus l'élément dans le
    // document : `getElementById` pouvait trouver un nœud d'un montage
    // précédent encore en cours de démontage (React monte deux fois en
    // StrictMode, HMR empile), et faire construire le SceneManager sur le
    // mauvais conteneur.
    const viewportContainer = viewportContainerRef.current;
    if (!viewportContainer) return;

    const sm = new SceneManager(viewportContainer, {
      onSelectionChange: (node, ids) => {
        setSelectedNode(node);
        setSelectedIds(ids || (node ? [node.id] : []));
      },
      onHierarchyChange: (updatedNodes) => {
        setNodes(updatedNodes);
        if (selectedIdRef.current) {
          const match = updatedNodes.find((n) => n.id === selectedIdRef.current);
          if (match) setSelectedNode(match);
        }
      },
      onTransformChange: (node) => {
        setSelectedNode(node);
        setNodes((prev) => prev.map((n) => (n.id === node.id ? node : n)));
      },
      onStatsUpdate: (engineStats) => {
        setStats(engineStats);
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
      },
      onHUDConfigChange: (config) => {
        setHudConfig(config);
      },
    });

    sceneManagerRef.current = sm;

    // Bibliotheque foliage low-poly : resolve = elements de la palette, reject = deja piege en [].
    let libraryAlive = true;
    sm.foliageLibraryPromise?.then((entries) => {
      if (!libraryAlive) return;
      setFoliageLibrary(entries);
      // Rendu des vignettes 3D (hors thread de rendu principal du viewer).
      void renderLowPolyThumbnails(sm.foliagePainter, entries).then((thumbs) => {
        if (!libraryAlive || Object.keys(thumbs).length === 0) return;
        setLowPolyThumbnails(thumbs);
      });
    });

    return () => {
      libraryAlive = false;
      sm.dispose();
      sceneManagerRef.current = null;
    };
  }, []);

  // Handlers for Gizmo & Viewport Modes
  const handleGizmoModeChange = useCallback((mode: GizmoMode) => {
    setGizmoMode(mode);
    sceneManagerRef.current?.setGizmoMode(mode);
  }, []);

  const handleGizmoSpaceChange = useCallback((space: GizmoSpace) => {
    setGizmoSpace(space);
    sceneManagerRef.current?.setGizmoSpace(space);
  }, []);

  const handleRenderModeChange = useCallback((mode: RenderMode) => {
    setRenderMode(mode);
    sceneManagerRef.current?.setRenderMode(mode);
  }, []);

  const handleToggleSnapping = useCallback(() => {
    setSnapping((prev) => {
      const next = !prev;
      setSnapSettings((s) => ({ ...s, enabled: next }));
      sceneManagerRef.current?.setSnapSettings({ enabled: next });
      return next;
    });
  }, []);

  const handleSnapSettingsChange = useCallback((partial: Partial<SnapSettings>) => {
    setSnapSettings((prev) => {
      const next = { ...prev, ...partial };
      sceneManagerRef.current?.setSnapSettings(partial);
      if (partial.translateSnap !== undefined) {
        setWorkPlaneConfig((wp) => ({ ...wp, snapUnit: partial.translateSnap ?? wp.snapUnit }));
      }
      if (partial.enabled !== undefined) setSnapping(partial.enabled);
      return next;
    });
  }, []);

  const handleTogglePlay = useCallback(() => {
    // Anti "spacebar trigger" leakage: drop UI focus so gameplay keys
    // (Space = jump...) can't re-trigger the focused Play/Stop button.
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    sceneManagerRef.current?.togglePlayMode();
  }, []);

  // Hierarchy Handlers
  const handleSelectNode = useCallback(
    (id: string, opts?: { additive?: boolean; range?: boolean }) => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      if (opts?.additive) {
        sm.toggleSelectById(id);
      } else {
        // range géré par handleSelectRange (la hiérarchie calcule l'ordre visible)
        sm.selectById(id);
      }
    },
    []
  );

  const handleSelectRange = useCallback((ids: string[]) => {
    sceneManagerRef.current?.selectNodesByIds(ids);
  }, []);

  const handleMoveNode = useCallback(
    (draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => {
      sceneManagerRef.current?.moveObject(draggedId, targetId, position);
    },
    []
  );

  const handleCreateEmptyChild = useCallback((parentId: string) => {
    sceneManagerRef.current?.createEmpty('Empty', parentId);
  }, []);

  const handleGroupSelected = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    const ids = selectedIds.length > 0 ? selectedIds : selectedNode ? [selectedNode.id] : [];
    if (ids.length === 0) {
      sm.createEmpty('Group');
    } else {
      sm.createGroup('Group', ids);
    }
  }, [selectedIds, selectedNode]);

  const handleUngroup = useCallback((id: string) => {
    sceneManagerRef.current?.dissolveGroup(id);
  }, []);

  const handleSelectChildren = useCallback((id: string) => {
    sceneManagerRef.current?.selectSubtree(id);
  }, []);

  const handleToggleVisibility = useCallback((id: string, currentVisible: boolean) => {
    sceneManagerRef.current?.setVisibility(id, !currentVisible);
  }, []);

  const handleDeleteNode = useCallback((id: string) => {
    sceneManagerRef.current?.deleteObject(id);
  }, []);

  const handleDuplicateNode = useCallback((id: string) => {
    sceneManagerRef.current?.duplicateObject(id);
  }, []);

  const handleRenameNode = useCallback((id: string, newName: string) => {
    sceneManagerRef.current?.updateObjectName(id, newName);
  }, []);

  // Primitives & Object Addition
  const handleAddPrimitive = useCallback(
    (
      type:
        | 'cube'
        | 'sphere'
        | 'cylinder'
        | 'plane'
        | 'torus'
        | 'cone'
        | 'player'
        | 'pointLight'
        | 'spotLight'
        | 'dirLight'
        | 'camera'
        | 'particles'
        | 'vehicle'
        | 'river'
        | 'triggerVolume'
        | 'navMeshAgent'
        | 'checkpoint'
        | 'spawnPoint'
        | 'postProcessVolume',
      dropPos?: { x: number; y: number; z: number }
    ) => {
      sceneManagerRef.current?.addPrimitive(type, dropPos);
    },
    []
  );

  // Ajout d'un modèle de la palette low-poly (asynchrone : charge la bibliothèque si besoin).
  const handleAddLowPoly = useCallback((lowPolyId: string) => {
    void sceneManagerRef.current?.addLowPolyModel(lowPolyId);
  }, []);

  // Inspector Handlers
  const handleUpdateTransform = useCallback((id: string, transform: Partial<TransformData>) => {
    sceneManagerRef.current?.updateTransform(id, transform);
  }, []);

  const handleUpdateMaterial = useCallback((id: string, material: Partial<MaterialData>) => {
    sceneManagerRef.current?.updateMaterial(id, material);
  }, []);

  /**
   * Import d'une texture depuis le disque (TextureAssignerPanel).
   * Le binaire est écrit dans IndexedDB et seule la clé retournée est stockée
   * dans `material.mapUrl` : le JSON de scène (localStorage, ~5 Mo max) reste
   * léger, et la texture survit au rechargement de la page.
   */
  const handleImportLocalTexture = useCallback(async (file: File): Promise<string | null> => {
    if (!isSupportedTextureFile(file)) {
      await alertBox(
        `« ${file.name} » n'est pas une image prise en charge.\n\nFormats acceptés : PNG, JPG, WebP, GIF, BMP, AVIF.`,
        { title: 'Format non pris en charge' }
      );
      return null;
    }
    if (file.size > MAX_TEXTURE_BYTES) {
      await alertBox(
        `« ${file.name} » pèse ${(file.size / (1024 * 1024)).toFixed(1)} Mo (maximum 32 Mo).\n\nPensez à réduire sa résolution ou sa compression.`,
        { title: 'Fichier trop volumineux' }
      );
      return null;
    }

    const key = makeLocalTextureKey();
    try {
      await saveTextureBinary(key, await file.arrayBuffer());
    } catch {
      await alertBox(
        "Le stockage local (IndexedDB) est indisponible.\nImpossible d'importer la texture.",
        { title: 'Import impossible' }
      );
      return null;
    }
    return key;
  }, []);

  /**
   * Analyse UV de l'objet sélectionné (planche du panneau de textures).
   * `useCallback` à dépendances vides : sans cela, la nouvelle référence
   * déclencherait le useEffect du panneau à chaque render de page.tsx.
   */
  const handleGetUvAnalysis = useCallback((id: string) => {
    return sceneManagerRef.current?.analyzeObjectUv(id) ?? null;
  }, []);

  const handleUpdateLowPolyPalette = useCallback((id: string, colors: string[] | null) => {
    sceneManagerRef.current?.updateLowPolyPalette(id, colors);
  }, []);

  const handleToggleSmoothShading = useCallback((id: string, smooth: boolean) => {
    sceneManagerRef.current?.setSmoothShading(id, smooth);
  }, []);

  // Synchronisation de l'inspecteur après une mutation.
  //
  // Deux formes coexistent, volontairement distinctes :
  //
  // - `refreshSelection` : ne touche qu'à la sélection. L'arborescence est
  //   rafraîchie par l'événement `onHierarchyChange` du moteur. C'est la forme
  //   utilisée par les réglages SloMo (atmosphère, particules) : elle est
  //   appelée à chaque frappe de curseur, y republier tout l'arbre de scène
  //   provoquerait un rendu complet du panneau Hierarchy par événement.
  // - `resyncHierarchy` : republie l'arborescence ET la sélection. Pour les
  //   mutations qui n'émettent pas d'événement fiable (ajout d'animation,
  //   squelette, snap-to-ground).
  const refreshSelection = useCallback((id: string) => {
    if (selectedIdRef.current !== id) return;
    const updated = sceneManagerRef.current?.getSceneHierarchy() || [];
    const match = updated.find((n) => n.id === id);
    if (match) setSelectedNode(match);
  }, []);

  const resyncHierarchy = useCallback((id: string) => {
    const updated = sceneManagerRef.current?.getSceneHierarchy() || [];
    setNodes(updated);
    const match = updated.find((n) => n.id === id);
    if (match) setSelectedNode(match);
  }, []);

  const handleUpdateRiverConfig = useCallback((id: string, config: Partial<RiverConfigData>) => {
    sceneManagerRef.current?.updateRiverConfig(id, config);
    refreshSelection(id);
  }, [refreshSelection]);

  const handleUpdateParticlesConfig = useCallback((id: string, config: Partial<ParticleEmitterData>) => {
    sceneManagerRef.current?.updateParticlesConfig(id, config);
    refreshSelection(id);
  }, [refreshSelection]);

  const handleUpdateLight = useCallback((id: string, light: Partial<LightData>) => {
    sceneManagerRef.current?.updateLight(id, light);
  }, []);

  const handleUpdatePhysics = useCallback((id: string, physics: Partial<PhysicsNodeData>) => {
    sceneManagerRef.current?.updatePhysics(id, physics);
  }, []);

  const handleUpdateLogic = useCallback((id: string, logic: Partial<EntityLogicData>) => {
    sceneManagerRef.current?.updateLogic(id, logic);
  }, []);

  const handleUpdateRigAnim = useCallback((id: string, rig: Partial<RigAnimData>) => {
    sceneManagerRef.current?.setRigAnim(id, rig);
    resyncHierarchy(id);
  }, [resyncHierarchy]);

  // Répétition automatique : applyRepeat régénère les copies ET notifie
  // l'arborescence (onHierarchyChange re-synchronise nodes + sélection).
  const handleUpdateRepeat = useCallback((id: string, config: Partial<RepeatData>) => {
    sceneManagerRef.current?.applyRepeat(id, config);
  }, []);

  const handleGetRepeatInfo = useCallback(
    (id: string): RepeatInfo | null => sceneManagerRef.current?.getRepeatInfo(id) ?? null,
    []
  );

  const handleAppendAnimations = useCallback(async (id: string, file: File): Promise<string[]> => {
    if (!sceneManagerRef.current) return [];
    const added = await sceneManagerRef.current.appendAnimationsToModel(id, file);
    resyncHierarchy(id);
    return added;
  }, [resyncHierarchy]);

  const handleTestAnimation = useCallback((id: string, clipName: string) => {
    sceneManagerRef.current?.playSkeletalAnimation(id, clipName);
  }, []);

  const handleStopTestAnimation = useCallback((id: string) => {
    sceneManagerRef.current?.stopSkeletalAnimations(id);
  }, []);

  const handleTestRagdoll = useCallback((id: string) => {
    if (!sceneManagerRef.current) return;
    if (sceneManagerRef.current.isRagdollActive(id)) {
      sceneManagerRef.current.deactivateRagdoll(id);
    } else {
      sceneManagerRef.current.triggerRagdoll(id, new THREE.Vector3(0, 1.5, -2.5));
    }
  }, []);

  const handleToggleDebugWireframes = useCallback((id: string, show: boolean) => {
    sceneManagerRef.current?.showRagdollWireframes(id, show);
  }, []);

  const handleOpenNodeGraph = useCallback((node: SceneNode, initialGraph?: NodeGraphData) => {
    setNodeGraphTargetNode(node);
    setNodeGraphInitialData(initialGraph || node.logic?.nodeGraph);
    setIsNodeGraphOpen(true);
  }, []);

  const handleOpenTimeline = useCallback((node: SceneNode) => {
    setSelectedNode(node);
    setIsTimelineOpen(true);
  }, []);

  const handleSaveNodeGraph = useCallback((graph: NodeGraphData) => {
    if (nodeGraphTargetNode) {
      handleUpdateLogic(nodeGraphTargetNode.id, {
        nodeGraph: graph,
        activeLevel: 'graph',
      });

      // Preuve d'assignation : la logique est écrite sur l'objet 3D
      // (obj.userData.logic) puis réappliquée au Play suivant.
      if (typeof window !== 'undefined') {
        const count = graph.nodes.length;
        window.dispatchEvent(
          new CustomEvent('aether_show_toast', {
            detail: {
              message: `Logique assignée à ${nodeGraphTargetNode.name} (${count} nœud${count > 1 ? 's' : ''})`,
              duration: 2500,
            },
          })
        );
      }
      
      // If simulation is running, restart to apply changes
      if (isPlaying) {
        sceneManagerRef.current?.setPlayMode(false).then(() => {
          sceneManagerRef.current?.setPlayMode(true);
        });
      }
    }
  }, [nodeGraphTargetNode, handleUpdateLogic, isPlaying]);

  const handleToggleShadows = useCallback((id: string, cast: boolean, receive: boolean) => {
    sceneManagerRef.current?.setShadows(id, cast, receive);
  }, []);

  const handleFocusObject = useCallback((id: string) => {
    sceneManagerRef.current?.focusOnObject(id);
  }, []);

  // --- Caméra de suivi -----------------------------------------------------
  // L'état vit dans page.tsx (et non dans SceneManager) car c'est un réglage
  // d'ÉDITEUR : il ne doit ni être sauvegardé avec la scène ni survivre à un
  // rechargement de la page. On relit l'état réel du moteur à chaque action.

  const [cameraFollowTargetId, setCameraFollowTargetId] = useState<string | null>(null);
  const [cameraFollowConfig, setCameraFollowConfig] = useState<CameraFollowConfig>(
    DEFAULT_FOLLOW_CONFIG
  );

  const showToast = useCallback((message: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('aether_show_toast', { detail: { message, duration: 2200 } })
    );
  }, []);

  const handleAssignCamera = useCallback(
    (id: string) => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      const name = sm.objects.get(id)?.name ?? 'l’objet';
      if (!sm.assignCameraToObject(id)) {
        showToast('Objet non suivable (masqué ou hors scène)');
        return;
      }
      setCameraFollowTargetId(sm.getCameraFollowTargetId());
      setCameraFollowConfig(sm.getCameraFollowConfig());
      showToast(`La caméra suit « ${name} »`);
    },
    [showToast]
  );

  const handleClearCameraFollow = useCallback(() => {
    sceneManagerRef.current?.clearCameraFollow();
    setCameraFollowTargetId(null);
    showToast('Caméra libérée');
  }, [showToast]);

  const handleFrameFollowed = useCallback(() => {
    sceneManagerRef.current?.frameFollowedObject();
  }, []);

  const handleUpdateCameraFollow = useCallback((patch: Partial<CameraFollowConfig>) => {
    sceneManagerRef.current?.setCameraFollowConfig(patch);
    setCameraFollowConfig(sceneManagerRef.current?.getCameraFollowConfig() ?? DEFAULT_FOLLOW_CONFIG);
  }, []);

  // Une cible supprimée (Suppr, undo, import de scène) ne doit pas laisser
  // l'inspecteur afficher « caméra active » sur un objet fantôme.
  useEffect(() => {
    if (!cameraFollowTargetId) return;
    if (!sceneManagerRef.current?.objects.has(cameraFollowTargetId)) {
      sceneManagerRef.current?.clearCameraFollow();
      setCameraFollowTargetId(null);
    }
  }, [nodes, cameraFollowTargetId]);

  // Atmosphere & Post-Processing Handlers
  const handleUpdateAtmosphere = useCallback((data: Partial<AtmosphereData>) => {
    setAtmosphere((prev) => ({ ...prev, ...data }));
    sceneManagerRef.current?.updateAtmosphere(data);
  }, []);

  const handleUpdatePostProcessing = useCallback((data: Partial<PostProcessingData>) => {
    setPostProcessing((prev) => ({ ...prev, ...data }));
    sceneManagerRef.current?.updatePostProcessing(data);
  }, []);

  const handleApplySkyPreset = useCallback((preset: SkyPreset) => {
    sceneManagerRef.current?.applySkyPreset(preset);
    if (sceneManagerRef.current?.atmosphereManager) {
      setAtmosphere({ ...sceneManagerRef.current.atmosphereManager.atmosphere });
    }
  }, []);

  // 3D Work Plane Handlers
  const handleUpdateWorkPlaneConfig = useCallback((partial: Partial<WorkPlaneConfig>) => {
    setWorkPlaneConfig((prev) => {
      const updated = { ...prev, ...partial };
      sceneManagerRef.current?.setWorkPlaneConfig(updated);
      return updated;
    });
  }, []);

  // Terrain & Foliage Handlers
  // HUD Handlers
  const handleSaveHUDConfig = useCallback((config: HUDConfig) => {
    setHudConfig(config);
    sceneManagerRef.current?.updateHUDConfig(config);
  }, []);

  // One-Click Standalone Game Export
  const handleOpenExportModal = useCallback(() => {
    if (!sceneManagerRef.current) return;
    const currentScene = sceneManagerRef.current.exportScene();
    setExportSceneData(currentScene);
    setIsExportModalOpen(true);
  }, []);

  // Asset Management & Pipeline
  // --- Asset Pipeline (TIER 1.2) : registre, orphelins, bundles ---
  const [assetStats, setAssetStats] = useState<AssetStats | null>(null);
  const [assetRecords, setAssetRecords] = useState<AssetRecord[]>([]);
  const [assetBundles, setAssetBundles] = useState<AssetBundleManifest[]>([]);
  // 3.4 : LOD & culling (snapshot rafraîchi avec les assets).
  const [cullingStats, setCullingStats] = useState<CullingStats | null>(null);
  const [lodConfig, setLodConfig] = useState<LODGlobalConfig | null>(null);
  const [cullingConfig, setCullingConfig] = useState<CullingConfig | null>(null);

  const refreshAssets = useCallback(async () => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    try {
      const [stats, records, bundles] = await Promise.all([
        sm.getAssetStats(),
        sm.listAssetRecords(),
        sm.listAssetBundles(),
      ]);
      setAssetStats(stats);
      setAssetRecords(records);
      setAssetBundles(bundles);
      setCullingStats(sm.getCullingStats());
      setLodConfig({ ...sm.lodConfig });
      setCullingConfig({ ...sm.cullingConfig });
    } catch {
      /* pipeline indisponible */
    }
  }, []);

  const handleLODConfigChange = useCallback(
    (patch: Partial<LODGlobalConfig>) => {
      sceneManagerRef.current?.setLODConfig(patch);
      const sm = sceneManagerRef.current;
      if (!sm) return;
      setLodConfig({ ...sm.lodConfig });
      setCullingStats(sm.getCullingStats());
    },
    []
  );

  const handleCullingConfigChange = useCallback(
    (patch: Partial<CullingConfig>) => {
      sceneManagerRef.current?.setCullingConfig(patch);
      const sm = sceneManagerRef.current;
      if (!sm) return;
      setCullingConfig({ ...sm.cullingConfig });
      setCullingStats(sm.getCullingStats());
    },
    []
  );

  const handleAuditFrustum = useCallback((): FrustumAuditResult | null => {
    const res = sceneManagerRef.current?.verifyFrustumCulling() ?? null;
    const sm = sceneManagerRef.current;
    if (sm) setCullingStats(sm.getCullingStats());
    return res;
  }, []);

  // --- Multijoueur P2P ---
  const syncNetState = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    setNetRole(sm.netRole);
    setNetSpectator(sm.netClient?.spectator ?? false);
    setNetPeers(sm.netRole === 'host' && sm.netHost ? sm.netHost.getPeers() : []);
  }, []);

  useEffect(() => {
    syncNetState();
    const timer = window.setInterval(syncNetState, 1500);
    return () => window.clearInterval(timer);
  }, [syncNetState]);

  const handleStartHost = useCallback(() => {
    sceneManagerRef.current?.startNetHost(netPlayerName);
    syncNetState();
  }, [netPlayerName, syncNetState]);

  const handleCreateInvite = useCallback(async (): Promise<string> => {
    const sm = sceneManagerRef.current;
    if (!sm?.netHost) throw new Error('Démarrez d’abord le salon.');
    const code = await sm.netHost.createInvite();
    syncNetState();
    return code;
  }, [syncNetState]);

  const handleAcceptAnswer = useCallback(async (code: string): Promise<void> => {
    const sm = sceneManagerRef.current;
    if (!sm?.netHost) throw new Error('Démarrez d’abord le salon.');
    await sm.netHost.acceptAnswer(code);
    syncNetState();
  }, [syncNetState]);

  const handleJoinSession = useCallback(async (invite: string, spectator: boolean): Promise<string> => {
    const sm = sceneManagerRef.current;
    if (!sm) throw new Error('Moteur indisponible.');
    const answer = await sm.joinNetSession(invite, netPlayerName, spectator);
    syncNetState();
    return answer;
  }, [netPlayerName, syncNetState]);

  const handleStopNet = useCallback(() => {
    sceneManagerRef.current?.stopNet();
    syncNetState();
  }, [syncNetState]);

  const handleSetNetSpectator = useCallback((b: boolean) => {
    sceneManagerRef.current?.setNetSpectator(b);
    syncNetState();
  }, [syncNetState]);

  const handleNetRespawn = useCallback(() => {
    sceneManagerRef.current?.requestNetRespawn();
  }, []);

  // --- Animator Controller (4.2) ---
  const refreshAnimator = useCallback((uuid: string | null) => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    try {
      setAnimatorCandidates(sm.listAnimatorCandidates());
    } catch {
      /* ignore */
    }
    if (!uuid) {
      setAnimatorController(null);
      return;
    }
    try {
      setAnimatorController(sm.getAnimatorController(uuid));
    } catch {
      setAnimatorController(null);
    }
  }, []);

  const handleSelectAnimatorObject = useCallback((uuid: string) => {
    setAnimatorUuid(uuid || null);
    refreshAnimator(uuid || null);
  }, [refreshAnimator]);

  const handleCreateAnimator = useCallback((uuid: string) => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    const sources = sm.listAnimatorSources(uuid);
    const ctrl = buildLocomotionController(sources.clips, sources.tracks);
    sm.setAnimatorConfig(uuid, ctrl);
    refreshAnimator(uuid);
  }, [refreshAnimator]);

  const handleSaveAnimator = useCallback((uuid: string, data: AnimatorControllerData) => {
    sceneManagerRef.current?.setAnimatorConfig(uuid, data);
    refreshAnimator(uuid);
  }, [refreshAnimator]);

  const handleDeleteAnimator = useCallback((uuid: string) => {
    sceneManagerRef.current?.setAnimatorConfig(uuid, null);
    refreshAnimator(uuid);
  }, [refreshAnimator]);

  // --- Collaboration temps réel (5.2) ---
  const [, setCollabTick] = useState(0);
  const syncCollabTick = useCallback(() => {
    setCollabName(sceneManagerRef.current?.collabName ?? 'Éditeur');
    setCollabTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(syncCollabTick, 1500);
    return () => window.clearInterval(timer);
  }, [syncCollabTick]);

  const handleImportGLTF = useCallback(
    async (file: File) => {
      if (!sceneManagerRef.current) return;
      await sceneManagerRef.current.importGLTF(file);
      void refreshAssets();
    },
    [refreshAssets]
  );

  const handlePurgeOrphans = useCallback(async () => {
    await sceneManagerRef.current?.purgeOrphanAssets().catch(() => null);
    void refreshAssets();
  }, [refreshAssets]);

  const handleDeleteAsset = useCallback(
    async (id: string) => {
      const res = await sceneManagerRef.current?.deleteAssetRecord(id).catch(() => null);
      if (res && !res.ok) {
        await alertBox(
          `Asset utilisé par ${res.referencedBy?.length ?? 0} objet(s) — supprimez d'abord les objets de la scène.`
        );
      }
      void refreshAssets();
    },
    [refreshAssets]
  );

  const handleCreateBundle = useCallback(
    async (name: string) => {
      await sceneManagerRef.current?.createAssetBundle(name).catch(() => null);
      void refreshAssets();
    },
    [refreshAssets]
  );

  const handlePreloadBundle = useCallback(
    async (id: string) => {
      await sceneManagerRef.current?.preloadAssetBundle(id).catch(() => null);
      void refreshAssets();
    },
    [refreshAssets]
  );

  const handleUnloadBundle = useCallback(
    async (id: string) => {
      await sceneManagerRef.current?.unloadAssetBundle(id).catch(() => null);
      void refreshAssets();
    },
    [refreshAssets]
  );

  const handleDeleteBundle = useCallback(
    async (id: string) => {
      await sceneManagerRef.current?.deleteAssetBundle(id).catch(() => null);
      void refreshAssets();
    },
    [refreshAssets]
  );

  // --- Profiler & Debug (TIER 1.3) ---
  const handleTogglePhysicsDebug = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    const next = !sm.isPhysicsDebugVisible();
    sm.setPhysicsDebugVisible(next);
    setPhysicsDebugVisible(next);
  }, []);

  const handleSnapshotMemory = useCallback(() => {
    sceneManagerRef.current?.snapshotMemoryNow(
      `manual-${new Date().toISOString().slice(11, 19)}`
    );
  }, []);

  const handleResetProfiler = useCallback(() => {
    sceneManagerRef.current?.resetProfiler();
  }, []);

  const getProfilerSnapshot = useCallback(() => {
    return sceneManagerRef.current?.getProfilerSnapshot() ?? null;
  }, []);

  const handleApplyMaterialPreset = useCallback(
    (presetName: string) => {
      if (!sceneManagerRef.current) return;
      if (selectedNode) {
        sceneManagerRef.current.applyMaterialPreset(selectedNode.id, presetName);
      } else {
        const firstMesh = nodes.find((n) => n.type === 'mesh' || n.type === 'group');
        if (firstMesh) {
          sceneManagerRef.current.selectById(firstMesh.id);
          sceneManagerRef.current.applyMaterialPreset(firstMesh.id, presetName);
        }
      }
    },
    [selectedNode, nodes]
  );

  // Scene Persistence (Export/Import JSON)
  const handleExportScene = useCallback(() => {
    if (!sceneManagerRef.current) return;
    const sceneData = sceneManagerRef.current.exportScene();
    AetherExporter.downloadJSON(sceneData, `aether-scene-${new Date().toISOString().slice(0, 10)}.json`);
  }, []);

  // --- Sérialisation (TIER 1.4) : conflit, binaire .aether, sauvegardes ---
  const applyIncomingScene = useCallback(async (data: SceneExportData) => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    const conflict = sm.detectConflictWithCurrent(data);
    if (conflict.hasConflict) {
      const ok = await confirmBox(
        `Conflit d'import : ${conflict.reason}\n\nConfirmer = remplacer (la scène actuelle est sauvegardée automatiquement).\nAnnuler = garder la scène actuelle.`,
        { title: "Conflit d'import" }
      );
      if (!ok) return;
    }
    const res = sm.importSceneWithPolicy(data, 'replace');
    for (const w of res.warnings) console.info(`[Scene] import : ${w}`);
    if (data.atmosphere) setAtmosphere(data.atmosphere);
    if (data.postProcessing) setPostProcessing(normalizePostProcessing(data.postProcessing));
    if (data.hud) setHudConfig(data.hud);
    if (data.settings?.renderMode) setRenderMode(data.settings.renderMode);
    if (data.settings?.snap) {
      const raw = data.settings.snap;
      const next: Partial<SnapSettings> = {};
      if (typeof raw.enabled === 'boolean') {
        next.enabled = raw.enabled;
        setSnapping(raw.enabled);
      }
      if (raw.mode) next.mode = raw.mode;
      if (typeof raw.translateSnap === 'number') next.translateSnap = raw.translateSnap;
      if (typeof raw.rotateSnapDeg === 'number') next.rotateSnapDeg = raw.rotateSnapDeg;
      if (raw.scaleSnap === null || typeof raw.scaleSnap === 'number') next.scaleSnap = raw.scaleSnap;
      if (typeof raw.vertexThreshold === 'number') next.vertexThreshold = raw.vertexThreshold;
      if (typeof raw.surfaceMaxDrop === 'number') next.surfaceMaxDrop = raw.surfaceMaxDrop;
      if (Object.keys(next).length > 0) setSnapSettings((s) => ({ ...s, ...next }));
      if (typeof raw.translateSnap === 'number') {
        setWorkPlaneConfig((wp) => ({ ...wp, snapUnit: raw.translateSnap ?? wp.snapUnit }));
      }
    } else if (typeof data.settings?.snapping === 'boolean') {
      setSnapping(data.settings.snapping);
      setSnapSettings((s) => ({ ...s, enabled: data.settings?.snapping ?? s.enabled }));
    }
    void refreshAssets();
  }, [refreshAssets]);

  const handleImportSceneBinary = useCallback(
    async (bytes: Uint8Array) => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      try {
        await applyIncomingScene(sm.decodeSceneBinary(bytes));
      } catch (err) {
        await alertBox(`Import .aether impossible : ${err instanceof Error ? err.message : err}`);
      }
    },
    [applyIncomingScene]
  );

  const handleExportSceneBinary = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    try {
      const bytes = sm.exportSceneBinary();
      AetherExporter.downloadBinary(bytes, `aether-scene-${new Date().toISOString().slice(0, 10)}.aether`);
    } catch (err) {
      void alertBox(`Export binaire impossible : ${err instanceof Error ? err.message : err}`);
    }
  }, []);

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const refreshBackups = useCallback(() => {
    try {
      setBackups(sceneManagerRef.current?.listSceneBackups() ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const handleRestoreBackup = useCallback(
    (key: string) => {
      const sm = sceneManagerRef.current;
      if (!sm) return;
      try {
        sm.backupSceneNow();
      } catch {
        /* filet optionnel */
      }
      if (!sm.restoreSceneBackup(key)) {
        void alertBox('Sauvegarde non restaurable.');
        return;
      }
      const data = sm.exportScene();
      if (data.atmosphere) setAtmosphere(data.atmosphere);
      if (data.postProcessing) setPostProcessing(normalizePostProcessing(data.postProcessing));
      if (data.hud) setHudConfig(data.hud);
      refreshBackups();
    },
    [refreshBackups]
  );

  const handleDeleteBackup = useCallback(
    (key: string) => {
      sceneManagerRef.current?.deleteSceneBackup(key);
      refreshBackups();
    },
    [refreshBackups]
  );

  const handleImportSceneJSON = useCallback(
    async (data: SceneExportData) => {
      try {
        await applyIncomingScene(data);
      } catch (err) {
        await alertBox(`Import impossible : ${err instanceof Error ? err.message : err}`);
      }
    },
    [applyIncomingScene]
  );

  const handleResetDemoScene = useCallback(() => {
    sceneManagerRef.current?.resetToSeedScene();
  }, []);

  const handleClearScene = useCallback(() => {
    sceneManagerRef.current?.clearUserScene();
  }, []);

  /** Colle le presse-papiers 3 devant la caméra (confort keyboard-first). */
  const handlePasteInFrontOfCamera = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm || clipboard.length === 0) return;
    const cam = sm.camera;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    handlePasteAt({
      x: cam.position.x + forward.x * 4,
      y: 0,
      z: cam.position.z + forward.z * 4,
    });
  }, [clipboard.length, handlePasteAt]);

  /**
   * Palette de commandes (Ctrl+K) : registre unique de tout ce que l'éditeur
   * sait faire. Avant, la moitié des modales n'étaient atteignables qu'en
   * fouillant la Toolbar ; ici tout est indexé, groupé et cherchable.
   */
  const commands = useMemo<CommandDef[]>(() => {
    const sm = () => sceneManagerRef.current;
    const hasSelection = Boolean(selectedNode);

    const add = (
      id: string,
      label: string,
      group: string,
      run: () => void,
      extra: Partial<CommandDef> = {}
    ): CommandDef => ({ id, label, group, run, ...extra });

    const createCmds: CommandDef[] = (
      [
        ['cube', 'Cube', Box, 'boite box bloc'],
        ['sphere', 'Sphère', Circle, 'boule round'],
        ['cylinder', 'Cylindre', Cylinder, 'pilier colonne tube'],
        ['cone', 'Cône', Triangle, 'pyramide'],
        ['torus', 'Tore', LifeBuoy, 'anneau donut ring'],
        ['plane', 'Plan (sol)', Layers, 'ground terrain surface'],
        ['player', 'Joueur FPS / 3P', Gamepad2, 'personnage hero zqsd wasd'],
        ['vehicle', 'Véhicule 3D', Car, 'voiture conduisible'],
        ['particles', 'Émetteur de particules', Sparkles, 'vfx fx fumee etincelles'],
        ['river', 'Rivière 3D', Waves, 'eau water riviere'],
        ['pointLight', 'Lumière ponctuelle', Sun, 'ampoule lamp'],
        ['spotLight', 'Spot light', Zap, 'projecteur faisceau'],
        ['dirLight', 'Soleil directionnel', Sun, 'soleil sun ombres'],
        ['camera', 'Caméra cible', Camera, 'camera visee'],
        ['navMeshAgent', 'PNJ NavMesh (IA)', Target, 'pnj ia pathfinding'],
        ['triggerVolume', 'Zone Trigger', BoxSelect, 'zone declencheur volume'],
        ['checkpoint', 'Checkpoint', Flag, 'point reapparition respawn'],
        ['spawnPoint', 'Spawn multijoueur', MapPin, 'spawn multi reseau'],
        ['postProcessVolume', 'Volume Post-Process', Aperture, 'postprocess bloom'],
      ] as Array<[string, string, React.ComponentType<{ className?: string }>, string]>
    ).map(([type, label, icon, keywords]) =>
      add(`add.${type}`, `Ajouter : ${label}`, 'Créer', () => handleAddPrimitive(type as never), {
        icon,
        keywords,
      })
    );

    return [
      ...createCmds,

      add('scene.duplicate', 'Dupliquer la sélection', 'Scène', () => {
        if (selectedNode) handleDuplicateNode(selectedNode.id);
      }, { icon: Copy, shortcut: 'Ctrl+D', disabled: !hasSelection }),

      add('scene.copy', 'Copier la sélection', 'Scène', handleCopySelection, {
        icon: ClipboardCopy,
        shortcut: 'Ctrl+C',
        disabled: !hasSelection,
      }),

      add('scene.paste', 'Coller devant la caméra', 'Scène', handlePasteInFrontOfCamera, {
        icon: ClipboardPaste,
        shortcut: 'Ctrl+V',
        disabled: clipboard.length === 0,
      }),

      add('scene.delete', 'Supprimer la sélection', 'Scène', () => {
        if (selectedNode) handleDeleteNode(selectedNode.id);
      }, { icon: Trash2, shortcut: 'Suppr', disabled: !hasSelection }),

      add('scene.group', 'Grouper la sélection', 'Scène', handleGroupSelected, {
        icon: Group,
        shortcut: 'Ctrl+G',
        disabled: !hasSelection,
      }),

      add('scene.ungroup', 'Dégrouper', 'Scène', () => {
        if (selectedNode) handleUngroup(selectedNode.id);
      }, { icon: Ungroup, disabled: !hasSelection }),

      add('scene.focus', 'Cadrer sur la sélection', 'Scène', () => sm()?.focusOnObject(), {
        icon: Focus,
        shortcut: 'F',
        disabled: !hasSelection,
      }),

      add('scene.cameraReset', 'Réinitialiser la caméra', 'Scène', () => sm()?.resetCamera(), {
        icon: RotateCcw,
        shortcut: 'Alt+R',
      }),

      // Navigation façon Blender (voir lib/input/navigation.ts).
      add('scene.frameAll', 'Cadrer toute la scène', 'Scène', () => sm()?.frameAll(), {
        icon: Focus,
        shortcut: 'Home',
        keywords: 'frame all zoomer vueFOV zoom fit recadrer',
      }),

      // Historique et sauvegarde : déjà câblés côté moteur, simplement
      // invisibles tant qu'ils n'ont pas d'entrée de palette.
      add('scene.undo', 'Annuler', 'Édition', () => handleUndo(), {
        icon: Undo2,
        shortcut: 'Ctrl+Z',
        keywords: 'undo retour arrière annuler',
        disabled: !historyUi.canUndo,
      }),

      add('scene.redo', 'Rétablir', 'Édition', () => handleRedo(), {
        icon: Redo2,
        shortcut: 'Ctrl+Y',
        keywords: 'redo rétablir refaire avant',
        disabled: !historyUi.canRedo,
      }),

      add('scene.backups', 'Sauvegardes de la scène', 'Fichier', () => setIsBackupsOpen(true), {
        icon: History,
        keywords: 'sauvegarde backup snapshot restaurer historique autosave',
      }),

      ...(
        [
          ['front', 'Vue : Face', 'Num 1', 'front avant devant z+'],
          ['back', 'Vue : Arrière', 'Ctrl+Num 1', 'back derriere z-'],
          ['right', 'Vue : Droite', 'Num 3', 'right droite x+'],
          ['left', 'Vue : Gauche', 'Ctrl+Num 3', 'left gauche x-'],
          ['top', 'Vue : Dessus', 'Num 7', 'top dessus haut y+'],
          ['bottom', 'Vue : Dessous', 'Ctrl+Num 7', 'bottom dessous bas y-'],
          ['iso', 'Vue : Isométrique', '', 'iso perspective isometrique'],
        ] as Array<[CameraViewPreset, string, string, string]>
      ).map(([view, label, keys, keywords]) =>
        add(`view.cam.${view}`, label, 'Scène', () => sm()?.setCameraView(view), {
          icon: Compass,
          shortcut: keys,
          keywords,
        })
      ),

      add('scene.reset', 'Recharger la scène démo', 'Scène', handleResetDemoScene, {
        icon: RotateCcw,
      }),

      add('scene.clear', 'Vider la scène', 'Scène', handleClearScene, {
        icon: Eraser,
        keywords: 'supprimer tout reset blank vide',
      }),
      /* SPLIT_MARKER */

      add('view.hierarchy', isHierarchyOpen ? 'Masquer la hiérarchie' : 'Afficher la hiérarchie', 'Affichage', () => {
        setIsHierarchyOpen((v) => !v);
      }, { icon: isHierarchyOpen ? PanelLeftClose : PanelLeft, shortcut: 'Ctrl+H' }),

      add('view.assets', isAssetManagerOpen ? 'Masquer la bibliothèque' : 'Afficher la bibliothèque', 'Affichage', () => {
        setIsAssetManagerOpen((v) => !v);
      }, { icon: FolderOpen, shortcut: 'Ctrl+B' }),

      add('view.zen', zenMode ? 'Quitter le mode Zen' : 'Mode Zen (viewport agrandi)', 'Affichage', () => {
        setZenMode((v) => !v);
      }, { icon: zenMode ? Minimize2 : Maximize2, shortcut: 'Ctrl+.' }),

      add('view.profiler', isProfilerOpen ? 'Fermer le Profiler' : 'Ouvrir le Profiler & Debug', 'Affichage', () => {
        setIsProfilerOpen((v) => !v);
      }, { icon: Activity, hint: isProfilerOpen ? 'ouvert' : undefined }),

      add('view.render.shaded', 'Rendu : Shaded (PBR)', 'Affichage', () => handleRenderModeChange('shaded'), {
        icon: Sun,
        shortcut: '1',
      }),
      add('view.render.wireframe', 'Rendu : Wireframe', 'Affichage', () => handleRenderModeChange('wireframe'), {
        icon: Scan,
        shortcut: '2',
      }),
      add('view.render.normals', 'Rendu : Normales', 'Affichage', () => handleRenderModeChange('normals'), {
        icon: Box,
        shortcut: '3',
      }),

      add('view.snap', snapping ? 'Désactiver l’accrochage' : 'Activer l’accrochage (Snap)', 'Affichage', handleToggleSnapping, {
        icon: Magnet,
        keywords: 'magnetisme grille surface sommet',
      }),

      add('atmosphere', 'Atmosphère, Ciel & Post-Processing', 'Outils', () => setIsAtmosphereModalOpen(true), {
        icon: CloudSun,
        keywords: 'hdr brouillard fog soleil bloom',
      }),
      add('hud', 'Éditeur de HUD In-Game', 'Outils', () => setIsHUDModalOpen(true), {
        icon: LayoutTemplate,
        keywords: 'canvas ui vie score pause interface',
      }),
      add('textures', 'Textures PBR', 'Outils', () => setIsTexturePanelOpen(true), {
        icon: ImageIcon,
        keywords: 'image materiau relief tiling albedo',
      }),
      add('animator', 'Animator Controller', 'Outils', () => {
        setIsAnimatorOpen(true);
        const s = sm();
        if (s) {
          const cands = s.listAnimatorCandidates();
          setAnimatorCandidates(cands);
          const pick =
            (selectedNode ? cands.find((c) => c.uuid === selectedNode.id) : undefined) ?? cands[0];
          setAnimatorUuid(pick?.uuid ?? null);
          setAnimatorController(pick ? s.getAnimatorController(pick.uuid) : null);
        }
      }, { icon: Drama, keywords: 'animation etat transition blend' }),

      add('timeline', 'Timeline (keyframes de trajectoire)', 'Outils', () => setIsTimelineOpen(true), {
        icon: Film,
        disabled: !hasSelection,
        keywords: 'keyframes courbe animation trajectoire',
      }),

      add('multiplayer', 'Multijoueur P2P (WebRTC)', 'Réseau', () => setIsMultiplayerOpen(true), {
        icon: Users,
        keywords: 'reseau online p2p session',
      }),
      add('collab', 'Collaboration temps réel', 'Réseau', () => setIsCollabOpen(true), {
        icon: GitBranch,
        keywords: 'crdt version branche equipe',
      }),
      add('share', 'Partager & Aperçu live', 'Réseau', () => setIsShareOpen(true), {
        icon: Share2,
        keywords: 'lien url pwa installer',
      }),

      add('export.game', 'Exporter le jeu autonome (HTML)', 'Publier', handleOpenExportModal, {
        icon: Rocket,
        shortcut: 'Ctrl+E',
        keywords: 'build publier web autonome',
      }),
      add('import.gltf', 'Importer un modèle 3D (GLTF/GLB)', 'Publier', () => {
        pickFile('.gltf,.glb,.fbx', (file) => void handleImportGLTF(file));
      }, { icon: Upload, keywords: 'glb gltf fbx modele mesh' }),

      add('play', isPlaying ? 'Arrêter la simulation' : 'Lancer la simulation (Play)', 'Jeu', handleTogglePlay, {
        icon: isPlaying ? Square : Play,
        shortcut: 'Espace',
        keywords: 'play stop run test jouer',
      }),

      add('step.decor', 'Étape 1 — Décor & Monde', 'Étapes', () => selectWorkflowMode('decor'), {
        icon: MapIcon,
        shortcut: 'Alt+1',
      }),
      add('step.character', 'Étape 2 — Personnage & Anims', 'Étapes', () => selectWorkflowMode('character'), {
        icon: UserRound,
        shortcut: 'Alt+2',
      }),
      add('step.rules', 'Étape 3 — Règles du Jeu', 'Étapes', () => selectWorkflowMode('rules'), {
        icon: Zap,
        shortcut: 'Alt+3',
      }),
      add('step.test', 'Étape 4 — Tester & Partager', 'Étapes', () => selectWorkflowMode('test'), {
        icon: Rocket,
        shortcut: 'Alt+4',
      }),

      add('help', 'Aide & raccourcis', 'Aide', () => setIsHelpOpen(true), {
        icon: HelpCircle,
        shortcut: 'F1',
      }),
      add('help.welcome', 'Revoir l’introduction', 'Aide', handleReplayIntro, {
        icon: Sparkles,
        keywords: 'tuto onboarding debutant bienvenue',
      }),
    ];
  }, [
    clipboard.length,
    handleAddPrimitive,
    handleClearScene,
    handleCopySelection,
    handleDeleteNode,
    handleDuplicateNode,
    handleGroupSelected,
    handleImportGLTF,
    handleOpenExportModal,
    handlePasteInFrontOfCamera,
    handleRenderModeChange,
    handleReplayIntro,
    handleTogglePlay,
    handleToggleSnapping,
    handleUndo,
    handleRedo,
    handleUngroup,
    handleResetDemoScene,
    isAssetManagerOpen,
    isHierarchyOpen,
    isPlaying,
    isProfilerOpen,
    selectedNode,
    selectWorkflowMode,
    snapping,
    zenMode,
    historyUi,
  ]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans select-none">
      {/* Studio Top Toolbar */}
      <Toolbar
        isPlaying={isPlaying}
        renderMode={renderMode}
        snapping={snapping}
        snapSettings={snapSettings}
        isAssetManagerOpen={isAssetManagerOpen}
        onTogglePlay={handleTogglePlay}
        onRenderModeChange={handleRenderModeChange}
        onToggleSnapping={handleToggleSnapping}
        onSnapSettingsChange={handleSnapSettingsChange}
        onToggleAssetManager={() => setIsAssetManagerOpen(!isAssetManagerOpen)}
        onOpenAtmosphereModal={() => setIsAtmosphereModalOpen(true)}
        onOpenHUDModal={() => setIsHUDModalOpen(true)}
        onOpenTexturePanel={() => setIsTexturePanelOpen(true)}
        onOpenExportModal={handleOpenExportModal}
        onOpenMultiplayerModal={() => setIsMultiplayerOpen(true)}
        isMultiplayerActive={netRole !== 'none'}
        onOpenCollabModal={() => setIsCollabOpen(true)}
        isCollabActive={(sceneManagerRef.current?.collabActive ?? false)}
        onOpenShareModal={() => setIsShareOpen(true)}
        showInstallButton={pwaInstallable}
        onInstallPwa={() => {
          void promptPwaInstall().then(() => setPwaInstallable(false));
        }}
        onOpenAnimatorModal={() => {
          setIsAnimatorOpen(true);
          const sm = sceneManagerRef.current;
          if (sm) {
            try {
              const cands = sm.listAnimatorCandidates();
              setAnimatorCandidates(cands);
              const fallback = selectedNode ? cands.find((c) => c.uuid === selectedNode.id) : undefined;
              const pick = fallback ?? cands[0];
              setAnimatorUuid(pick?.uuid ?? null);
              setAnimatorController(pick ? sm.getAnimatorController(pick.uuid) : null);
            } catch {
              /* ignore */
            }
          }
        }}
        onImportGLTF={handleImportGLTF}
        isProfilerOpen={isProfilerOpen}
        onToggleProfiler={() => setIsProfilerOpen((v) => !v)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        zenMode={zenMode}
        onToggleZen={() => setZenMode((v) => !v)}
        canUndo={historyUi.canUndo}
        canRedo={historyUi.canRedo}
        undoLabel={historyUi.undoLabel}
        redoLabel={historyUi.redoLabel}
        onUndo={handleUndo}
        onRedo={handleRedo}
        autosave={autosaveUi}
        onOpenBackups={() => setIsBackupsOpen(true)}
      />

      {/* Barre d'étapes du parcours débutant (Masquée en mode Zen) */}
      {!zenMode && (
        <WorkflowStepper
          mode={workflowMode}
          visited={workflowVisited}
          isHierarchyOpen={isHierarchyOpen}
          onToggleHierarchy={() => setIsHierarchyOpen((prev) => !prev)}
          onSelect={selectWorkflowMode}
          onOpenHelp={() => setIsHelpOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />
      )}

      {/* Zone de travail. `flex-1 min-h-0` remplace le ancien
          `h-[calc(100vh-6.5rem)]` : la hauteur suit désormais automatiquement
          le nombre de barres visibles (2 en normal, 1 en mode Zen). */}
      <main className="relative flex min-h-0 w-full flex-1 overflow-hidden">
        {/* Left: Scene Hierarchy (Retractable / Collapsible) */}
        {isHierarchyOpen && (
        <Hierarchy
          nodes={nodes}
          selectedNode={selectedNode}
          selectedIds={selectedIds}
          onSelectNode={handleSelectNode}
          onSelectRange={handleSelectRange}
          onToggleVisibility={handleToggleVisibility}
          onDeleteNode={handleDeleteNode}
          onDuplicateNode={handleDuplicateNode}
          onRenameNode={handleRenameNode}
          onMoveNode={handleMoveNode}
          onCreateEmptyChild={handleCreateEmptyChild}
          onGroupSelected={handleGroupSelected}
          onUngroup={handleUngroup}
          onSelectChildren={handleSelectChildren}
        />
        )}

        {/* Center: 3D Viewport & Bottom Asset Manager Shelf */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* Central 3D Viewport with Raycasting Drop Target */}
          <div className="flex-1 relative overflow-hidden">
            <Viewport
              sceneManagerRef={sceneManagerRef}
              containerRef={viewportContainerRef}
              selectedNode={selectedNode}
              gizmoMode={gizmoMode}
              gizmoSpace={gizmoSpace}
              isPlaying={isPlaying}
              workPlaneConfig={workPlaneConfig}
              onUpdateWorkPlaneConfig={handleUpdateWorkPlaneConfig}
              onGizmoModeChange={handleGizmoModeChange}
              onGizmoSpaceChange={handleGizmoSpaceChange}
              onTogglePlay={handleTogglePlay}
              onImportGLTF={handleImportGLTF}
              onImportSceneJSON={handleImportSceneJSON}
              onAddPrimitiveAtPos={(type, pos) =>
                handleAddPrimitive(type as Parameters<typeof handleAddPrimitive>[0], pos)
              }
              onApplyMaterialPreset={handleApplyMaterialPreset}
              clipboardCount={clipboard.length}
              onCopySelection={handleCopySelection}
              onCutSelection={handleCutSelection}
              onPasteAt={handlePasteAt}
            />

            {/* Overlaid WYSIWYG In-Game HUD (Visible during gameplay & editor preview) */}
            <InGameHUDOverlay
              config={hudConfig}
              isPlaying={isPlaying}
              stats={stats}
              sceneManagerRef={sceneManagerRef}
              onRestart={() => {
                sceneManagerRef.current?.setPlayMode(false);
                setTimeout(() => sceneManagerRef.current?.setPlayMode(true), 100);
              }}
              onResume={() => {
                // Resume game
              }}
            />

            {/* Health / inventory / floating damage numbers (play mode only) */}
            <FloatingDamageHUD sceneManagerRef={sceneManagerRef} isPlaying={isPlaying} />

            {/* Letterbox bars, DOF and dialogue subtitles (play mode only) */}
            <DialogueCinematicOverlay sceneManagerRef={sceneManagerRef} isPlaying={isPlaying} />
          </div>

          {/* Bottom Docked Asset Manager Shelf */}
          <AssetManager
            isOpen={isAssetManagerOpen}
            onToggleOpen={() => setIsAssetManagerOpen(!isAssetManagerOpen)}
            onAddPrimitive={handleAddPrimitive}
            onApplyMaterialPreset={handleApplyMaterialPreset}
            onImportGLTF={handleImportGLTF}
            onExportScene={handleExportScene}
            onOpenExportModal={handleOpenExportModal}
            onImportSceneJSON={handleImportSceneJSON}
            onClearScene={handleClearScene}
            onResetDemoScene={handleResetDemoScene}
            hasSelectedNode={Boolean(selectedNode)}
            workflowMode={workflowMode}
            prefabs={prefabs}
            onAddPrefab={handleAddPrefab}
            onDeletePrefab={handleDeletePrefab}
            lowPolyModels={foliageLibrary}
            lowPolyThumbnails={lowPolyThumbnails}
            onAddLowPoly={handleAddLowPoly}
            assetStats={assetStats}
            assetRecords={assetRecords}
            assetBundles={assetBundles}
            onRefreshAssets={refreshAssets}
            onPurgeOrphans={handlePurgeOrphans}
            onDeleteAsset={handleDeleteAsset}
            onCreateBundle={handleCreateBundle}
            onPreloadBundle={handlePreloadBundle}
            onUnloadBundle={handleUnloadBundle}
            onDeleteBundle={handleDeleteBundle}
            onExportSceneBinary={handleExportSceneBinary}
            onImportSceneBinary={handleImportSceneBinary}
            cullingStats={cullingStats}
            lodConfig={lodConfig}
            cullingConfig={cullingConfig}
            onLODConfigChange={handleLODConfigChange}
            onCullingConfigChange={handleCullingConfigChange}
            onAuditFrustum={handleAuditFrustum}
            backups={backups}
            onRefreshBackups={refreshBackups}
            onRestoreBackup={handleRestoreBackup}
            onDeleteBackup={handleDeleteBackup}
          />
        </div>

        {/* Right: Object Inspector with Advanced PBR Sliders */}
        <Inspector
          selectedNode={selectedNode}
          isPlaying={isPlaying}
          onUpdateTransform={handleUpdateTransform}
          onUpdateMaterial={handleUpdateMaterial}
          onUpdateLowPolyPalette={handleUpdateLowPolyPalette}
          onToggleSmoothShading={handleToggleSmoothShading}
          onUpdateLight={handleUpdateLight}
          onUpdatePhysics={handleUpdatePhysics}
          onUpdateLogic={handleUpdateLogic}
          onUpdateRigAnim={handleUpdateRigAnim}
          onGetChildNames={(id) => sceneManagerRef.current?.getChildNames(id) || []}
          onAppendAnimations={handleAppendAnimations}
          onTestAnimation={handleTestAnimation}
          onStopTestAnimation={handleStopTestAnimation}
          onTestRagdoll={handleTestRagdoll}
          onToggleDebugWireframes={handleToggleDebugWireframes}
          onOpenNodeGraph={handleOpenNodeGraph}
          onOpenTimeline={handleOpenTimeline}
          onUpdateName={handleRenameNode}
          onUpdateRepeat={handleUpdateRepeat}
          onGetRepeatInfo={handleGetRepeatInfo}
          onToggleVisibility={handleToggleVisibility}
          onToggleShadows={handleToggleShadows}
          onFocusObject={handleFocusObject}
          onDuplicateObject={handleDuplicateNode}
          onDeleteObject={handleDeleteNode}
          onUpdateRiverConfig={handleUpdateRiverConfig}
          onUpdateParticles={handleUpdateParticlesConfig}
          onSnapToGround={(id) => {
            sceneManagerRef.current?.snapObjectToGround(id);
            resyncHierarchy(id);
          }}
          onSaveAsPrefab={handleSaveAsPrefab}
          cameraFollowTargetId={cameraFollowTargetId}
          cameraFollowConfig={cameraFollowConfig}
          onAssignCamera={handleAssignCamera}
          onClearCameraFollow={handleClearCameraFollow}
          onFrameFollowed={handleFrameFollowed}
          onUpdateCameraFollow={handleUpdateCameraFollow}
          onApplyPrefab={handleApplyPrefab}
          onRevertPrefab={handleRevertPrefab}
          onUnlinkPrefab={handleUnlinkPrefab}
          onRemoveComponent={handleRemoveComponent}
          selectedNodes={(() => {
            const byId = new Map(nodes.map((n) => [n.id, n]));
            const list = selectedIds
              .map((id) => byId.get(id))
              .filter((n): n is SceneNode => Boolean(n));
            if (list.length > 0) return list;
            return selectedNode ? [selectedNode] : [];
          })()}
          prefabName={
            selectedNode?.prefabId
              ? (prefabs.find((p) => p.id === selectedNode.prefabId)?.name ?? null)
              : null
          }
          workflowMode={workflowMode}
          getInputManager={() => sceneManagerRef.current?.physicsManager.characterSystem.input ?? null}
        />
      </main>

      {/* Animation & Trajectory Keyframe Editor Modal */}
      {isTimelineOpen && selectedNode && (
        <TimelineEditorModal
          isOpen={isTimelineOpen}
          selectedNode={selectedNode}
          sceneManagerRef={sceneManagerRef}
          onClose={() => setIsTimelineOpen(false)}
        />
      )}

      {/* Profiler & Debug Panel (TIER 1.3) */}
      <ProfilerPanel
        isOpen={isProfilerOpen}
        onClose={() => setIsProfilerOpen(false)}
        getSnapshot={getProfilerSnapshot}
        physicsDebug={physicsDebugVisible}
        onTogglePhysicsDebug={handleTogglePhysicsDebug}
        onSnapshotMemory={handleSnapshotMemory}
        onResetProfiler={handleResetProfiler}
      />

      {/* Level 2: Visual Node Graph Modal */}
      {isNodeGraphOpen && nodeGraphTargetNode && (
        <NodeGraphModal
          key={nodeGraphTargetNode.id}
          isOpen={isNodeGraphOpen}
          onClose={() => setIsNodeGraphOpen(false)}
          entityId={nodeGraphTargetNode.id}
          entityName={nodeGraphTargetNode.name}
          entityNames={entityNameOptions}
          initialGraph={nodeGraphInitialData || nodeGraphTargetNode.logic?.nodeGraph}
          onSave={handleSaveNodeGraph}
        />
      )}

      {/* Atmosphere & Sky Manager Modal */}
      {isAtmosphereModalOpen && (
        <AtmosphereModal
          isOpen={isAtmosphereModalOpen}
          onClose={() => setIsAtmosphereModalOpen(false)}
          atmosphere={atmosphere}
          postProcessing={postProcessing}
          onUpdateAtmosphere={handleUpdateAtmosphere}
          onApplySkyPreset={handleApplySkyPreset}
          onUpdatePostProcessing={handleUpdatePostProcessing}
          onSelectWaterNode={() => {
            const waterMesh = sceneManagerRef.current?.waterManager?.waterMesh;
            if (waterMesh) {
              sceneManagerRef.current?.selectById(waterMesh.uuid);
            }
          }}
          onAddRiver={() => handleAddPrimitive('river')}
          nodes={nodes}
          onUpdateRiverConfig={handleUpdateRiverConfig}
        />
      )}

      {/* Multiplayer P2P Modal */}
      <MultiplayerModal
        isOpen={isMultiplayerOpen}
        onClose={() => setIsMultiplayerOpen(false)}
        role={netRole}
        playerName={netPlayerName}
        onPlayerNameChange={setNetPlayerName}
        isSpectator={netSpectator}
        onStartHost={handleStartHost}
        onCreateInvite={handleCreateInvite}
        onAcceptAnswer={handleAcceptAnswer}
        onJoin={handleJoinSession}
        onStop={handleStopNet}
        onSetSpectator={handleSetNetSpectator}
        onRespawn={handleNetRespawn}
        getStats={() => sceneManagerRef.current?.getNetStats() ?? { role: 'none', clients: 0, rttMs: 0, reconciliations: 0, lastError: 0, remotes: 0 }}
        getPeers={() => (sceneManagerRef.current?.netRole === 'host' && sceneManagerRef.current?.netHost ? sceneManagerRef.current.netHost.getPeers() : netPeers)}
        getLog={() => sceneManagerRef.current?.getNetLog() ?? []}
      />

      {/* Animator Controller Modal (4.2) */}
      <AnimatorModal
        isOpen={isAnimatorOpen}
        onClose={() => setIsAnimatorOpen(false)}
        candidates={animatorCandidates}
        selectedUuid={animatorUuid}
        onSelectObject={handleSelectAnimatorObject}
        controller={animatorController}
        onCreateController={handleCreateAnimator}
        onSaveController={handleSaveAnimator}
        onDeleteController={handleDeleteAnimator}
        onPreviewState={(uuid, state) => sceneManagerRef.current?.playAnimatorState(uuid, state)}
        onSetParam={(uuid, name, value) => sceneManagerRef.current?.setAnimatorParam(uuid, name, value)}
        onTrigger={(uuid, name) => sceneManagerRef.current?.fireAnimatorTrigger(uuid, name)}
        getInfo={(uuid) => sceneManagerRef.current?.getAnimatorInfo(uuid) ?? null}
      />

      {/* Partage & diffusion Web-natifs (5.3) */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        onMakeLink={() => {
          const sm = sceneManagerRef.current;
          if (!sm) throw new Error('Moteur indisponible.');
          return encodeSceneToUrl(sm.exportScene());
        }}
        liveActive={sceneManagerRef.current?.livePreviewActive ?? false}
        liveViewers={sceneManagerRef.current?.previewHost?.viewers ?? 0}
        onStartLive={() => sceneManagerRef.current?.startLivePreview()}
        onLiveInvite={() => {
          const sm = sceneManagerRef.current;
          if (!sm) throw new Error('Moteur indisponible.');
          return sm.createLiveInvite();
        }}
        onLiveAccept={(code) => {
          const sm = sceneManagerRef.current;
          if (!sm) throw new Error('Moteur indisponible.');
          return sm.acceptLiveAnswer(code);
        }}
        onStopLive={() => sceneManagerRef.current?.stopLivePreview()}
        installAvailable={pwaInstallable}
        onInstall={() => promptPwaInstall()}
      />
      <PwaRegister />

      {/* Collaboration temps réel Modal (5.2) */}
      <CollabModal
        isOpen={isCollabOpen}
        onClose={() => setIsCollabOpen(false)}
        userName={collabName}
        onUserNameChange={setCollabName}
        stats={sceneManagerRef.current?.getCollabStats() ?? { active: false, role: 'none', peers: 0, lamport: 0, commits: 0, branch: 'main', branches: 1 }}
        peers={sceneManagerRef.current?.getCollabPeers() ?? []}
        log={sceneManagerRef.current?.getCollabLog() ?? []}
        onStart={() => sceneManagerRef.current?.startCollabSession(collabName)}
        onInvite={() => {
          const sm = sceneManagerRef.current;
          if (!sm) throw new Error('Moteur indisponible.');
          return sm.createCollabInvite();
        }}
        onAccept={(code) => {
          const sm = sceneManagerRef.current;
          if (!sm) throw new Error('Moteur indisponible.');
          return sm.acceptCollabAnswer(code);
        }}
        onJoin={(invite) => {
          const sm = sceneManagerRef.current;
          if (!sm) throw new Error('Moteur indisponible.');
          return sm.joinCollabSession(invite, collabName);
        }}
        onStop={() => sceneManagerRef.current?.stopCollabSession()}
        getWorkDiff={() => sceneManagerRef.current?.diffCollabWork() ?? { added: [], removed: [], modified: [], settingsChanged: false, totalChanges: 0 }}
        getCommits={(branch) => sceneManagerRef.current?.listCollabCommits(branch) ?? []}
        getBranches={() => sceneManagerRef.current?.listCollabBranches() ?? []}
        onCommit={(message) => sceneManagerRef.current?.collabCommit(message)}
        onCheckout={(id) => sceneManagerRef.current?.checkoutCollabCommit(id)}
        onShare={(id) => sceneManagerRef.current?.shareCollabCommit(id)}
        onDiffCommits={(a, b) => sceneManagerRef.current?.diffCollabCommits(a, b) ?? null}
        onCreateBranch={(name) => sceneManagerRef.current?.createCollabBranch(name)}
        onSwitchBranch={(name) => sceneManagerRef.current?.switchCollabBranch(name)}
        onPrepareMerge={(headId) => {
          const sm = sceneManagerRef.current;
          if (!sm) throw new Error('Moteur indisponible.');
          return sm.prepareCollabMerge(headId);
        }}
        getConflicts={() => sceneManagerRef.current?.pendingCollabConflicts() ?? []}
        onResolveMerge={(res) => sceneManagerRef.current?.resolveCollabMerge(res) ?? false}
        onDiscardMerge={() => sceneManagerRef.current?.discardCollabMerge()}
      />

      {/* WYSIWYG In-Game HUD Manager Modal */}
      {isHUDModalOpen && (
        <HUDManagerModal
          isOpen={isHUDModalOpen}
          onClose={() => setIsHUDModalOpen(false)}
          config={hudConfig}
          onSave={handleSaveHUDConfig}
        />
      )}

      {/* Standalone One-Click Web Game Exporter Modal */}
      {isExportModalOpen && exportSceneData && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          sceneData={exportSceneData}
          getGLB={() => sceneManagerRef.current?.exportSceneGLTF() ?? null}
          getBinary={() => sceneManagerRef.current?.exportSceneBinary() ?? null}
        />
      )}

      {/* Sauvegardes horodatées (les slots existent, ils étaient innavigables) */}
      <BackupsModal
        open={isBackupsOpen}
        onClose={() => setIsBackupsOpen(false)}
        onBackupNow={handleBackupNow}
        onListBackups={listBackups}
        onRestoreBackup={restoreBackup}
        onDeleteBackup={deleteBackup}
      />

      {/* Texture Assigner Modal Panel */}
      <TextureAssignerPanel
        isOpen={isTexturePanelOpen}
        onClose={() => setIsTexturePanelOpen(false)}
        selectedNode={selectedNode}
        onUpdateMaterial={handleUpdateMaterial}
        onImportLocalTexture={handleImportLocalTexture}
        getUvAnalysis={handleGetUvAnalysis}
      />

      {/* Onboarding débutant + aide intégrée */}
      <WelcomeScreen
        open={welcomeOpen}
        canDismiss={welcomeCanDismiss}
        onClose={() => setWelcomeOpen(false)}
        onChoose={handleWelcomeChoice}
      />
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onReplayIntro={handleReplayIntro}
      />

      {/* Palette de commandes (Ctrl+K) — au-dessus de tous les overlays */}
      <CommandPalette
        open={isCommandPaletteOpen}
        commands={commands}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* Toasts + alert/confirm/prompt maison (remplace les natifs) */}
      <OverlayHost />
    </div>
  );
}

