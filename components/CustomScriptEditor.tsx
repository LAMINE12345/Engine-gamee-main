'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  StepForward,
  RotateCcw,
  Terminal,
  Trash2,
  Bug,
  Radio,
} from 'lucide-react';
import { CustomScriptData } from '../types/logic';
import { ScriptSandbox } from '../lib/logic/ScriptSandbox';
import { SCRIPT_TEMPLATES, DEFAULT_SCRIPT_CODE } from '../lib/logic/scriptTemplates';
import {
  ScriptDebugger,
  type DebugSnapshot,
  type DebugStatus,
} from '../lib/logic/ScriptDebugger';

// Dynamic Monaco editor import to prevent SSR hydration mismatch
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type MonacoEditorInstance = {
  getModel: () => { deltaDecorations: (old: string[], newDec: unknown[]) => string[] } | null;
  onMouseDown: (cb: (e: { target: { type: number; position?: { lineNumber: number } } }) => void) => void;
  revealLineInCenterIfOutsideViewport: (line: number) => void;
  setPosition: (p: { lineNumber: number; column: number }) => void;
} | null;

type MonacoNs = {
  Range: new (l: number, c: number, l2: number, c2: number) => unknown;
  editor: { MouseTargetType: Record<string, number> };
} | null;

interface CustomScriptEditorProps {
  entityId: string;
  initialScript?: CustomScriptData;
  onUpdateScript: (script: CustomScriptData) => void;
  /** Simulation Play active — bannière hot-reload + pause debugger. */
  isPlaying?: boolean;
}

