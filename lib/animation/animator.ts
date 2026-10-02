import * as THREE from 'three';
import { normalizeAnimatorController, defaultAnimatorController } from '../../types/animation';
import type {
  AnimatorControllerData,
  AnimState,
  AnimParamType,
  AnimEvent,
} from '../../types/animation';
import type { AnimationManager } from './AnimationManager';

export interface AnimatorEventPayload {
  uuid: string;
  objectName: string;
  stateName: string;
  event: AnimEvent;
}

export interface AnimatorDeps {
  objects: Map<string, THREE.Object3D>;
  animationManager: AnimationManager;
  /** Mixer courant (créé à la demande si clips dispos). */
  getMixer: (uuid: string) => THREE.AnimationMixer | null;
  getClips: (uuid: string) => THREE.AnimationClip[];
  /** Auto-params scène (vitesse mesurée + grounded rig). */
  readAutoParams: (uuid: string, measuredSpeed: number) => {
    speed: number;
    moving: boolean;
    grounded: boolean;
  };
  onEvent: (payload: AnimatorEventPayload) => void;
}

interface LayerRuntime {
  current: string | null;
  time: number;
  prevNorm: number;
  from: string | null;
  fromTime: number;
  blend: number; // 0..1 (1 = fondu terminé)
  blendDur: number;
  mixer: THREE.AnimationMixer | null;
  actions: Map<string, THREE.AnimationAction>;
  pausedTracks: Set<string>;
}

interface ObjectRuntime {
  uuid: string;
  src: AnimatorControllerData;
  params: Map<string, { type: AnimParamType; value: number | boolean }>;
  layers: LayerRuntime[];
  lastPos: THREE.Vector3 | null;
  lastDir: THREE.Vector3 | null;
  speed: number;
  turnRate: number;
  matchTimer: number;
  dwellTimer: number;
}

const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _pa = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qo = new THREE.Quaternion();
const _sa = new THREE.Vector3();

function newLayerRuntime(): LayerRuntime {  return {
    current: null,
    time: 0,
    prevNorm: 0,
    from: null,
    fromTime: 0,
    blend: 1,
    blendDur: 0.25,
    mixer: null,
    actions: new Map(),
    pausedTracks: new Set(),
  };
}

/**
 * AnimatorSystem — contrôleur d'animation Unity-style (4.2).
 *
 * Par objet : paramètres (float/bool/trigger), machine à états (clips
 * squelettiques OU tracks keyframes), crossfades manuels (poids), events
 * normalisés, couches override/additive, motion matching locomotion.
 * Prend le pas sur le blend tree Rig auto (SceneManager saute le rig
 * quand un animator est actif).
 */
export class AnimatorSystem {
  private readonly deps: AnimatorDeps;
  private readonly runtimes = new Map<string, ObjectRuntime>();
  private syncTimer = 0;

  constructor(deps: AnimatorDeps) {
    this.deps = deps;
  }

  // ------------------------------------------------------------------ liaisons

  /** (Re)lie tous les objets porteurs d'un animator actif. */
  public syncBindings(): void {
    for (const obj of this.deps.objects.values()) {
      const ctrl = (obj.userData as Record<string, unknown> | undefined)?.animator as
        | AnimatorControllerData
        | undefined;
      if (ctrl && ctrl.enabled !== false && ctrl.states?.length > 0) {
        this.bind(obj.uuid);
      } else if (this.runtimes.has(obj.uuid)) {
        this.unbind(obj.uuid);
      }
    }
    for (const uuid of [...this.runtimes.keys()]) {
      if (!this.deps.objects.has(uuid)) this.unbind(uuid);
    }
  }

