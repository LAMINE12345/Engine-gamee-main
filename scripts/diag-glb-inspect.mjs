// Inspecte la structure d'un GLB (sans décoder les images).
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'C:/Users/Lamine/Desktop/charcter/player.glb';
const buf = readFileSync(file);
const magic = buf.subarray(0, 4).toString('ascii');
const version = buf.readUInt32LE(4);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

console.log('magic:', magic, 'version:', version, 'taille:', buf.length);
console.log('scenes:', json.scenes?.length, 'nodes:', json.nodes?.length, 'meshes:', json.meshes?.length);
console.log('skins:', json.skins?.length ?? 0, 'animations:', json.animations?.length ?? 0, 'images:', json.images?.length ?? 0);
for (const [i, m] of (json.meshes ?? []).entries()) {
  console.log(`mesh[${i}] ${m.name}: ${m.primitives.length} prim(s)`);
  for (const [j, p] of m.primitives.entries()) {
    const attrs = Object.keys(p.attributes);
    console.log(`  prim[${j}] attrs=${attrs.join(',')} indices=${p.indices !== undefined} material=${p.material} targets=${p.targets?.length ?? 0}`);
  }
}
for (const [i, s] of (json.skins ?? []).entries()) {
  console.log(`skin[${i}]: joints=${s.joints.length} skeleton=${s.skeleton} inverseBindMatrices=${s.inverseBindMatrices}`);
}
for (const a of json.animations ?? []) {
  console.log(`anim: ${a.name} channels=${a.channels.length} samplers=${a.samplers.length}`);
}
// Nœuds avec scale non uniforme / négative ?
for (const [i, n] of (json.nodes ?? []).entries()) {
  if (n.scale && (n.scale[0] !== n.scale[1] || n.scale[1] !== n.scale[2] || n.scale.some((v) => v < 0))) {
    console.log(`node[${i}] ${n.name} SCALE SUSPECTE:`, n.scale);
  }
  if (n.matrix) console.log(`node[${i}] ${n.name} a une MATRICE:`, n.matrix);
}
console.log('extensionsUsed:', json.extensionsUsed ?? []);
console.log('extensionsRequired:', json.extensionsRequired ?? []);
