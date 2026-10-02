'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Activity, X, RotateCcw, Bug, AlertTriangle } from 'lucide-react';
import type { ProfilerSnapshot } from '../types/debug';
import { formatMs } from '../types/debug';
import { formatBytes } from '../types/assets';

interface ProfilerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  getSnapshot: () => ProfilerSnapshot | null;
  physicsDebug: boolean;
  onTogglePhysicsDebug: () => void;
  onSnapshotMemory: () => void;
  onResetProfiler: () => void;
}

function SectionBar({ name, avg, p95, maxAvg }: { name: string; avg: number; p95: number; maxAvg: number }) {
  const pct = maxAvg > 0 ? Math.min(100, (avg / maxAvg) * 100) : 0;
  const hot = avg > 8;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-24 shrink-0 truncate text-zinc-400 font-mono" title={name}>
        {name}
      </span>
      <div className="flex-1 h-2 rounded bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded transition-all ${hot ? 'bg-rose-500' : 'bg-sky-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-zinc-300">{formatMs(avg)} ms</span>
      <span className="w-14 shrink-0 text-right font-mono text-zinc-500">p95 {formatMs(p95)}</span>
    </div>
  );
}

export const ProfilerPanel: React.FC<ProfilerPanelProps> = ({
  isOpen,
  onClose,
  getSnapshot,
  physicsDebug,
  onTogglePhysicsDebug,
  onSnapshotMemory,
  onResetProfiler,
}) => {
  const [snapshot, setSnapshot] = useState<ProfilerSnapshot | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSnapshot(getSnapshot());
    const timer = setInterval(() => {
      setSnapshot(getSnapshot());
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Graphe temps de frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = (canvas.width = canvas.offsetWidth * 2);
    const H = (canvas.height = 120);
    ctx.clearRect(0, 0, W, H);
    const data = snapshot.recentTotals;
    if (data.length === 0) return;
    const maxV = Math.max(20, ...data);
    const yOf = (v: number) => H - 6 - (v / maxV) * (H - 16);

    // Lignes 16.7ms (60fps) et 33.3ms (30fps).
    ctx.strokeStyle = 'rgba(244,63,94,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, yOf(16.7));
    ctx.lineTo(W, yOf(16.7));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(251,191,36,0.4)';
    ctx.beginPath();
    ctx.moveTo(0, yOf(33.3));
    ctx.lineTo(W, yOf(33.3));
    ctx.stroke();
    ctx.setLineDash([]);

    // Aire.
    const step = W / Math.max(1, data.length - 1);
    ctx.beginPath();
    ctx.moveTo(0, H);
    data.forEach((v, i) => ctx.lineTo(i * step, yOf(v)));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.15)';
    ctx.fill();
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = yOf(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [snapshot]);

  if (!isOpen) return null;

  const frame = snapshot?.frame;
  const maxAvg = Math.max(0.01, ...(snapshot?.sections.map((s) => s.avg) ?? [0.01]));

  return (
    <div className="fixed right-3 top-14 bottom-24 w-[340px] z-40 flex flex-col rounded-2xl bg-zinc-950/95 border border-zinc-800 backdrop-blur-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/70">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-200">Profiler</span>
          {snapshot && (
            <span
              className={`text-lg font-bold font-mono leading-none ${
                snapshot.fps >= 50
                  ? 'text-emerald-400'
                  : snapshot.fps >= 30
                    ? 'text-amber-400'
                    : 'text-rose-400'
              }`}
            >
              {snapshot.fps}
              <span className="text-[10px] font-medium text-zinc-500 ml-0.5">FPS</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onResetProfiler}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
            title="Réinitialiser les stats"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
            title="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 text-xs">
        {/* Frame graph */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
              Temps de frame
            </span>
            {frame && (
              <span className="font-mono text-[10px] text-zinc-400">
                ø {formatMs(frame.avg)} · p95 {formatMs(frame.p95)} · max {formatMs(frame.max)}
              </span>
            )}
          </div>
          <canvas ref={canvasRef} className="w-full h-[60px] rounded-lg bg-zinc-900 border border-zinc-800" />
          {frame && (
            <div className="mt-1 grid grid-cols-5 gap-1 text-center font-mono text-[9px]">
              {[
                ['ø', frame.avg],
                ['p50', frame.p50],
                ['p95', frame.p95],
                ['p99', frame.p99],
                ['max', frame.max],
              ].map(([label, v]) => (
                <div key={label as string} className="rounded bg-zinc-900 border border-zinc-800 px-1 py-0.5">
                  <div className="text-zinc-600">{label}</div>
                  <div className="text-zinc-200">{formatMs(v as number)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sections */}
        <div>
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">
            Par système
          </div>
          <div className="flex flex-col gap-1">
            {snapshot?.sections.map((s) => (
              <SectionBar key={s.name} name={s.name} avg={s.avg} p95={s.p95} maxAvg={maxAvg} />
            )) ?? <span className="text-zinc-600 text-[11px]">Collecte…</span>}
          </div>
        </div>

        {/* Physics debug */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-2.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={physicsDebug}
              onChange={onTogglePhysicsDebug}
              className="w-3.5 h-3.5 accent-emerald-500"
            />
            <Bug className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-zinc-200">Wireframes physiques</span>
          </label>
          <div className="mt-1 text-[10px] text-zinc-500 leading-snug">
            Colliders + joints Rapier. Visible en <span className="text-zinc-300">Play</span> uniquement
            (le monde n&apos;existe qu&apos;en simulation). Clics et projectiles laissent des traces.
          </div>
          {snapshot && (
            <div className="mt-1 font-mono text-[10px] text-zinc-400">
              {snapshot.physicsBodies} corps · {snapshot.isPlaying ? 'simulation active' : 'éditeur'}
            </div>
          )}
        </div>

        {/* Memory */}
        <div className="rounded-xl bg-zinc-900/70 border border-zinc-800 p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
              <span>Mémoire GPU</span>
            </div>
            <button
              type="button"
              onClick={onSnapshotMemory}
              className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500"
              title="Prend un snapshot mémoire horodaté"
            >
              Snapshot
            </button>
          </div>
          {snapshot?.memory ? (
            <div className="mt-1.5 grid grid-cols-3 gap-1 text-center font-mono text-[9px]">
              {[
                ['géométries', `${snapshot.memory.geometries}`],
                ['textures', `${snapshot.memory.textures}`],
                ['matériaux', `${snapshot.memory.materials}`],
                ['programmes', `${snapshot.memory.programs}`],
                ['triangles', `${snapshot.memory.triangles.toLocaleString()}`],
                ['VRAM ≈', formatBytes(snapshot.memory.gpuBytesEstimate)],
              ].map(([label, v]) => (
                <div key={label as string} className="rounded bg-zinc-950 border border-zinc-800 px-1 py-1">
                  <div className="text-zinc-600">{label}</div>
                  <div className="text-zinc-200 text-[10px]">{v}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-[10px] text-zinc-600">
              Lancez Play/Stop (snapshots auto) ou cliquez Snapshot.
            </div>
          )}
          {snapshot?.memory && snapshot.memory.leaks.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-1">
              {snapshot.memory.leaks.map((leak, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[10px] text-amber-200 leading-snug"
                >
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{leak}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
