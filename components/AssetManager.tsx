'use client';

import React, { useEffect, useState, useRef } from 'react';
import { alertBox, confirmBox } from '../lib/ui/overlays';
import {
  Box,
  Circle,
  Cylinder,
  LifeBuoy,
  Triangle,
  Sun,
  Camera,
  UploadCloud,
  Download,
  FolderOpen,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Layers,
  
  FileCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Gamepad2,
  Waves,
  Target,
  Flag,
  BoxSelect,
  Trash2,
  Database,
  Package,
  Aperture,
  MapPin,
  Eye,
  ScanLine,
  Car,
} from 'lucide-react';
import { ModelInfo, SceneExportData } from '../types/engine';
import {
  AssetBundleManifest,
  AssetRecord,
  AssetStats,
  formatBytes,
} from '../types/assets';
import type {
  LODGlobalConfig,
  CullingConfig,
  CullingStats,
  FrustumAuditResult,
} from '../types/culling';
import type { BackupInfo } from '../lib/serialize/backups';
import type { FoliageLibraryEntry } from '../lib/terrain/FoliagePainter';

/** Taille max d'un fichier de scène accepté (250 Mo, anti-DoS). */
const MAX_SCENE_FILE_BYTES = 250 * 1024 * 1024;

interface AssetManagerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onAddPrimitive: (
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
  ) => void;
  onApplyMaterialPreset: (presetName: string) => void;
  onImportGLTF: (file: File) => Promise<void>;
  onExportScene: () => void;
  onImportSceneJSON: (data: SceneExportData) => void;
  /** Ouvre le hub d'export unifié (modal) ; sinon fallback sur onExportScene. */
  onOpenExportModal?: () => void;
  onClearScene: () => void;
  onResetDemoScene: () => void;
  hasSelectedNode: boolean;
  workflowMode?: 'decor' | 'character' | 'rules' | 'test';
  prefabs?: Array<{ id: string; name: string; nodes: any[] }>;
  onAddPrefab?: (nodes: any[], prefabId?: string) => void;
  onDeletePrefab?: (id: string) => void;
  /** Bibliothèque low-poly (LOW_POLY_set.glb) : null = chargement en cours. */
  lowPolyModels?: FoliageLibraryEntry[] | null;
  /** Vignettes 3D (id → dataURL PNG) rendues hors-écran. */
  lowPolyThumbnails?: Record<string, string>;
  onAddLowPoly?: (lowPolyId: string) => void;
  // --- Asset Pipeline (TIER 1.2) ---
  assetStats?: AssetStats | null;
  assetRecords?: AssetRecord[];
  assetBundles?: AssetBundleManifest[];
  onRefreshAssets?: () => void;
  onPurgeOrphans?: () => void;
  onDeleteAsset?: (id: string) => void;
  onCreateBundle?: (name: string) => void;
  onPreloadBundle?: (id: string) => void;
  onUnloadBundle?: (id: string) => void;
  onDeleteBundle?: (id: string) => void;
  // --- Sérialisation (TIER 1.4 : binaire .aether + sauvegardes) ---
  onExportSceneBinary?: () => void;
  onImportSceneBinary?: (bytes: Uint8Array) => void;
  backups?: BackupInfo[];
  onRefreshBackups?: () => void;
  onRestoreBackup?: (key: string) => void;
  onDeleteBackup?: (key: string) => void;
  // --- LOD & Culling (3.4) ---
  cullingStats?: CullingStats | null;
  lodConfig?: LODGlobalConfig | null;
  cullingConfig?: CullingConfig | null;
  onLODConfigChange?: (patch: Partial<LODGlobalConfig>) => void;
  onCullingConfigChange?: (patch: Partial<CullingConfig>) => void;
  onAuditFrustum?: () => FrustumAuditResult | null;
}

