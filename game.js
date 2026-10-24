// BAM - browser build v4 (Claude-Desktop 23/10): v6 world + humvees + sound (v3_lyd) merged with the SD branch (roadside, SD zombies, loot, guns, minigun rig). three.js r170.
// World data: data/world.json (placements per category / asset key, glTF axes: x east, y up, z south),
// data/pack_*.glb (one mesh per asset, meshopt), data/heightmap_u16.bin, chars/*.glb (rigged characters with clips).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { ITEMS, make, newGrid, addToGrid, rollInto, gridForSlots, hash, rng, take, count, SD_ID } from './items.js';
import { makeInvUI, newInventory, withGrid, playerGrids, slotFor, SLOTS } from './inv.js';

const $ = (id) => document.getElementById(id);
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const LO = /[?&]lo\b/.test(location.search);       // test switch: low quality
const Q = TOUCH || LO ? 0.7 : 1.0;               // view-distance factor on phones
const AREA_NAMES = { town: 'Town', filling_station: 'Filling Station', farm: 'Farm', lake: 'Lake', forest_clearing: 'Forest Clearing',
  military_base: 'Military Base', outpost: 'Outpost', checkpoint: 'Checkpoint', roadside: 'Roadside' };

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(LO ? 0.5 : Math.min(devicePixelRatio, TOUCH ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !LO; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xc9cdc4), ZENITH = new THREE.Color(0x7d9bb5);
scene.fog = new THREE.Fog(HORIZON, 140 * Q, 950 * Q);
scene.background = HORIZON;
{ // sky dome
  const g = new THREE.SphereGeometry(3000, 24, 12);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: ZENITH }, bottom: { value: HORIZON } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*2.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }' });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky); scene.userData.sky = sky;
}
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3200);
const hemi = new THREE.HemisphereLight(0xd8e2ea, 0x5d5140, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.38).normalize();
sun.castShadow = true; sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide });
const GLASS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.6, flatShading: true, depthWrite: false, side: THREE.DoubleSide });
const WATER = new THREE.MeshStandardMaterial({ color: 0x3f6c74, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82, flatShading: true });

// ---------------------------------------------------------------- loading
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
// embedded textures: load through <img> (the page may not fetch() blob: URLs)
loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'bam_img_textures' }; });
const FILES = { 'data/world.json': 0.84, 'data/heightmap.json': 1.10, 'data/pack_terrain_near.json': 6.10, 'data/pack_terrain_far.json': 1.76,
  'data/pack_world_lod0.json': 4.81, 'data/pack_world_lod1.json': 3.16, 'data/pack_nature_lod0.json': 0.48, 'data/pack_nature_lod1.json': 0.17,
  'data/pack_nature_lod2.json': 0.10, 'data/pack_far.json': 0.77, 'data/pack_sd.json': 1.52, 'chars/Claude-Desktop_survivor_m_a.json': 7.16, 'chars/Claude-Desktop_survivor_f_brun.json': 6.88,
  'chars/Claude-Desktop_zombie_01.json': 2.16, 'chars/Claude-Desktop_zombie_02.json': 2.29, 'chars/Claude-Desktop_zombie_m_a.json': 1.50,
  'chars/Claude-Desktop_zombie_m_b.json': 1.50, 'chars/Claude-Desktop_zombie_m_c.json': 1.50,
  'chars/Claude-Desktop_survivor_f_blond.json': 1.26, 'chars/Claude-Desktop_zombie_f_a.json': 1.25, 'chars/Claude-Desktop_zombie_f_b.json': 1.26, 'chars/Claude-Desktop_zombie_f_c.json': 1.26,
  'chars/Claude-Desktop_zombie_soldat_a.json': 1.49, 'chars/Claude-Desktop_zombie_soldat_b.json': 1.50, 'chars/Claude-Desktop_zombie_soldat_c.json': 1.49, 'chars/Claude-Desktop_zombie_soldat_d.json': 1.49,
  'gear/Claude-Desktop_wear_chestrig_survivor_m.json': 0.13, 'gear/Claude-Desktop_wear_vest_survivor_m.json': 0.12, 'gear/Claude-Desktop_wear_belt_survivor_m.json': 0.05,
  'gear/Claude-Desktop_wear_backpack_survivor_m.json': 0.29, 'gear/Claude-Desktop_wear_holster_survivor_m_LOD0.json': 0.01, 'gear/Claude-Desktop_wear_helmet_survivor_m_LOD0.json': 0.03,
  'gear/Claude-Desktop_gun_assault_rifle_v4_s1_LOD0.json': 0.19, 'data/pack_items.json': 0.14, 'data/minigun.json': 0.03,
  'chars/Claude-Desktop_zombie_sd_worker.json': 1.5, 'chars/Claude-Desktop_zombie_sd_police.json': 1.48, 'chars/Claude-Desktop_zombie_sd_doctor.json': 1.54, 'chars/Claude-Desktop_zombie_sd_business.json': 1.49, 'chars/Claude-Desktop_zombie_sd_firefighter.json': 1.5, 'chars/Claude-Desktop_zombie_sd_hunter.json': 1.5, 'chars/Claude-Desktop_zombie_sd_bloated.json': 1.29, 'chars/Claude-Desktop_zombie_sd_f_jogger.json': 1.31, 'chars/Claude-Desktop_zombie_sd_f_nurse.json': 1.33, 'chars/Claude-Desktop_zombie_sd_f_hiker.json': 1.32 };
const TOTAL = Object.values(FILES).reduce((a, b) => a + b, 0); const got = {};
function progress(f, frac) { if (!(f in FILES)) return; got[f] = FILES[f] * frac; const p = Object.values(got).reduce((a, b) => a + b, 0) / TOTAL; $('bar').firstElementChild.style.width = (100 * p).toFixed(1) + '%'; }
function fetchBin(f) {
  return new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', f); x.responseType = 'arraybuffer';
    x.onprogress = (e) => e.lengthComputable && progress(f, e.loaded / e.total); x.onload = () => { progress(f, 1); x.status < 300 ? res(x.response) : rej(new Error(f + ' ' + x.status)); };
    x.onerror = () => rej(new Error('Could not load ' + f)); x.send(); });
}
// The data files are glTF JSON with the buffer embedded as base64 (the host only serves .json). The page may not fetch data: URIs,
// so the buffer is decoded here and handed to the loader as an in-memory GLB.
function b64ToBytes(s) { const bs = atob(s); const u8 = new Uint8Array(bs.length); for (let i = 0; i < bs.length; i++) u8[i] = bs.charCodeAt(i); return u8; }
function jsonToGlb(buf) {
  const J = JSON.parse(new TextDecoder().decode(buf)); const uri = J.buffers[0].uri; delete J.buffers[0].uri;
  const bin = b64ToBytes(uri.slice(uri.indexOf(',') + 1)); J.buffers[0].byteLength = bin.length;
  let js = new TextEncoder().encode(JSON.stringify(J)); const jpad = (4 - (js.length % 4)) % 4, bpad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + js.length + jpad + 8 + bin.length + bpad; const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length + jpad, true); dv.setUint32(16, 0x4e4f534a, true); out.set(js, 20); out.fill(0x20, 20 + js.length, 20 + js.length + jpad);
  const o = 20 + js.length + jpad; dv.setUint32(o, bin.length + bpad, true); dv.setUint32(o + 4, 0x004e4942, true); out.set(bin, o + 8);
  return out.buffer;
}
const loadGLB = (f) => fetchBin(f).then((buf) => new Promise((res, rej) => loader.parse(jsonToGlb(buf), '', res, rej)));

// ---------------------------------------------------------------- world state
let W, HM; const GEO = [{}, {}, {}];                 // GEO[lod][key] = { geo, m: node matrix }
const sanitize = (k) => THREE.PropertyBinding.sanitizeNodeName(k);
function collectPack(gltf, lod) {
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh) { const e = { geo: o.geometry, m: o.matrixWorld.clone() }; GEO[lod][o.name] = e; if (o.userData.name) GEO[lod][sanitize(o.userData.name)] = e; } });
}
function geoFor(key, lod) { for (let l = lod; l >= 0; l--) if (GEO[l][key]) return GEO[l][key]; for (let l = lod + 1; l < 3; l++) if (GEO[l][key]) return GEO[l][key]; return null; }

// terrain height (heightmap: 641 x 641, 1 m/px, row 0 = north = glTF z -640)
function heightAt(x, z) {
  const H = W.heightmap, n = H.px; const fx = Math.min(Math.max(x / H.m_per_px, 0), n - 1.001), fy = Math.min(Math.max((640 + z) / H.m_per_px, 0), n - 1.001);
  const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const v = (i, j) => HM[j * n + i];
  const a = v(ix, iy) * (1 - tx) + v(ix + 1, iy) * tx, b = v(ix, iy + 1) * (1 - tx) + v(ix + 1, iy + 1) * tx;
  return H.z_lo + (a * (1 - ty) + b * ty) / 65535 * (H.z_hi - H.z_lo);
}

// category rules: [lod, max distance] per step; shadow casters; colliders
const CATS = {
  road: { lods: [[0, 1e9]], recv: true }, street: { lods: [[0, 1e9]], recv: true, collide: true }, water: { lods: [[0, 1e9]], water: true },
  building: { lods: [[0, 90], [1, 800]], cast: true, recv: true, collide: true }, door: { lods: [[0, 55]] },
  furniture: { lods: [[0, 45]], cast: true, collide: true }, fence: { lods: [[0, 70], [1, 320]], cast: true, collide: true },
  vehicle: { lods: [[0, 80], [1, 450]], cast: true, collide: true }, prop: { lods: [[0, 60], [1, 260]], cast: true, collide: true },
  military: { lods: [[0, 90], [1, 520]], cast: true, recv: true, collide: true },
  tree: { lods: [[0, 55], [1, 170], [2, 320], [3, 950]], cast: true, trunk: true }, far_tree: { lods: [[2, 320], [3, 2600]] },
  plant: { lods: [[0, 65]] }, grass: { lods: [[0, 42]] }, glass: { lods: [[0, 140]], glassy: true },   // glass: car windows of the SD vehicles
};
const groups = [];
const IDM = new THREE.Matrix4(), proxies = {};
function proxyFor(key) {   // far trees: a 6-sided cone (pine) or a 20-sided ball (broadleaf) on a stick, coloured like the tree
  if (proxies[key]) return proxies[key]; const g = geoFor(key, 1); if (!g) return null;
  const pa = g.geo.attributes.position, ca = g.geo.attributes.color, v = new THREE.Vector3(), box = new THREE.Box3();
  for (let i = 0; i < pa.count; i++) box.expandByPoint(v.fromBufferAttribute(pa, i).applyMatrix4(g.m));
  const h = box.max.y - box.min.y, r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2; const top = new THREE.Color(), low = new THREE.Color(); let nt = 0, nl = 0;
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(g.m); const c = ca ? new THREE.Color(ca.getX(i), ca.getY(i), ca.getZ(i)) : new THREE.Color(0.2, 0.3, 0.15);
    if (v.y > box.min.y + 0.4 * h) { top.add(c); nt++; } else if (v.y < box.min.y + 0.25 * h) { low.add(c); nl++; } }
  top.multiplyScalar(1 / Math.max(nt, 1)); low.multiplyScalar(1 / Math.max(nl, 1));
  const pine = /pine/.test(key);
  const crown = pine ? new THREE.ConeGeometry(r * 0.85, h * 0.82, 6, 1).translate(0, box.min.y + h * 0.18 + h * 0.41, 0)
                     : new THREE.IcosahedronGeometry(r * 0.8, 0).scale(1, (h * 0.62) / (r * 1.6), 1).translate(0, box.min.y + h * 0.62, 0);
  const trunk = new THREE.CylinderGeometry(r * 0.08, r * 0.1, h * 0.3, 4, 1).translate(0, box.min.y + h * 0.15, 0);
  const parts = [crown.toNonIndexed(), trunk.toNonIndexed()]; const cols = [top, low]; let n = 0; parts.forEach((p) => (n += p.attributes.position.count));
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  parts.forEach((p, k) => { P.set(p.attributes.position.array, o * 3); for (let i = 0; i < p.attributes.position.count; i++) cols[k].toArray(C, (o + i) * 3); o += p.attributes.position.count; });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3)); geo.computeVertexNormals();
  return (proxies[key] = { geo, m: IDM });
}         // { cat, key, lod, mesh, src: Float32Array (x,y,z,rot,s)*, mats: Float32Array(16*n), n }
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
function placeMatrix(a, i, out) { tmpP.set(a[i], a[i + 1], a[i + 2]); tmpQ.setFromAxisAngle(Y, a[i + 3]); tmpS.setScalar(a[i + 4]); return out.compose(tmpP, tmpQ, tmpS); }

function buildInstances() {
  for (const [cat, perKey] of Object.entries(W.placements)) {
    const C = CATS[cat]; if (!C) continue;
    for (const [rawKey, arr] of Object.entries(perKey)) {
      const key = sanitize(rawKey); const n = arr.length / 5;
      for (const [lod, dist] of C.lods) {
        const g = lod === 3 ? proxyFor(key) : geoFor(key, lod); if (!g) continue;
        const mats = new Float32Array(16 * n);
        for (let i = 0; i < n; i++) { placeMatrix(arr, i * 5, tmpM).multiply(g.m); tmpM.toArray(mats, i * 16); }
        const mesh = new THREE.InstancedMesh(g.geo, C.water ? WATER : C.glassy ? GLASS : MAT, n);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
        mesh.castShadow = !!C.cast && lod < 2; mesh.receiveShadow = !!C.recv || cat === 'terrain';
        scene.add(mesh);
        groups.push({ cat, key, lod, dist: dist * (cat === 'grass' ? Q * Q : Q), mesh, src: arr, mats, n, gm: g.m, prev: C.lods.find((s) => s[0] < lod) });
      }
    }
  }
  // per placement the LOD band is [previous step's distance, this step's distance)
  for (const g of groups) { const steps = CATS[g.cat].lods; const k = steps.findIndex((s) => s[0] === g.lod); g.dmin = k > 0 ? steps[k - 1][1] * (g.cat === 'grass' ? Q * Q : Q) : 0; }
}
let lastLodPos = new THREE.Vector3(1e9, 0, 0);
function updateLods(p, force) {
  if (!force && p.distanceToSquared(lastLodPos) < 16) return; lastLodPos.copy(p);
  for (const g of groups) {
    const a = g.src, im = g.mesh.instanceMatrix.array; let c = 0; const d0 = g.dmin * g.dmin, d1 = g.dist * g.dist;
    for (let i = 0; i < g.n; i++) {
      const dx = a[i * 5] - p.x, dz = a[i * 5 + 2] - p.z, d = dx * dx + dz * dz;
      if (d >= d0 && d < d1) { im.set(g.mats.subarray(i * 16, i * 16 + 16), c * 16); c++; }
    }
    g.mesh.count = c; g.mesh.instanceMatrix.needsUpdate = true; g.mesh.visible = c > 0;
  }
  for (const t of terrain) { const dx = t.cx - p.x, dz = t.cz - p.z, near = dx * dx + dz * dz < (230 * Q) ** 2; t.near.visible = near; t.far.visible = !near; }
}
// cars and wrecks placed partly inside a building (the pickup wreck in the filling station's wall) are moved out before anything is built:
// a car overlaps when a wall triangle of the building passes through its box at body height; it is then pushed away from the building step by step
function fixOverlaps() {
  const M = new THREE.Matrix4(), tri = new THREE.Triangle(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const wbox = (key, a, i) => { const g = geoFor(key, 0); if (!g) return null; if (!g.geo.boundingBox) g.geo.computeBoundingBox(); return g.geo.boundingBox.clone().applyMatrix4(placeMatrix(a, i, M).multiply(g.m)); };
  const blds = []; for (const cat of ['building', 'military']) for (const [raw, a] of Object.entries(W.placements[cat] || {})) { if (cat === 'military' && !/bld_|hangar|barracks/.test(raw)) continue; const key = sanitize(raw);
    for (let i = 0; i < a.length; i += 5) { const b = wbox(key, a, i); if (b) blds.push({ b, key, a, i }); } }
  const hits = (bl, box) => { const fp = floatPositions(bl.key); if (!fp) return false; placeMatrix(bl.a, bl.i, M); const n = fp.idx ? fp.idx.length : fp.n;
    for (let t = 0; t < n; t += 3) { const i0 = fp.idx ? fp.idx[t] : t, i1 = fp.idx ? fp.idx[t + 1] : t + 1, i2 = fp.idx ? fp.idx[t + 2] : t + 2;
      va.fromArray(fp.pos, i0 * 3).applyMatrix4(M); vb.fromArray(fp.pos, i1 * 3).applyMatrix4(M); vc.fromArray(fp.pos, i2 * 3).applyMatrix4(M); tri.set(va, vb, vc); if (box.intersectsTriangle(tri)) return true; } return false; };
  let moved = 0;
  for (const cat of ['vehicle', 'military']) for (const [raw, a] of Object.entries(W.placements[cat] || {})) { if (!/veh_|car_wreck/.test(raw)) continue; const key = sanitize(raw);
    for (let i = 0; i < a.length; i += 5) { const v = wbox(key, a, i); if (!v) continue;
      for (const bl of blds) { if (!v.intersectsBox(bl.b)) continue; const body = () => { const q = v.clone(); q.min.y = v.min.y + 0.5; q.max.y = Math.min(v.max.y, v.min.y + 1.3); q.expandByScalar(-0.05); return q; };
        if (!hits(bl, body())) continue; const c = bl.b.getCenter(new THREE.Vector3()); let dx = a[i] - c.x, dz = a[i + 2] - c.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        for (let k = 0; k < 40 && hits(bl, body()); k++) { a[i] += dx * 0.25; a[i + 2] += dz * 0.25; v.translate(new THREE.Vector3(dx * 0.25, 0, dz * 0.25)); }
        a[i + 1] = Math.max(a[i + 1], heightAt(a[i], a[i + 2])); moved++; } } }
  if (moved) console.info('moved', moved, 'vehicles out of buildings');
}
const terrain = [];
function buildTerrain() {
  for (const [rawKey, arr] of Object.entries(W.placements.terrain || {})) {
    const key = sanitize(rawKey); const make = (lod) => { const g = GEO[lod][key]; if (!g) return null; const m = new THREE.Mesh(g.geo, MAT);
      placeMatrix(arr, 0, m.matrix).multiply(g.m); m.matrixAutoUpdate = false; m.receiveShadow = true; scene.add(m); return m; };
    const near = make(1), far = make(2) || near; terrain.push({ near, far, cx: arr[0] + 32, cz: arr[2] - 32 });
  }
  for (const [rawKey, arr] of Object.entries(W.placements.far || {})) { const g = geoFor(sanitize(rawKey), 1); if (!g) continue;
    const m = new THREE.Mesh(g.geo, MAT); placeMatrix(arr, 0, m.matrix).multiply(g.m); m.matrixAutoUpdate = false; scene.add(m); }
}

// ---------------------------------------------------------------- colliders (32 m cells, built on demand)
const CELL = 32, cells = new Map(); const trunks = [];
const cellKey = (i, j) => i + ',' + j;
let colliderSrc = null;    // cellKey -> [{key, arr, i}]
function indexColliders() {
  colliderSrc = new Map();
  for (const [cat, perKey] of Object.entries(W.placements)) {
    const C = CATS[cat]; if (!C) continue;
    for (const [rawKey, arr] of Object.entries(perKey)) {
      const key = sanitize(rawKey);
      for (let i = 0; i < arr.length; i += 5) {
        if (C.trunk) { trunks.push(arr[i], arr[i + 2], trunkR(key) * arr[i + 4]); continue; }
        if (cat === 'plant' && /rock|stump|boulder/i.test(key)) { const r = trunkR(key, true) * arr[i + 4]; if (r > 0.22) trunks.push(arr[i], arr[i + 2], r); continue; }
        if (!C.collide || isCarKey(rawKey)) continue;
        const k = cellKey(Math.floor(arr[i] / CELL), Math.floor(arr[i + 2] / CELL));
        if (!colliderSrc.has(k)) colliderSrc.set(k, []); colliderSrc.get(k).push({ key, arr, i, sid: surfId(cat, key) });
      }
    }
  }
}
// radius of a tree trunk (or a rock / stump) from the model itself: how far the vertices reach sideways a little above the ground
const trunkCache = {};
function trunkR(key, solid) {
  if (key in trunkCache) return trunkCache[key]; const g = geoFor(key, 0); if (!g) return (trunkCache[key] = solid ? 0 : 0.3);
  const pa = g.geo.attributes.position, v = new THREE.Vector3(); let y0 = 1e9, y1 = -1e9; for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(g.m); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const lo = y0 + (solid ? 0.15 : 0.5), hi = y0 + (solid ? Math.max(0.3, (y1 - y0) * 0.6) : 1.4); const ds = [];
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(g.m); if (v.y >= lo && v.y <= hi) ds.push(Math.hypot(v.x, v.z)); }
  ds.sort((a, b) => a - b); const r = ds.length ? ds[Math.floor(ds.length * (solid ? 0.7 : 0.85))] : 0.3;
  return (trunkCache[key] = Math.min(solid ? 2.5 : 1.2, Math.max(solid ? 0 : 0.15, r)));
}
const posCache = new Map();
function floatPositions(key) {
  if (posCache.has(key)) return posCache.get(key);
  const g = GEO[0][key] || geoFor(key, 0); if (!g) return null;
  const pa = g.geo.attributes.position, v = new THREE.Vector3(), out = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(g.m); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  const idx = g.geo.index ? g.geo.index.array : null; const r = { pos: out, idx, n: pa.count }; posCache.set(key, r); return r;
}
function buildCell(i, j) {
  const k = cellKey(i, j); if (cells.has(k)) return; const list = colliderSrc.get(k);
  if (!list) { cells.set(k, null); return; }
  let nv = 0, ni = 0; const parts = [];
  for (const it of list) { const fp = floatPositions(it.key); if (!fp) continue; parts.push([fp, it]); nv += fp.n; ni += fp.idx ? fp.idx.length : fp.n; }
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(ni), surf = new Uint8Array(nv); let ov = 0, oi = 0; const v = new THREE.Vector3();
  for (const [fp, it] of parts) {
    placeMatrix(it.arr, it.i, tmpM); surf.fill(it.sid, ov, ov + fp.n);
    for (let q = 0; q < fp.n; q++) { v.set(fp.pos[q * 3], fp.pos[q * 3 + 1], fp.pos[q * 3 + 2]).applyMatrix4(tmpM); pos[(ov + q) * 3] = v.x; pos[(ov + q) * 3 + 1] = v.y; pos[(ov + q) * 3 + 2] = v.z; }
    if (fp.idx) for (let q = 0; q < fp.idx.length; q++) idx[oi + q] = fp.idx[q] + ov; else for (let q = 0; q < fp.n; q++) idx[oi + q] = ov + q;
    oi += fp.idx ? fp.idx.length : fp.n; ov += fp.n;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const bvh = new MeshBVH(geo, { maxLeafTris: 8 }); bvh.surf = surf; cells.set(k, bvh);
}
let buildQueue = [];
function nearCells(x, z, r = 1) { const out = []; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
  for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const k = cellKey(i, j); if (!cells.has(k)) { if (!buildQueue.includes(k)) buildQueue.push(k); continue; } const b = cells.get(k); if (b) out.push(b); }
  return out; }
