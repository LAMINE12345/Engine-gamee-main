import { runtimeHeader, runtimeBody } from './htmlRuntime';

import { SceneExportData } from '../../types/engine';

/**
 * Facade d'export unifiée d'Aether 3D Engine.
 *
 * Génère un HTML autonome 100 % hors-ligne :
 *  - three.module.js + three.core.js embarqués en data: URLs (importmap),
 *  - géométrie de la scène en GLB base64 (GLTFLoader) avec fallback JSON,
 *  - logique de jeu (11 cartes), HUD, son procédural embarqués.
 */

export interface GameExportOptions {
  title: string;
  author?: string;
  description?: string;
  includeTerrain: boolean;
  includeHUD: boolean;
  includeAtmosphere: boolean;
  includeSound: boolean;
}

// ---------------------------------------------------------------------------
// Base64 / data URLs
// ---------------------------------------------------------------------------

/** Encode des bytes en base64 par blocs (évite le stack overflow de btoa sur gros buffer). */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(binary);
}

function textToDataUrl(text: string): string {
  return 'data:text/javascript;base64,' + bytesToBase64(new TextEncoder().encode(text));
}

// ---------------------------------------------------------------------------
// Vendor three.js (route /api/vendor/[file], whitelist node_modules)
// ---------------------------------------------------------------------------

async function fetchVendor(file: string): Promise<string> {
  const res = await fetch('/api/vendor/' + file);
  if (!res.ok) {
    throw new Error('Vendor ' + file + ' indisponible (HTTP ' + res.status + ')');
  }
  return res.text();
}

let moduleUrlCache: Promise<string> | null = null;
/**
 * URL data: du module three.module.js, avec './three.core.js' (lignes 6 et 7)
 * réécrit vers un data: URL du core. Mise en cache promise partagée.
 */
export function getThreeModuleUrl(): Promise<string> {
  if (!moduleUrlCache) {
    const p = (async () => {
      const [core, mod] = await Promise.all([
        fetchVendor('three.core.js'),
        fetchVendor('three.module.js'),
      ]);
      const coreUrl = textToDataUrl(core);
      const patched = mod
        .split("'./three.core.js'")
        .join(JSON.stringify(coreUrl))
        .split('"./three.core.js"')
        .join(JSON.stringify(coreUrl));
      return textToDataUrl(patched);
    })();
    moduleUrlCache = p;
    p.catch(() => {
      if (moduleUrlCache === p) moduleUrlCache = null;
    });
  }
  return moduleUrlCache;
}

let loaderUrlCache: Promise<string> | null = null;
/**
 * URL data: du GLTFLoader.js avec ses deux imports relatifs
 * (BufferGeometryUtils / SkeletonUtils) réécrits en data: URLs.
 * Les deux utilitaires n'importent que 'three' (résolu par l'importmap).
 */
export function getThreeLoaderUrl(): Promise<string> {
  if (!loaderUrlCache) {
    const p = (async () => {
      const [loader, bgu, skel] = await Promise.all([
        fetchVendor('GLTFLoader.js'),
        fetchVendor('BufferGeometryUtils.js'),
        fetchVendor('SkeletonUtils.js'),
      ]);
      const bguUrl = textToDataUrl(bgu);
      const skelUrl = textToDataUrl(skel);
      const patched = loader
        .split("'../utils/BufferGeometryUtils.js'")
        .join(JSON.stringify(bguUrl))
        .split("'../utils/SkeletonUtils.js'")
        .join(JSON.stringify(skelUrl));
      return textToDataUrl(patched);
    })();
    loaderUrlCache = p;
    p.catch(() => {
      if (loaderUrlCache === p) loaderUrlCache = null;
    });
  }
  return loaderUrlCache;
}

// ---------------------------------------------------------------------------
// Payload projet (branche les 4 options include*)
// ---------------------------------------------------------------------------

/** Clone profond + strip des blocs désactivés par les options d'export. */
export function buildProjectPayload(
  sceneData: SceneExportData,
  options: GameExportOptions
): SceneExportData {
  const payload: SceneExportData = JSON.parse(JSON.stringify(sceneData));
  if (!options.includeTerrain) delete payload.terrain;
  if (!options.includeAtmosphere) {
    delete payload.atmosphere;
    delete payload.postProcessing;
  }
  if (!options.includeHUD) delete payload.hud;
  return payload;
}

// ---------------------------------------------------------------------------
// Téléchargements
// ---------------------------------------------------------------------------

function triggerDownload(data: BlobPart, filename: string, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadHTML(content: string, filename = 'AetherGame.html'): void {
  triggerDownload(content, filename, 'text/html;charset=utf-8');
}

export function downloadJSON(data: SceneExportData, filename: string): void {
  triggerDownload(JSON.stringify(data, null, 2), filename, 'application/json');
}

export function downloadGLB(bytes: Uint8Array, filename: string): void {
  triggerDownload(new Uint8Array(bytes), filename, 'model/gltf-binary');
}

export function downloadBinary(bytes: Uint8Array, filename: string): void {
  triggerDownload(new Uint8Array(bytes), filename, 'application/octet-stream');
}

export function safeFilename(title: string, fallback: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '') || fallback;
}

// ---------------------------------------------------------------------------
// HTML autonome
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Génère le HTML autonome complet (async : fetch des vendors three + encodage).
 * `deps.glb` : géométrie GLB de la scène (null → fallback reconstruction JSON).
 */
