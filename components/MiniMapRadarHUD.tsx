'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Compass, Maximize2, Minimize2, MapPin } from 'lucide-react';
import { SceneManager } from '../lib/SceneManager';
import * as THREE from 'three';

interface RadarWidgetProps {
  sceneManagerRef: React.MutableRefObject<SceneManager | null>;
}

interface RadarEntity {
  id: string;
  name: string;
  type: 'player' | 'enemy' | 'collectable' | 'waypoint' | 'vehicle' | 'light' | 'other';
  x: number;
  z: number;
  rotationY: number;
}

/**
 * Bande directionnelle (boussole) — rendue comme élément HUD ancré (top-center).
 * Le positionnement est fourni par le conteneur parent (InGameHUDOverlay).
 */
export const CompassStrip: React.FC<RadarWidgetProps> = ({ sceneManagerRef }) => {
  const [headingDegrees, setHeadingDegrees] = useState<number>(0);
  const [nearestTargetDist, setNearestTargetDist] = useState<number | null>(null);

  useEffect(() => {
    let animId: number;

    const tick = () => {
      const sm = sceneManagerRef.current;
      const ecsWorld = sm?.ecsWorld;
      const camera = sm?.camera;

      if (!ecsWorld) {
        animId = requestAnimationFrame(tick);
        return;
      }

      const playerPos = new THREE.Vector3(0, 0, 0);
      let playerHeading = 0;
      let minDist = Infinity;

      ecsWorld.getAllEntities().forEach((ent) => {
        if (!ent.active || !ent.object3D) return;

        const pos = ent.object3D.position;
        const nameLower = ent.name.toLowerCase();
        const subType = ent.object3D.userData?.subType || '';

        if (subType === 'player' || nameLower.includes('player') || nameLower.includes('joueur')) {
          playerPos.copy(pos);
          playerHeading = ent.object3D.rotation.y;
        } else if (
          nameLower.includes('waypoint') ||
          nameLower.includes('target') ||
          nameLower.includes('objective') ||
          nameLower.includes('coin') ||
          nameLower.includes('collectable') ||
          nameLower.includes('star')
        ) {
          const dx = pos.x - playerPos.x;
          const dz = pos.z - playerPos.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < minDist) minDist = d;
        }
      });

      // Heading camera (fallback : rotation joueur)
      if (camera) {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const angle = Math.atan2(camDir.x, camDir.z) * (180 / Math.PI) + 180;
        setHeadingDegrees(Math.round(angle));
      } else {
        let angle = (playerHeading * (180 / Math.PI)) % 360;
        if (angle < 0) angle += 360;
        setHeadingDegrees(Math.round(angle));
      }

      setNearestTargetDist(minDist < Infinity ? Math.round(minDist) : null);

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [sceneManagerRef]);

  return (
    <div className="flex flex-col items-center select-none">
      <div className="flex items-center gap-2 px-3 py-1 rounded-2xl bg-zinc-950/85 border border-sky-500/30 shadow-2xl backdrop-blur-md">
        <Compass className="w-4 h-4 text-sky-400 animate-pulse" />

        {/* Scrolling Compass Tape Representation */}
        <div className="relative w-48 h-5 overflow-hidden flex items-center justify-center">
          {/* Center Pointer Notch */}
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-sky-400 z-10 shadow-[0_0_8px_#38bdf8]" />

          <div
            className="flex items-center gap-6 font-mono font-bold text-xs text-zinc-300 transition-transform duration-75"
            style={{
              transform: `translateX(${((headingDegrees % 360) / 360) * -120}px)`,
            }}
          >
            <span className="text-amber-400">N</span>
            <span>45°</span>
            <span className="text-sky-400">E</span>
            <span>135°</span>
            <span className="text-amber-400">S</span>
            <span>225°</span>
            <span className="text-sky-400">W</span>
            <span>315°</span>
            <span className="text-amber-400">N</span>
          </div>
        </div>

        <span className="font-mono text-xs font-bold text-sky-300 w-9 text-right">
          {headingDegrees}°
        </span>
      </div>

      {/* Target Distance Indicator */}
      {nearestTargetDist !== null && (
        <div className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-[10px] font-mono font-semibold text-cyan-300 shadow-md">
          <MapPin className="w-3 h-3 text-cyan-400" />
          <span>Objectif: {nearestTargetDist}m</span>
        </div>
      )}
    </div>
  );
};

/**
 * Radar minimap 2D (canvas) — rendu comme élément HUD ancré (bottom-right).
 * Le positionnement est fourni par le conteneur parent (InGameHUDOverlay).
 */
export const RadarMinimap: React.FC<RadarWidgetProps> = ({ sceneManagerRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [radarRange, setRadarRange] = useState<number>(40); // 40 meters radius
  const [isSquareMode, setIsSquareMode] = useState<boolean>(false);

  useEffect(() => {
    let animId: number;

    const renderRadar = () => {
      const canvas = canvasRef.current;
      const sm = sceneManagerRef.current;
      const ecsWorld = sm?.ecsWorld;

      if (!canvas || !ecsWorld) {
        animId = requestAnimationFrame(renderRadar);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(renderRadar);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 8;

      // 1. Gather entities
      const entities = ecsWorld.getAllEntities();
      let playerPos = new THREE.Vector3(0, 0, 0);
      let playerHeading = 0;

      const radarEntities: RadarEntity[] = [];

      entities.forEach((ent) => {
        if (!ent.active || !ent.object3D) return;

        const pos = ent.object3D.position;
        const nameLower = ent.name.toLowerCase();
        const subType = ent.object3D.userData?.subType || '';

        let type: RadarEntity['type'] = 'other';

        if (subType === 'player' || nameLower.includes('player') || nameLower.includes('joueur')) {
          type = 'player';
          playerPos.copy(pos);
          playerHeading = ent.object3D.rotation.y;
        } else if (nameLower.includes('enemy') || nameLower.includes('ennemi') || nameLower.includes('npc')) {
          type = 'enemy';
        } else if (nameLower.includes('coin') || nameLower.includes('collectable') || nameLower.includes('star')) {
          type = 'collectable';
        } else if (nameLower.includes('waypoint') || nameLower.includes('target') || nameLower.includes('objective')) {
          type = 'waypoint';
        } else if (subType === 'vehicle' || nameLower.includes('car') || nameLower.includes('voiture')) {
          type = 'vehicle';
        } else if (nameLower.includes('light') || nameLower.includes('lamp')) {
          type = 'light';
        }

        radarEntities.push({
          id: ent.id,
          name: ent.name,
          type,
          x: pos.x,
          z: pos.z,
          rotationY: ent.object3D.rotation.y,
        });
      });

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // Draw radar background
      ctx.save();

      if (!isSquareMode) {
        // Circular mask
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(9, 9, 11, 0.85)';
        ctx.fill();
        ctx.clip();
      } else {
        // Square background
        ctx.fillStyle = 'rgba(9, 9, 11, 0.85)';
        ctx.fillRect(4, 4, width - 8, height - 8);
      }

      // Grid Rings / Lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.lineWidth = 1;

      // Concentric circles
      [0.33, 0.66, 1.0].forEach((rRatio) => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * rRatio, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crosshair axis
      ctx.beginPath();
      ctx.moveTo(centerX - radius, centerY);
      ctx.lineTo(centerX + radius, centerY);
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX, centerY + radius);
      ctx.stroke();

      // Dynamic Rotating Radar Sweep Line
      const sweepAngle = (Date.now() / 1500) % (Math.PI * 2);

      const sweepGrad = ctx.createConicGradient(sweepAngle, centerX, centerY);
      sweepGrad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      sweepGrad.addColorStop(0.15, 'rgba(56, 189, 248, 0.05)');
      sweepGrad.addColorStop(0.25, 'transparent');

      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();

      // Draw Entities on Radar
      radarEntities.forEach((ent) => {
        if (ent.type === 'player') return; // Player drawn at center

        // Relative pos in meters
        const relX = ent.x - playerPos.x;
        const relZ = ent.z - playerPos.z;

        // Scale meters to canvas pixels
        const pixelScale = radius / radarRange;
        const screenX = centerX + relX * pixelScale;
        const screenY = centerY + relZ * pixelScale;

        // Check bounds
        const distFromCenter = Math.sqrt(
          (screenX - centerX) ** 2 + (screenY - centerY) ** 2
        );

        if (!isSquareMode && distFromCenter > radius - 6) return;
        if (
          isSquareMode &&
          (screenX < 8 || screenX > width - 8 || screenY < 8 || screenY > height - 8)
        ) {
          return;
        }

        ctx.save();
        ctx.translate(screenX, screenY);

        if (ent.type === 'enemy') {
          // Red enemy dot / triangle
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (ent.type === 'collectable') {
          // Yellow coin dot
          ctx.fillStyle = '#f59e0b';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (ent.type === 'waypoint') {
          // Cyan objective diamond
          ctx.fillStyle = '#06b6d4';
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, -5);
          ctx.lineTo(5, 0);
          ctx.lineTo(0, 5);
          ctx.lineTo(-5, 0);
          ctx.closePath();
          ctx.fill();
        } else if (ent.type === 'vehicle') {
          // Blue vehicle rectangle
          ctx.fillStyle = '#3b82f6';
          ctx.shadowColor = '#3b82f6';
          ctx.shadowBlur = 6;
          ctx.fillRect(-3, -3, 6, 6);
        } else {
          // White default dot
          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.arc(0, 0, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      // Draw Center Player Marker (Arrow pointing in player heading)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(playerHeading);

      // Player Arrow
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      ctx.restore(); // Restore mask clip

      // Border ring
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      if (!isSquareMode) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(4, 4, width - 8, height - 8);
      }

      // Cardinal N, E, S, W indicators on rim
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (!isSquareMode) {
        ctx.fillText('N', centerX, centerY - radius + 10);
        ctx.fillText('S', centerX, centerY + radius - 10);
        ctx.fillText('E', centerX + radius - 10, centerY);
        ctx.fillText('W', centerX - radius + 10, centerY);
      }

      animId = requestAnimationFrame(renderRadar);
    };

    animId = requestAnimationFrame(renderRadar);
    return () => cancelAnimationFrame(animId);
  }, [sceneManagerRef, radarRange, isSquareMode]);

  return (
    <div className="flex flex-col items-end gap-1.5 select-none pointer-events-auto">
      <div className="relative p-1 rounded-3xl bg-zinc-950/90 border border-sky-500/30 shadow-2xl backdrop-blur-xl group">
        <canvas
          ref={canvasRef}
          width={160}
          height={160}
          className="rounded-2xl block cursor-crosshair"
        />

        {/* Mini-map overlays / controls */}
        <div className="absolute top-2 left-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setIsSquareMode(!isSquareMode)}
            className="p-1 rounded-lg bg-zinc-900/90 border border-zinc-700/80 text-zinc-300 hover:text-white transition-colors"
            title={isSquareMode ? 'Mode Radar Circulaire' : 'Mode Carte Carrée'}
          >
            {isSquareMode ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={() => setRadarRange((r) => (r === 40 ? 70 : r === 70 ? 25 : 40))}
            className="px-1.5 py-0.5 rounded-lg bg-zinc-900/90 border border-zinc-700/80 text-[10px] font-mono text-sky-400 hover:text-white transition-colors"
            title="Ajuster la portée du radar"
          >
            {radarRange}m
          </button>
        </div>
      </div>
    </div>
  );
};
