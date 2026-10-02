/**
 * TextureAssignerPanel.tsx
 * Dedicated panel for assigning PBR textures, procedural patterns, tiling scale, and custom image maps to selected objects.
 */

'use client';

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { SceneNode, TexturePreset } from '../types/engine';
import { X, Image as ImageIcon, Grid, Sliders, Check, Layers, Upload, HardDrive, Trash2, Loader2, Ruler, Boxes, AlertTriangle } from 'lucide-react';
import { alertBox } from '../lib/ui/overlays';
import { isLocalTextureKey } from '../lib/persistence';
import type { UvAnalysis } from '../lib/texture/uvAtlas';

interface TextureAssignerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: SceneNode | null;
  onUpdateMaterial: (id: string, materialData: any) => void;
  /**
   * Importe un fichier image depuis le disque et renvoie la clé locale
   * persistée (IndexedDB) à écrire dans `mapUrl`, ou null si l'import échoue.
   * Implémenté par page.tsx : l'écriture binaire sort du composant d'UI.
   */
  onImportLocalTexture?: (file: File) => Promise<string | null>;
  /** Analyse UV de l'objet sélectionné (null si pas de géométrie exploitable). */
  getUvAnalysis?: (id: string) => UvAnalysis | null;
}

const TEXTURE_PRESETS: Array<{ id: TexturePreset; name: string; category: string; previewColor: string; description: string }> = [
  { id: 'none', name: 'Aucune (Lisse pur)', category: 'Basique', previewColor: '#71717a', description: 'Matériau standard sans texture de relief.' },
  { id: 'carbon', name: 'Fibre de Carbone', category: 'Industriel', previewColor: '#18181b', description: 'Trame tissée high-tech pour véhicules et coques.' },
  { id: 'brushed', name: 'Métal Brossé', category: 'Métal', previewColor: '#a1a1aa', description: 'Stries métalliques directionnelles polies.' },
  { id: 'grid', name: 'Grille Cyber / Carrelage', category: 'Architecture', previewColor: '#0ea5e9', description: 'Lignes géométriques et dalles lumineuses.' },
  { id: 'pebbles', name: 'Galets & Roches', category: 'Nature', previewColor: '#78716c', description: 'Reliefs organiques et minéraux rugueux.' },
  { id: 'diamond', name: 'Tôle Striée (Diamond)', category: 'Industriel', previewColor: '#f59e0b', description: 'Plaque antidérapante en relief pour sols sci-fi.' },
];

