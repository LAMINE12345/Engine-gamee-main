'use client';

import React, { useEffect, useState } from 'react';
import {
  X, GitBranch, Copy, Check, LogOut, Users, History, Diff,
  GitMerge, Share2, RotateCcw, Plus, RefreshCw,
} from 'lucide-react';
import type {
  CollabBranch, CollabCommit, MergeConflict, PeerPresence, SceneDiff,
} from '../lib/collab/types';

export interface CollabStatsView {
  active: boolean;
  role: string;
  peers: number;
  lamport: number;
  commits: number;
  branch: string;
  branches: number;
}

interface CollabModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onUserNameChange: (name: string) => void;
  stats: CollabStatsView;
  peers: PeerPresence[];
  log: string[];
  onStart: () => void;
  onInvite: () => Promise<string>;
  onAccept: (code: string) => Promise<void>;
  onJoin: (invite: string) => Promise<string>;
  onStop: () => void;
  getWorkDiff: () => SceneDiff;
  getCommits: (branch?: string) => CollabCommit[];
  getBranches: () => CollabBranch[];
  onCommit: (message: string) => void;
  onCheckout: (id: string) => void;
  onShare: (id: string) => void;
  onDiffCommits: (a: string, b: string) => SceneDiff | null;
  onCreateBranch: (name: string) => void;
  onSwitchBranch: (name: string) => void;
  onPrepareMerge: (headId: string) => { conflicts: MergeConflict[]; autoApplied: number };
  getConflicts: () => MergeConflict[];
  onResolveMerge: (res: ('ours' | 'theirs')[]) => boolean;
  onDiscardMerge: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const CollabModal: React.FC<CollabModalProps> = (props) => {
  const { isOpen, onClose } = props;
  const [tab, setTab] = useState<'session' | 'changes' | 'history' | 'branches'>('session');
  const [invite, setInvite] = useState('');
  const [answer, setAnswer] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [workDiff, setWorkDiff] = useState<SceneDiff | null>(null);
  const [selCommit, setSelCommit] = useState<string | null>(null);
  const [cmpA, setCmpA] = useState('');
  const [cmpDiff, setCmpDiff] = useState<SceneDiff | null>(null);
  const [newBranch, setNewBranch] = useState('');
  const [mergeHead, setMergeHead] = useState('');
  const [mergeInfo, setMergeInfo] = useState<{ conflicts: MergeConflict[]; autoApplied: number } | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, 'ours' | 'theirs'>>({});

  useEffect(() => {
    if (isOpen) {
      setInvite('');
      setAnswer('');
      setWorkDiff(null);
      setCmpDiff(null);
      setMergeInfo(null);
    }
  }, [isOpen]);

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

  const commits = props.getCommits();
  const branches = props.getBranches();

  return (
    // Docké à droite, sans voile ni flou : le viewport reste visible et cliquable.
    <div className="fixed top-14 bottom-0 right-0 z-[90] flex p-3 pointer-events-none select-none">
      <div className="pointer-events-auto w-[min(680px,94vw)] h-full overflow-y-auto rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
            <GitBranch className="w-4 h-4 text-violet-400" />
            <span>Collaboration temps réel (CRDT)</span>
            {props.stats.active && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                {props.stats.role.toUpperCase()} · {props.stats.peers} pair(s)
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 flex items-center gap-1.5">
          {(['session', 'changes', 'history', 'branches'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${tab === t ? 'bg-violet-500/20 text-violet-100 border border-violet-500/40' : 'text-zinc-500 hover:text-zinc-200 border border-transparent'}`}
            >
              {t === 'session' ? <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Session</span>
                : t === 'changes' ? <span className="flex items-center gap-1"><Diff className="w-3 h-3" /> Modifs</span>
                : t === 'history' ? <span className="flex items-center gap-1"><History className="w-3 h-3" /> Historique</span>
                : <span className="flex items-center gap-1"><GitMerge className="w-3 h-3" /> Branches</span>}
            </button>
          ))}
        </div>

        <div className="p-4 flex flex-col gap-3 text-xs">
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 px-3 py-2 text-[11px]">
              {error}
            </div>
          )}

          {tab === 'session' && (
            <SessionTab
              {...props}
              invite={invite} setInvite={setInvite}
              answer={answer} setAnswer={setAnswer}
              joinCode={joinCode} setJoinCode={setJoinCode}
              busy={busy} run={run} copied={copied} setCopied={setCopied}
            />
          )}

          {tab === 'changes' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      setWorkDiff(props.getWorkDiff());
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Échec.');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-[11px] font-semibold text-zinc-200 hover:border-violet-500/40"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Comparer au dernier commit
                </button>
                <span className="text-[10px] font-mono text-zinc-500">horloge lamport : {props.stats.lamport}</span>
              </div>
              {workDiff ? <DiffView diff={workDiff} /> : (
                <div className="text-[11px] text-zinc-600">Aucune comparaison — lancez la comparaison pour voir les modifications non committées.</div>
              )}
              <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-2.5">
                <div className="text-[11px] font-semibold text-zinc-300 mb-1.5">Présence ({props.peers.length})</div>
                {props.peers.length === 0 && <div className="text-[11px] text-zinc-600">Personne d’autre pour l’instant.</div>}
                {props.peers.map((p) => (
                  <div key={p.actor} className="flex items-center gap-2 py-1 border-t border-zinc-800/60 first:border-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-[11px] text-zinc-200">{p.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono truncate">
                      {p.selectedName ? `→ ${p.selectedName}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5">
                <input
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="Message de commit…"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    props.onCommit(commitMsg);
                    setCommitMsg('');
                    setSelCommit(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold hover:bg-emerald-500/25"
                >
                  Commiter
                </button>
              </div>
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                {commits.length === 0 && <div className="text-[11px] text-zinc-600">Aucun commit sur {props.stats.branch}.</div>}
                {commits.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelCommit(selCommit === c.id ? null : c.id);
                      setCmpA('');
                      setCmpDiff(null);
                    }}
                    className={`rounded-xl border p-2 cursor-pointer ${selCommit === c.id ? 'bg-violet-500/10 border-violet-500/40' : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-zinc-100 truncate">{c.message}</span>
                      <span className="text-[9px] font-mono text-zinc-500 shrink-0">{c.id.slice(0, 8)} · {new Date(c.at).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">{c.actor} · {c.parents.length > 1 ? `merge (${c.parents.length} parents)` : c.branch}</div>
                    {selCommit === c.id && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => props.onCheckout(c.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-200 hover:border-amber-500/40">
                          <RotateCcw className="w-3 h-3" /> Restaurer
                        </button>
                        <button type="button" onClick={() => props.onShare(c.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-200 hover:border-sky-500/40">
                          <Share2 className="w-3 h-3" /> Partager
                        </button>
                        <select
                          value={cmpA}
                          onChange={(e) => {
                            setCmpA(e.target.value);
                            if (e.target.value) {
                              const d = props.onDiffCommits(e.target.value, c.id);
                              setCmpDiff(d);
                            } else setCmpDiff(null);
                          }}
                          className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 outline-none"
                        >
                          <option value="">Comparer avec…</option>
                          {commits.filter((x) => x.id !== c.id).map((x) => (
                            <option key={x.id} value={x.id}>{x.message.slice(0, 24)} ({x.id.slice(0, 6)})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {cmpDiff && <DiffView diff={cmpDiff} />}
            </div>
          )}

          {tab === 'branches' && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5">
                <input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="Nom de branche…"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newBranch.trim()) {
                      props.onCreateBranch(newBranch.trim());
                      setNewBranch('');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 text-[11px] font-semibold"
                >
                  <Plus className="w-3 h-3 inline mr-1" /> Créer
                </button>
              </div>
              {branches.map((b) => (
                <BranchRow
                  key={b.name}
                  branch={b}
                  current={props.stats.branch}
                  commits={props.getCommits(b.name)}
                  onSwitch={() => props.onSwitchBranch(b.name)}
                  mergeHead={mergeHead}
                  setMergeHead={setMergeHead}
                  onPrepareMerge={props.onPrepareMerge}
                  setMergeInfo={setMergeInfo}
                  setResolutions={setResolutions}
                  setError={setError}
                />
              ))}
              {mergeInfo && (
                <MergePanel
                  info={mergeInfo}
                  resolutions={resolutions}
                  setResolutions={setResolutions}
                  onResolve={props.onResolveMerge}
                  onDiscard={props.onDiscardMerge}
                  done={() => setMergeInfo(null)}
                />
              )}
            </div>
          )}

          {props.log.length > 0 && (
            <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-2">
              <div className="text-[10px] font-semibold text-zinc-500 mb-1">Journal</div>
              <div className="flex flex-col gap-0.5 max-h-24 overflow-y-auto font-mono text-[10px] text-zinc-400">
                {props.log.slice(-10).map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function SessionTab(props: CollabModalProps & {
  invite: string; setInvite: (s: string) => void;
  answer: string; setAnswer: (s: string) => void;
  joinCode: string; setJoinCode: (s: string) => void;
  busy: string; run: (label: string, fn: () => Promise<void>) => Promise<void>;
  copied: boolean; setCopied: (b: boolean) => void;
}): React.ReactElement {
  const copy = async (text: string): Promise<void> => {
    if (await copyText(text)) {
      props.setCopied(true);
      window.setTimeout(() => props.setCopied(false), 1200);
    }
  };
  if (!props.stats.active) {
    return (
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-zinc-400 text-[11px]">
          <span className="shrink-0">Pseudo</span>
          <input
            value={props.userName}
            onChange={(e) => props.onUserNameChange(e.target.value.slice(0, 24))}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 outline-none"
          />
        </label>
        <button
          type="button" disabled={props.busy !== ''}
          onClick={() => void props.run('host', async () => {
            props.onStart();
            props.setInvite(await props.onInvite());
            props.setAnswer('');
          })}
          className="px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 font-semibold hover:bg-violet-500/25 disabled:opacity-40"
        >
          {props.busy === 'host' ? '…' : 'Héberger une session'}
        </button>
        {props.invite !== '' && (
          <>
            <label className="text-zinc-400 text-[11px]">Invitation (à envoyer) :</label>
            <div className="flex gap-1.5">
              <textarea readOnly value={props.invite} rows={2} className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
              <button type="button" onClick={() => void copy(props.invite)} className="px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300" title="Copier">
                {props.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <label className="text-zinc-400 text-[11px]">Réponse du pair :</label>
            <textarea value={props.answer} onChange={(e) => props.setAnswer(e.target.value)} rows={2} placeholder="Code de réponse…" className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-100 outline-none resize-none placeholder:text-zinc-600" />
            <button
              type="button" disabled={props.busy !== '' || !props.answer.trim()}
              onClick={() => void props.run('accept', async () => {
                await props.onAccept(props.answer.trim());
                props.setAnswer('');
              })}
              className="px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-200 font-semibold disabled:opacity-40"
            >
              {props.busy === 'accept' ? '…' : 'Accepter'}
            </button>
          </>
        )}
        <div className="pt-1 border-t border-zinc-800/80" />
        <textarea value={props.joinCode} onChange={(e) => props.setJoinCode(e.target.value)} rows={2} placeholder="Code d’invitation à rejoindre…" className="w-full px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-100 outline-none resize-none placeholder:text-zinc-600" />
          <button
            type="button" disabled={props.busy !== '' || !props.joinCode.trim()}
            onClick={() => void props.run('join', async () => {
              props.setInvite(await props.onJoin(props.joinCode.trim()));
            })}
            className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 font-semibold hover:bg-emerald-500/25 disabled:opacity-40"
          >
            {props.busy === 'join' ? '…' : 'Rejoindre'}
          </button>
        {props.invite !== '' && (
          <>
            <label className="text-zinc-400 text-[11px]">Votre réponse (à renvoyer à l’hôte) :</label>
            <div className="flex gap-1.5">
              <textarea readOnly value={props.invite} rows={2} className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
              <button type="button" onClick={() => void copy(props.invite)} className="px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300" title="Copier">
                {props.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
        <div className="text-[10px] text-zinc-600">Chargez la même scène des deux côtés. Les modifications (ajout, suppression, transform, matériau, logique…) convergent en LWW.</div>
      </div>
    );
  }
  if (props.stats.role === 'client') {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[11px] text-zinc-300">
          Connecté en tant que <span className="font-mono text-emerald-300">{props.userName}</span> · {props.stats.peers} pair(s) visible(s)
        </div>
        {props.invite !== '' && (
          <>
            <label className="text-zinc-400 text-[11px]">Votre réponse (à renvoyer à l’hôte si ce n’est pas fait) :</label>
            <div className="flex gap-1.5">
              <textarea readOnly value={props.invite} rows={2} className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
              <button type="button" onClick={() => void copy(props.invite)} className="px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300" title="Copier">
                {props.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
        <button
          type="button" onClick={props.onStop}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 font-semibold hover:bg-rose-500/20"
        >
          <LogOut className="w-3.5 h-3.5" /> Quitter la session
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-zinc-300">
        Session active — <span className="font-mono">{props.stats.role}</span> · {props.stats.peers} pair(s) · {props.peers.map((p) => p.name).join(', ') || 'seul'}
      </div>
      <button
        type="button" disabled={props.busy !== ''}
        onClick={() => void props.run('invite2', async () => {
          props.setInvite(await props.onInvite());
          props.setAnswer('');
        })}
        className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200 disabled:opacity-40"
      >
        {props.busy === 'invite2' ? '…' : '+ Inviter'}
      </button>
      {props.invite !== '' && (
        <>
          <div className="flex gap-1.5">
            <textarea readOnly value={props.invite} rows={2} className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-300 outline-none resize-none" />
            <button type="button" onClick={() => void copy(props.invite)} className="px-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200" title="Copier">
              {props.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <textarea value={props.answer} onChange={(e) => props.setAnswer(e.target.value)} rows={2} placeholder="Réponse…" className="w-full px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-zinc-100 outline-none resize-none placeholder:text-zinc-600" />
          <button
            type="button" disabled={props.busy !== '' || !props.answer.trim()}
            onClick={() => void props.run('accept2', async () => {
              await props.onAccept(props.answer.trim());
              props.setAnswer('');
            })}
            className="px-2 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-200 text-[11px] font-semibold disabled:opacity-40"
          >
            Accepter
          </button>
        </>
      )}
      <button
        type="button" onClick={props.onStop}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 font-semibold hover:bg-rose-500/20"
      >
        <LogOut className="w-3.5 h-3.5" /> Quitter la session
      </button>
    </div>
  );
}

function DiffView({ diff }: { diff: SceneDiff }): React.ReactElement {
  if (diff.totalChanges === 0) {
    return <div className="text-[11px] text-emerald-400">Aucun changement — synchronisé.</div>;
  }
  return (
    <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
      {diff.settingsChanged && (
        <div className="text-[10px] font-mono text-sky-300">~ réglages scène (atmosphère, post, terrain…)</div>
      )}
      {diff.added.map((d) => (
        <div key={d.key} className="text-[11px] font-mono rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 text-emerald-200">
          + {d.name}
        </div>
      ))}
      {diff.removed.map((d) => (
        <div key={d.key} className="text-[11px] font-mono rounded-lg bg-rose-500/10 border border-rose-500/30 px-2 py-1 text-rose-200">
          − {d.name}
        </div>
      ))}
      {diff.modified.map((d) => (
        <div key={d.key} className="text-[11px] font-mono rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-amber-200">
          ~ {d.name} <span className="text-amber-200/70">[{d.fields.join(', ')}]</span>
        </div>
      ))}
    </div>
  );
}

function BranchRow(props: {
  branch: { name: string; head: string | null };
  current: string;
  commits: CollabCommit[];
  onSwitch: () => void;
  mergeHead: string;
  setMergeHead: (s: string) => void;
  onPrepareMerge: (headId: string) => { conflicts: import('../lib/collab/types').MergeConflict[]; autoApplied: number };
  setMergeInfo: (v: { conflicts: import('../lib/collab/types').MergeConflict[]; autoApplied: number } | null) => void;
  setResolutions: (r: Record<number, 'ours' | 'theirs'>) => void;
  setError: (s: string) => void;
}): React.ReactElement {
  const head = props.commits[0]?.id ?? props.branch.head;
  return (
    <div className={`rounded-xl border p-2 ${props.current === props.branch.name ? 'bg-violet-500/10 border-violet-500/40' : 'bg-zinc-900/60 border-zinc-800/80'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-zinc-100 font-mono">
          {props.branch.name} {props.current === props.branch.name && <span className="text-violet-300">(courante)</span>}
        </span>
        <span className="text-[10px] font-mono text-zinc-500">{props.commits.length} commit(s)</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {props.current !== props.branch.name && (
          <button type="button" onClick={props.onSwitch} className="px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-200">
            Basculer
          </button>
        )}
        {props.current !== props.branch.name && head && (
          <button
            type="button"
            onClick={() => {
              try {
                const info = props.onPrepareMerge(head);
                props.setMergeInfo(info);
                props.setResolutions({});
              } catch (e) {
                props.setError(e instanceof Error ? e.message : 'Merge impossible.');
              }
            }}
            className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-[10px] font-semibold"
          >
            <GitMerge className="w-3 h-3 inline mr-1" /> Merger {props.branch.name} → {props.current}
          </button>
        )}
      </div>
    </div>
  );
}

function MergePanel(props: {
  info: { conflicts: MergeConflict[]; autoApplied: number };
  resolutions: Record<number, 'ours' | 'theirs'>;
  setResolutions: (r: Record<number, 'ours' | 'theirs'>) => void;
  onResolve: (res: ('ours' | 'theirs')[]) => boolean;
  onDiscard: () => void;
  done: () => void;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5">
      <div className="text-[11px] font-semibold text-amber-200 mb-1">
        Merge : {props.info.autoApplied} appliqué(s) auto, {props.info.conflicts.length} conflit(s)
      </div>
      {props.info.conflicts.map((c, i) => (
        <div key={i} className="rounded-lg bg-zinc-950 border border-zinc-800 p-1.5 mb-1.5">
          <div className="text-[11px] font-mono text-zinc-200">{c.name} · <span className="text-amber-300">{c.field}</span></div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {(['ours', 'theirs'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => props.setResolutions({ ...props.resolutions, [i]: side })}
                className={`px-2 py-1 rounded-lg text-[10px] font-mono border text-left break-all ${props.resolutions[i] === side ? 'bg-violet-500/20 border-violet-500/50 text-violet-100' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
              >
                <div className="font-semibold mb-0.5">{side === 'ours' ? 'Moi' : 'Eux'}</div>
                <div className="max-h-16 overflow-y-auto">{JSON.stringify(side === 'ours' ? c.ours : c.theirs)?.slice(0, 300)}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-1.5 mt-1">
        <button
          type="button"
          onClick={() => {
            const res = props.info.conflicts.map((_, i) => props.resolutions[i] ?? 'ours' as const);
            if (props.onResolve(res)) props.done();
          }}
          className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold"
        >
          Appliquer le merge
        </button>
        <button
          type="button"
          onClick={() => {
            props.onDiscard();
            props.done();
          }}
          className="px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