function pumpBuild(n = 1) { for (let q = 0; q < n && buildQueue.length; q++) { const k = buildQueue.shift(); const [i, j] = k.split(',').map(Number); buildCell(i, j); } }

const ray = new THREE.Ray(), down = new THREE.Vector3(0, -1, 0);
function groundAt(x, y, z, bvhs) {           // highest walkable surface at most 0.45 m above y
  let g = heightAt(x, z);
  ray.origin.set(x, y + 0.5, z); ray.direction.copy(down);
  for (const b of bvhs) { const h = b.raycastFirst(ray, THREE.DoubleSide); if (h && h.point.y > g && h.point.y <= y + 0.5) g = h.point.y; }
  for (const V of CARS) { const top = V.a[V.i + 1] + V.h; if (V === DRIVE || top > y + 0.5 || top <= g) continue; if (Math.abs(x - V.a[V.i]) > 8 || Math.abs(z - V.a[V.i + 2]) > 8) continue; if (boxDist(V, gaV.set(x, 0, z)) === 0) g = top; }   // the roof of a car
  return g;
}
const gaV = new THREE.Vector3();
// footstep surfaces: 1 grass, 2 gravel, 3 asphalt/concrete, 4 wood, 5 metal. Colliders carry an id per vertex; open ground uses a 1 m road grid.
const SURF = [null, 'grass', 'gravel', 'asphalt', 'wood', 'metal'];
function surfId(cat, key) {
  if (cat === 'street') return 3; if (cat === 'building' || cat === 'furniture') return 4; if (cat === 'vehicle') return 5; if (cat === 'fence' || cat === 'prop') return 3;
  if (cat === 'military') { if (/container|veh_|generator|hedgehog|floodlight|antenna|barrel|jerrycan|ammo_can|weapon_rack/.test(key)) return 5;
    if (/hesco|sandbag/.test(key)) return 2; if (/tower|booth|crate|footlocker|cot|desk|chair|tent|flagpole|camo/.test(key)) return 4; return 3; }
  return 3; }
let ROADGRID = null;
function buildRoadGrid() {     // top-down raster of the terrain road strips; colour decides asphalt (dark grey) or gravel (brown/light)
  const N = Math.round(W.size_m[0]); ROADGRID = new Uint8Array(N * N); const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), col = new THREE.Color();
  for (const rawKey of Object.keys(W.placements.road || {})) {
    const g = geoFor(sanitize(rawKey), 0); if (!g) continue; const pa = g.geo.attributes.position, ca = g.geo.attributes.color, ix = g.geo.index;
    let sr = 0, sg = 0, sb = 0; if (ca) { for (let i = 0; i < ca.count; i++) { sr += ca.getX(i); sg += ca.getY(i); sb += ca.getZ(i); } sr /= ca.count; sg /= ca.count; sb /= ca.count; }
    col.setRGB(sr, sg, sb); const hsl = {}; col.getHSL(hsl); const id = ca && hsl.s < 0.2 && hsl.l < 0.4 ? 3 : 2;
    const nt = ix ? ix.count / 3 : pa.count / 3;
    for (let t = 0; t < nt; t++) {
      const i0 = ix ? ix.getX(t * 3) : t * 3, i1 = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, i2 = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pa, i0).applyMatrix4(g.m); b.fromBufferAttribute(pa, i1).applyMatrix4(g.m); c.fromBufferAttribute(pa, i2).applyMatrix4(g.m);
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), x1 = Math.min(N - 1, Math.floor(Math.max(a.x, b.x, c.x)));
      const y0 = Math.max(0, Math.floor(Math.min(-a.z, -b.z, -c.z))), y1 = Math.min(N - 1, Math.floor(Math.max(-a.z, -b.z, -c.z)));
      const d = (b.x - a.x) * (-c.z + a.z) - (-b.z + a.z) * (c.x - a.x); if (Math.abs(d) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = x + 0.5, py = y + 0.5;
        const u = ((b.x - px) * (-c.z - py) - (-b.z - py) * (c.x - px)) / d, v = ((c.x - px) * (-a.z - py) - (-c.z - py) * (a.x - px)) / d;
        if (u >= -0.05 && v >= -0.05 && u + v <= 1.05) ROADGRID[x + y * N] = id; }
    }
  }
}
function surfaceAt(x, y, z, bvhs) {
  let best = -1e9, sid = 0; ray.origin.set(x, y + 0.5, z); ray.direction.copy(down);
  for (const b of bvhs) { const h = b.raycastFirst(ray, THREE.DoubleSide); if (h && h.point.y > best && h.point.y <= y + 0.5) { best = h.point.y; sid = b.surf ? b.surf[b.geometry.index.array[h.faceIndex * 3]] : 0; } }
  if (sid && best > y - 0.3) return SURF[sid];
  if (ROADGRID) { const N = Math.round(W.size_m[0]), gx = Math.floor(x), gy = Math.floor(-z); if (gx >= 0 && gy >= 0 && gx < N && gy < N && ROADGRID[gx + gy * N]) return SURF[ROADGRID[gx + gy * N]]; }
  return 'grass';
}
const seg = new THREE.Line3(), triP = new THREE.Vector3(), segP = new THREE.Vector3(), cbox = new THREE.Box3(), push = new THREE.Vector3();
function collide(pos, radius, bvhs, top = 1.6) {          // horizontal push-out of a capsule from 0.45 m to `top` above the feet (1.6 m standing, about 0.9 m crouching)
  for (let it = 0; it < 2; it++) {
    if (top < 1.2) { seg.start.set(pos.x, pos.y + 0.6, pos.z); seg.end.copy(seg.start); }   // crouching: one ball, 0.28-0.92 m above the feet
    else { seg.start.set(pos.x, pos.y + 0.45 + radius, pos.z); seg.end.set(pos.x, pos.y + top - radius, pos.z); }
    for (const b of bvhs) {
      cbox.makeEmpty(); cbox.expandByPoint(seg.start); cbox.expandByPoint(seg.end); cbox.min.addScalar(-radius); cbox.max.addScalar(radius);
      b.shapecast({ intersectsBounds: (box) => box.intersectsBox(cbox),
        intersectsTriangle: (tri) => { const d = tri.closestPointToSegment(seg, triP, segP);
          if (d < radius) { push.subVectors(segP, triP); push.y = 0; const l = push.length(); if (l < 1e-5) return; push.multiplyScalar((radius - d) / l);
            seg.start.add(push); seg.end.add(push); } } });
    }
    pos.x = seg.start.x; pos.z = seg.start.z;
  }
  for (let t = 0; t < trunks.length; t += 3) { const dx = pos.x - trunks[t], dz = pos.z - trunks[t + 1]; if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
    const r = trunks[t + 2] + radius, d = Math.hypot(dx, dz); if (d < r && d > 1e-4) { pos.x = trunks[t] + dx / d * r; pos.z = trunks[t + 1] + dz / d * r; } }
  pos.x = Math.min(Math.max(pos.x, 1), 639); pos.z = Math.min(Math.max(pos.z, -639), -1);
}

// ---------------------------------------------------------------- characters
const CH = {};      // key -> gltf
function prepModel(gltf) {
  const root = SkeletonUtils.clone(gltf.scene); const lods = [[], [], []];
  root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; const m = /LOD(\d)/.exec(o.name);
    if (/Icosphere/i.test(o.name)) o.visible = false; else lods[m ? +m[1] : 0].push(o); } });
  return { root, lods };
}
function setLod(model, l) { model.lods.forEach((arr, i) => arr.forEach((o) => (o.visible = i === l))); }
const CLIPS_M = () => CH['Claude-Desktop_survivor_m_a'].animations;
function clipSet(key) { const a = CH[key].animations; if (a && a.length) return a; return /_f_/.test(key) ? CH['Claude-Desktop_survivor_f_brun'].animations : CLIPS_M(); }
function makeActor(key) {
  const model = prepModel(CH[key]); const mixer = new THREE.AnimationMixer(model.root); const clips = clipSet(key); const acts = {};
  const act = (name) => { if (!acts[name]) { const c = THREE.AnimationClip.findByName(clips, name) || THREE.AnimationClip.findByName(CLIPS_M(), name); if (!c) return null; acts[name] = mixer.clipAction(c); } return acts[name]; };
  const a = { key, model, mixer, act, cur: null, play(name, fade = 0.2, once = false, ts = 1) { const x = act(name); if (!x) return null; if (this.cur === x && !once) { x.timeScale = ts; return x; }
      x.reset(); x.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); x.clampWhenFinished = once; x.timeScale = ts; x.enabled = true; x.setEffectiveWeight(1);
      if (this.cur && this.cur !== x) x.crossFadeFrom(this.cur, fade, false); x.play(); this.cur = x; return x; } };
  setLod(model, 0); scene.add(model.root); return a;
}

// ---------------------------------------------------------------- calibration from the animations themselves (Claude-Desktop 24/10)
// footsteps: per walking clip, how low a foot goes (a step sounds when a foot comes down);
// grips: how the right hand is turned in each aim pose, so a held gun follows the hand in every other animation of that weapon
const STEP_TH = {}; const GRIP = {};
const STEP_CLIPS = ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop', 'Rifle_Walk_Loop', 'Rifle_Run_Loop', 'Rifle_Aim_Walk_Loop', 'Shotgun_Walk_Loop', 'Shotgun_Run_Loop',
  'Shotgun_Aim_Walk_Loop', 'Rifle_Crouch_Walk_Loop', 'Shotgun_Crouch_Walk_Loop'];
function calibrate() {
  const A = makeActor('Claude-Desktop_survivor_m_a'); const root = A.model.root; root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  const feet = ['foot_l', 'foot_r'].map((n) => root.getObjectByName(n)), hand = root.getObjectByName('hand_r'); const v = new THREE.Vector3();
  const pose = (name, t) => { const act = A.act(name); if (!act) return null; A.mixer.stopAllAction(); act.reset(); act.setEffectiveWeight(1); act.play(); A.mixer.setTime(t); root.updateMatrixWorld(true); return act; };
  if (feet[0] && feet[1]) for (const name of STEP_CLIPS) { const act = pose(name, 0); if (!act) continue; const dur = act.getClip().duration; let lo = 1e9, hi = -1e9;
    for (let k = 0; k < 48; k++) { A.mixer.setTime((dur * k) / 48); root.updateMatrixWorld(true); for (const f of feet) { f.getWorldPosition(v); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } }
    STEP_TH[name] = { on: lo + (hi - lo) * 0.22, off: lo + (hi - lo) * 0.5 }; }
  const qd = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'YZX')), qh = new THREE.Quaternion();
  if (hand) for (const [k, clip] of [['Rifle', 'Rifle_Aim_Loop'], ['Shotgun', 'Shotgun_Aim_Loop'], ['Pistol', 'Pistol_Aim_Neutral']]) { if (!pose(clip, 0.3)) continue; hand.getWorldQuaternion(qh); GRIP[k] = qh.clone().invert().multiply(qd); }
  A.mixer.stopAllAction(); scene.remove(root);
}
const FEET = { l: { armed: true }, r: { armed: true } };
function footsteps(clipName, gain) {   // a step sounds each time a foot comes down in the animation
  const th = STEP_TH[clipName]; if (!th) return; const root = P.actor.model.root; const fv = footsteps.v || (footsteps.v = new THREE.Vector3());
  for (const [side, bone] of [['l', 'foot_l'], ['r', 'foot_r']]) { const b = P.actor.bones && P.actor.bones[bone] || ((P.actor.bones = P.actor.bones || {})[bone] = root.getObjectByName(bone)); if (!b) continue;
    b.getWorldPosition(fv); const h = fv.y - root.position.y; const F = FEET[side];
    if (h > th.off) F.armed = true; else if (F.armed && h < th.on) { F.armed = false; footstep(gain); } }
}

// ---------------------------------------------------------------- gear (what you see is what you loot)
// rigid gear goes under its socket node with an identity transform; vests / rigs / belts / packs are skinned meshes re-bound to the
// character's own skeleton by bone name (they were built and weighted on the same rig)
const GEAR = {}; const SOCKET = { helmet: 'socket_head', holster: 'socket_hip_r', pouch: 'socket_hip_l', gun: 'socket_back_gun' };
const GEAR_FILE = { chestrig: 'Claude-Desktop_wear_chestrig_survivor_m', vest: 'Claude-Desktop_wear_vest_survivor_m', belt: 'Claude-Desktop_wear_belt_survivor_m',
  pack: 'Claude-Desktop_wear_backpack_survivor_m', holster: 'Claude-Desktop_wear_holster_survivor_m_LOD0', helmet: 'Claude-Desktop_wear_helmet_survivor_m_LOD0', gun: 'Claude-Desktop_gun_assault_rifle_v4_s1_LOD0' };
function equip(actor, item) {
  const src = GEAR[GEAR_FILE[item]]; if (!src) return; const root = actor.model.root; let added = [];
  if (SOCKET[item]) {
    const sock = root.getObjectByName(SOCKET[item]); if (!sock) return;
    const g = src.scene.clone(true); g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.set(1, 1, 1); sock.add(g); added.push(g);
  } else {
    let sk = null; root.traverse((o) => { if (!sk && o.isSkinnedMesh) sk = o.skeleton; }); const byName = {}; sk.bones.forEach((b) => (byName[b.name] = b));
    const clone = SkeletonUtils.clone(src.scene); const ms = []; clone.traverse((o) => { if (o.isSkinnedMesh) ms.push(o); });
    let host = null; root.traverse((o) => { if (!host && o.isSkinnedMesh) host = o.parent; });
    for (const m of ms) { if (/LOD[12]/.test(m.name)) continue; const bones = m.skeleton.bones.map((b) => byName[b.name]); if (bones.some((b) => !b)) continue;
      if (item === 'pack') m.geometry = rigidTo(m, 'spine_03');   // a backpack hangs from the shoulders: follow the upper back only (it was weighted to the pelvis and floated off the back when you lean)
      m.removeFromParent(); m.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses), m.bindMatrix); (host || root).add(m); added.push(m); }
  }
  for (const g of added) g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (/LOD[12]/.test(o.name)) o.visible = false; } });
  (actor.gear = actor.gear || []).push(...added); (actor.gearBy = actor.gearBy || {})[item] = added;
}
const RIGID = {};
function rigidTo(m, boneName) {
  const key = m.geometry.uuid + boneName; if (RIGID[key]) return RIGID[key]; const bi = m.skeleton.bones.findIndex((b) => b.name === boneName); if (bi < 0) return m.geometry;
  const g = m.geometry.clone(); const n = g.attributes.position.count; const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); return (RIGID[key] = g);
}
const LOADOUTS = { 'Claude-Desktop_zombie_soldat_a': ['chestrig', 'belt', 'holster'], 'Claude-Desktop_zombie_soldat_b': ['chestrig', 'belt', 'holster', 'helmet'],
  'Claude-Desktop_zombie_soldat_c': ['vest', 'belt', 'holster', 'pack', 'helmet'], 'Claude-Desktop_zombie_soldat_d': ['chestrig', 'belt', 'holster', 'helmet', 'gun'] };

