import * as THREE from 'three';
import { Entity, TransformComponent } from '../ecs/ECS';
import { VehicleControllerData } from '../../types/engine';
import { InputManager } from './CharacterControllerSystem';
import { ParticleManager } from '../vfx/ParticleManager';

export class VehicleControllerSystem {
  private camera: THREE.PerspectiveCamera | null = null;
  public input: InputManager;
  public particleManager?: ParticleManager;

  // Runtime vehicle states
  private currentSpeed: number = 0; // m/s
  private currentSteerAngle: number = 0; // radians
  private currentRoll: number = 0; // radians
  private currentPitch: number = 0; // radians
  private isDrifting: boolean = false;

  // Camera follow state
  private cameraTargetPos = new THREE.Vector3();
  private cameraLookTarget = new THREE.Vector3();
  private baseFOV: number = 60;

  constructor(camera?: THREE.PerspectiveCamera) {
    this.camera = camera || null;
    if (this.camera) {
      this.baseFOV = this.camera.fov;
    }
    this.input = new InputManager();
  }

  public activate(): void {
    this.input.bind();
  }

  public deactivate(): void {
    this.input.unbind();
  }

  public setCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.baseFOV = camera.fov;
  }

  /**
   * Main per-frame update loop for vehicle physics & camera follow
   */
  public update(
    dt: number,
    vehicleEntity: Entity,
    vehicleData: VehicleControllerData,
    _objectsMap: Map<string, THREE.Object3D>
  ): void {
    if (!vehicleData.enabled || !vehicleEntity.active || !vehicleEntity.object3D) return;

    const carObj = vehicleEntity.object3D;
    const transformComp = vehicleEntity.getComponent<TransformComponent>('Transform');

    // 1. Calculate Acceleration & Braking
    const maxSpeedMs = (vehicleData.maxSpeed || 120) / 3.6; // convert km/h to m/s
    const accelRate = vehicleData.engineForce || 45.0; // m/s^2 factor
    const brakeRate = vehicleData.brakeForce || 60.0;
    const dragCoeff = 0.985; // natural air resistance

    // Throttle / Reverse
    if (this.input.forward) {
      this.currentSpeed = Math.min(
        maxSpeedMs,
        this.currentSpeed + accelRate * dt
      );
    } else if (this.input.backward) {
      this.currentSpeed = Math.max(
        -maxSpeedMs * 0.4, // Reverse max speed is 40% of max forward
        this.currentSpeed - accelRate * 0.8 * dt
      );
    } else {
      // Coasting / Friction
      this.currentSpeed *= Math.pow(dragCoeff, dt * 60);
      if (Math.abs(this.currentSpeed) < 0.05) this.currentSpeed = 0;
    }

    // Handbrake / Hard Brake (Spacebar)
    if (this.input.jump) {
      if (this.currentSpeed > 0) {
        this.currentSpeed = Math.max(0, this.currentSpeed - brakeRate * dt);
      } else if (this.currentSpeed < 0) {
        this.currentSpeed = Math.min(0, this.currentSpeed + brakeRate * dt);
      }
      this.isDrifting = Math.abs(this.currentSpeed) > 5.0 && Math.abs(this.currentSteerAngle) > 0.1;
    } else {
      this.isDrifting = false;
    }

    // Nitro / Boost (Shift key)
    if (this.input.sprint && this.input.forward) {
      this.currentSpeed = Math.min(maxSpeedMs * 1.35, this.currentSpeed + accelRate * 2.0 * dt);
    }

    // 2. Calculate Steering
    const maxSteerRad = THREE.MathUtils.degToRad(vehicleData.steerAngle || 32);
    // Steering stability: Reduce max turn angle slightly at high speeds
    const speedRatio = Math.abs(this.currentSpeed) / maxSpeedMs;
    const effectiveMaxSteer = maxSteerRad * (1 - speedRatio * 0.35);

    const steerSpeed = 6.0; // steering responsiveness
    if (this.input.left) {
      this.currentSteerAngle = Math.min(
        effectiveMaxSteer,
        this.currentSteerAngle + steerSpeed * dt
      );
    } else if (this.input.right) {
      this.currentSteerAngle = Math.max(
        -effectiveMaxSteer,
        this.currentSteerAngle - steerSpeed * dt
      );
    } else {
      // Auto-center steering
      if (this.currentSteerAngle > 0) {
        this.currentSteerAngle = Math.max(0, this.currentSteerAngle - steerSpeed * 1.5 * dt);
      } else if (this.currentSteerAngle < 0) {
        this.currentSteerAngle = Math.min(0, this.currentSteerAngle + steerSpeed * 1.5 * dt);
      }
    }

    // 3. Apply Steering & Forward Movement to Vehicle Body
    if (Math.abs(this.currentSpeed) > 0.01) {
      // Turning rate depends on speed and steer angle
      const turnRadiusSign = this.currentSpeed >= 0 ? 1 : -1;
      const turnAmount = this.currentSteerAngle * (this.currentSpeed / 4.0) * turnRadiusSign * dt;
      carObj.rotateY(turnAmount);
    }

    // Forward displacement
    const forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(carObj.quaternion);
    carObj.position.addScaledVector(forwardVector, this.currentSpeed * dt);

    // 4. Suspension Body Roll & Pitch
    const targetRoll = -this.currentSteerAngle * (this.currentSpeed / maxSpeedMs) * 0.25;
    const targetPitch = this.input.forward
      ? -0.05
      : this.input.backward || this.input.jump
      ? 0.08
      : 0;

    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, targetRoll, dt * 8.0);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, targetPitch, dt * 8.0);

    // Apply visual suspension tilt to inner body group if exists or main mesh
    const chassisMesh = carObj.getObjectByName('ChassisBody') || carObj;
    chassisMesh.rotation.z = this.currentRoll;
    chassisMesh.rotation.x = this.currentPitch;

    // 5. Animate Wheel Rotations & Steering
    const wheelFrontLeft = carObj.getObjectByName('Wheel_FL');
    const wheelFrontRight = carObj.getObjectByName('Wheel_FR');
    const wheelRearLeft = carObj.getObjectByName('Wheel_RL');
    const wheelRearRight = carObj.getObjectByName('Wheel_RR');

    const wheelSpinAmount = (this.currentSpeed / 0.35) * dt; // pitch rotation based on wheel radius

    if (wheelFrontLeft && wheelFrontRight) {
      wheelFrontLeft.rotation.y = this.currentSteerAngle;
      wheelFrontRight.rotation.y = this.currentSteerAngle;
      wheelFrontLeft.rotation.x += wheelSpinAmount;
      wheelFrontRight.rotation.x += wheelSpinAmount;
    }
    if (wheelRearLeft && wheelRearRight) {
      wheelRearLeft.rotation.x += wheelSpinAmount;
      wheelRearRight.rotation.x += wheelSpinAmount;
    }

    // 6. Drift Smoke VFX
    if (this.isDrifting && this.particleManager) {
      const emitterId = `drift_smoke_${vehicleEntity.id}`;
      this.particleManager.createOrUpdateEmitter(
        emitterId,
        {
          enabled: true,
          preset: 'smoke',
          maxParticles: 30,
          rate: 45,
          speed: 1.5,
          size: 0.8,
          color: '#e2e8f0',
          gravity: 0.2,
          spread: 0.6,
          lifetime: 1.2,
          loop: true,
        },
        carObj.position.clone().add(new THREE.Vector3(0, 0.2, 0))
      );
    }

    // Export current speed metric in km/h
    vehicleData.currentSpeedKmH = Math.round(Math.abs(this.currentSpeed) * 3.6);

    // Sync transform component
    if (transformComp) {
      transformComp.syncFromObject3D(carObj);
    }

    // 7. Dynamic Third-Person Follow Camera with Speed Sensation
    if (this.camera) {
      const camDist = vehicleData.cameraDistance || 7.0;
      const camHeight = vehicleData.cameraHeight || 2.5;

      // Position behind car
      const idealCamOffset = new THREE.Vector3(0, camHeight, camDist).applyQuaternion(
        carObj.quaternion
      );
      const idealCamPos = carObj.position.clone().add(idealCamOffset);

      // Look slightly ahead of car
      const lookOffset = new THREE.Vector3(0, 1.2, -4.0).applyQuaternion(carObj.quaternion);
      const idealLookTarget = carObj.position.clone().add(lookOffset);

      // Smooth camera interpolation
      const lerpFactor = Math.min(1.0, dt * 7.5);
      this.cameraTargetPos.lerp(idealCamPos, lerpFactor);
      this.cameraLookTarget.lerp(idealLookTarget, lerpFactor);

      this.camera.position.copy(this.cameraTargetPos);
      this.camera.lookAt(this.cameraLookTarget);

      // Dynamic Speed FOV Scaling (sensation of speed)
      const targetFOV = this.baseFOV + (Math.abs(this.currentSpeed) / maxSpeedMs) * 22.0;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, dt * 5.0);
      this.camera.updateProjectionMatrix();
    }
  }

  public getCurrentSpeed(): number {
    return this.currentSpeed;
  }

  public getCurrentSteerAngle(): number {
    return this.currentSteerAngle;
  }

  public getIsDrifting(): boolean {
    return this.isDrifting;
  }

  public dispose(): void {
    this.deactivate();
  }
}