const PRESET_IMAGE_URLS = [
  { name: 'Sci-Fi Metal Panel', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=512&auto=format&fit=crop&q=80' },
  { name: 'Briques Rouges', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=512&auto=format&fit=crop&q=80' },
  { name: 'Bois Sombre Chêne', url: 'https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=512&auto=format&fit=crop&q=80' },
  { name: 'Marbre Blanc Lux', url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=512&auto=format&fit=crop&q=80' },
  { name: 'Béton Brut Industriel', url: 'https://images.unsplash.com/photo-1518640467707-6811f4aefbd7?w=512&auto=format&fit=crop&q=80' },
];

export const TextureAssignerPanel: React.FC<TextureAssignerPanelProps> = ({
  isOpen,
  onClose,
  selectedNode,
  onUpdateMaterial,
  onImportLocalTexture,
  getUvAnalysis,
}) => {
  const [customUrl, setCustomUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'presets' | 'images' | 'tiling' | 'uv'>('presets');
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  // Nom du fichier importé, pour l'afficher : la clé stockée est un id opaque.
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uvAnalysis, setUvAnalysis] = useState<UvAnalysis | null>(null);

  // L'analyse dépend de la géométrie : on la recharge quand la sélection change,
  // pas à chaque render.
  const selectedId = selectedNode?.id;
  useEffect(() => {
    if (!selectedId || !getUvAnalysis) {
      setUvAnalysis(null);
      return;
    }
    setUvAnalysis(getUvAnalysis(selectedId));
  }, [selectedId, getUvAnalysis]);

  const mat = selectedNode?.material;

  const handleApplyPreset = (preset: TexturePreset) => {
    if (!selectedNode) return;
    onUpdateMaterial(selectedNode.id, {
      texturePreset: preset,
      hasNormalMap: preset !== 'none',
      hasRoughnessMap: preset !== 'none',
    });
  };

  const handleApplyImageMap = (url: string) => {
    if (!selectedNode) return;
    onUpdateMaterial(selectedNode.id, {
      mapUrl: url,
    });
  };

  /**
   * Importe une image choisie sur le disque : le binaire part dans IndexedDB
   * et seule la clé est stockée dans le matériau. Une data-URL gonflerait le
   * localStorage d'autosave (plafond ~5 Mo) et une object URL mourrait au
   * rechargement de la page.
   */
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;
      if (!selectedNode) {
        await alertBox('Sélectionnez d\'abord un objet dans le viewport.', {
          title: 'Aucun objet sélectionné',
        });
        return;
      }
      if (!onImportLocalTexture) return;

      setIsImporting(true);
      try {
        const key = await onImportLocalTexture(file);
        if (key) {
          setLocalFileName(file.name);
          // Inline plutôt que handleApplyImageMap() : ce dernier est recréé à
          // chaque render, il ne peut donc pas figurer dans les dépendances.
          onUpdateMaterial(selectedNode.id, { mapUrl: key });
        }
      } catch (err) {
        await alertBox(
          err instanceof Error ? err.message : 'Impossible de lire ce fichier.',
          { title: 'Import de texture impossible' }
        );
      } finally {
        setIsImporting(false);
      }
    },
    [selectedNode, onUpdateMaterial, onImportLocalTexture]
  );

  const handleRemoveImageMap = () => {
    if (!selectedNode) return;
    setLocalFileName(null);
    onUpdateMaterial(selectedNode.id, { mapUrl: '' });
  };

  /**
   * Rend la grille UV sur un canvas : damier de fond, îlots et densité.
   * Le damier se répète selon le tiling pour montrer la plage réellement couverte.
   */
  const drawUvAtlas = useCallback((canvas: HTMLCanvasElement, repU: number, repV: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !uvAnalysis) return;
    const W = canvas.width;
    const H = canvas.height;
    const spanU = Math.max(uvAnalysis.bounds.maxU - uvAnalysis.bounds.minU, 1e-6);
    const spanV = Math.max(uvAnalysis.bounds.maxV - uvAnalysis.bounds.minV, 1e-6);
    // Le tiling répète la texture : on montre la plage réellement couverte.
    const tilesX = Math.max(1, Math.ceil(repU));
    const tilesY = Math.max(1, Math.ceil(repV));

    // Damier de référence (UV 0→1 répété selon le tiling).
    const cell = Math.max(6, Math.floor(Math.min(W, H) / 8));
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        for (let cy = 0; cy * cell < H; cy++) {
          for (let cx = 0; cx * cell < W; cx++) {
            const even = (cx + cy + tx + ty) % 2 === 0;
            ctx.fillStyle = even ? '#27272a' : '#3f3f46';
            ctx.fillRect(tx * W + cx * cell, ty * H + cy * cell, cell, cell);
          }
        }
      }
    }

    // Îlots : rectangles englobants, remplis selon la densité.
    const toX = (u: number) => ((u - uvAnalysis.bounds.minU) / spanU) * W;
    const toY = (v: number) => H - ((v - uvAnalysis.bounds.minV) / spanV) * H;
    const maxDensity = Math.max(...uvAnalysis.density.flat(), 1);
    for (let row = 0; row < uvAnalysis.density.length; row++) {
      for (let col = 0; col < uvAnalysis.density[row].length; col++) {
        const d = uvAnalysis.density[row][col];
        if (d === 0) continue;
        const t = d / maxDensity;
        const cx = (col + 0.5) / uvAnalysis.density.length;
        const cy = 1 - (row + 0.5) / uvAnalysis.density.length;
        ctx.fillStyle = `rgba(56, 189, 248, ${0.12 + t * 0.5})`;
        ctx.fillRect(cx * W - W / 32, cy * H - H / 32, W / 16, H / 16);
      }
    }
    uvAnalysis.islands.forEach((island, idx) => {
      const x = toX(island.minU);
      const y = toY(island.maxV);
      const w = Math.max(2, toX(island.maxU) - toX(island.minU));
      const h = Math.max(2, toY(island.minV) - toY(island.maxV));
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.08)';
      ctx.fillRect(x, y, w, h);
      if (idx < 12) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(`${idx + 1}`, x + 3, y + 11);
      }
    });

    // Bordure du domaine UV 0→1 si elle diffère des bornes (UV débordants).
    if (uvAnalysis.overflows) {
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.9)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      const x0 = toX(0);
      const y0 = toY(1);
      ctx.strokeRect(x0, y0, (1 / spanU) * W, (1 / spanV) * H);
      ctx.setLineDash([]);
    }
  }, [uvAnalysis]);

  const uvCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (activeTab !== 'uv' || !uvCanvasRef.current) return;
    drawUvAtlas(uvCanvasRef.current, mat?.repeatU ?? 1, mat?.repeatV ?? 1);
  }, [activeTab, uvAnalysis, mat?.repeatU, mat?.repeatV, drawUvAtlas]);

  const uvSummary = useMemo(() => {
    if (!uvAnalysis || !uvAnalysis.hasUv) return null;
    const b = uvAnalysis.bounds;
    return {
      islands: uvAnalysis.islands.length,
      range: `U ${b.minU.toFixed(2)} → ${b.maxU.toFixed(2)}  ·  V ${b.minV.toFixed(2)} → ${b.maxV.toFixed(2)}`,
    };
  }, [uvAnalysis]);

  // Retour tardif : tous les hooks ci-dessus doivent s'exécuter à CHAQUE render.
  // Placé plus haut, le nombre de hooks différait entre l'ouverture et la
  // fermeture du panneau → « Rendered more hooks than during the previous render ».
  if (!isOpen) return null;

  return (
    // Docké à droite, sans voile ni flou : le viewport reste visible et cliquable.
    <div className="fixed top-14 bottom-0 right-0 z-50 flex p-3 pointer-events-none select-none">
      <div className="pointer-events-auto w-[min(600px,94vw)] h-full bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-16 px-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shadow-md">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Gestionnaire & Assignation de Textures</h2>
              <p className="text-[11px] text-zinc-400">
                {selectedNode ? `Objet actif : ${selectedNode.name}` : 'Aucun objet sélectionné'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-4 gap-2 px-6 pt-4 pb-2 bg-zinc-950 border-b border-zinc-800/60">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'presets'
                ? 'bg-sky-500/15 border border-sky-500/40 text-sky-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Reliefs & Presets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('images')}
            className={`py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'images'
                ? 'bg-sky-500/15 border border-sky-500/40 text-sky-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Textures Albedo HD</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tiling')}
            className={`py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'tiling'
                ? 'bg-sky-500/15 border border-sky-500/40 text-sky-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Répétition UV / Tiling</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('uv')}
            className={`py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'uv'
                ? 'bg-sky-500/15 border border-sky-500/40 text-sky-300 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Planche UV</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!selectedNode ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                <Layers className="w-6 h-6" />
              </div>
              <p className="text-xs text-zinc-400">Veuillez sélectionner un objet 3D dans le viewport pour lui assigner des textures.</p>
            </div>
          ) : (
            <>
              {activeTab === 'presets' && (
                <div className="grid grid-cols-2 gap-3">
                  {TEXTURE_PRESETS.map((p) => {
                    const isSelected = mat?.texturePreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleApplyPreset(p.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden ${
                          isSelected
                            ? 'bg-sky-500/10 border-sky-500/60 shadow-lg shadow-sky-500/10'
                            : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-xl border border-white/20 shadow-inner flex items-center justify-center font-bold text-[10px] text-white"
                              style={{ backgroundColor: p.previewColor }}
                            >
                              {p.name.charAt(0)}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-zinc-200 block">{p.name}</span>
                              <span className="text-[10px] text-zinc-500">{p.category}</span>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center shadow">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">{p.description}</p>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeTab === 'images' && (
                <div className="space-y-4">
                  {/* Import depuis l'ordinateur — glisser-déposer ou sélecteur */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-zinc-300">
                      Importer une texture depuis mon ordinateur
                    </span>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
                      }}
                      onClick={() => !isImporting && fileInputRef.current?.click()}
                      className={`relative rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all ${
                        isDragging
                          ? 'border-sky-500 bg-sky-500/10'
                          : 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-900'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) void handleFiles(e.target.files);
                          // Reset : sans ça, re-sélectionner le même fichier
                          // ne déclencherait pas l'événement change.
                          e.target.value = '';
                        }}
                      />

                      {isImporting ? (
                        <>
                          <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
                          <span className="text-xs font-semibold text-zinc-200">Import en cours…</span>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                            <Upload className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-semibold text-zinc-200">
                            {isDragging ? 'Déposez votre image ici' : 'Glissez une image ou cliquez pour parcourir'}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            PNG, JPG, WebP, GIF, BMP, AVIF — 32 Mo max
                          </span>
                        </>
                      )}
                    </div>

                    {/* Texture locale actuellement assignée */}
                    {isLocalTextureKey(mat?.mapUrl) && (
                      <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                            <HardDrive className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-emerald-200 block truncate">
                              {localFileName ?? 'Texture locale'}
                            </span>
                            <span className="text-[10px] text-emerald-500/80 block">
                              Stockée sur ce poste · survit au rechargement
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveImageMap}
                          title="Retirer la texture"
                          className="p-2 rounded-xl hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-200 transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-3 border-t border-zinc-800/60">
                    <span className="text-xs font-semibold text-zinc-300">Bibliothèque de textures HD prêtes à l&apos;emploi</span>
                    <div className="grid grid-cols-1 gap-2.5">
                      {PRESET_IMAGE_URLS.map((img, idx) => {
                        const isSelected = mat?.mapUrl === img.url;
                        return (
                          <div
                            key={idx}
                            onClick={() => handleApplyImageMap(img.url)}
                            className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-sky-500/10 border-sky-500/60'
                                : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.url}
                                alt={img.name}
                                className="w-12 h-12 rounded-xl object-cover border border-zinc-700"
                                referrerPolicy="no-referrer"
                              />
                              <div>
                                <h4 className="text-xs font-semibold text-white">{img.name}</h4>
                                <span className="text-[10px] text-zinc-400 truncate max-w-[260px] block">{img.url}</span>
                              </div>
                            </div>
                            {isSelected ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveImageMap();
                                }}
                                title="Retirer la texture"
                                className="px-2.5 py-1 rounded-xl bg-sky-500/20 border border-sky-500/40 text-[10px] text-sky-300 font-medium hover:bg-sky-500/30 transition-colors shrink-0"
                              >
                                Retirer
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom URL Input */}
                  <div className="space-y-2 pt-3 border-t border-zinc-800/60">
                    <span className="text-xs font-semibold text-zinc-300">URL d&apos;image personnalisée</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="https://example.com/texture.jpg"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customUrl) handleApplyImageMap(customUrl);
                        }}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-xl transition-all shadow-md shadow-sky-500/20"
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tiling' && (
                <div className="space-y-6 py-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300 font-medium">Répétition Horizontale (Repeat U)</span>
                      <span className="font-mono text-sky-400">{(mat?.repeatU ?? 1).toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={mat?.repeatU ?? 1}
                      onChange={(e) =>
                        onUpdateMaterial(selectedNode.id, { repeatU: parseFloat(e.target.value) })
                      }
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300 font-medium">Répétition Verticale (Repeat V)</span>
                      <span className="font-mono text-sky-400">{(mat?.repeatV ?? 1).toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={mat?.repeatV ?? 1}
                      onChange={(e) =>
                        onUpdateMaterial(selectedNode.id, { repeatV: parseFloat(e.target.value) })
                      }
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                    <span className="text-xs font-semibold text-zinc-300">Conseil d&apos;utilisation</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Ajustez le tiling pour répéter les motifs de briques, de bois ou de plaques métalliques sur les grands murs et sols sans effet de flou.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'uv' && (
                <div className="space-y-4">
                  {!uvAnalysis || !uvAnalysis.hasUv ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                      <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <p className="text-xs text-zinc-300 font-semibold">Aucune couche UV exploitable</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed max-w-[380px]">
                        Ce maillage ne possède pas d&apos;attribut <code className="text-zinc-300">uv</code>.
                        Sans UV, aucune texture ne peut être plaquée : importez un modèle
                        texturé (.glb), ou utilisez un preset procédural, qui ignore
                        la couche UV.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                            <Boxes className="w-3.5 h-3.5 text-yellow-400" />
                            Planche des îlots UV
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {uvAnalysis.vertexCount} sommets
                          </span>
                        </div>
                        <canvas
                          ref={uvCanvasRef}
                          width={520}
                          height={360}
                          className="w-full h-auto rounded-2xl border border-zinc-800 bg-zinc-950"
                        />
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-400">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm border border-yellow-400/70 bg-yellow-400/20" />
                            Îlot UV (enveloppe)
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400/40" />
                            Densité de triangles
                          </span>
                          {uvAnalysis.overflows && (
                            <span className="flex items-center gap-1.5 text-rose-300">
                              <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-rose-400/70" />
                              Limite 0→1
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">
                            Îlots
                          </span>
                          <span className="text-sm font-mono text-yellow-300">
                            {uvSummary?.islands ?? 0}
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">
                            Plage UV
                          </span>
                          <span className="text-[11px] font-mono text-sky-300 block">
                            {uvSummary?.range}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                        <span className="text-xs font-semibold text-zinc-300">
                          Où va votre texture
                        </span>
                        <ul className="text-[11px] text-zinc-400 leading-relaxed space-y-1.5">
                          <li>
                            • Les rectangles jaunes délimitent les zones que la
                            texture recouvre réellement : vos <strong className="text-zinc-300">îlots</strong>.
                          </li>
                          <li>
                            • Le bleu indique la <strong className="text-zinc-300">densité</strong> :
                            une zone sombre est sous-échantillonnée, votre texture y
                            sera étirée et floue.
                          </li>
                          {(uvSummary?.islands ?? 0) > 1 && (
                            <li>
                              • {uvSummary?.islands} îlots ={' '}
                              <strong className="text-zinc-300">{uvSummary?.islands} fragments distincts</strong>{' '}
                              de votre image. Sur une boîte, chaque face a son propre
                              îlot : une texture « de face » n&apos;en remplit qu&apos;un seul.
                            </li>
                          )}
                          {uvAnalysis.overflows && (
                            <li className="text-rose-300">
                              • Les UV dépassent 0→1 (trait en tirets) : la texture se
                              répète dans le modèle, réglez le tiling en conséquence.
                            </li>
                          )}
                        </ul>
                        <p className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/60">
                          Le damier de fond montre la répétition correspondant à votre
                          tiling actuel (U × V), réglable dans l&apos;onglet
                          « Répétition UV / Tiling ».
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