// ---------------------------------------------------------------- player
const P = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, look: Math.PI, pitch: -0.18, vy: 0, ground: true, hp: 100, crouch: false, walk: false, busy: 0, actor: null, dead: false };
const keys = new Set(); let sprintT = false;
addEventListener('keydown', (e) => { if (e.repeat) return; keys.add(e.code); if (!started) return;
  if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); toggleInv(); return; } if (e.code === 'Escape' && UI.isOpen) { closeInv(); return; }
  if (e.code === 'KeyN') setMuted(!SFX.muted); if (e.code === 'KeyM') openMap(); if (e.code === 'KeyE') interact(); if (UI.isOpen) return;
  if (e.code === 'KeyC' && !DRIVE) toggleCrouch(); if (e.code === 'KeyV') P.walk = !P.walk; if (e.code === 'KeyF') attack(); if (e.code === 'Space' && !DRIVE) jump();
  if (e.code === 'KeyQ') cycleWeapon(1); if (e.code === 'KeyR') reload(); if (e.code === 'KeyB') deployTurret(); if (e.code === 'KeyH') horde();
  if (e.code === 'Digit1') setHold('primary'); if (e.code === 'Digit2') setHold('sidearm'); if (e.code === 'Digit3') setHold('melee'); if (e.code === 'KeyX') setHold('hands'); });
addEventListener('keyup', (e) => keys.delete(e.code));
const canvas = renderer.domElement;
canvas.addEventListener('click', () => { if (!TOUCH && document.pointerLockElement !== canvas && started) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) {} } });
canvas.addEventListener('mousedown', (e) => { if (document.pointerLockElement !== canvas) return; if (e.button === 0) { firing = true; attack(); } if (e.button === 2) aiming = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; if (e.button === 2) aiming = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (document.pointerLockElement !== canvas) { if (e.buttons & 1 && !TOUCH && started) { P.look -= e.movementX * 0.005; P.pitch = clampPitch(P.pitch - e.movementY * 0.004); } return; }
  P.look -= e.movementX * 0.0025; P.pitch = clampPitch(P.pitch - e.movementY * 0.002); if (DRIVE && Math.abs(e.movementX) > 2) carIn.t = 1.5; });
const clampPitch = (p) => Math.min(0.9, Math.max(-1.1, p));
document.addEventListener('pointerlockchange', () => { renderHud(); if (document.pointerLockElement !== canvas) { firing = false; aiming = false; } });

// touch: left stick + right drag look
const stick = { x: 0, y: 0, id: null }, lookT = { id: null, x: 0, y: 0 };
if (TOUCH) {
  $('touch').hidden = false; $('keys-pc').hidden = true; $('keys-touch').hidden = false;
  const st = $('stick'), knob = $('knob');
  const moveStick = (t) => { const r = st.getBoundingClientRect(); let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy), m = r.width / 2;
    if (l > m) { dx *= m / l; dy *= m / l; } stick.x = dx / m; stick.y = dy / m; knob.style.transform = `translate(${dx}px, ${dy}px)`; };
  st.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; stick.id = t.identifier; moveStick(t); }, { passive: false });
  addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) moveStick(t);
    else if (t.identifier === lookT.id) { P.look -= (t.clientX - lookT.x) * 0.006; P.pitch = clampPitch(P.pitch - (t.clientY - lookT.y) * 0.005); lookT.x = t.clientX; lookT.y = t.clientY; } } }, { passive: false });
  addEventListener('touchstart', (e) => { for (const t of e.changedTouches) if (t.target === canvas && lookT.id === null && t.clientX > innerWidth * 0.35) { lookT.id = t.identifier; lookT.x = t.clientX; lookT.y = t.clientY; } }, { passive: true });
  const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; } if (t.identifier === lookT.id) lookT.id = null; } };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  const tb = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
  tb('t-run', () => { sprintT = !sprintT; $('t-run').classList.toggle('on', sprintT); });
  tb('t-crouch', () => { toggleCrouch(); $('t-crouch').classList.toggle('on', P.crouch); });
  $('t-punch').addEventListener('touchstart', (e) => { e.preventDefault(); firing = true; attack(); }, { passive: false }); $('t-punch').addEventListener('touchend', () => (firing = false)); tb('t-jump', () => jump());
  tb('t-use', () => interact()); tb('t-weapon', () => cycleWeapon(1)); tb('t-inv', () => toggleInv()); tb('t-reload', () => reload()); tb('t-horde', () => horde());
  tb('t-aim', () => { aiming = !aiming; $('t-aim').classList.toggle('on', aiming); });
}

// standing up under something low (a carport, a barrier) is not possible
function headroom(h) { upRay.origin.set(P.pos.x, P.pos.y + 0.6, P.pos.z); for (const b of nearCells(P.pos.x, P.pos.z, 0)) { const r = b.raycastFirst(upRay, THREE.DoubleSide); if (r && r.distance < h - 0.6) return false; } return true; }
function toggleCrouch() { if (P.crouch && !headroom(1.85)) { toast('No room to stand up'); return; } P.crouch = !P.crouch; }
// climbing: Space in front of something 0.5-2.1 m high with room on top (a car, a wall, a crate) climbs onto it
const climbRay = new THREE.Ray(), climbV = new THREE.Vector3();
function climbSpot() {
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw); const bv = nearCells(P.pos.x, P.pos.z, 1);
  for (const reach of [0.55, 0.8, 1.05]) {
    const x = P.pos.x + fx * reach, z = P.pos.z + fz * reach; let top = -1e9;
    climbRay.origin.set(x, P.pos.y + 2.4, z); climbRay.direction.set(0, -1, 0);
    for (const b of bv) { const h = b.raycastFirst(climbRay, THREE.DoubleSide); if (h && h.point.y > top) top = h.point.y; }
    for (const V of CARS) if (V !== DRIVE && boxDist(V, climbV.set(x, 0, z)) === 0) top = Math.max(top, V.a[V.i + 1] + V.h);
    const rise = top - P.pos.y; if (rise < 0.5 || rise > 2.1) continue;
    climbRay.origin.set(x, top + 0.05, z); climbRay.direction.set(0, 1, 0); let free = true;
    for (const b of bv) { const h = b.raycastFirst(climbRay, THREE.DoubleSide); if (h && h.distance < 1.0) free = false; }
    if (free) return { x, y: top, z, rise };
  }
  return null;
}
function tickClimb(dt) {
  const C = P.climb; if (!C) return false; C.t += dt; const k = Math.min(1, C.t / C.dur);
  const up = Math.min(1, k / 0.65), fw = Math.max(0, (k - 0.45) / 0.55);   // first up, then over the edge
  P.pos.set(C.x0 + (C.to.x - C.x0) * fw, C.y0 + (C.to.y - C.y0) * (1 - (1 - up) * (1 - up)), C.z0 + (C.to.z - C.z0) * fw);
  if (k >= 1) { P.climb = null; P.pos.set(C.to.x, C.to.y, C.to.z); P.ground = true; P.vy = 0; P.actor.play('Idle_Loop', 0.2); }
  return true;
}
function jump() { if (!P.ground || P.dead || !started || DRIVE || ACTION || P.climb) return; if (NEEDS.stam < 10) { toast('You are too tired'); return; }
  const cs = climbSpot(); if (cs) { NEEDS.stam -= 8; NEEDS.rest = 0.8; P.crouch = false; P.climb = { t: 0, dur: 0.45 + cs.rise * 0.35, x0: P.pos.x, y0: P.pos.y, z0: P.pos.z, to: cs };
    P.actor.play('ClimbUp_1m', 0.1, true, 1.6 / (0.45 + cs.rise * 0.35) * 0.9); sfx('swing_', { gain: 0.3, rate: 0.7 }); return; } NEEDS.stam -= 10; NEEDS.rest = 0.8; P.vy = 4.6; P.ground = false; P.crouch = false; P.actor.play('Jump_Start', 0.1, true, 1.2); }
function punch() {
  if (P.dead || !started || P.busy > 0) return; P.busy = 0.55; P.actor.play('Punch_Cross', 0.08, true, 1.35); sfx('swing_', { gain: 0.55, delay: 0.12 });
  setTimeout(() => {
    const fwd = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    for (const z of zombies) { if (z.dead) continue; const d = tmpP.subVectors(z.pos, P.pos); d.y = 0; const l = d.length(); if (l > 1.7 || l < 1e-3) continue;
      if (d.dot(fwd) / l < 0.45) continue; z.hit(fwd); }
  }, 220);
}

// ---------------------------------------------------------------- sound (sfx/: synthesized bank, see sfx/sfx_bank.json)
const SFX = { log: [], bank: null, raw: {}, buf: {}, ctx: null, out: null, muted: false, voices: 0, wind: null, gunT: 25 + Math.random() * 30 };
try { SFX.muted = localStorage.getItem('bam_mute') === '1'; } catch (_) {}
const sfxReady = (async () => { try { SFX.bank = await (await fetch('sfx/sfx_bank.json')).json();
  const all = Object.values(SFX.bank.groups).flat().map((i) => i.file);
  await Promise.all(all.map(async (f) => { try { SFX.raw[f] = await (await fetch('sfx/' + f)).arrayBuffer(); } catch (_) {} }));
} catch (e) { console.warn('sfx', e); } })();
function sfxStart() {
  if (SFX.ctx) { if (SFX.ctx.state === 'suspended') SFX.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = SFX.ctx = new AC(); SFX.out = ctx.createGain(); SFX.out.gain.value = SFX.muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -8; comp.ratio.value = 4; SFX.out.connect(comp).connect(ctx.destination);
  sfxReady.then(async () => { for (const [f, ab] of Object.entries(SFX.raw)) { try { SFX.buf[f] = await ctx.decodeAudioData(ab); } catch (_) {} } SFX.raw = {};
    const wb = SFX.buf['ambient_wind_loop.mp3']; if (wb) { const s = ctx.createBufferSource(); s.buffer = wb; s.loop = true; const g = ctx.createGain(); g.gain.value = 0.22; s.connect(g).connect(SFX.out); s.start(); SFX.wind = s; } });
}
const sfxLists = {};
function sfxList(prefix) { if (sfxLists[prefix]) return sfxLists[prefix]; if (!SFX.bank) return [];
  const l = Object.values(SFX.bank.groups).flat().map((i) => i.file).filter((f) => f.startsWith(prefix)); if (l.length) sfxLists[prefix] = l; return l; }
function sfx(prefix, o = {}) {        // o: pos (Vector3, world), gain, rate, jit, pan, delay, voice (counts toward the 6-voice cap), max (m)
  const ctx = SFX.ctx; if (!ctx || SFX.muted) return null; const l = sfxList(prefix); if (!l.length) return null;
  const b = SFX.buf[l[Math.floor(Math.random() * l.length)]]; if (!b) return null;
  if (o.pos && o.pos.distanceTo(camera.position) <= (o.max || 70) || !o.pos) { SFX.log.push(prefix); if (SFX.log.length > 60) SFX.log.shift(); }
  if (o.pos && o.pos.distanceTo(camera.position) > (o.max || 70)) return null;
  if (o.voice) { if (SFX.voices >= 6) return null; SFX.voices++; }
  const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.jit ?? 0.06));
  const g = ctx.createGain(); g.gain.value = o.gain ?? 1; s.connect(g);
  if (o.pos) { const p = ctx.createPanner(); p.panningModel = TOUCH ? 'equalpower' : 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = o.ref || 2.5; p.rolloffFactor = 1.1; p.maxDistance = 200;
    const y = o.pos.y + 1.4; if (p.positionX) { p.positionX.value = o.pos.x; p.positionY.value = y; p.positionZ.value = o.pos.z; } else p.setPosition(o.pos.x, y, o.pos.z); g.connect(p).connect(SFX.out); }
  else if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p).connect(SFX.out); }
  else g.connect(SFX.out);
  s.onended = () => { if (o.voice) SFX.voices = Math.max(0, SFX.voices - 1); };
  s.start(ctx.currentTime + (o.delay || 0)); return s;
}
const fwdV = new THREE.Vector3();
function sfxFrame(dt) {
  const ctx = SFX.ctx; if (!ctx) return; const L = ctx.listener; camera.getWorldDirection(fwdV);
  if (L.positionX) { L.positionX.value = camera.position.x; L.positionY.value = camera.position.y; L.positionZ.value = camera.position.z;
    L.forwardX.value = fwdV.x; L.forwardY.value = fwdV.y; L.forwardZ.value = fwdV.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
  else { L.setPosition(camera.position.x, camera.position.y, camera.position.z); L.setOrientation(fwdV.x, fwdV.y, fwdV.z, 0, 1, 0); }
  SFX.gunT -= dt;                      // distant gunfight somewhere on the map (left/right from a random bearing)
  if (SFX.gunT <= 0) { SFX.gunT = 30 + Math.random() * 60; const w = ['rifle', 'rifle', 'rifle', 'pistol', 'shotgun', 'sniper'][Math.floor(Math.random() * 6)];
    const pan = Math.random() * 1.6 - 0.8, gain = 0.25 + Math.random() * 0.35; const n = w === 'rifle' ? 1 + Math.floor(Math.random() * 6) : w === 'sniper' ? 1 : 1 + Math.floor(Math.random() * 3); let t = 0;
    for (let k = 0; k < n; k++) { sfx(`gun_${w}_far_`, { pan, gain: gain * (0.85 + Math.random() * 0.3), delay: t }); t += w === 'rifle' ? (Math.random() < 0.7 ? 0.1 + Math.random() * 0.05 : 0.4 + Math.random() * 0.6) : 0.5 + Math.random() * 0.9; } }
}
function setMuted(m) { SFX.muted = m; try { localStorage.setItem('bam_mute', m ? '1' : '0'); } catch (_) {}
  if (SFX.out) SFX.out.gain.setTargetAtTime(m ? 0 : 0.9, SFX.ctx.currentTime, 0.05); const b = $('snd-btn'); b.textContent = m ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', String(!m)); }
function footstep(gain, delay = 0) { P.stepN = (P.stepN || 0) + 1; const bv = nearCells(P.pos.x, P.pos.z, 0); const s = surfaceAt(P.pos.x, P.pos.y, P.pos.z, bv);
  P.foot = -(P.foot || 1); sfx(`step_${s}_`, { gain, pan: P.foot * 0.08, delay, jit: 0.1 }); }

// ---------------------------------------------------------------- zombies
const zombies = []; const npcs = [];
class Zombie {
  constructor(key, x, z, rot, y) { this.idx = zombies.length; this.a = makeActor(key); for (const it of LOADOUTS[key] || []) equip(this.a, it); this.pos = new THREE.Vector3(x, Math.max(heightAt(x, z), y ?? -99), z); this.rot = rot; this.hp = 100; this.dead = false;
    this.state = 'idle'; this.t = Math.random() * 3; this.atk = 0; this.stun = 0; this.speed = 0.9 + Math.random() * 0.35; this.home = this.pos.clone(); this.wander = null;
    this.vt = 2 + Math.random() * 12; this.pitch = (0.88 + Math.random() * 0.24) * (/_f_/.test(key) ? 1.2 : 1);
    this.a.play('Zombie_Idle_Loop', 0, false, 0.8 + Math.random() * 0.4); this.a.mixer.update(Math.random() * 2); this.sync(); }
  sync() { this.a.model.root.position.copy(this.pos); this.a.model.root.rotation.y = this.rot; }
  hit(dir, dmg = 34) { if (this.dead) return; this.hp -= dmg; this.stun = dmg >= 30 ? 0.6 : 0.25; this.pos.addScaledVector(dir, dmg >= 30 ? 0.35 : 0.08); this.state = 'chase'; sfx(dmg >= 30 ? 'punch_hit_' : 'zombie_hit_', { pos: this.pos, gain: 1.1, voice: dmg < 30 });
    if (this.hp <= 0) { this.dead = true; this.a.play('Death01', 0.1, true); kills++; this.deadT = 0; toast('Zombie down'); sfx('zombie_death_', { pos: this.pos, rate: this.pitch, delay: 0.05 }); } else if (dmg >= 30 || Math.random() < 0.3) { this.a.play('Hit_Chest', 0.05, true, 1.2); sfx('zombie_hit_', { pos: this.pos, rate: this.pitch, delay: 0.04, voice: true }); } }
  update(dt, bvhs, dist) {
    if (this.dead) { this.deadT = (this.deadT || 0) + dt; if (dist < 80 && this.deadT < 4) this.a.mixer.update(dt); return; }   // frozen after the fall
    const toP = tmpP.subVectors(P.pos, this.pos); toP.y = 0; const d = toP.length();
    const sees = !P.dead && d < (sprinting ? 30 : P.crouch ? 12 : 22);
    if (this.alertT > 0) this.alertT -= dt;      // heard a shot: keeps hunting for a while without seeing you
    if (this.stun > 0) { this.stun -= dt; }
    else if (sees || (this.state === 'chase' && d < (this.horde ? 400 : this.alertT > 0 ? 140 : 40) && !P.dead)) {
      if (this.state !== 'chase') { sfx('zombie_attack_', { pos: this.pos, rate: this.pitch * 0.92, gain: 0.8, voice: true }); this.vt = 2.5 + Math.random() * 2; }
      this.state = 'chase'; const want = Math.atan2(toP.x, toP.z); this.rot = turn(this.rot, want, dt * 3.2);
      const dCar = DRIVE ? boxDist(DRIVE, this.pos) : 1e9;
      if (DRIVE && dCar < 0.55) {   // you sit in a car: they claw at the car, and the car takes the damage
        this.atk -= dt; if (this.atk <= 0) { this.atk = 1.4; this.a.play('Zombie_Scratch', 0.12, true, 1.15); sfx('zombie_attack_', { pos: this.pos, rate: this.pitch, voice: true }); this.vt = 3 + Math.random() * 2;
          setTimeout(() => { if (!this.dead && DRIVE && boxDist(DRIVE, this.pos) < 0.9) damageCar(DRIVE, 2.5); }, 420); }
        else if (!this.a.cur || !this.a.cur.isRunning()) this.a.play('Zombie_Idle_Loop', 0.2); }
      else if (d > 1.15) { this.a.play('Zombie_Walk_Fwd_Loop', 0.25, false, this.speed * 1.05); this.pos.x += Math.sin(this.rot) * this.speed * dt; this.pos.z += Math.cos(this.rot) * this.speed * dt; }
      else { this.atk -= dt; if (this.atk <= 0) { this.atk = 1.4; this.a.play('Zombie_Scratch', 0.12, true, 1.15); sfx('zombie_attack_', { pos: this.pos, rate: this.pitch, voice: true }); this.vt = 3 + Math.random() * 2;
          setTimeout(() => { if (!this.dead && this.pos.distanceTo(P.pos) < 1.6) { hurt(11, true); sfx('punch_hit_', { gain: 0.6, rate: 0.85 }); } }, 420); }
        else if (!this.a.cur || !this.a.cur.isRunning()) this.a.play('Zombie_Idle_Loop', 0.2); }
    } else {
      this.state = 'idle'; this.t -= dt;
      if (this.t <= 0) { this.t = 4 + Math.random() * 6; this.wander = Math.random() < 0.55 ? new THREE.Vector3(this.home.x + (Math.random() - 0.5) * 16, 0, this.home.z + (Math.random() - 0.5) * 16) : null; }
      if (this.wander) { const w = tmpS.subVectors(this.wander, this.pos); w.y = 0; if (w.length() < 0.6) this.wander = null; else {
        this.rot = turn(this.rot, Math.atan2(w.x, w.z), dt * 2); this.a.play('Zombie_Walk_Fwd_Loop', 0.4, false, 0.55); this.pos.x += Math.sin(this.rot) * 0.5 * dt; this.pos.z += Math.cos(this.rot) * 0.5 * dt; } }
      else this.a.play('Zombie_Idle_Loop', 0.4, false, 0.9);
    }
    if (dist < 45) { this.vt -= dt; if (this.vt <= 0) { const ch = this.state === 'chase'; this.vt = ch ? 3 + Math.random() * 4 : 7 + Math.random() * 14;
      sfx('zombie_groan_', { pos: this.pos, rate: this.pitch, gain: ch ? 0.9 : 0.55, voice: true }); } }
    if (dist < 60) { collide(this.pos, 0.3, bvhs); collideCars(this.pos, 0.3); collideDoors(this.pos, 0.3); }
    for (const o of zombies) { if (o === this || o.dead) continue; const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, l = dx * dx + dz * dz; if (l < 0.5 && l > 1e-6) { const f = (0.71 - Math.sqrt(l)) * 0.5 / Math.sqrt(l); this.pos.x += dx * f; this.pos.z += dz * f; } }
    this.pos.y = dist < 60 ? groundAt(this.pos.x, this.pos.y, this.pos.z, bvhs) : heightAt(this.pos.x, this.pos.z);
    this.skip = (this.skip || 0) + dt;
    if (dist < 45 || (dist < 120 && frame % 3 === 0)) { this.a.mixer.update(this.skip); this.skip = 0; } else if (dist >= 120) this.skip = 0;
    setLod(this.a.model, dist < 22 ? 0 : dist < 60 ? 1 : 2); this.a.model.root.visible = dist < 260 * Q;
    if (this.a.gear) { const gv = dist < 75; if (gv !== this.gearVis) { this.gearVis = gv; for (const g of this.a.gear) g.visible = gv; } }
    this.sync();
  }
}
function turn(a, b, k) { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + Math.max(-k, Math.min(k, d)); }
function hurt(n, zombie) { if (P.dead) return; n *= armorFactor(); P.hp = Math.max(0, P.hp - n); flash(); sfx('player_hurt_', { gain: P.hp <= 0 ? 1 : 0.8, rate: P.hp <= 0 ? 0.9 : 1 });
  if (zombie && !NEEDS.bleed && Math.random() < 0.3) { NEEDS.bleed = 1; toast('You are bleeding – use a bandage'); } if (P.hp <= 0) die(); }
function flash() { renderer.domElement.style.filter = 'sepia(0.6) saturate(2) hue-rotate(-30deg)'; setTimeout(() => (renderer.domElement.style.filter = ''), 140); }

function spawnAll() {
  const zkeys = ['Claude-Desktop_zombie_01', 'Claude-Desktop_zombie_02', 'Claude-Desktop_zombie_m_a', 'Claude-Desktop_zombie_m_b', 'Claude-Desktop_zombie_m_c', 'Claude-Desktop_zombie_f_a', 'Claude-Desktop_zombie_f_b', 'Claude-Desktop_zombie_f_c'];
  const soldier = ['Claude-Desktop_zombie_soldat_a', 'Claude-Desktop_zombie_soldat_b', 'Claude-Desktop_zombie_soldat_c', 'Claude-Desktop_zombie_soldat_d'];
  for (const c of W.chars) { const key = c.key.replace('.glb', '');
    if (key.includes('zombie')) zombies.push(new Zombie(key, c.pos[0], c.pos[2], c.rot, c.pos[1]));
    else if (key.includes('survivor_f')) for (const [fk, dx] of [['Claude-Desktop_survivor_f_brun', 0], ['Claude-Desktop_survivor_f_blond', 1.4]]) { const a = makeActor(fk); const px = c.pos[0] + dx, pz = c.pos[2] + dx * 0.3; const pos = new THREE.Vector3(px, Math.max(heightAt(px, pz), c.pos[1]), pz);
      a.model.root.position.copy(pos); a.model.root.rotation.y = c.rot; a.play('Idle_Talking_Loop'); npcs.push({ a, pos }); } }
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const n of W.npc_spawns) for (let i = 0; i < n.count; i++) {
    const list = n.kind === 'zombie_soldier' ? soldier : n.kind === 'zombie_sd' ? SD_KEYS : zkeys; const key = list[Math.floor(rnd() * list.length)];
    zombies.push(new Zombie(key, n.pos[0] + (rnd() - 0.5) * 8, n.pos[2] + (rnd() - 0.5) * 8, rnd() * 6.28, n.pos[1])); }
}

// ---------------------------------------------------------------- UI
let started = false, frame = 0, sprinting = false, kills = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => (el.style.opacity = 0), 1600); }
function openMap() { if (!started) return; document.exitPointerLock?.(); $('map').hidden = false; }
$('menu-btn').addEventListener('click', openMap); $('snd-btn').addEventListener('click', () => { sfxStart(); setMuted(!SFX.muted); }); setMuted(SFX.muted); $('map-close').addEventListener('click', () => ($('map').hidden = true));
function teleport(x, z, y) { P.pos.set(x, Math.max(heightAt(x, z), y ?? -99) + 1.2, z); P.vy = 0; P.ground = false; nearCells(x, z, 1); pumpBuild(9); updateLods(P.pos, true); }
$('respawn').addEventListener('click', () => { sfxStart(); $('dead').hidden = true; leaveCorpse();
  INV = newInventory(); HOLD = 'hands'; Object.assign(NEEDS, { food: 70, water: 70, stam: 100, bleed: 0, hot: 0, tired: false }); P.dead = false; P.hp = 100;
  teleport(W.spawn[0], W.spawn[2], W.spawn[1]); P.actor.play('Idle_Loop', 0.1); syncPlayerVis(); hudWeapon(); markDirty(); toast('Your gear is on your body');
  for (const z of zombies) if (!z.dead && z.pos.distanceTo(P.pos) < 30) { z.state = 'idle'; z.pos.copy(z.home); } });

