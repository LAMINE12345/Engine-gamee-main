export interface DebugSnapshot {
  line: number;
  entityId: string;
  entityName: string;
  variables: Record<string, unknown>;
  time: number;
}

export type DebugStatus = 'running' | 'paused' | 'stepping';

export type DebugListener = (snapshot: DebugSnapshot | null) => void;

/**
 * ScriptDebugger
 * Instrumentation dynamique des scripts (breakpoints / step-through / snapshot variables).
 * `hit(line)` est injecté par ScriptDebugger.instrument() en début de corps de méthode ;
 * le runtime l'attend en async pour pouvoir mettre en pause la boucle de jeu.
 */
export class ScriptDebugger {
  private static status: DebugStatus = 'running';
  private static entityBreakpoints: Map<string, Set<number>> = new Map();
  private static waiters: Array<() => void> = [];
  private static snapshot: DebugSnapshot | null = null;
  private static listeners: Set<DebugListener> = new Set();
  private static stepResolve: (() => void) | null = null;
  private static instrumentedScripts: Map<string, string> = new Map();

  public static get statusValue(): DebugStatus {
    return this.status;
  }

  public static get isPaused(): boolean {
    return this.status === 'paused' || this.status === 'stepping';
  }

  public static get currentSnapshot(): DebugSnapshot | null {
    return this.snapshot;
  }

  public static breakpointsFor(entityId: string): number[] {
    const set = this.entityBreakpoints.get(entityId);
    return set ? [...set].sort((a, b) => a - b) : [];
  }

  public static subscribe(listener: DebugListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static emit(): void {
    for (const l of this.listeners) l(this.snapshot);
  }

  public static setBreakpoints(entityId: string, lines: number[]): void {
    this.entityBreakpoints.set(entityId, new Set(lines.filter((n) => Number.isFinite(n) && n > 0)));
  }

  public static clearBreakpoints(entityId?: string): void {
    if (entityId) this.entityBreakpoints.delete(entityId);
    else this.entityBreakpoints.clear();
  }

  public static reset(): void {
    this.status = 'running';
    this.snapshot = null;
    this.stepResolve = null;
    for (const w of this.waiters.splice(0)) w();
    this.emit();
  }

  public static resume(): void {
    if (this.status === 'paused') {
      this.status = 'running';
      this.snapshot = null;
      for (const w of this.waiters.splice(0)) w();
      this.emit();
    }
  }

  /** Freeze the game loop (SceneManager.animate checks isPaused). */
  public static pause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
      this.snapshot = {
        line: this.snapshot?.line ?? 0,
        entityId: this.snapshot?.entityId ?? '',
        entityName: this.snapshot?.entityName ?? '',
        variables: this.snapshot?.variables ?? {},
        time: Date.now(),
      };
      this.emit();
    }
  }

  public static stepOver(): void {
    if (this.status === 'paused') {
      this.status = 'stepping';
      this.emit();
      const resolve = this.stepResolve;
      this.stepResolve = null;
      resolve?.();
      for (const w of this.waiters.splice(0)) w();
    }
  }

  /**
   * Called from instrumented scripts at each potential breakpoint line.
   * Awaits while the debugger is paused so the game loop can freeze.
   */
  public static async hit(
    line: number,
    entityId: string,
    entityName: string,
    variables: Record<string, unknown>
  ): Promise<void> {
    const bps = this.entityBreakpoints.get(entityId);
    const isBp = bps ? bps.has(line) : false;
    if (!isBp && this.status === 'running') return;

    if (isBp || this.status === 'stepping') {
      this.status = 'paused';
      this.snapshot = { line, entityId, entityName, variables, time: Date.now() };
      this.emit();

      await new Promise<void>((resolve) => {
        this.stepResolve = resolve;
        this.waiters.push(resolve);
      });

      // After resume/step, clear one-shot stepping (status mutated across await)
      if ((this.status as DebugStatus) === 'stepping') this.status = 'running';
      this.snapshot = null;
      this.emit();
    }
  }

  /**
   * Injects async hooks + `await __dbg.hit(<line>, ...)` at statement openers.
   * Method declarations for known hooks are rewritten to `async` so `await` is legal.
   */
  public static async instrument(
    code: string,
    entityId: string,
    entityName: string,
    getVariables: () => Record<string, unknown>
  ): Promise<string> {
    const cacheKey = `${entityId}:${code}`;
    const cached = this.instrumentedScripts.get(cacheKey);
    if (cached) return cached;

    // Force async on known Script hooks so injected await compiles
    const HOOKS = [
      'onStart',
      'onUpdate',
      'onCollision',
      'onTriggerEnter',
      'onTriggerExit',
      'onKeyDown',
      'onKeyUp',
      'onClick',
      'onCustomEvent',
      'onDestroy',
    ];
    let src = code;
    for (const h of HOOKS) {
      // class method: onStart(  /  async onStart(
      const re = new RegExp(`(?<!async\\s)(?<!\\.)\\b${h}\\s*\\(`, 'g');
      src = src.replace(re, `async ${h}(`);
      // avoid double async
      src = src.replace(new RegExp(`async\\s+async\\s+${h}`, 'g'), `async ${h}`);
    }

    const lines = src.split('\n');
    const injected: string[] = [];
    let injectNext = false;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      const lineNo = i + 1;

      injected.push(raw);

      if (trimmed.includes('{') && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) {
        const opens = (trimmed.match(/\{/g) || []).length;
        const closes = (trimmed.match(/\}/g) || []).length;
        const prevDepth = braceDepth;
        braceDepth += opens - closes;
        if (prevDepth === 0 && braceDepth >= 1) injectNext = true;
        else if (trimmed.endsWith('{')) injectNext = true;
        else if (prevDepth >= 1 && opens > closes && !trimmed.startsWith('}')) injectNext = true;
      }

      if (
        injectNext &&
        trimmed &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*') &&
        !trimmed.startsWith('}') &&
        !trimmed.startsWith('async ') &&
        !trimmed.startsWith('await __dbg')
      ) {
        const indent = raw.match(/^\s*/)?.[0] || '  ';
        injected.push(
          `${indent}await __dbg.hit(${lineNo}, __dbg.entityId, __dbg.entityName, __dbg.vars());`
        );
        injectNext = false;
      }

      if (trimmed.includes('}') && !trimmed.startsWith('//')) {
        braceDepth -= (trimmed.match(/\}/g) || []).length;
        if (braceDepth < 0) braceDepth = 0;
      }
    }

    const instrumented = injected.join('\n');
    this.instrumentedScripts.set(cacheKey, instrumented);
    void getVariables;
    void entityName;
    return instrumented;
  }

  public static invalidate(entityId?: string): void {
    if (entityId) {
      for (const key of [...this.instrumentedScripts.keys()]) {
        if (key.startsWith(`${entityId}:`)) this.instrumentedScripts.delete(key);
      }
    } else {
      this.instrumentedScripts.clear();
    }
  }
}
