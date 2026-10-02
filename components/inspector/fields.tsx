'use client';

import React from 'react';

/**
 * fields.tsx — contrôles standardisés qui reproduisent EXACTEMENT le style
 * historique de l'Inspector (aucun changement visuel, juste factorisé).
 */

const AXIS_STYLES: Record<'x' | 'y' | 'z', { text: string; bg: string }> = {
  x: { text: 'text-rose-500', bg: 'bg-rose-500/10' },
  y: { text: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  z: { text: 'text-blue-500', bg: 'bg-blue-500/10' },
};

/** Champ numérique avec badge d'axe coloré (X/Y/Z), comme les coordonnées. */
export function AxisField({
  axis,
  value,
  onChange,
  step = 0.1,
  min,
  mixed,
}: {
  axis: 'x' | 'y' | 'z';
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  mixed?: boolean;
}) {
  const style = AXIS_STYLES[axis];
  return (
    <div
      className={`flex items-center bg-zinc-950 border border-zinc-800/80 rounded-lg overflow-hidden focus-within:border-sky-500 ${
        mixed ? 'ring-1 ring-amber-500/50' : ''
      }`}
      title={mixed ? 'Valeurs différentes selon les objets (≠)' : undefined}
    >
      <span
        className={`px-1.5 py-1 text-[9px] font-bold ${style.text} select-none ${style.bg} uppercase`}
      >
        {axis}
        {mixed ? '≠' : ''}
      </span>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent px-1 py-0.5 text-zinc-200 text-[11px] focus:outline-none text-right font-mono"
      />
    </div>
  );
}

/** Ligne slider avec label + valeur (ex. Taille globale, Roughness...). */
export function SliderRow({
  label,
  display,
  value,
  onChange,
  min,
  max,
  step,
  accent = 'accent-sky-500',
  mixed,
}: {
  label: string;
  display: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  accent?: string;
  mixed?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400 font-medium">
          {label}
          {mixed && <span className="ml-1 text-amber-400 font-bold" title="Valeurs différentes (≠)">≠</span>}
        </span>
        <span className="font-mono text-sky-400 font-bold">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${accent}`}
      />
    </div>
  );
}

/** Ligne de label section simple (ex. "Emplacement (X, Y, Z)"). */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] text-zinc-400 font-medium">{children}</span>;
}

/**
 * Slider stylé historique (label + valeur mono + range fin).
 * Reproduit le motif VFX/matériau/physique (h-1, accent paramétrable).
 */
export function StyledSlider({
  label,
  display,
  value,
  onChange,
  min,
  max,
  step,
  accent = 'accent-purple-500',
  displayClassName = 'font-mono text-purple-400',
  labelClassName = 'text-zinc-300',
  mixed,
}: {
  label: React.ReactNode;
  display: React.ReactNode;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  accent?: string;
  displayClassName?: string;
  labelClassName?: string;
  mixed?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className={labelClassName}>
          {label}
          {mixed && (
            <span className="ml-1 text-amber-400 font-bold" title="Valeurs différentes (≠)">≠</span>
          )}
        </span>
        <span className={displayClassName}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${accent}`}
      />
    </div>
  );
}

/** Alias sémantique (même rendu). */
export const PurpleSlider = StyledSlider;

/** Pastille couleur + hex (motif VFX / matériau). */
export function ColorSwatch({
  label,
  value,
  fallback = '#ff0000',
  onChange,
}: {
  label: string;
  value: string;
  fallback?: string;
  onChange: (hex: string) => void;
}) {
  const shown = value || fallback;
  return (
    <div className="space-y-1">
      <span className="text-[10px] text-zinc-400">{label}</span>
      <div className="flex items-center gap-2">
        <div
          className="w-5 h-5 rounded-md border border-zinc-800 shadow-inner cursor-pointer relative overflow-hidden"
          style={{ backgroundColor: shown }}
        >
          <input
            type="color"
            value={shown}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>
        <span className="text-[10px] font-mono text-zinc-300 uppercase">{shown}</span>
      </div>
    </div>
  );
}

/** Ligne couleur horizontale (motif rivière : label + pastille + hex). */
export function InlineColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-zinc-300">{label}</span>
      <div className="flex items-center gap-2">
        <div
          className="w-5 h-5 rounded-md border border-zinc-700 relative overflow-hidden"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
          />
        </div>
        <span className="font-mono text-[10px] text-zinc-400 uppercase">
          {value}
        </span>
      </div>
    </div>
  );
}

/** Interrupteur nu (motif matériau/ombres : w-9 h-5, pastille blanche). */
export function MiniSwitch({
  active,
  onToggle,
  activeColor = 'bg-sky-500',
  title,
}: {
  active: boolean;
  onToggle: () => void;
  activeColor?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
        active ? `${activeColor} justify-end` : 'bg-zinc-800 justify-start'
      }`}
    >
      <span className="w-4 h-4 rounded-full bg-white shadow-md" />
    </button>
  );
}

/** Interrupteur iOS-like (motif sculpture du lit). */
export function SwitchToggle({
  label,
  desc,
  active,
  onToggle,
  activeColor = 'bg-cyan-500',
}: {
  label: string;
  desc?: string;
  active: boolean;
  onToggle: () => void;
  activeColor?: string;
}) {
  return (
    <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/60">
      <div>
        <div className="text-[11px] font-medium text-zinc-200">{label}</div>
        {desc && <div className="text-[9px] text-zinc-500">{desc}</div>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
          active ? `${activeColor} justify-end` : 'bg-zinc-800 justify-start'
        }`}
      >
        <span className="w-4 h-4 rounded-full bg-white shadow-md" />
      </button>
    </div>
  );
}

/** Toggle pill (motif boucle d'émission). */
export function PillToggle({
  label,
  active,
  activeLabel,
  inactiveLabel,
  onToggle,
  color = 'purple',
}: {
  label: string;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onToggle: () => void;
  color?: 'purple' | 'emerald' | 'sky' | 'amber';
}) {
  const activeCls: Record<string, string> = {
    purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    sky: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };
  return (
    <div className="flex items-center justify-between pt-1">
      <span className="text-[11px] text-zinc-300">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`text-[10px] px-3 py-1 rounded-full font-bold transition-all border ${
          active ? activeCls[color] : 'bg-zinc-800 text-zinc-500 border-zinc-700/50'
        }`}
      >
        {active ? activeLabel : inactiveLabel}
      </button>
    </div>
  );
}
