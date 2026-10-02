import * as THREE from 'three';
import { AnimationTrack, AnimationPlaybackState, EasingFunctionType } from '../../types/animation';

export class AnimationManager {
  private scene: THREE.Scene;
  public tracks: Map<string, AnimationTrack> = new Map();
  public playbackStates: Map<string, AnimationPlaybackState> = new Map();

  // Trajectory visualization overlay mesh group
  private trajectoryGroup: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.trajectoryGroup = new THREE.Group();
    this.trajectoryGroup.name = '__AETHER_TRAJECTORY_OVERLAY__';
    this.scene.add(this.trajectoryGroup);
  }

  /**
   * Easing function calculator for keyframe interpolation
   */
  public static evaluateEasing(t: number, easing: EasingFunctionType): number {
    const clampedT = Math.max(0, Math.min(1, t));
    switch (easing) {
      case 'linear':
        return clampedT;
      case 'easeIn':
        return clampedT * clampedT * clampedT;
      case 'easeOut':
        return 1 - Math.pow(1 - clampedT, 3);
      case 'easeInOut':
        return clampedT < 0.5
          ? 4 * clampedT * clampedT * clampedT
          : 1 - Math.pow(-2 * clampedT + 2, 3) / 2;
      case 'bounce': {
        const n1 = 7.5625;
        const d1 = 2.75;
        let x = clampedT;
        if (x < 1 / d1) return n1 * x * x;
        if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
        if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
        return n1 * (x -= 2.625 / d1) * x + 0.984375;
      }
      case 'elastic': {
        if (clampedT === 0) return 0;
        if (clampedT === 1) return 1;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * clampedT) * Math.sin((clampedT * 10 - 0.75) * c4) + 1;
      }
      default:
        return clampedT;
    }
  }

  /**
   * Add or replace an animation track
   */
  public addTrack(track: AnimationTrack): void {
    // Sort keyframes chronologically
    track.keyframes.sort((a, b) => a.time - b.time);
    this.tracks.set(track.id, track);

    // Initialize playback state
    if (!this.playbackStates.has(track.id)) {
      this.playbackStates.set(track.id, {
        trackId: track.id,
        currentTime: 0,
        isPlaying: track.autoplay,
        playbackSpeed: 1.0,
        direction: 1,
      });
    }
  }

  /**
   * Remove a track
   */
  public removeTrack(trackId: string): void {
    this.tracks.delete(trackId);
    this.playbackStates.delete(trackId);
  }

  /**
   * Play track
   */
  public playTrack(trackId: string, direction: 1 | -1 = 1): void {
    const state = this.playbackStates.get(trackId);
    if (state) {
      state.isPlaying = true;
      state.direction = direction;
    }
  }

  /**
   * Pause track
   */
  public pauseTrack(trackId: string): void {
    const state = this.playbackStates.get(trackId);
    if (state) {
      state.isPlaying = false;
    }
  }

  /**
   * Stop & reset track playhead
   */
  public stopTrack(trackId: string): void {
    const state = this.playbackStates.get(trackId);
    if (state) {
      state.isPlaying = false;
      state.currentTime = state.direction === 1 ? 0 : (this.tracks.get(trackId)?.duration || 0);
    }
  }

  /**
   * Reset all playback tracks to their initial state (respecting autoplay settings)
   */
  public resetAllTracks(): void {
    this.tracks.forEach((track, trackId) => {
      const state = this.playbackStates.get(trackId);
      if (state) {
        state.isPlaying = track.autoplay;
        state.direction = 1;
        state.currentTime = 0;
      }
    });
  }

  /**
   * Seek to specific timestamp
   */
  public seekTrack(trackId: string, timeSeconds: number): void {
    const track = this.tracks.get(trackId);
    const state = this.playbackStates.get(trackId);
    if (track && state) {
      state.currentTime = Math.max(0, Math.min(track.duration, timeSeconds));
    }
  }

  /**
   * Get all tracks targeting a specific object UUID
   */
  public getTracksForObject(nodeId: string): AnimationTrack[] {
    const result: AnimationTrack[] = [];
    this.tracks.forEach((track) => {
      if (track.targetNodeId === nodeId) {
        result.push(track);
      }
    });
    return result;
  }

  /**
   * Evaluate track transform at time T
   */
  public evaluateTrackTransform(
    track: AnimationTrack,
    time: number
  ): { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } | null {
    if (track.keyframes.length === 0) return null;

    // Single keyframe case
    if (track.keyframes.length === 1) {
      const kf = track.keyframes[0];
      return {
        position: new THREE.Vector3(kf.position.x, kf.position.y, kf.position.z),
        rotation: new THREE.Euler(
          THREE.MathUtils.degToRad(kf.rotation.x),
          THREE.MathUtils.degToRad(kf.rotation.y),
          THREE.MathUtils.degToRad(kf.rotation.z)
        ),
        scale: new THREE.Vector3(kf.scale.x, kf.scale.y, kf.scale.z),
      };
    }

    // Clamp or find keyframe segment
    const kfs = track.keyframes;
    if (time <= kfs[0].time) {
      const kf = kfs[0];
      return {
        position: new THREE.Vector3(kf.position.x, kf.position.y, kf.position.z),
        rotation: new THREE.Euler(
          THREE.MathUtils.degToRad(kf.rotation.x),
          THREE.MathUtils.degToRad(kf.rotation.y),
          THREE.MathUtils.degToRad(kf.rotation.z)
        ),
        scale: new THREE.Vector3(kf.scale.x, kf.scale.y, kf.scale.z),
      };
    }

    if (time >= kfs[kfs.length - 1].time) {
      const kf = kfs[kfs.length - 1];
      return {
        position: new THREE.Vector3(kf.position.x, kf.position.y, kf.position.z),
        rotation: new THREE.Euler(
          THREE.MathUtils.degToRad(kf.rotation.x),
          THREE.MathUtils.degToRad(kf.rotation.y),
          THREE.MathUtils.degToRad(kf.rotation.z)
        ),
        scale: new THREE.Vector3(kf.scale.x, kf.scale.y, kf.scale.z),
      };
    }

    // Find segment [prev, next]
    let prevIndex = 0;
    for (let i = 0; i < kfs.length - 1; i++) {
      if (time >= kfs[i].time && time <= kfs[i + 1].time) {
        prevIndex = i;
        break;
      }
    }

    const prevKf = kfs[prevIndex];
    const nextKf = kfs[prevIndex + 1];
    const segmentDuration = nextKf.time - prevKf.time;
    if (segmentDuration <= 0) {
      return {
        position: new THREE.Vector3(prevKf.position.x, prevKf.position.y, prevKf.position.z),
        rotation: new THREE.Euler(
          THREE.MathUtils.degToRad(prevKf.rotation.x),
          THREE.MathUtils.degToRad(prevKf.rotation.y),
          THREE.MathUtils.degToRad(prevKf.rotation.z)
        ),
        scale: new THREE.Vector3(prevKf.scale.x, prevKf.scale.y, prevKf.scale.z),
      };
    }

    const rawT = (time - prevKf.time) / segmentDuration;
    const easedT = AnimationManager.evaluateEasing(rawT, nextKf.easing || 'easeInOut');

    // Interpolate Position
    const posPrev = new THREE.Vector3(prevKf.position.x, prevKf.position.y, prevKf.position.z);
    const posNext = new THREE.Vector3(nextKf.position.x, nextKf.position.y, nextKf.position.z);
    const posOut = posPrev.clone().lerp(posNext, easedT);

    // Interpolate Rotation via Quaternion Slerp
    const qPrev = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(prevKf.rotation.x),
        THREE.MathUtils.degToRad(prevKf.rotation.y),
        THREE.MathUtils.degToRad(prevKf.rotation.z)
      )
    );
    const qNext = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(nextKf.rotation.x),
        THREE.MathUtils.degToRad(nextKf.rotation.y),
        THREE.MathUtils.degToRad(nextKf.rotation.z)
      )
    );
    const qOut = qPrev.clone().slerp(qNext, easedT);
    const rotOut = new THREE.Euler().setFromQuaternion(qOut);

    // Interpolate Scale
    const scalePrev = new THREE.Vector3(prevKf.scale.x, prevKf.scale.y, prevKf.scale.z);
    const scaleNext = new THREE.Vector3(nextKf.scale.x, nextKf.scale.y, nextKf.scale.z);
    const scaleOut = scalePrev.clone().lerp(scaleNext, easedT);

    return {
      position: posOut,
      rotation: rotOut,
      scale: scaleOut,
    };
  }

  /**
   * Main per-frame animation step loop
   */
  public update(dt: number, objects: Map<string, THREE.Object3D>): void {
    this.tracks.forEach((track, trackId) => {
      const state = this.playbackStates.get(trackId);
      if (!state || !state.isPlaying) return;

      const targetObj = objects.get(track.targetNodeId);
      if (!targetObj) return;

      // Update playhead time
      state.currentTime += dt * state.playbackSpeed * state.direction;

      // Check bounds / looping
      if (state.direction === 1 && state.currentTime >= track.duration) {
        if (track.pingPong) {
          state.direction = -1;
          state.currentTime = track.duration;
        } else if (track.loop) {
          state.currentTime = 0;
        } else {
          state.currentTime = track.duration;
          state.isPlaying = false;
        }
      } else if (state.direction === -1 && state.currentTime <= 0) {
        if (track.pingPong) {
          state.direction = 1;
          state.currentTime = 0;
        } else if (track.loop) {
          state.currentTime = track.duration;
        } else {
          state.currentTime = 0;
          state.isPlaying = false;
        }
      }

      // Apply transform
      const result = this.evaluateTrackTransform(track, state.currentTime);
      if (result) {
        targetObj.position.copy(result.position);
        targetObj.rotation.copy(result.rotation);
        targetObj.scale.copy(result.scale);
      }
    });
  }

  /**
   * Render or update 3D visual spline path trajectory for selected object
   */
  public renderTrajectoryOverlay(
    selectedNodeId: string | null
  ): void {
    // Clear old visual objects
    while (this.trajectoryGroup.children.length > 0) {
      const child = this.trajectoryGroup.children[0];
      this.trajectoryGroup.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    if (!selectedNodeId) return;

    const tracks = this.getTracksForObject(selectedNodeId);
    if (tracks.length === 0) return;

    tracks.forEach((track) => {
      if (track.keyframes.length < 2) return;

      // Generate points along trajectory curve
      const samplesCount = 60;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= samplesCount; i++) {
        const sampleTime = (i / samplesCount) * track.duration;
        const res = this.evaluateTrackTransform(track, sampleTime);
        if (res) {
          points.push(res.position.clone());
        }
      }

      if (points.length > 1) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0x38bdf8, // Sky Blue
          dashSize: 0.2,
          gapSize: 0.1,
          linewidth: 2,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        this.trajectoryGroup.add(line);
      }

      // Keyframe Waypoint Markers (Small cyan glowing spheres)
      const kfSphereGeo = new THREE.SphereGeometry(0.12, 12, 12);
      const kfMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        wireframe: false,
      });

      track.keyframes.forEach((kf) => {
        const sphere = new THREE.Mesh(kfSphereGeo, kfMat);
        sphere.position.set(kf.position.x, kf.position.y, kf.position.z);
        this.trajectoryGroup.add(sphere);
      });
    });
  }

  /**
   * Helper generator for standard presets
   */
  public static createPresetTrack(
    presetType: 'slideDoor' | 'elevator' | 'movingPlatform' | 'swing' | 'cameraTravel',
    targetNodeId: string,
    currentPos: { x: number; y: number; z: number }
  ): AnimationTrack {
    const trackId = `track_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const x = currentPos.x;
    const y = currentPos.y;
    const z = currentPos.z;

    switch (presetType) {
      case 'slideDoor':
        return {
          id: trackId,
          name: 'Porte_Coulissante',
          targetNodeId,
          duration: 3.0,
          loop: false,
          pingPong: true,
          autoplay: false,
          keyframes: [
            {
              id: 'kf_1',
              time: 0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_2',
              time: 1.5,
              position: { x: x + 2.5, y, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_3',
              time: 3.0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
          ],
        };

      case 'elevator':
        return {
          id: trackId,
          name: 'Ascenseur_Vertical',
          targetNodeId,
          duration: 4.0,
          loop: true,
          pingPong: true,
          autoplay: true,
          keyframes: [
            {
              id: 'kf_1',
              time: 0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_2',
              time: 2.0,
              position: { x, y: y + 5.0, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_3',
              time: 4.0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
          ],
        };

      case 'movingPlatform':
        return {
          id: trackId,
          name: 'Plateforme_Mouvant',
          targetNodeId,
          duration: 5.0,
          loop: true,
          pingPong: true,
          autoplay: true,
          keyframes: [
            {
              id: 'kf_1',
              time: 0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_2',
              time: 2.5,
              position: { x: x + 6.0, y, z: z + 2.0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_3',
              time: 5.0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
          ],
        };

      case 'swing':
        return {
          id: trackId,
          name: 'Balançoire_Pendule',
          targetNodeId,
          duration: 2.0,
          loop: true,
          pingPong: true,
          autoplay: true,
          keyframes: [
            {
              id: 'kf_1',
              time: 0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: -25 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_2',
              time: 1.0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: 25 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_3',
              time: 2.0,
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: -25 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
          ],
        };

      case 'cameraTravel':
        return {
          id: trackId,
          name: 'Cinematique_Travel',
          targetNodeId,
          duration: 6.0,
          loop: false,
          pingPong: false,
          autoplay: false,
          keyframes: [
            {
              id: 'kf_1',
              time: 0,
              position: { x: x - 4, y: y + 2, z: z + 6 },
              rotation: { x: -10, y: -20, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_2',
              time: 3.0,
              position: { x: x + 4, y: y + 3, z: z + 4 },
              rotation: { x: -15, y: 20, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
            {
              id: 'kf_3',
              time: 6.0,
              position: { x, y: y + 1.5, z: z + 2 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              easing: 'easeInOut',
            },
          ],
        };
    }
  }

  public dispose(): void {
    if (this.trajectoryGroup) {
      this.scene.remove(this.trajectoryGroup);
    }
  }
}
