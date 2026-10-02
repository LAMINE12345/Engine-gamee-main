import * as THREE from 'three';

export type TexturePreset = 'none' | 'grid' | 'brushed' | 'pebbles' | 'diamond' | 'carbon';

/**
 * Procedural PBR Texture Generator
 * Generates real Normal Maps and Roughness Maps using HTML5 2D Canvas
 * without needing external asset downloads.
 */
export class TextureGenerator {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  /**
   * Generates a Normal Map canvas texture
   */
  public static getNormalMap(preset: TexturePreset, resolution = 512): THREE.CanvasTexture | null {
    if (preset === 'none') return null;

    const cacheKey = `normal_${preset}_${resolution}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Normal maps in tangent space: flat surface is RGB(128, 128, 255)
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, resolution, resolution);

    const imgData = ctx.getImageData(0, 0, resolution, resolution);
    const data = imgData.data;

    if (preset === 'grid') {
      // Grid tile bevels
      const tileSize = 64;
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const idx = (y * resolution + x) * 4;
          const mx = x % tileSize;
          const my = y % tileSize;
          let nx = 0;
          let ny = 0;

          if (mx < 4) nx = -1 + mx / 4;
          else if (mx > tileSize - 5) nx = (mx - (tileSize - 5)) / 4;

          if (my < 4) ny = -1 + my / 4;
          else if (my > tileSize - 5) ny = (my - (tileSize - 5)) / 4;

          // Convert tangent normal to RGB
          data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
          data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
          data[idx + 2] = 255;
          data[idx + 3] = 255;
        }
      }
    } else if (preset === 'brushed') {
      // Linear brushed metal streaks
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const idx = (y * resolution + x) * 4;
          const noise = (Math.sin(y * 0.8) * Math.cos(y * 1.5 + x * 0.05)) * 0.3;
          data[idx] = 128;
          data[idx + 1] = Math.floor((noise * 0.5 + 0.5) * 255);
          data[idx + 2] = 255;
          data[idx + 3] = 255;
        }
      }
    } else if (preset === 'pebbles') {
      // Perlin-style cellular bumps
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const idx = (y * resolution + x) * 4;
          const valX = Math.sin(x * 0.15) * Math.cos(y * 0.12);
          const valY = Math.cos(x * 0.12) * Math.sin(y * 0.15);
          data[idx] = Math.floor((valX * 0.4 + 0.5) * 255);
          data[idx + 1] = Math.floor((valY * 0.4 + 0.5) * 255);
          data[idx + 2] = 240;
          data[idx + 3] = 255;
        }
      }
    } else if (preset === 'diamond') {
      // Industrial diamond tread plate pattern
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const idx = (y * resolution + x) * 4;
          const u = (x / 32) % 1;
          const v = (y / 32) % 1;
          const diag = Math.abs(u - v);
          const bump = diag < 0.2 ? (0.2 - diag) * 5 : 0;
          data[idx] = Math.floor((bump * 0.3 + 0.5) * 255);
          data[idx + 1] = Math.floor((bump * 0.3 + 0.5) * 255);
          data[idx + 2] = 255;
          data[idx + 3] = 255;
        }
      }
    } else if (preset === 'carbon') {
      // Carbon fiber weave pattern
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const idx = (y * resolution + x) * 4;
          const blockX = Math.floor(x / 16) % 2;
          const blockY = Math.floor(y / 16) % 2;
          const isHoriz = (blockX ^ blockY) === 0;
          const angle = isHoriz ? Math.sin((y % 16) * 0.4) : Math.sin((x % 16) * 0.4);
          data[idx] = Math.floor((angle * 0.35 + 0.5) * 255);
          data[idx + 1] = Math.floor(((isHoriz ? 0 : angle) * 0.35 + 0.5) * 255);
          data[idx + 2] = 250;
          data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.needsUpdate = true;

    this.cache.set(cacheKey, texture);
    return texture;
  }

  /**
   * Generates a Roughness Map canvas texture
   */
  public static getRoughnessMap(preset: TexturePreset, resolution = 512): THREE.CanvasTexture | null {
    if (preset === 'none') return null;

    const cacheKey = `roughness_${preset}_${resolution}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(resolution, resolution);
    const data = imgData.data;

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4;
        let val = 128;

        if (preset === 'grid') {
          const mx = x % 64;
          const my = y % 64;
          val = (mx < 4 || my < 4) ? 220 : 70;
        } else if (preset === 'brushed') {
          val = 90 + Math.floor(Math.sin(y * 0.9) * 50);
        } else if (preset === 'pebbles') {
          val = 80 + Math.floor(Math.sin(x * 0.1) * Math.cos(y * 0.1) * 70);
        } else if (preset === 'diamond') {
          const u = (x / 32) % 1;
          const v = (y / 32) % 1;
          val = Math.abs(u - v) < 0.2 ? 40 : 180;
        } else if (preset === 'carbon') {
          const blockX = Math.floor(x / 16) % 2;
          const blockY = Math.floor(y / 16) % 2;
          val = (blockX ^ blockY) === 0 ? 50 : 160;
        }

        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.needsUpdate = true;

    this.cache.set(cacheKey, texture);
    return texture;
  }
}