// ================================================================ v4 mechanics (Claude-Desktop 23/10)
// Grid inventory (inv.js), item database + loot tables (items.js), containers with search time, loot on the ground, corpses that keep
// what they carried ("what you see is what you get"), guns with exact magazines, needs (food, water, stamina), bleeding and healing.
// World models of items: pack_items.json (SD branch) + pack_bam_items.json (ours); INFO holds their size and authored-origin offset.
const SEED = 'bam-v4';
let INV = newInventory(); let HOLD = 'hands';
const NEEDS = { food: 85, water: 85, stam: 100, bleed: 0, hot: 0, tired: false, rest: 0 };
const TURRETS = []; let aiming = false, firing = false, fireCD = 0, reloadT = 0, reloadDone = null, reloadJob = null, MG = null, ACTION = null, OPEN = null, TARGET = null, GROUND = null;
const INFO = {}; let CDEF = {};
const gridsP = () => playerGrids(INV).map((x) => x.g);
const held = () => (HOLD === 'hands' ? null : INV.eq[HOLD]);
const heldDef = () => { const it = held(); return it ? ITEMS[it.id] : null; };
const isGun = () => { const d = heldDef(); return !!(d && d.gun); };
const itemName = (id) => (ITEMS[id] ? ITEMS[id].name : id);
const clamp100 = (v) => Math.max(0, Math.min(100, v));

// ---------------------------------------------------------------- item models in the world and in the hands
const SACK_GEO = new THREE.BoxGeometry(0.34, 0.2, 0.26).translate(0, 0.1, 0), SACK_MAT = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.95, flatShading: true });
function itemMesh(id) {   // the pack node matrix carries the meshopt dequantisation (scale/offset): keep it on an inner mesh
  const d = ITEMS[id]; const g = d && GEO[0][d.model]; const grp = new THREE.Group();
  if (!g) { const s = new THREE.Mesh(SACK_GEO, SACK_MAT); s.castShadow = true; grp.add(s); return grp; }
  const m = new THREE.Mesh(g.geo, MAT); m.castShadow = true; m.matrixAutoUpdate = false; m.matrix.copy(g.m); grp.add(m); return grp;
}
function heldMesh(id) { const inf = INFO[ITEMS[id].model]; const m = itemMesh(id); if (inf) m.position.set(-inf.off[0], -inf.off[1], -inf.off[2]); const g = new THREE.Group(); g.add(m); return g; }
let heldObj = null, heldId = null, backObj = null;
function buildHeldObj() {
  const it = held(); const id = it ? it.id : null; if (id === heldId && heldObj) return;
  if (heldObj) { scene.remove(heldObj); heldObj = null; } heldId = id; if (id) { heldObj = heldMesh(id); scene.add(heldObj); }
}
const handPos = new THREE.Vector3(), tmpE = new THREE.Euler(0, 0, 0, 'YZX');
function updateHeldObj() {
  if (!heldObj) return; const hand = P.actor.model.root.getObjectByName('hand_r'); if (!hand) return;
  hand.getWorldPosition(handPos); const d = heldDef(); const AIM = (aiming || firing) && isGun();
  const gk = d && d.gun ? (d.gun.anim === 'Pistol' ? 'Pistol' : d.gun.anim === 'Shotgun' ? 'Shotgun' : 'Rifle') : null;
  heldObj.position.copy(handPos); heldObj.visible = !P.dead && !DRIVE;
  if (gk && GRIP[gk]) { hand.getWorldQuaternion(heldObj.quaternion); heldObj.quaternion.multiply(GRIP[gk]); return; }   // the gun sits in the hand the way the aim pose holds it, in every animation
  const yaw = AIM ? P.look : P.yaw; const pitch = AIM ? P.pitch + 0.08 : (d && d.melee ? 0.5 : -0.35);
  tmpE.set(0, yaw - Math.PI / 2, pitch); heldObj.rotation.copy(tmpE);
}
// visible gear on an actor follows a set of "show" names (helmet, vest, chestrig, belt, holster, pack, gun)
function unequipVis(actor, show) { const objs = actor.gearBy && actor.gearBy[show]; if (!objs) return; for (const o of objs) o.removeFromParent(); actor.gear = (actor.gear || []).filter((o) => !objs.includes(o)); delete actor.gearBy[show]; }
function showsOf(items) {
  const s = new Set();
  for (const it of items) { const d = ITEMS[it.id]; if (!d) continue; if (d.gear && d.gear.show) s.add(d.gear.show); if (d.gear && d.gear.show === 'belt') s.add('holster'); if (d.gun && d.gun.slot === 'primary') s.add('gun'); }
  return s;
}
function syncVis(actor, want) { for (const k of Object.keys(actor.gearBy || {})) if (!want.has(k)) unequipVis(actor, k); for (const k of want) if (!(actor.gearBy && actor.gearBy[k])) equip(actor, k); }
function syncPlayerVis() {
  const a = P.actor; const e = INV.eq; const want = showsOf([e.head, e.vest, e.belt, e.pack].filter(Boolean)); syncVis(a, want);
  if (backObj) { backObj.removeFromParent(); backObj = null; }
  const pr = e.primary; if (pr && HOLD !== 'primary') { const sock = a.model.root.getObjectByName('socket_back_gun'); if (sock) { backObj = heldMesh(pr.id); sock.add(backObj); } }
  buildHeldObj();
}
// a corpse shows exactly what is still on it
function syncCorpseVis(c) { const items = c.g.items.map((e) => e.it); syncVis(c.a, showsOf(items)); }

// ---------------------------------------------------------------- loot on the ground (piles)
const PILES = []; let pileSeq = 0;
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.35, depthWrite: false });
const ringGeo = new THREE.RingGeometry(0.22, 0.3, 20).rotateX(-Math.PI / 2);
function newPile(pos, id) { pos = pos.clone(); if (W && HM) pos.y = Math.max(pos.y, heightAt(pos.x, pos.z)); const pl = { id: id || 'p' + Date.now().toString(36) + (pileSeq++), pos: pos.clone(), rot: Math.random() * 6.28, g: newGrid(8, 6), obj: null, ring: null }; PILES.push(pl); return pl; }
function pileVis(pl) {
  if (pl.obj) { scene.remove(pl.obj); pl.obj = null; } if (pl.ring) { scene.remove(pl.ring); pl.ring = null; }
  if (!pl.g.items.length) { const i = PILES.indexOf(pl); if (i >= 0) PILES.splice(i, 1); if (GROUND === pl) GROUND = null; return; }
  let big = pl.g.items[0]; for (const e of pl.g.items) { const d = ITEMS[e.it.id], b = ITEMS[big.it.id]; if (d.w * d.h > b.w * b.h) big = e; }
  const id = big.it.id, d = ITEMS[id]; const m = itemMesh(id); const inf = INFO[d.model];
  const flat = inf ? (inf.flat ?? !!(d.gun || d.melee)) : false; if (flat && inf) m.rotation.x = -Math.PI / 2;
  const h = new THREE.Group(); h.add(m); h.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(m); if (!bb.isEmpty()) m.position.y -= bb.min.y; /* rest on the ground, whatever the model's origin */
  h.position.copy(pl.pos); h.rotation.y = pl.rot; scene.add(h); pl.obj = h;
  const r = new THREE.Mesh(ringGeo, RING_MAT); r.position.set(pl.pos.x, pl.pos.y + 0.02, pl.pos.z); r.renderOrder = 2; scene.add(r); pl.ring = r;
}
function nearPile(maxD = 1.5) { let best = null, bd = maxD; for (const pl of PILES) { const d = Math.hypot(pl.pos.x - P.pos.x, pl.pos.z - P.pos.z); if (d < bd && Math.abs(pl.pos.y - P.pos.y) < 1.4) { bd = d; best = pl; } } return best; }
function dropToGround(it) { const pl = nearPile() || newPile(P.pos); let rest = addToGrid(pl.g, it); while (rest) { pl.g.h += 2; rest = addToGrid(pl.g, rest); } pileVis(pl); }

// ---------------------------------------------------------------- containers (furniture, lockers, vehicles ... from data/containers.json)
const CONTS = []; const CONT_CELL = new Map();
function buildContainers() {
  const pos = new THREE.Vector3();
  for (const per of Object.values(W.placements)) for (const [raw, a] of Object.entries(per)) {
    const key = raw.split('/').pop(); const c = CDEF[key]; if (!c) continue;
    for (let i = 0; i < a.length; i += 5) {
      pos.set(a[i], a[i + 1], a[i + 2]); const pts = [c.interact, c.interact_back].filter(Boolean).map((ip) => new THREE.Vector3(ip[0], ip[2], -ip[1]).multiplyScalar(a[i + 4]).applyAxisAngle(Y, a[i + 3]).add(pos));
      const C = { id: key + '#' + i / 5, key, name: c.name, slots: c.slots, search: c.search_s, table: c.table, pts, g: null, searched: false };
      CONTS.push(C); for (const p of pts) { const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL)); if (!CONT_CELL.has(k)) CONT_CELL.set(k, []); CONT_CELL.get(k).push(C); }
    }
  }
}
function contGrid(C) { if (!C.g) { const [w, h] = gridForSlots(C.slots); C.g = rollInto(newGrid(w, h), C.table, rng(hash(C.id + SEED))); } return C.g; }

// ---------------------------------------------------------------- corpses
const VIS_ITEM = { chestrig: 'chestrig', vest: 'vest', belt: 'belt', pack: 'backpack', helmet: 'helmet', gun: 'rifle' };
const SD_DROPS = {   // what the SD zombies visibly carry (from the SD branch)
  'Claude-Desktop_zombie_sd_police': [['sd_gun_pistol', 0.8], ['sd_ammo_9mm', 1]], 'Claude-Desktop_zombie_sd_hunter': [['sd_ammo_308', 1], ['sd_gear_binoculars', 0.5], ['sd_gun_hunting_rifle', 0.2]],
  'Claude-Desktop_zombie_sd_doctor': [['sd_med_kit', 0.7], ['sd_med_injector', 0.6]], 'Claude-Desktop_zombie_sd_f_nurse': [['sd_med_bandage', 1], ['sd_med_pills', 0.6]],
  'Claude-Desktop_zombie_sd_worker': [['sd_melee_crowbar', 0.7], ['sd_food_water', 0.5]], 'Claude-Desktop_zombie_sd_firefighter': [['sd_melee_fire_axe', 0.8]],
  'Claude-Desktop_zombie_sd_f_hiker': [['sd_gear_canteen', 1], ['sd_food_can_beans', 0.8], ['sd_gear_flashlight', 0.5], ['sd_gear_backpack', 0.5]],
  'Claude-Desktop_zombie_sd_business': [['sd_food_water', 0.4]], 'Claude-Desktop_zombie_sd_f_jogger': [['sd_food_water', 0.6]], 'Claude-Desktop_zombie_sd_bloated': [['sd_food_can_soup', 0.6]],
};
function corpseGrid(z) {
  if (z.cg) return z.cg; const R = rng(hash('zombie#' + z.idx + SEED)); const g = newGrid(8, 6); const lo = LOADOUTS[z.a.key] || [];
  for (const vis of lo) { const id = VIS_ITEM[vis]; if (!id) continue; const it = withGrid(make(id, 1, R));
    if (id === 'chestrig') for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) addToGrid(it.g, make('mag_rifle', 1, R));
    if (id === 'backpack') rollInto(it.g, 'military_personal', R);
    if (id === 'belt' && R() < 0.5) addToGrid(it.g, make('mag_pistol', 1, R));
    addToGrid(g, it); }
  if (lo.includes('holster') && R() < 0.6) addToGrid(g, make('pistol', 1, R));
  for (const [id, p] of SD_DROPS[z.a.key] || []) if (R() < p) addToGrid(g, withGrid(make(id, id.startsWith('sd_ammo') ? 30 : 1, R)));
  rollInto(g, /soldat/.test(z.a.key) ? 'life_soldier' : 'life_civil', R, -2);
  z.cg = g; z.g = g; return g;
}
const MYCORPSES = [];
function leaveCorpse() {   // you lose everything you carried: it stays on your body where you died
  const g = newGrid(10, 4); const all = [];
  for (const [s] of SLOTS) if (INV.eq[s]) all.push(INV.eq[s]); for (const e of INV.pockets.items) all.push(e.it);
  for (const it of all) { let rest = addToGrid(g, it); while (rest) { g.h += 2; rest = addToGrid(g, rest); } }
  if (!g.items.length) return;
  MYCORPSES.push(corpseActor(P.pos.clone(), P.yaw, g));
}

