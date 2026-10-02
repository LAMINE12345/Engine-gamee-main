/**
 * Remplacements maison des `alert` / `confirm` / `prompt` natifs + toasts.
 *
 * Tous les appels sont résolues dans <OverlayHost /> (monté une fois dans
 * l'éditeur). Un store module-level évite de remonter des contextes React
 * dans les composants métier.
 */

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface DialogItem {
  id: number;
  kind: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
  placeholder?: string;
}

type Listener<T> = (items: T[]) => void;

let seq = 0;
const nextId = (): number => ++seq;

// ---------------------------------------------------------------- toasts
let toasts: ToastItem[] = [];
const toastListeners = new Set<Listener<ToastItem>>();

const emitToasts = (): void => {
  for (const fn of toastListeners) fn(toasts);
};

export function toast(message: string, kind: ToastKind = 'info', durationMs = 4000): void {
  const item: ToastItem = { id: nextId(), message, kind };
  toasts = [...toasts, item];
  emitToasts();
  if (durationMs > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(item.id), durationMs);
  }
}

export function dismissToast(id: number): void {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export function subscribeToasts(fn: Listener<ToastItem>): () => void {
  toastListeners.add(fn);
  fn(toasts);
  return () => {
    toastListeners.delete(fn);
  };
}

// --------------------------------------------------------------- dialogs
let dialogs: DialogItem[] = [];
const dialogListeners = new Set<Listener<DialogItem>>();
type DialogResult = string | boolean | null;
const resolvers = new Map<number, (value: DialogResult) => void>();

const emitDialogs = (): void => {
  for (const fn of dialogListeners) fn(dialogs);
};

export function subscribeDialogs(fn: Listener<DialogItem>): () => void {
  dialogListeners.add(fn);
  fn(dialogs);
  return () => {
    dialogListeners.delete(fn);
  };
}

/** Résolu par l'OverlayHost (boutons, Échap, Entrée). */
export function resolveDialog(id: number, value: DialogResult): void {
  const resolve = resolvers.get(id);
  if (!resolve) return;
  resolvers.delete(id);
  dialogs = dialogs.filter((d) => d.id !== id);
  emitDialogs();
  resolve(value);
}

const pushDialog = (item: Omit<DialogItem, 'id'>): Promise<DialogResult> => {
  const dialog: DialogItem = { ...item, id: nextId() };
  dialogs = [...dialogs, dialog];
  emitDialogs();
  return new Promise<DialogResult>((resolve) => {
    resolvers.set(dialog.id, resolve);
  });
};

/** Alternative stylée à `window.alert`. */
export async function alertBox(
  message: string,
  opts?: { title?: string; okLabel?: string }
): Promise<void> {
  await pushDialog({
    kind: 'alert',
    title: opts?.title ?? 'Information',
    message,
    okLabel: opts?.okLabel ?? 'OK',
  });
}

/** Alternative stylée à `window.confirm`. Résout `true`/`false`. */
export function confirmBox(
  message: string,
  opts?: { title?: string; okLabel?: string; cancelLabel?: string }
): Promise<boolean> {
  return pushDialog({
    kind: 'confirm',
    title: opts?.title ?? 'Confirmation',
    message,
    okLabel: opts?.okLabel ?? 'Confirmer',
    cancelLabel: opts?.cancelLabel ?? 'Annuler',
  }).then((v) => v === true);
}

/** Alternative stylée à `window.prompt`. Résout la saisie ou `null` (annulé). */
export function promptBox(
  message: string,
  opts?: { title?: string; defaultValue?: string; placeholder?: string; okLabel?: string }
): Promise<string | null> {
  return pushDialog({
    kind: 'prompt',
    title: opts?.title ?? 'Saisie',
    message,
    defaultValue: opts?.defaultValue ?? '',
    placeholder: opts?.placeholder,
    okLabel: opts?.okLabel ?? 'Valider',
  }).then((v) => (typeof v === 'string' ? v : null));
}