  public bind(uuid: string): void {
    const obj = this.deps.objects.get(uuid);
    if (!obj) return;
    const raw = (obj.userData as Record<string, unknown> | undefined)?.animator as
      | AnimatorControllerData
      | undefined;
    if (!raw) return;
    const existing = this.runtimes.get(uuid);
    if (existing && existing.src === raw) return;
    // Préserve les valeurs de paramètres par nom à travers les rééditions.
    const prevParams = existing?.params;
    if (existing) this.unbind(uuid);
    const src = normalizeAnimatorController(raw);
    const rt: ObjectRuntime = {
      uuid,
      src,
      params: new Map(),
      layers: src.layers.map(() => newLayerRuntime()),
      lastPos: null,
      lastDir: null,
      speed: 0,
      turnRate: 0,
      matchTimer: 0,
      dwellTimer: 0,
    };
    for (const p of src.params) {
      const prev = prevParams?.get(p.name);
      rt.params.set(p.name, {
        type: p.type,
        value: prev && prev.type === p.type ? prev.value : p.value,
      });
    }
    // Les tracks pilotées par l'animator ne doivent pas s'auto-jouer en double.
    for (const st of src.states) {
      const ssrc = st.source;
      if (ssrc.kind === 'track') {
        const trackId = ssrc.trackId;
        const ps = this.deps.animationManager.playbackStates.get(trackId);
        if (ps && ps.isPlaying) {
          ps.isPlaying = false;
          rt.layers[0]?.pausedTracks.add(trackId);
        }
      }
    }
    this.runtimes.set(uuid, rt);
    const entry =
      src.entryState && src.states.some((s) => s.name === src.entryState)
        ? src.entryState
        : src.states[0]?.name ?? null;
    if (entry) this.enterState(obj, rt, rt.layers[0], entry, 0);
  }

  public unbind(uuid: string): void {
    const rt = this.runtimes.get(uuid);
    if (!rt) return;
    const obj = this.deps.objects.get(uuid);
    // Stoppe les actions squelettiques pilotées.
    for (const layer of rt.layers) {
      for (const action of layer.actions.values()) {
        try {
          action.stop();
        } catch {
          /* ignore */
        }
      }
      layer.actions.clear();
      // Restaure les tracks mises en pause.
      for (const trackId of layer.pausedTracks) {
        const track = this.deps.animationManager.tracks.get(trackId);
        const ps = this.deps.animationManager.playbackStates.get(trackId);
        if (track && ps) ps.isPlaying = track.autoplay;
      }
      layer.pausedTracks.clear();
    }
    this.runtimes.delete(uuid);
    if (obj) {
      const ud = (obj.userData ?? {}) as Record<string, unknown>;
      delete ud.__animatorActive;
      obj.userData = ud;
    }
  }

  public has(uuid: string): boolean {
    return this.runtimes.has(uuid);
  }

  public clear(): void {
    for (const uuid of [...this.runtimes.keys()]) this.unbind(uuid);
  }

  // ------------------------------------------------------------------ params

  public setParam(uuid: string, name: string, value: number | boolean): void {
    const rt = this.runtimes.get(uuid);
    if (!rt) return;
    const p = rt.params.get(name);
    if (p) p.value = value;
    else rt.params.set(name, { type: typeof value === 'boolean' ? 'bool' : 'float', value });
  }

  public setTrigger(uuid: string, name: string): void {
    const rt = this.runtimes.get(uuid);
    if (!rt) return;
    const p = rt.params.get(name);
    if (p && p.type === 'trigger') p.value = true;
    else rt.params.set(name, { type: 'trigger', value: true });
  }

  public getParams(uuid: string): { name: string; type: AnimParamType; value: number | boolean }[] {
    const rt = this.runtimes.get(uuid);
    if (!rt) return [];
    return [...rt.params.entries()].map(([name, p]) => ({ name, type: p.type, value: p.value }));
  }

  public getInfo(uuid: string): {
    current: string | null;
    normTime: number;
    blending: boolean;
    speed: number;
    turnRate: number;
  } | null {
    const rt = this.runtimes.get(uuid);
    if (!rt) return null;
    const layer = rt.layers[0];
    if (!layer) return null;
    const st = layer.current ? this.findState(rt, layer.current) : undefined;
    const dur = st ? this.stateDuration(rt.uuid, st) : 1;
    return {
      current: layer.current,
      normTime: dur > 0 ? (layer.time % dur) / dur : 0,
      blending: layer.blend < 1,
      speed: rt.speed,
      turnRate: rt.turnRate,
    };
  }

  /** Force un état (preview UI / motion matching). */
  public playState(uuid: string, stateName: string, duration = 0.25): boolean {
    const rt = this.runtimes.get(uuid);
    const obj = this.deps.objects.get(uuid);
    if (!rt || !obj || !rt.layers[0]) return false;
    if (!this.findState(rt, stateName)) return false;
    this.enterState(obj, rt, rt.layers[0], stateName, duration);
    return true;
  }

  // ------------------------------------------------------------------ boucle