// ---------------------------------------------------------------- what is in reach (E)
function findTarget() {
  if (DRIVE) return { kind: 'drive' };
  let best = null, bd = 1e9; const px = P.pos.x, pz = P.pos.z, py = P.pos.y;
  const near = (x, z, y, r, dy = 1.6) => { const d = Math.hypot(x - px, z - pz); return d < r && Math.abs(y - py) < dy ? d : -1; };
  for (const pl of PILES) { if (!pl.g.items.length) continue; const d = near(pl.pos.x, pl.pos.z, pl.pos.y, 1.6); if (d >= 0 && d - 0.2 < bd) { bd = d - 0.2; best = { kind: 'pile', ref: pl }; } }
  for (const z of zombies) if (z.dead && (z.deadT || 0) > 1.2) { const d = near(z.pos.x, z.pos.z, z.pos.y, 1.7); if (d >= 0 && d < bd) { bd = d; best = { kind: 'corpse', ref: z }; } }
  for (const c of MYCORPSES) { const d = near(c.pos.x, c.pos.z, c.pos.y, 1.7); if (d >= 0 && d < bd) { bd = d; best = { kind: 'mycorpse', ref: c }; } }
  for (const T of TURRETS) { const d = near(T.pos.x, T.pos.z, T.pos.y, 1.8); if (d >= 0 && d < bd) { bd = d; best = { kind: 'turret', ref: T }; } }
  for (const V of CARS) { const d = carReach(V); if (d >= 0 && d + 0.3 < bd) { bd = d + 0.3; best = { kind: 'car', ref: V }; } }
  { const dn = doorNear(); if (dn && dn.d + 0.15 < bd) { bd = dn.d + 0.15; best = { kind: 'door', ref: dn.D }; } }
  const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const C of CONT_CELL.get(cellKey(i, j)) || []) for (const p of C.pts) {
    const d = Math.hypot(p.x - px, p.z - pz); if (d < 1.35 && Math.abs(p.y - (py + 0.9)) < 1.5 && d + 0.1 < bd) { bd = d + 0.1; best = { kind: 'cont', ref: C, p }; } }
  return best;
}
function promptText(t) {
  const E = TOUCH ? '' : 'E · ';
  if (!t) return HOLD === 'melee' && INV.eq.melee && INV.eq.melee.id === 'shovel' && !DRIVE ? E + 'dig here' : null;
  if (t.kind === 'drive') return E + 'get out';
  if (t.kind === 'pile') { const n = t.ref.g.items.length; return n === 1 ? E + 'pick up: ' + itemName(t.ref.g.items[0].it.id) + (t.ref.g.items[0].it.n > 1 ? ' ×' + t.ref.g.items[0].it.n : '') : E + `look at what is here (${n} items)`; }
  if (t.kind === 'corpse') return E + (t.ref.searched ? 'look at the body' : 'search the body');
  if (t.kind === 'mycorpse') return E + 'your body: take your gear';
  if (t.kind === 'turret') return E + `pack up minigun (${t.ref.ammo} rounds)`;
  if (t.kind === 'car') return E + 'drive ' + t.ref.name.toLowerCase() + (t.ref.fuel <= 0 ? ' (empty tank)' : '');
  if (t.kind === 'cont') return E + (t.ref.searched ? 'open ' : 'search ') + t.ref.name.toLowerCase();
  if (t.kind === 'door') return E + (Math.abs(t.ref.want) > 0.01 ? 'close the door' : 'open the door');
  return null;
}
function interact() {
  if (P.dead || !started || ACTION) return;
  if (DRIVE) { exitCar(); return; }
  const t = TARGET || findTarget(); if (!t) { if (HOLD === 'melee' && INV.eq.melee && INV.eq.melee.id === 'shovel') dig(); return; }
  if (t.kind === 'pile') { const pl = t.ref;
    if (pl.g.items.length === 1) { const e = pl.g.items[0]; const name = itemName(e.it.id); if (takeIntoPlayer(e.it)) { pl.g.items.length = 0; pileVis(pl); sfx('item_pickup'); P.actor.play('PickUp_Table', 0.1, true, 1.6); P.busy = 0.35; toast(name); afterChange(); return; } }
    openWith({ title: 'Ground', g: pl.g, pile: pl, pos: pl.pos }); return; }
  if (t.kind === 'cont') { const C = t.ref; const low = t.p.y - P.pos.y < 0.7;
    if (!C.searched) sfx(/locker|container|footlocker|fridge|wardrobe|cooler/.test(C.key) ? 'metal_locker_open' : /crate|box|ammo/.test(C.key) ? 'crate_open' : 'search_rummage', { gain: 0.7 });
    startAction(C.searched ? 0.3 : C.search, C.searched ? 'Opening …' : 'Searching ' + C.name.toLowerCase() + ' …', low ? 'Fixing_Kneeling' : 'Interact', () => { contGrid(C); C.searched = true; openWith({ title: C.name, g: C.g, cont: C, pos: t.p }); markDirty(); }); return; }
  if (t.kind === 'corpse') { const z = t.ref; if (!z.searched) sfx('search_rummage', { gain: 0.7 });
    startAction(z.searched ? 0.3 : 3, 'Searching the body …', 'Fixing_Kneeling', () => { corpseGrid(z); z.searched = true; openWith({ title: 'Body', g: z.cg, corpse: z, pos: z.pos }); markDirty(); }); return; }
  if (t.kind === 'mycorpse') { const c = t.ref; startAction(0.6, 'Opening …', 'Fixing_Kneeling', () => openWith({ title: 'Your body', g: c.g, corpse: c, pos: c.pos })); return; }
  if (t.kind === 'turret') { packTurret(t.ref); return; }
  if (t.kind === 'car') { enterCar(t.ref); return; }
  if (t.kind === 'door') { toggleDoor(t.ref); return; }
}
// picking something up: straight into an empty matching slot (a gun goes to the hands if they are empty), else into the grids
function takeIntoPlayer(it) {
  const s = slotFor(it.id); if (s && !INV.eq[s]) { INV.eq[s] = withGrid(it); if (ITEMS[it.id].gun && HOLD === 'hands') HOLD = s; onEquipChange(); return true; }
  const rest = UI.addAnywhere(it, gridsP()); return !rest;
}
function addOrDrop(it) { const rest = UI.addAnywhere(it, gridsP()); if (rest) { dropToGround(rest); toast('No room – dropped on the ground'); } }

// ---------------------------------------------------------------- timed actions (search, eat, bandage ...): you stand still and are open to attack
function startAction(dur, label, anim, done) { if (dur <= 0.05) { done(); return; } ACTION = { t: 0, dur, label, anim, done }; $('act-label').textContent = label; $('act-time').textContent = dur.toFixed(1) + ' s'; $('act').querySelector('i > i').style.width = '0%'; $('act').hidden = false; }
function cancelAction(msg) { if (!ACTION) return; ACTION = null; $('act').hidden = true; if (msg) toast(msg); }
function tickAction(dt) { if (!ACTION) return; ACTION.t += dt; $('act').querySelector('i > i').style.width = Math.min(100, (100 * ACTION.t) / ACTION.dur) + '%';
  $('act-time').textContent = Math.max(0, ACTION.dur - ACTION.t).toFixed(1) + ' s';
  if (ACTION.t >= ACTION.dur) { const f = ACTION.done; ACTION = null; $('act').hidden = true; f(); } }

// ---------------------------------------------------------------- inventory UI glue
const UI = makeInvUI({
  get inv() { return INV; },
  other: () => (OPEN ? { title: OPEN.title, g: OPEN.g } : null),
  ground: () => { if (!GROUND || !PILES.includes(GROUND) || GROUND.pos.distanceTo(P.pos) > 2) GROUND = nearPile() || newPile(P.pos); return { title: 'Ground', g: GROUND.g }; },
  onChange: (kind) => { if (kind === 'equip') onEquipChange(); afterChange(); },
  use: (loc) => useItem(loc), sfx: (n) => sfx(n, { gain: 0.55 }), toast: (t) => toast(t),
});
function afterChange() { if (OPEN && OPEN.corpse) syncCorpseVis(OPEN.corpse); for (const pl of [...PILES]) if (pl.pos.distanceTo(P.pos) < 4) pileVis(pl); hudWeapon(); markDirty(); }
function onEquipChange() { if (HOLD !== 'hands' && !INV.eq[HOLD]) HOLD = 'hands'; reloadT = 0; reloadDone = null; reloadJob = null; syncPlayerVis(); hudWeapon(); }
function openWith(o) { OPEN = o; openInv(true); }
function openInv(keep) { if (!started || P.dead) return; document.exitPointerLock?.(); if (!keep) OPEN = null; UI.open(); }
function closeInv() { UI.close(); OPEN = null; for (const pl of [...PILES]) if (!pl.g.items.length) pileVis(pl); afterChange(); }
function toggleInv() { if (UI.isOpen) closeInv(); else openInv(); }
function removeAt(loc) { if (loc.slot) INV.eq[loc.slot] = null; else { const i = loc.g.items.indexOf(loc.e); if (i >= 0) loc.g.items.splice(i, 1); } }
function useItem(loc) {
  const it = loc.slot ? INV.eq[loc.slot] : loc.e.it; const d = ITEMS[it.id]; const u = d.use; if (!u || ACTION) return;
  if (u.dig) { dig(); return; }
  if (u.deploy) { removeAt(loc); closeInv(); deployTurret(it); return; }
  if (u.refuel) { const V = DRIVE || CARS.find((c) => carReach(c) >= 0); if (!V) { toast('Go to a vehicle first'); return; } if (!it.fuel) { toast('The jerrycan is empty'); return; }
    startAction(u.time, 'Pouring fuel …', 'Interact', () => { const k = Math.min(it.fuel, 60 - V.fuel); V.fuel += k; it.fuel -= k; toast(`${V.name}: ${V.fuel.toFixed(1)} l`); if (DRIVE === V && !V.eng) startEngine(V); UI.render(); afterChange(); }); return; }
  if ((u.hp || u.hot) && !u.food && !u.water && !u.bleed && !u.stam && P.hp >= 99.5) { toast('You are at full health'); return; }
  const anim = d.cat === 'food' || d.cat === 'drink' || it.id.includes('pills') ? 'Consume' : 'Interact';
  startAction(u.time, u.verb + ': ' + d.name.toLowerCase() + ' …', anim, () => {
    const where = UI.findLoc(it); if (!where) return;
    if (u.food) NEEDS.food = clamp100(NEEDS.food + u.food); if (u.water) NEEDS.water = clamp100(NEEDS.water + u.water);
    if (u.hp) P.hp = Math.min(100, P.hp + u.hp); if (u.hot) NEEDS.hot += u.hot; if (u.bleed) NEEDS.bleed = 0; if (u.stam) { NEEDS.stam = 100; NEEDS.tired = false; }
    if (it.n > 1) it.n--; else removeAt(where);
    if (u.unpack) for (let k = 0; k < 4; k++) addOrDrop(make(u.unpack[Math.floor(Math.random() * u.unpack.length)]));
    if (u.unpackN) for (const [id, n] of u.unpackN) addOrDrop({ id, n });
    toast(d.name); UI.render(); afterChange();
  });
}

// ---------------------------------------------------------------- weapons
function setHold(slot) {
  if (DRIVE || P.dead) return; if (slot !== 'hands' && !INV.eq[slot]) { toast({ primary: 'No primary weapon', sidearm: 'No sidearm', melee: 'No melee weapon' }[slot]); return; }
  if (HOLD === slot) return; HOLD = slot; reloadT = 0; reloadDone = null; reloadJob = null; syncPlayerVis(); hudWeapon(); toast(held() ? itemName(held().id) : 'Fists');
}
function cycleWeapon(dir = 1) { const order = ['primary', 'sidearm', 'melee', 'hands'].filter((s) => s === 'hands' || INV.eq[s]); const i = order.indexOf(HOLD); setHold(order[(i + dir + order.length) % order.length]); }
const rounds = (it) => { const g = ITEMS[it.id].gun; return g.mag ? it.m ?? 0 : it.r || 0; };
function bestMag(it) { const w = ITEMS[it.id].gun; let best = null, n = 0, tot = 0;
  for (const g of gridsP()) for (const e of g.items) if (ITEMS[e.it.id].kind === w.mag) { n++; tot += e.it.r; if (e.it.r > 0 && (!best || e.it.r > best.e.it.r)) best = { g, e }; } return { best, n, tot }; }
function reload() {
  const it = held(); if (!it || P.dead || reloadT > 0 || reloadJob || DRIVE) return; const w = ITEMS[it.id].gun; if (!w) return;
  if (w.mag) { const { best } = bestMag(it); if (!best) { toast('No loaded magazine – fill one in the inventory'); return; }
    if (it.m != null && it.m >= best.e.it.r) { toast('The fullest magazine is already in'); return; }
    const wasEmpty = !it.m; reloadT = w.reload; P.actor.play(w.anim + '_Reload', 0.1, true, 1); sfx('rifle_mag_out', { gain: 0.7 }); sfx('rifle_mag_in', { delay: w.reload * 0.65, gain: 0.7 });
    reloadDone = () => { const e = best.e; if (!best.g.items.includes(e) || held() !== it) return; const old = it.m; it.m = e.it.r; if (old == null) best.g.items.splice(best.g.items.indexOf(e), 1); else e.it.r = old;
      if (wasEmpty) sfx(w.anim === 'Pistol' ? 'pistol_slide' : 'rifle_charge', { gain: 0.7 }); hudWeapon(); UI.render(); markDirty(); };
  } else { if (it.r >= w.cap) return; if (!count(gridsP(), w.ammo)) { toast('No matching ammo'); return; } reloadJob = { t: w.reload, it }; P.actor.play(w.anim + '_Reload', 0.1, true, 1); }
}
function tickReload(dt) {
  if (reloadT > 0) { reloadT -= dt; if (reloadT <= 0) { reloadT = 0; const f = reloadDone; reloadDone = null; if (f) f(); } }
  if (reloadJob) { reloadJob.t -= dt; if (reloadJob.t <= 0) { const it = reloadJob.it, w = ITEMS[it.id].gun; if (held() !== it) { reloadJob = null; return; }
    if (take(gridsP(), w.ammo, 1)) { it.r++; sfx('shotgun_shell_in', { gain: 0.6 }); }
    if (it.r >= w.cap || !count(gridsP(), w.ammo)) { reloadJob = null; if (w.snd === 'shotgun') sfx('shotgun_pump', { gain: 0.7, delay: 0.1 }); } else { reloadJob.t = w.reload; P.actor.play(w.anim + '_Reload', 0.05, true, 1); }
    hudWeapon(); markDirty(); } }
}
// ray vs zombie capsules (feet -> head, radius 0.33); returns {z, t, head}
const segA = new THREE.Vector3(), segB = new THREE.Vector3(), cpR = new THREE.Vector3(), cpS = new THREE.Vector3();
function rayZombie(ray, maxT) {
  let best = null;
  for (const z of zombies) {
    if (z.dead) continue; const dx = z.pos.x - ray.origin.x, dz = z.pos.z - ray.origin.z; if (dx * dx + dz * dz > maxT * maxT) continue;
    segA.set(z.pos.x, z.pos.y + 0.35, z.pos.z); segB.set(z.pos.x, z.pos.y + 1.62, z.pos.z);
    const d2 = ray.distanceSqToSegment(segA, segB, cpR, cpS);
    if (d2 < 0.33 * 0.33) { const t = cpR.distanceTo(ray.origin); if (t < maxT && (!best || t < best.t)) best = { z, t, head: cpS.y > z.pos.y + 1.42, point: cpR.clone() }; }
  }
  return best;
}
const tracers = [];
const TRACER = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9 });
const flashLight = new THREE.PointLight(0xffc070, 0, 6, 2); scene.add(flashLight);
function tracer(a, b, life = 0.06) { const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]); const l = new THREE.Line(g, TRACER); scene.add(l); tracers.push({ l, t: life }); }
const shotRay = new THREE.Ray(), camFwd = new THREE.Vector3(), muzzle = new THREE.Vector3(), hitP = new THREE.Vector3();
let movingNow = false;
function fireGun() {
  const it = held(), d = ITEMS[it.id], w = d.gun; reloadJob = null;
  if (rounds(it) <= 0) { sfx('dry_fire', { gain: 0.8 }); fireCD = 0.35; firing = false; const sp = w.mag ? bestMag(it).best : count(gridsP(), w.ammo); toast(sp ? 'Empty – press R to reload' : 'Empty – no ammo'); return; }
  if (w.mag) it.m--; else it.r--;
  fireCD = 60 / w.rpm; P.yaw = P.look; camera.getWorldDirection(camFwd);
  const inf = INFO[d.model];
  if (heldObj && inf) { muzzle.set(inf.size[0] / 2 - inf.off[0], 0.05, 0); heldObj.localToWorld(muzzle); } else muzzle.copy(P.pos).add(new THREE.Vector3(0, 1.4, 0));
  const bv = nearCells(P.pos.x, P.pos.z, 1); const pel = w.pellets || 1;
  const spread = (aiming ? w.aimSpread : w.spread) * (movingNow ? 1.6 : 1) * (P.crouch ? 0.8 : 1);
  for (let k = 0; k < pel; k++) {
    shotRay.origin.copy(camera.position); shotRay.direction.copy(camFwd);
    shotRay.direction.x += (Math.random() - 0.5) * spread * 2; shotRay.direction.y += (Math.random() - 0.5) * spread * 2; shotRay.direction.z += (Math.random() - 0.5) * spread * 2; shotRay.direction.normalize();
    let wallT = w.range; for (const b of bv) { const h = b.raycastFirst(shotRay, THREE.DoubleSide); if (h && h.distance < wallT) wallT = h.distance; }
    const hz = rayZombie(shotRay, wallT);
    if (hz) { hz.z.hit(shotRay.direction.clone().setY(0).normalize(), w.dmg * (hz.head ? 2.2 : 1)); hitP.copy(hz.point); } else shotRay.at(wallT, hitP);
    if (k < 3) tracer(muzzle, hitP);
  }
  flashLight.position.copy(muzzle); flashLight.intensity = 6; setTimeout(() => (flashLight.intensity = 0), 45);
  gunSound(w);
  P.actor.play(w.anim + '_Shoot', 0.04, true, w.auto ? 2.2 : 1.4); P.busy = Math.max(P.busy, Math.min(0.25, fireCD));
  P.pitch = clampPitch(P.pitch + w.recoil); hudWeapon(); markDirty();
}
const upRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
function indoors() { upRay.origin.set(P.pos.x, P.pos.y + 1.7, P.pos.z); for (const b of nearCells(P.pos.x, P.pos.z, 0)) { const h = b.raycastFirst(upRay, THREE.DoubleSide); if (h && h.distance < 8) return true; } return false; }
function gunSound(w) { const snd = w.snd || 'rifle'; sfx(`gun_${snd}_${indoors() ? 'in' : 'out'}_`, { gain: 1.0, jit: 0.04 });
  if (snd === 'shotgun') sfx('shotgun_pump', { delay: 0.38, gain: 0.7 }); if (snd === 'sniper' && !w.auto) sfx('sniper_bolt', { delay: 0.55, gain: 0.7 }); if (Math.random() < 0.5) sfx('casing_ground', { delay: 0.45, gain: 0.25 });
  alertZombies(P.pos, snd === 'pistol' ? 45 : snd === 'shotgun' ? 60 : snd === 'sniper' ? 90 : 70); }
function alertZombies(p, r) { for (const z of zombies) if (!z.dead && z.state !== 'chase' && z.pos.distanceTo(p) < r) { z.state = 'chase'; z.alertT = 25; } }
function attack() {
  if (P.dead || !started || fireCD > 0 || reloadT > 0 || DRIVE || UI.isOpen || ACTION) return;
  const it = held(), d = it && ITEMS[it.id];
  if (d && d.gun) { fireGun(); return; }
  if (P.busy > 0) return; if (NEEDS.stam < 4) { toast('You are too tired'); return; } NEEDS.stam -= 6; NEEDS.rest = 0.8;
  const m = d && d.melee ? d.melee : { dmg: 34, time: 0.55, reach: 1.7 };
  P.busy = m.time * 0.9; fireCD = m.time; P.actor.play(d ? 'Sword_Regular_A' : 'Punch_Cross', 0.06, true, d ? 1.5 : 1.35); sfx('swing_', { gain: 0.55, delay: 0.1, rate: d ? 0.85 : 1 });
  setTimeout(() => {
    const fwd = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    for (const z of zombies) { if (z.dead) continue; const v = tmpP.subVectors(z.pos, P.pos); v.y = 0; const l = v.length(); if (l > m.reach || l < 1e-3) continue; if (v.dot(fwd) / l < 0.4) continue; z.hit(fwd, m.dmg); }
  }, 230);
}
function armorFactor() { let f = 1; for (const s of ['head', 'vest']) { const it = INV.eq[s]; if (it && ITEMS[it.id].gear) f *= 1 - (ITEMS[it.id].gear.armor || 0); } return f; }

