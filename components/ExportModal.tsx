'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SceneExportData } from '../types/engine';
import { AetherExporter, GameExportOptions } from '../lib/export/AetherExporter';
import {
  X,
  Download,
  Share2,
  FileCode,
  Check,
  Globe,
  Sparkles,
  Layers,
  Volume2,
  Tv,
  Box,
  Package,
  Loader2,
} from 'lucide-react';
import { useEscapeToClose } from '../lib/ui/useDismiss';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneData: SceneExportData;
  getGLB?: () => Promise<Uint8Array | null> | Uint8Array | null;
  getBinary?: () => Uint8Array | null;
}

type GenState = 'generating' | 'ready' | 'error';

const DEBOUNCE_MS = 350;

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  sceneData,
  getGLB,
  getBinary,
}) => {
  const [options, setOptions] = useState<GameExportOptions>({
    title: sceneData.projectName || 'Aether 3D Island Adventure',
    author: 'Aether Creator',
    description: 'Jeu 3D interactif généré avec Aether 3D Engine.',
    includeTerrain: true,
    includeHUD: true,
    includeAtmosphere: true,
    includeSound: true,
  });

  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [genState, setGenState] = useState<GenState>('generating');
  const [genError, setGenError] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [htmlKb, setHtmlKb] = useState<number>(0);
  const [hasGlb, setHasGlb] = useState(false);
  const [glbKb, setGlbKb] = useState(0);
  const [retryToken, setRetryToken] = useState(0);

  // Thunks suivis en ref : leur identité change à chaque render parent
  // sans invalider la génération en cours.
  const getGLBRef = useRef(getGLB);
  getGLBRef.current = getGLB;
  const getBinaryRef = useRef(getBinary);
  getBinaryRef.current = getBinary;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Cache GLB (une seule génération par ouverture du modal, qui remonte à chaque fois).
  const glbPromiseRef = useRef<Promise<Uint8Array | null> | null>(null);
  const glbBytesRef = useRef<Uint8Array | null>(null);
  const getGlbOnce = (): Promise<Uint8Array | null> => {
    if (!glbPromiseRef.current) {
      const thunk = getGLBRef.current;
      glbPromiseRef.current = thunk
        ? Promise.resolve()
            .then(() => thunk())
            .then((bytes) => (bytes && bytes.length > 0 ? bytes : null))
            .catch((err) => {
              console.warn('[ExportModal] exportSceneGLTF a échoué :', err);
              return null;
            })
        : Promise.resolve(null);
    }
    return glbPromiseRef.current;
  };

  // Génération asynchrone du HTML, debounce 350 ms, jeton anti-course.
  useEffect(() => {
    if (!isOpen) return undefined;
    const cancel = { current: true };
    setGenState('generating');
    setGenError(null);

    const timer = setTimeout(() => {
      (async () => {
        if (!cancel.current) return;
        try {
          const glb = await getGlbOnce();
          glbBytesRef.current = glb;
          if (!cancel.current) return;
          const out = await AetherExporter.generateStandaloneHTML(sceneData, optionsRef.current, { glb });
          if (!cancel.current) return;
          setHtml(out);
          setHtmlKb(Math.round(new Blob([out]).size / 1024));
          setHasGlb(Boolean(glb));
          setGlbKb(glb ? Math.round(glb.length / 1024) : 0);
          setGenState('ready');
        } catch (err) {
          if (!cancel.current) return;
          setGenError(err instanceof Error ? err.message : String(err));
          setGenState('error');
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancel.current = false;
      clearTimeout(timer);
    };
  }, [isOpen, options, sceneData, retryToken]);

  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const slug = (fallback: string) =>
    options.title.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '') || fallback;

  const busy = genState === 'generating';

  const handleDownload = () => {
    if (!html) return;
    setDownloading(true);
    AetherExporter.downloadHTML(html, `${slug('game')}.html`);
    setTimeout(() => setDownloading(false), 600);
  };

  const handleCopyCode = () => {
    if (!html) return;
    navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJSON = () => {
    AetherExporter.downloadJSON(sceneData, `${slug('scene')}.aether.json`);
  };

  const handleDownloadBinary = () => {
    try {
      const bytes = getBinaryRef.current?.();
      if (bytes) AetherExporter.downloadBinary(bytes, `${slug('scene')}.aether`);
    } catch (err) {
      console.warn('[ExportModal] export binaire a échoué :', err);
    }
  };

  const handleDownloadGLB = () => {
    const bytes = glbBytesRef.current;
    if (bytes) AetherExporter.downloadGLB(bytes, `${slug('scene')}.glb`);
  };

  const formatCard = (
    key: string,
    icon: React.ReactNode,
    label: string,
    ext: string,
    sizeKb: number | null,
    enabled: boolean,
    onDownload: () => void,
  ) => (
    <div
      key={key}
      className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
        enabled
          ? 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800/50'
          : 'bg-zinc-900/30 border-zinc-800/40 opacity-50'
      }`}
    >
      <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300 shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-zinc-200 truncate">{label}</div>
        <div className="text-[10px] font-mono text-zinc-500">
          {ext}
          {sizeKb !== null ? ` · ${sizeKb} Ko` : ''}
        </div>
      </div>
      <button
        type="button"
        disabled={!enabled}
        onClick={onDownload}
        className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:cursor-not-allowed text-zinc-300 transition-colors shrink-0"
        title={`Télécharger ${ext}`}
      >
        <Download className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exporter le jeu"
      className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="h-16 px-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shadow-md">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Exportateur de Jeu Web Autonome
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-mono border border-emerald-500/30">
                  One-Click Standalone
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Générez un fichier HTML autonome intégrant Three.js, terrain, HUD et logique de jeu.
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

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Game Title & Metadata */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Titre du Jeu</label>
              <input
                type="text"
                value={options.title}
                onChange={(e) => setOptions({ ...options, title: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-sky-500 font-medium"
                placeholder="Mon Super Jeu 3D"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400">Créateur / Auteur</label>
                <input
                  type="text"
                  value={options.author || ''}
                  onChange={(e) => setOptions({ ...options, author: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400">Poids estimé du build</label>
                <div className="px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-sky-400 font-mono flex items-center justify-between">
                  <span>
                    {busy ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        génération…
                      </span>
                    ) : genState === 'error' ? (
                      <span className="text-red-400">erreur</span>
                    ) : (
                      `~${htmlKb} Ko`
                    )}
                  </span>
                  <span className="text-[10px] text-zinc-500">Zéro dépendance locale</span>
                </div>
              </div>
            </div>
          </div>

          {/* Module Inclusions */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">Composants à embarquer</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={options.includeTerrain}
                  onChange={(e) => setOptions({ ...options, includeTerrain: e.target.checked })}
                  className="rounded text-sky-500 focus:ring-0 focus:ring-offset-0 bg-zinc-950 border-zinc-700"
                />
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-zinc-200">Terrain &amp; Sculpting</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={options.includeHUD}
                  onChange={(e) => setOptions({ ...options, includeHUD: e.target.checked })}
                  className="rounded text-sky-500 focus:ring-0 focus:ring-offset-0 bg-zinc-950 border-zinc-700"
                />
                <Tv className="w-4 h-4 text-sky-400" />
                <span className="text-xs text-zinc-200">HUD 2D &amp; Overlay</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={options.includeAtmosphere}
                  onChange={(e) => setOptions({ ...options, includeAtmosphere: e.target.checked })}
                  className="rounded text-sky-500 focus:ring-0 focus:ring-offset-0 bg-zinc-950 border-zinc-700"
                />
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-zinc-200">Atmosphère &amp; SkyDome</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={options.includeSound}
                  onChange={(e) => setOptions({ ...options, includeSound: e.target.checked })}
                  className="rounded text-sky-500 focus:ring-0 focus:ring-offset-0 bg-zinc-950 border-zinc-700"
                />
                <Volume2 className="w-4 h-4 text-indigo-400" />
                <span className="text-xs text-zinc-200">Synthétiseur Audio Web</span>
              </label>
            </div>
          </div>

          {/* Export Formats */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">Formats disponibles</label>
            <div className="grid grid-cols-2 gap-2">
              {formatCard(
                'html',
                <Globe className="w-4 h-4 text-sky-400" />,
                'Jeu HTML autonome',
                '.html (hors-ligne)',
                htmlKb,
                genState === 'ready' && Boolean(html),
                handleDownload,
              )}
              {formatCard(
                'json',
                <FileCode className="w-4 h-4 text-emerald-400" />,
                'Scène JSON lisible',
                '.aether.json',
                null,
                true,
                handleDownloadJSON,
              )}
              {formatCard(
                'binary',
                <Package className="w-4 h-4 text-amber-400" />,
                'Scène binaire',
                '.aether (binaire)',
                null,
                Boolean(getBinary),
                handleDownloadBinary,
              )}
              {formatCard(
                'glb',
                <Box className="w-4 h-4 text-indigo-400" />,
                'Géométrie 3D',
                '.glb',
                hasGlb ? glbKb : null,
                hasGlb,
                handleDownloadGLB,
              )}
            </div>
          </div>

          {/* Status / Error */}
          {genState === 'error' && (
            <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-start justify-between gap-3">
              <p className="text-xs text-red-300 leading-relaxed">
                Échec de la génération : {genError}
              </p>
              <button
                type="button"
                onClick={() => setRetryToken((t) => t + 1)}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-medium transition-colors shrink-0"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Quick Notice */}
          <div className="p-3.5 rounded-2xl bg-sky-950/30 border border-sky-500/20 flex items-start gap-3">
            <Share2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <p className="text-xs text-sky-200 leading-relaxed">
              Le fichier généré est un fichier standard{' '}
              <code className="text-sky-300 font-mono bg-sky-950/80 px-1 py-0.5 rounded">.html</code>.
              Vous pouvez double-cliquer dessus pour y jouer directement hors-ligne ou l’héberger sur
              GitHub Pages, Netlify, Itch.io ou Vercel.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="h-20 px-6 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleDownloadJSON}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white text-xs font-mono transition-colors"
          >
            <FileCode className="w-4 h-4" />
            <span>Export JSON (.aether)</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopyCode}
              disabled={!html}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 text-xs font-medium transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <FileCode className="w-4 h-4" />}
              <span>{copied ? 'Code Copié !' : 'Copier HTML'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={genState !== 'ready' || !html}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-sky-500/25 transition-all"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>
                {busy ? 'Génération…' : downloading ? 'Téléchargement...' : 'Télécharger index.html'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