  public update(dt: number): void {
    this.syncTimer += dt;
    if (this.syncTimer > 2) {
      this.syncTimer = 0;
      this.syncBindings();
    }
    for (const rt of this.runtimes.values()) {
      const obj = this.deps.objects.get(rt.uuid);
      if (!obj) continue;
      // Drapeau de précédence : le blend tree Rig auto saute cet objet.
      const ud = (obj.userData ?? {}) as Record<string, unknown>;
      ud.__animatorActive = true;
      obj.userData = ud;
      this.updateAutoParams(obj, rt, dt);
      this.updateMotionMatching(obj, rt, dt);
      this.updateTransitions(obj, rt, dt);
      for (let li = 0; li < rt.layers.length; li++) {
        this.updateLayer(obj, rt, rt.layers[li], li, dt);
      }
    }
  }

  // ---------------------------------------------------------- auto-paramètres

  private updateAutoParams(obj: THREE.Object3D, rt: ObjectRuntime, dt: number): void {
    if (!rt.src.autoParams) return;
    obj.getWorldPosition(_p);
    if (rt.lastPos && dt > 0) {
      const dx = _p.x - rt.lastPos.x;
      const dz = _p.z - rt.lastPos.z;
      const inst = Math.hypot(dx, dz) / dt;
      // Lissage léger (évite le jitter du param speed).
      rt.speed += (inst - rt.speed) * Math.min(1, dt * 10);
      const dirx = dx;
      const dirz = dz;
      if (rt.lastDir && inst > 0.5) {
        const a = Math.atan2(dirx, dirz);
        const b = Math.atan2(rt.lastDir.x, rt.lastDir.z);
        let d = a - b;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        rt.turnRate += (d / Math.max(dt, 1e-4) - rt.turnRate) * Math.min(1, dt * 8);
      } else if (inst <= 0.5) {
        rt.turnRate *= Math.max(0, 1 - dt * 8);
      }
      if (inst > 0.5) rt.lastDir = new THREE.Vector3(dirx, 0, dirz).normalize();
    }
    rt.lastPos = _p.clone();
    const auto = this.deps.readAutoParams(rt.uuid, rt.speed);
    this.writeParam(rt, 'speed', auto.speed);
    this.writeParam(rt, 'moving', auto.moving);
    this.writeParam(rt, 'grounded', auto.grounded);
  }

  private writeParam(rt: ObjectRuntime, name: string, value: number | boolean): void {
    const p = rt.params.get(name);
    if (!p) {
      rt.params.set(name, { type: typeof value === 'boolean' ? 'bool' : 'float', value });
      return;
    }
    if (p.type === 'trigger') return;
    p.value = value;
  }

  // ---------------------------------------------------------- motion matching

  private updateMotionMatching(obj: THREE.Object3D, rt: ObjectRuntime, dt: number): void {
    const mm = rt.src.motionMatching;
    if (!mm.enabled) return;
    const base = rt.layers[0];
    if (!base || !base.current || base.blend < 1) return;
    rt.matchTimer += dt;
    rt.dwellTimer += dt;
    if (rt.matchTimer < mm.interval) return;
    rt.matchTimer = 0;
    const cands = rt.src.states.filter((s) => s.locomotion === true);
    if (cands.length < 2) return;
    if (!cands.some((s) => s.name === base.current)) return;
    let best: AnimState | null = null;
    let bestScore = Infinity;
    let curScore = Infinity;
    for (const c of cands) {
      const ts = c.targetSpeed ?? 0;
      const tt = c.targetTurn ?? 0;
      const score =
        mm.speedWeight * Math.abs(rt.speed - ts) + mm.turnWeight * Math.abs(rt.turnRate - tt);
      if (c.name === base.current) curScore = score;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && best.name !== base.current && rt.dwellTimer >= mm.dwellTime) {
      if (bestScore + mm.margin < curScore) {
        rt.dwellTimer = 0;
        this.enterState(obj, rt, base, best.name, 0.25);
      }
    }
  }

  // ---------------------------------------------------------- transitions

  private findState(rt: ObjectRuntime, name: string): AnimState | undefined {
    return rt.src.states.find((s) => s.name === name);
  }

