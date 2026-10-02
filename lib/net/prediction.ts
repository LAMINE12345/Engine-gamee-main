import * as THREE from 'three';
import { NET_RECONCILE_EPS } from './types';
import { cloneBodyState } from './playerSim';
import type { PlayerBodyState, PlayerSimParams } from './playerSim';

export interface PredictedStep {
  seq: number;
  bits: number;
  yaw: number;
  dt: number;
  /** État APRÈS simulation locale de ce pas (référence pour le rejouage). */
  state: PlayerBodyState;
}

/**
 * PredictionManager — client-side prediction + server reconciliation.
 *
 * Le client simule immédiatement (zéro latence ressentie) et mémorise chaque
 * pas (input + état). Quand un snapshot accuse `ackSeq`, l'état prédit à ce
 * seq est comparé à l'état serveur : si l'écart dépasse le seuil, on snappe
 * sur l'état serveur et on rejoue les inputs postérieurs (fonction pure
 * `stepPlayer`, pas de Rapier — les collisions serveur corrigent au snap).
 */
export class PredictionManager {
  private readonly history: PredictedStep[] = [];
  private readonly maxHistory = 180;
  public reconciliations = 0;
  public lastError = 0;

  public record(step: PredictedStep): void {
    this.history.push(step);
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  public reset(): void {
    this.history.length = 0;
    this.lastError = 0;
  }

  /**
   * Réconcilie avec l'état serveur. Retourne l'état corrigé à appliquer, ou
   * null si la prédiction était dans la tolérance (rien à faire).
   */
  public reconcile(
    serverPos: THREE.Vector3,
    serverVel: THREE.Vector3,
    serverVy: number,
    serverGrounded: boolean,
    ackSeq: number,
    stepFn: (s: PlayerBodyState, bits: number, yaw: number, dt: number) => void,
    params: PlayerSimParams
  ): { corrected: PlayerBodyState; replayed: number } | null {
    void params;
    const idx = this.history.findIndex((h) => h.seq === ackSeq);
    if (idx < 0) return null; // Trop vieux / inconnu : on fait confiance au flux.
    const predicted = this.history[idx].state;
    const err = Math.hypot(
      predicted.pos.x - serverPos.x,
      predicted.pos.y - serverPos.y,
      predicted.pos.z - serverPos.z
    );
    this.lastError = err;
    // Jette tout ce qui est antérieur ou égal à l'ack.
    this.history.splice(0, idx + 1);
    if (err <= NET_RECONCILE_EPS) return null;

    // Snap + rejouage des inputs postérieurs.
    const corrected: PlayerBodyState = {
      pos: serverPos.clone(),
      vel: new THREE.Vector3(serverVel.x, 0, serverVel.z),
      vy: serverVy,
      grounded: serverGrounded,
      yaw: this.history.length > 0 ? this.history[this.history.length - 1].yaw : 0,
    };
    let replayed = 0;
    for (const h of this.history) {
      stepFn(corrected, h.bits, h.yaw, h.dt);
      h.state = cloneBodyState(corrected);
      replayed++;
    }
    this.reconciliations++;
    return { corrected, replayed };
  }
}
