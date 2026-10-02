/**
 * vehicleFactory.ts
 * Procedural sports-car construction, extracted from SceneManager.
 *
 * This was `SceneManager.createVehicleGroup()`. It was the largest method in
 * the 8.5k-line SceneManager that never touched `this` — i.e. it depended on no
 * engine state at all — so moving it out is a pure structural change: same
 * Three.js scene graph, same userData, same call signature.
 *
 * Being stateless also makes it unit-testable in a plain Node environment
 * (no WebGL, no DOM), which SceneManager itself is not.
 */

import * as THREE from 'three';

/**
 * The vehicle's physics profile, shared by the mesh builder and by
 * `assignDefaultPhysics()`'s vehicle branch.
 *
 * It used to be written out twice — once here, once in the physics defaults —
 * so the two copies could silently drift apart. Both were byte-identical, so
 * sharing the value is behaviour-preserving.
 */
export function createVehiclePhysics() {
  return {
    rigidbody: {
      enabled: true,
      type: 'kinematic',
      mass: 1200,
      restitution: 0.1,
      friction: 0.8,
    },
    collider: {
      shape: 'box',
      size: { x: 2.0, y: 1.2, z: 4.2 },
    },
    vehicleController: {
      enabled: true,
      engineForce: 55.0,
      maxSpeed: 140.0,
      brakeForce: 70.0,
      steerAngle: 32,
      suspensionStiffness: 35.0,
      suspensionDamping: 4.5,
      suspensionRestLength: 0.6,
      gripFriction: 0.85,
      cameraDistance: 7.5,
      cameraHeight: 2.5,
    },
  };
}

/**
 * Constructs a procedural high-detail 3D Sports Car.
 */
export function createVehicleGroup(posX: number, posZ: number): THREE.Group {
  const vehicleGroup = new THREE.Group();
  vehicleGroup.position.set(posX, 0.45, posZ);

  // 1. Chassis Body Group (for suspension pitch & roll animations)
  const chassisGroup = new THREE.Group();
  chassisGroup.name = 'ChassisBody';

  // Main Car Body Mesh (Sleek sports car lower body)
  const bodyGeo = new THREE.BoxGeometry(1.9, 0.65, 4.0);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Sports Car Ocean Blue
    metalness: 0.85,
    roughness: 0.15,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.set(0, 0.4, 0);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  chassisGroup.add(bodyMesh);

  // Cockpit Roof / Glass Cabin
  const cabinGeo = new THREE.BoxGeometry(1.5, 0.55, 2.0);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.95,
    roughness: 0.05,
    transparent: true,
    opacity: 0.85,
  });
  const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
  cabinMesh.position.set(0, 0.9, -0.2);
  cabinMesh.castShadow = true;
  chassisGroup.add(cabinMesh);

  // LED Headlights (Front - Cyan/White emissive)
  const headGeo = new THREE.BoxGeometry(0.35, 0.12, 0.1);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.5,
  });
  const headL = new THREE.Mesh(headGeo, headMat);
  headL.position.set(-0.65, 0.42, -1.98);
  const headR = new THREE.Mesh(headGeo, headMat);
  headR.position.set(0.65, 0.42, -1.98);
  chassisGroup.add(headL, headR);

  // Rear Tail Lights (Back - Red emissive)
  const tailGeo = new THREE.BoxGeometry(0.4, 0.12, 0.1);
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 2.0,
  });
  const tailL = new THREE.Mesh(tailGeo, tailMat);
  tailL.position.set(-0.65, 0.45, 1.98);
  const tailR = new THREE.Mesh(tailGeo, tailMat);
  tailR.position.set(0.65, 0.45, 1.98);
  chassisGroup.add(tailL, tailR);

  // Rear Spoiler Wing
  const spoilerWingGeo = new THREE.BoxGeometry(1.8, 0.08, 0.35);
  const spoilerWingMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.9,
    roughness: 0.2,
  });
  const spoilerWing = new THREE.Mesh(spoilerWingGeo, spoilerWingMat);
  spoilerWing.position.set(0, 1.15, 1.8);
  chassisGroup.add(spoilerWing);

  vehicleGroup.add(chassisGroup);

  // 2. 4 Wheels with Alloy Rims
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 24);
  wheelGeo.rotateZ(Math.PI / 2); // Orient horizontal
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.1 });

  const createWheel = (name: string, posX: number, posY: number, posZ: number) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.name = name;
    wheelGroup.position.set(posX, posY, posZ);

    const tireMesh = new THREE.Mesh(wheelGeo, tireMat);
    tireMesh.castShadow = true;
    wheelGroup.add(tireMesh);

    // Alloy Rim Cap
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.29, 12);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    wheelGroup.add(rimMesh);

    return wheelGroup;
  };

  const wheelFL = createWheel('Wheel_FL', -0.92, 0.35, -1.2);
  const wheelFR = createWheel('Wheel_FR', 0.92, 0.35, -1.2);
  const wheelRL = createWheel('Wheel_RL', -0.92, 0.35, 1.2);
  const wheelRR = createWheel('Wheel_RR', 0.92, 0.35, 1.2);

  vehicleGroup.add(wheelFL, wheelFR, wheelRL, wheelRR);

  // Attach Vehicle Controller Physics Data
  vehicleGroup.userData = {
    subType: 'vehicle',
    physics: createVehiclePhysics(),
  };

  return vehicleGroup;
}
