'use client';

import { useEffect } from 'react';

/**
 * Enregistre le Service Worker + relaie l'invite d'installation PWA
 * (événement `aether-pwa-installable`, écouté par la page pour le bouton).
 */
export const PwaRegister: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Si `load` est déjà passé, enregistrer tout de suite : enchaîner sur
    // l'événement ne ferait rien et le service worker ne serait jamais
    // enregistré — c'est le cas au montage tardif (HMR, navigation client).
    const register = (): void => {
      navigator.serviceWorker?.register('/sw.js').catch(() => undefined);
    };
    if ('serviceWorker' in navigator) {
      if (document.readyState === 'complete') register();
      // Handler nommé : un `load` anonyme ne pouvait pas être retiré au
      // démontage, et chaque remontage en empilait un nouveau.
      else window.addEventListener('load', register);
    }

    const onPrompt = (e: Event): void => {
      e.preventDefault();
      (window as unknown as { __aetherInstallPrompt?: Event }).__aetherInstallPrompt = e;
      window.dispatchEvent(new CustomEvent('aether-pwa-installable'));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    return () => {
      window.removeEventListener('load', register);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);
  return null;
};

/** Déclenche l'invite d'installation mémorisée (bouton Toolbar). */
export async function promptPwaInstall(): Promise<boolean> {
  const w = window as unknown as {
    __aetherInstallPrompt?: { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
  };
  const deferred = w.__aetherInstallPrompt;
  if (!deferred) return false;
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice?.catch(() => ({ outcome: 'dismissed' }));
    w.__aetherInstallPrompt = undefined;
    window.dispatchEvent(new CustomEvent('aether-pwa-installable'));
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}