export async function generateStandaloneHTML(
  sceneData: SceneExportData,
  options: GameExportOptions,
  deps?: { glb?: Uint8Array | null }
): Promise<string> {
  const title = options.title || 'Aether 3D Web Game';
  const payload = buildProjectPayload(sceneData, options);
  const glb = deps?.glb && deps.glb.length > 0 ? deps.glb : null;

  const [moduleUrl, loaderUrl] = await Promise.all([
    getThreeModuleUrl(),
    glb ? getThreeLoaderUrl() : Promise.resolve<string | null>(null),
  ]);

  if (glb) payload.gltf = bytesToBase64(glb);

  const json = JSON.stringify(payload).replace(/<\/script>/g, '<\\/script>');
  const importmap: { imports: Record<string, string> } = { imports: { three: moduleUrl } };
  if (loaderUrl) importmap.imports['three/addons/loaders/GLTFLoader.js'] = loaderUrl;

  const header = runtimeHeader(Boolean(loaderUrl));
  const body = runtimeBody({ sound: options.includeSound, gltf: Boolean(loaderUrl) });

  const hudMarkup = options.includeHUD ? HUD_MARKUP : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${escapeHtml(title)} - Propulsé par Aether 3D Engine</title>
  <meta name="author" content="${escapeHtml(options.author || 'Aether Creator')}">
  <meta name="description" content="${escapeHtml(options.description || 'Jeu 3D interactif généré avec Aether 3D Engine.')}">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #0c0e14;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #game-container {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      touch-action: none;
    }
    /* HUD 2D In-Game Overlay */
    #hud-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    }
    .hud-card {
      position: absolute;
      background: rgba(12, 14, 20, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 8px 16px;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      font-size: 13px;
    }
    .hp-bar-bg {
      width: 160px;
      height: 10px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .hp-bar-fill {
      height: 100%;
      background: #ef4444;
      width: 100%;
      transition: width 0.3s ease;
      border-radius: 999px;
    }
    /* Toast ShowMessage */
    #msg-toast {
      position: absolute;
      top: 18%;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.35);
      color: #e2e8f0;
      padding: 12px 22px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.25s, transform 0.25s;
      z-index: 60;
      pointer-events: none;
      max-width: 70%;
      text-align: center;
    }
    #msg-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    /* Controls hint */
    #controls-badge {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(12, 14, 20, 0.7);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 8px 14px;
      border-radius: 12px;
      color: #94a3b8;
      font-size: 11px;
      font-family: monospace;
      z-index: 10;
      pointer-events: none;
    }
    /* Crosshair */
    #crosshair {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 6px;
      background: #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
      pointer-events: none;
      z-index: 10;
    }
    /* Pause / Start Screen */
    #pause-screen {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(10px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .dialog-box {
      background: #0f172a;
      border: 1px solid #334155;
      padding: 32px;
      border-radius: 24px;
      text-align: center;
      max-width: 380px;
      color: #ffffff;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .btn-action {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 12px 24px;
      border-radius: 14px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      margin-top: 20px;
      width: 100%;
      transition: background 0.2s;
    }
    .btn-action:hover {
      background: #0369a1;
    }
  </style>
</head>
<body>
  <div id="game-container"></div>

${hudMarkup}

  <div id="msg-toast"></div>

  <div id="controls-badge">
    [ZQSD / WASD] Déplacement | [Espace] Saut | [Clic & Glisser] Caméra | [Échap] Pause
  </div>

  <div id="pause-screen">
    <div class="dialog-box">
      <h2 style="font-size: 20px; margin-bottom: 8px;">Jeu en Pause</h2>
      <p style="font-size: 12px; color: #94a3b8;">Appuyez sur Reprendre ou Échap pour continuer votre partie.</p>
      <button id="btn-resume" class="btn-action">Reprendre la partie</button>
    </div>
  </div>

  <script id="aether-project-data" type="application/json">${json}</script>

  <script type="importmap">
${JSON.stringify(importmap, null, 2)}
  </script>

  <script type="module">
${header}
${body}
  </script>
</body>
</html>`;
}

export const AetherExporter = {
  generateStandaloneHTML,
  downloadHTML,
  downloadJSON,
  downloadGLB,
  downloadBinary,
  bytesToBase64,
  getThreeModuleUrl,
  getThreeLoaderUrl,
};

// ---------------------------------------------------------------------------
// Markup HUD (option includeHUD)
// ---------------------------------------------------------------------------

const HUD_MARKUP = `  <div id="hud-overlay">
    <div id="hud-hp-card" class="hud-card" style="top: 20px; left: 20px;">
      <span style="color: #ef4444; font-weight: bold;">&#10084;</span>
      <div class="hp-bar-bg">
        <div id="hud-hp-fill" class="hp-bar-fill"></div>
      </div>
      <span id="hud-hp-val" style="font-family: monospace; font-size: 11px;">100/100</span>
    </div>

    <div id="hud-score-card" class="hud-card" style="top: 20px; right: 20px; border-color: rgba(56, 189, 248, 0.4);">
      <span style="color: #38bdf8; font-weight: bold;">&#9733;</span>
      <span>SCORE:</span>
      <span id="hud-score-val" style="font-family: monospace; font-weight: bold; color: #38bdf8; font-size: 15px;">0</span>
    </div>

    <div id="hud-coin-card" class="hud-card" style="top: 65px; right: 20px; border-color: rgba(234, 179, 8, 0.4);">
      <span style="color: #eab308; font-weight: bold;">&#129689;</span>
      <span id="hud-coin-val" style="font-family: monospace; font-weight: bold; color: #fde047; font-size: 14px;">0</span>
    </div>

    <div id="crosshair"></div>
  </div>
`;
