import * as THREE from 'three';
import { Entity } from '../ecs/ECS';
import { SoundEngine } from '../audio/SoundSynth';
import { soundManager } from '../SoundManager';
import { Script } from '../../types/logic';
import { ScriptDebugger } from './ScriptDebugger';

export interface EngineFacade {
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  playSound: (preset: string) => void;
  /** Spatial 3D : atténuation distance + pan + doppler. */
  playSound3D: (
    preset: string,
    pos: { x: number; y: number; z: number },
    maxDistance?: number
  ) => void;
  getVariable: (name: string) => any;
  setVariable: (name: string, val: any) => void;
  findEntity: (name: string) => Entity | null;
  destroy: (entity: Entity) => void;
  /** Publie un événement custom écouté par onCustomEvent + nœuds OnCustomEvent. */
  emit: (name: string, data?: any) => void;
  /** Coroutine : résout après `seconds` (temps de jeu, respecte setTimeScale). */
  wait: (seconds: number) => Promise<void>;
  /** Démarre une coroutine async/await liée à l'instance. */
  startCoroutine: (fn: () => Promise<void> | void) => Promise<void>;
  isKeyDown: (code: string) => boolean;
  /** Timer répétable optionnel → callback. */
  setTimer: (name: string, seconds: number, repeat?: boolean, fn?: () => void) => void;
  clearTimer: (name: string) => void;
  setTimeScale: (scale: number) => void;
  /** BGM mode : exploration | combat | off. */
  setBGM: (mode: 'exploration' | 'combat' | 'off') => void;
  readonly time: number;
}

export interface ScriptExecutionContext {
  log: (...args: any[]) => void;
  playSound: (preset: string) => void;
  getVariable: (name: string) => any;
  setVariable: (name: string, val: any) => void;
  findEntity: (name: string) => Entity | null;
  destroy: (entity: Entity) => void;
  time: number;
}

interface DebugBind {
  entityId: string;
  entityName: string;
  vars: () => Record<string, unknown>;
}

/**
 * ScriptSandbox
 * Safely parses, instantiates and controls custom Level 3 user scripts.
 * Engine is an instance facade (no window.Engine split-brain).
 * Supports optional hooks, coroutines (async/await + Engine.wait), and debug instrumentation.
 */
export class ScriptSandbox {
  private static globalVariables: Map<string, any> = new Map();
  private static logs: { time: string; message: string; type: 'log' | 'warn' | 'error' }[] = [];

  /** Engine helpers bound by LogicExecutor (emit, isKeyDown, time, timescale). */
  public static runtime: {
    emit?: (name: string, data?: any) => void;
    isKeyDown?: (code: string) => boolean;
    getTime?: () => number;
    setTimeScale?: (scale: number) => void;
    setTimer?: (name: string, seconds: number, repeat: boolean, entityId: string, fn?: () => void) => void;
    clearTimer?: (name: string, entityId: string) => void;
  } = {};

  /** Active coroutine cancellation tokens per simulation run. */
  private static coroutines: Set<{ cancelled: boolean }> = new Set();
  private static timeScale = 1;

  public static getLogs() {
    return this.logs;
  }

  public static clearLogs() {
    this.logs = [];
  }

  public static addLog(message: string, type: 'log' | 'warn' | 'error' = 'log') {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift({ time, message, type });
    if (this.logs.length > 100) this.logs.pop();
  }

  public static getVariables() {
    return Object.fromEntries(this.globalVariables);
  }

  public static setVariable(name: string, val: any) {
    this.globalVariables.set(name, val);
  }

  public static getTimeScale(): number {
    return this.timeScale;
  }

