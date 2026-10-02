import * as THREE from 'three';
import { NET_INTERP_DELAY_MS, NET_EXTRAPOLATE_MAX_MS } from './types';
import type { NetEntityState, SnapshotMsg } from './types';

interface InterpSample {
  time: number; // horloge host (ms)
  recvAt: number; // horloge locale (ms)
  state: NetEntityState;
}

interface RemoteEntry {
  id: string;
  isPlayer: boolean;
  displayName: string;
  color: number;
  samples: InterpSample[];
  lastRecvAt: number; // horloge locale (ms)
  proxy: THREE.Object3D | null;
  label: THREE.Sprite | null;
  hiddenSpectator: boolean;
}

/**
 * RemoteEntityManager — interpolation + extrapolation des entités distantes.
 *
 * Joueurs : proxy capsule colorée + étiquette nom (runtime-only, jamais
 * exportés, jamais dans le registre `objects`). Props réseau (`n:<nodeId>`) :
 * transform appliquée directement à l'objet de scène s'il existe (même scène
 * chargée des deux côtés).
 *
 * Interpolation : délai de rendu 120 ms, lerp entre les 2 snapshots qui
 * encadrent le temps de rendu. Extrapolation : dead reckoning linéaire
 * (vélocité snapshot) jusqu'à 300 ms, puis gel.
 */
export class RemoteEntityManager {
  /** id du joueur local (jamais de proxy pour soi-même). */
  public localPlayerId: string | null = null;
  /** Résout un objet de scène par node id (props réseau). */
  public resolveNode: ((nodeId: string) => THREE.Object3D | undefined) | null = null;

  private readonly scene: THREE.Scene;
  private readonly entries = new Map<string, RemoteEntry>();
  private clockOffsetMs = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Recale l'horloge (pong : time host + rtt/2). */
  public setClockOffset(offsetMs: number): void {
    this.clockOffsetMs = offsetMs;
  }

  public ingest(snap: SnapshotMsg): void {
    const now = performance.now();
    if (snap.gone) {
      for (const id of snap.gone) this.remove(id);
    }
    const seen = new Set<string>();
    for (const s of snap.states) {
      seen.add(s.id);
      let e = this.entries.get(s.id);
      if (!e) {
        e = {
          id: s.id,
          isPlayer: s.id.startsWith('p:'),
          displayName: s.id,
          color: colorForId(s.id),
          samples: [],
          lastRecvAt: now,
          proxy: null,
          label: null,
          hiddenSpectator: false,
        };
        this.entries.set(s.id, e);
      }
      e.samples.push({ time: snap.time, recvAt: now, state: s });
      if (e.samples.length > 8) e.samples.splice(0, e.samples.length - 8);
      e.lastRecvAt = now;
      const spectator = (s.f & 2) !== 0;
      if (spectator !== e.hiddenSpectator) {
        e.hiddenSpectator = spectator;
        if (e.proxy) e.proxy.visible = !spectator;
        if (e.label) e.label.visible = !spectator;
      }
    }
  }

  public setDisplayName(id: string, name: string): void {
    const e = this.entries.get(id);
    if (e) {
      e.displayName = name;
      if (e.label) {
        e.label.material.map = makeLabelTexture(name);
        e.label.material.needsUpdate = true;
      }
    }
  }

