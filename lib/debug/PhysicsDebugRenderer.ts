import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * PhysicsDebugRenderer — wireframes des colliders (+ joints, inclus par
 * Rapier) via `world.debugRender()`, + lignes transitoires (rayons de clic,
 * trajectoires) avec TTL.
 *
 * - Actif uniquement en Play (le `World` n'existe qu'en simulation).
 * - Buffers préalloués à croissance exponentielle (zéro alloc par frame
 *   côté three.js ; `debugRender()` alloue côté WASM-wrapper — mode debug).
 * - `depthTest: false` : les colliders restent visibles à travers les murs.
 */
export class PhysicsDebugRenderer {
  public visible = false;

  private readonly scene: THREE.Scene;
  private lines: THREE.LineSegments;
  private flashes: THREE.LineSegments;
  private flashData: Array<{
    ax: number; ay: number; az: number;
    bx: number; by: number; bz: number;
    r: number; g: number; b: number;
    ttl: number;
  }> = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.name = '__AETHER_PHYSICS_DEBUG__';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    this.scene.add(this.lines);

    const flashGeo = new THREE.BufferGeometry();
    flashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    flashGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    const flashMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    this.flashes = new THREE.LineSegments(flashGeo, flashMat);
    this.flashes.name = '__AETHER_PHYSICS_FLASH__';
    this.flashes.frustumCulled = false;
    this.flashes.renderOrder = 1000;
    this.flashes.visible = false;
    this.scene.add(this.flashes);
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) {
      this.lines.visible = false;
      this.flashes.visible = false;
      this.flashData = [];
    }
  }

  /** Ligne transitoire (s'efface après `ttlSec`). */
  public flashLine(
    a: THREE.Vector3,
    b: THREE.Vector3,
    color = new THREE.Color(0x38bdf8),
    ttlSec = 2
  ): void {
    if (this.flashData.length > 256) this.flashData.shift();
    this.flashData.push({
      ax: a.x, ay: a.y, az: a.z,
      bx: b.x, by: b.y, bz: b.z,
      r: color.r, g: color.g, b: color.b,
      ttl: ttlSec,
    });
  }

  /** Rayon NDC écran → monde (debug de clic), longueur `length`. */
  public flashScreenRay(
    clientX: number,
    clientY: number,
    domElement: HTMLElement,
    camera: THREE.PerspectiveCamera,
    length = 60,
    color = new THREE.Color(0xfbbf24)
  ): void {
    if (!this.visible) return;
    const rect = domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const end = raycaster.ray.origin
      .clone()
      .add(raycaster.ray.direction.clone().multiplyScalar(length));
    this.flashLine(raycaster.ray.origin, end, color, 2);
  }

  public update(world: RAPIER.World | null, dt: number): void {
    // Transitoires (même sans monde physique).
    this.updateFlashes(dt);

    if (!this.visible || !world) {
      this.lines.visible = false;
      return;
    }
    let buffers: { vertices: Float32Array; colors: Float32Array };
    try {
      buffers = world.debugRender();
    } catch {
      this.lines.visible = false;
      return;
    }
    const { vertices, colors } = buffers;
    if (!vertices || vertices.length === 0) {
      this.lines.visible = false;
      return;
    }

    const geo = this.lines.geometry;
    const count = vertices.length / 3;
    this.ensureCapacity(geo, 'position', count * 3);
    this.ensureCapacity(geo, 'color', count * 3);

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    (posAttr.array as Float32Array).set(vertices);
    // Rapier donne du RGBA par sommet ; three.js n'utilise que RGB.
    const colArray = colAttr.array as Float32Array;
    for (let v = 0; v < count; v++) {
      colArray[v * 3] = colors[v * 4] ?? 1;
      colArray[v * 3 + 1] = colors[v * 4 + 1] ?? 1;
      colArray[v * 3 + 2] = colors[v * 4 + 2] ?? 1;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.setDrawRange(0, count);
    this.lines.visible = true;
  }

  private updateFlashes(dt: number): void {
    if (!this.visible) {
      this.flashes.visible = false;
      return;
    }
    if (this.flashData.length === 0) {
      this.flashes.visible = false;
      return;
    }
    for (let i = this.flashData.length - 1; i >= 0; i--) {
      this.flashData[i].ttl -= dt;
      if (this.flashData[i].ttl <= 0) {
        this.flashData.splice(i, 1);
      }
    }
    const geo = this.flashes.geometry;
    const count = this.flashData.length * 2;
    this.ensureCapacity(geo, 'position', count * 3);
    this.ensureCapacity(geo, 'color', count * 3);
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const col = colAttr.array as Float32Array;
    this.flashData.forEach((f, i) => {
      pos.set([f.ax, f.ay, f.az, f.bx, f.by, f.bz], i * 6);
      col.set([f.r, f.g, f.b, f.r, f.g, f.b], i * 6);
    });
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.setDrawRange(0, count);
    this.flashes.visible = count > 0;
  }

  private ensureCapacity(geo: THREE.BufferGeometry, name: string, needed: number): void {
    const attr = geo.getAttribute(name) as THREE.BufferAttribute;
    if ((attr.array as Float32Array).length >= needed) return;
    const grown = Math.max(needed, (attr.array as Float32Array).length * 2, 1024);
    geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(grown), 3));
  }

  public dispose(): void {
    this.scene.remove(this.lines);
    this.scene.remove(this.flashes);
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    this.flashes.geometry.dispose();
    (this.flashes.material as THREE.Material).dispose();
    this.flashData = [];
  }
}
