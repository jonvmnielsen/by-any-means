// Claude-Desktop 23/10: bring a folder of new assets into the BAM web game as an add-on, without touching game.js or the base packs.
//   node Claude-Desktop_addon_import.mjs <asset-folder> <game-folder> <addon-name>
// Asset folder (the hand-off format in docs/ASSET_INDBAKKE.md):
//   <key>_LOD0.glb (+ _LOD1/_LOD2) or <key>.glb, and <key>.json (optional: category, container {slots, search_s, loot_table, interact})
//   layout.json (optional): [{ "key": "...", "pos": [x, y, z], "rot": r, "scale": 1, "cat": "prop" }]  or  { "placements": [...], "clear": [[x0, z0, x1, z1, ["tree", "plant", "grass"]]] }
//   (key with or without the Claude-Desktop_ prefix; y may be null = on the terrain is not computed here, give a height)
// Writes <game>/data/addon_<name>_lod0.json (+ _lod1), <game>/data/addon_<name>_layout.json and adds both to <game>/data/addons.json.
// Never overwrites: refuses if the add-on files already exist (use a new name, e.g. sd_round4b).
// Origins stay as authored (bottom-centre per the asset checklist); colours from COLOR_0, else the material base colour; glass-named
// materials go to a separate node <key>__glass placed in the 'glass' category (transparent material in the game).
import fs from 'fs'; import path from 'path';
import { Document } from '@gltf-transform/core';
import { io, glbToJson } from './Claude-Desktop_sd_gltf_util.mjs';
import { meshopt, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
const [dir, game, name] = process.argv.slice(2);
if (!dir || !game || !/^[a-z0-9_]+$/.test(name || '')) { console.error('usage: node Claude-Desktop_addon_import.mjs <asset-folder> <game-folder> <addon_name (a-z0-9_)>'); process.exit(1); }
const D = path.join(game, 'data'); const outs = [0, 1].map((l) => path.join(D, `addon_${name}_lod${l}.json`)); const layF = path.join(D, `addon_${name}_layout.json`);
for (const f of [...outs, layF]) if (fs.existsSync(f)) { console.error('exists, not overwriting:', f); process.exit(1); }
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb'));
const keyOf = (f) => 'Claude-Desktop_' + path.basename(f, '.glb').replace(/_LOD\d$/, '').replace(/^Claude-Desktop_/, '');
const lodOf = (f) => { const m = /_LOD(\d)\.glb$/.exec(f); return m ? +m[1] : 0; };
const meta = {}; const glassy = new Set();
async function pack(lod) {
  const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene('addon'); const mat = doc.createMaterial('facet'), gmat = doc.createMaterial('glass'); let n = 0;
  for (const f of files.filter((f) => lodOf(f) === lod)) {
    const key = keyOf(f); const src = await io.read(path.join(dir, f)); const groups = { main: { P: [], C: [], I: [] }, glass: { P: [], C: [], I: [] } };
    for (const nd of src.getRoot().listNodes()) { const m = nd.getMesh(); if (!m) continue; const wm = nd.getWorldMatrix();
      for (const p of m.listPrimitives()) { const mn = p.getMaterial() ? p.getMaterial().getName() : ''; const G = /glass/i.test(mn) ? groups.glass : groups.main;
        const pos = p.getAttribute('POSITION'), col = p.getAttribute('COLOR_0'), idx = p.getIndices(); const bc = p.getMaterial() ? p.getMaterial().getBaseColorFactor() : [0.5, 0.5, 0.5, 1]; const base = G.P.length / 3;
        for (let i = 0; i < pos.getCount(); i++) { const v = pos.getElement(i, []); G.P.push(wm[0]*v[0]+wm[4]*v[1]+wm[8]*v[2]+wm[12], wm[1]*v[0]+wm[5]*v[1]+wm[9]*v[2]+wm[13], wm[2]*v[0]+wm[6]*v[1]+wm[10]*v[2]+wm[14]); const c = col ? col.getElement(i, []) : bc; G.C.push(c[0], c[1], c[2]); }
        if (idx) for (let i = 0; i < idx.getCount(); i++) G.I.push(idx.getScalar(i) + base); else for (let i = 0; i < pos.getCount(); i++) G.I.push(i + base); } }
    for (const [gn, G] of Object.entries(groups)) { if (!G.I.length) continue; const nm = gn === 'glass' ? key + '__glass' : key; if (gn === 'glass') glassy.add(key);
      const prim = doc.createPrimitive().setMaterial(gn === 'glass' ? gmat : mat)
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(G.P)).setBuffer(buf))
        .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(G.C)).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(G.P.length / 3 > 65535 ? new Uint32Array(G.I) : new Uint16Array(G.I)).setBuffer(buf));
      scene.addChild(doc.createNode(nm).setMesh(doc.createMesh(nm).addPrimitive(prim))); n++; }
    const jf = path.join(dir, path.basename(f, '.glb').replace(/_LOD\d$/, '') + '.json'); if (lod === 0 && fs.existsSync(jf)) meta[key] = JSON.parse(fs.readFileSync(jf));
  }
  if (!n) return false;
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' })); glbToJson(await io.writeBinary(doc), outs[lod]); return true;
}
const have = [await pack(0), await pack(1)];
// layout
const LJ = path.join(dir, 'layout.json'); let lay = fs.existsSync(LJ) ? JSON.parse(fs.readFileSync(LJ)) : []; if (Array.isArray(lay)) lay = { placements: lay };
const out = { placements: {}, clear: lay.clear || [], containers: {}, note: `add-on ${name} from ${dir}` };
const catOf = (key, p) => p.cat || (meta[key] && (meta[key].category || meta[key].cat)) || 'prop';
for (const p of lay.placements || []) { const key = 'Claude-Desktop_' + String(p.key).replace(/^Claude-Desktop_/, ''); const c = catOf(key, p); const v = [p.pos[0], p.pos[1] ?? 0, p.pos[2], p.rot || 0, p.scale || 1];
  ((out.placements[c] = out.placements[c] || {})[key] = out.placements[c][key] || []).push(...v);
  if (glassy.has(key)) ((out.placements.glass = out.placements.glass || {})[key + '__glass'] = out.placements.glass[key + '__glass'] || []).push(...v); }
for (const [k, m] of Object.entries(meta)) if (m.container) { const c = m.container; out.containers[k] = { name: m.name_da || m.name || k.replace('Claude-Desktop_', ''), slots: c.slots, search_s: c.search_s, table: c.loot_table, interact: c.interact, interact_back: c.interact_back }; }
fs.writeFileSync(layF, JSON.stringify(out));
// register
const AF = path.join(D, 'addons.json'); const A = fs.existsSync(AF) ? JSON.parse(fs.readFileSync(AF)) : { packs: [], layouts: [] };
have.forEach((h, l) => { const f = `data/addon_${name}_lod${l}.json`; if (h && !A.packs.some((p) => p.file === f)) A.packs.push({ file: f, lod: l }); });
const lf = `data/addon_${name}_layout.json`; if (!A.layouts.includes(lf)) A.layouts.push(lf);
fs.writeFileSync(AF, JSON.stringify(A, null, 1));
console.log(`add-on ${name}: ${files.length} GLB, packs ${have.map((h, l) => (h ? 'lod' + l : '')).filter(Boolean).join('+')}, ${Object.values(out.placements).reduce((a, c) => a + Object.values(c).reduce((b, x) => b + x.length / 5, 0), 0)} placements, ${Object.keys(out.containers).length} containers`);
