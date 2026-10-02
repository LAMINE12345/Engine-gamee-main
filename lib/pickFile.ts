/**
 * Ouvre le sélecteur de fichiers du navigateur sans avoir à rendre un
 * `<input type="file">` caché dans le JSX.
 *
 * Utilisé par la Toolbar et la palette de commandes (Ctrl+K) pour
 * déclencher le même flux d'import de modèle 3D.
 */
export function pickFile(accept: string, onFile: (file: File) => void): void {
  if (typeof document === 'undefined') return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.opacity = '0';

  let settled = false;
  const cleanup = (): void => {
    window.removeEventListener('focus', onWindowFocus);
    input.remove();
  };
  // Annuler la sélection ne déclenche pas `change` : on nettoie au retour
  // de focus sur la fenêtre pour ne pas laisser de nœud fantôme dans le DOM.
  const onWindowFocus = (): void => {
    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
    }, 400);
  };

  input.addEventListener('change', () => {
    settled = true;
    const file = input.files?.[0];
    cleanup();
    if (file) onFile(file);
  });

  document.body.appendChild(input);
  window.addEventListener('focus', onWindowFocus);
  input.click();
}