  private updateTransitions(obj: THREE.Object3D, rt: ObjectRuntime, dt: number): void {
    void dt;
    const base = rt.layers[0];
    if (!base || !base.current || base.blend < 1) return;
    const st = this.findState(rt, base.current);
    if (!st) return;
    const dur = this.stateDuration(rt.uuid, st);
    const norm = dur > 0 ? base.time / dur : 1;
    for (const tr of st.transitions) {
      if (tr.to === base.current && tr.canTransitionToSelf === false) continue;
      if (tr.exitTime !== undefined && norm < tr.exitTime) continue;
      // Motion matching pilote les switchs locomotion↔locomotion : les
      // transitions à conditions ne doivent pas le contredire.
      const target = this.findState(rt, tr.to);
      if (
        rt.src.motionMatching.enabled &&
        st.locomotion === true &&
        target?.locomotion === true
      ) {
        continue;
      }
      if (!this.conditionsMet(rt, tr)) continue;
      this.consumeTriggers(rt, tr);
      this.enterState(obj, rt, base, tr.to, Math.max(0, tr.duration));
      break;
    }
  }

  private conditionsMet(
    rt: ObjectRuntime,
    tr: { conditions: { param: string; op: string; value: number | boolean }[] }
  ): boolean {
    if (tr.conditions.length === 0) {
      // Sans condition : transition immédiate (comportement AnyState-like).
      return true;
    }
    for (const c of tr.conditions) {
      const p = rt.params.get(c.param);
      if (!p) return false;
      const pv = p.value;
      const cv = c.value;
      let ok = false;
      if (typeof pv === 'boolean' || typeof cv === 'boolean') {
        const b = pv === true;
        const t = cv === true;
        ok = c.op === '==' ? b === t : c.op === '!=' ? b !== t : false;
      } else if (typeof pv === 'number' && typeof cv === 'number') {
        switch (c.op) {
          case '>': ok = pv > cv; break;
          case '<': ok = pv < cv; break;
          case '>=': ok = pv >= cv; break;
          case '<=': ok = pv <= cv; break;
          case '==': ok = pv === cv; break;
          case '!=': ok = pv !== cv; break;
          default: ok = false; break;
        }
      } else {
        return false;
      }
      if (!ok) return false;
    }
    return true;
  }

  private consumeTriggers(
    rt: ObjectRuntime,
    tr: { conditions: { param: string }[] }
  ): void {
    for (const c of tr.conditions) {
      const p = rt.params.get(c.param);
      if (p && p.type === 'trigger') p.value = false;
    }
  }

  private enterState(
    obj: THREE.Object3D,
    rt: ObjectRuntime,
    layer: LayerRuntime,
    name: string,
    duration: number
  ): void {
    const st = this.findState(rt, name);
    if (!st) return;
    if (layer.current && layer.current !== name && duration > 0) {
      layer.from = layer.current;
      layer.fromTime = layer.time;
      layer.blend = 0;
      layer.blendDur = Math.max(0.01, duration);
    } else {
      layer.from = null;
      layer.blend = 1;
    }
    layer.current = name;
    layer.time = 0;
    layer.prevNorm = -0.001;
    this.prepareSkeletalAction(obj, rt, layer, st);
    // Rejeu du même état (one-shot spam) : rembobine l'action squelettique.
    const act = layer.actions.get(name);
    if (act && st.source.kind === 'clip') {
      try {
        act.reset();
        act.play();
      } catch {
        /* ignore */
      }
    }
    void obj;
  }

  // ---------------------------------------------------------- durées/sources

  private stateDuration(uuid: string, st: AnimState): number {
    const src = st.source;
    if (src.kind === 'clip') {
      const want = src.clip;
      const found = this.deps.getClips(uuid).find((c) => c.name === want);
      return found && found.duration > 0 ? found.duration : 1;
    }
    const track = this.deps.animationManager.tracks.get(src.trackId);
    return track && track.duration > 0 ? track.duration : 1;
  }

