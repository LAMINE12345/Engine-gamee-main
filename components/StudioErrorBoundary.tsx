'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Nom affiché dans le message — permet de situer la panne. */
  label: string;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Frontière d'erreur : évite l'écran blanc définitif.
 *
* `page.tsx` fait 2 300 lignes et instancie le `SceneManager` (deux contextes
 * WebGL, un worker de terrain, une boucle de rendu). Une exception, d'où
 * qu'elle vienne, démontait tout l'arbre React — donc tout l'éditeur — et la
 * seule issue était de recharger l'onglet. La scène, elle, est autosauvée
 * dans localStorage : les données de l'utilisateur survivent, autant les
 * rendre récupérables.
 */
export class StudioErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    // console.error est volontaire et le seul endroit où l'erreur survit au
    // démontage de l'arbre.
    console.error(`[Aether] Panne dans « ${this.props.label} » :`, error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  private readonly handleDismiss = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#07080c] text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full rounded-2xl border border-rose-500/40 bg-rose-950/20 p-6">
          <h1 className="text-lg font-semibold text-rose-200">
            Panne dans « {this.props.label} »
          </h1>
          <p className="mt-2 text-sm text-zinc-300">
            L&apos;éditeur s&apos;est arrêté sur une erreur inattendue. Ta scène est
            autosauvée dans ce navigateur : la recharger la retrouvera intacte.
          </p>

          <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-rose-500/20 bg-black/40 p-3 text-xs font-mono text-rose-100 whitespace-pre-wrap">
            {error.message || String(error)}
          </pre>

          {componentStack && (
            <details className="mt-3 text-xs text-zinc-400">
              <summary className="cursor-pointer select-none">Trace de la pile</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{componentStack}</pre>
            </details>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
            >
              Recharger l&apos;éditeur
            </button>
            <button
              type="button"
              onClick={this.handleDismiss}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Réessayer sans recharger
            </button>
          </div>
        </div>
      </div>
    );
  }
}