// ---------------------------------------------------------------- needs, bleeding, healing over time
function tickNeeds(dt) {
  if (P.dead) return;
  NEEDS.food = Math.max(0, NEEDS.food - (dt * 100) / 2400); NEEDS.water = Math.max(0, NEEDS.water - ((dt * 100) / 1500) * (sprinting ? 1.6 : 1));
  if (sprinting) { NEEDS.stam -= dt * 14; NEEDS.rest = 0.8; if (NEEDS.stam <= 0) { NEEDS.stam = 0; NEEDS.tired = true; toast('You are out of breath'); } }
  else { NEEDS.rest -= dt; if (NEEDS.rest <= 0) NEEDS.stam = Math.min(100, NEEDS.stam + dt * (NEEDS.food > 10 && NEEDS.water > 10 ? 18 : 7)); }
  if (NEEDS.tired && NEEDS.stam > 25) NEEDS.tired = false;
  let dh = 0; if (NEEDS.bleed) dh -= dt * 0.5; if (NEEDS.hot > 0) { const k = Math.min(NEEDS.hot, dt); dh += k; NEEDS.hot -= k; }
  if (NEEDS.food <= 0 || NEEDS.water <= 0) dh -= dt * 0.25; else if (NEEDS.food > 60 && NEEDS.water > 60 && !NEEDS.bleed && P.hp < 100) dh += dt * 0.08;
  P.hp = Math.min(100, P.hp + dh); if (P.hp <= 0) die();
}

// ---------------------------------------------------------------- HUD
function hudWeapon() {
  const el = $('weapon'); const it = held(); const d = it && ITEMS[it.id];
  if (DRIVE) el.textContent = `${DRIVE.name} · ${Math.round(Math.abs(DRIVE.v) * 3.6)} km/h · fuel ${DRIVE.fuel.toFixed(1)} l · car ${Math.round((100 * DRIVE.hp) / DRIVE.hpMax)} %`;
  else if (!d) el.textContent = 'Fists'; else if (!d.gun) el.textContent = d.name;
  else if (d.gun.mag) { const b = bestMag(it); el.textContent = `${d.name} · ${it.m == null ? '–' : it.m} | ${b.n} mag. (${b.tot})`; }
  else el.textContent = `${d.name} · ${it.r} | ${count(gridsP(), d.gun.ammo)}`;
  $('cross').hidden = !(isGun() && !DRIVE && (document.pointerLockElement === canvas || TOUCH));
  if (TOUCH) $('t-punch').textContent = isGun() ? 'Shoot' : 'Hit';
}
const renderHud = hudWeapon;
function hudNeeds() {
  $('n-food').firstElementChild.style.width = NEEDS.food + '%'; $('n-water').firstElementChild.style.width = NEEDS.water + '%'; $('n-stam').firstElementChild.style.width = NEEDS.stam + '%';
  $('bleed').hidden = !NEEDS.bleed;
}
function updateMech(dt) {
  fireCD = Math.max(0, fireCD - dt); tickReload(dt); saveT += dt; if (saveT > 10) { saveT = 0; if (dirty) save(); } tickAction(dt); tickNeeds(dt);
  const d = heldDef(); if (firing && d && d.gun && (d.gun.auto || fireCD <= 0) && fireCD <= 0 && reloadT <= 0 && !P.dead) attack();
  if (firing && (!d || d.melee) && fireCD <= 0) attack();
  updateHeldObj(); updateTurrets(dt); updateCars(dt); updateDoors(dt);
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t -= dt; if (tracers[i].t <= 0) { scene.remove(tracers[i].l); tracers[i].l.geometry.dispose(); tracers.splice(i, 1); } }
  if (frame % 5 === 0) {
    TARGET = UI.isOpen || ACTION ? null : findTarget(); const pr = $('prompt'); const txt = promptText(TARGET); pr.hidden = !txt; if (txt) pr.textContent = txt;
    for (const pl of PILES) if (pl.ring) pl.ring.material.opacity = 0.25 + 0.15 * Math.sin(performance.now() / 300);
    if (OPEN && OPEN.pos && OPEN.pos.distanceTo(P.pos) > 3.2) closeInv();
    hudNeeds(); if (frame % 15 === 0) hudWeapon();
  }
}
function weaponClip(clip, moving, sprintingNow) {
  const d = heldDef(); if (!d || !d.gun) return clip;
  const k = d.gun.anim === 'Shotgun' ? 'Shotgun' : 'Rifle';
  if (P.crouch) return d.gun.anim === 'Pistol' ? clip : moving ? k + '_Crouch_Walk_Loop' : k + '_Crouch_Aim_Loop';
  if (d.gun.anim === 'Pistol') return (aiming || firing) ? (moving ? 'Walk_Loop' : 'Pistol_Aim_Neutral') : (moving ? clip : 'Pistol_Idle_Loop');
  if (aiming || firing) return moving ? k + '_Aim_Walk_Loop' : k + '_Aim_Loop';
  if (!moving) return k + '_Idle_Loop'; return sprintingNow ? k + '_Run_Loop' : k + '_Walk_Loop';
}
function die() {
  if (P.dead) return; P.dead = true; cancelAction(); exitCar(true); firing = false; aiming = false; P.actor.play('Death01', 0.1, true);
  setTimeout(() => { closeInv(); $('dead').hidden = false; document.exitPointerLock?.(); }, 1400);
}

// ---------------------------------------------------------------- driving (Claude-Desktop 23/10): humvee, jeep, truck, pickup, van and the SD cars
// The car is still an instance of its InstancedMesh: moving it rewrites its placement and instance matrices. Drivable cars are left out of
// the static collision cells; they collide as boxes instead (with you, the zombies and each other).
const DRIVE_RE = /(veh_mil_(humvee|jeep|truck)_s\d|veh_(pickup|van)_s\d|SD_pickup|SD_car3_[a-z]+)$/;
const CAR_NAME = (k) => (/humvee/.test(k) ? 'Humvee' : /jeep/.test(k) ? 'Jeep' : /truck/.test(k) ? 'Truck' : /pickup/.test(k) ? 'Pickup' : /van/.test(k) ? 'Van' : 'Car');
const CARS = []; let DRIVE = null;
const isCarKey = (raw) => DRIVE_RE.test(raw) && !/wreck/.test(raw);
function buildCars() {
  const box = new THREE.Box3();
  for (const cat of ['vehicle', 'military']) for (const [raw, a] of Object.entries(W.placements[cat] || {})) {
    if (!isCarKey(raw)) continue; const key = sanitize(raw); const g = geoFor(key, 0); if (!g) continue;
    if (!g.geo.boundingBox) g.geo.computeBoundingBox(); box.copy(g.geo.boundingBox).applyMatrix4(g.m);
    const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z, h = box.max.y - box.min.y; const alongX = sx >= sz;
    const glassRaw = Object.keys(W.placements.glass || {}).find((k) => k === raw + '__glass' || k.endsWith(raw.split('/').pop() + '__glass'));
    for (let i = 0; i < a.length; i += 5) {
      const R = rng(hash(raw + i)); const V = { id: raw.split('/').pop() + '#' + i / 5, raw, key, cat, i, a, name: CAR_NAME(raw), len: alongX ? sx : sz, wid: alongX ? sz : sx, h, alongX,
        cx: (box.max.x + box.min.x) / 2, cz: (box.max.z + box.min.z) / 2, v: 0, steer: 0, fuel: Math.round((3 + R() * 22) * 10) / 10, glassRaw, glassI: -1, pitch: 0, roll: 0, eng: null, hp: /humvee/.test(raw) ? 220 : /truck/.test(raw) ? 180 : 100, sgn: /SD_/.test(raw) ? -1 : 1 }; V.hpMax = V.hp;   // SD cars are modelled nose to -X, ours to +X
      if (glassRaw) { const ga = W.placements.glass[glassRaw]; for (let j = 0; j < ga.length; j += 5) if (Math.abs(ga[j] - a[i]) < 0.01 && Math.abs(ga[j + 2] - a[i + 2]) < 0.01) { V.glassI = j; break; } }
      CARS.push(V);
    }
  }
}
// forward / left unit vectors of a car in the world (placement rotation is about +Y)
const carFwd = (V, out = new THREE.Vector3()) => (V.alongX ? out.set(Math.cos(V.a[V.i + 3]), 0, -Math.sin(V.a[V.i + 3])) : out.set(Math.sin(V.a[V.i + 3]), 0, Math.cos(V.a[V.i + 3]))).multiplyScalar(V.sgn);
const carPos = (V, out = new THREE.Vector3()) => out.set(V.a[V.i], V.a[V.i + 1], V.a[V.i + 2]);
function carReach(V) {   // distance from you to the car's side, -1 when not in reach
  const f = carFwd(V, carF2); const dx = P.pos.x - V.a[V.i], dz = P.pos.z - V.a[V.i + 2]; const along = dx * f.x + dz * f.z, side = -dx * f.z + dz * f.x;
  const ex = Math.max(0, Math.abs(along) - V.len / 2), ez = Math.max(0, Math.abs(side) - V.wid / 2); const d = Math.hypot(ex, ez); return d < 1.3 && Math.abs(P.pos.y - V.a[V.i + 1]) < 2 ? d : -1;
}
const carM = new THREE.Matrix4(), carQ = new THREE.Quaternion(), carE = new THREE.Euler(0, 0, 0, 'YXZ'), carS = new THREE.Vector3(1, 1, 1), carT = new THREE.Vector3();
function writeCar(V) {     // instance matrices of the car (and its glass) from position, heading, pitch and roll
  const a = V.a, i = V.i; carE.set(V.alongX ? V.roll : -V.pitch, a[i + 3], V.alongX ? V.pitch : V.roll); carQ.setFromEuler(carE); carS.setScalar(a[i + 4]); carT.set(a[i], a[i + 1], a[i + 2]);
  for (const g of groups) { const isMain = g.src === a, isGlass = V.glassI >= 0 && g.src === W.placements.glass[V.glassRaw]; if (!isMain && !isGlass) continue;
    const k = (isMain ? i : V.glassI) / 5; if (isGlass) { g.src[V.glassI] = a[i]; g.src[V.glassI + 1] = a[i + 1]; g.src[V.glassI + 2] = a[i + 2]; g.src[V.glassI + 3] = a[i + 3]; }
    carM.compose(carT, carQ, carS).multiply(g.gm); carM.toArray(g.mats, k * 16); }
  lastLodPos.set(1e9, 0, 0);   // force the LOD pass to copy the new matrices
}
// box push-out: keep a point (radius r) out of every car except `skip`
function collideCars(pos, r, skip) {
  for (const V of CARS) { if (V === skip) continue; const dx = pos.x - V.a[V.i], dz = pos.z - V.a[V.i + 2]; if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue; if (pos.y > V.a[V.i + 1] + V.h - 0.35 || pos.y + 1.6 < V.a[V.i + 1]) continue;
    const f = carFwd(V, carF2); const along = dx * f.x + dz * f.z, side = -dx * f.z + dz * f.x; const hx = V.len / 2 + r, hz = V.wid / 2 + r;
    if (Math.abs(along) < hx && Math.abs(side) < hz) { const px = hx - Math.abs(along), pz = hz - Math.abs(side);
      if (px < pz) { const s = Math.sign(along) * px; pos.x += f.x * s; pos.z += f.z * s; } else { const s = Math.sign(side) * pz; pos.x += -f.z * s; pos.z += f.x * s; } } }
}
// distance from a point to the car's body (0 inside)
function boxDist(V, p) { const f = carFwd(V, carF2); const dx = p.x - V.a[V.i], dz = p.z - V.a[V.i + 2]; const along = dx * f.x + dz * f.z, side = -dx * f.z + dz * f.x;
  return Math.hypot(Math.max(0, Math.abs(along) - V.len / 2), Math.max(0, Math.abs(side) - V.wid / 2)); }
function damageCar(V, n) {
  if (V.hp <= 0) return; V.hp = Math.max(0, V.hp - n); sfx('zombie_thud', { gain: 0.5, rate: 0.8 }); markDirty();
  if (V.hp <= 0) { stopEngine(V); V.v = 0; toast(V.name + ' is wrecked – get out'); } else if (V.hp < V.hpMax * 0.3 && !V.warned) { V.warned = true; toast(V.name + ' is badly damaged'); }
  if (DRIVE === V) hudWeapon();
}
function enterCar(V) {
  if (P.dead || DRIVE) return; DRIVE = V; cancelAction(); aiming = false; firing = false; closeInv(); sfx('car_door', { gain: 0.8 });
  P.actor.play('Driving_Loop', 0.2); { const f = carFwd(V, new THREE.Vector3()); P.look = Math.atan2(f.x, f.z); } P.pitch = -0.22;
  if (V.hp <= 0) toast('This car is wrecked – it will not start');
  else if (V.fuel > 0) { sfx('engine_start', { gain: 0.8, delay: 0.25 }); setTimeout(() => startEngine(V), 1400); } else toast('The tank is empty – pour in fuel from a jerrycan');
  hudWeapon(); $('cross').hidden = true;
}
function startEngine(V) {
  if (DRIVE !== V || V.eng || !SFX.ctx || V.fuel <= 0 || V.hp <= 0) return; const b = SFX.buf['engine_loop.mp3']; if (!b) return;
  const s = SFX.ctx.createBufferSource(); s.buffer = b; s.loop = true; if (b.duration > 2.01) { s.loopStart = (b.duration - 2.0) / 2; s.loopEnd = s.loopStart + 2.0; }
  const g = SFX.ctx.createGain(); g.gain.value = 0.55; s.connect(g).connect(SFX.out); s.start(); V.eng = { s, g };
}
function stopEngine(V) { if (!V.eng) return; try { V.eng.g.gain.setTargetAtTime(0, SFX.ctx.currentTime, 0.05); V.eng.s.stop(SFX.ctx.currentTime + 0.3); } catch (_) {} V.eng = null; sfx('engine_stop', { gain: 0.6 }); }
function exitCar(quiet) {
  const V = DRIVE; if (!V) return; DRIVE = null; stopEngine(V); V.v = 0; if (!quiet) sfx('car_door', { gain: 0.8 });
  const f = carFwd(V, new THREE.Vector3()); const left = new THREE.Vector3(f.z, 0, -f.x);   // driver's side
  for (const s of [1, -1]) { const p = carPos(V, new THREE.Vector3()).addScaledVector(left, s * (V.wid / 2 + 0.7)); p.y = Math.max(heightAt(p.x, p.z), p.y); const q = p.clone(); collide(q, 0.32, nearCells(q.x, q.z, 1)); if (q.distanceTo(p) < 0.3 || s === -1) { P.pos.copy(q); break; } }
  P.vy = 0; P.ground = false; P.actor.play('Idle_Loop', 0.2); hudWeapon(); markDirty();
}
const carIn = { t: 0, s: 0 }; const carF = new THREE.Vector3(), carF2 = new THREE.Vector3();
function updateCars(dt) {
  const V = DRIVE; if (!V) return;
  // input: W/S throttle and brake/reverse, A/D steer, Space handbrake; touch: the stick
  let th = 0, st = 0; if (keys.has('KeyW') || keys.has('ArrowUp')) th += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) th -= 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) st += 1; if (keys.has('KeyD') || keys.has('ArrowRight')) st -= 1;
  if (TOUCH) { th -= stick.y; st -= stick.x; } th = Math.max(-1, Math.min(1, th)); st = Math.max(-1, Math.min(1, st));
  const truck = /truck/.test(V.raw), maxV = truck ? 17 : 22, acc = truck ? 4 : 6.5;
  if (V.fuel <= 0 || V.hp <= 0) th = 0;
  if (th > 0) V.v += (V.v < 0 ? 12 : acc) * th * dt; else if (th < 0) V.v += (V.v > 0.3 ? 14 : 4) * th * dt; else V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), 2.2 * dt);
  if (keys.has('Space')) V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), 16 * dt);
  V.v = Math.max(-6, Math.min(maxV, V.v)); V.steer += (st * 0.55 - V.steer) * Math.min(1, dt * 6);
  const wb = V.len * 0.6, a = V.a, i = V.i; a[i + 3] += (V.v / wb) * Math.tan(V.steer) * dt;
  const f = carFwd(V, carF); { const nx = a[i] + f.x * V.v * dt, nz = a[i + 2] + f.z * V.v * dt; const s2 = Math.sign(V.v) || 1;
    const fx2 = nx + f.x * s2 * V.len * 0.45, fz2 = nz + f.z * s2 * V.len * 0.45;   // the end of the car that moves first
    if (W.water_z - heightAt(fx2, fz2) > 0.55) { if (Math.abs(V.v) > 0.5 && !V.wetT) { toast('Too deep for the car'); V.wetT = 2; } V.v = 0; } else { a[i] = nx; a[i + 2] = nz; }
    if (V.wetT) V.wetT = Math.max(0, V.wetT - dt); }
  V.fuel = Math.max(0, V.fuel - Math.abs(V.v) * dt * 0.002 - (V.eng ? dt * 0.0006 : 0)); if (V.fuel <= 0 && V.eng) { stopEngine(V); toast('Out of fuel'); }
  // collisions: three circles along the body against the world, boxes against the other cars, zombies get run over
  const bv = nearCells(a[i], a[i + 2], 1); let hit = 0; const r = V.wid / 2;
  for (const s of [-0.32, 0, 0.32]) { const c = new THREE.Vector3(a[i] + f.x * V.len * s, a[i + 1], a[i + 2] + f.z * V.len * s); const c0 = c.clone(); collide(c, r, bv); collideCars(c, r, V);
    const dx = c.x - c0.x, dz = c.z - c0.z; if (dx || dz) { a[i] += dx; a[i + 2] += dz; hit = Math.max(hit, Math.hypot(dx, dz)); } }
  if (hit > 0.02) { if (Math.abs(V.v) > 6) { sfx('car_crash', { gain: Math.min(1, Math.abs(V.v) / 15) }); damageCar(V, (Math.abs(V.v) - 6) * 2.5); P.hp -= Math.max(0, Math.abs(V.v) - 12) * 1.2; if (P.hp <= 0) die(); } V.v *= -0.15; }
  for (const z of zombies) { if (z.dead) continue; const dx = z.pos.x - a[i], dz = z.pos.z - a[i + 2]; if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
    const along = dx * f.x + dz * f.z, side = -dx * f.z + dz * f.x; if (Math.abs(along) < V.len / 2 + 0.3 && Math.abs(side) < V.wid / 2 + 0.3) {
      if (Math.abs(V.v) > 3) { z.hit(new THREE.Vector3(f.x, 0, f.z).multiplyScalar(Math.sign(V.v)), Math.abs(V.v) * 9); sfx('zombie_thud', { gain: 0.9 }); V.v *= 0.82; damageCar(V, 1.5); }
      const s = Math.sign(side) || 1; z.pos.x += -f.z * s * 0.3; z.pos.z += f.x * s * 0.3; } }
  // ground: wheels follow the terrain / road
  const yAt = (x, z) => groundAt(x, a[i + 1] + 0.8, z, bv);
  const fx = f.x * V.len * 0.35, fz = f.z * V.len * 0.35, lx = -f.z * V.wid * 0.4, lz = f.x * V.wid * 0.4;
  const yF = yAt(a[i] + fx, a[i + 2] + fz), yB = yAt(a[i] - fx, a[i + 2] - fz), yL = yAt(a[i] + lx, a[i + 2] + lz), yR = yAt(a[i] - lx, a[i + 2] - lz);
  const ty = (yF + yB + yL + yR) / 4; a[i + 1] += (ty - a[i + 1]) * Math.min(1, dt * 10);
  V.pitch += (Math.atan2(yF - yB, V.len * 0.7) * V.sgn - V.pitch) * Math.min(1, dt * 8); V.roll += (Math.atan2(yL - yR, V.wid * 0.8) * V.sgn - V.roll) * Math.min(1, dt * 8);
  a[i] = Math.min(Math.max(a[i], 2), 638); a[i + 2] = Math.min(Math.max(a[i + 2], -638), -2);
  writeCar(V);
  // you sit in the driver's seat
  const left = new THREE.Vector3(f.z, 0, -f.x); P.pos.set(a[i], a[i + 1] + V.h * 0.1, a[i + 2]).addScaledVector(f, V.len * 0.05).addScaledVector(left, V.wid * 0.22);
  P.yaw = Math.atan2(f.x, f.z); P.ground = true; P.vy = 0;
  if (V.eng) { V.eng.s.playbackRate.value = 0.85 + Math.min(1.9, Math.abs(V.v) / 9) + (th !== 0 ? 0.15 : 0); V.eng.g.gain.value = 0.4 + 0.25 * Math.abs(th); }
  // camera follows behind the car
  const want = Math.atan2(f.x, f.z); carIn.t -= dt; if (carIn.t <= 0) P.look = turn(P.look, want, dt * 2.2);
  if (frame % 10 === 0) hudWeapon();
}

