/**
 * SoundManager.ts
 * Robust Procedural Web Audio API Sound & Spatial 3D Audio Manager.
 * Features: mixer bus (Master→Music/SFX/Ambient/UI), spatial attenuation,
 * doppler, stereo panning, audio zones (reverb/occlusion), music crossfade
 * (exploration/combat), full SFX library.
 */

export type SFXType =
  | 'footstep'
  | 'jump'
  | 'coin'
  | 'laser'
  | 'explosion'
  | 'torch'
  | 'engine'
  | 'wind'
  | 'rain'
  | 'thunder'
  | 'fire_crackle'
  | 'water'
  | 'splash'
  | 'powerup'
  | 'warp'
  | 'hit';

export type BGMMode = 'exploration' | 'combat' | 'off';
export type MixerBusName = 'master' | 'music' | 'sfx' | 'ambient' | 'ui';

export interface AudioZoneConfig {
  /** 0..1 reverb wet (0 = dry, 1 = full reverb). */
  reverbWet?: number;
  /** Lowpass cutoff Hz for occlusion/obstruction (0..20000). */
  lowpassHz?: number;
  /** Extra volume multiplier inside zone. */
  volumeMul?: number;
}

/**
 * Initial mixer levels. SFX/Ambient/UI at 0.0 would silently mute every sound
 * effect, ambient loop and UI cue until the user opened the mixer, so they
 * mirror the "Réinitialiser le mixer" action in AudioInspector (0.8).
 */
