'use client';

import React, { useMemo, useRef } from 'react';
import {
  RenderMode,
  SnapSettings,
  SnapMode,
  SNAP_TRANSLATE_PRESETS,
  SNAP_ROTATE_PRESETS,
  SNAP_SCALE_PRESETS,
} from '../types/engine';
import {
  Play,
  Square,
  Magnet,
  Sparkles,
  Layers,
  ChevronDown,
  Download,
  FolderOpen,
  CloudSun,
  LayoutTemplate,
  Rocket,
  Image as ImageIcon,
  Drama,
  GitBranch,
  Share2,
  Activity,
  Users,
  Search,
  Wrench,
  Maximize2,
  Minimize2,
  Scan,
  Upload,
  Box,
  Sun,
  Check,
  Undo2,
  Redo2,
  History,
} from 'lucide-react';
import { useDismiss, useExclusiveMenu } from '../lib/ui/useDismiss';
import type { AutosaveInfo } from '../lib/core/HistoryManager';

interface ToolbarProps {
  isPlaying: boolean;
  renderMode: RenderMode;
  snapping: boolean;
  snapSettings: SnapSettings;
  isAssetManagerOpen?: boolean;
  onTogglePlay: () => void;
  onRenderModeChange: (mode: RenderMode) => void;
  onToggleSnapping: () => void;
  onSnapSettingsChange: (partial: Partial<SnapSettings>) => void;
  onToggleAssetManager?: () => void;
  onToggleProfiler?: () => void;
  isProfilerOpen?: boolean;
  onOpenAtmosphereModal?: () => void;
  onOpenHUDModal?: () => void;
  onOpenExportModal?: () => void;
  onOpenTexturePanel?: () => void;
  onOpenMultiplayerModal?: () => void;
  isMultiplayerActive?: boolean;
  onOpenAnimatorModal?: () => void;
  onOpenCollabModal?: () => void;
  isCollabActive?: boolean;
  onOpenShareModal?: () => void;
  showInstallButton?: boolean;
  onInstallPwa?: () => void;
  onImportGLTF?: (file: File) => void;
  /** Ouvre la palette de commandes (Ctrl+K). */
  onOpenCommandPalette?: () => void;
  /** Mode Zen : masque la barre d'étapes pour agrandir le viewport. */
  zenMode?: boolean;
  onToggleZen?: () => void;
  // --- Historique : l'undo/redo existe (Ctrl+Z) mais était invisible. ------
  canUndo?: boolean;
  canRedo?: boolean;
  /** Libellé de l'action annulée/rétablie, pour l'infobulle. */
  undoLabel?: string | null;
  redoLabel?: string | null;
  onUndo?: () => void;
  onRedo?: () => void;
  // --- Sauvegarde -----------------------------------------------------------
  /** État d'autosave (point d'état de la barre). */
  autosave?: AutosaveInfo | null;
  /** Ouvre la modale des sauvegardes horodatées. */
  onOpenBackups?: () => void;
}

interface ToolEntry {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  onClick?: () => void;
  active?: boolean;
  badge?: 'new' | 'live';
  hidden?: boolean;
}