export const AssetManager: React.FC<AssetManagerProps> = ({
  isOpen,
  onToggleOpen,
  onAddPrimitive,
  onApplyMaterialPreset,
  onImportGLTF,
  onExportScene,
  onImportSceneJSON,
  onOpenExportModal,
  onClearScene,
  onResetDemoScene,
  hasSelectedNode,
  workflowMode = 'decor',
  prefabs = [],
  onAddPrefab,
  onDeletePrefab,
  lowPolyModels = null,
  lowPolyThumbnails = {},
  onAddLowPoly,
  assetStats = null,
  assetRecords = [],
  assetBundles = [],
  onRefreshAssets,
  onPurgeOrphans,
  onDeleteAsset,
  onCreateBundle,
  onPreloadBundle,
  onUnloadBundle,
  onDeleteBundle,
  onExportSceneBinary,
  onImportSceneBinary,
  backups = [],
  onRefreshBackups,
  onRestoreBackup,
  onDeleteBackup,
  cullingStats = null,
  lodConfig = null,
  cullingConfig = null,
  onLODConfigChange,
  onCullingConfigChange,
  onAuditFrustum,
}) => {
  const [activeTab, setActiveTab] = useState<'primitives' | 'materials' | 'models' | 'scene' | 'prefabs' | 'assets'>('primitives');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    loading: boolean;
    success?: string;
    error?: string;
    info?: ModelInfo;
  }>({ loading: false });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const binaryInputRef = useRef<HTMLInputElement>(null);
  const [newBundleName, setNewBundleName] = useState('');
  const [frustumAudit, setFrustumAudit] = useState<FrustumAuditResult | null>(null);

  // Workflow beginner guidance: suivre l'étape active (onglet + objets conseillés).
  const recommendedTab: 'primitives' | 'materials' | 'models' | 'scene' | 'prefabs' | 'assets' =
    workflowMode === 'test' ? 'scene' : 'primitives';
  const recommendedTypes: ReadonlySet<string> =
    workflowMode === 'character'
      ? new Set(['player'])
      : workflowMode === 'rules'
        ? new Set(['triggerVolume', 'checkpoint'])
        : workflowMode === 'test'
          ? new Set(['spawnPoint', 'checkpoint'])
          : new Set();

  useEffect(() => {
    setActiveTab(recommendedTab);
  }, [recommendedTab]);

  // Primitives library definition
  const primitives = [
    { type: 'cube', label: 'Cube', icon: Box, color: 'text-sky-400', desc: 'Boîte 1.5m' },
    { type: 'sphere', label: 'Sphère', icon: Circle, color: 'text-rose-400', desc: 'Sphère PBR' },
    { type: 'player', label: 'Joueur FPS/3P', icon: Gamepad2, color: 'text-cyan-400', desc: 'Contrôleur ZQSD' },
    { type: 'cylinder', label: 'Cylindre', icon: Cylinder, color: 'text-emerald-400', desc: 'Pilier 1.8m' },
    { type: 'torus', label: 'Tore', icon: LifeBuoy, color: 'text-amber-400', desc: 'Anneau 0.9m' },
    { type: 'cone', label: 'Cône', icon: Triangle, color: 'text-purple-400', desc: 'Cône 1.8m' },
    { type: 'plane', label: 'Plan', icon: Layers, color: 'text-zinc-400', desc: 'Surface sol' },
    { type: 'pointLight', label: 'Lumière Point', icon: Sun, color: 'text-amber-300', desc: 'Lueur omnidirectionnelle' },
    { type: 'spotLight', label: 'Spot Light', icon: Zap, color: 'text-yellow-400', desc: 'Faisceau conique' },
    { type: 'dirLight', label: 'Soleil Dir', icon: Sun, color: 'text-orange-400', desc: 'Ombres parallèles' },
    { type: 'camera', label: 'Caméra Cible', icon: Camera, color: 'text-emerald-300', desc: 'Repère visuel' },
    { type: 'vehicle', label: 'Véhicule 3D', icon: Car, color: 'text-sky-400', desc: 'Voiture conduisible' },
    { type: 'particles', label: 'Particules 3D', icon: Sparkles, color: 'text-orange-400', desc: 'Émetteur volumétrique' },
    { type: 'river', label: 'Rivière 3D', icon: Waves, color: 'text-cyan-400', desc: 'Rivière animée' },
    { type: 'navMeshAgent', label: 'PNJ NavMesh', icon: Target, color: 'text-rose-400', desc: 'IA Pathfinding A*' },
    { type: 'triggerVolume', label: 'Zone Trigger', icon: BoxSelect, color: 'text-purple-400', desc: 'Volume déclencheur' },
    { type: 'checkpoint', label: 'Checkpoint', icon: Flag, color: 'text-emerald-400', desc: 'Point de réapparition' },
    { type: 'spawnPoint', label: 'Spawn Multi', icon: MapPin, color: 'text-lime-400', desc: 'Spawn multijoueur' },
    { type: 'postProcessVolume', label: 'Volume Post-Process', icon: Aperture, color: 'text-fuchsia-400', desc: 'Override rendu local' },
  ] as const;

  // Material presets definition
  const materialPresets = [
    { id: 'gold', name: 'Or Brossé', color: '#f59e0b', roughness: 0.18, metalness: 0.95, texture: 'brushed' },
    { id: 'chrome', name: 'Chrome Miroir', color: '#ffffff', roughness: 0.05, metalness: 1.0, texture: 'lisse' },
    { id: 'emerald', name: 'Émeraude Émissive', color: '#10b981', roughness: 0.15, metalness: 0.4, glow: true },
    { id: 'ruby', name: 'Rubis Rayonnant', color: '#e11d48', roughness: 0.2, metalness: 0.5, glow: true },
    { id: 'carbon', name: 'Fibre de Carbone', color: '#1e293b', roughness: 0.4, metalness: 0.3, texture: 'carbone' },
    { id: 'cyberNeon', name: 'Néon Cyber Cyan', color: '#06b6d4', roughness: 0.2, metalness: 0.1, glow: true },
    { id: 'obsidian', name: 'Obsidienne Noire', color: '#0f172a', roughness: 0.1, metalness: 0.8, texture: 'lisse' },
    { id: 'industrialDiamond', name: 'Tôle Striée', color: '#94a3b8', roughness: 0.35, metalness: 0.8, texture: 'strié' },
  ];

  // Drag start handler for 3D Viewport drop
  const handleDragStartPrimitive = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'primitive', subType: type }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragStartMaterial = (e: React.DragEvent, presetId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'material', presetId }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  // GLTF/GLB File upload handler
  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      await processUploadedFile(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processUploadedFile(files[0]);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processUploadedFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    const isGLTF = lower.endsWith('.gltf') || lower.endsWith('.glb') || lower.endsWith('.fbx');
    const isJSON = lower.endsWith('.json');

    if (isJSON) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        onImportSceneJSON(parsed);
        setImportStatus({
          loading: false,
          success: `Scène restaurée depuis "${file.name}"`,
        });
      } catch {
        setImportStatus({
          loading: false,
          error: 'Fichier JSON de scène invalide ou corrompu.',
        });
      }
      return;
    }

    if (!isGLTF) {
      setImportStatus({
        loading: false,
        error: 'Format non supporté. Veuillez déposer un fichier .gltf, .glb ou .fbx.',
      });
      return;
    }

    setImportStatus({ loading: true, error: undefined, success: undefined });

    try {
      await onImportGLTF(file);
      setImportStatus({
        loading: false,
        success: `Modèle 3D "${file.name}" importé et centré avec succès.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setImportStatus({
        loading: false,
        error: `Erreur d'importation : ${msg}`,
      });
    }
  };

  const handleJSONFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      try {
        if (files[0].size > MAX_SCENE_FILE_BYTES) {
          await alertBox(
            `Fichier trop volumineux (${(files[0].size / 1048576).toFixed(1)} Mo, max 250 Mo).`
          );
          return;
        }
        const text = await files[0].text();
        const data = JSON.parse(text);
        onImportSceneJSON(data);
      } catch {
        await alertBox('Erreur lors de la lecture du fichier JSON');
      }
    }
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  const handleBinaryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      try {
        if (files[0].size > MAX_SCENE_FILE_BYTES) {
          await alertBox(
            `Fichier trop volumineux (${(files[0].size / 1048576).toFixed(1)} Mo, max 250 Mo).`
          );
          return;
        }
        const buffer = await files[0].arrayBuffer();
        onImportSceneBinary?.(new Uint8Array(buffer));
      } catch {
        await alertBox('Erreur lors de la lecture du fichier .aether');
      }
    }
    if (binaryInputRef.current) binaryInputRef.current.value = '';
  };

  return (
    <div
      id="asset-manager-shelf"
      className={`w-full bg-zinc-950/95 border-t border-zinc-800/80 backdrop-blur-xl transition-all duration-300 ease-in-out select-none z-20 flex flex-col ${
        isOpen ? 'h-56' : 'h-10'
      }`}
    >
      {/* Shelf Header bar */}
      <div className="h-10 px-4 flex items-center justify-between gap-3 border-b border-zinc-800/60 text-xs overflow-x-auto overflow-y-hidden min-w-0">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-center gap-1.5 font-semibold text-zinc-200 hover:text-white transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-sky-400" />
            <span>Asset Manager & Bibliothèque</span>
            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />}
          </button>

          {isOpen && (
            <div className="flex items-center gap-1 ml-4 p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <button
                type="button"
                onClick={() => setActiveTab('primitives')}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeTab === 'primitives'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Primitives & Lumières
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('materials')}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeTab === 'materials'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Matériaux PBR
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('models')}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeTab === 'models'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <UploadCloud className="w-3 h-3" />
                <span>Import GLTF / GLB</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('scene')}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeTab === 'scene'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileCode className="w-3 h-3" />
                <span>Scène (JSON)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('prefabs')}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeTab === 'prefabs'
                    ? 'bg-amber-500 text-black font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Préfabriqués ({(lowPolyModels?.length ?? 0) + prefabs.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('assets');
                  onRefreshAssets?.();
                }}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeTab === 'assets'
                    ? 'bg-violet-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Database className="w-3 h-3" />
                <span>Pipeline ({assetRecords.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Info badge */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          <span className="hidden sm:inline">
            Glissez un asset directement dans le Viewport 3D
          </span>
          <button
            type="button"
            onClick={onToggleOpen}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isOpen ? 'Réduire' : 'Agrandir'}
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Shelf Body when open */}
      {isOpen && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 bg-zinc-950/60">
          {/* TAB 1: Primitives & Lights */}
          {activeTab === 'primitives' && (
            <div className="flex items-center gap-2.5 h-full">
              {primitives.map((item) => {
                const Icon = item.icon;
                const isRecommended = recommendedTypes.has(item.type);
                return (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => handleDragStartPrimitive(e, item.type)}
                    onClick={() => onAddPrimitive(item.type)}
                    className={`flex-shrink-0 w-28 h-36 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border p-3 flex flex-col items-center justify-between cursor-grab active:cursor-grabbing transition-all hover:scale-102 hover:shadow-lg group text-center ${
                      isRecommended
                        ? 'border-amber-500/60 shadow-[0_0_14px_rgba(245,158,11,0.18)]'
                        : 'border-zinc-800 hover:border-sky-500/60'
                    }`}
                    title={`Glisser ou cliquer pour ajouter ${item.label}`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center group-hover:border-sky-500/40 group-hover:bg-sky-500/10 transition-colors">
                      <Icon className={`w-6 h-6 ${item.color}`} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                        {item.label}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate max-w-[90px]">
                        {item.desc}
                      </div>
                    </div>
                    {isRecommended ? (
                      <span className="text-[9px] font-mono text-amber-300 bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 rounded">
                        ★ Étape
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono text-sky-400/80 bg-sky-500/10 px-1.5 py-0.5 rounded">
                        + Glisser
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: PBR Materials Presets */}
          {activeTab === 'materials' && (
            <div className="flex items-center gap-2.5 h-full">
              {materialPresets.map((mat) => (
                <div
                  key={mat.id}
                  draggable
                  onDragStart={(e) => handleDragStartMaterial(e, mat.id)}
                  onClick={() => onApplyMaterialPreset(mat.id)}
                  className="flex-shrink-0 w-32 h-36 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-rose-500/60 p-3 flex flex-col items-center justify-between cursor-pointer transition-all hover:scale-102 hover:shadow-lg group text-center"
                  title={
                    hasSelectedNode
                      ? `Appliquer ${mat.name} à l'objet sélectionné`
                      : 'Sélectionnez un objet ou glissez sur le modèle 3D'
                  }
                >
                  <div
                    className="w-12 h-12 rounded-2xl border-2 border-zinc-700 shadow-md relative overflow-hidden group-hover:scale-105 transition-transform"
                    style={{ backgroundColor: mat.color }}
                  >
                    {mat.glow && (
                      <span className="absolute inset-0 bg-white/20 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                      {mat.name}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      R: {mat.roughness} | M: {mat.metalness}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                    Appliquer
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: GLTF/GLB Drag & Drop Importer */}
          {activeTab === 'models' && (
            <div className="flex items-center gap-4 h-full">
              {/* Drop Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 h-36 rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  isDraggingFile
                    ? 'border-sky-400 bg-sky-500/15'
                    : 'border-zinc-700 hover:border-sky-500/60 bg-zinc-900/50 hover:bg-zinc-900'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".gltf,.glb,.fbx"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-sky-400 mb-2">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-zinc-200">
                  Déposez un fichier 3D <span className="text-sky-400 font-mono">.gltf</span>,{' '}
                  <span className="text-sky-400 font-mono">.glb</span> ou{' '}
                  <span className="text-sky-400 font-mono">.fbx</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5 text-center">
                  Décompression DRACO automatique, recalcul des normales, centrage au sol et activation des ombres.
                </div>
              </div>

              {/* Status & Feedback box */}
              <div className="w-80 h-36 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3.5 flex flex-col justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold text-zinc-300">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Pipeline d&apos;importation 3D</span>
                </div>

                {importStatus.loading ? (
                  <div className="flex items-center gap-2 text-sky-400 font-mono">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Décodage DRACO & Analyse des géométries...</span>
                  </div>
                ) : importStatus.success ? (
                  <div className="flex items-start gap-2 text-emerald-400 text-[11px]">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{importStatus.success}</span>
                  </div>
                ) : importStatus.error ? (
                  <div className="flex items-start gap-2 text-rose-400 text-[11px]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{importStatus.error}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-400 leading-relaxed">
                    Prêt pour l&apos;analyse. Le moteur Three.js réajustera le pivot au centre, recalcule le bounding box et élève le modèle sur le plancher Y=0.
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-800">
                  <span>Three.js GLTF + FBX v0.186</span>
                  <span className="text-sky-400 font-mono">DRACO v1.5.7</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Scene JSON Export & Import */}
          {activeTab === 'scene' && (
            <div className="flex items-center gap-4 h-full">
              {/* Export Scene Button Card */}
              <div
                onClick={onOpenExportModal ?? onExportScene}
                className="w-56 h-36 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-emerald-500/60 p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:scale-102 hover:shadow-lg group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Download className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                    .JSON
                  </span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Exporter la Scène
                  </div>
                  <div className="text-[10px] text-zinc-500 leading-snug">
                    Télécharge un JSON contenant tous les nœuds, transforms, matériaux PBR et lumières.
                  </div>
                </div>
              </div>

              {/* Import Scene Button Card */}
              <div
                onClick={() => jsonInputRef.current?.click()}
                className="w-56 h-36 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-sky-500/60 p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:scale-102 hover:shadow-lg group"
              >
                <input
                  ref={jsonInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleJSONFileSelect}
                  className="hidden"
                />
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                    <UploadCloud className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                    Recharger
                  </span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Importer une Scène
                  </div>
                  <div className="text-[10px] text-zinc-500 leading-snug">
                    Reconstitue l&apos;environnement complet à partir d&apos;un fichier JSON Aether.
                  </div>
                </div>
              </div>

              {/* Clear Scene Button Card */}
              <div
                onClick={onClearScene}
                className="w-48 h-36 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-rose-500/60 p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:scale-102 group"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Nouvelle Scène
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Effacer tous les objets utilisateur
                  </div>
                </div>
              </div>

              {/* Reset Demo Scene Button Card */}
              <div
                onClick={onResetDemoScene}
                title="Recharge la scène démo (remplace la scène courante)"
                className="w-48 h-36 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-violet-500/60 p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:scale-102 group"
              >
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Scène Démo
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Recharger la scène de démonstration
                  </div>
                </div>
              </div>

              {/* Export Binary (.aether) Button Card */}
              <div
                onClick={onOpenExportModal ?? onExportSceneBinary}
                title="Export binaire MessagePack : compact et rapide pour les gros projets"
                className="w-48 h-36 shrink-0 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-amber-500/60 p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:scale-102 hover:shadow-lg group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Download className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    .AETHER
                  </span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Export Binaire
                  </div>
                  <div className="text-[10px] text-zinc-500 leading-snug">
                    MessagePack compact, heightmap float32. Idéal gros projets.
                  </div>
                </div>
              </div>

              {/* Import Binary (.aether) Button Card */}
              <div
                onClick={() => binaryInputRef.current?.click()}
                className="w-48 h-36 shrink-0 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-amber-500/60 p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:scale-102 hover:shadow-lg group"
              >
                <input
                  ref={binaryInputRef}
                  type="file"
                  accept=".aether"
                  onChange={handleBinaryFileSelect}
                  className="hidden"
                />
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <UploadCloud className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    Recharger
                  </span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                    Import Binaire
                  </div>
                  <div className="text-[10px] text-zinc-500 leading-snug">
                    Reconstitue depuis un fichier .aether (validé + migré).
                  </div>
                </div>
              </div>

              {/* Local Backups Card */}
              <div className="w-64 h-36 shrink-0 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-zinc-200">
                    Sauvegardes locales
                  </div>
                  <button
                    type="button"
                    onClick={() => onRefreshBackups?.()}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
                    title="Actualiser"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-1.5 flex-1 overflow-y-auto flex flex-col gap-1 pr-0.5">
                  {backups.length === 0 && (
                    <div className="text-[10px] text-zinc-600 leading-snug">
                      Aucune sauvegarde. Une copie auto est créée avant chaque import avec remplacement.
                    </div>
                  )}
                  {backups.map((b) => (
                    <div key={b.key} className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1 flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-zinc-300 truncate" title={b.key}>
                          {b.at.slice(0, 19).replace('T', ' ')}
                        </div>
                        <div className="text-[9px] text-zinc-600 font-mono">
                          {b.nodes} nœud(s){b.projectName ? ` · ${b.projectName}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirmBox(
                            'Restaurer cette sauvegarde ? La scène courante sera remplacée (sauvegardée au préalable).',
                            { title: 'Restaurer la sauvegarde', okLabel: 'Restaurer' }
                          );
                          if (ok) onRestoreBackup?.(b.key);
                        }}
                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20"
                        title="Restaurer"
                      >
                        Restaurer
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirmBox('Supprimer cette sauvegarde ?', { okLabel: 'Supprimer' })) {
                            onDeleteBackup?.(b.key);
                          }
                        }}
                        className="p-0.5 rounded text-zinc-600 hover:text-rose-400"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Bibliothèque 3D (low-poly) + préfabriqués sauvegardés */}
          {activeTab === 'prefabs' && (
            <div className="flex flex-col gap-3 h-full overflow-y-auto pr-2 pb-1">
              {/* Section 1 : palette LOW_POLY_set.glb */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Box className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] font-semibold text-zinc-300">
                    Objets 3D ({lowPolyModels?.length ?? 0})
                  </span>
                  {lowPolyModels === null && (
                    <RefreshCw className="w-3 h-3 text-zinc-500 animate-spin" />
                  )}
                  <span className="text-[10px] text-zinc-600 ml-auto">Cliquez pour ajouter à la scène</span>
                </div>
                {lowPolyModels === null ? (
                  <div className="text-[11px] text-zinc-500 py-4">
                    Chargement de la bibliothèque 3D…
                  </div>
                ) : lowPolyModels.length === 0 ? (
                  <div className="text-[11px] text-zinc-600 py-3">
                    Bibliothèque indisponible (LOW_POLY_set.glb introuvable).
                  </div>
                ) : (
                  <div className="grid grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11 gap-2">
                    {lowPolyModels.map((model) => {
                      const thumb = lowPolyThumbnails[model.id];
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => onAddLowPoly?.(model.id)}
                          title={`${model.name} — cliquer pour ajouter à la scène`}
                          className="group relative rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-emerald-500/60 hover:bg-zinc-800 transition-all hover:scale-105 p-1 flex flex-col items-center"
                        >
                          <div className="w-full aspect-square rounded-lg bg-zinc-950/80 overflow-hidden flex items-center justify-center">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt={model.name}
                                draggable={false}
                                className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                              />
                            ) : (
                              <Box className="w-4 h-4 text-zinc-700 animate-pulse" />
                            )}
                          </div>
                          <div
                            className="w-full text-[8.5px] text-zinc-400 truncate text-center group-hover:text-emerald-300"
                            title={model.name}
                          >
                            {model.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2 : préfabriqués sauvegardés (secondaire) */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-semibold text-zinc-300">
                    Mes préfabriqués ({prefabs.length})
                  </span>
                </div>
                {prefabs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 px-3 py-3 text-zinc-600">
                    <p className="text-[11px]">Aucun préfabriqué sauvegardé.</p>
                    <p className="text-[10px] text-zinc-700 mt-1">
                      Sélectionnez des objets 3D puis cliquez sur{' '}
                      <span className="text-amber-400 font-semibold">★ Sauvegarder</span> dans
                      l&apos;inspecteur.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 py-1">
                    {prefabs.map((prefab) => (
                      <div
                        key={prefab.id}
                        className="group relative flex flex-col justify-between p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 cursor-pointer transition-all hover:bg-zinc-800/50"
                        onClick={() => onAddPrefab?.(prefab.nodes, prefab.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const ok = await confirmBox(
                                `Supprimer le préfabriqué "${prefab.name}" ?`,
                                { title: 'Supprimer le préfabriqué', okLabel: 'Supprimer' }
                              );
                              if (ok) onDeletePrefab?.(prefab.id);
                            }}
                            className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                            title="Supprimer le préfabriqué"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="mt-2 text-left">
                          <div className="text-[11px] font-semibold text-zinc-200 truncate group-hover:text-white" title={prefab.name}>
                            {prefab.name}
                          </div>
                          <div className="text-[9px] text-zinc-500">
                            {prefab.nodes.length} objet(s)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* TAB 6: Asset Pipeline (registry, LOD, streaming, bundles) */}
          {activeTab === 'assets' && (
            <div className="flex items-stretch gap-3 h-full">
              {/* Stats + orphans */}
              <div className="w-60 shrink-0 h-full rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3 flex flex-col text-xs overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-zinc-300">
                      <Database className="w-4 h-4 text-violet-400" />
                      <span>Asset Pipeline</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRefreshAssets?.()}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
                      title="Actualiser"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {assetStats ? (
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5">
                        <div className="text-zinc-500">Modèles</div>
                        <div className="text-sm font-bold text-zinc-100 font-mono">{assetStats.models}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5">
                        <div className="text-zinc-500">Textures</div>
                        <div className="text-sm font-bold text-zinc-100 font-mono">{assetStats.textures}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5">
                        <div className="text-zinc-500">Stockage</div>
                        <div className="text-sm font-bold text-sky-300 font-mono">{formatBytes(assetStats.totalBytes)}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5">
                        <div className="text-zinc-500">VRAM tex.</div>
                        <div className="text-sm font-bold text-amber-300 font-mono">{formatBytes(assetStats.vramBytes)}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5">
                        <div className="text-zinc-500">Maillages LOD</div>
                        <div className="text-sm font-bold text-emerald-300 font-mono">{assetStats.lodMeshes}</div>
                      </div>
                      <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5">
                        <div className="text-zinc-500">Bundles</div>
                        <div className="text-sm font-bold text-violet-300 font-mono">{assetStats.bundles}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-zinc-500">Chargement…</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!assetStats || assetStats.orphanCount === 0) return;
                    const ok = await confirmBox(
                      `Purger ${assetStats.orphanCount} asset(s) orphelin(s) (${formatBytes(assetStats.orphanBytes)}) ? La scène est intacte.`,
                      { title: 'Purger les assets orphelins', okLabel: 'Purger' }
                    );
                    if (ok) onPurgeOrphans?.();
                  }}
                  disabled={!assetStats || assetStats.orphanCount === 0}
                  className="mt-2 w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Supprime les assets non référencés par la scène"
                >
                  Purger orphelins ({assetStats?.orphanCount ?? 0})
                </button>
                {/* 3.4 : LOD & Culling */}
                <div className="mt-2 pt-2 border-t border-zinc-800">
                  <div className="flex items-center gap-2 font-semibold text-zinc-300">
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <span>LOD &amp; Culling</span>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    <label className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>LOD géométrique</span>
                      <input
                        type="checkbox"
                        checked={lodConfig?.enabled ?? true}
                        onChange={(e) => onLODConfigChange?.({ enabled: e.target.checked })}
                        className="accent-emerald-500"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Billboards lointains</span>
                      <input
                        type="checkbox"
                        checked={lodConfig?.billboardEnabled ?? true}
                        onChange={(e) => onLODConfigChange?.({ billboardEnabled: e.target.checked })}
                        className="accent-emerald-500"
                      />
                    </label>
                    <label className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Occlusion culling</span>
                      <input
                        type="checkbox"
                        checked={cullingConfig?.occlusionEnabled ?? true}
                        onChange={(e) => onCullingConfigChange?.({ occlusionEnabled: e.target.checked })}
                        className="accent-emerald-500"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
                      <span className="flex justify-between">
                        <span>Rayons / frame</span>
                        <span className="font-mono text-emerald-300">{cullingConfig?.raysPerFrame ?? 4}</span>
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={16}
                        step={1}
                        value={cullingConfig?.raysPerFrame ?? 4}
                        onChange={(e) => onCullingConfigChange?.({ raysPerFrame: Number(e.target.value) })}
                        className="w-full accent-emerald-500"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
                      <span className="flex justify-between">
                        <span>Distance min occlusion</span>
                        <span className="font-mono text-emerald-300">{cullingConfig?.minDistance ?? 5}m</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={1}
                        value={cullingConfig?.minDistance ?? 5}
                        onChange={(e) => onCullingConfigChange?.({ minDistance: Number(e.target.value) })}
                        className="w-full accent-emerald-500"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
                      <span className="flex justify-between">
                        <span>Rayon min impostor</span>
                        <span className="font-mono text-emerald-300">{lodConfig?.impostorMinRadius ?? 2}m</span>
                      </span>
                      <input
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={lodConfig?.impostorMinRadius ?? 2}
                        onChange={(e) => onLODConfigChange?.({ impostorMinRadius: Number(e.target.value) })}
                        className="w-full accent-emerald-500"
                      />
                    </label>
                  </div>
                  {cullingStats && (
                    <div className="mt-1.5 grid grid-cols-2 gap-1 text-[9px] font-mono">
                      <div className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-1">
                        <span className="text-zinc-500">billboards </span>
                        <span className="text-emerald-300">{cullingStats.impostors}</span>
                      </div>
                      <div className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-1">
                        <span className="text-zinc-500">occlus </span>
                        <span className="text-emerald-300">{cullingStats.occludedHidden}</span>
                      </div>
                      <div className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-1">
                        <span className="text-zinc-500">occluders </span>
                        <span className="text-zinc-200">{cullingStats.occluders}</span>
                      </div>
                      <div className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-1">
                        <span className="text-zinc-500">rayons </span>
                        <span className="text-zinc-200">{cullingStats.occlusionRaysLastFrame}</span>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setFrustumAudit(onAuditFrustum?.() ?? null)}
                    className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 transition-colors"
                    title="Vérifie boundingSphere + objets non cullés (auto-fix)"
                  >
                    <ScanLine className="w-3 h-3" />
                    Auditer frustum culling
                  </button>
                  {frustumAudit && (
                    <div className="mt-1 rounded-lg bg-zinc-950 border border-zinc-800 px-1.5 py-1 text-[9px] font-mono text-zinc-400">
                      <div>maillages: <span className="text-zinc-200">{frustumAudit.totalMeshes}</span> · bornes réparées: <span className="text-amber-300">{frustumAudit.fixedBounds}</span></div>
                      <div>non-cullés: <span className="text-zinc-200">{frustumAudit.unculledCount}</span>{frustumAudit.unculledNames.length > 0 && ` (${frustumAudit.unculledNames.join(', ')})`}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Asset list */}
              <div className="flex-1 h-full rounded-2xl bg-zinc-900/50 border border-zinc-800/70 p-2.5 overflow-x-auto">
                {assetRecords.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-600 text-[11px]">
                    Aucun asset — importez un modèle, une texture ou un audio.
                  </div>
                ) : (
                  <div className="flex gap-2 h-full">
                    {assetRecords.map((rec) => {
                      const locked = rec.refCount > 0;
                      const kindColor =
                        rec.kind === 'model'
                          ? 'text-sky-400 border-sky-500/20 bg-sky-500/10'
                          : rec.kind === 'texture'
                            ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                            : 'text-amber-400 border-amber-500/20 bg-amber-500/10';
                      return (
                        <div
                          key={rec.id}
                          className="group relative w-44 shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-violet-500/40 p-2.5 flex flex-col justify-between transition-colors"
                          title={`${rec.id}\n${rec.refCount} référence(s)${rec.lodStatus ? `\nLOD: ${rec.lodStatus}` : ''}`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-1">
                              <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${kindColor}`}>
                                {rec.kind}
                              </span>
                              <button
                                type="button"
                                disabled={locked}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const ok = await confirmBox(
                                    `Supprimer l'asset "${rec.name}" ?`,
                                    { title: 'Supprimer l’asset', okLabel: 'Supprimer' }
                                  );
                                  if (ok) onDeleteAsset?.(rec.id);
                                }}
                                className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                title={locked ? `Utilisé par ${rec.refCount} objet(s) — suppression bloquée` : "Supprimer l'asset"}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="mt-1.5 text-[11px] font-semibold text-zinc-200 truncate" title={rec.name}>
                              {rec.name}
                            </div>
                            <div className="text-[9px] text-zinc-500 font-mono">
                              {rec.format} · {formatBytes(rec.byteLength)}
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-[9px]">
                              <span className={`px-1.5 py-0.5 rounded font-mono ${locked ? 'bg-sky-500/10 text-sky-300' : 'bg-zinc-800 text-zinc-500'}`}>
                                ×{rec.refCount} refs
                              </span>
                              {rec.kind === 'model' && rec.lodStatus && rec.lodStatus !== 'none' && (
                                <span className={`px-1.5 py-0.5 rounded font-mono ${rec.lodStatus === 'ready' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>
                                  LOD:{rec.lodStatus}
                                </span>
                              )}
                            </div>
                            {rec.kind === 'model' && rec.triangleCount !== undefined && (
                              <div className="text-[9px] text-zinc-600 font-mono mt-0.5">
                                {(rec.triangleCount / 1000).toFixed(1)}k tris
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bundles */}
              <div className="w-64 shrink-0 h-full rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3 flex flex-col text-xs overflow-hidden">
                <div className="flex items-center gap-2 font-semibold text-zinc-300">
                  <Package className="w-4 h-4 text-violet-400" />
                  <span>Bundles</span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={newBundleName}
                    onChange={(e) => setNewBundleName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newBundleName.trim()) {
                        onCreateBundle?.(newBundleName.trim());
                        setNewBundleName('');
                      }
                    }}
                    placeholder="Nouveau bundle…"
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newBundleName.trim()) return;
                      onCreateBundle?.(newBundleName.trim());
                      setNewBundleName('');
                    }}
                    className="px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[11px] font-semibold hover:bg-violet-500/25"
                  >
                    +
                  </button>
                </div>
                <div className="mt-2 flex-1 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
                  {assetBundles.length === 0 && (
                    <div className="text-[10px] text-zinc-600">Aucun bundle. Regroupez des assets par zone pour le chargement paresseux.</div>
                  )}
                  {assetBundles.map((b) => (
                    <div key={b.id} className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-semibold text-zinc-200 truncate" title={b.name}>{b.name}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirmBox(
                              `Supprimer le bundle "${b.name}" ? (les assets sont conservés)`,
                              { title: 'Supprimer le bundle', okLabel: 'Supprimer' }
                            );
                            if (ok) onDeleteBundle?.(b.id);
                          }}
                          className="p-0.5 rounded text-zinc-600 hover:text-rose-400"
                          title="Supprimer le bundle (assets conservés)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-[9px] text-zinc-500 font-mono">{b.assetIds.length} asset(s)</span>
                        <button
                          type="button"
                          onClick={() => onPreloadBundle?.(b.id)}
                          className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20"
                          title="Précharger en mémoire"
                        >
                          Charger
                        </button>
                        <button
                          type="button"
                          onClick={() => onUnloadBundle?.(b.id)}
                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200"
                          title="Décharger de la mémoire (IndexedDB conservé)"
                        >
                          Vider
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
