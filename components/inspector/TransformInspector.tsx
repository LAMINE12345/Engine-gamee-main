'use client';

import React, { useState } from 'react';
import { Sliders, RotateCcw, Link, Unlink } from 'lucide-react';
import type { TransformData } from '../../types/engine';
import { SectionProps, isMulti, mixedValue, copyText } from './types';
import { ComponentHeader } from './ComponentHeader';
import { AxisField, FieldLabel } from './fields';
import { fireComponentMenu } from './ComponentContextMenu';

/**
 * TransformInspector — position / rotation / échelle (locales).
 * Multi-edit : chaque axe est appliqué objet par objet (relatifs préservés),
 * l'échelle uniforme s'applique à tous.
 */
export function TransformInspector({ nodes, onUpdateTransform, collapsed, onToggleCollapse }: SectionProps) {
  const [uniformScale, setUniformScale] = useState(false);
  const multi = isMulti(nodes);

  const pos = (axis: 'x' | 'y' | 'z') => mixedValue(nodes, (n) => n.transform.position[axis]);
  const rot = (axis: 'x' | 'y' | 'z') => mixedValue(nodes, (n) => n.transform.rotation[axis]);
  const scl = (axis: 'x' | 'y' | 'z') => mixedValue(nodes, (n) => n.transform.scale[axis]);
  const globalScale = mixedValue(nodes, (n) => n.transform.scale.x);

  const handlePositionChange = (axis: 'x' | 'y' | 'z', val: number) => {
    nodes.forEach((n) => {
      onUpdateTransform(n.id, {
        position: { ...n.transform.position, [axis]: val },
      });
    });
  };

  const handleRotationChange = (axis: 'x' | 'y' | 'z', deg: number) => {
    nodes.forEach((n) => {
      onUpdateTransform(n.id, {
        rotation: { ...n.transform.rotation, [axis]: deg },
      });
    });
  };

  const handleScaleChange = (axis: 'x' | 'y' | 'z', val: number) => {
    nodes.forEach((n) => {
      onUpdateTransform(n.id, uniformScale
        ? { scale: { x: val, y: val, z: val } }
        : { scale: { ...n.transform.scale, [axis]: val } });
    });
  };

  const handleResetTransform = () => {
    nodes.forEach((n) => {
      onUpdateTransform(n.id, {
        position: { x: 0, y: 0.8, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      } satisfies Partial<TransformData>);
    });
  };

  return (
    <div
      className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 space-y-3"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireComponentMenu(e, multi ? `Transform (×${nodes.length})` : 'Transform', [
          {
            label: 'Copier les valeurs',
            hint: 'JSON',
            onClick: () =>
              copyText(
                JSON.stringify(
                  nodes.map((n) => ({ name: n.name, transform: n.transform })),
                  null,
                  2
                )
              ),
          },
          { label: 'Réinitialiser', onClick: () => handleResetTransform() },
        ]);
      }}
    >
      <ComponentHeader
        icon={<Sliders className="w-3.5 h-3.5 text-sky-400" />}
        title={multi ? `Position & Taille (${nodes.length})` : '📍 Position & Taille'}
        mixed={multi && (pos('x').mixed || pos('y').mixed || pos('z').mixed)}
        collapsed={collapsed ?? false}
        onToggleCollapse={onToggleCollapse ?? (() => {})}
        action={
          <button
            type="button"
            onClick={handleResetTransform}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Réinitialiser l'emplacement"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        }
      />

      {!collapsed && (
        <>
          {/* Simple beginner-friendly control for scale / size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-medium">Taille globale</span>
              <span className="font-mono text-sky-400 font-bold">
                {globalScale.value.toFixed(2)}x{globalScale.mixed ? '≠' : ''}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.05"
              value={globalScale.value}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 1;
                nodes.forEach((n) => {
                  onUpdateTransform(n.id, {
                    scale: { x: val, y: val, z: val },
                  });
                });
              }}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
          </div>

          {/* Collapsible Advanced Coordinates for 3D Designers */}
          <details className="group border-t border-zinc-800/50 pt-2.5" open>
            <summary className="flex items-center justify-between text-[10px] text-zinc-500 font-bold cursor-pointer hover:text-zinc-300 transition-colors list-none select-none">
              <span className="flex items-center gap-1">
                <span>⚙️ Coordonnées Précises</span>
              </span>
              <span className="text-[9px] group-open:rotate-180 transition-transform">▼</span>
            </summary>

            <div className="space-y-3 pt-2.5 mt-1">
              {/* Position X, Y, Z */}
              <div className="space-y-1.5">
                <FieldLabel>Emplacement (X, Y, Z)</FieldLabel>
                <div className="grid grid-cols-3 gap-2">
                  {(['x', 'y', 'z'] as const).map((axis) => {
                    const mv = pos(axis);
                    return (
                      <AxisField
                        key={axis}
                        axis={axis}
                        value={Number(mv.value.toFixed(2))}
                        mixed={mv.mixed}
                        step={0.1}
                        onChange={(val) => handlePositionChange(axis, val)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Rotation X, Y, Z in Degrees */}
              <div className="space-y-1.5">
                <FieldLabel>Rotation (Degrés)</FieldLabel>
                <div className="grid grid-cols-3 gap-2">
                  {(['x', 'y', 'z'] as const).map((axis) => {
                    const mv = rot(axis);
                    return (
                      <AxisField
                        key={axis}
                        axis={axis}
                        value={Math.round(mv.value)}
                        mixed={mv.mixed}
                        step={5}
                        onChange={(val) => handleRotationChange(axis, val)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Scale X, Y, Z (Échelle individuelle) */}
              <div className="space-y-1.5 pt-2 border-t border-zinc-800/40">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 font-medium">Échelle d&apos;axes</span>
                  <button
                    type="button"
                    onClick={() => setUniformScale(!uniformScale)}
                    className={`px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 transition-colors ${
                      uniformScale ? 'text-sky-400 bg-sky-500/10' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {uniformScale ? <Link className="w-2.5 h-2.5" /> : <Unlink className="w-2.5 h-2.5" />}
                    <span>{uniformScale ? 'Lié' : 'Libre'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['x', 'y', 'z'] as const).map((axis) => {
                    const mv = scl(axis);
                    return (
                      <AxisField
                        key={axis}
                        axis={axis}
                        value={Number(mv.value.toFixed(2))}
                        mixed={mv.mixed}
                        step={0.1}
                        min={0.01}
                        onChange={(val) => handleScaleChange(axis, val || 0.1)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
