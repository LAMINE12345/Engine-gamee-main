'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Drama, Play, Plus, Trash2, Save, Zap, Flag, Layers, Gauge } from 'lucide-react';
import { confirmBox } from '../lib/ui/overlays';
import type {
  AnimatorControllerData,
  AnimState,
  AnimTransition,
  AnimEvent,
  AnimParam,
} from '../types/animation';

export interface AnimatorCandidate {
  uuid: string;
  name: string;
  clips: string[];
  tracks: { id: string; name: string }[];
  hasAnimator: boolean;
}

export interface AnimatorInfo {
  current: string | null;
  normTime: number;
  blending: boolean;
  speed: number;
  turnRate: number;
}

interface AnimatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: AnimatorCandidate[];
  selectedUuid: string | null;
  onSelectObject: (uuid: string) => void;
  controller: AnimatorControllerData | null;
  onCreateController: (uuid: string) => void;
  onSaveController: (uuid: string, data: AnimatorControllerData) => void;
  onDeleteController: (uuid: string) => void;
  onPreviewState: (uuid: string, state: string) => void;
  onSetParam: (uuid: string, name: string, value: number | boolean) => void;
  onTrigger: (uuid: string, name: string) => void;
  getInfo: (uuid: string) => AnimatorInfo | null;
}

const uid = (p: string): string => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

const inputCls =
  'px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-[11px] outline-none focus:border-violet-500/50 min-w-0';
const btnCls =
  'px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-40';