// ---------------------------------------------------------------- digging (Claude-Desktop 24/10): a shovel lowers the terrain in front of you, up to 3 m deep
// The heightmap (walking, zombies) and the terrain meshes are lowered together. Underground rooms and tunnels need a different terrain (see docs).
const DIGS = []; const MAXDIG = 3.0; let DUG = null;
function digAllowed(x, z) {
  if (ROADGRID) { const N = Math.round(W.size_m[0]), gx = Math.floor(x), gy = Math.floor(-z); if (gx >= 0 && gy >= 0 && gx < N && gy < N && ROADGRID[gx + gy * N]) return 'The road is too hard to dig'; }
  if (heightAt(x, z) < W.water_z + 0.25) return 'You cannot dig in the water';
  upRay.origin.set(x, P.pos.y + 0.3, z); for (const b of nearCells(x, z, 0)) { const h = b.raycastFirst(upRay, THREE.DoubleSide); if (h && h.distance < 6) return 'You cannot dig here'; }
  return null;
}
function dig() {
  if (!started || P.dead || DRIVE || ACTION) return;
  const has = (INV.eq.melee && INV.eq.melee.id === 'shovel') || gridsP().some((g) => g.items.some((e) => e.it.id === 'shovel')); if (!has) { toast('You need a shovel'); return; }
  const x = P.pos.x + Math.sin(P.yaw) * 1.1, z = P.pos.z + Math.cos(P.yaw) * 1.1; const no = digAllowed(x, z); if (no) { toast(no); return; }
  if (UI.isOpen) closeInv();
  startAction(2.2, 'Digging …', 'Farm_Harvest', () => { applyDig(x, z, 0.35, 1.15); DIGS.push([+x.toFixed(2), +z.toFixed(2)]); sfx('step_gravel_', { gain: 1, rate: 0.7 }); markDirty(); });
}
const digV = new THREE.Vector3(), digInv = new THREE.Matrix4();
function applyDig(x, z, depth, r) {
  const H = W.heightmap, n = H.px, mpp = H.m_per_px; if (!DUG) DUG = new Float32Array(n * n);
  const prev = new Map(); const i0 = Math.max(0, Math.floor((x - r) / mpp)), i1 = Math.min(n - 1, Math.ceil((x + r) / mpp)), j0 = Math.max(0, Math.floor((640 + z - r) / mpp)), j1 = Math.min(n - 1, Math.ceil((640 + z + r) / mpp));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(i * mpp - x, j * mpp - 640 - z); if (d >= r) continue; const p = j * n + i; const w = 1 - (d / r) * (d / r);
    const add = Math.min(depth * w, MAXDIG - DUG[p]); if (add <= 0) continue; prev.set(p, DUG[p]); DUG[p] += add; HM[p] = Math.max(0, Math.round(HM[p] - (add / (H.z_hi - H.z_lo)) * 65535)); }
  if (!prev.size) { toast('The hole is as deep as it gets'); return; }
  const dugAt = (px, pz, old) => { const fx = Math.min(Math.max(px / mpp, 0), n - 1.001), fy = Math.min(Math.max((640 + pz) / mpp, 0), n - 1.001); const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const v = (i, j) => { const p = j * n + i; return old && prev.has(p) ? prev.get(p) : DUG[p]; }; return (v(ix, iy) * (1 - tx) + v(ix + 1, iy) * tx) * (1 - ty) + (v(ix, iy + 1) * (1 - tx) + v(ix + 1, iy + 1) * tx) * ty; };
  for (const t of terrain) { if (Math.abs(t.cx - x) > 40 || Math.abs(t.cz - z) > 40) continue;
    for (const m of new Set([t.near, t.far])) { if (!m) continue; let g = m.geometry;
      if (!g.userData.f32) { const pa = g.attributes.position, f = new Float32Array(pa.count * 3); for (let i = 0; i < pa.count; i++) { f[i * 3] = pa.getX(i); f[i * 3 + 1] = pa.getY(i); f[i * 3 + 2] = pa.getZ(i); }
        g = g.clone(); g.setAttribute('position', new THREE.BufferAttribute(f, 3)); g.userData.f32 = true; m.geometry = g; }
      const pa = g.attributes.position; digInv.copy(m.matrix).invert(); let ch = false;
      for (let i = 0; i < pa.count; i++) { digV.fromBufferAttribute(pa, i).applyMatrix4(m.matrix); if (Math.abs(digV.x - x) > r + 1 || Math.abs(digV.z - z) > r + 1) continue;
        const dd = dugAt(digV.x, digV.z, false) - dugAt(digV.x, digV.z, true); if (dd <= 1e-4) continue; digV.y -= dd; digV.applyMatrix4(digInv); pa.setXYZ(i, digV.x, digV.y, digV.z); ch = true; }
      if (ch) { pa.needsUpdate = true; g.computeBoundingSphere(); } } }
}

// ---------------------------------------------------------------- doors (Claude-Desktop 24/10): E opens and closes; a closed door blocks you and the zombies
// A door turns about its hinge (one end of its wide side). It is still an instance of the door InstancedMesh: opening rewrites its matrix.
const DOORS = []; const DOOR_CELL = new Map();
function buildDoors() {
  const box = new THREE.Box3();
  for (const [raw, a] of Object.entries(W.placements.door || {})) {
    const key = sanitize(raw); const g = geoFor(key, 0); if (!g) continue; if (!g.geo.boundingBox) g.geo.computeBoundingBox(); box.copy(g.geo.boundingBox).applyMatrix4(g.m);
    const alongX = box.max.x - box.min.x >= box.max.z - box.min.z; const len = alongX ? box.max.x - box.min.x : box.max.z - box.min.z, th = alongX ? box.max.z - box.min.z : box.max.x - box.min.x;
    const hinge = alongX ? new THREE.Vector3(box.min.x, 0, (box.min.z + box.max.z) / 2) : new THREE.Vector3((box.min.x + box.max.x) / 2, 0, box.min.z);
    for (let i = 0; i < a.length; i += 5) {
      const D = { id: raw.split('/').pop() + '#' + i / 5, a, i, gm: g.m, alongX, len: len * a[i + 4], th: th * a[i + 4], h: (box.max.y - box.min.y) * a[i + 4], hinge, ang: 0, want: 0, rot0: a[i + 3] };
      DOORS.push(D); const k = cellKey(Math.floor(a[i] / CELL), Math.floor(a[i + 2] / CELL)); if (!DOOR_CELL.has(k)) DOOR_CELL.set(k, []); DOOR_CELL.get(k).push(D);
    }
  }
}
const dQ = new THREE.Quaternion(), dM = new THREE.Matrix4(), dH = new THREE.Matrix4(), dR = new THREE.Matrix4(), dHi = new THREE.Matrix4();
function writeDoor(D) {
  const a = D.a, i = D.i; placeMatrix(a, i, dM); dH.makeTranslation(D.hinge.x, 0, D.hinge.z); dHi.makeTranslation(-D.hinge.x, 0, -D.hinge.z); dR.makeRotationY(D.ang);
  dM.multiply(dH).multiply(dR).multiply(dHi).multiply(D.gm);
  for (const g of groups) if (g.src === a) dM.toArray(g.mats, (i / 5) * 16);
  lastLodPos.set(1e9, 0, 0);
}
// the door as a segment on the ground: hinge -> free end (world)
function doorSeg(D, outA, outB) { const a = D.a, i = D.i, s = a[i + 4], r = a[i + 3];
  const hx = D.hinge.x * s, hz = D.hinge.z * s; const c = Math.cos(r), sn = Math.sin(r);
  outA.set(a[i] + hx * c + hz * sn, a[i + 1], a[i + 2] - hx * sn + hz * c);
  const dirL = D.alongX ? [Math.cos(D.ang), -Math.sin(D.ang)] : [Math.sin(D.ang), Math.cos(D.ang)];   // wide axis turned by the opening angle (about +Y)
  const dx = dirL[0] * c + dirL[1] * sn, dz = -dirL[0] * sn + dirL[1] * c; outB.set(outA.x + dx * D.len, outA.y, outA.z + dz * D.len); return outB; }
const dA = new THREE.Vector3(), dB = new THREE.Vector3();
function nearDoors(x, z) { const out = []; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL); for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const D of DOOR_CELL.get(cellKey(i, j)) || []) if (Math.abs(D.a[D.i] - x) < 4 && Math.abs(D.a[D.i + 2] - z) < 4) out.push(D); return out; }
function collideDoors(pos, r) {
  for (const D of nearDoors(pos.x, pos.z)) { if (pos.y > D.a[D.i + 1] + D.h || pos.y + 1.6 < D.a[D.i + 1]) continue; doorSeg(D, dA, dB);
    const ex = dB.x - dA.x, ez = dB.z - dA.z, l2 = ex * ex + ez * ez; let t = ((pos.x - dA.x) * ex + (pos.z - dA.z) * ez) / l2; t = Math.max(0, Math.min(1, t));
    const qx = dA.x + ex * t, qz = dA.z + ez * t; const dx = pos.x - qx, dz = pos.z - qz, d = Math.hypot(dx, dz), m = r + D.th / 2;
    if (d < m && d > 1e-5) { pos.x = qx + dx / d * m; pos.z = qz + dz / d * m; } }
}
function doorNear() { let best = null, bd = 1.6; for (const D of nearDoors(P.pos.x, P.pos.z)) { doorSeg(D, dA, dB); const mx = (dA.x + dB.x) / 2, mz = (dA.z + dB.z) / 2; const d = Math.hypot(mx - P.pos.x, mz - P.pos.z);
  if (d < bd && Math.abs(D.a[D.i + 1] - P.pos.y) < 1.6) { bd = d; best = D; } } return best ? { D: best, d: bd } : null; }
function toggleDoor(D) {
  if (Math.abs(D.want) > 0.01) { D.want = 0; sfx('door_close', { pos: P.pos, gain: 0.8 }); }
  else { doorSeg(D, dA, dB); const ex = dB.x - dA.x, ez = dB.z - dA.z; const side = (P.pos.x - dA.x) * ez - (P.pos.z - dA.z) * ex;   // open away from you
    D.want = side > 0 ? -1.62 : 1.62; sfx('door_open', { pos: P.pos, gain: 0.8 }); }
  markDirty();
}
function updateDoors(dt) { for (const D of DOORS) if (D.ang !== D.want) { const k = Math.min(1, dt * 5); D.ang += (D.want - D.ang) * k; if (Math.abs(D.want - D.ang) < 0.01) D.ang = D.want; writeDoor(D); } }

// ---------------------------------------------------------------- minigun rig (deployable defence)
function deployTurret(item) {   // item: a minigun case taken out of the inventory (B finds one in your grids)
  if (P.dead || !started || DRIVE) return; if (!MG) return;
  if (!item) { for (const g of gridsP()) for (const e of g.items) if (e.it.id === 'sd_minigun_case' && !item) { item = e.it; g.items.splice(g.items.indexOf(e), 1); } }
  if (!item) { toast('You have no minigun case'); return; }
  const fwd = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); const x = P.pos.x + fwd.x * 2.2, z = P.pos.z + fwd.z * 2.2;
  const bv = nearCells(x, z, 1); const y = groundAt(x, P.pos.y + 0.3, z, bv);
  placeTurret(x, y, z, P.yaw, item.ammo ?? 1500); toast('Minigun deployed'); afterChange();
}
function placeTurret(x, y, z, yaw, ammo = 1500) {
  const root = MG.scene.clone(true); root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.position.set(x, y, z); scene.add(root);
  const T = { root, base: root.getObjectByName('SD_minigun_rig_base'), yawN: root.getObjectByName('SD_minigun_rig_yaw'), pitchN: root.getObjectByName('SD_minigun_rig_pitch'),
    barrels: root.getObjectByName('SD_minigun_rig_barrels'), pos: new THREE.Vector3(x, y, z), ammo, yaw: yaw - Math.PI / 2, pitch: 0, spin: 0, acc: 0, target: null, retarget: 0, trunk: trunks.length };
  T.yawN.rotation.y = T.yaw; trunks.push(x, z, 0.55); TURRETS.push(T); return T;
}
function packTurret(T) {
  scene.remove(T.root); trunks[T.trunk + 2] = 0; TURRETS.splice(TURRETS.indexOf(T), 1); const it = make('sd_minigun_case'); it.ammo = T.ammo; addOrDrop(it); toast('Minigun packed up'); afterChange();
}
const tDir = new THREE.Vector3(), tMz = new THREE.Vector3(), tTgt = new THREE.Vector3();
function updateTurrets(dt) {
  for (const T of TURRETS) {
    T.retarget -= dt;
    if (T.retarget <= 0 || !T.target || T.target.dead) {
      T.retarget = 0.35; T.target = null; let bd = 42;
      for (const z of zombies) { if (z.dead) continue; const d = Math.hypot(z.pos.x - T.pos.x, z.pos.z - T.pos.z); if (d < bd) { bd = d; T.target = z; } }
    }
    let firingNow = false;
    if (T.target && T.ammo > 0) {
      const z = T.target; tTgt.set(z.pos.x, z.pos.y + 1.15, z.pos.z); const piv = T.pitchN.getWorldPosition(tMz);
      const dx = tTgt.x - piv.x, dz = tTgt.z - piv.z, dy = tTgt.y - piv.y; const want = Math.atan2(-dz, dx); const wp = Math.atan2(dy, Math.hypot(dx, dz));
      T.yaw = turn(T.yaw, want, dt * 2.6); T.pitch += Math.max(-dt * 1.5, Math.min(dt * 1.5, wp - T.pitch));
      const err = Math.abs(((want - T.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
      if (err < 0.12) firingNow = true;
    }
    T.spin = Math.min(1, Math.max(0, T.spin + (firingNow || T.target ? dt * 2.5 : -dt * 1.2)));
    T.yawN.rotation.y = T.yaw; T.pitchN.rotation.z = T.pitch; T.barrels.rotation.x += T.spin * dt * 45;
    if (firingNow && T.spin > 0.6) {
      T.acc += dt * 28;
      while (T.acc >= 1) {
        T.acc -= 1; T.ammo--; if (T.ammo <= 0) break; const z = T.target;
        tMz.set(0.66, 0, 0); T.barrels.localToWorld(tMz);
        const miss = Math.random() < 0.18; tTgt.set(z.pos.x + (Math.random() - 0.5) * (miss ? 1.2 : 0.3), z.pos.y + 0.6 + Math.random() * 0.9, z.pos.z + (Math.random() - 0.5) * (miss ? 1.2 : 0.3));
        if (!miss && !z.dead) z.hit(tDir.subVectors(tTgt, tMz).setY(0).normalize(), 19);
        if (Math.random() < 0.5) tracer(tMz, tTgt, 0.05);
      }
      flashLight.position.copy(tMz); flashLight.intensity = 4 + Math.random() * 3;
      T.snd = (T.snd || 0) - dt; if (T.snd <= 0) { T.snd = 0.07; sfx('gun_rifle_out_', { pos: T.pos, gain: 0.55, rate: 1.12, ref: 4, max: 160 }); }
    }
  }
}

// ---------------------------------------------------------------- horde
const SD_KEYS = ['Claude-Desktop_zombie_sd_worker', 'Claude-Desktop_zombie_sd_police', 'Claude-Desktop_zombie_sd_doctor', 'Claude-Desktop_zombie_sd_business', 'Claude-Desktop_zombie_sd_firefighter',
  'Claude-Desktop_zombie_sd_hunter', 'Claude-Desktop_zombie_sd_bloated', 'Claude-Desktop_zombie_sd_f_jogger', 'Claude-Desktop_zombie_sd_f_nurse', 'Claude-Desktop_zombie_sd_f_hiker'];
let hordeN = 0;
function horde(n = 12) {
  if (!started || P.dead) return; if (hordeN >= 4) { toast('Enough hordes for now'); return; } hordeN++;
  const a0 = P.look + Math.PI + (Math.random() - 0.5) * 0.8;
  for (let i = 0; i < n; i++) {
    const a = a0 + (Math.random() - 0.5) * 1.4, r = 32 + Math.random() * 12; const x = Math.min(635, Math.max(5, P.pos.x + Math.sin(a) * r)), z = Math.min(-5, Math.max(-635, P.pos.z + Math.cos(a) * r));
    const zz = new Zombie(SD_KEYS[Math.floor(Math.random() * SD_KEYS.length)], x, z, a + Math.PI); zz.state = 'chase'; zz.horde = true; zz.speed = 1.05 + Math.random() * 0.5; zombies.push(zz);
  }
  toast('A horde is coming!');
}

// ---------------------------------------------------------------- UI

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock(); const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3(), camRay = new THREE.Ray();
let fpsT = 0, fpsN = 0;
const PERF = { step: 0, render: 0, n: 0 }; const TEST = { dt: 0, norender: false };
function step() {
  const t0 = performance.now();
  const dt = TEST.dt || Math.min(clock.getDelta(), 0.05); frame++;   // TEST.dt: fixed step for headless tests
  if (!started) { renderer.render(scene, camera); return; }
  pumpBuild(1);
  const bv = nearCells(P.pos.x, P.pos.z, 1);
  // input -> move direction in camera space
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix += 1; if (keys.has('KeyD') || keys.has('ArrowRight')) ix -= 1;
  if (TOUCH) { ix -= stick.x; iz -= stick.y; }
  const climbing = tickClimb(dt);
  const il = Math.hypot(ix, iz); const moving = il > 0.15 && !P.dead && P.busy <= 0 && !DRIVE && !climbing; movingNow = moving;
  if (ACTION && moving) cancelAction('Interrupted');
  sprinting = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintT) && !P.crouch && !NEEDS.tired && NEEDS.stam > 0 && !((aiming || firing) && isGun());
  let speed = 0, clip = P.crouch ? 'Crouch_Idle_Loop' : 'Idle_Loop', ts = 1;
  if (moving) {
    const mx = ix / Math.max(il, 1), mz = iz / Math.max(il, 1); const ang = P.look + Math.atan2(mx, mz);
    P.yaw = turn(P.yaw, (aiming || firing) && isGun() ? P.look : ang, dt * 10);
    const mag = Math.min(il, 1);
    if (P.crouch) { speed = 1.3 * mag; clip = 'Crouch_Fwd_Loop'; ts = speed / 1.2; }
    else if (sprinting) { speed = 5.8; clip = 'Sprint_Loop'; ts = 1.0; }
    else if (P.walk || mag < 0.55) { speed = 1.5; clip = 'Walk_Loop'; ts = 1.05; }
    else { speed = 3.4; clip = 'Jog_Fwd_Loop'; ts = 1.0; }
    if ((aiming || firing) && isGun()) { speed = Math.min(speed, 1.7); ts = 1.0; }
    P.pos.x += Math.sin(ang) * speed * dt; P.pos.z += Math.cos(ang) * speed * dt;
    P.stepGain = P.crouch ? 0.22 : sprinting ? 0.95 : speed < 2 ? 0.45 : 0.7;
  }
  if (P.busy > 0) P.busy -= dt;
  if (!moving && (aiming || firing) && isGun()) P.yaw = turn(P.yaw, P.look, dt * 14);
  clip = weaponClip(clip, moving, sprinting); if (ACTION) clip = ACTION.anim; if (DRIVE) clip = 'Driving_Loop';
  if (!P.dead && !DRIVE && !P.climb) { collide(P.pos, 0.32, bv, P.crouch ? 0.92 : 1.6); collideCars(P.pos, 0.32); collideDoors(P.pos, 0.32); }
  // vertical
  const g = DRIVE || climbing ? P.pos.y : groundAt(P.pos.x, P.pos.y, P.pos.z, bv);
  if (!P.ground || P.vy > 0) { P.vy -= 13 * dt; P.pos.y += P.vy * dt; if (P.pos.y <= g && P.vy <= 0) { P.pos.y = g; P.vy = 0; P.ground = true; if (!P.dead) { P.actor.play('Jump_Land', 0.08, true, 1.4); footstep(1.0); footstep(0.8, 0.035); } P.busy = Math.max(P.busy, 0.18); } }
  else if (g < P.pos.y - 0.6) { P.ground = false; P.vy = 0; } else P.pos.y += (g - P.pos.y) * Math.min(1, dt * 18);
  if (!DRIVE && P.pos.y < W.water_z - 1.2) { P.pos.y = W.water_z - 1.2; }      // wading limit in the lake (no swimming yet)
  if (climbing) {} else if (!P.dead && P.busy <= 0 && P.ground) P.actor.play(clip, 0.22, false, ts);
  else if (!P.ground && !P.dead) { const js = P.actor.act('Jump_Start'); if (!(P.actor.cur === js && js.isRunning())) P.actor.play('Jump_Loop', 0.15); }
  P.actor.model.root.position.copy(P.pos); P.actor.model.root.rotation.y = P.yaw; P.actor.mixer.update(dt);
  if (moving && P.ground && !climbing && P.actor.cur) { P.actor.model.root.updateMatrixWorld(true); footsteps(P.actor.cur.getClip().name, P.stepGain || 0.6); }
  // camera: over the right shoulder, pulled in when a wall is behind; behind and above the car when driving
  camTarget.set(P.pos.x, P.pos.y + (DRIVE ? 1.9 : P.crouch ? 1.15 : 1.55), P.pos.z);
  const AIM = (aiming || firing) && isGun() && !DRIVE; const side = new THREE.Vector3(Math.cos(P.look), 0, -Math.sin(P.look)).multiplyScalar(DRIVE ? 0 : AIM ? -0.62 : -0.45);
  { const hd = heldDef(); const fov = AIM && hd.gun.zoom ? 62 / hd.gun.zoom : 62; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); } }
  camTarget.add(side);
  const back = new THREE.Vector3(Math.sin(P.look) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.look) * Math.cos(P.pitch)).multiplyScalar(-1);
  let dist = DRIVE ? 4 + DRIVE.len * 0.8 : AIM ? 2.0 : 3.4; camRay.origin.copy(camTarget); camRay.direction.copy(back);
  for (const b of bv) { const h = b.raycastFirst(camRay, THREE.DoubleSide); if (h && h.distance < dist + 0.25) dist = Math.max(0.6, h.distance - 0.25); }
  camPos.copy(camTarget).addScaledVector(back, dist); const gh = heightAt(camPos.x, camPos.z) + 0.3; if (camPos.y < gh) camPos.y = gh;
  camera.position.lerp(camPos, Math.min(1, dt * 14)); camera.lookAt(camTarget.x - back.x * 4, camTarget.y - back.y * 4, camTarget.z - back.z * 4);
  scene.userData.sky.position.copy(camera.position);
  // sun + shadows follow the player
  sun.target.position.copy(P.pos); sun.position.copy(P.pos).addScaledVector(SUN_DIR, 120);
  updateLods(P.pos, false); sfxFrame(dt);
  for (const z of zombies) { const d = z.pos.distanceTo(P.pos); z.update(dt, d < 60 ? nearCells(z.pos.x, z.pos.z, 0) : [], d); }
  for (const n of npcs) { const d = n.pos.distanceTo(P.pos); if (d < 80) n.a.mixer.update(dt); setLod(n.a.model, d < 22 ? 0 : d < 60 ? 1 : 2); }
  updateMech(dt);
  // HUD
  $('hp').firstElementChild.style.width = P.hp + '%'; $('hp-num').textContent = Math.round(P.hp);
  if (frame % 15 === 0) { const bx = P.pos.x, by = -P.pos.z; let best = null, bd = 1e9; for (const [k, v] of Object.entries(W.areas)) { const d = Math.hypot(v[0] - bx, v[1] - by); if (d < bd) { bd = d; best = k; } }
    $('place').textContent = bd < 140 ? AREA_NAMES[best] || best : 'Countryside'; fpsN++; }
  fpsT += dt; if (fpsT > 1) { $('coords').textContent = `x ${P.pos.x.toFixed(0)} · y ${(-P.pos.z).toFixed(0)} · ${Math.round(frame / fpsT)} fps`; fpsT = 0; frame = 0; }
  const t1 = performance.now(); if (!TEST.norender) renderer.render(scene, camera); PERF.step = t1 - t0; PERF.render = performance.now() - t1; PERF.n++;
}
renderer.setAnimationLoop(step);

