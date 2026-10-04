'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Ferme un menu flottant sur clic extérieur / Échap / blur de la fenêtre.
 *
 * Les menus de la Toolbar (rendu, snap, outils) et de l'Asset Manager
 * restaient ouverts après un clic dans le viewport : ce hook centralise
 * la fermeture correcte.
 */
export function useDismiss(
  open: boolean,
  onDismiss: () => void,
  refs: ReadonlyArray<React.RefObject<HTMLElement | null>>
): void {
  // `onDismiss` est souvent une closure inline : on le lit via une ref pour
  // ne pas ré-attacher l'écouteur à chaque rendu.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!open) return;

    const isInside = (target: EventTarget | null): boolean =>
      target instanceof Node && refsRef.current.some((r) => r.current?.contains(target));

    const onPointerDown = (e: MouseEvent): void => {
      if (!isInside(e.target)) dismissRef.current();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismissRef.current();
      }
    };
    const onBlur = (): void => dismissRef.current();

    // `pointerdown` plutôt que `click` : le menu se ferme avant que le clic
    // n'atteigne l'élément de dessous (évite les doubles activations).
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [open]);
}

/**
 * Ferme une modale sur la touche Échap.
 *
 * Volontairement distinct de `useDismiss` : celui-ci ferme aussi au clic
 * extérieur et au blur de la fenêtre, ce qui convient à un menu flottant mais
 * pas à une modale — perdre une modale de paramétrage parce que l'utilisateur
 * a cliqué ailleurs dans la page est une perte de saisie.
 *
 * L'écouteur est en capture et s'arrête à la première modale rencontrée : deux
 * modales empilées se ferment donc une par une, pas toutes d'un coup.
 *
 * (Échap ferme une modale : WCAG 2.1, 2.1.2 « Échap ».)
 */
export function useEscapeToClose(open: boolean, onClose: () => void): void {
  // `onClose` est souvent une closure inline : on le lit via une ref pour ne
  // pas ré-attacher l'écouteur à chaque rendu.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);
}

export interface ExclusiveMenu {
  openMenu: string | null;
  toggle: (id: string) => void;
  open: (id: string) => void;
  close: () => void;
  isOpen: (id: string) => boolean;
}

/** Un seul menu de la Toolbar ouvert à la fois. */
export function useExclusiveMenu(): ExclusiveMenu {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return {
    openMenu,
    toggle: (id) => setOpenMenu((cur) => (cur === id ? null : id)),
    open: (id) => setOpenMenu(id),
    close: () => setOpenMenu(null),
    isOpen: (id) => openMenu === id,
  };
}