/** « à l'instant », « il y a 2 min », « il y a 3 h »… pour l'indicateur autosave. */
function relativeTime(iso: string | null, now: number): string {
  if (!iso) return 'jamais sauvegardée';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'sauvegardée';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isPlaying,
  renderMode,
  snapping,
  snapSettings,
  isAssetManagerOpen,
  onTogglePlay,
  onRenderModeChange,
  onToggleSnapping,
  onSnapSettingsChange,
  onToggleAssetManager,
  onToggleProfiler,
  isProfilerOpen,
  onOpenAtmosphereModal,
  onOpenHUDModal,
  onOpenExportModal,
  onOpenTexturePanel,
  onOpenMultiplayerModal,
  isMultiplayerActive,
  onOpenAnimatorModal,
  onOpenCollabModal,
  isCollabActive,
  onOpenShareModal,
  showInstallButton,
  onInstallPwa,
  onImportGLTF,
  onOpenCommandPalette,
  zenMode,
  onToggleZen,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  autosave,
  onOpenBackups,
}) => {
  const menu = useExclusiveMenu();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderMenuRef = useRef<HTMLDivElement>(null);
  const snapMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useDismiss(menu.openMenu === 'render', menu.close, [renderMenuRef]);
  useDismiss(menu.openMenu === 'snap', menu.close, [snapMenuRef]);
  useDismiss(menu.openMenu === 'tools', menu.close, [toolsMenuRef]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onImportGLTF) {
      onImportGLTF(files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Les 9 outils secondaires sont regroupés derrière un seul menu :
   * la Toolbar passait de 13 boutons à plat (illisible sous 1280px) à
   * 3 actions primaires + 2 menus.
   */
  const tools = useMemo<ToolEntry[]>(
    () => [
      {
        id: 'atmosphere',
        label: 'Atmosphère & Ciel',
        description: 'HDR, brouillard, soleil, post-processing',
        icon: CloudSun,
        accent: 'text-amber-400',
        onClick: onOpenAtmosphereModal,
        hidden: !onOpenAtmosphereModal,
      },
      {
        id: 'hud',
        label: 'HUD In-Game',
        description: 'Éditeur WYSIWYG de Canvas UI (vie, score, pause)',
        icon: LayoutTemplate,
        accent: 'text-indigo-400',
        onClick: onOpenHUDModal,
        hidden: !onOpenHUDModal,
      },
      {
        id: 'textures',
        label: 'Textures PBR',
        description: 'Assignation de textures, reliefs et tiling',
        icon: ImageIcon,
        accent: 'text-sky-400',
        onClick: onOpenTexturePanel,
        hidden: !onOpenTexturePanel,
      },
      {
        id: 'animator',
        label: 'Animator',
        description: 'Machine à états, transitions, motion matching',
        icon: Drama,
        accent: 'text-violet-400',
        onClick: onOpenAnimatorModal,
        hidden: !onOpenAnimatorModal,
      },
      {
        id: 'multiplayer',
        label: 'Multijoueur P2P',
        description: 'Héberger ou rejoindre une session WebRTC',
        icon: Users,
        accent: 'text-emerald-400',
        onClick: onOpenMultiplayerModal,
        hidden: !onOpenMultiplayerModal,
        active: isMultiplayerActive,
        badge: 'live',
      },
      {
        id: 'collab',
        label: 'Collaboration',
        description: 'CRDT temps réel, versions et branches',
        icon: GitBranch,
        accent: 'text-violet-400',
        onClick: onOpenCollabModal,
        hidden: !onOpenCollabModal,
        active: isCollabActive,
      },
      {
        id: 'share',
        label: 'Partager',
        description: 'Lien de partage, aperçu live, installation PWA',
        icon: Share2,
        accent: 'text-sky-400',
        onClick: onOpenShareModal,
        hidden: !onOpenShareModal,
      },
      {
        id: 'profiler',
        label: 'Profiler & Debug',
        description: 'Temps par système, FPS p95, physique, mémoire',
        icon: Activity,
        accent: 'text-emerald-400',
        onClick: onToggleProfiler,
        hidden: !onToggleProfiler,
        active: isProfilerOpen,
      },
      {
        id: 'import',
        label: 'Importer un modèle 3D',
        description: 'GLTF, GLB ou FBX',
        icon: Upload,
        accent: 'text-zinc-400',
        onClick: () => fileInputRef.current?.click(),
        hidden: !onImportGLTF,
        badge: 'new',
      },
    ],
    [
      isCollabActive,
      isMultiplayerActive,
      isProfilerOpen,
      onImportGLTF,
      onOpenAnimatorModal,
      onOpenAtmosphereModal,
      onOpenCollabModal,
      onOpenHUDModal,
      onOpenMultiplayerModal,
      onOpenShareModal,
      onOpenTexturePanel,
      onToggleProfiler,
    ]
  );

  const visibleTools = tools.filter((t) => !t.hidden);
  const activeToolCount = visibleTools.filter((t) => t.active).length;

  /** Rendu d'une entrée du menu « Outils » (icône + label + description). */
  const renderTool = (tool: ToolEntry) => {
    const Icon = tool.icon;
    return (
      <button
        key={tool.id}
        id={`toolbar-btn-${tool.id}`}
        type="button"
        role="menuitem"
        data-active={tool.active}
        onClick={() => {
          tool.onClick?.();
          menu.close();
        }}
        className="ae-menu-item"
      >
        <span className="ae-menu-icon flex h-6 w-6 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950/60">
          <Icon className={`h-3.5 w-3.5 ${tool.accent}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-zinc-200">{tool.label}</span>
            {tool.badge === 'live' && tool.active && (
              <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1 py-px text-[9px] font-bold uppercase text-emerald-400">
                <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                live
              </span>
            )}
            {tool.badge === 'new' && !tool.active && (
              <span className="rounded bg-zinc-800 px-1 py-px text-[9px] font-bold uppercase text-zinc-400">
                3D
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-zinc-500">{tool.description}</span>
        </span>
      </button>
    );
  };

  return (
    <header
      id="aether-toolbar"
      className="ae-chrome h-[52px] w-full shrink-0 border-b px-3 flex items-center gap-2 select-none relative z-[9999] shadow-[0_1px_0_0_rgba(255,255,255,0.03),0_8px_24px_-12px_rgba(0,0,0,0.8)]"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".gltf,.glb,.fbx"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* ── Gauche : identité + palette de commandes ────────────────────── */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex items-center gap-2">
          <div
            className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-[0_0_14px_rgba(56,189,248,0.35)]"
            aria-hidden
          >
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="hidden leading-none lg:block">
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-bold tracking-tight text-zinc-100">Aether 3D</h1>
              <span className="rounded bg-sky-500/15 px-1 py-px text-[9px] font-bold text-sky-400">
                v0.3
              </span>
            </div>
            <span className="text-[10px] text-zinc-500">Zero-Code WebGL Studio</span>
          </div>
        </div>

        <span className="hidden h-5 w-px bg-zinc-800 lg:block" aria-hidden />

        {onOpenCommandPalette && (
          <button
            id="toolbar-btn-command-palette"
            type="button"
            onClick={onOpenCommandPalette}
            className="group hidden h-7 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 text-[11px] text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 md:flex"
            title="Palette de commandes (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Rechercher une commande…</span>
            <kbd className="ae-kbd">Ctrl K</kbd>
          </button>
        )}
      </div>

      {/* ── Centre : Play + Accrochage + Rendu ──────────────────────────── */}
      <div className="ml-auto flex items-center gap-2">
        {/* Play/Pause (mousedown-prevented: ne vole jamais le focus,
            Espace reste réservé au gameplay). */}
        <button
          id="toolbar-btn-play"
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onTogglePlay}
          aria-pressed={isPlaying}
          className={`group relative flex h-9 items-center gap-2 overflow-hidden rounded-xl px-4 text-xs font-bold text-white shadow-lg transition-all active:scale-95 ${
            isPlaying
              ? 'bg-rose-600 shadow-rose-950/50 ring-1 ring-rose-400/50'
              : 'bg-emerald-600 shadow-emerald-950/50 ring-1 ring-emerald-400/40 hover:bg-emerald-500'
          }`}
          title={isPlaying ? 'Arrêter la simulation (Espace)' : 'Lancer la simulation (Espace)'}
        >
          <span
            className={`absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 ${
              isPlaying ? 'ae-sheen' : ''
            }`}
            aria-hidden
          />
          {isPlaying ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="hidden sm:inline">Stop</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              <span className="hidden sm:inline">Play</span>
            </>
          )}
        </button>

        {/* Accrochage : toggle + réglages avancés */}
        <div ref={snapMenuRef} className="relative">
          <div className="flex overflow-hidden rounded-lg">
            <button
              id="toolbar-btn-snap"
              type="button"
              onClick={onToggleSnapping}
              aria-pressed={snapping}
              className={`ae-btn rounded-r-none border-r-0 ${
                snapping ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : ''
              }`}
              title={`Accrochage ${snapping ? 'actif' : 'inactif'} — ${snapSettings.mode}`}
            >
              <Magnet className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Snap</span>
            </button>
            <button
              id="toolbar-btn-snap-menu"
              type="button"
              onClick={() => menu.toggle('snap')}
              aria-expanded={menu.isOpen('snap')}
              aria-label="Réglages de magnétisme"
              className={`ae-btn w-7 px-0 ${
                menu.isOpen('snap') ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : ''
              }`}
              title="Réglages de magnétisme"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {menu.isOpen('snap') && (
            <div
              id="toolbar-snap-popup"
              className="ae-menu ae-anim-pop-in absolute left-0 top-full z-[9999] mt-2 w-64 space-y-2.5 p-2.5 text-xs"
            >
              <div className="ae-menu-label">Mode d&apos;accrochage</div>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ['grid', 'Grille'],
                    ['surface', 'Surface'],
                    ['vertex', 'Sommet'],
                  ] as Array<[SnapMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onSnapSettingsChange({ mode })}
                    className={`rounded-lg border px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                      snapSettings.mode === mode
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                        : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="ae-menu-separator" />

              <div className="ae-menu-label">Pas de translation</div>
              <div className="grid grid-cols-3 gap-1">
                {SNAP_TRANSLATE_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onSnapSettingsChange({ translateSnap: v })}
                    className={`rounded-lg border px-1.5 py-1 text-[11px] tabular-nums transition-colors ${
                      snapSettings.translateSnap === v
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                        : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div className="ae-menu-label">Rotation (°)</div>
              <div className="grid grid-cols-4 gap-1">
                {SNAP_ROTATE_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onSnapSettingsChange({ rotateSnapDeg: v })}
                    className={`rounded-lg border px-1 py-1 text-[11px] tabular-nums transition-colors ${
                      snapSettings.rotateSnapDeg === v
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                        : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {v}°
                  </button>
                ))}
              </div>

              <div className="ae-menu-label">Échelle</div>
              <div className="grid grid-cols-4 gap-1">
                {SNAP_SCALE_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onSnapSettingsChange({ scaleSnap: v })}
                    className={`rounded-lg border px-1 py-1 text-[11px] tabular-nums transition-colors ${
                      snapSettings.scaleSnap === v
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                        : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {snapSettings.mode !== 'grid' && (
                <>
                  <div className="ae-menu-separator" />
                  <label className="block space-y-1.5 px-0.5">
                    <span className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>
                        {snapSettings.mode === 'vertex'
                          ? 'Seuil de sommet'
                          : 'Profondeur max de chute'}
                      </span>
                      <span className="tabular-nums text-zinc-300">
                        {snapSettings.mode === 'vertex'
                          ? snapSettings.vertexThreshold.toFixed(2)
                          : snapSettings.surfaceMaxDrop.toFixed(2)}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0.01}
                      max={snapSettings.mode === 'vertex' ? 1 : 2}
                      step={0.01}
                      value={
                        snapSettings.mode === 'vertex'
                          ? snapSettings.vertexThreshold
                          : snapSettings.surfaceMaxDrop
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (snapSettings.mode === 'vertex') {
                          onSnapSettingsChange({ vertexThreshold: v });
                        } else {
                          onSnapSettingsChange({ surfaceMaxDrop: v });
                        }
                      }}
                      className="w-full accent-sky-500"
                    />
                  </label>
                </>
              )}
            </div>
          )}
        </div>

        {/* Mode de rendu */}
        <div ref={renderMenuRef} className="relative">
          <button
            id="toolbar-btn-rendermode"
            type="button"
            onClick={() => menu.toggle('render')}
            aria-expanded={menu.isOpen('render')}
            aria-haspopup="menu"
            className={`ae-btn ${
              menu.isOpen('render') ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : ''
            }`}
            title="Mode de rendu du viewport"
          >
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span className="hidden capitalize lg:inline">{renderMode}</span>
            <ChevronDown className="h-3 w-3 text-zinc-500" />
          </button>

          {menu.isOpen('render') && (
            <div
              id="toolbar-rendermode-popup"
              role="menu"
              className="ae-menu ae-anim-pop-in absolute right-0 top-full z-[9999] mt-2 w-44 p-1 text-xs"
            >
              {(
                [
                  ['shaded', 'Shaded (PBR)', Sun],
                  ['wireframe', 'Wireframe', Scan],
                  ['normals', 'Normales', Box],
                ] as Array<[RenderMode, string, React.ComponentType<{ className?: string }>]>
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={renderMode === mode}
                  onClick={() => {
                    onRenderModeChange(mode);
                    menu.close();
                  }}
                  className="ae-menu-item justify-between"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="ae-menu-icon h-3.5 w-3.5" />
                    {label}
                  </span>
                  {renderMode === mode && <Check className="h-3.5 w-3.5 text-sky-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Droite : Outils groupés + Asset Manager + Export ───────────── */}
      <div className="flex items-center gap-2">
        {/* Menu « Outils » : regroupe les 9 modales/panneaux secondaires */}
        <div ref={toolsMenuRef} className="relative">
          <button
            id="toolbar-btn-tools"
            type="button"
            onClick={() => menu.toggle('tools')}
            aria-expanded={menu.isOpen('tools')}
            aria-haspopup="menu"
            className={`ae-btn ${
              menu.isOpen('tools') ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : ''
            }`}
            title="Tous les outils de l'éditeur"
          >
            <Wrench className="h-3.5 w-3.5 text-zinc-400" />
            <span className="hidden lg:inline">Outils</span>
            {activeToolCount > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-sky-500/20 px-1 text-[9px] font-bold text-sky-300">
                {activeToolCount}
              </span>
            )}
            <ChevronDown className="h-3 w-3 text-zinc-500" />
          </button>

          {menu.isOpen('tools') && (
            <div
              id="toolbar-tools-popup"
              role="menu"
              className="ae-menu ae-anim-pop-in absolute right-0 top-full z-[9999] mt-2 w-72 p-1.5 text-xs"
            >
              <div className="ae-menu-label">Outils de création</div>
              {visibleTools.slice(0, 4).map(renderTool)}

              <div className="ae-menu-separator" />
              <div className="ae-menu-label">Collaborer &amp; publier</div>
              {visibleTools.slice(4).map(renderTool)}

              {showInstallButton && onInstallPwa && (
                <>
                  <div className="ae-menu-separator" />
                  <button
                    id="toolbar-btn-install"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onInstallPwa();
                      menu.close();
                    }}
                    className="ae-menu-item text-violet-200"
                  >
                    <span className="ae-menu-icon flex h-6 w-6 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10">
                      <Download className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">Installer l&apos;application</span>
                      <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                        Aether 3D comme app PWA hors-ligne
                      </span>
                    </span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Annuler / Rétablir — la pile existait déjà (Ctrl+Z) mais restait invisible. */}
        {(onUndo || onRedo) && (
          <div className="flex items-center gap-0.5 pr-1">
            <button
              id="toolbar-btn-undo"
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="ae-btn w-7 px-0 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              title={
                canUndo
                  ? `Annuler : ${undoLabel ?? ' modification'}  (Ctrl+Z)`
                  : 'Rien à annuler'
              }
              aria-label={canUndo ? `Annuler ${undoLabel ?? 'la dernière action'}` : 'Annuler'}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              id="toolbar-btn-redo"
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="ae-btn w-7 px-0 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              title={
                canRedo
                  ? `Rétablir : ${redoLabel ?? ' modification'}  (Ctrl+Y)`
                  : 'Rien à rétablir'
              }
              aria-label={canRedo ? `Rétablir ${redoLabel ?? 'la dernière action'}` : 'Rétablir'}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Autosave : un point d'état discret, cliquable vers les sauvegardes. */}
        {autosave && onOpenBackups && (
          <button
            id="toolbar-btn-autosave"
            type="button"
            onClick={onOpenBackups}
            className="ae-btn gap-1.5"
            title={
              autosave.error ??
              (autosave.pending
                ? 'Sauvegarde en cours…'
                : `Sauvegardée ${relativeTime(autosave.savedAt, Date.now())}${
                    autosave.degraded ? ' (sans heightmap/foliage : stockage saturé)' : ''
                  } — cliquer pour les sauvegardes`)
            }
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                autosave.error
                  ? 'bg-rose-400'
                  : autosave.pending
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-emerald-400/80'
              }`}
            />
            <History className="h-3.5 w-3.5 text-zinc-400" />
            <span className="hidden lg:inline">
              {autosave.pending
                ? 'Enregistrement…'
                : `Sauvegardé ${relativeTime(autosave.savedAt, Date.now())}`}
            </span>
          </button>
        )}

        {/* Asset Manager */}
        {onToggleAssetManager && (
          <button
            type="button"
            onClick={onToggleAssetManager}
            aria-pressed={isAssetManagerOpen}
            className="ae-btn"
            title="Afficher / Masquer la bibliothèque d'assets"
          >
            <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
            <span className="hidden sm:inline">Assets</span>
          </button>
        )}

        {/* Mode Zen : on libère la hauteur des deux barres pour le viewport. */}
        {onToggleZen && (
          <button
            id="toolbar-btn-zen"
            type="button"
            onClick={onToggleZen}
            aria-pressed={zenMode}
            className="ae-btn w-7 px-0"
            title={
              zenMode
                ? 'Quitter le mode Zen (Ctrl+.)'
                : 'Mode Zen : masquer la barre d’étapes (Ctrl+.)'
            }
          >
            {zenMode ? (
              <Minimize2 className="h-3.5 w-3.5 text-sky-400" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-zinc-400" />
            )}
          </button>
        )}

        {/* CTA : exporter le jeu autonome */}
        {onOpenExportModal && (
          <button
            id="toolbar-btn-export-game"
            type="button"
            onClick={onOpenExportModal}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/40 transition-all hover:from-emerald-500 hover:to-teal-500 active:scale-95"
            title="Exporter le jeu autonome complet en 1 clic (fichier HTML exécutable partout)"
          >
            <Rocket className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exporter Jeu</span>
          </button>
        )}
      </div>
    </header>
  );
};
