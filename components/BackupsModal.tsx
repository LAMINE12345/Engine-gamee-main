'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { History, Plus, RotateCcw, Trash2, HardDriveDownload, X, AlertTriangle } from 'lucide-react';
import type { BackupInfo } from '../lib/serialize';
import { MAX_BACKUPS } from '../lib/serialize';
import { useDismiss } from '../lib/ui/useDismiss';
import { confirmBox, toast } from '../lib/ui/overlays';

interface BackupsModalProps {
  open: boolean;
  onClose: () => void;
  /** Sauvegarde immédiate de la scène courante, retourne la clé du slot. */
  onBackupNow: () => string | null;
  onListBackups: () => BackupInfo[];
  onRestoreBackup: (key: string) => boolean;
  onDeleteBackup: (key: string) => void;
}

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/** Heure seule : le titre de ligne ne doit pas répéter la date déjà affichée. */
const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/**
 * Modale « Sauvegardes » : l'autosave automatique protège contre la perte
 * accidentelle, mais elle n'est qu'une seule version. Ces snapshots
 * horodatés (5 slots, gérés par HistoryManager) sont le filet de sécurité
 * réel : sans UI, personne ne sait qu'ils existent.
 */
export const BackupsModal: React.FC<BackupsModalProps> = ({
  open,
  onClose,
  onBackupNow,
  onListBackups,
  onRestoreBackup,
  onDeleteBackup,
}) => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, [panelRef]);

  const refresh = useCallback(() => {
    if (!open) return;
    setBackups(onListBackups());
  }, [open, onListBackups]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!open) return null;

  const handleBackupNow = () => {
    const key = onBackupNow();
    refresh();
    toast(
      key ? 'Sauvegarde créée.' : 'Sauvegarde impossible : stockage indisponible.',
      key ? 'success' : 'error'
    );
  };

  const handleRestore = async (b: BackupInfo) => {
    const ok = await confirmBox(
      `Restaurer la sauvegarde du ${fmtDate(b.at)} ?\n\nLa scène actuelle sera remplacée.`,
      { title: 'Restaurer une sauvegarde', okLabel: 'Restaurer' }
    );
    if (!ok) return;
    const done = onRestoreBackup(b.key);
    if (done) {
      toast('Sauvegarde restaurée.', 'success');
      onClose();
    } else {
      toast('Sauvegarde illisible ou incompatible.', 'error');
    }
  };

  const handleDelete = async (b: BackupInfo) => {
    const ok = await confirmBox(
      `Supprimer définitivement la sauvegarde du ${fmtDate(b.at)} ?`,
      { title: 'Supprimer la sauvegarde', okLabel: 'Supprimer' }
    );
    if (!ok) return;
    onDeleteBackup(b.key);
    refresh();
    toast('Sauvegarde supprimée.', 'info');
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        id="backups-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Sauvegardes de la scène"
        className="ae-panel w-full max-w-lg overflow-hidden"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <History className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">Sauvegardes</h2>
              <p className="text-[11px] text-zinc-400">
                {backups.length}/{MAX_BACKUPS} emplacements · stockés dans ce navigateur
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps */}
        <div className="max-h-[52vh] space-y-2 overflow-y-auto p-4">
          {backups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <HardDriveDownload className="h-7 w-7 text-zinc-600" />
              <p className="text-sm text-zinc-300">Aucune sauvegarde pour l&apos;instant</p>
              <p className="max-w-[30ch] text-xs text-zinc-500">
                L&apos;autosave protège déjà votre travail. Créez une sauvegarde
                avant une grosse modification.
              </p>
            </div>
          ) : (
            backups.map((b) => (
              <div
                key={b.key}
                title={`Sauvegarde du ${fmtDate(b.at)}`}
                className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
              >
                <div className="min-w-0 flex-1">
                  {/* Titre = heure seule ; la date complète est dans l'infobulle. */}
                  <p className="truncate text-xs font-medium text-zinc-100">
                    {b.projectName || fmtTime(b.at)}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {fmtDate(b.at)} · {b.nodes} objet{b.nodes > 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(b)}
                  className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-200 transition-colors hover:bg-sky-500/30"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restaurer
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(b)}
                  aria-label="Supprimer cette sauvegarde"
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3">
          <p className="flex-1 text-[11px] text-zinc-500">
            {backups.length >= MAX_BACKUPS ? (
              <span className="inline-flex items-center gap-1 text-amber-400/90">
                <AlertTriangle className="h-3 w-3" /> Emplacements pleins
              </span>
            ) : (
              `La plus ancienne sera écrasée quand les ${MAX_BACKUPS} emplacements seront pris.`
            )}
          </p>
          <button
            type="button"
            onClick={handleBackupNow}
            className="ae-btn shrink-0"
            title="Créer une sauvegarde horodatée de la scène courante"
          >
            <Plus className="h-3.5 w-3.5 text-amber-300" />
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupsModal;
