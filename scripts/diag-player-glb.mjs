// Charge le VRAI player.glb et rejoue les étapes de finalizeModelImport +
// buildModelLODs en vérifiant l'intégrité du skinning à chaque étape.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { readFileSync } from 'node:fs';

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

// Polyfill minimal : les textures ne nous intéressent pas (géométrie only).
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

const results = [];
const check = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);

const buf = readFileSync('C:/Users/Lamine/Desktop/charcter/player.glb');
const loader = new GLTFLoader();
const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const root = gltf.scene;
check('parse GLB ok', !!root);

const skinned = [];
root.updateMatrixWorld(true);
root.traverse((o) => {
  if (o.isSkinnedMesh) skinned.push(o);
});
check('skinned meshes trouvés', skinned.length > 0, `n=${skinned.length}`);
let totalTris = 0;
for (const m of skinned) {
  const g = m.geometry;
  totalTris += (g.index ? g.index.count : g.attributes.position.count) / 3;
}
check('triangles totaux', true, `tris=${Math.round(totalTris)}`);

// Référence : positions skinnées en bind pose (bruit actuel des bones).
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
function skinnedSnapshot() {
  const out = [];
  for (const mesh of skinned) {
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update?.();
    const pos = mesh.geometry.attributes.position;
    const skinIndex = mesh.geometry.attributes.skinIndex;
    const skinWeight = mesh.geometry.attributes.skinWeight;
    const bones = mesh.skeleton.bones;
    const inv = mesh.skeleton.boneInverses;
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i);
      const acc = new THREE.Vector3();
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w === 0) continue;
        const b = skinIndex.getComponent(i, k);
        _m.copy(bones[b].matrixWorld).multiply(inv[b]);
        acc.add(_v.clone().applyMatrix4(_m).multiplyScalar(w));
      }
      arr[i * 3] = acc.x;
      arr[i * 3 + 1] = acc.y;
      arr[i * 3 + 2] = acc.z;
    }
    out.push(arr);
  }
  return out;
}
function maxDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}
const refSkin = skinnedSnapshot();
const refBox = new THREE.Box3().setFromObject(root);
check('bbox de référence', !refBox.isEmpty(), refBox.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(2)).join(','));

// ÉTAPE 1 : finalize — computeVertexNormals + bbox + center/scale + wrapper.
for (const mesh of skinned) {
  const geo = mesh.geometry;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
}
const bbox = new THREE.Box3().setFromObject(root);
const size = bbox.getSize(new THREE.Vector3());
const center = bbox.getCenter(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
let targetScale = 1;
if (maxDim > 15) targetScale = 4 / maxDim;
else if (maxDim < 0.2 && maxDim > 0) targetScale = 1.5 / maxDim;
check('auto-scale pour player.glb', true, `maxDim=${maxDim.toFixed(2)} targetScale=${targetScale}`);
const offset = new THREE.Vector3(-center.x, -bbox.min.y, -center.z);
root.position.copy(offset.multiplyScalar(targetScale));
const wrapper = new THREE.Group();
wrapper.scale.setScalar(targetScale);
wrapper.add(root);
wrapper.updateMatrixWorld(true);
root.updateMatrixWorld(true);

// Compare le skinning monde (wrapper inclus) vs référence transformée attendue.
const afterSkin = skinnedSnapshot();
let worst = 0;
for (let i = 0; i < refSkin.length; i++) {
  // Attendu : (ref + offset*targetScale) * targetScale... offset déjà scalé dans root.position.
  const d = maxDiff(refSkin[i], afterSkin[i]);
  // NOTE : on compare en tenant compte du déplacement rigide root+wrapper :
  // on mesure plutôt la déformation non-rigide via les distances locales.
  if (d > worst) worst = d;
}
check('skinning monde après finalize (déplacement rigide attendu)', true, `écart brut=${worst.toFixed(4)}`);

// Déformation NON-RIGIDE : compare les arêtes (longueurs invariantes par mouvement rigide).
function edgeStats() {
  const lens = [];
  for (const mesh of skinned) {
    const g = mesh.geometry;
    const idx = g.index;
    const pos = g.attributes.position;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const bones = mesh.skeleton.bones;
    const inv = mesh.skeleton.boneInverses;
    const P = (i, out) => {
      _v.fromBufferAttribute(pos, i);
      out.set(0, 0, 0);
      const tmp = new THREE.Vector3();
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w === 0) continue;
        const b = si.getComponent(i, k);
        _m.copy(bones[b].matrixWorld).multiply(inv[b]);
        tmp.copy(_v).applyMatrix4(_m);
        out.addScaledVector(tmp, w);
      }
      return out;
    };
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      P(idx.getX(t), A);
      P(idx.getX(t + 1), B);
      lens.push(A.distanceTo(B));
    }
  }
  return lens;
}
// NOTE : edgeStats utilise le squelette courant (bind pose ici des deux côtés).
const edgesBefore = edgeStats();

check('skinned count stable', skinned.length > 0);

// ÉTAPE 2 : weld (ensureIndexedLive) sur chaque mesh, comme buildModelLODs.
let weldChanged = 0;
for (const mesh of skinned) {
  const g = mesh.geometry;
  const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
  if (tris < 1000) continue;
  const welded = mergeVertices(g, 1e-4);
  if (welded.index && g.index && welded.index.count !== g.index.count) weldChanged++;
  mesh.geometry = welded;
}
check('weld appliqué (meshs ≥1000 tris)', true, `modifiés=${weldChanged}`);

// ÉTAPE 3 : optimize CORRIGÉ (reorder + remap attributs).
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
let optOk = true;
for (const mesh of skinned) {
  const g = mesh.geometry;
  if (!g.index || (g.groups?.length ?? 0) > 0) continue;
  const before = [...g.index.array].sort((a, b) => a - b);
  const src = new Uint32Array(g.index.array);
  const [remap, unique] = MeshoptEncoder.reorderMesh(src, true, true);
  remapAttributes(g, remap, unique);
  g.setIndex(new THREE.BufferAttribute(src, 1));
  // L'index pointe vers le compacté : multiset différent MAIS valide.
  let bad = 0;
  for (const v of g.index.array) if (v < 0 || v >= unique) bad++;
  if (bad > 0) optOk = false;
}
check('optimize(fix) : indices valides post-remap', optOk);

// ÉTAPE 4 : arrêt ici — le skinning final doit matcher le bind d'origine
// (mêmes poids, mêmes bones) : compare les MULTI-ENSEMBLES d'arêtes triés
// (l'ordre des triangles change au reorder, pas la géométrie).
const edgesAfter = edgeStats();
const sb = [...edgesBefore].sort((a, b) => a - b);
const sa = [...edgesAfter].sort((a, b) => a - b);
let edgeDiff = 0;
for (let i = 0; i < Math.min(sb.length, sa.length); i++) {
  const d = Math.abs(sb[i] - sa[i]);
  if (d > edgeDiff) edgeDiff = d;
}
check('arêtes skinnées invariantes après pipeline', sb.length === sa.length && edgeDiff < 2e-4, `maxΔ=${edgeDiff.toExponential(2)} n=${sb.length}/${sa.length}`);

console.log(results.join('\n'));