export const CustomScriptEditor: React.FC<CustomScriptEditorProps> = ({
  entityId,
  initialScript,
  onUpdateScript,
  isPlaying = false,
}) => {
  const [code, setCode] = useState<string>(
    initialScript?.code || DEFAULT_SCRIPT_CODE
  );
  const [enabled, setEnabled] = useState<boolean>(initialScript?.enabled ?? true);
  const [compileStatus, setCompileStatus] = useState<{ ok: boolean; error?: string }>({
    ok: initialScript?.compiledOk ?? true,
    error: initialScript?.lastError,
  });
  const [logs, setLogs] = useState<{ time: string; message: string; type: 'log' | 'warn' | 'error' }[]>([]);
  const [templateId, setTemplateId] = useState<string>(() => {
    const code0 = initialScript?.code || DEFAULT_SCRIPT_CODE;
    return SCRIPT_TEMPLATES.find((t) => t.code === code0)?.id ?? 'custom';
  });
  const [breakpoints, setBreakpoints] = useState<number[]>(
    () => (initialScript?.breakpoints ?? []).filter((n) => Number.isFinite(n) && n > 0)
  );
  const [debug, setDebug] = useState<DebugSnapshot | null>(null);
  const [debugStatus, setDebugStatus] = useState<DebugStatus>(ScriptDebugger.statusValue);

  const editorRef = useRef<MonacoEditorInstance>(null);
  const monacoRef = useRef<MonacoNs>(null);
  const bpDecorationIds = useRef<string[]>([]);
  const highlightDecorationIds = useRef<string[]>([]);
  const breakpointsRef = useRef<Set<number>>(
    new Set((initialScript?.breakpoints ?? []).filter((n) => Number.isFinite(n) && n > 0))
  );

  const persist = useCallback(
    (nextCode: string, nextEnabled: boolean, ok: boolean, error?: string) => {
      onUpdateScript({
        enabled: nextEnabled,
        code: nextCode,
        compiledOk: ok,
        lastError: error,
        breakpoints: [...breakpointsRef.current].sort((a, b) => a - b),
      });
    },
    [onUpdateScript]
  );

  const applyBpDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const lines = [...breakpointsRef.current].sort((a, b) => a - b);
    const decs = lines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'monaco-breakpoint',
        glyphMarginHoverMessage: { value: `Breakpoint ligne ${line}` },
      },
    }));
    bpDecorationIds.current = model.deltaDecorations(bpDecorationIds.current, decs);
  }, []);

  const applyHighlight = useCallback((line: number | null) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    if (line == null || line < 1) {
      highlightDecorationIds.current = model.deltaDecorations(highlightDecorationIds.current, []);
      return;
    }
    highlightDecorationIds.current = model.deltaDecorations(highlightDecorationIds.current, [
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-current-line',
          marginClassName: 'monaco-current-line-margin',
        },
      },
    ]);
    editor.revealLineInCenterIfOutsideViewport(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  }, []);

  // Logs poll
  useEffect(() => {
    const interval = setInterval(() => {
      setLogs([...ScriptSandbox.getLogs()]);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Debug subscription
  useEffect(() => {
    setDebugStatus(ScriptDebugger.statusValue);
    setDebug(ScriptDebugger.currentSnapshot);
    return ScriptDebugger.subscribe((snap) => {
      setDebug(snap);
      setDebugStatus(ScriptDebugger.statusValue);
    });
  }, []);

  // Highlight current paused line
  useEffect(() => {
    applyHighlight(debug ? debug.line : null);
  }, [debug, applyHighlight]);

  // Seed breakpoints into debugger on mount / entity change
  useEffect(() => {
    ScriptDebugger.setBreakpoints(entityId, [...breakpointsRef.current]);
    ScriptDebugger.invalidate(entityId);
    return () => {
      /* keep breakpoints persisted on entity */
    };
  }, [entityId]);

  const ensureBreakpointCss = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('aether-monaco-bp-css')) return;
    const style = document.createElement('style');
    style.id = 'aether-monaco-bp-css';
    style.textContent = `
      .monaco-breakpoint {
        background: #ef4444 !important;
        border-radius: 50% !important;
        width: 10px !important;
        height: 10px !important;
        position: absolute !important;
        left: 3px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
      }
      .monaco-current-line {
        background: rgba(250, 204, 21, 0.12) !important;
      }
      .monaco-current-line-margin {
        background: rgba(250, 204, 21, 0.45) !important;
      }
    `;
    document.head.appendChild(style);
  };

  const toggleBreakpoint = (line: number) => {
    if (!Number.isFinite(line) || line < 1) return;
    const next = new Set(breakpointsRef.current);
    if (next.has(line)) next.delete(line);
    else next.add(line);
    breakpointsRef.current = next;
    const sorted = [...next].sort((a, b) => a - b);
    setBreakpoints(sorted);
    ScriptDebugger.setBreakpoints(entityId, sorted);
    ScriptDebugger.invalidate(entityId);
    applyBpDecorations();
    persist(code, enabled, compileStatus.ok, compileStatus.error);
  };

  const handleEditorMount = (editor: unknown, monaco: unknown) => {
    ensureBreakpointCss();
    editorRef.current = editor as NonNullable<MonacoEditorInstance>;
    monacoRef.current = monaco as MonacoNs;
    const m = monaco as NonNullable<MonacoNs>;
    (editor as NonNullable<MonacoEditorInstance>).onMouseDown((e) => {
      const gt = m.editor.MouseTargetType;
      const isGutter =
        e.target.type === gt.GUTTER_GLYPH_MARGIN ||
        e.target.type === gt.GUTTER_LINE_NUMBERS ||
        e.target.type === gt.GUTTER_LINE_DECORATIONS;
      const line = e.target.position?.lineNumber;
      if (isGutter && line != null) toggleBreakpoint(line);
    });
    applyBpDecorations();
    applyHighlight(debug ? debug.line : null);
  };

  const handleCompile = (currentCode: string = code) => {
    const { error } = ScriptSandbox.compile(currentCode);
    if (error) {
      setCompileStatus({ ok: false, error });
      persist(currentCode, enabled, false, error);
    } else {
      setCompileStatus({ ok: true });
      persist(currentCode, enabled, true);
      ScriptDebugger.invalidate(entityId);
    }
  };

  const handleToggleEnabled = () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    persist(code, nextEnabled, compileStatus.ok, compileStatus.error);
  };

  const insertTemplate = (id: string) => {
    const tpl = SCRIPT_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    setCode(tpl.code);
    handleCompile(tpl.code);
  };

  const statusLabel =
    debugStatus === 'paused'
      ? 'En pause'
      : debugStatus === 'stepping'
        ? 'Pas à pas'
        : 'Exécution';

  return (
    <div id="custom-script-editor" className="space-y-3">
      {/* Header & Toggle */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
            <FileCode2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200">Script JavaScript / TypeScript</div>
            <div className="text-[10px] text-zinc-400">Niveau 3 : Contrôle total par le code</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors ${
              enabled ? 'bg-emerald-500 justify-end' : 'bg-zinc-800 justify-start'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-white shadow" />
          </button>
        </div>
      </div>

      {/* Hot-reload banner (Play) */}
      {isPlaying && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-[11px] text-emerald-300">
          <Radio className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Hot-reload actif — les modifications s&apos;appliquent en direct à la simulation.
          </span>
        </div>
      )}

      {/* Templates toolbar */}
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wide flex-shrink-0">
          Modèle
        </label>
        <select
          value={templateId}
          onChange={(e) => insertTemplate(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500/60"
        >
          {SCRIPT_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} — {t.description}
            </option>
          ))}
          {!SCRIPT_TEMPLATES.some((t) => t.id === templateId) && (
            <option value="custom">Script personnalisé</option>
          )}
        </select>
      </div>

      {/* Debug panel */}
      <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
            <Bug className="w-3.5 h-3.5 text-amber-400" />
            <span>Debugger</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border ${
                debugStatus === 'paused' || debugStatus === 'stepping'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : isPlaying
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}
            >
              {isPlaying ? statusLabel : 'Inactif'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!debugStatus || debugStatus === 'running' || !isPlaying}
              onClick={() => ScriptDebugger.resume()}
              title="Reprendre"
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
            >
              <Play className="w-3 h-3" />
            </button>
            <button
              type="button"
              disabled={debugStatus !== 'paused' || !isPlaying}
              onClick={() => ScriptDebugger.stepOver()}
              title="Pas à pas"
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
            >
              <StepForward className="w-3 h-3" />
            </button>
            <button
              type="button"
              disabled={debugStatus === 'running' && !debug}
              onClick={() => ScriptDebugger.reset()}
              title="Réinitialiser le debugger"
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => ScriptDebugger.pause()}
              title="Mettre en pause"
              disabled={!isPlaying}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
            >
              <Pause className="w-3 h-3" />
            </button>
          </div>
        </div>

        {debug ? (
          <div className="space-y-1.5 font-mono text-[10px] p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
            <div className="text-amber-300">
              Pause ligne {debug.line} — {debug.entityName || entityId}
            </div>
            <div className="text-zinc-400">
              {new Date(debug.time).toLocaleTimeString()}
            </div>
            <pre className="text-sky-300 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
              {JSON.stringify(debug.variables, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="text-[10px] text-zinc-500 italic px-1">
            {breakpoints.length > 0
              ? `${breakpoints.length} breakpoint(s) armé(s) — cliquez le gutter pendant Play.`
              : 'Cliquez dans la gouttière à gauche d&apos;une ligne pour poser un breakpoint.'}
          </div>
        )}
      </div>

      {/* Monaco Code Editor Container */}
      <div className="relative rounded-xl border border-zinc-800 overflow-hidden bg-[#1e1e1e] shadow-lg">
        <Editor
          height="280px"
          language="javascript"
          theme="vs-dark"
          value={code}
          onMount={handleEditorMount}
          onChange={(newVal) => {
            const val = newVal || '';
            setCode(val);
            setTemplateId('custom');
            handleCompile(val);
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 11,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 8, bottom: 8 },
            formatOnPaste: true,
            tabSize: 2,
            glyphMargin: true,
          }}
        />

        {/* Compile Status Floating Banner */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950/90 border-t border-zinc-800 text-[11px]">
          {compileStatus.ok ? (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Script vérifié &amp; prêt pour Play</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 text-rose-400 truncate max-w-[200px]"
              title={compileStatus.error}
            >
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{compileStatus.error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleCompile(code)}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium transition-colors"
          >
            Recompiler
          </button>
        </div>
      </div>

      {/* Script Console Output Panel */}
      <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Console Engine.log()</span>
          </div>
          <button
            type="button"
            onClick={() => ScriptSandbox.clearLogs()}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            <span>Vider</span>
          </button>
        </div>

        <div className="h-24 overflow-y-auto space-y-1 font-mono text-[10px] p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
          {logs.length === 0 ? (
            <div className="text-zinc-500 italic py-2 text-center">
              Passez en mode Simulation Play pour voir les logs d&apos;exécution...
            </div>
          ) : (
            logs.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 ${
                  item.type === 'error'
                    ? 'text-rose-400'
                    : item.type === 'warn'
                      ? 'text-amber-400'
                      : 'text-zinc-300'
                }`}
              >
                <span className="text-zinc-500 flex-shrink-0">[{item.time}]</span>
                <span className="break-all">{item.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
