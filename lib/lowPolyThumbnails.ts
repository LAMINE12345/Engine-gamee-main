import * as THREE from 'three';
import type { FoliagePainter, FoliageLibraryEntry } from './terrain/FoliagePainter';

/**
 * Rend des vignettes 3D (dataURL PNG) pour chaque modèle de la palette
 * low-poly. UN SEUL renderer WebGL offscreen est créé puis détruit : la
 * palette GLB ne sert que de source de géométries clonées.
 *
 * @param painter   instance FoliagePainter (fournit createLibraryMesh)
 * @param entries   entrées de la palette (id/name/category)
 * @param pixelSize côté du carré de rendu
 */
export async function renderLowPolyThumbnails(
  painter: FoliagePainter,
  entries: FoliageLibraryEntry[],
  pixelSize = 192
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (typeof document === 'undefined' || entries.length === 0) return out;

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(pixelSize, pixelSize, false);
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(3, 5, 4);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.5);
    fill.position.set(-4, 2, -3);
    scene.add(ambient, key, fill);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 5000);
    const up = new THREE.Vector3(1, 0.62, 1).normalize();

    let processed = 0;
    for (const entry of entries) {
      const mesh = painter.createLibraryMesh(entry.id);
      if (!mesh) {
        processed += 1;
        continue;
      }

      scene.add(mesh);
      const box = new THREE.Box3().setFromObject(mesh);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      if (sphere.radius > 0 && Number.isFinite(sphere.radius)) {
        const fovRad = (camera.fov * Math.PI) / 180;
        const dist = (sphere.radius / Math.sin(fovRad / 2)) * 1.08;
        camera.position.copy(sphere.center).addScaledVector(up, dist);
        camera.near = Math.max(dist / 500, 0.01);
        camera.far = dist * 4;
        camera.updateProjectionMatrix();
        camera.lookAt(sphere.center);
        renderer.render(scene, camera);
        out[entry.id] = canvas.toDataURL('image/png');
      }

      scene.remove(mesh);
      mesh.geometry.dispose();
      const mat = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mat.forEach((m) => m.dispose());

      // Yield de temps en temps pour ne pas bloquer le thread principal.
      processed += 1;
      if (processed % 8 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  } catch (err) {
    console.warn('[Aether] Vignettes low-poly impossibles à générer.', err);
  } finally {
    if (renderer) {
      renderer.dispose();
      const gl = renderer.getContext();
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  }
  return out;
}