// an add-on layout: { placements: {cat: {key: [x, y, z, rot, scale, ...]}}, clear: [[x0, z0, x1, z1, [cats]]], areas, npc_spawns, items, loot }
const ADD_CONT = {};
function mergeLayout(L) {
  for (const [x0, z0, x1, z1, cats] of L.clear || []) for (const c of cats || ['tree', 'plant', 'grass']) for (const [k, a] of Object.entries(W.placements[c] || {})) {
    const keep = []; for (let i = 0; i < a.length; i += 5) { const x = a[i], z = a[i + 2]; if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) continue; keep.push(...a.slice(i, i + 5)); }
    W.placements[c][k] = keep; }
  for (const [c, per] of Object.entries(L.placements || {})) for (const [k, a] of Object.entries(per)) { W.placements[c] = W.placements[c] || {}; W.placements[c][k] = (W.placements[c][k] || []).concat(a); }
  Object.assign(W.areas, L.areas || {}); W.npc_spawns.push(...(L.npc_spawns || [])); W.items = Object.assign(W.items || {}, L.items || {}); W.loot = (W.loot || []).concat(L.loot || []);
  for (const [k, v] of Object.entries(L.area_names || {})) AREA_NAMES[k] = v; Object.assign(ADD_CONT, L.containers || {});
}

// ---------------------------------------------------------------- saving (this browser only: localStorage; every 10 s when something changed, and when the page is hidden)
const SAVE_KEY = 'bam_save_v1'; let dirty = false, saveT = 0, SAVED = null;
function markDirty() { dirty = true; }
function snapshot() {
  return { v: 1, t: Date.now(), world: W.name,
    player: { pos: P.pos.toArray(), look: P.look, hp: P.hp, needs: { food: NEEDS.food, water: NEEDS.water, stam: NEEDS.stam, bleed: NEEDS.bleed, hot: NEEDS.hot }, inv: INV, hold: HOLD },
    conts: Object.fromEntries(CONTS.filter((c) => c.searched).map((c) => [c.id, c.g])),
    zombies: zombies.filter((z) => z.dead && z.idx < BASE_Z).map((z) => ({ i: z.idx, pos: z.pos.toArray(), rot: z.rot, g: z.cg || null, s: !!z.searched })),
    piles: PILES.filter((p) => p.g.items.length).map((p) => ({ id: p.id, pos: p.pos.toArray(), rot: p.rot, g: p.g })),
    mine: MYCORPSES.map((c) => ({ pos: c.pos.toArray(), yaw: c.yaw, g: c.g })),
    cars: CARS.map((V) => ({ id: V.id, a: V.a.slice(V.i, V.i + 5), fuel: V.fuel, hp: V.hp })),
    doors: DOORS.filter((D) => D.want).map((D) => [D.id, D.want]), digs: DIGS,
    turrets: TURRETS.map((T) => ({ pos: T.pos.toArray(), yaw: T.yaw + Math.PI / 2, ammo: T.ammo })) };
}
function save() { if (!started || P.dead) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); dirty = false; } catch (_) {} }
function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); const S = s ? JSON.parse(s) : null; return S && S.v === 1 ? S : null; } catch (_) { return null; } }
let BASE_Z = 1e9;
function corpseActor(pos, yaw, g) { const a = makeActor('Claude-Desktop_survivor_m_a'); const c = { pos, yaw, a, g, searched: true, name: 'Your body' };
  a.model.root.position.copy(pos); a.model.root.rotation.y = yaw; a.play('Death01', 0, true); a.mixer.update(5); syncCorpseVis(c); return c; }
function applySave(S) {
  const p = S.player; P.pos.fromArray(p.pos); P.look = p.look; P.yaw = p.look; P.hp = p.hp; Object.assign(NEEDS, p.needs); INV = p.inv; HOLD = p.hold || 'hands';
  for (const C of CONTS) if (S.conts[C.id]) { C.g = S.conts[C.id]; C.searched = true; }
  for (const d of S.zombies) { const z = zombies[d.i]; if (!z) continue; z.dead = true; z.hp = 0; z.pos.fromArray(d.pos); z.rot = d.rot; z.cg = d.g; z.g = d.g; z.searched = d.s; z.deadT = 10;
    z.a.play('Death01', 0, true); z.a.mixer.update(5); z.sync(); if (z.cg) syncCorpseVis(z); }
  for (const pl of [...PILES]) { pl.g.items.length = 0; pileVis(pl); }
  for (const d of S.piles) { const pl = newPile(new THREE.Vector3().fromArray(d.pos), d.id); pl.rot = d.rot; pl.g = d.g; pileVis(pl); }
  for (const d of S.mine) MYCORPSES.push(corpseActor(new THREE.Vector3().fromArray(d.pos), d.yaw, d.g));
  for (const d of S.cars) { const V = CARS.find((c) => c.id === d.id); if (!V) continue; for (let k = 0; k < 5; k++) V.a[V.i + k] = d.a[k]; V.fuel = d.fuel; V.hp = d.hp ?? V.hpMax; writeCar(V); }
  for (const d of S.turrets || []) placeTurret(d.pos[0], d.pos[1], d.pos[2], d.yaw, d.ammo);
  for (const [x, z] of S.digs || []) { applyDig(x, z, 0.35, 1.15); DIGS.push([x, z]); }
  for (const [id, w] of S.doors || []) { const D = DOORS.find((q) => q.id === id); if (D) { D.want = D.ang = w; writeDoor(D); } }
  nearCells(P.pos.x, P.pos.z, 1); pumpBuild(9); updateLods(P.pos, true); P.vy = 0; P.ground = false; syncPlayerVis(); hudWeapon(); toast('Game loaded');
}
addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------------------------------------------------------------- boot
(async function boot() {
  try {
    const st = $('status');
    W = JSON.parse(new TextDecoder().decode(await fetchBin('data/world.json')));
    { const hj = JSON.parse(new TextDecoder().decode(await fetchBin('data/heightmap.json'))); HM = new Uint16Array(b64ToBytes(hj.base64).buffer); }
    st.textContent = 'Loading terrain and buildings …';
    const packs = [['data/pack_terrain_near.json', 1], ['data/pack_terrain_far.json', 2], ['data/pack_world_lod0.json', 0], ['data/pack_world_lod1.json', 1],
      ['data/pack_nature_lod0.json', 0], ['data/pack_nature_lod1.json', 1], ['data/pack_nature_lod2.json', 2], ['data/pack_far.json', 1], ['data/pack_sd.json', 0], ['data/pack_items.json', 0], ['data/pack_bam_items.json', 0]];
    // add-ons: extra packs and layouts listed in data/addons.json (new assets dropped in without touching this file)
    let ADD = { packs: [], layouts: [] }; try { ADD = Object.assign(ADD, JSON.parse(new TextDecoder().decode(await fetchBin('data/addons.json')))); } catch (_) {}
    for (const p of ADD.packs || []) packs.push([p.file, p.lod || 0]);
    for (const lf of ADD.layouts || []) { try { mergeLayout(JSON.parse(new TextDecoder().decode(await fetchBin(lf)))); } catch (e) { console.warn('layout', lf, e); } }
    const charFiles = Object.keys(FILES).filter((f) => f.startsWith('chars/') || f.startsWith('gear/'));
    loadGLB('data/minigun.json').then((g) => (MG = g));
    const fetchJSON = async (f) => JSON.parse(new TextDecoder().decode(await fetchBin(f)));
    const [pk, chs, im, cd] = await Promise.all([Promise.all(packs.map(([f]) => loadGLB(f))), Promise.all(charFiles.map(loadGLB)), fetchJSON('data/item_models.json'), fetchJSON('data/containers.json')]);
    Object.assign(INFO, im); for (const [k, v] of Object.entries(W.items || {})) INFO['Claude-Desktop_' + k] = v; CDEF = Object.assign(cd, ADD_CONT);
    pk.forEach((g, i) => collectPack(g, packs[i][1]));
    charFiles.forEach((f, i) => { if (f.startsWith('gear/')) GEAR[f.slice(5, -5)] = chs[i]; else CH[f.slice(6, -5)] = chs[i]; });
    st.textContent = 'Building the world …'; await new Promise((r) => setTimeout(r, 30));
    fixOverlaps(); buildTerrain(); buildInstances(); indexColliders(); buildRoadGrid(); buildContainers(); buildCars(); buildDoors();
    calibrate(); P.actor = makeActor('Claude-Desktop_survivor_m_a'); P.actor.play('Idle_Loop', 0);
    spawnAll(); BASE_Z = zombies.length;
    // loot lying in the world (SD branch placements): one pile per thing, guns part-loaded
    const SD_N = { sd_ammo_9mm: 30, sd_ammo_shells: 12, sd_ammo_308: 20 };
    (W.loot || []).forEach((l, i) => { const id = SD_ID(l.key); const d = ITEMS[id]; if (!d) return; const R = rng(hash('loot' + i + SEED)); const it = withGrid(make(id, SD_N[id] || 1, R));
      if (d.gun) { if (d.gun.mag) it.m = Math.round(d.gun.cap * 0.6); else it.r = d.gun.cap; } if (d.mag) it.r = d.mag.cap;
      const hy = heightAt(l.pos[0], l.pos[2]); const pl = newPile(new THREE.Vector3(l.pos[0], l.pos[1] != null ? Math.max(l.pos[1], hy) : hy, l.pos[2]), 'L' + i); /* never under the terrain */ pl.rot = l.rot || 0; addToGrid(pl.g, it); pileVis(pl); });
    addToGrid(INV.pockets, make('bandage', 2)); addToGrid(INV.pockets, make('bottle')); addToGrid(INV.pockets, make('chocolate'));
    syncPlayerVis(); hudWeapon(); hudNeeds();
    SAVED = loadSave(); if (SAVED) { $('go').textContent = 'Continue'; $('go-new').hidden = false; }
    const places = $('places');
    for (const [k, v] of Object.entries(W.areas)) { const b = document.createElement('button'); b.type = 'button'; b.textContent = AREA_NAMES[k] || k;
      b.addEventListener('click', () => { teleport(v[0] + 6, -v[1] + 6); $('map').hidden = true; }); places.appendChild(b); }
    teleport(W.spawn[0], W.spawn[2], W.spawn[1]); P.look = W.spawn_look ?? Math.PI * 0.5; P.yaw = P.look;
    camera.position.set(P.pos.x - 3, P.pos.y + 2, P.pos.z); renderer.compile(scene, camera);
    st.textContent = `${zombies.length} zombies in the world. Ready.`; $('go').disabled = false; $('go').focus();
    window.__bam = { ready: true, SFX, surfaceAt: (x, z, y0 = 60) => { nearCells(x, z, 0); pumpBuild(9); const b2 = nearCells(x, z, 0); const y = groundAt(x, y0, z, b2); return [surfaceAt(x, y, z, b2), +y.toFixed(2)]; }, footstep, sfx, roadGrid: () => ROADGRID, TEST,
      sim: (n) => { TEST.dt = 0.05; TEST.norender = true; for (let i = 0; i < n; i++) step(); TEST.dt = 0; TEST.norender = false; }, camera, P, zombies, teleport, get INV() { return INV; }, get HOLD() { return HOLD; }, NEEDS, ITEMS, UI, CONTS, PILES, CARS, MYCORPSES,
      get DRIVE() { return DRIVE; }, get TARGET() { return findTarget(); }, interact, useItem, setHold, reload, enterCar, exitCar, corpseGrid, contGrid, make, addToGrid, save, loadSave, snapshot, hurt, die, keys,
      TURRETS, attack, deployTurret, placeTurret, horde, DOORS, STEP_TH, GRIP, dig, applyDig, DIGS, toggleDoor, W: () => W, groups, heightAt, trunks, cycleWeapon, MG: () => MG, setAim: (v) => (aiming = v), setFire: (v) => (firing = v), scene, renderer, PERF, cells, buildQueue: () => buildQueue.length,
      heavy: () => groups.map((g) => [g.cat, g.key.slice(-28), g.lod, g.mesh.count, (g.mesh.geometry.index ? g.mesh.geometry.index.count : g.mesh.geometry.attributes.position.count) / 3]).map((r) => [...r, r[3] * r[4]]).sort((a, b) => b[5] - a[5]).slice(0, 25) };
  } catch (e) { $('status').textContent = 'Error: ' + String(e.message || e).slice(0, 220); console.error(e); }
})();
$('inv-close').addEventListener('click', () => closeInv());
$('go-new').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} SAVED = null; $('go').click(); });
$('go').addEventListener('click', () => { $('start').hidden = true; started = true; clock.getDelta(); sfxStart(); if (SAVED) { try { applySave(SAVED); } catch (e) { console.warn('save', e); } SAVED = null; }
  if (!TOUCH) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) {} } });
