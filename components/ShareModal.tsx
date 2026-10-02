'use client';

import React, { useState } from 'react';
import {
  X, Link2, Copy, Check, Radio, Download, MonitorPlay, ExternalLink,
} from 'lucide-react';
import { formatShareBytes } from '../lib/share/shareUrl';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMakeLink: () => Promise<{ url: string; rawBytes: number; compressedBytes: number }>;
  liveActive: boolean;
  liveViewers: number;
  onStartLive: () => void;
  onLiveInvite: () => Promise<string>;
  onLiveAccept: (code: string) => Promise<void>;
  onStopLive: () => void;
  installAvailable: boolean;
  onInstall: () => Promise<boolean>;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  onMakeLink,
  liveActive,
  liveViewers,
  onStartLive,
  onLiveInvite,
  onLiveAccept,
  onStopLive,
  installAvailable,
  onInstall,
}) => {
  const [link, setLink] = useState('');
  const [linkInfo, setLinkInfo] = useState('');
  const [invite, setInvite] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec.');
    } finally {
      setBusy('');
    }
  };

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    // Docké à droite, sans voile ni flou : le viewport reste visible et cliquable.
    <div className="fixed top-14 bottom-0 right-0 z-[90] flex p-3 pointer-events-none select-none">
      <div className="pointer-events-auto w-[min(560px,94vw)] h-full overflow-y-auto rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950">
          <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
            <Link2 className="w-4 h-4 text-sky-400" />
            <span>Partager & diffuser (Web-natif)</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4 text-xs">
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 px-3 py-2 text-[11px]">
              {error}
            </div>
          )}

          {/* Lien de partage */}
          <section className="flex flex-col gap-2">
            <div className="font-semibold text-zinc-200">Lien de scène</div>
            <div className="text-[11px] text-zinc-500">Scène gzipée dans l’URL (`#s=…`, rien ne transite par un serveur).</div>
            <button
              type="button" disabled={busy !== ''}
              onClick={() => void run('link', async () => {
                const r = await onMakeLink();
                setLink(r.url);
                setLinkInfo(`${formatShareBytes(r.rawBytes)} → ${formatShareBytes(r.compressedBytes)} compressés`);
              })}
              className="px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-200 font-semibold hover:bg-sky-500/25 disabled:opacity-40"
            >
              {busy === 'link' ? 'Compression…' : 'Générer le lien'}
            </button>
            {link !== '' && (
              <>
                <div className="text-[10px] font-mono text-zinc-500">{linkInfo}</div>
                <div className="flex gap-1.5">
                  <textarea readOnly value={link} rows={3} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
                  <button type="button" onClick={() => void copy(link)} className="px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300" title="Copier">
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <a href={link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200 hover:border-sky-500/40">
                  <ExternalLink className="w-3.5 h-3.5" /> Ouvrir l’aperçu
                </a>
              </>
            )}
          </section>

          {/* Aperçu live */}
          <section className="flex flex-col gap-2 pt-3 border-t border-zinc-800/80">
            <div className="font-semibold text-zinc-200 flex items-center gap-2">
              <MonitorPlay className="w-4 h-4 text-emerald-400" />
              Aperçu live
              {liveActive && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                  EN DIRECT · {liveViewers} vue(s)
                </span>
              )}
            </div>
            <div className="text-[11px] text-zinc-500">
              Les onglets `/preview` (même appareil, zéro config) et appareils distants (code WebRTC) voient la scène, vos modifications, votre caméra et l’état Play en temps réel.
            </div>
            {!liveActive ? (
              <button
                type="button"
                onClick={onStartLive}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 font-semibold hover:bg-emerald-500/25"
              >
                <Radio className="w-3.5 h-3.5" /> Diffuser
              </button>
            ) : (
              <>
                <button
                  type="button" disabled={busy !== ''}
                  onClick={() => void run('live-invite', async () => {
                    setInvite(await onLiveInvite());
                    setAnswer('');
                  })}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200 disabled:opacity-40"
                >
                  {busy === 'live-invite' ? '…' : '+ Inviter un appareil distant'}
                </button>
                {invite !== '' && (
                  <>
                    <div className="flex gap-1.5">
                      <textarea readOnly value={invite} rows={2} className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
                      <button type="button" onClick={() => void copy(invite)} className="px-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200" title="Copier">
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="Réponse…" className="w-full px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-100 outline-none resize-none placeholder:text-zinc-600" />
                    <button
                      type="button" disabled={busy !== '' || !answer.trim()}
                      onClick={() => void run('live-accept', async () => {
                        await onLiveAccept(answer.trim());
                        setAnswer('');
                      })}
                      className="px-2 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-200 text-[11px] font-semibold disabled:opacity-40"
                    >
                      Accepter
                    </button>
                  </>
                )}
                <button
                  type="button" onClick={onStopLive}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-[11px] font-semibold"
                >
                  Arrêter la diffusion
                </button>
              </>
            )}
          </section>

          {/* PWA */}
          <section className="flex flex-col gap-2 pt-3 border-t border-zinc-800/80">
            <div className="font-semibold text-zinc-200 flex items-center gap-2">
              <Download className="w-4 h-4 text-violet-400" />
              Application installée (PWA)
            </div>
            {installAvailable ? (
              <button
                type="button"
                onClick={() => void onInstall().catch(() => undefined)}
                className="px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 font-semibold hover:bg-violet-500/25"
              >
                Installer Aether 3D
              </button>
            ) : (
              <div className="text-[11px] text-zinc-500">
                Ouvrez l’app dans Chrome/Edge puis utilisez le menu du navigateur (Installer) — disponible après quelques visites si l’app n’est pas déjà installée.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
