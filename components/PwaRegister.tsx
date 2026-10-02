'use client';

import { useEffect } from 'react';

/**
 * Enregistre le Service Worker + relaie l'invite d'installation PWA
 * (événement `aether-pwa-installable`, écouté par la page pour le bouton).
 */
export const PwaRegister: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      });
    }
    const onPrompt = (e: Event): void => {
      e.preventDefault();
      (window as unknown as { __aetherInstallPrompt?: Event }).__aetherInstallPrompt = e;
      window.dispatchEvent(new CustomEvent('aether-pwa-installable'));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
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