const BUS_DEFAULTS: Record<MixerBusName, number> = {
  master: 0.7,
  music: 0.4,
  sfx: 0.8,
  ambient: 0.8,
  ui: 0.8,
};

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private zoneFilter: BiquadFilterNode | null = null;
  private zoneReverb: ConvolverNode | null = null;
  private zoneWet: GainNode | null = null;
  private zoneDry: GainNode | null = null;

  private busGains = new Map<MixerBusName, GainNode>();
  private busTargets: Record<MixerBusName, number> = { ...BUS_DEFAULTS };

  // BGM synth state
  private currentBgmMode: BGMMode = 'off';
  private bgmInterval: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;

  // Spatial listener (updated by SceneManager)
  private listenerPos = { x: 0, y: 0, z: 0 };
  private listenerVel = { x: 0, y: 0, z: 0 };
  private lastListenerSample = 0;

  // Active audio zones (keyed by zone id)
  private audioZones = new Map<string, AudioZoneConfig & { active: boolean }>();

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.ctx = new AudioCtxClass();

      // Master
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.busTargets.master;
      this.masterGain.connect(this.ctx.destination);

      // Sub-buses → master
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.busTargets.sfx;
      this.sfxGain.connect(this.masterGain);
      this.busGains.set('sfx', this.sfxGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.busTargets.music;
      this.musicGain.connect(this.masterGain);
      this.busGains.set('music', this.musicGain);
      this.bgmGain = this.musicGain; // alias for legacy BGM code

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = this.busTargets.ambient;
      this.ambientGain.connect(this.masterGain);
      this.busGains.set('ambient', this.ambientGain);

      this.uiGain = this.ctx.createGain();
      this.uiGain.gain.value = this.busTargets.ui;
      this.uiGain.connect(this.masterGain);
      this.busGains.set('ui', this.uiGain);

      this.busGains.set('master', this.masterGain);

      // Zone processing chain: dry/wet + lowpass
      this.zoneDry = this.ctx.createGain();
      this.zoneWet = this.ctx.createGain();
      this.zoneWet.gain.value = 0;
      this.zoneFilter = this.ctx.createBiquadFilter();
      this.zoneFilter.type = 'lowpass';
      this.zoneFilter.frequency.value = 20000;
      this.zoneFilter.Q.value = 0.7;

      // Simple synthetic reverb impulse (short noise burst)
      this.zoneReverb = this.ctx.createConvolver();
      const impulse = this.ctx.createBuffer(2, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const data = impulse.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.5);
        }
      }
      this.zoneReverb.buffer = impulse;

      // Wire: sfx → zoneFilter → (dry + reverb→wet) → master
      this.sfxGain.disconnect();
      this.sfxGain.connect(this.zoneFilter);
      this.zoneFilter.connect(this.zoneDry);
      this.zoneDry.connect(this.masterGain);
      this.zoneFilter.connect(this.zoneReverb);
      this.zoneReverb.connect(this.zoneWet);
      this.zoneWet.connect(this.masterGain);

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API initialization failed:', e);
    }
  }

  // ===================== Mixer Bus API =====================

  public setBusGain(bus: MixerBusName, value: number) {
    this.init();
    const v = Math.max(0, Math.min(1, value));
    this.busTargets[bus] = v;
    const node = this.busGains.get(bus);
    if (node && this.ctx) {
      node.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  public getBusGain(bus: MixerBusName): number {
    return this.busTargets[bus];
  }

  public getBusGains(): Record<MixerBusName, number> {
    return { ...this.busTargets };
  }

  public muteBus(bus: MixerBusName) {
    this.setBusGain(bus, 0);
  }

  // ===================== Audio Zones =====================

  public registerAudioZone(id: string, config: AudioZoneConfig) {
    this.audioZones.set(id, { ...config, active: false });
  }

  public unregisterAudioZone(id: string) {
    this.audioZones.delete(id);
    this.applyActiveZones();
  }

  public setZoneActive(id: string, active: boolean) {
    const z = this.audioZones.get(id);
    if (!z) return;
    z.active = active;
    this.applyActiveZones();
  }

  private applyActiveZones() {
    this.init();
    if (!this.ctx || !this.zoneFilter || !this.zoneWet || !this.zoneDry) return;

    let lowpassHz = 20000;
    let reverbWet = 0;
    let volumeMul = 1;

    for (const z of this.audioZones.values()) {
      if (!z.active) continue;
      if (typeof z.lowpassHz === 'number') lowpassHz = Math.min(lowpassHz, z.lowpassHz);
      if (typeof z.reverbWet === 'number') reverbWet = Math.max(reverbWet, z.reverbWet);
      if (typeof z.volumeMul === 'number') volumeMul *= z.volumeMul;
    }

    const t = this.ctx.currentTime;
    this.zoneFilter.frequency.setTargetAtTime(lowpassHz, t, 0.15);
    this.zoneWet.gain.setTargetAtTime(reverbWet, t, 0.2);
    this.zoneDry.gain.setTargetAtTime(volumeMul * (1 - reverbWet * 0.5), t, 0.2);
  }

  // ===================== Spatial / Doppler =====================

  public setListener(pos: { x: number; y: number; z: number }, vel?: { x: number; y: number; z: number }) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (vel) {
      this.listenerVel = vel;
    } else if (this.lastListenerSample > 0) {
      const dt = (now - this.lastListenerSample) / 1000;
      if (dt > 0.001) {
        this.listenerVel = {
          x: (pos.x - this.listenerPos.x) / dt,
          y: (pos.y - this.listenerPos.y) / dt,
          z: (pos.z - this.listenerPos.z) / dt,
        };
      }
    }
    this.listenerPos = pos;
    this.lastListenerSample = now;
  }

  /** Doppler shift factor based on relative radial velocity (simple model). */
  private computeDoppler(
    srcPos: { x: number; y: number; z: number },
    srcVel: { x: number; y: number; z: number },
    speedOfSound = 343
  ): number {
    const dx = srcPos.x - this.listenerPos.x;
    const dz = srcPos.z - this.listenerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    // unit vector from listener to source
    const ux = dx / dist;
    const uz = dz / dist;
    const vListener = this.listenerVel.x * ux + this.listenerVel.z * uz;
    const vSource = srcVel.x * ux + srcVel.z * uz;
    const ratio = (speedOfSound + vListener) / (speedOfSound + vSource);
    return Math.max(0.5, Math.min(2, ratio));
  }

  /**
   * Joue un effet. `volume` (0..1) est optionnel : par défaut 1, donc les
   * appelants existants ne sont pas affectés.
   */
  public playSFX(type: SFXType, volume = 1) {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const gain = Math.max(0, Math.min(volume, 1));
    this.synthSFX(type, this.sfxGain, gain, 0, 1);
  }

  /**
   * Spatial 3D SFX: distance attenuation + stereo pan + optional doppler + occlusion lowpass.
   */
  public playSpatialSound3D(
    type: SFXType,
    objectPos: { x: number; y: number; z: number },
    listenerPos?: { x: number; y: number; z: number },
    maxDistance: number = 25,
    opts?: {
      sourceVelocity?: { x: number; y: number; z: number };
      /** 0..1 — how much occlusion (1 = fully occluded). */
      occlusion?: number;
      /** Route to bus (default sfx). */
      bus?: MixerBusName;
    }
  ) {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const lp = listenerPos ?? this.listenerPos;
    const dx = objectPos.x - lp.x;
    const dy = objectPos.y - lp.y;
    const dz = objectPos.z - lp.z;
    // Include Y: a source directly above/below the listener must attenuate too.
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > maxDistance) return;

    const volume = Math.max(0, 1 - distance / maxDistance);
    if (volume <= 0.01) return;

    const pan = Math.max(-1, Math.min(1, dx / maxDistance));

    let doppler = 1;
    if (opts?.sourceVelocity) {
      doppler = this.computeDoppler(objectPos, opts.sourceVelocity);
    }

    const occlusion = Math.max(0, Math.min(1, opts?.occlusion ?? 0));
    // Occlusion reduces volume and darkens via lowpass
    const occGain = 1 - occlusion * 0.7;
    const lowpassHz = 20000 * Math.pow(1 - occlusion, 2) + 400 * occlusion;

    const t = this.ctx.currentTime;
    const dest = this.busGains.get(opts?.bus ?? 'sfx') ?? this.sfxGain;

    // Build chain: source → gain → [lowpass] → panner → dest
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.5 * occGain, t);
    // Pan must be set on every path, otherwise occlusion silently flattens the
    // source to the centre of the stereo field.
    if (panner) panner.pan.setValueAtTime(pan, t);

    let filter: BiquadFilterNode | null = null;
    if (occlusion > 0.01 && this.ctx.createBiquadFilter) {
      filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(lowpassHz, t);
      filter.Q.value = 0.7;
      gain.connect(filter);
      if (panner) {
        filter.connect(panner);
        panner.connect(dest);
      } else {
        filter.connect(dest);
      }
    } else if (panner) {
      gain.connect(panner);
      panner.connect(dest);
    } else {
      gain.connect(dest);
    }

    // Play through the spatial chain with doppler-scaled playbackRate simulation
    this.synthSFX(type, gain, volume * 0.5 * occGain, pan, doppler);
  }

  /** Raycast-based occlusion helper (call from SceneManager). */
  public computeOcclusion(
    sourcePos: { x: number; y: number; z: number },
    listenerPos: { x: number; y: number; z: number },
    hasWallBetween: boolean
  ): number {
    if (!hasWallBetween) return 0;
    const dx = sourcePos.x - listenerPos.x;
    const dz = sourcePos.z - listenerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Closer to wall = more occluded
    return Math.min(1, 0.5 + dist * 0.05);
  }

  private synthSFX(
    type: SFXType,
    destination: AudioNode,
    baseVolume: number = 1,
    _pan: number = 0,
    doppler: number = 1
  ) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    gain.connect(destination);
    osc.connect(gain);
    // Doppler: slightly pitch-shift the oscillator
    if (doppler !== 1 && 'detune' in osc) {
      // cents shift ≈ 1200 * log2(doppler)
      const cents = 1200 * Math.log2(doppler);
      (osc as OscillatorNode).detune?.setValueAtTime(Math.max(-1200, Math.min(1200, cents)), t);
    }

    switch (type) {
      case 'jump':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(450, t + 0.2);
        gain.gain.setValueAtTime(0.3 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
        osc.start(t);
        osc.stop(t + 0.25);
        break;

      case 'footstep':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);
        gain.gain.setValueAtTime(0.2 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.08);
        break;

      case 'coin':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, t);
        osc.frequency.setValueAtTime(1318.51, t + 0.08);
        gain.gain.setValueAtTime(0.25 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
        break;

      case 'laser':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.2);
        gain.gain.setValueAtTime(0.3 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
        break;

      case 'explosion': {
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, t);
        filter.frequency.linearRampToValueAtTime(50, t + 0.5);

        noise.connect(filter);
        filter.connect(destination);
        gain.gain.setValueAtTime(0.6 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
        noise.start(t);
        noise.stop(t + 0.5);
        break;
      }

      case 'torch': {
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() > 0.8 ? 1 : 0) * (Math.random() * 2 - 1);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;

        noise.connect(filter);
        filter.connect(destination);
        gain.gain.setValueAtTime(0.2 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        noise.start(t);
        noise.stop(t + 0.15);
        break;
      }

      case 'engine':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(55, t);
        osc.frequency.linearRampToValueAtTime(110, t + 0.4);
        gain.gain.setValueAtTime(0.25 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.4);
        break;

      case 'wind': {
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.8);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + 0.04 * white) / 1.04;
          lastOut = data[i];
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, t);
        filter.frequency.linearRampToValueAtTime(650, t + 0.4);
        filter.frequency.linearRampToValueAtTime(320, t + 0.8);
        filter.Q.value = 3.0;

        noise.connect(filter);
        filter.connect(destination);
        gain.gain.setValueAtTime(0.01, t);
        gain.gain.linearRampToValueAtTime(0.28, t + 0.3);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.8);
        noise.start(t);
        noise.stop(t + 0.8);
        break;
      }

      case 'rain': {
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.6);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.4;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);

        noise.connect(filter);
        filter.connect(destination);
        gain.gain.setValueAtTime(0.02, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
        noise.start(t);
        noise.stop(t + 0.6);
        break;
      }

      case 'thunder': {
        const bufferSize = Math.floor(this.ctx.sampleRate * 1.5);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99 * b0 + white * 0.05;
          b1 = 0.95 * b1 + white * 0.1;
          b2 = 0.85 * b2 + white * 0.2;
          data[i] = (b0 + b1 + b2) * 0.35;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(120, t);
        filter.frequency.linearRampToValueAtTime(60, t + 1.5);

        noise.connect(filter);
        filter.connect(destination);
        gain.gain.setValueAtTime(0.6 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
        noise.start(t);
        noise.stop(t + 1.5);
        break;
      }

      case 'fire_crackle': {
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.3);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() > 0.94 ? (Math.random() * 2 - 1) : 0;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800;

        noise.connect(filter);
        filter.connect(destination);
        gain.gain.setValueAtTime(0.25 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        noise.start(t);
        noise.stop(t + 0.3);
        break;
      }

      case 'water':
      case 'splash': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.25);
        gain.gain.setValueAtTime(0.35 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);

        const bufferSize = Math.floor(this.ctx.sampleRate * 0.25);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.3;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.linearRampToValueAtTime(300, t + 0.25);

        noise.connect(filter);
        filter.connect(destination);
        noise.start(t);
        noise.stop(t + 0.25);
        break;
      }

      case 'powerup': {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, t);
        osc.frequency.setValueAtTime(440, t + 0.08);
        osc.frequency.setValueAtTime(554.37, t + 0.16);
        osc.frequency.setValueAtTime(659.25, t + 0.24);
        gain.gain.setValueAtTime(0.3 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
        osc.start(t);
        osc.stop(t + 0.45);
        break;
      }

      case 'warp': {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.35);
        gain.gain.setValueAtTime(0.3 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.4);
        break;
      }

      case 'hit': {
        osc.type = 'square';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        gain.gain.setValueAtTime(0.35 * baseVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
        osc.start(t);
        osc.stop(t + 0.18);
        break;
      }
    }
  }

  // ===================== Music System =====================

  public setBGMMode(mode: BGMMode) {
    this.init();
    if (!this.ctx || !this.bgmGain) return;
    if (this.currentBgmMode === mode) return;

    this.currentBgmMode = mode;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }

    const t = this.ctx.currentTime;

    if (mode === 'off') {
      this.bgmGain.gain.setTargetAtTime(0, t, 0.5);
      return;
    }

    // Crossfade volume (exploration softer, combat louder)
    this.bgmGain.gain.setTargetAtTime(mode === 'combat' ? 0.5 : 0.3, t, 0.5);

    // Procedural ambient generator
    const notes = mode === 'combat' ? [130.81, 155.56, 196.0, 233.08] : [220.0, 261.63, 329.63, 392.0];
    let noteIdx = 0;

    this.bgmInterval = setInterval(() => {
      if (!this.ctx || this.currentBgmMode !== mode) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = mode === 'combat' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(notes[noteIdx % notes.length], now);
      noteIdx++;

      noteGain.connect(this.bgmGain!);
      osc.connect(noteGain);

      noteGain.gain.setValueAtTime(0.15, now);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.start(now);
      osc.stop(now + 1.2);
    }, mode === 'combat' ? 400 : 800);
  }

  public getBGMMode(): BGMMode {
    return this.currentBgmMode;
  }
}

// Singleton export
export const soundManager = new SoundManager();
