'use client';

import React, { useEffect, useState } from 'react';
import { X, Users, Copy, Check, Play, Eye, RotateCcw, LogOut, Wifi } from 'lucide-react';
import type { PeerMeta } from '../lib/net/types';

export interface NetStatsView {
  role: string;
  clients: number;
  rttMs: number;
  reconciliations: number;
  lastError: number;
  remotes: number;
}

interface MultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'none' | 'host' | 'client';
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  isSpectator: boolean;
  onStartHost: () => void;
  onCreateInvite: () => Promise<string>;
  onAcceptAnswer: (code: string) => Promise<void>;
  onJoin: (invite: string, spectator: boolean) => Promise<string>;
  onStop: () => void;
  onSetSpectator: (b: boolean) => void;
  onRespawn: () => void;
  getStats: () => NetStatsView;
  getPeers: () => PeerMeta[];
  getLog: () => string[];
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  isOpen,
  onClose,
  role,
  playerName,
  onPlayerNameChange,
  isSpectator,
  onStartHost,
  onCreateInvite,
  onAcceptAnswer,
  onJoin,
  onStop,
  onSetSpectator,
  onRespawn,
  getStats,
  getPeers,
  getLog,
}) => {
  const [tab, setTab] = useState<'host' | 'join'>('host');
  const [invite, setInvite] = useState('');
  const [answer, setAnswer] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinSpectator, setJoinSpectator] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<NetStatsView | null>(null);
  const [peers, setPeers] = useState<PeerMeta[]>([]);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const refresh = (): void => {
      try {
        setStats(getStats());
      } catch {
        /* ignore */
      }
      try {
        setPeers(getPeers());
      } catch {
        /* ignore */
      }
      try {
        setLog(getLog().slice(-12));
      } catch {
        /* ignore */
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, role]);

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
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    // Docké à droite, sans voile ni flou : le viewport reste visible et cliquable.
    <div className="fixed top-14 bottom-0 right-0 z-[90] flex p-3 pointer-events-none select-none">
      <div className="pointer-events-auto w-[min(560px,94vw)] h-full overflow-y-auto rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950">
          <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Multijoueur P2P (test)</span>
            {role !== 'none' && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                {role === 'host' ? 'HÔTE' : 'CLIENT'}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 text-xs">
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 px-3 py-2 text-[11px]">
              {error}
            </div>
          )}

          {/* Nom */}
          <label className="flex items-center gap-2 text-zinc-400">
            <span className="shrink-0">Pseudo</span>
            <input
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value.slice(0, 24))}
              placeholder="Joueur"
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 outline-none focus:border-emerald-500/50"
            />
          </label>

          {role === 'none' && (
            <>
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-zinc-900 rounded-xl border border-zinc-800">
                {(['host', 'join'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${tab === t ? 'bg-emerald-500/20 text-emerald-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {t === 'host' ? 'Héberger' : 'Rejoindre'}
                  </button>
                ))}
              </div>

              {tab === 'host' ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-zinc-500">
                    L’hôte simule la partie (autorité). Passez en <b className="text-zinc-300">Play</b> puis partagez
                    l’invitation au testeur (même scène chargée des deux côtés).
                  </p>
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() => void run('invite', async () => {
                      onStartHost();
                      setInvite(await onCreateInvite());
                      setAnswer('');
                    })}
                    className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 font-semibold hover:bg-emerald-500/25 disabled:opacity-40"
                  >
                    {busy === 'invite' ? 'Génération…' : '1. Créer une invitation'}
                  </button>
                  {invite && (
                    <>
                      <label className="text-zinc-400 text-[11px]">Code d’invitation (à envoyer) :</label>
                      <div className="flex gap-1.5">
                        <textarea readOnly value={invite} rows={3} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
                        <button type="button" onClick={() => void copy(invite)} className="px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-emerald-300" title="Copier">
                          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <label className="text-zinc-400 text-[11px]">2. Coller la réponse du testeur :</label>
                      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Code de réponse…" className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-100 outline-none resize-none placeholder:text-zinc-600" />
                      <button
                        type="button"
                        disabled={busy !== '' || !answer.trim()}
                        onClick={() => void run('accept', async () => {
                          await onAcceptAnswer(answer.trim());
                          setAnswer('');
                        })}
                        className="px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-200 font-semibold hover:bg-sky-500/25 disabled:opacity-40"
                      >
                        {busy === 'accept' ? 'Connexion…' : '3. Accepter et connecter'}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-zinc-500">Collez l’invitation de l’hôte, puis renvoyez-lui votre réponse.</p>
                  <textarea value={joinCode} onChange={(e) => setJoinCode(e.target.value)} rows={3} placeholder="Code d'invitation…" className="w-full px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-100 outline-none resize-none placeholder:text-zinc-600" />
                  <label className="flex items-center gap-2 text-zinc-400 text-[11px]">
                    <input type="checkbox" checked={joinSpectator} onChange={(e) => setJoinSpectator(e.target.checked)} className="accent-emerald-500" />
                    Rejoindre en spectateur (caméra libre, sans avatar)
                  </label>
                  <button
                    type="button"
                    disabled={busy !== '' || !joinCode.trim()}
                    onClick={() => void run('join', async () => {
                      const code = await onJoin(joinCode.trim(), joinSpectator);
                      setInvite(code);
                    })}
                    className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 font-semibold hover:bg-emerald-500/25 disabled:opacity-40"
                  >
                    {busy === 'join' ? 'Connexion…' : 'Rejoindre et générer ma réponse'}
                  </button>
                  {invite && (
                    <>
                      <label className="text-zinc-400 text-[11px]">Votre réponse (à renvoyer à l’hôte) :</label>
                      <div className="flex gap-1.5">
                        <textarea readOnly value={invite} rows={3} className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
                        <button type="button" onClick={() => void copy(invite)} className="px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-emerald-300" title="Copier">
                          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {role === 'host' && (
            <div className="flex flex-col gap-2">
              <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-2.5">
                <div className="text-[11px] font-semibold text-zinc-300 mb-1.5">Joueurs connectés ({peers.length})</div>
                {peers.length === 0 && <div className="text-[11px] text-zinc-600">En attente… créez une autre invitation via le bouton ci-dessous.</div>}
                {peers.map((p) => (
                  <div key={p.clientId} className="flex items-center justify-between py-1 border-t border-zinc-800/60 first:border-0">
                    <span className="text-[11px] text-zinc-200">
                      {p.name}
                      {p.spectator && <span className="ml-1.5 text-[9px] font-mono text-zinc-500">SPECTATEUR</span>}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                      <Wifi className="w-3 h-3" />{p.rttMs} ms
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => void run('invite2', async () => {
                    setInvite(await onCreateInvite());
                    setAnswer('');
                  })}
                  className="mt-1.5 w-full px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-200 hover:border-emerald-500/40 disabled:opacity-40"
                >
                  {busy === 'invite2' ? 'Génération…' : '+ Inviter un autre testeur'}
                </button>
                {invite && (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    <textarea readOnly value={invite} rows={2} className="w-full px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => void copy(invite)} className="flex-1 px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-200">
                        Copier l’invitation
                      </button>
                    </div>
                    <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="Réponse du testeur…" className="w-full px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-100 outline-none resize-none placeholder:text-zinc-600" />
                    <button
                      type="button"
                      disabled={busy !== '' || !answer.trim()}
                      onClick={() => void run('accept2', async () => {
                        await onAcceptAnswer(answer.trim());
                        setAnswer('');
                      })}
                      className="px-2 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-200 text-[11px] font-semibold disabled:opacity-40"
                    >
                      {busy === 'accept2' ? 'Connexion…' : 'Accepter'}
                    </button>
                  </div>
                )}
              </div>
              {stats && stats.role === 'host' && (
                <div className="text-[10px] font-mono text-zinc-500">snapshots hôte 15 Hz · delta quantifié (0.01)</div>
              )}
              <button
                type="button"
                onClick={onStop}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 font-semibold hover:bg-rose-500/20"
              >
                <LogOut className="w-3.5 h-3.5" /> Fermer le salon
              </button>
            </div>
          )}

          {role === 'client' && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1.5">
                  <div className="text-zinc-500">Ping</div>
                  <div className="font-mono text-sm font-bold text-emerald-300">{stats?.rttMs ?? 0} ms</div>
                </div>
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1.5">
                  <div className="text-zinc-500">Réconciliations</div>
                  <div className="font-mono text-sm font-bold text-zinc-100">{stats?.reconciliations ?? 0}</div>
                </div>
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1.5">
                  <div className="text-zinc-500">Distants</div>
                  <div className="font-mono text-sm font-bold text-zinc-100">{stats?.remotes ?? 0}</div>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onSetSpectator(!isSpectator)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl border text-[11px] font-semibold transition-colors ${isSpectator ? 'bg-amber-500/15 border-amber-500/40 text-amber-200' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-amber-500/40'}`}
                >
                  <Eye className="w-3.5 h-3.5" /> {isSpectator ? 'Quitter spectateur' : 'Spectateur'}
                </button>
                <button
                  type="button"
                  onClick={onRespawn}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:border-emerald-500/40"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Respawn
                </button>
              </div>
              <button
                type="button"
                onClick={onStop}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 font-semibold hover:bg-rose-500/20"
              >
                <LogOut className="w-3.5 h-3.5" /> Se déconnecter
              </button>
            </div>
          )}

          {/* Journal */}
          {log.length > 0 && (
            <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-2">
              <div className="text-[10px] font-semibold text-zinc-500 mb-1">Journal réseau</div>
              <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto font-mono text-[10px] text-zinc-400">
                {log.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-1.5 text-[10px] text-zinc-600">
            <Play className="w-3 h-3 mt-0.5 shrink-0" />
            <span>Session de test : passez en <b>Play</b> des deux côtés avec la même scène chargée (props synchronisées par UUID). Prédiction client + snapshots hôte 15 Hz.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
