'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneManager } from '../../lib/SceneManager';
import { BroadcastLiveLink, WebRtcLiveLink } from '../../lib/live/link';
import type { LiveLink, LiveMsg } from '../../lib/live/link';
import { decodeSceneFromHash } from '../../lib/share/shareUrl';

/**
 * Route /preview — visionneuse live (5.3).
 *
 * 3 modes : lien statique (`#s=…`, decode → play local), broadcast
 * même-appareil (`?room=…`, zéro config) et WebRTC (code collé, autre appareil).
 * Reçoit scène complète + ops + caméra hôte + état Play.
 */
export default function PreviewPage(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const smRef = useRef<SceneManager | null>(null);
  const linkRef = useRef<LiveLink | null>(null);
  const followRef = useRef(true);
  const [status, setStatus] = useState('Initialisation…');
  const [follow, setFollow] = useState(true);
  const [code, setCode] = useState('');
  const [playing, setPlaying] = useState(false);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const sm = new SceneManager(container, {
      onSelectionChange: () => {},
      onHierarchyChange: () => {},
      onTransformChange: () => {},
      onStatsUpdate: () => {},
      onPlayStateChange: (p) => setPlaying(p),
      onHUDConfigChange: () => {},
    });
    smRef.current = sm;

    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || 'aether-live';
    const hash = window.location.hash;

    const applyMsg = (msg: LiveMsg): void => {
      const s = smRef.current;
      if (!s) return;
      try {
        if (msg.t === 'live-scene') {
          s.importLiveScene(msg.scene);
          setStatus('Scène reçue — lecture.');
          setDetail(`${msg.scene.nodes?.length ?? 0} nœuds`);
        } else if (msg.t === 'live-ops') {
          s.applyLiveOps(msg.ops);
        } else if (msg.t === 'live-camera') {
          if (!followRef.current) return;
          s.camera.position.set(msg.pos[0], msg.pos[1], msg.pos[2]);
          s.camera.quaternion.set(msg.quat[0], msg.quat[1], msg.quat[2], msg.quat[3]);
          if (s.camera instanceof THREE.PerspectiveCamera && Math.abs(s.camera.fov - msg.fov) > 0.5) {
            s.camera.fov = msg.fov;
            s.camera.updateProjectionMatrix();
          }
        } else if (msg.t === 'live-play') {
          void s.setPlayMode(msg.playing);
        }
      } catch (err) {
        setStatus(`Erreur aperçu : ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    let link: LiveLink | null = null;
    let cancelled = false;

    const start = async (): Promise<void> => {
      // 1. Lien statique : pas d'hôte requis.
      if (hash.includes('#s=')) {
        try {
          setStatus('Décodage du lien…');
          const scene = await decodeSceneFromHash(hash);
          if (cancelled) return;
          sm.importLiveScene(scene);
          await sm.setPlayMode(true);
          setStatus('Lecture du lien partagé.');
          setDetail(`${scene.nodes?.length ?? 0} nœuds`);
        } catch (err) {
          setStatus(`Lien illisible : ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }
      // 2. Broadcast même-appareil (défaut) : attend l'hôte.
      try {
        const bc = new BroadcastLiveLink(room, false);
        if (bc.available) {
          link = bc;
          linkRef.current = link;
          link.onMessage = applyMsg;
          link.send({ t: 'live-hello', name: 'Visionneuse' });
          setStatus(`En attente de l’hôte (onglets : canal « ${room} »)…`);
          setDetail('Astuce : lancez « Diffuser » dans l’éditeur, ou collez un code WebRTC ci-dessous.');
        } else {
          setStatus('Broadcast indisponible — collez un code WebRTC.');
        }
      } catch {
        setStatus('Collez un code WebRTC pour rejoindre.');
      }
    };
    void start();

    // L'utilisateur reprend la caméra à la première interaction.
    const stopFollow = (): void => {
      if (followRef.current) setFollow(false);
    };
    container.addEventListener('pointerdown', stopFollow);

    return () => {
      cancelled = true;
      container.removeEventListener('pointerdown', stopFollow);
      try {
        link?.close();
      } catch {
        /* ignore */
      }
      linkRef.current = null;
      try {
        sm.dispose();
      } catch {
        /* ignore */
      }
      smRef.current = null;
    };
  }, []);

  const joinWebRtc = async (): Promise<void> => {
    if (!code.trim()) return;
    try {
      setStatus('Connexion WebRTC…');
      try {
        linkRef.current?.close();
      } catch {
        /* ignore */
      }
      const { link, answer } = await WebRtcLiveLink.join(code.trim());
      linkRef.current = link;
      link.onMessage = (msg: LiveMsg) => {
        const s = smRef.current;
        if (!s) return;
        try {
          if (msg.t === 'live-scene') {
            s.importLiveScene(msg.scene);
            setStatus('Scène reçue — lecture.');
          } else if (msg.t === 'live-ops') {
            s.applyLiveOps(msg.ops);
          } else if (msg.t === 'live-camera') {
            if (!followRef.current) return;
            s.camera.position.set(msg.pos[0], msg.pos[1], msg.pos[2]);
            s.camera.quaternion.set(msg.quat[0], msg.quat[1], msg.quat[2], msg.quat[3]);
          } else if (msg.t === 'live-play') {
            void s.setPlayMode(msg.playing);
          }
        } catch (err) {
          setStatus(`Erreur aperçu : ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      link.send({ t: 'live-hello', name: 'Visionneuse' });
      setStatus('Connecté — renvoyez cette réponse à l’hôte, en attente de scène…');
      setCode(answer);
    } catch (err) {
      setStatus(`Connexion impossible : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0c0e14] text-zinc-100 overflow-hidden">
      <div ref={containerRef} id="aether-preview-viewport" className="absolute inset-0" />
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-sm">
        <div className="rounded-2xl bg-zinc-950/85 backdrop-blur border border-zinc-800 px-3 py-2 text-xs">
          <div className="font-semibold flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${playing ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            Aperçu live {playing ? '— lecture' : '— en pause'}
          </div>
          <div className="text-zinc-400 mt-0.5">{status}</div>
          {detail && <div className="text-zinc-500 font-mono text-[10px] mt-0.5">{detail}</div>}
        </div>
        <div className="rounded-2xl bg-zinc-950/85 backdrop-blur border border-zinc-800 px-3 py-2 text-xs flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-zinc-300">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-emerald-500" />
            Suivre la caméra de l’hôte
          </label>
          <div className="flex gap-1.5">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code WebRTC distant…"
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[10px] outline-none placeholder:text-zinc-600"
            />
            <button
              type="button"
              onClick={() => void joinWebRtc()}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold"
            >
              Rejoindre
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