  public static setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, Math.min(scale, 10));
    this.runtime.setTimeScale?.(this.timeScale);
  }

  public static getTime(): number {
    return this.runtime.getTime?.() ?? 0;
  }

  public static cancelAllCoroutines(): void {
    for (const c of this.coroutines) c.cancelled = true;
    this.coroutines.clear();
    this.timeScale = 1;
  }

  private static wait(seconds: number): Promise<void> {
    const token = { cancelled: false };
    this.coroutines.add(token);
    return new Promise<void>((resolve) => {
      const ms = Math.max(0, seconds * 1000);
      const settle = () => {
        this.coroutines.delete(token);
        resolve();
      };
      // `seconds` est exprimé en TEMPS DE JEU : à timeScale 2 une seconde de
      // script doit s'écouler en 0,5 s réelles (et non en 2 s). On intègre donc
      // l'échelle au fil du temps au lieu de figer un délai unique — un
      // setTimeScale posé EN COURS d'attente (HitStop, bullet-time) doit être
      // pris en compte, sinon l'attente ne réagirait pas au gel.
      let elapsedGameMs = 0;
      let lastSample = Date.now();
      const tick = () => {
        if (token.cancelled) {
          settle();
          return;
        }
        const now = Date.now();
        elapsedGameMs += (now - lastSample) * this.timeScale;
        lastSample = now;
        if (elapsedGameMs >= ms) {
          settle();
          return;
        }
        // Cadence d'échantillonnage : on ne poll pas plus souvent que nécessaire
        // (une attente de 5 s ne doit pas créer 300 timers) mais on reste assez
        // fin pour qu'un gel/un dégel soit perçu en moins de 100 ms.
        const remainingGameMs = ms - elapsedGameMs;
        const poll = this.timeScale > 0 ? remainingGameMs / this.timeScale : 100;
        window.setTimeout(tick, Math.max(16, Math.min(100, poll)));
      };
      tick();
    });
  }

  private static safeInvoke(fn: () => any): any {
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') {
        r.catch((err: any) => {
          this.addLog(`[Coroutine Error] ${err?.message || err}`, 'error');
        });
      }
      return r;
    } catch (err: any) {
      this.addLog(`[Script Error] ${err?.message || err}`, 'error');
      return undefined;
    }
  }

  private static callHook(instance: Script, hook: keyof Script, ...args: any[]): void {
    const fn = (instance as any)[hook];
    if (typeof fn !== 'function') return;
    this.safeInvoke(() => fn.apply(instance, args));
  }

  /**
   * Compiles code string into a class extending Script.
   * When `debug` is set, instruments the source with breakpoint hits.
   */
  public static async compileAsync(
    code: string,
    debug?: { entityId: string; entityName: string }
  ): Promise<{ ScriptClass: (new () => Script) | null; error: string | null }> {
    let cleaned = code.trim();
    cleaned = cleaned.replace(/export\s+default\s+/g, '');
    cleaned = cleaned.replace(/export\s+/g, '');

    if (debug) {
      try {
        cleaned = await ScriptDebugger.instrument(cleaned, debug.entityId, debug.entityName, () => Object.fromEntries(this.globalVariables));
      } catch {
        /* instrumentation best-effort */
      }
    }

    const factory = new Function(
      'Script',
      'THREE',
      'Engine',
      '__dbg',
      `
      ${cleaned}

      if (typeof UserScript !== 'undefined') return UserScript;
      if (typeof CustomScript !== 'undefined') return CustomScript;
      if (typeof MyScript !== 'undefined') return MyScript;

      try {
        const matched = ${JSON.stringify(cleaned)}.match(/class\\s+([A-Za-z0-9_]+)\\s+extends\\s+Script/);
        if (matched && matched[1] && eval("typeof " + matched[1]) !== 'undefined') {
          return eval(matched[1]);
        }
      } catch(e) {}

      return class DefaultScript extends Script {};
      `
    );

    const mockEngine = this.createCompileEngine();
    const dbgBind: DebugBind = {
      entityId: debug?.entityId || '',
      entityName: debug?.entityName || '',
      vars: () => Object.fromEntries(this.globalVariables),
    };
    const __dbg = {
      entityId: dbgBind.entityId,
      entityName: dbgBind.entityName,
      vars: dbgBind.vars,
      hit: (line: number, entityId: string, entityName: string, variables: Record<string, unknown>) =>
        ScriptDebugger.hit(line, entityId || dbgBind.entityId, entityName || dbgBind.entityName, variables || {}),
    };

    try {
      const ScriptClass = factory(Script, THREE, mockEngine, __dbg);
      return { ScriptClass, error: null };
    } catch (err: any) {
      return { ScriptClass: null, error: err.message || 'Erreur de syntaxe dans le script.' };
    }
  }

  /** Sync compile (no debug instrumentation). Prefer compileAsync when possible. */
  public static compile(code: string): {
    ScriptClass: (new () => Script) | null;
    error: string | null;
  } {
    try {
      let cleaned = code.trim();
      cleaned = cleaned.replace(/export\s+default\s+/g, '');
      cleaned = cleaned.replace(/export\s+/g, '');

      const factory = new Function(
        'Script',
        'THREE',
        'Engine',
        '__dbg',
        `
        ${cleaned}

        if (typeof UserScript !== 'undefined') return UserScript;
        if (typeof CustomScript !== 'undefined') return CustomScript;
        if (typeof MyScript !== 'undefined') return MyScript;

        try {
          const matched = ${JSON.stringify(cleaned)}.match(/class\\s+([A-Za-z0-9_]+)\\s+extends\\s+Script/);
          if (matched && matched[1] && eval("typeof " + matched[1]) !== 'undefined') {
            return eval(matched[1]);
          }
        } catch(e) {}

        return class DefaultScript extends Script {};
        `
      );

      const mockEngine = this.createCompileEngine();
      const __dbg = {
        entityId: '',
        entityName: '',
        vars: () => Object.fromEntries(this.globalVariables),
        hit: async () => {},
      };
      const ScriptClass = factory(Script, THREE, mockEngine, __dbg);
      return { ScriptClass, error: null };
    } catch (err: any) {
      return { ScriptClass: null, error: err.message || 'Erreur de syntaxe dans le script.' };
    }
  }

  private static createCompileEngine() {
    return {
      log: (msg: any) => this.addLog(String(msg), 'log'),
      playSound: (s: string) => SoundEngine.play(s),
      playSound3D: (s: string, pos: { x: number; y: number; z: number }, maxDist?: number) =>
        soundManager.playSpatialSound3D(s as any, pos, undefined, maxDist ?? 25),
      setBGM: (mode: 'exploration' | 'combat' | 'off') => soundManager.setBGMMode(mode),
      getVariable: (name: string) => this.globalVariables.get(name),
      setVariable: (name: string, val: any) => this.setVariable(name, val),
      findEntity: () => null,
      destroy: () => {},
      emit: (name: string, data?: any) => this.runtime.emit?.(name, data),
      wait: (seconds: number) => this.wait(seconds),
      startCoroutine: (fn: () => Promise<void> | void) => this.safeInvoke(fn),
      isKeyDown: (code: string) => this.runtime.isKeyDown?.(code) ?? false,
      setTimer: () => {},
      clearTimer: () => {},
      setTimeScale: (s: number) => this.setTimeScale(s),
      get time() {
        return ScriptSandbox.getTime();
      },
    };
  }

  private static createEngineFacade(
    entity: Entity,
    findEntityFn: (name: string) => Entity | null,
    destroyEntityFn: (entity: Entity) => void
  ): EngineFacade {
    const prefix = (args: any[], level: 'log' | 'warn' | 'error') => {
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      this.addLog(`[${entity.name}] ${msg}`, level);
    };

    return {
      log: (...args) => prefix(args, 'log'),
      warn: (...args) => prefix(args, 'warn'),
      error: (...args) => prefix(args, 'error'),
      playSound: (preset) => SoundEngine.play(preset),
      playSound3D: (preset, pos, maxDist) =>
        soundManager.playSpatialSound3D(preset as any, pos, undefined, maxDist ?? 25),
      setBGM: (mode) => soundManager.setBGMMode(mode),
      getVariable: (name) => this.globalVariables.get(name),
      setVariable: (name, val) => this.setVariable(name, val),
      findEntity: findEntityFn,
      destroy: destroyEntityFn,
      emit: (name, data) => this.runtime.emit?.(name, data),
      wait: (seconds) => this.wait(seconds),
      startCoroutine: (fn) => Promise.resolve(this.safeInvoke(fn)),
      isKeyDown: (code) => this.runtime.isKeyDown?.(code) ?? false,
      setTimer: (name, seconds, repeat, fn) =>
        this.runtime.setTimer?.(name, seconds, repeat ?? false, entity.id, fn),
      clearTimer: (name) => this.runtime.clearTimer?.(name, entity.id),
      setTimeScale: (scale) => this.setTimeScale(scale),
      get time() {
        return ScriptSandbox.getTime();
      },
    };
  }

  /**
   * Instantiates the script with entity binding and per-instance Engine facade.
   * Hooks are invoked via callHook (optional methods supported).
   */
  public static instantiate(
    ScriptClass: new () => Script,
    entity: Entity,
    findEntityFn: (name: string) => Entity | null,
    destroyEntityFn: (entity: Entity) => void
  ): Script | null {
    try {
      const instance = new ScriptClass();
      instance.entity = entity;
      const engineAPI = this.createEngineFacade(entity, findEntityFn, destroyEntityFn);
      (instance as any).Engine = engineAPI;
      (instance as any).__engine = engineAPI;
      return instance;
    } catch (err: any) {
      this.addLog(`Erreur d'instanciation sur ${entity.name}: ${err.message}`, 'error');
      return null;
    }
  }

  public static invokeStart(instance: Script): void {
    this.callHook(instance, 'onStart');
  }

  public static invokeUpdate(instance: Script, dt: number): void {
    this.callHook(instance, 'onUpdate', dt);
  }

  public static invokeCollision(instance: Script, other: Entity): void {
    this.callHook(instance, 'onCollision', other);
  }

  public static invokeTriggerEnter(instance: Script, other: Entity): void {
    this.callHook(instance, 'onTriggerEnter', other);
  }

  public static invokeTriggerExit(instance: Script, other: Entity): void {
    this.callHook(instance, 'onTriggerExit', other);
  }

  public static invokeKeyDown(instance: Script, code: string): void {
    this.callHook(instance, 'onKeyDown', code);
  }

  public static invokeKeyUp(instance: Script, code: string): void {
    this.callHook(instance, 'onKeyUp', code);
  }

  public static invokeClick(instance: Script): void {
    this.callHook(instance, 'onClick');
  }

  public static invokeCustomEvent(instance: Script, name: string, data?: any): void {
    this.callHook(instance, 'onCustomEvent', name, data);
  }

  public static invokeDestroy(instance: Script): void {
    this.callHook(instance, 'onDestroy');
  }

  /** Legacy direct call sites (LogicExecutor) — safe wrappers. */
  public static callOnStart(instance: Script): void {
    this.invokeStart(instance);
  }

  public static callOnUpdate(instance: Script, dt: number): void {
    this.invokeUpdate(instance, dt);
  }
}