export const AnimatorModal: React.FC<AnimatorModalProps> = ({
  isOpen,
  onClose,
  candidates,
  selectedUuid,
  onSelectObject,
  controller,
  onCreateController,
  onSaveController,
  onDeleteController,
  onPreviewState,
  onSetParam,
  onTrigger,
  getInfo,
}) => {
  const [draft, setDraft] = useState<AnimatorControllerData | null>(null);
  const [selState, setSelState] = useState<string | null>(null);
  const [info, setInfo] = useState<AnimatorInfo | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(controller ? JSON.parse(JSON.stringify(controller)) : null);
    setSelState(null);
    setDirty(false);
  }, [isOpen, controller, selectedUuid]);

  useEffect(() => {
    if (!isOpen || !selectedUuid) return;
    const refresh = (): void => {
      try {
        setInfo(getInfo(selectedUuid));
      } catch {
        /* ignore */
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedUuid]);

  const candidate = useMemo(
    () => candidates.find((c) => c.uuid === selectedUuid) ?? null,
    [candidates, selectedUuid]
  );

  if (!isOpen) return null;

  const patch = (fn: (d: AnimatorControllerData) => void): void => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as AnimatorControllerData;
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const sel = draft?.states.find((s) => s.name === selState) ?? null;

  const addState = (kind: 'clip' | 'track', ref: string): void => {
    if (!ref) return;
    const base = ref.replace(/^track:/, '');
    const name = `${base}_${(draft?.states.length ?? 0) + 1}`;
    const st: AnimState = {
      name,
      source: kind === 'clip' ? { kind: 'clip', clip: ref } : { kind: 'track', trackId: ref },
      speed: 1,
      loop: true,
      locomotion: false,
      transitions: [],
      events: [],
    };
    patch((d) => {
      d.states.push(st);
    });
    setSelState(name);
  };

  return (
    // Docké à droite, sans voile ni flou : le viewport reste visible et cliquable.
    <div className="fixed top-14 bottom-0 right-0 z-[90] flex p-3 pointer-events-none select-none">
      <div className="pointer-events-auto w-[min(680px,94vw)] h-full overflow-y-auto rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl animate-in fade-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
            <Drama className="w-4 h-4 text-violet-400" />
            <span>Animator Controller (4.2)</span>
            {dirty && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300">
                MODIFIÉ
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 text-xs">
          {/* Objet */}
          <label className="flex items-center gap-2 text-zinc-400">
            <span className="shrink-0">Objet</span>
            <select
              value={selectedUuid ?? ''}
              onChange={(e) => onSelectObject(e.target.value)}
              className={`${inputCls} flex-1`}
            >
              <option value="">— Choisir (modèle riggé ou objet tracké) —</option>
              {candidates.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.name} — {c.clips.length} clip(s), {c.tracks.length} track(s){c.hasAnimator ? ' ★' : ''}
                </option>
              ))}
            </select>
          </label>

          {selectedUuid && !draft && (
            <button
              type="button"
              onClick={() => onCreateController(selectedUuid)}
              className={`${btnCls} bg-violet-500/15 border-violet-500/40 text-violet-200 hover:bg-violet-500/25 py-2`}
            >
              <Plus className="w-3.5 h-3.5 inline mr-1" />
              Créer un Animator (états générés depuis les clips)
            </button>
          )}

          {selectedUuid && draft && candidate && (
            <>
              {/* Runtime */}
              <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 px-3 py-2 flex items-center gap-3">
                <span className="text-zinc-500">État :</span>
                <span className="font-mono text-violet-300">{info?.current ?? '—'}</span>
                <div className="flex-1 h-1.5 rounded bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-[width]"
                    style={{ width: `${Math.round((info?.normTime ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-zinc-500">
                  {info ? `${info.speed.toFixed(1)} m/s` : ''}
                </span>
              </div>

              {/* États */}
              <section className="rounded-xl bg-zinc-900/50 border border-zinc-800/70 p-2.5">
                <div className="font-semibold text-zinc-300 mb-1.5">États ({draft.states.length})</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {draft.states.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => {
                        setSelState(s.name);
                        onPreviewState(selectedUuid, s.name);
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-mono border ${selState === s.name ? 'bg-violet-500/20 border-violet-500/50 text-violet-100' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                      title="Sélectionner + prévisualiser"
                    >
                      <Play className="w-3 h-3 inline mr-1" />
                      {s.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {candidate.clips.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) addState('clip', e.target.value);
                        e.target.value = '';
                      }}
                      className={inputCls}
                    >
                      <option value="">+ État depuis clip…</option>
                      {candidate.clips.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                  {candidate.tracks.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) addState('track', e.target.value);
                        e.target.value = '';
                      }}
                      className={inputCls}
                    >
                      <option value="">+ État depuis track…</option>
                      {candidate.tracks.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {sel && (
                  <div className="mt-2 rounded-lg bg-zinc-950 border border-zinc-800 p-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={sel.name}
                        onChange={(e) => {
                          const next = e.target.value;
                          patch((d) => {
                            const s = d.states.find((x) => x.name === sel.name);
                            if (s) {
                              // Re-câble les références vers l'ancien nom.
                              for (const o of d.states) {
                                for (const t of o.transitions) {
                                  if (t.to === sel.name) t.to = next;
                                }
                              }
                              if (d.entryState === sel.name) d.entryState = next;
                              for (const l of d.layers) {
                                if (l.state === sel.name) l.state = next;
                              }
                              s.name = next;
                            }
                          });
                          setSelState(next);
                        }}
                        className={`${inputCls} flex-1 font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          patch((d) => {
                            d.states = d.states.filter((x) => x.name !== sel.name);
                            for (const o of d.states) o.transitions = o.transitions.filter((t) => t.to !== sel.name);
                          });
                          setSelState(null);
                        }}
                        className={`${btnCls} bg-rose-500/10 border-rose-500/30 text-rose-300`}
                        title="Supprimer l'état"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500">
                      {sel.source.kind === 'clip' ? `clip: ${sel.source.clip}` : `track: ${sel.source.trackId}`}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                        Vitesse
                        <input
                          type="number" step={0.1} value={sel.speed}
                          onChange={(e) => patch((d) => {
                            const s = d.states.find((x) => x.name === sel.name);
                            if (s) s.speed = Number(e.target.value) || 1;
                          })}
                          className={`${inputCls} w-16`}
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                        <input
                          type="checkbox" checked={sel.loop}
                          onChange={(e) => patch((d) => {
                            const s = d.states.find((x) => x.name === sel.name);
                            if (s) s.loop = e.target.checked;
                          })}
                          className="accent-violet-500"
                        />
                        Boucle
                      </label>
                      <label className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                        <input
                          type="checkbox" checked={sel.locomotion === true}
                          onChange={(e) => patch((d) => {
                            const s = d.states.find((x) => x.name === sel.name);
                            if (s) s.locomotion = e.target.checked;
                          })}
                          className="accent-violet-500"
                        />
                        Locomotion (motion matching)
                      </label>
                      <button
                        type="button"
                        onClick={() => patch((d) => { d.entryState = sel.name; })}
                        className={`${btnCls} ${draft.entryState === sel.name ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
                      >
                        {draft.entryState === sel.name ? '★ État initial' : 'Définir initial'}
                      </button>
                    </div>
                    {sel.locomotion === true && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          Vit. cible (m/s)
                          <input
                            type="number" step={0.5} value={sel.targetSpeed ?? 0}
                            onChange={(e) => patch((d) => {
                              const s = d.states.find((x) => x.name === sel.name);
                              if (s) s.targetSpeed = Number(e.target.value) || 0;
                            })}
                            className={`${inputCls} w-16`}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                          Virage cible (rad/s)
                          <input
                            type="number" step={0.5} value={sel.targetTurn ?? 0}
                            onChange={(e) => patch((d) => {
                              const s = d.states.find((x) => x.name === sel.name);
                              if (s) s.targetTurn = Number(e.target.value) || 0;
                            })}
                            className={`${inputCls} w-16`}
                          />
                        </label>
                      </div>
                    )}

                    {/* Transitions */}
                    <div className="mt-1">
                      <div className="text-zinc-400 font-semibold mb-1">Transitions ({sel.transitions.length})</div>
                      {sel.transitions.map((tr) => (
                        <TransitionEditor
                          key={tr.id}
                          tr={tr}
                          states={draft.states.map((s) => s.name)}
                          params={draft.params}
                          onChange={(next: AnimTransition) =>
                            patch((d) => {
                              const s = d.states.find((x) => x.name === sel.name);
                              if (!s) return;
                              const i = s.transitions.findIndex((t) => t.id === tr.id);
                              if (i >= 0) s.transitions[i] = next;
                            })
                          }
                          onDelete={() =>
                            patch((d) => {
                              const s = d.states.find((x) => x.name === sel.name);
                              if (s) s.transitions = s.transitions.filter((t) => t.id !== tr.id);
                            })
                          }
                        />
                      ))}
                      <button
                        type="button"
                        disabled={draft.states.length < 2}
                        onClick={() => {
                          const to = draft.states.find((s) => s.name !== sel.name)?.name;
                          if (!to) return;
                          patch((d) => {
                            const s = d.states.find((x) => x.name === sel.name);
                            s?.transitions.push({ id: uid('tr'), to, conditions: [], duration: 0.25 });
                          });
                        }}
                        className={`${btnCls} bg-zinc-900 border-zinc-800 text-zinc-300 disabled:opacity-40`}
                      >
                        + Transition
                      </button>
                    </div>

                    {/* Events */}
                    <div className="mt-1">
                      <div className="text-zinc-400 font-semibold mb-1 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" /> Events ({sel.events.length})
                      </div>
                      {sel.events.map((ev) => (
                        <div key={ev.id} className="flex items-center gap-1.5 mb-1">
                          <input
                            type="number" min={0} max={1} step={0.01} value={ev.time}
                            onChange={(e) => patch((d) => {
                              const sEv = d.states.find((x) => x.name === sel.name)?.events.find((x) => x.id === ev.id);
                              if (sEv) sEv.time = Math.max(0, Math.min(1, Number(e.target.value) || 0));
                            })}
                            className={`${inputCls} w-16 font-mono`}
                            title="Temps normalisé 0-1"
                          />
                          <select
                            value={ev.kind}
                            onChange={(e) => patch((d) => {
                              const sEv = d.states.find((x) => x.name === sel.name)?.events.find((x) => x.id === ev.id);
                              if (sEv) sEv.kind = e.target.value as AnimEvent['kind'];
                            })}
                            className={inputCls}
                          >
                            <option value="sound">son</option>
                            <option value="emitter">particules</option>
                            <option value="flag">flag</option>
                            <option value="log">log</option>
                          </select>
                          <input
                            value={ev.name}
                            onChange={(e) => patch((d) => {
                              const sEv = d.states.find((x) => x.name === sel.name)?.events.find((x) => x.id === ev.id);
                              if (sEv) sEv.name = e.target.value;
                            })}
                            placeholder="nom"
                            className={`${inputCls} flex-1`}
                          />
                          <input
                            value={ev.value}
                            onChange={(e) => patch((d) => {
                              const sEv = d.states.find((x) => x.name === sel.name)?.events.find((x) => x.id === ev.id);
                              if (sEv) sEv.value = e.target.value;
                            })}
                            placeholder={ev.kind === 'sound' ? 'footstep' : ev.kind === 'flag' ? 'attacking=true' : 'valeur'}
                            className={`${inputCls} flex-1 font-mono`}
                          />
                          <button
                            type="button"
                            onClick={() => patch((d) => {
                              const s = d.states.find((x) => x.name === sel.name);
                              if (s) s.events = s.events.filter((x) => x.id !== ev.id);
                            })}
                            className="p-1 rounded text-zinc-600 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => patch((d) => {
                          const s = d.states.find((x) => x.name === sel.name);
                          s?.events.push({ id: uid('ev'), time: 0.5, name: 'footstep', kind: 'sound', value: 'footstep' });
                        })}
                        className={`${btnCls} bg-zinc-900 border-zinc-800 text-zinc-300`}
                      >
                        + Event
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Paramètres */}
              <section className="rounded-xl bg-zinc-900/50 border border-zinc-800/70 p-2.5">
                <div className="font-semibold text-zinc-300 mb-1.5">Paramètres</div>
                {draft.params.map((p) => (
                  <ParamRow
                    key={p.name}
                    param={p}
                    onRename={(name: string) =>
                      patch((d) => {
                        const q = d.params.find((x) => x.name === p.name);
                        if (q) q.name = name;
                      })
                    }
                    onDelete={() =>
                      patch((d) => {
                        d.params = d.params.filter((x) => x.name !== p.name);
                      })
                    }
                    onTest={(v: number | boolean) => onSetParam(selectedUuid, p.name, v)}
                    onFire={() => onTrigger(selectedUuid, p.name)}
                  />
                ))}
                <AddParamRow
                  onAdd={(param: AnimParam) =>
                    patch((d) => {
                      if (!d.params.some((x) => x.name === param.name)) d.params.push(param);
                    })
                  }
                />
              </section>

              {/* Couches */}
              <section className="rounded-xl bg-zinc-900/50 border border-zinc-800/70 p-2.5">
                <div className="font-semibold text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-sky-400" /> Couches ({draft.layers.length})
                </div>
                {draft.layers.map((l, i) => (
                  <div key={i} className="flex items-center gap-1.5 mb-1">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${l.mode === 'additive' ? 'bg-sky-500/10 text-sky-300' : 'bg-zinc-800 text-zinc-400'}`}>
                      {l.mode === 'additive' ? 'ADD' : 'BASE'}
                    </span>
                    <input
                      value={l.name}
                      onChange={(e) => patch((d) => { d.layers[i].name = e.target.value; })}
                      className={`${inputCls} w-24`}
                    />
                    {l.mode === 'additive' && (
                      <select
                        value={l.state ?? ''}
                        onChange={(e) => patch((d) => { d.layers[i].state = e.target.value || undefined; })}
                        className={`${inputCls} flex-1`}
                      >
                        <option value="">— suit la base —</option>
                        {draft.states.map((s) => (
                          <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    <input
                      type="range" min={0} max={1} step={0.05} value={l.weight}
                      onChange={(e) => patch((d) => { d.layers[i].weight = Number(e.target.value); })}
                      className="flex-1 accent-sky-500"
                      title={`Poids ${l.weight.toFixed(2)}`}
                    />
                    <span className="font-mono text-[10px] text-zinc-500 w-8">{l.weight.toFixed(2)}</span>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => patch((d) => { d.layers.splice(i, 1); })}
                        className="p-1 rounded text-zinc-600 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => patch((d) => { d.layers.push({ name: `Overlay ${d.layers.length}`, mode: 'additive', weight: 0.6 }); })}
                  className={`${btnCls} bg-zinc-900 border-zinc-800 text-zinc-300`}
                >
                  + Couche additive (overlay blessure, visée…)
                </button>
              </section>

              {/* Motion matching */}
              <section className="rounded-xl bg-zinc-900/50 border border-zinc-800/70 p-2.5">
                <div className="font-semibold text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-emerald-400" /> Motion Matching
                </div>
                <label className="flex items-center gap-2 text-[11px] text-zinc-400 mb-1.5">
                  <input
                    type="checkbox"
                    checked={draft.motionMatching.enabled}
                    onChange={(e) => patch((d) => { d.motionMatching.enabled = e.target.checked; })}
                    className="accent-emerald-500"
                  />
                  Sélection auto du meilleur état locomotion (vitesse + virage)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['interval', 'Intervalle (s)', 0.05],
                      ['dwellTime', 'Maintien (s)', 0.1],
                      ['margin', 'Marge', 0.05],
                      ['speedWeight', 'Poids vitesse', 0.1],
                      ['turnWeight', 'Poids virage', 0.1],
                    ] as const
                  ).map(([key, label, step]) => (
                    <label key={key} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                      {label}
                      <input
                        type="number" step={step}
                        value={draft.motionMatching[key]}
                        onChange={(e) => patch((d) => {
                          (d.motionMatching[key] as number) = Math.max(0, Number(e.target.value) || 0);
                        })}
                        className={`${inputCls} w-16 font-mono`}
                      />
                    </label>
                  ))}
                </div>
                <div className="text-[10px] text-zinc-600 mt-1">
                  Taguez ≥2 états « Locomotion » avec vitesses cibles (ex. idle 0, walk 2.8, run 6.5).
                </div>
              </section>

              {/* Actions */}
              <div className="flex gap-1.5 sticky bottom-0 bg-zinc-950 py-1">
                <button
                  type="button"
                  disabled={!dirty}
                  onClick={() => {
                    if (draft) {
                      onSaveController(selectedUuid, draft);
                      setDirty(false);
                    }
                  }}
                  className={`${btnCls} flex-1 py-2 bg-emerald-500/15 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40`}
                >
                  <Save className="w-3.5 h-3.5 inline mr-1" /> Appliquer
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirmBox('Supprimer cet Animator ?', {
                      title: 'Supprimer l’Animator',
                      okLabel: 'Supprimer',
                    });
                    if (ok) onDeleteController(selectedUuid);
                  }}
                  className={`${btnCls} py-2 bg-rose-500/10 border-rose-500/30 text-rose-300`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function TransitionEditor({
  tr,
  states,
  params,
  onChange,
  onDelete,
}: {
  tr: AnimTransition;
  states: string[];
  params: AnimParam[];
  onChange: (t: AnimTransition) => void;
  onDelete: () => void;
}): React.ReactElement {
  const set = (patchT: Partial<AnimTransition>): void => onChange({ ...tr, ...patchT });
  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-1.5 mb-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-zinc-500 text-[10px]">→</span>
        <select value={tr.to} onChange={(e) => set({ to: e.target.value })} className={`${inputCls} flex-1 font-mono`}>
          {states.filter((s) => s !== undefined).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[10px] text-zinc-500">
          fondu
          <input
            type="number" min={0} max={2} step={0.05} value={tr.duration}
            onChange={(e) => set({ duration: Math.max(0, Number(e.target.value) || 0) })}
            className={`${inputCls} w-14 font-mono`}
          />s
        </label>
        <button type="button" onClick={onDelete} className="p-1 rounded text-zinc-600 hover:text-rose-400">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {tr.conditions.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5 mt-1">
          <select
            value={c.param}
            onChange={(e) => {
              const next = tr.conditions.slice();
              next[i] = { ...c, param: e.target.value };
              set({ conditions: next });
            }}
            className={`${inputCls} flex-1 font-mono`}
          >
            <option value="">— param —</option>
            {params.map((p) => (
              <option key={p.name} value={p.name}>{p.name} ({p.type})</option>
            ))}
          </select>
          <select
            value={c.op}
            onChange={(e) => {
              const next = tr.conditions.slice();
              next[i] = { ...c, op: e.target.value as AnimTransition['conditions'][number]['op'] };
              set({ conditions: next });
            }}
            className={inputCls}
          >
            {['>', '<', '>=', '<=', '==', '!='].map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
          <input
            value={String(c.value)}
            onChange={(e) => {
              const raw = e.target.value;
              const next = tr.conditions.slice();
              next[i] = { ...c, value: raw === 'true' ? true : raw === 'false' ? false : Number(raw) || 0 };
              set({ conditions: next });
            }}
            className={`${inputCls} w-16 font-mono`}
          />
          <button
            type="button"
            onClick={() => set({ conditions: tr.conditions.filter((_, j) => j !== i) })}
            className="p-1 rounded text-zinc-600 hover:text-rose-400"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5 mt-1">
        <button
          type="button"
          onClick={() => set({ conditions: [...tr.conditions, { param: params[0]?.name ?? 'speed', op: '>', value: 0.5 }] })}
          className="text-[10px] text-sky-400 hover:text-sky-300"
        >
          + condition
        </button>
        <label className="flex items-center gap-1 text-[10px] text-zinc-500 ml-auto">
          exit
          <input
            type="number" min={0} max={1} step={0.05}
            value={tr.exitTime ?? 0}
            onChange={(e) => set({ exitTime: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })}
            className={`${inputCls} w-14 font-mono`}
          />
        </label>
      </div>
    </div>
  );
}

function ParamRow({
  param,
  onRename,
  onDelete,
  onTest,
  onFire,
}: {
  param: AnimParam;
  onRename: (name: string) => void;
  onDelete: () => void;
  onTest: (v: number | boolean) => void;
  onFire: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-[9px] font-mono px-1 rounded bg-zinc-800 text-zinc-500 w-12 text-center shrink-0">
        {param.type === 'trigger' ? 'TRIG' : param.type.toUpperCase()}
      </span>
      <input value={param.name} onChange={(e) => onRename(e.target.value)} className={`${inputCls} flex-1 font-mono`} />
      {param.type === 'float' && (
        <>
          <input
            type="range" min={0} max={12} step={0.1} value={Number(param.value) || 0}
            onChange={(e) => onTest(Number(e.target.value))}
            className="w-20 accent-violet-500"
          />
          <span className="font-mono text-[10px] text-zinc-500 w-8">{Number(param.value).toFixed(1)}</span>
        </>
      )}
      {param.type === 'bool' && (
        <input
          type="checkbox" checked={param.value === true}
          onChange={(e) => onTest(e.target.checked)}
          className="accent-violet-500"
        />
      )}
      {param.type === 'trigger' && (
        <button
          type="button" onClick={onFire}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[10px] font-semibold"
          title="Déclencher"
        >
          <Flag className="w-3 h-3" /> FEU
        </button>
      )}
      <button type="button" onClick={onDelete} className="p-1 rounded text-zinc-600 hover:text-rose-400">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function AddParamRow({ onAdd }: { onAdd: (p: AnimParam) => void }): React.ReactElement {
  const [name, setName] = useState('');
  const [type, setType] = useState<'float' | 'bool' | 'trigger'>('float');
  return (
    <div className="flex items-center gap-1.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nom…" className={`${inputCls} flex-1 font-mono`} />
      <select value={type} onChange={(e) => setType(e.target.value as 'float' | 'bool' | 'trigger')} className={inputCls}>
        <option value="float">float</option>
        <option value="bool">bool</option>
        <option value="trigger">trigger</option>
      </select>
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          onAdd({ name: name.trim(), type, value: type === 'bool' ? false : 0 });
          setName('');
        }}
        className={`${btnCls} bg-zinc-900 border-zinc-800 text-zinc-300 disabled:opacity-40`}
      >
        + Param
      </button>
    </div>
  );
}
