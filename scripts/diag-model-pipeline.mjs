// Diagnostic : vérifie que weld (mergeVertices) + simplify meshopt + computeVertexNormals
// ne corrompent pas une géométrie skinnée avec morphs (cas personnage importé).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

// Cylindre skinné synthétique : 2 segments de hauteur, poids mélangés + 1 morph.
function buildSkinned() {
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 2.0, 12, 4, false);
  const count = geo.attributes.position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const y = geo.attributes.position.getY(i);
    const t = THREE.MathUtils.clamp((y + 1) / 2, 0, 1); // 0 bas, 1 haut
    skinIndex[i * 4] = 0;
    skinIndex[i * 4 + 1] = 1;
    skinWeight[i * 4] = 1 - t;
    skinWeight[i * 4 + 1] = t;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  // Morph : gonfle en x de 10%.
  const morph = new Float32Array(geo.attributes.position.array);
  for (let i = 0; i < count; i++) morph[i * 3] *= 1.1;
  geo.morphAttributes.position = [new THREE.Float32BufferAttribute(morph, 3)];
  return geo;
}

const results = [];
function check(name, cond, extra = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
}

// Référence : skinning CPU manuel (2 bones : identité + translation x+1).
function skinPositions(geo, w0, w1) {
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    const x = pos.getX(i);
    // bone0 = identité, bone1 = translate(+1,0,0)
    out[i * 3] = x * w[0] + (x + 1) * w[1] + x * (w[2] + w[3]);
    out[i * 3 + 1] = pos.getY(i);
    out[i * 3 + 2] = pos.getZ(i);
  }
  return out;
}

const src = buildSkinned();
const refSkin = skinPositions(src, 0, 1);
check('src a skinIndex/skinWeight/morph', !!(src.attributes.skinIndex && src.attributes.skinWeight && src.morphAttributes.position?.length));

// 1. computeVertexNormals (finalize)
const g1 = src.clone();
g1.computeVertexNormals();
check('computeVertexNormals conserve position', arraysEqual(g1.attributes.position.array, src.attributes.position.array));
check('computeVertexNormals conserve skinWeight', arraysEqual(g1.attributes.skinWeight.array, src.attributes.skinWeight.array));

// 2. mergeVertices weld 1e-4 (ensureIndexedLive)
const welded = mergeVertices(src.clone(), 1e-4);
check('weld garde skinIndex', !!welded.attributes.skinIndex);
check('weld garde skinWeight', !!welded.attributes.skinWeight);
check('weld garde morphs', (welded.morphAttributes.position?.length ?? 0) === 1);
const weldedSkin = skinPositions(welded, 0, 1);
// Compare visuellement : échantillonne la surface (le weld ne doit pas déplacer les sommets)
let maxDisp = 0;
{
  const a = src.attributes.position;
  for (let i = 0; i < welded.attributes.position.count; i++) {
    const x = welded.attributes.position.getX(i);
    const y = welded.attributes.position.getY(i);
    const z = welded.attributes.position.getZ(i);
    let best = Infinity;
    for (let j = 0; j < a.count; j++) {
      const d = Math.hypot(x - a.getX(j), y - a.getY(j), z - a.getZ(j));
      if (d < best) best = d;
    }
    if (best > maxDisp) maxDisp = best;
  }
}
check('weld ne déplace pas les sommets (>1e-4 ?)', maxDisp <= 1e-4, `maxDisp=${maxDisp}`);

// 3. meshopt simplify 50% (generateLODs)
{
  const idx = new Uint32Array(welded.index.array);
  const posArr = welded.attributes.position.array;
  const target = Math.max(12, Math.floor(idx.length * 0.5));
  const [simplified, error] = MeshoptSimplifier.simplify(idx, posArr, 3, target, 1e-2, ['LockBorder']);
  check('simplify produit des indices valides', simplified.length > 0 && simplified.length <= target + 3, `len=${simplified.length}/${idx.length} err=${error}`);
  const maxV = welded.attributes.position.count - 1;
  let bad = 0;
  for (const v of simplified) if (v < 0 || v > maxV) bad++;
  check('simplify indices dans les bornes', bad === 0);
}

