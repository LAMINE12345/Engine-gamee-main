import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

/**
 * Sert les sources three.js (0.186) depuis node_modules pour l'exporteur
 * d'HTML autonome : le client les convertit en data: URLs, donc aucune
 * dépendance CDN (unpkg) et aucun fichier écrit dans public/.
 */
const ALLOWED: Record<string, string> = {
  'three.module.js': path.join('node_modules', 'three', 'build', 'three.module.js'),
  'three.core.js': path.join('node_modules', 'three', 'build', 'three.core.js'),
  'GLTFLoader.js': path.join('node_modules', 'three', 'examples', 'jsm', 'loaders', 'GLTFLoader.js'),
  'BufferGeometryUtils.js': path.join('node_modules', 'three', 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'),
  'SkeletonUtils.js': path.join('node_modules', 'three', 'examples', 'jsm', 'utils', 'SkeletonUtils.js'),
};

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const rel = ALLOWED[file];
  if (!rel) {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const abs = path.join(process.cwd(), rel);
    const src = await fs.readFile(abs, 'utf8');
    return new NextResponse(src, {
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Vendor unavailable', { status: 500 });
  }
}