  public remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.proxy) this.scene.remove(e.proxy);
    if (e.label) {
      this.scene.remove(e.label);
      e.label.material.map?.dispose();
      e.label.material.dispose();
    }
    this.entries.delete(id);
  }

  public clear(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
  }

  /** État serveur le plus récent (pour la réconciliation du joueur local). */
  public latest(id: string): NetEntityState | null {
    const e = this.entries.get(id);
    if (!e || e.samples.length === 0) return null;
    return e.samples[e.samples.length - 1].state;
  }

  public update(): void {
    const now = performance.now();
    const renderTime = now + this.clockOffsetMs - NET_INTERP_DELAY_MS;
    for (const e of this.entries.values()) {
      if (e.id === this.localPlayerId) continue;
      if (e.isPlayer) {
        this.updatePlayerProxy(e, renderTime, now);
      } else {
        this.updateNetProp(e, renderTime, now);
      }
    }
  }

  private ensureProxy(e: RemoteEntry): void {
    if (e.proxy) return;
    const group = new THREE.Group();
    group.name = `__AETHER_NETREMOTE__${e.id}`;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1.0, 8, 16),
      new THREE.MeshStandardMaterial({ color: e.color, roughness: 0.4, metalness: 0.4 })
    );
    body.position.y = 0;
    body.castShadow = true;
    group.add(body);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.16, 0.28),
      new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: new THREE.Color(e.color),
        emissiveIntensity: 1.2,
      })
    );
    visor.position.set(0, 0.42, -0.28);
    group.add(visor);
    group.traverse((o) => {
      o.userData.isNetRemote = true;
    });
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeLabelTexture(e.displayName), transparent: true, depthWrite: false })
    );
    label.scale.set(2.2, 0.55, 1);
    label.position.y = 2.3;
    label.raycast = () => {};
    group.add(label);
    e.label = label;
    e.proxy = group;
    this.scene.add(group);
  }

  private updatePlayerProxy(e: RemoteEntry, renderTime: number, now: number): void {
    if (e.samples.length === 0) return;
    this.ensureProxy(e);
    const pose = samplePose(e.samples, renderTime, now);
    if (!pose) return;
    e.proxy!.position.set(pose.p[0], pose.p[1], pose.p[2]);
    e.proxy!.rotation.set(0, pose.y, 0);
    const vis = !e.hiddenSpectator;
    e.proxy!.visible = vis;
    if (e.label) e.label.visible = vis;
  }

  private updateNetProp(e: RemoteEntry, renderTime: number, now: number): void {
    const obj = this.resolveNode?.(e.id.slice(2));
    if (!obj) return;
    if (e.samples.length === 0) return;
    const pose = samplePose(e.samples, renderTime, now);
    if (!pose) return;
    obj.position.set(pose.p[0], pose.p[1], pose.p[2]);
    if (pose.q) {
      obj.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]);
    } else {
      obj.rotation.set(0, pose.y, 0);
    }
    obj.updateMatrixWorld(true);
  }

  public getStats(): { remotes: number; proxies: number } {
    let proxies = 0;
    for (const e of this.entries.values()) if (e.proxy) proxies++;
    return { remotes: this.entries.size, proxies };
  }
}

interface Pose {
  p: [number, number, number];
  y: number;
  q?: [number, number, number, number];
}

/** Interpolation (lerp) ou extrapolation (dead reckoning) d'une pose. */
function samplePose(samples: InterpSample[], renderTime: number, now: number): Pose | null {
  const n = samples.length;
  if (n === 0) return null;
  const last = samples[n - 1];
  if (n === 1 || last.time <= renderTime) {
    // Pas d'échantillon futur : dead reckoning borné sur la vélocité.
    const s = last.state;
    const ageMs = Math.max(0, now - last.recvAt);
    if (ageMs > NET_EXTRAPOLATE_MAX_MS) {
      return { p: [s.p[0], s.p[1], s.p[2]], y: s.y, q: s.q };
    }
    const t = ageMs / 1000;
    return {
      p: [s.p[0] + s.v[0] * t, s.p[1] + s.v[1] * t, s.p[2] + s.v[2] * t],
      y: s.y,
      q: s.q,
    };
  }
  // Interpolation entre s0 <= renderTime <= s1.
  let i = n - 1;
  while (i > 0 && samples[i - 1].time > renderTime) i--;
  const s0 = samples[Math.max(0, i - 1)];
  const s1 = samples[i];
  const span = Math.max(1, s1.time - s0.time);
  const a = Math.min(1, Math.max(0, (renderTime - s0.time) / span));
  let q: [number, number, number, number] | undefined;
  if (s0.state.q && s1.state.q) {
    _qa.set(s0.state.q[0], s0.state.q[1], s0.state.q[2], s0.state.q[3]);
    _qb.set(s1.state.q[0], s1.state.q[1], s1.state.q[2], s1.state.q[3]);
    _qq.slerpQuaternions(_qa, _qb, a);
    q = [_qq.x, _qq.y, _qq.z, _qq.w];
  }
  return {
    p: [
      lerp(s0.state.p[0], s1.state.p[0], a),
      lerp(s0.state.p[1], s1.state.p[1], a),
      lerp(s0.state.p[2], s1.state.p[2], a),
    ],
    y: lerpAngle(s0.state.y, s1.state.y, a),
    q,
  };
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qq = new THREE.Quaternion();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function colorForId(id: string): number {
  const palette = [0xf472b6, 0x4ade80, 0xfacc15, 0xc084fc, 0xfb923c, 0x38bdf8];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function makeLabelTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = Math.min(250, 20 + name.length * 11);
    ctx.beginPath();
    ctx.roundRect((256 - w) / 2, 12, w, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 16), 128, 33);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
