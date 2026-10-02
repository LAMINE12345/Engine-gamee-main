'use client';

import { Zap, Car } from 'lucide-react';

interface SpeedometerHUDProps {
  speedKmH: number;
  maxSpeedKmH?: number;
  isDrifting?: boolean;
  isBoosting?: boolean;
}

export const SpeedometerHUD: React.FC<SpeedometerHUDProps> = ({
  speedKmH = 0,
  maxSpeedKmH = 180,
  isDrifting = false,
  isBoosting = false,
}) => {
  const currentSpeed = Math.abs(speedKmH);

  let gear = 'N';
  let rpm = 900;

  if (currentSpeed === 0) {
    gear = 'N';
    rpm = 900;
  } else if (currentSpeed < 30) {
    gear = '1';
    rpm = 1000 + (currentSpeed / 30) * 5000;
  } else if (currentSpeed < 65) {
    gear = '2';
    rpm = 2000 + ((currentSpeed - 30) / 35) * 5000;
  } else if (currentSpeed < 105) {
    gear = '3';
    rpm = 2500 + ((currentSpeed - 65) / 40) * 4500;
  } else if (currentSpeed < 145) {
    gear = '4';
    rpm = 3000 + ((currentSpeed - 105) / 40) * 4000;
  } else {
    gear = '5';
    rpm = 3500 + Math.min(3500, ((currentSpeed - 145) / 50) * 3500);
  }

  const rpmPercent = Math.min(100, (rpm / 8000) * 100);
  const speedPercent = Math.min(100, (Math.abs(speedKmH) / maxSpeedKmH) * 100);

  return (
    <div className="absolute bottom-56 right-6 pointer-events-none z-30 flex flex-col items-end gap-3 select-none">
      {/* Drift / Nitro Banner Status */}
      {(isDrifting || isBoosting) && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-sky-500/50 shadow-lg animate-bounce">
          {isBoosting && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <Zap className="w-4 h-4 fill-amber-400 text-amber-400 animate-pulse" />
              <span>NITRO BOOST</span>
            </div>
          )}
          {isDrifting && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
              <Car className="w-4 h-4 text-sky-400" />
              <span>DRIFT SLIDE</span>
            </div>
          )}
        </div>
      )}

      {/* Main Glassmorphism Dashboard Gauge */}
      <div className="relative p-4 rounded-3xl bg-zinc-950/85 backdrop-blur-xl border border-zinc-800/90 shadow-2xl flex items-center gap-5">
        {/* Speed Arc Ring */}
        <div className="relative w-28 h-28 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
            {/* Background Arc */}
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="#27272a"
              strokeWidth="7"
              fill="transparent"
              strokeDasharray="251.2"
              strokeDashoffset="62.8"
              strokeLinecap="round"
            />
            {/* Speed Value Arc */}
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke={speedPercent > 80 ? '#f43f5e' : '#38bdf8'}
              strokeWidth="7"
              fill="transparent"
              strokeDasharray="251.2"
              strokeDashoffset={251.2 - (speedPercent / 100) * 188.4}
              strokeLinecap="round"
              className="transition-all duration-150 ease-out"
            />
          </svg>

          {/* Center Digital Speed Reading */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-black font-mono tracking-tight text-white leading-none">
              {Math.abs(speedKmH)}
            </span>
            <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mt-0.5">
              KM/H
            </span>
          </div>
        </div>

        {/* Tachometer & Gear Box */}
        <div className="flex flex-col gap-2.5 justify-center min-w-[100px]">
          {/* Gear Display Box */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              RAPPORT
            </span>
            <span className="text-xl font-black font-mono text-sky-400">{gear}</span>
          </div>

          {/* RPM Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-semibold text-zinc-400">
              <span>RPM x1000</span>
              <span className="font-mono text-zinc-300">{(rpm / 1000).toFixed(1)}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  rpmPercent > 85 ? 'bg-rose-500' : 'bg-gradient-to-r from-sky-500 to-amber-400'
                }`}
                style={{ width: `${rpmPercent}%` }}
              />
            </div>
          </div>

          {/* Nitro / Boost Indicator */}
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-semibold">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Shift : Boost Nitro</span>
          </div>
        </div>
      </div>
    </div>
  );
};