  private prepareSkeletalAction(
    obj: THREE.Object3D,
    rt: ObjectRuntime,
    layer: LayerRuntime,
    st: AnimState
  ): void {
    void obj;
    if (st.source.kind !== 'clip') return;
    const mixer = this.deps.getMixer(rt.uuid);
    if (!mixer) return;
    if (layer.mixer !== mixer) {
      layer.mixer = mixer;
      layer.actions.clear();
    }
    if (layer.actions.has(st.name)) return;
    const asrc = st.source;
    if (asrc.kind !== 'clip') return;
    const wantClip = asrc.clip;
    const found = this.deps.getClips(rt.uuid).find((c) => c.name === wantClip);
    if (!found) return;
    try {
      const action = mixer.clipAction(found);
      action.enabled = true;
      action.setLoop(st.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !st.loop;
      action.play();
      layer.actions.set(st.name, action);
    } catch {
      /* clip incompatible : ignoré */
    }
  }

  private actionFor(rt: ObjectRuntime, layer: LayerRuntime, name: string): THREE.AnimationAction | null {
    const cached = layer.actions.get(name);
    if (cached) return cached;
    const obj = this.deps.objects.get(rt.uuid);
    const st = this.findState(rt, name);
    if (!obj || !st) return null;
    this.prepareSkeletalAction(obj, rt, layer, st);
    return layer.actions.get(name) ?? null;
  }

  // ---------------------------------------------------------- couches

  private updateLayer(
    obj: THREE.Object3D,
    rt: ObjectRuntime,
    layer: LayerRuntime,
    layerIndex: number,
    dt: number
  ): void {
    const layerDef = rt.src.layers[layerIndex];
    if (!layerDef) return;
    // Couche additive : état propre (ou suit la base).
    const stateName =
      layerDef.mode === 'additive' ? (layerDef.state ?? rt.layers[0]?.current) : layer.current;
    if (!stateName) return;
    if (layerDef.mode === 'additive' && layer.current !== stateName) {
      layer.current = stateName;
      layer.time = 0;
      layer.prevNorm = 0;
      layer.from = null;
      layer.blend = 1;
      const st = this.findState(rt, stateName);
      if (st) this.prepareSkeletalAction(obj, rt, layer, st);
    }
    const st = this.findState(rt, stateName);
    if (!st) return;
    const dur = this.stateDuration(rt.uuid, st);
    const speedScale = st.speed !== 0 ? st.speed : 1;

    // Avance le temps (boucle / clamp).
    layer.time += dt * speedScale;
    if (st.loop && dur > 0) {
      while (layer.time >= dur) layer.time -= dur;
      while (layer.time < 0) layer.time += dur;
    } else if (dur > 0) {
      layer.time = Math.max(0, Math.min(dur, layer.time));
    }
    if (layer.from && layer.blend < 1) {
      layer.fromTime += dt * speedScale;
      layer.blend = Math.min(1, layer.blend + dt / Math.max(0.01, layer.blendDur));
      if (layer.blend >= 1) layer.from = null;
    }

    // Events (temps normalisé, wrap-aware).
    const norm = dur > 0 ? layer.time / dur : 0;
    this.fireEvents(obj, rt, st, layer.prevNorm, norm, dur);
    layer.prevNorm = norm;

    if (st.source.kind === 'clip') {
      this.applySkeletalLayer(obj, rt, layer, st, layerDef, dt);
    } else {
      this.applyTrackLayer(obj, rt, layer, st, layerDef);
    }
  }

  private fireEvents(
    obj: THREE.Object3D,
    rt: ObjectRuntime,
    st: AnimState,
    prevNorm: number,
    norm: number,
    dur: number
  ): void {
    void dur;
    if (st.events.length === 0) return;
    const crossed: AnimEvent[] = [];
    for (const ev of st.events) {
      const t = Math.max(0, Math.min(1, ev.time));
      if (norm >= prevNorm) {
        if (t > prevNorm && t <= norm) crossed.push(ev);
      } else {
        // Wrap de boucle : (prev,1] + [0,norm].
        if (t > prevNorm || t <= norm) crossed.push(ev);
      }
    }
    for (const ev of crossed) {
      try {
        this.deps.onEvent({
          uuid: rt.uuid,
          objectName: obj.name || rt.uuid.slice(0, 8),
          stateName: st.name,
          event: ev,
        });
      } catch {
        /* ignore */
      }
    }
  }

  private applySkeletalLayer(
    obj: THREE.Object3D,
    rt: ObjectRuntime,
    layer: LayerRuntime,
    st: AnimState,
    layerDef: { mode: string; weight: number },
    dt: number
  ): void {
    void obj;
    void dt;
    const action = this.actionFor(rt, layer, st.name);
    if (!action) return;
    const w = Math.max(0, Math.min(1, layerDef.weight));
    if (layerDef.mode === 'additive') {
      try {
        action.blendMode = THREE.AdditiveAnimationBlendMode;
      } catch {
        /* ignore */
      }
      action.setEffectiveWeight(w);
      action.setEffectiveTimeScale(st.speed !== 0 ? st.speed : 1);
      if (!action.isRunning()) action.play();
      return;
    }
    try {
      action.blendMode = THREE.NormalAnimationBlendMode;
    } catch {
      /* ignore */
    }
    action.setEffectiveTimeScale(st.speed !== 0 ? st.speed : 1);
    if (!action.isRunning()) action.play();
    if (layer.from) {
      const fromAction = this.actionFor(rt, layer, layer.from);
      const fromSt = this.findState(rt, layer.from);
      const bw = layer.blend;
      action.setEffectiveWeight(w * bw);
      if (fromAction && fromAction.isRunning()) {
        // Fondu depuis un état squelettique : les os relaxent vers la pose de base.
        fromAction.setEffectiveWeight(w * (1 - bw));
        if (bw >= 1) fromAction.stop();
      }
      if (fromSt && fromSt.source.kind === 'track') {
        // Fondu depuis un état track : la track garde la main sur le root
        // pendant le blend (pas de freeze), le squelette fond par-dessus.
        const fromTrack = this.deps.animationManager.tracks.get(fromSt.source.trackId);
        const pose = fromTrack
          ? this.deps.animationManager.evaluateTrackTransform(fromTrack, layer.fromTime)
          : null;
        if (pose) {
          obj.position.copy(pose.position);
          obj.rotation.copy(pose.rotation);
          obj.scale.copy(pose.scale);
        }
      }
    } else {
      action.setEffectiveWeight(w);
    }
  }

  private applyTrackLayer(
    obj: THREE.Object3D,
    rt: ObjectRuntime,
    layer: LayerRuntime,
    st: AnimState,
    layerDef: { mode: string; weight: number }
  ): void {
    if (st.source.kind !== 'track') return;
    const trackId = st.source.trackId;
    const track = this.deps.animationManager.tracks.get(trackId);
    if (!track) return;
    const w = Math.max(0, Math.min(1, layerDef.weight));
    const cur = this.deps.animationManager.evaluateTrackTransform(track, layer.time);
    if (!cur) return;
    if (layerDef.mode === 'additive') {
      // Overlay : delta vs première keyframe, pondéré.
      const first = this.deps.animationManager.evaluateTrackTransform(track, 0);
      if (!first) return;
      _pa.copy(cur.position).sub(first.position).multiplyScalar(w);
      obj.position.add(_pa);
      _qa.setFromEuler(cur.rotation);
      _qb.setFromEuler(first.rotation).invert();
      _qo.copy(_qb).multiply(_qa);
      // Pondère la rotation delta.
      const angle = 2 * Math.acos(Math.max(-1, Math.min(1, _qo.w)));
      if (angle > 1e-4) {
        const s = Math.sin(angle / 2);
        _qo.x /= s;
        _qo.y /= s;
        _qo.z /= s;
        const wa = angle * w;
        _qo.set(_qo.x * Math.sin(wa / 2), _qo.y * Math.sin(wa / 2), _qo.z * Math.sin(wa / 2), Math.cos(wa / 2));
        obj.quaternion.multiply(_qo);
      }
      _sa.copy(cur.scale).sub(first.scale).multiplyScalar(w);
      obj.scale.add(_sa);
      return;
    }
    if (layer.from) {
      const fromSt = this.findState(rt, layer.from);
      if (fromSt && fromSt.source.kind === 'track') {
        const fromTrack = this.deps.animationManager.tracks.get(fromSt.source.trackId);
        const prev = fromTrack
          ? this.deps.animationManager.evaluateTrackTransform(fromTrack, layer.fromTime)
          : null;
        if (prev) {
          const bw = layer.blend;
          _pa.copy(prev.position).lerp(cur.position, bw);
          obj.position.copy(_pa);
          _qa.setFromEuler(prev.rotation);
          _qb.setFromEuler(cur.rotation);
          _qo.copy(_qa).slerp(_qb, bw);
          obj.quaternion.copy(_qo);
          _e.setFromQuaternion(_qo);
          obj.rotation.copy(_e);
          _sa.copy(prev.scale).lerp(cur.scale, bw);
          obj.scale.copy(_sa);
          return;
        }
      }
      if (fromSt && fromSt.source.kind === 'clip') {
        // Fondu depuis un état squelettique : le root est déjà continu (le
        // squelette ne touche pas le root), on relaxe les os vers la base.
        const fromAction = this.actionFor(rt, layer, layer.from);
        if (fromAction && fromAction.isRunning()) {
          fromAction.setEffectiveWeight(Math.max(0, 1 - layer.blend));
          if (layer.blend >= 1) fromAction.stop();
        }
      }
    }
    obj.position.copy(cur.position);
    obj.rotation.copy(cur.rotation);
    obj.scale.copy(cur.scale);
  }
}

/**
 * Génère un contrôleur locomotion prêt à l'emploi depuis des clips :
 * états tagués (idle 0 / walk 2.8 / run 6.5 / sprint 9.5), transitions
 * chaînées sur `speed`, trigger `attack` global si un clip d'attaque existe.
 */
export function buildLocomotionController(
  clips: string[],
  tracks: { id: string; name: string }[]
): AnimatorControllerData {
  const ctrl = defaultAnimatorController();
  const speedOf = (name: string): number | null => {
    const n = name.toLowerCase();
    if (/(idle|repos|stand|t-pose)/.test(n)) return 0;
    if (/sprint/.test(n)) return 9.5;
    if (/run/.test(n)) return 6.5;
    if (/(walk|marche|locomot)/.test(n)) return 2.8;
    if (/crouch/.test(n)) return 1.2;
    return null;
  };
  const mkState = (
    name: string,
    source: AnimState['source'],
    targetSpeed: number | null
  ): AnimState => ({
    name,
    source,
    speed: 1,
    loop: true,
    locomotion: targetSpeed !== null,
    targetSpeed: targetSpeed ?? 0,
    targetTurn: 0,
    transitions: [],
    events: [],
  });
  const seen = new Set<string>();
  for (const clip of clips) {
    if (seen.has(clip)) continue;
    seen.add(clip);
    ctrl.states.push(mkState(clip, { kind: 'clip', clip }, speedOf(clip)));
  }
  for (const t of tracks) {
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    ctrl.states.push(mkState(t.name, { kind: 'track', trackId: t.id }, null));
  }
  // Chaîne les états locomotion par vitesse croissante.
  const loco = ctrl.states
    .filter((s) => s.locomotion === true)
    .sort((a, b) => (a.targetSpeed ?? 0) - (b.targetSpeed ?? 0));
  for (let i = 0; i < loco.length; i++) {
    const cur = loco[i];
    const curSpeed = cur.targetSpeed ?? 0;
    const next = loco[i + 1];
    const prev = loco[i - 1];
    if (next) {
      const threshold = (curSpeed + (next.targetSpeed ?? curSpeed + 1)) / 2;
      cur.transitions.push({
        id: `tr_${cur.name}_up`,
        to: next.name,
        conditions: [{ param: 'speed', op: '>', value: Math.round(threshold * 10) / 10 }],
        duration: 0.25,
      });
    }
    if (prev) {
      const prevSpeed = prev.targetSpeed ?? 0;
      const threshold = (prevSpeed + curSpeed) / 2 - 0.3;
      cur.transitions.push({
        id: `tr_${cur.name}_down`,
        to: prev.name,
        conditions: [{ param: 'speed', op: '<', value: Math.max(0.1, Math.round(threshold * 10) / 10) }],
        duration: 0.25,
      });
    }
  }
  // Trigger d'attaque vers un clip non-locomotion évocateur.
  const attackClip = ctrl.states.find((s) =>
    /attack|attaq|hit|coup|punch|kick|frappe/i.test(s.name)
  );
  if (attackClip) {
    attackClip.loop = false;
    attackClip.locomotion = false;
    const idle = loco[0]?.name ?? ctrl.states[0]?.name;
    if (idle && idle !== attackClip.name) {
      attackClip.transitions.push({
        id: `tr_${attackClip.name}_back`,
        to: idle,
        conditions: [],
        exitTime: 0.95,
        duration: 0.2,
      });
      for (const s of ctrl.states) {
        if (s.name === attackClip.name) continue;
        s.transitions.push({
          id: `tr_${s.name}_atk`,
          to: attackClip.name,
          conditions: [{ param: 'attack', op: '==', value: true }],
          duration: 0.12,
        });
      }
    }
  }
  ctrl.entryState = loco[0]?.name ?? ctrl.states[0]?.name;
  return ctrl;
}
