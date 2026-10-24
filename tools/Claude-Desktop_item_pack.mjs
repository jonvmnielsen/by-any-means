// Claude-Desktop 23/10: pack item GLBs (a JSON list of {id, glb}) into one meshopt glTF JSON like the BAM packs.
// One node per item named Claude-Desktop_item_<id>; origin moved to bottom-centre (off = what was added, so -off restores the authored
// origin, e.g. the grip of a gun); colours from COLOR_0, else from the material base colour; LOD1/LOD2 meshes and skins are ignored.
// Usage: node Claude-Desktop_item_pack.mjs <list.json> <out_pack.json> <out_info.json>
import fs from 'fs';
import { Document } from '@gltf-transform/core';
import { io, glbToJson } from './Claude-Desktop_sd_gltf_util.mjs';
import { meshopt, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
const [listF, outF, infoF] = process.argv.slice(2); const list = JSON.parse(fs.readFileSync(listF));
const out = new Document(); const buf = out.createBuffer(); const scene = out.createScene('items'); const mat = out.createMaterial('item_facet');
const info = {};
for (const { id, glb } of list) {
  const src = await io.read(glb); const P = [], C = [], I = []; let base = 0;
  for (const n of src.getRoot().listNodes()) { const m = n.getMesh(); if (!m || /LOD[12]/.test(n.getName() + m.getName())) continue; const wm = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { const pos = p.getAttribute('POSITION'), col = p.getAttribute('COLOR_0'), idx = p.getIndices();
      const bc = p.getMaterial() ? p.getMaterial().getBaseColorFactor() : [0.5, 0.5, 0.5, 1];
      for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, []); P.push(wm[0]*v[0]+wm[4]*v[1]+wm[8]*v[2]+wm[12], wm[1]*v[0]+wm[5]*v[1]+wm[9]*v[2]+wm[13], wm[2]*v[0]+wm[6]*v[1]+wm[10]*v[2]+wm[14]);
        const c = col ? col.getElement(i, []) : bc; C.push(c[0], c[1], c[2]); }
      if (idx) for (let i = 0; i < idx.getCount(); i++) I.push(idx.getScalar(i) + base); else for (let i = 0; i < pos.getCount(); i++) I.push(i + base);
      base += pos.getCount(); } }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
  const off = [-(mn[0] + mx[0]) / 2, -mn[1], -(mn[2] + mx[2]) / 2];
  for (let i = 0; i < P.length; i += 3) { P[i] += off[0]; P[i + 1] += off[1]; P[i + 2] += off[2]; }
  const key = 'Claude-Desktop_item_' + id;
  const prim = out.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
    .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(C)).setBuffer(buf))
    .setIndices(out.createAccessor().setType('SCALAR').setArray(base > 65535 ? new Uint32Array(I) : new Uint16Array(I)).setBuffer(buf));
  scene.addChild(out.createNode(key).setMesh(out.createMesh(key).addPrimitive(prim)));
  info[key] = { size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map((v) => +v.toFixed(3)), off: off.map((v) => +v.toFixed(3)), tris: I.length / 3 };
}
await out.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const glb = await io.writeBinary(out); glbToJson(glb, outF); fs.writeFileSync(infoF, JSON.stringify(info));
console.log(Object.keys(info).length, 'items', (fs.statSync(outF).size / 1e6).toFixed(2), 'MB');