// 4. reorder (optimize) : l'ANCIEN code utilisait le remap comme index (BUG),
//    le NOUVEAU réordonne index + TOUS les attributs via le remap.
{
  const box = new THREE.BoxGeometry(1, 1, 1); // 12 tris, 36 indices
  const before = new Uint32Array(box.index.array);
  const sortedBefore = [...before].sort((a, b) => a - b);

  // ANCIEN code (GeometryPipeline.optimize avant fix) :
  const srcOld = new Uint32Array(box.index.array);
  const [reordered] = MeshoptEncoder.reorderMesh(srcOld, true, true);
  check(
    'BUG reproduit : remap appliqué comme index détruit la géométrie',
    reordered.length !== before.length || !arraysEqual([...reordered].sort((a, b) => a - b), sortedBefore),
    `(index ${before.length} → remap ${reordered.length})`
  );

  // NOUVEAU code (fix) : réordonne index + attributs. Convention meshopt :
  // new[remap[old]] = old[old] (remap = old→new).
  function remapAttributes(geometry, remap, unique) {
    const oldCount = geometry.attributes.position.count;
    const remapOne = (attr, itemSize) => {
      const Ctor = attr.normalized ? Float32Array : attr.array.constructor;
      const dst = new Ctor(unique * itemSize);
      for (let o = 0; o < oldCount; o++) {
        const n = remap[o];
        if (n >= unique) continue;
        for (let k = 0; k < itemSize; k++) dst[n * itemSize + k] = attr.getComponent(o, k);
      }
      const out = new THREE.BufferAttribute(dst, itemSize, false);
      if (typeof attr.usage === 'number') out.setUsage(attr.usage);
      return out;
    };
    for (const name of Object.keys(geometry.attributes)) {
      const attr = geometry.attributes[name];
      geometry.setAttribute(name, remapOne(attr, attr.itemSize));
    }
    for (const name of Object.keys(geometry.morphAttributes)) {
      geometry.morphAttributes[name] = geometry.morphAttributes[name].map((m) => remapOne(m, m.itemSize));
    }
  }

  const sk = buildSkinned();
  const skinBefore = skinPositions(sk, 0, 1);
  const morphBefore = new Float32Array(sk.morphAttributes.position[0].array);
  const srcNew = new Uint32Array(sk.index.array);
  const [remap, unique] = MeshoptEncoder.reorderMesh(srcNew, true, true);
  remapAttributes(sk, remap, unique);
  sk.setIndex(new THREE.BufferAttribute(srcNew, 1));
  check('FIX : index conserve le compte', sk.index.count === 360, `count=${sk.index.count}`);
  const skinAfter = skinPositions(sk, 0, 1);
  // Même multi-ensemble de positions skinnées (ordre permuté seulement).
  const sort3 = (arr) => {
    const pts = [];
    for (let i = 0; i < arr.length; i += 3) pts.push([arr[i], arr[i + 1], arr[i + 2]]);
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    return pts.flat();
  };
  const sb = sort3(skinBefore);
  const sa = sort3(skinAfter);
  let maxD = 0;
  for (let i = 0; i < sb.length; i++) maxD = Math.max(maxD, Math.abs(sb[i] - sa[i]));
  check('FIX : skinning préservé après reorder+remap', maxD < 1e-5, `maxΔ=${maxD.toExponential(1)}`);
  const morphAfter = sk.morphAttributes.position[0].array;
  const mb = sort3(morphBefore);
  const ma = sort3(morphAfter);
  let maxM = 0;
  for (let i = 0; i < mb.length; i++) maxM = Math.max(maxM, Math.abs(mb[i] - ma[i]));
  check('FIX : morphs préservés après reorder+remap', maxM < 1e-5, `maxΔ=${maxM.toExponential(1)}`);
  check('FIX : skinIndex/skinWeight présents', !!(sk.attributes.skinIndex && sk.attributes.skinWeight));
  let bad = 0;
  for (const v of sk.index.array) if (v < 0 || v >= unique) bad++;
  check('FIX : indices dans [0, uniques[', bad === 0, `uniques=${unique}`);
}

// 5. Roundtrip encode/decode du blob LOD (chemin applyLevel).
{
  const idx = new Uint32Array([0, 1, 2, 2, 1, 3, 4, 5, 6]);
  const raw = new Uint8Array(idx.buffer.slice(0));
  const encoded = MeshoptEncoder.encodeIndexBuffer(raw, idx.length, 4);
  const target = new Uint8Array(raw.length);
  MeshoptDecoder.decodeIndexBuffer(target, idx.length, 4, encoded);
  check('encode/decode blob LOD roundtrip', arraysEqual(new Uint32Array(target.buffer), idx));
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

console.log(results.join('\n'));
