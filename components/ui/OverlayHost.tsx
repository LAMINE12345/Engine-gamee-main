'use client';

import React, { useEffect, useState } from 'react';
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  HelpCircle,
  PencilLine,
} from 'lucide-react';
import {
  subscribeToasts,
  dismissToast,
  subscribeDialogs,
  resolveDialog,
  type ToastItem,
  type DialogItem,
} from '../../lib/ui/overlays';

const TOAST_STYLES: Record<ToastItem['kind'], { className: string; icon: React.ReactNode }> = {
  info: {
    className: 'border-sky-500/40 bg-sky-950/90 text-sky-200',
    icon: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
  },
  success: {
    className: 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  },
  warn: {
    className: 'border-amber-500/40 bg-amber-950/90 text-amber-200',
    icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  },
  error: {
    className: 'border-rose-500/40 bg-rose-950/90 text-rose-200',
    icon: <XCircle className="w-4 h-4 text-rose-400 shrink-0" />,
  },
};

/**
 * Hôte unique des overlays de remplacement : pile de toasts + boîtes
 * alert/confirm/prompt (au lieu des natifs `window.*`).
 */
export const OverlayHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialogs, setDialogs] = useState<DialogItem[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => subscribeToasts(setToasts), []);
  useEffect(() => subscribeDialogs(setDialogs), []);

  const active = dialogs[0] ?? null;

  // Pré-remplissage à l'ouverture d'un prompt.
  useEffect(() => {
    if (active?.kind === 'prompt') setInput(active.defaultValue ?? '');
    else setInput('');
  }, [active?.id, active?.kind, active?.defaultValue]);

  const submit = (value: string | boolean | null): void => {
    if (!active) return;
    resolveDialog(active.id, value);
  };

  // Clavier : Entrée = valider, Échap = annuler (prompts & confirms).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent): void => {
      // Modale ouverte : Espace ne doit pas basculer le Play en arrière-plan.
      if (e.key === ' ' && active.kind !== 'prompt') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape' && active.kind !== 'alert') {
        e.preventDefault();
        e.stopPropagation();
        submit(active.kind === 'prompt' ? null : false);
      } else if (e.key === 'Enter' && active.kind === 'prompt') {
        e.preventDefault();
        submit(input);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submit(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <>
      {/* Pile de toasts (bas droite) */}
      <div className="fixed bottom-4 right-4 z-[130] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => {
          const style = TOAST_STYLES[t.kind];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2 max-w-xs rounded-xl border px-3 py-2 text-xs shadow-2xl backdrop-blur-md animate-[fadeIn_.18s_ease-out] ${style.className}`}
              role="status"
            >
              {style.icon}
              <span className="leading-snug break-words">{t.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="ml-auto opacity-60 hover:opacity-100"
                aria-label="Fermer la notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Boîte de dialogue (alert / confirm / prompt) */}
      {active && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={active.title}
            className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2 font-semibold text-zinc-100 text-sm">
                <HelpCircle className="w-4 h-4 text-sky-400" />
                <span>{active.title}</span>
              </div>
              <button
                type="button"
                onClick={() => submit(active.kind === 'prompt' ? null : active.kind === 'confirm' ? false : true)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap">
                {active.message}
              </p>

              {active.kind === 'prompt' && (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <PencilLine className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <input
                    autoFocus
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={active.placeholder}
                    className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                {active.kind !== 'alert' && (
                  <button
                    type="button"
                    onClick={() => submit(active.kind === 'prompt' ? null : false)}
                    className="px-3 py-1.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs transition-colors"
                  >
                    {active.cancelLabel ?? 'Annuler'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => submit(active.kind === 'prompt' ? input : true)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-colors ${
                    active.kind === 'confirm'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-sky-500 hover:bg-sky-400'
                  }`}
                >
                  {active.okLabel ?? 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
