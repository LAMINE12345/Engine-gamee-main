import * as THREE from 'three';
import { NetInputBits } from './types';

/**
 * lib/net/playerSim.ts — simulation joueur pure (déterministe).
 *
 * Miroir exact des maths de `CharacterControllerSystem.update` (lissage
 * exponentiel 12 Hz, gravité -18, saut, clamp sol Y=0.9) SANS caméra, SANS
 * Rapier, SANS DOM. Utilisée :
 * - par l'hôte pour simuler les joueurs distants (autorité),
 * - par le client pour rejouer les inputs (réconciliation).
 * Toute divergence résiduelle (collisions Rapier) est corrigée par snap.
 */

export interface PlayerSimParams {
  speed: number;
  jumpForce: number;
}

export const DEFAULT_SIM_PARAMS: PlayerSimParams = { speed: 7.0, jumpForce: 8.5 };

export interface PlayerBodyState {
  pos: THREE.Vector3;
  /** Vélocité horizontale (x, z) lissée. */
  vel: THREE.Vector3;
  vy: number;
  grounded: boolean;
  yaw: number;
}

export function createBodyState(x = 0, y = 1.05, z = 0, yaw = 0): PlayerBodyState {
  return {
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    vy: 0,
    grounded: true,
    yaw,
  };
}

export function cloneBodyState(s: PlayerBodyState): PlayerBodyState {
  return {
    pos: s.pos.clone(),
    vel: s.vel.clone(),
    vy: s.vy,
    grounded: s.grounded,
    yaw: s.yaw,
  };
}

const _move = new THREE.Vector3();
const _target = new THREE.Vector3();

/**
 * Avance la simulation d'un pas. `yaw` = orientation caméra (mouvement
 * relatif caméra comme dans CharacterControllerSystem).
 */
export function stepPlayer(
  s: PlayerBodyState,
  bits: number,
  yaw: number,
  dt: number,
  params: PlayerSimParams = DEFAULT_SIM_PARAMS
): void {
  const clampedDt = Math.min(Math.max(dt, 0.0001), 0.1);
  const sprint = (bits & NetInputBits.Sprint) !== 0 ? 1.5 : 1.0;
  const crouch = (bits & NetInputBits.Crouch) !== 0 ? 0.5 : 1.0;
  const moveSpeed = params.speed * sprint * crouch;

  // Direction caméra-relative (XZ).
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const fwdX = -sin;
  const fwdZ = -cos;
  const rightX = cos;
  const rightZ = -sin;
  _move.set(0, 0, 0);
  if (bits & NetInputBits.Forward) {
    _move.x += fwdX;
    _move.z += fwdZ;
  }
  if (bits & NetInputBits.Backward) {
    _move.x -= fwdX;
    _move.z -= fwdZ;
  }
  if (bits & NetInputBits.Right) {
    _move.x += rightX;
    _move.z += rightZ;
  }
  if (bits & NetInputBits.Left) {
    _move.x -= rightX;
    _move.z -= rightZ;
  }
  if (_move.lengthSq() > 0.001) {
    _move.normalize();
    _target.copy(_move).multiplyScalar(moveSpeed);
  } else {
    _target.set(0, 0, 0);
  }

  // Lissage exponentiel (même formule que le CharacterController).
  const accelFactor = 1.0 - Math.exp(-12.0 * clampedDt);
  s.vel.lerp(_target, accelFactor);

  // Gravité / saut.
  if (s.grounded) {
    if (bits & NetInputBits.Jump) {
      s.vy = params.jumpForce;
      s.grounded = false;
    } else {
      s.vy = -1.5;
    }
  } else {
    s.vy += -18.0 * clampedDt;
    if (s.vy < -25) s.vy = -25;
  }

  s.pos.x += s.vel.x * clampedDt;
  s.pos.z += s.vel.z * clampedDt;
  s.pos.y += s.vy * clampedDt;

  // Clamp sol (fallback plan Y=0, offset capsule 0.9).
  if (s.pos.y <= 0.9) {
    s.pos.y = 0.9;
    s.vy = 0;
    s.grounded = true;
  } else if (s.vy !== -1.5 || !s.grounded) {
    if (s.pos.y > 0.901) s.grounded = false;
  }
  s.yaw = yaw;
}

/** Yaw (rad) de la direction avant caméra projetée sur XZ. */
export function cameraForwardYaw(cam: THREE.Camera): number {
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) return 0;
  dir.normalize();
  return Math.atan2(-dir.x, -dir.z);
}

/** Échantillonne les flags d'InputManager vers les bits réseau. */
export function sampleInputBits(input: {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  attack: boolean;
}): { bits: number; attackEdge: boolean } {
  let bits = 0;
  if (input.forward) bits |= NetInputBits.Forward;
  if (input.backward) bits |= NetInputBits.Backward;
  if (input.left) bits |= NetInputBits.Left;
  if (input.right) bits |= NetInputBits.Right;
  if (input.jump) bits |= NetInputBits.Jump;
  if (input.sprint) bits |= NetInputBits.Sprint;
  if (input.crouch) bits |= NetInputBits.Crouch;
  if (input.attack) bits |= NetInputBits.Attack;
  return { bits, attackEdge: input.attack };
}
