import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ================= Config / RNG =================
const Q = new URLSearchParams(location.search);
const SEED = Number(Q.get('seed')) || 1337;
const DEBUG = Q.has('debug'), VIEW = Q.get('view');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(SEED);
const rr = (a, b) => a + rand() * (b - a);
const pick = arr => arr[Math.floor(rand() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hash2(i, j, s) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s + SEED, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; }
function vnoise(x, z, s = 0) { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(i, j, s), hash2(i + 1, j, s), u), lerp(hash2(i, j + 1, s), hash2(i + 1, j + 1, s), u), v); }
function fbm(x, z, s = 0, oct = 4) { let a = 0, amp = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { a += amp * vnoise(x * f, z * f, s + o * 17); n += amp; amp *= 0.5; f *= 2.03; } return a / n; }

// ================= Renderer / scene =================
const isMobile = Q.has('mobile') || matchMedia('(pointer: coarse)').matches;
const scene = new THREE.Scene();
const FOG_COL = new THREE.Color(0xe9d2ab);
scene.fog = new THREE.Fog(FOG_COL, 34, 115);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 170);
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// golden-hour sun, low from the south-west
const SUN_DIR = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();
const sun = new THREE.DirectionalLight(0xffc68a, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe0f5, 0x8a6a42, 1.05);
scene.add(hemi);

// sky dome: warm horizon -> soft blue zenith, sun glow
{
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR }, top: { value: new THREE.Color(0x5f97cf) }, mid: { value: new THREE.Color(0xa9c9df) }, hor: { value: new THREE.Color(0xf2cf9c) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 sunDir, top, mid, hor; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h)); c = mix(c, top, smoothstep(0.25, 0.9, h));
        c = mix(c, hor * 0.92, smoothstep(0.0, -0.2, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0); c += vec3(1.0, 0.72, 0.4) * (pow(s, 8.0) * 0.35 + pow(s, 600.0) * 2.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), mat);
  sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
  window.__sky = sky;
}

// ================= World layout =================
const LAKE = { x: 16, z: 14, r: 19 };
const CAMP = { x: -8, z: -10, r: 8, h: 2.0 };
const WORLD_R = 96;
const PATHS = [
  [[-8, -10], [-1, -3], [5, 2]],                          // camp -> shore
  [[-8, -10], [-16, -22], [-15, -38], [-6, -58], [4, -80]], // north trail (cabin)
  [[-8, -10], [-24, -7], [-42, 2], [-64, -2]],              // west trail (car)
  [[5, 2], [30, -12], [50, -28], [66, -30]],                // east shore trail
];
const CABIN = { x: -10, z: -50, ry: 0.35 };
const CAR = { x: -46, z: 3.5, ry: 1.9 };
const ROCKS = { x: 44, z: -34 };
const GIANT = { x: -36, z: 30, ry: 0.6 };
const LANDMARK = { x: -30, z: -24 };
const CLEARINGS = [CAMP, { x: CABIN.x, z: CABIN.z, r: 9 }, { x: CAR.x, z: CAR.z, r: 8 }, { x: ROCKS.x, z: ROCKS.z, r: 9 }, { x: GIANT.x, z: GIANT.z, r: 9 }, { x: 46, z: 46, r: 11 }, { x: LANDMARK.x, z: LANDMARK.z, r: 6 }];
function distToSeg(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(px - (ax + t * dx), pz - (az + t * dz)); }
function pathDist(x, z) { let d = 1e9; for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, distToSeg(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])); return d; }
const lakeN = (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z) / LAKE.r; // 1 = waterline
const clearingW = (x, z) => { let w = 0; for (const c of CLEARINGS) w = Math.max(w, 1 - sstep(c.r * 0.7, c.r * 1.25, Math.hypot(x - c.x, z - c.z))); return w; };

// analytic height (sampled into the terrain mesh)
function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.022, z * 0.022, 1) - 0.5) * 7 + (fbm(x * 0.07, z * 0.07, 9) - 0.5) * 1.2;
  h += sstep(55, 98, r) * 10;                     // hills enclosing the valley
  const ln = lakeN(x, z);
  h = lerp(0.6 + (h - 0.6) * 0.25, h, sstep(1.15, 2.4, ln)) ; // flatter near shore
  if (ln < 1.6) { const bed = -2.6 * (1 - sstep(0.15, 1.0, ln)) + 0.05; h = lerp(bed, Math.max(h, 0.45), sstep(0.98, 1.55, ln)); }
  const dc = Math.hypot(x - CAMP.x, z - CAMP.z);
  h = lerp(h, CAMP.h + (fbm(x * 0.3, z * 0.3, 4) - 0.5) * 0.15, 1 - sstep(CAMP.r - 1, CAMP.r + 6, dc)); // plateau
  for (const c of CLEARINGS.slice(1)) { const d = Math.hypot(x - c.x, z - c.z); h = lerp(h, h * 0.8 + 0.2 * (h > 0 ? h : 0), 1 - sstep(c.r * 0.5, c.r, d)); }
  const pd = pathDist(x, z);
  h -= 0.28 * (1 - sstep(0.9, 2.6, pd));         // carved trail
  return h;
}
function forestMask(x, z) {
  let m = sstep(0.45, 0.62, fbm(x * 0.03, z * 0.03, 33));
  m *= sstep(1.25, 1.7, lakeN(x, z));
  m *= 1 - clearingW(x, z);
  m *= sstep(2.4, 5, pathDist(x, z));
  return m;
}

// ================= Terrain =================
const TSIZE = 230, TSEG = isMobile ? 120 : 150, TSTEP = TSIZE / TSEG, TN = TSEG + 1;
const HGRID = new Float32Array(TN * TN);
let terrain;
{
  const g = new THREE.PlaneGeometry(TSIZE, TSIZE, TSEG, TSEG); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const h = baseHeight(pos.getX(i), pos.getZ(i)); pos.setY(i, h); HGRID[i] = h; }
  g.computeVertexNormals();
  const nrm = g.attributes.normal, col = new Float32Array(pos.count * 3);
  const C = { grass: new THREE.Color(0x86ad48), grass2: new THREE.Color(0xa8b956), dry: new THREE.Color(0xc2b265), moss: new THREE.Color(0x5b7f35), dirt: new THREE.Color(0x9d7448), sand: new THREE.Color(0xd8bf8a), wet: new THREE.Color(0x8c7652), rock: new THREE.Color(0x8f8574) };
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    c.copy(C.grass).lerp(C.grass2, fbm(x * 0.08, z * 0.08, 5));
    c.lerp(C.dry, sstep(0.6, 0.8, fbm(x * 0.04, z * 0.04, 21)) * 0.7 + sstep(3, 9, y) * 0.3);
    c.lerp(C.moss, forestMask(x, z) * 0.75);
    const pd = pathDist(x, z); c.lerp(C.dirt, (1 - sstep(0.7, 2.1, pd)) * (0.75 + 0.25 * vnoise(x * 0.8, z * 0.8, 7)));
    const dc = Math.hypot(x - CAMP.x, z - CAMP.z); c.lerp(C.dirt, 0.6 * (1 - sstep(2, 6.5, dc)));
    const ln = lakeN(x, z); if (ln < 1.5) { c.lerp(C.sand, 1 - sstep(1.05, 1.35, ln) * (0.6 + 0.4 * vnoise(x, z, 3))); if (y < 0.05) c.lerp(C.wet, sstep(0.05, -0.6, y)); }
    c.lerp(C.rock, sstep(0.82, 0.68, nrm.getY(i)) * 0.8);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true; scene.add(terrain);
}
// exact height of the rendered triangle under (x,z)
function heightAt(x, z) {
  const gx = (x + TSIZE / 2) / TSTEP, gz = (z + TSIZE / 2) / TSTEP;
  const ix = clamp(Math.floor(gx), 0, TSEG - 1), iz = clamp(Math.floor(gz), 0, TSEG - 1), fx = gx - ix, fz = gz - iz;
  const a = HGRID[ix + TN * iz], b = HGRID[ix + TN * (iz + 1)], c = HGRID[ix + 1 + TN * (iz + 1)], d = HGRID[ix + 1 + TN * iz];
  return fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
}
// lowest ground under a footprint, so wide objects never float on slopes
function groundUnder(x, z, r) { let h = heightAt(x, z); if (r > 0.2) for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; h = Math.min(h, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return h; }


// ================= Shader grass field (one draw call, wraps around the player) =================
const windU = { uTime: { value: 0 } };
const grassU = { uTime: windU.uTime, uCenter: { value: new THREE.Vector2() } };
{
  // height + density map (R = height, G = grass density) sampled from the terrain grid
  const N = TN, data = new Uint16Array(N * N * 4);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const i = ix + iz * N, x = ix * TSTEP - TSIZE / 2, z = iz * TSTEP - TSIZE / 2;
    const dens = sstep(1.15, 1.35, lakeN(x, z)) * sstep(1.0, 2.2, pathDist(x, z)) * sstep(3.5, 6.5, Math.hypot(x - CAMP.x, z - CAMP.z)) * (1 - forestMask(x, z) * 0.55) * (0.55 + 0.45 * fbm(x * 0.06, z * 0.06, 55));
    data[i * 4] = THREE.DataUtils.toHalfFloat(HGRID[i]); data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(dens); data[i * 4 + 2] = 0; data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const hmap = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  hmap.magFilter = hmap.minFilter = THREE.LinearFilter; hmap.needsUpdate = true;
  grassU.uMap = { value: hmap };
  // clump of 5 tapered blades
  const pos = [], col = [], base = new THREE.Color(0x6d8f34), tip = new THREE.Color(0xd8d478);
  for (let b = 0; b < 6; b++) { const a = b / 6 * Math.PI * 2 + rand(), r = rr(0.02, 0.12), cx = Math.cos(a) * r, cz = Math.sin(a) * r, w = rr(0.05, 0.08), h = rr(0.6, 1.0), lean = rr(0.1, 0.3), ra = rand() * 6.28;
    const px = Math.cos(ra) * w, pz = Math.sin(ra) * w, lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + lx, h, cz + lz); col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b); }
  const blade = new THREE.InstancedBufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); blade.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const COUNT = isMobile ? 7000 : 14000, GR = isMobile ? 18 : 24; // tile half-size
  const offs = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) { offs[i * 4] = rr(-GR, GR); offs[i * 4 + 1] = rr(-GR, GR); offs[i * 4 + 2] = rand(); offs[i * 4 + 3] = rand() * 6.283; }
  blade.setAttribute('offs', new THREE.InstancedBufferAttribute(offs, 4)); blade.instanceCount = COUNT;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, grassU, { uGR: { value: GR }, uTS: { value: TSIZE } });
    sh.vertexShader = 'uniform float uTime, uGR, uTS; uniform vec2 uCenter; uniform sampler2D uMap; attribute vec4 offs; varying float vShade;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
        vec2 rel = mod(offs.xy - uCenter + uGR, 2.0 * uGR) - uGR; vec2 wp = uCenter + rel;
        vec4 m = texture2D(uMap, (wp + uTS * 0.5) / uTS);
        float fade = 1.0 - smoothstep(uGR * 0.65, uGR, length(rel));
        float s = step(offs.z, m.g) * fade * (0.55 + 0.6 * fract(offs.z * 7.13));
        float c = cos(offs.w), sn = sin(offs.w);
        vec3 transformed = vec3(c * position.x - sn * position.z, position.y, sn * position.x + c * position.z) * vec3(1.0, s * 0.62, 1.0) * step(0.001, s);
        float sway = (sin(uTime * 1.6 + wp.x * 0.35 + wp.y * 0.2) * 0.12 + sin(uTime * 3.7 + wp.x) * 0.03) * position.y;
        transformed.x += sway; transformed.z += sway * 0.5;
        transformed += vec3(wp.x, m.r - 0.02, wp.y);
        vShade = 0.85 + 0.3 * fract(offs.z * 13.7);`);
    sh.fragmentShader = 'varying float vShade;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vShade;').replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
  };
  const field = new THREE.Mesh(blade, mat); field.frustumCulled = false; field.receiveShadow = true; scene.add(field);
}

// ================= Water =================
const waterU = { uTime: { value: 0 } };
{
  const S = LAKE.r * 2.9, g = new THREE.PlaneGeometry(S, S, 56, 56); g.rotateX(-Math.PI / 2); g.translate(LAKE.x, 0, LAKE.z);
  const pos = g.attributes.position, depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) depth[i] = -heightAt(pos.getX(i), pos.getZ(i));
  g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, sunDir: { value: SUN_DIR }, shallow: { value: new THREE.Color(0x4fbfb0) }, deep: { value: new THREE.Color(0x15557e) }, skyc: { value: new THREE.Color(0xb9d4dc) } }]),
    vertexShader: `attribute float depth; uniform float uTime; varying float vD; varying vec3 vW; varying vec3 vN;
      #include <fog_pars_vertex>
      void main(){ vec3 p = position; float w1 = sin(p.x*0.55 + uTime*1.1) , w2 = cos(p.z*0.47 - uTime*0.9), w3 = sin((p.x+p.z)*1.3 + uTime*2.1);
        float amp = smoothstep(0.0, 1.2, depth); p.y += (w1*0.05 + w2*0.05 + w3*0.015) * amp;
        vN = normalize(vec3(-(cos(p.x*0.55+uTime*1.1)*0.0275 + cos((p.x+p.z)*1.3+uTime*2.1)*0.02)*amp, 1.0, (sin(p.z*0.47-uTime*0.9)*0.0235 - cos((p.x+p.z)*1.3+uTime*2.1)*0.02)*amp));
        vD = depth; vW = (modelMatrix*vec4(p,1.)).xyz; vec4 mvPosition = viewMatrix*vec4(vW,1.); gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 sunDir, shallow, deep, skyc; varying float vD; varying vec3 vW; varying vec3 vN;
      #include <fog_pars_fragment>
      void main(){ if (vD < -0.02) discard;
        vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN);
        vec3 col = mix(shallow, deep, smoothstep(0.05, 2.2, vD));
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col = mix(col, skyc, fres * 0.3);
        vec3 H = normalize(sunDir + V); col += vec3(1.0, 0.8, 0.55) * pow(max(dot(N, H), 0.0), 140.0) * 1.4;
        float foamLine = 1.0 - smoothstep(0.0, 0.18 + 0.06*sin(vW.x*1.7 + uTime*1.6) , vD);
        col = mix(col, vec3(0.97, 0.95, 0.88), foamLine * 0.75);
        float a = mix(0.6, 0.96, smoothstep(0.0, 1.0, vD)); a = max(a, foamLine * 0.8);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  waterU.mat = mat;
  const water = new THREE.Mesh(g, mat); water.renderOrder = 2; scene.add(water);
}

// ================= Placement =================
const placed = [];      // spacing records {x,z,r}
const colliders = [];   // {x,z,r}
const items = [];       // {def,x,z,ry,tilt,s|h,tint,sink}
function blocked(x, z, r, o = {}) {
  if (Math.hypot(x, z) > WORLD_R - 4) return true;
  if (lakeN(x, z) < (o.lakeMin ?? 1.12)) return true;
  if (o.path !== false && pathDist(x, z) < (o.pathPad ?? 2.2) + r) return true;
  if (o.clear !== false && clearingW(x, z) > 0.15) return true;
  for (const p of placed) { const dx = x - p.x, dz = z - p.z, m = r + p.r; if (dx * dx + dz * dz < m * m) return true; }
  return false;
}
function item(def, x, z, o = {}) { const it = { def, x, z, ry: o.ry ?? rand() * Math.PI * 2, tilt: o.tilt ?? 0, tiltZ: o.tiltZ ?? 0, size: o.size ?? rr(def.size[0], def.size[1]), tint: o.tint ?? rr(0.86, 1.1), sink: o.sink ?? def.sink ?? 0, yOff: o.yOff ?? 0 }; items.push(it); return it; }
function place(def, x, z, r, o = {}) { if (blocked(x, z, r, o)) return null; placed.push({ x, z, r }); const it = item(def, x, z, o); if (o.collide) colliders.push({ x, z, r: o.collide }); return it; }

const F = 'assets/lite/', E = 'assets/env/';
const broadNames = ['broadleaf_mature', 'broadleaf_mature_bushy', 'broadleaf_mature_dense', 'broadleaf_mature_irregular', 'broadleaf_mature_large_spreading', 'broadleaf_mature_large_wide_dense', 'broadleaf_mature_medium_rounded_healthy', 'broadleaf_mature_continuous_dense', 'broadleaf_leaning', 'broadleaf_sidebranches', 'broadleaf_wide_low', 'broadleaf_young_sparse', 'broadleaf_broken_regrowth'];
const pineNames = ['pine_mature', 'pine_mature_full_base', 'pine_mature_medium_bushy', 'pine_mature_tall_lean', 'pine_mature_tall_straight_dense', 'pine_windswept'];
// batch:true = forge palette assets -> one BatchedMesh (one draw call) with LOD1/LOD2 per instance
const D = {
  broad: broadNames.map(n => ({ url: F + 'trees/' + n + '.glb', batch: true, fit: 'h', size: [6.5, 10], wind: 1 })),
  pine: pineNames.map(n => ({ url: F + 'trees/' + n + '.glb', batch: true, fit: 'h', size: [9, 14], wind: 0.6 })),
  rock: { url: F + 'rocks/rock.glb', batch: true, fit: 'h', size: [0.5, 1.3], sink: 0.15 },
  rockC: { url: F + 'rocks/rock_cluster.glb', batch: true, fit: 'h', size: [0.35, 0.8], sink: 0.1 },
  stump: { url: F + 'wood/stump.glb', batch: true, fit: 'h', size: [0.35, 0.6] },
  stumpL: { url: F + 'wood/stump_large.glb', batch: true, fit: 'h', size: [0.6, 1.0] },
  log: { url: F + 'wood/log.glb', batch: true, fit: 'len', size: [2.4, 3.6], sink: 0.12 },
  bushA: { url: E + 'bush_a.glb', fit: 'h', size: [0.9, 1.6], cull: 60, shadow: false },
  bushB: { url: E + 'bush_b.glb', fit: 'h', size: [0.8, 1.4], cull: 60, shadow: false },
  bushF: { url: E + 'bush_common_flowers.glb', fit: 'h', size: [0.8, 1.3], cull: 45 },
  fern: { url: E + 'fern_1.glb', fit: 'h', size: [0.45, 0.8], cull: 40 },
  plant: { url: E + 'plant_1.glb', fit: 'h', size: [0.4, 0.7], cull: 35 },
  flowerY: { url: E + 'flower_4_group.glb', fit: 'h', size: [0.35, 0.55], cull: 32 },
  flowerR: { url: E + 'flower_3_group.glb', fit: 'h', size: [0.35, 0.55], cull: 32 },
  grass: { url: E + 'grass_common_tall.glb', fit: 'h', size: [0.35, 0.7], cull: 26 },
  mush: { url: E + 'mushroom_common.glb', fit: 'h', size: [0.15, 0.3], cull: 22 },
  car: { url: E + 'debris_brokencar.glb', fit: 'len', size: [4.3, 4.3], shadow: true, tint: 1 },
  crate: { url: E + 'crate.glb', fit: 'h', size: [0.6, 0.7], shadow: true },
  pallet: { url: E + 'pallet.glb', fit: 'len', size: [1.2, 1.2], shadow: true },
  gascan: { url: E + 'gascan.glb', fit: 'h', size: [0.45, 0.45], shadow: true },
  bag: { url: E + 'bag_canvas.glb', fit: 'h', size: [0.6, 0.6], shadow: true },
  lantern: { url: E + 'lantern_standing.glb', fit: 'h', size: [0.45, 0.45], shadow: false, emissive: true },
  fence: { url: E + 'fence_wood_straight.glb', fit: 'len', size: [2.0, 2.0], shadow: true },
};
const allTrees = [...D.broad, ...D.pine];

// --- focal points first (they reserve space) ---
// camp: fire, log ring, tent, crates, lantern, backpack, woodpile
const FIRE = { x: CAMP.x, z: CAMP.z };
placed.push({ x: CAMP.x, z: CAMP.z, r: CAMP.r });
colliders.push({ x: FIRE.x, z: FIRE.z, r: 0.75 });
const ringLogs = [[0.15, 2.7], [1.75, 2.4], [3.5, 2.5]];
for (const [a, len] of ringLogs) { const x = FIRE.x + Math.cos(a) * 2.7, z = FIRE.z + Math.sin(a) * 2.7; item(D.log, x, z, { ry: -a + Math.PI / 2, size: len, tint: 1, sink: 0.18 }); colliders.push({ x, z, r: 0.5 }); }
item(D.stump, FIRE.x + Math.cos(4.7) * 2.6, FIRE.z + Math.sin(4.7) * 2.6, { size: 0.5, tint: 1 });
for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; item(D.rock, FIRE.x + Math.cos(a) * 0.85, FIRE.z + Math.sin(a) * 0.85, { size: 0.3, sink: 0.25, tint: 0.85 }); }
const TENT = { x: CAMP.x - 4.6, z: CAMP.z + 3.2, ry: 2.6 };
colliders.push({ x: TENT.x, z: TENT.z, r: 1.6 });
const crateX = CAMP.x + 3.8, crateZ = CAMP.z + 3.4;
item(D.pallet, crateX, crateZ, { ry: 0.4, tint: 1 });
item(D.crate, crateX - 0.2, crateZ, { ry: 0.5, yOff: 0.14, tint: 1 }); item(D.crate, crateX + 0.45, crateZ + 0.2, { ry: 0.25, yOff: 0.14, size: 0.55, tint: 0.95 });
item(D.crate, crateX + 0.1, crateZ + 0.05, { ry: 0.8, yOff: 0.78, size: 0.5, tint: 1.05 });
colliders.push({ x: crateX, z: crateZ, r: 1.0 });
item(D.gascan, crateX + 1.2, crateZ - 0.6, { ry: 2.1, tint: 1 });
item(D.lantern, TENT.x + 1.9, TENT.z - 0.4, { ry: 0, tint: 1 });
item(D.bag, TENT.x + 1.3, TENT.z + 1.0, { ry: 2.4, tilt: 0.12, tint: 1 });
const WOOD = { x: CAMP.x + 1.5, z: CAMP.z - 4.6 };
for (const [dx, dy] of [[-0.21, 0], [0.21, 0], [0, 0.32]]) item(D.log, WOOD.x, WOOD.z + dx, { ry: 0, size: 1.8, yOff: dy, sink: 0, tint: 0.95 });
item(D.stumpL, WOOD.x + 2.0, WOOD.z + 0.6, { size: 0.65, tint: 1 }); colliders.push({ x: WOOD.x, z: WOOD.z, r: 1.0 }, { x: WOOD.x + 2, z: WOOD.z + 0.6, r: 0.6 });

// abandoned car with spilled crates, broken fence along the west trail
placed.push({ x: CAR.x, z: CAR.z, r: 4 });
item(D.car, CAR.x, CAR.z, { ry: CAR.ry, tilt: 0.03, tiltZ: -0.05 }); colliders.push({ x: CAR.x, z: CAR.z, r: 1.4 }, { x: CAR.x + Math.sin(CAR.ry) * 1.5, z: CAR.z + Math.cos(CAR.ry) * 1.5, r: 1.2 }, { x: CAR.x - Math.sin(CAR.ry) * 1.5, z: CAR.z - Math.cos(CAR.ry) * 1.5, r: 1.2 });
item(D.crate, CAR.x + 2.6, CAR.z + 1.4, { ry: 0.7, tilt: 0.3, tint: 0.9 }); item(D.gascan, CAR.x - 2.2, CAR.z + 2.0, { tilt: 1.45, ry: 1 }); item(D.bag, CAR.x + 1.4, CAR.z + 2.8, { tilt: 1.2, ry: 0.4 });
for (let i = 0; i < 7; i++) { if (i === 3 || i === 5) continue; const x = CAR.x - 6 + i * 2.0 * 0.95, z = CAR.z - 4.2 - i * 0.6; item(D.fence, x, z, { ry: Math.atan2(2.0 * 0.95, -0.6) - Math.PI / 2 + rr(-0.06, 0.06), tilt: i === 4 ? 0.35 : rr(-0.06, 0.06), tiltZ: i === 6 ? 0.5 : 0, tint: rr(0.8, 1.0) }); }

// ruined cabin on the north trail (built from log instances below)
placed.push({ x: CABIN.x, z: CABIN.z, r: 5.5 });
colliders.push({ x: CABIN.x, z: CABIN.z, r: 3.2 });
// rock formation on the east ridge
placed.push({ x: ROCKS.x, z: ROCKS.z, r: 6 });
for (const [dx, dz, s, t] of [[0, 0, 5.5, 0.15], [3.2, 1.8, 3.8, -0.2], [-2.6, 2.4, 3.2, 0.3], [1.5, -3, 2.6, 0.1], [-3.5, -1.5, 1.8, -0.3], [4.6, -1.6, 1.4, 0]]) {
  item(D.rock, ROCKS.x + dx, ROCKS.z + dz, { size: s, tilt: t, tiltZ: rr(-0.2, 0.2), sink: 0.22, tint: rr(0.9, 1.05) }); colliders.push({ x: ROCKS.x + dx, z: ROCKS.z + dz, r: s * 0.5 });
}
// fallen giant tree with its broken stump
placed.push({ x: GIANT.x, z: GIANT.z, r: 7 });
item(D.log, GIANT.x, GIANT.z, { ry: GIANT.ry, size: 13, sink: 0.25, tint: 0.95 });
for (let k = -2; k <= 2; k++) colliders.push({ x: GIANT.x + Math.cos(-GIANT.ry) * k * 2.6, z: GIANT.z + Math.sin(-GIANT.ry) * k * 2.6, r: 1.3 });
item(D.stumpL, GIANT.x + Math.cos(-GIANT.ry) * 8.2, GIANT.z + Math.sin(-GIANT.ry) * 8.2, { size: 1.6, tint: 0.95 });
// landmark tree on its own knoll
placed.push({ x: LANDMARK.x, z: LANDMARK.z, r: 5 });
item(D.broad[4], LANDMARK.x, LANDMARK.z, { size: 17, tint: 1.05, ry: 0.4 }); colliders.push({ x: LANDMARK.x, z: LANDMARK.z, r: 1.1 });

// --- forests: dense where the mask is high, single trees in meadows ---
for (let i = 0; i < 9000 && placed.length < 520; i++) {
  const x = rr(-WORLD_R, WORLD_R), z = rr(-WORLD_R, WORLD_R), m = forestMask(x, z);
  const north = sstep(0, -40, z);
  const p = m > 0.05 ? m : 0.012;
  if (rand() > p) continue;
  const def = rand() < 0.3 + 0.5 * north ? pick(D.pine) : pick(D.broad);
  const sz = m > 0.05 ? rr(...def.size) : rr(def.size[1] * 0.9, def.size[1] * 1.15); // lone meadow trees grow big
  place(def, x, z, m > 0.5 ? 2.6 : 3.4, { size: sz, collide: 0.55, tint: rr(0.85, 1.08) });
}
const treeSpots = placed.filter(p => p.r >= 2.6 && p.r < 4);
// forest-edge undergrowth: bushes + ferns around trees, denser at the edge
for (let i = 0; i < 520; i++) {
  const t = pick(treeSpots); const a = rand() * 6.283, d = rr(1.6, 4.2); const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
  const m = forestMask(x, z), edge = 1 - Math.abs(m - 0.45) * 1.6;
  if (rand() > 0.35 + edge * 0.6) continue;
  const r = rand(); const def = r < 0.38 ? (rand() < 0.5 ? D.bushA : D.bushB) : r < 0.48 ? D.bushF : r < 0.85 ? D.fern : r < 0.93 ? D.mush : D.plant;
  place(def, x, z, def === D.fern || def === D.mush ? 0.35 : 0.7, { pathPad: 1.0, clear: false, tint: rr(0.85, 1.12) });
}
// rocks, stumps and logs in the woods and along trails
for (let i = 0; i < 90; i++) { const x = rr(-90, 90), z = rr(-90, 90); const big = rand() < 0.12; place(rand() < 0.75 ? D.rock : D.rockC, x, z, big ? 1.8 : 0.8, { size: big ? rr(1.6, 2.8) : undefined, collide: big ? 1.0 : 0, pathPad: 1.2, tint: rr(0.85, 1.05) }); }
for (let i = 0; i < 40; i++) { const t = pick(treeSpots); const a = rand() * 6.283; place(rand() < 0.7 ? D.stump : D.stumpL, t.x + Math.cos(a) * 3, t.z + Math.sin(a) * 3, 0.7, { clear: false }); }
for (let i = 0; i < 26; i++) { const t = pick(treeSpots); const a = rand() * 6.283; const x = t.x + Math.cos(a) * 4, z = t.z + Math.sin(a) * 4; if (place(D.log, x, z, 1.7, { clear: false })) colliders.push({ x, z, r: 0.6 }); }
// shore stones and reeds-like grass
for (let i = 0; i < 40; i++) { const a = rand() * 6.283, d = LAKE.r * rr(1.0, 1.12); place(rand() < 0.6 ? D.rock : D.rockC, LAKE.x + Math.cos(a) * d, LAKE.z + Math.sin(a) * d, 0.6, { lakeMin: 0.97, path: false, clear: false, size: rr(0.35, 0.9), sink: 0.25 }); }
// meadow flowers in patches + grass tufts (never on trails / camp core / water)
for (let i = 0; i < 4800; i++) {
  const x = rr(-92, 92), z = rr(-92, 92);
  if (Math.hypot(x, z) > WORLD_R - 4 || lakeN(x, z) < 1.07 || pathDist(x, z) < 1.5 || Math.hypot(x - CAMP.x, z - CAMP.z) < 4.2) continue;
  const fp = fbm(x * 0.09, z * 0.09, 71);
  if (fp > 0.6 && forestMask(x, z) < 0.3) { if (rand() < 0.55) item(rand() < 0.55 ? D.flowerY : D.flowerR, x, z); }
  else if (rand() < 0.12) item(D.grass, x, z, { tint: rr(0.95, 1.3) });
  else if (rand() < 0.035 && forestMask(x, z) < 0.2 && Math.hypot(x - CAMP.x, z - CAMP.z) > 7) item(pick([D.bushA, D.bushB, D.fern, D.fern, D.plant]), x, z, { tint: rr(0.9, 1.15) });
}

// ================= Asset loading & instancing =================
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);

function toFloat(g) { // dequantize every attribute so transforms/merges are exact
  for (const k of Object.keys(g.attributes)) { const a = g.attributes[k]; if (a.array instanceof Float32Array && !a.normalized && !a.isInterleavedBufferAttribute) continue;
    const n = a.count, s = a.itemSize, out = new Float32Array(n * s); for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) out[i * s + c] = a.getComponent ? a.getComponent(i, c) : [a.getX(i), a.getY(i), a.getZ(i), a.getW(i)][c];
    g.setAttribute(k, new THREE.BufferAttribute(out, s)); }
  if (g.index && !(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
  return g;
}
function collect(root, lodSel) {
  root.updateMatrixWorld(true); const out = [];
  root.traverse(o => { if (!o.isMesh) return; const l = /_LOD(\d)/.exec(o.name); if (lodSel !== undefined && l && +l[1] !== lodSel) return;
    const g = toFloat(o.geometry.clone()); g.morphAttributes = {}; g.applyMatrix4(o.matrixWorld); out.push({ g, m: o.material }); });
  return out;
}
function keepAttrs(geos, names) { return geos.map(g => { for (const k of Object.keys(g.attributes)) if (!names.includes(k)) g.deleteAttribute(k);
  for (const k of names) if (!g.attributes[k]) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * (k === 'color' ? 3 : k === 'uv' ? 2 : k === 'normal' ? 3 : 1)).fill(k === 'color' ? 1 : 0), k === 'color' || k === 'normal' ? 3 : k === 'uv' ? 2 : 1));
  if (!g.index) { const idx = new Uint32Array(g.attributes.position.count); idx.forEach((_, i) => idx[i] = i); g.setIndex(new THREE.BufferAttribute(idx, 1)); } return g; }); }
function addWind(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU.uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float _wind_sway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 wp = vec3(0.0);
      #ifdef USE_BATCHING
        wp = batchingMatrix[3].xyz;
      #endif
      #ifdef USE_INSTANCING
        wp = instanceMatrix[3].xyz;
      #endif
      float ph = wp.x * 0.21 + wp.z * 0.17;
      float sw = _wind_sway;
      transformed.x += (sin(uTime * 1.3 + ph) * 0.06 + sin(uTime * 3.1 + ph * 2.0) * 0.015) * sw * position.y;
      transformed.z += cos(uTime * 1.05 + ph) * 0.04 * sw * position.y;`);
  };
  mat.customProgramCacheKey = () => 'wind';
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
function matrixFor(it, bb) {
  const sz = bb.getSize(new THREE.Vector3());
  const s = it.def.fit === 'len' ? it.size / Math.max(sz.x, sz.z) : it.size / sz.y;
  const foot = Math.min(Math.max(sz.x, sz.z) * s * 0.35, 3);
  const g = it.yOff ? heightAt(it.x, it.z) : groundUnder(it.x, it.z, foot);
  const y = g - bb.min.y * s - it.sink * sz.y * s + it.yOff;
  _e.set(it.tilt, it.ry, it.tiltZ, 'YXZ'); _q.setFromEuler(_e); _s.setScalar(s); _p.set(it.x, y, it.z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// ---- forge batch (one draw call for every tree, rock, stump and log) ----
const batchDefs = [...new Set(items.filter(i => i.def.batch).map(i => i.def))];
const batchItems = items.filter(i => i.def.batch);
let batch = null, farBatch = null; const batchGeo = new Map();
async function buildBatch() {
  const res = await Promise.all(batchDefs.map(d => Promise.all([loader.loadAsync(d.url), d.url.includes('/trees/') ? loader.loadAsync(d.url.replace('.glb', '_far.glb')) : null]).then(([g, f]) => [d, g, f]).catch(e => (console.warn('load fail', d.url, e), null))));
  const attrs = ['position', 'normal', 'color', '_wind_sway'];
  let V = 0, I = 0, FV = 0, FI = 0; const geos = [];
  const one = l => l.length > 1 ? mergeGeometries(l) : l[0];
  for (const r of res) { if (!r) continue; const [d, g, f] = r;
    const gn = one(keepAttrs(collect(g.scene, 1).map(x => x.g), attrs)), gm = one(keepAttrs(collect(g.scene, 2).map(x => x.g), attrs));
    let gf = gm; if (f) { const l = collect(f.scene).map(x => x.g); l.forEach(x => x.computeVertexNormals()); gf = one(keepAttrs(l, attrs)); }
    gn.computeBoundingBox(); geos.push([d, gn, gm, gf]);
    V += gn.attributes.position.count; I += gn.index.count; FV += gm.attributes.position.count + gf.attributes.position.count; FI += gm.index.count + gf.index.count; }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); addWind(mat);
  // near batch casts shadows; far batch (LOD2) does not -> shadow pass stays cheap
  batch = new THREE.BatchedMesh(batchItems.length + 4, V, I, mat); farBatch = new THREE.BatchedMesh(batchItems.length * 2 + 4, FV, FI, mat);
  batch.castShadow = true; batch.receiveShadow = true; farBatch.receiveShadow = true;
  for (const [d, gn, gm, gf] of geos) batchGeo.set(d, { near: batch.addGeometry(gn), mid: farBatch.addGeometry(gm), far: gf === gm ? -1 : farBatch.addGeometry(gf), bb: gn.boundingBox });
  for (const it of batchItems) {
    const G = batchGeo.get(it.def); if (!G) continue;
    it.matrix = matrixFor(it, G.bb); _c.setScalar(it.tint);
    it.nearId = batch.addInstance(G.near); batch.setMatrixAt(it.nearId, it.matrix); batch.setColorAt(it.nearId, _c);
    it.midId = farBatch.addInstance(G.mid); farBatch.setMatrixAt(it.midId, it.matrix); farBatch.setColorAt(it.midId, _c); farBatch.setVisibleAt(it.midId, false);
    if (G.far >= 0) { it.farId = farBatch.addInstance(G.far); farBatch.setMatrixAt(it.farId, it.matrix); farBatch.setColorAt(it.farId, _c); farBatch.setVisibleAt(it.farId, false); }
    it.big = (it.def.size[1] > 3) || it.size > 3;
  }
  scene.add(farBatch);
  scene.add(batch); updateLods(true);
}
// ---- textured CC0 props/plants: one InstancedMesh per sub-mesh, shared materials ----
const instGroups = [];
async function buildInstanced(def) {
  const list = items.filter(i => i.def === def); if (!list.length) return;
  const g = await loader.loadAsync(def.url);
  const parts = collect(g.scene);
  const bb = new THREE.Box3(); parts.forEach(p => { p.g.computeBoundingBox(); bb.union(p.g.boundingBox); });
  for (const it of list) it.matrix = matrixFor(it, bb);
  for (const p of parts) {
    const src = p.m; const mat = new THREE.MeshLambertMaterial({ map: src.map || null, color: def.cull ? src.color.clone().multiplyScalar(1.25) : src.color, vertexColors: !!src.vertexColors, side: THREE.DoubleSide, alphaTest: src.alphaTest || (src.transparent ? 0.5 : 0), emissive: def.emissive && /glass|light|fire|emiss/i.test(src.name || '') ? 0xffb050 : 0x000000, emissiveIntensity: 1.5 });
    if (def.emissive && src.emissiveMap) { mat.emissiveMap = src.emissiveMap; mat.emissive.set(0xffc070); }
    const im = new THREE.InstancedMesh(p.g, mat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.matrix); im.setColorAt(i, _c.setScalar(it.tint)); });
    im.castShadow = def.shadow ?? false; im.receiveShadow = true;
    im.computeBoundingSphere(); scene.add(im);
    instGroups.push({ im, list, cull: def.cull || 0 });
  }
  updateLods(true);
}

// ---- procedural A-frame tent with cloth sag ----
function buildTent() {
  const grp = new THREE.Group(); const L = 2.6, W = 1.35, H = 1.45, NU = 10, NV = 7;
  const verts = [], cols = [], idx = [];
  const canvas = new THREE.Color(0xc98a4b), shade = new THREE.Color(0x7d5a36), stripe = new THREE.Color(0x8a9a5b);
  const addSide = sgn => {
    const base = verts.length / 3;
    for (let v = 0; v <= NV; v++) for (let u = 0; u <= NU; u++) {
      const fu = u / NU, fv = v / NV;
      const sag = 0.17 * Math.sin(Math.PI * fu) * Math.sin(Math.PI * fv) + 0.03 * Math.sin(fu * 25) * fv;
      let x = sgn * (W * fv), y = H * (1 - fv), z = (fu - 0.5) * L * (1 + 0.08 * fv);
      x -= sgn * sag * 0.85; y -= sag * 0.5;
      verts.push(x, y, z); const c = (fv > 0.78 ? stripe.clone() : canvas.clone()).lerp(shade, fv * 0.35 + 0.08 * Math.sin(fu * 9) + sag * 1.5); cols.push(c.r, c.g, c.b);
    }
    for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) { const a = base + v * (NU + 1) + u, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  };
  addSide(1); addSide(-1);
  // back wall + half-open front flaps
  const tri = (pts, c) => { const b = verts.length / 3; pts.forEach(p => { verts.push(...p); cols.push(c.r, c.g, c.b); }); idx.push(b, b + 1, b + 2); };
  const back = canvas.clone().multiplyScalar(0.82), z0 = -L / 2 * 1.04;
  tri([[0, H, -L / 2], [-W, 0, z0], [W, 0, z0]], back);
  const zf = L / 2 * 1.04; tri([[0, H, L / 2], [W, 0, zf], [W * 0.75, 0, zf + 0.55]], canvas); tri([[0, H, L / 2], [-W * 0.75, 0, zf + 0.55], [-W, 0, zf]], canvas);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  const cloth = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); cloth.castShadow = cloth.receiveShadow = true; grp.add(cloth);
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  for (const z of [-L / 2 - 0.02, L / 2 + 0.02]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, H + 0.15, 6), wood); p.position.set(0, (H + 0.15) / 2, z); p.castShadow = true; grp.add(p); }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, L + 0.3, 5), wood); ridge.rotation.x = Math.PI / 2; ridge.position.y = H + 0.02; grp.add(ridge);
  // guy ropes
  const rp = []; for (const z of [-L / 2 - 0.02, L / 2 + 0.02]) { const s = Math.sign(z); rp.push(0, H + 0.1, z, 0, 0, z + s * 1.1); }
  const ropes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)), new THREE.LineBasicMaterial({ color: 0xd8c9a0 })); grp.add(ropes);
  grp.position.set(TENT.x, heightAt(TENT.x, TENT.z) - 0.04, TENT.z); grp.rotation.y = TENT.ry; scene.add(grp);
}
// ---- ruined log cabin (one InstancedMesh of logs + collapsed roof planks) ----
function buildCabin() {
  const logGeo = new THREE.CylinderGeometry(0.17, 0.19, 1, 7); logGeo.rotateZ(Math.PI / 2);
  const mats = []; const Wd = 5.2, Dp = 4.2, R = 0.36;
  const wallH = [7, 4, 6, 2]; // logs per wall: north intact-ish, east collapsed, south with door, west ruined
  const base = heightAt(CABIN.x, CABIN.z) - 0.1;
  const toWorld = (x, y, z, ry, len, tz = 0) => { const m = new THREE.Matrix4(); _e.set(0, CABIN.ry + ry, tz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), CABIN.ry).add(new THREE.Vector3(CABIN.x, base, CABIN.z)); _s.set(len, 1, 1); return m.compose(_p, _q, _s); };
  const walls = [[0, -Dp / 2, 0, Wd], [Wd / 2, 0, Math.PI / 2, Dp], [0, Dp / 2, 0, Wd], [-Wd / 2, 0, Math.PI / 2, Dp]];
  walls.forEach(([cx, cz, ry, len], w) => {
    for (let k = 0; k < wallH[w]; k++) {
      const y = 0.18 + k * R + (ry ? R / 2 : 0); let L = len + 0.7;
      if (w === 2 && k < 5) { // door gap in south wall
        for (const s of [-1, 1]) mats.push(toWorld(cx + s * (len / 4 + 0.35), y, cz, ry, len / 2 - 0.35));
        continue;
      }
      if (k === wallH[w] - 1 && w !== 0) L *= 0.55 + 0.3 * rand();
      mats.push(toWorld(cx + (w % 2 ? 0 : (rand() - 0.5) * 0.3), y, cz + (w % 2 ? (rand() - 0.5) * 0.3 : 0), ry, L));
    }
  });
  // fallen logs from the collapsed east wall
  for (let k = 0; k < 3; k++) mats.push(toWorld(Wd / 2 + 0.9 + k * 0.4, 0.18, -0.6 + k * 0.7, 0.5 + k * 0.4, 3.2));
  const im = new THREE.InstancedMesh(logGeo, new THREE.MeshLambertMaterial({ color: 0xb08a62 }), mats.length);
  mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, _c.setScalar(rr(0.75, 1.0))); });
  im.castShadow = im.receiveShadow = true; scene.add(im);
  // half-collapsed roof planks leaning in
  const plank = new THREE.BoxGeometry(0.28, 0.06, 3.0); const pm = [];
  for (let i = 0; i < 9; i++) { const x = -Wd / 2 + 0.4 + i * 0.32; const fallen = i > 5; pm.push(toWorld(x, fallen ? 0.9 : 2.25, fallen ? -0.4 : -0.7, 0, 1, 0)); const m = pm[pm.length - 1]; m.multiply(new THREE.Matrix4().makeRotationX(fallen ? 0.9 : 0.42)); }
  const roof = new THREE.InstancedMesh(plank, new THREE.MeshLambertMaterial({ color: 0x9a8068 }), pm.length);
  pm.forEach((m, i) => roof.setMatrixAt(i, m)); roof.castShadow = roof.receiveShadow = true; scene.add(roof);
}

// ---- campfire: model + flames + embers + flickering light ----
const fireLight = new THREE.PointLight(0xff8a35, 9, 14, 1.7);
const fireY = heightAt(FIRE.x, FIRE.z);
fireLight.position.set(FIRE.x, fireY + 1.1, FIRE.z); scene.add(fireLight);
const flames = new THREE.Group(); flames.position.set(FIRE.x, fireY + 0.12, FIRE.z); scene.add(flames);
{
  const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.7)) * 0.22 * (1 - t * 0.3), t * 0.9)); }
  const fg = new THREE.LatheGeometry(prof, 7);
  [[0xffd36b, 1.0, 0], [0xff8a2a, 1.25, 0.08], [0xff5a1a, 0.8, -0.1]].forEach(([c, s, o], i) => { const m = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.scale.set(s * 0.8, s, s * 0.8); m.position.x = o; m.position.z = -o * 0.7; m.userData.k = i; flames.add(m); });
}
const EMB = 60, embPos = new Float32Array(EMB * 3), embLife = new Float32Array(EMB), embVel = new Float32Array(EMB * 3);
const embGeo = new THREE.BufferGeometry(); embGeo.setAttribute('position', new THREE.BufferAttribute(embPos, 3));
const embers = new THREE.Points(embGeo, new THREE.PointsMaterial({ color: 0xffa040, size: 0.07, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
embers.frustumCulled = false; scene.add(embers);
function resetEmber(i) { embPos[i * 3] = FIRE.x + rr(-0.25, 0.25); embPos[i * 3 + 1] = fireY + 0.3; embPos[i * 3 + 2] = FIRE.z + rr(-0.25, 0.25); embVel[i * 3] = rr(-0.15, 0.15); embVel[i * 3 + 1] = rr(0.6, 1.5); embVel[i * 3 + 2] = rr(-0.15, 0.15); embLife[i] = rr(1.2, 3.2); }
for (let i = 0; i < EMB; i++) { resetEmber(i); embLife[i] *= rand(); }
async function placeCampfire() {
  const g = await loader.loadAsync('assets/props/campfire.glb'); const root = g.scene;
  const bb = new THREE.Box3().setFromObject(root), sz = bb.getSize(new THREE.Vector3()); const s = 1.5 / Math.max(sz.x, sz.z);
  root.scale.setScalar(s); root.position.set(FIRE.x, fireY - bb.min.y * s - 0.03, FIRE.z);
  root.traverse(o => { if (o.isMesh) { o.receiveShadow = true; } }); scene.add(root);
}

// ---- LOD / distance culling refresh ----
let lastLod = new THREE.Vector3(1e9, 0, 0);
function updateLods(force) {
  const p = player ? player.position : new THREE.Vector3(CAMP.x, 0, CAMP.z);
  if (!force && p.distanceToSquared(lastLod) < 6) return; lastLod.copy(p);
  if (batch) for (const it of batchItems) {
    if (it.nearId === undefined) continue; const d = Math.hypot(it.x - p.x, it.z - p.z);
    const nearD = it.big ? (isMobile ? 18 : 24) : 16;
    const near = d < nearD, inRange = d < (it.big ? 112 : 70), mid = !near && inRange && (it.farId === undefined || d < 50);
    batch.setVisibleAt(it.nearId, near); farBatch.setVisibleAt(it.midId, mid);
    if (it.farId !== undefined) farBatch.setVisibleAt(it.farId, !near && !mid && inRange);
  }
  for (const g of instGroups) {
    if (!g.cull) { g.im.count = g.list.length; continue; }
    // reorder visible instances to the front (only nearby small plants are drawn)
    let n = 0; for (const it of g.list) { if (Math.hypot(it.x - p.x, it.z - p.z) < g.cull) { g.im.setMatrixAt(n, it.matrix); g.im.setColorAt(n, _c.setScalar(it.tint)); n++; } }
    g.im.count = n; g.im.instanceMatrix.needsUpdate = true; if (g.im.instanceColor) g.im.instanceColor.needsUpdate = true; g.im.frustumCulled = false;
  }
}

let loadedOk = 0, loadFail = 0;
async function loadWorld() {
  buildTent(); buildCabin();
  const tasks = [buildBatch(), placeCampfire(), ...[...new Set(items.filter(i => !i.def.batch).map(i => i.def))].map(d => buildInstanced(d))];
  const r = await Promise.allSettled(tasks); r.forEach(x => x.status === 'fulfilled' ? loadedOk++ : (loadFail++, console.warn('[BAM] load failed', x.reason)));
  console.log('[BAM] world ready: groups ok', loadedOk, 'failed', loadFail, 'objects', items.length, 'colliders', colliders.length);
  window.__bamReady = true;
}

// ================= Player / zombies / gameplay =================
var player = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), new THREE.MeshLambertMaterial({ color: 0x3366aa }));
player.position.set(CAMP.x - 3.2, 0, CAMP.z - 3.4); player.castShadow = true; scene.add(player);
const camOffset = new THREE.Vector3(0, 3.2, 6);
let yaw = -2.25, pitch = 0.16;

const zombies = []; const zombieCountEl = document.getElementById('zombieCount'); let remaining = 5;
const zMat = () => new THREE.MeshLambertMaterial({ color: 0x6f7f5a });
function spawnZombie(x, z) { const zom = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 4, 8), zMat()); zom.position.set(x, heightAt(x, z) + 1.1, z); zom.castShadow = true; zom.userData = { speed: 1.2 + Math.random() * 0.6, health: 2, isZombie: true }; scene.add(zom); zombies.push(zom); }
// spawn at forest edges 22-40 m from camp, never in the lake
{ let n = 0; for (let i = 0; i < 4000 && n < 5; i++) { const a = rand() * 6.283, d = rr(22, 40); const x = CAMP.x + Math.cos(a) * d, z = CAMP.z + Math.sin(a) * d; const m = forestMask(x, z); if (m > 0.2 && m < 0.6 && lakeN(x, z) > 1.3 && !colliders.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 0.6)) { spawnZombie(x, z); n++; } } }
function updateCount() { zombieCountEl.textContent = remaining; } updateCount();

// spatial hash for colliders
const CELL = 8, cgrid = new Map();
function buildGrid() { cgrid.clear(); for (const c of colliders) { const k = Math.floor(c.x / CELL) + ',' + Math.floor(c.z / CELL); (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c); } }
buildGrid();
function collide(pos, rad) {
  const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = cgrid.get((cx + i) + ',' + (cz + j)); if (!l) continue;
    for (const c of l) { const ox = pos.x - c.x, oz = pos.z - c.z, d = Math.hypot(ox, oz), m = c.r + rad; if (d < m && d > 1e-4) { pos.x = c.x + ox / d * m; pos.z = c.z + oz / d * m; } } }
  const pd = Math.hypot(pos.x, pos.z); if (pd > WORLD_R - 5) { pos.x *= (WORLD_R - 5) / pd; pos.z *= (WORLD_R - 5) / pd; }
  const ln = lakeN(pos.x, pos.z); if (ln < 0.93) { const lx = pos.x - LAKE.x, lz = pos.z - LAKE.z, l = Math.hypot(lx, lz); pos.x = LAKE.x + lx / l * LAKE.r * 0.93; pos.z = LAKE.z + lz / l * LAKE.r * 0.93; }
}

const keys = {}; let moveX = 0, moveZ = 0, lookX = 0, lookY = 0;
function setupJoystick(joyEl, stickEl, onMove) {
  let active = false, sx, sy; const max = 50;
  joyEl.addEventListener('pointerdown', e => { active = true; sx = e.clientX; sy = e.clientY; joyEl.setPointerCapture(e.pointerId); });
  joyEl.addEventListener('pointermove', e => { if (!active) return; let dx = e.clientX - sx, dy = e.clientY - sy; const d = Math.hypot(dx, dy); if (d > max) { dx = dx / d * max; dy = dy / d * max; } stickEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; onMove(dx / max, dy / max); });
  const end = () => { active = false; stickEl.style.transform = 'translate(-50%, -50%)'; onMove(0, 0); };
  joyEl.addEventListener('pointerup', end); joyEl.addEventListener('pointercancel', end);
}
setupJoystick(document.getElementById('leftJoy'), document.getElementById('leftStick'), (x, y) => { moveX = x; moveZ = -y; });
setupJoystick(document.getElementById('rightJoy'), document.getElementById('rightStick'), (x, y) => { lookX = x; lookY = y; });
renderer.domElement.addEventListener('pointerdown', e => { if (e.clientX > innerWidth * 0.5) shoot(); });
const ray = new THREE.Raycaster();
function shoot() {
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch * 0.3, yaw, 0, 'YXZ'));
  ray.set(player.position.clone().add(new THREE.Vector3(0, 0.6, 0)), dir);
  const hits = ray.intersectObjects(zombies);
  if (hits.length) { const z = hits[0].object; z.userData.health--;
    if (z.userData.health <= 0) { scene.remove(z); zombies.splice(zombies.indexOf(z), 1); remaining--; updateCount(); if (remaining <= 0) document.getElementById('msg').textContent = 'Area clear for now. More will come...'; }
    else { z.material.color.set(0xaa4444); setTimeout(() => z.material.color.set(0x6f7f5a), 150); } }
}
addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

const clock = new THREE.Clock(); let health = 100; const healthEl = document.getElementById('health');
let frames = 0; const dbg = document.createElement('div');
if (DEBUG) { dbg.style.cssText = 'position:fixed;top:78px;left:10px;color:#fff;font:12px monospace;z-index:30;text-shadow:0 1px 2px #000'; document.body.appendChild(dbg); }
const VIEWS = {
  top: [[-60, 60, 70], [0, 0, -5]], camp: [[CAMP.x - 7, 3.2, CAMP.z + 6], [CAMP.x, 0.4, CAMP.z]],
  lake: [[CAMP.x + 2, 3, CAMP.z - 2], [LAKE.x, 0, LAKE.z]], car: [[CAR.x + 8, 2.5, CAR.z + 6], [CAR.x, 0.5, CAR.z]],
  cabin: [[CABIN.x + 9, 3, CABIN.z + 8], [CABIN.x, 1, CABIN.z]], rocks: [[ROCKS.x - 13, 2.5, ROCKS.z + 11], [ROCKS.x, 2, ROCKS.z]],
  meadow: [[CAMP.x + 10, 1.7, CAMP.z - 14], [CAMP.x + 16, 0.5, CAMP.z - 26]],
  giant: [[GIANT.x + 4, 5, GIANT.z + 16], [GIANT.x, 0.5, GIANT.z]], forest: [[-20, 2, -30], [-40, 3, -60]],
};
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  let dx = moveX, dz = moveZ;
  if (keys['w'] || keys['arrowup']) dz += 1; if (keys['s'] || keys['arrowdown']) dz -= 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1; if (keys['d'] || keys['arrowright']) dx += 1;
  yaw -= lookX * 2.5 * dt; pitch = clamp(pitch - lookY * 1.8 * dt, -0.6, 0.6);
  if (keys['q']) yaw += 1.5 * dt; if (keys['e']) yaw -= 1.5 * dt;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (dx || dz) player.position.add(fwd.multiplyScalar(dz).add(right.multiplyScalar(dx)).normalize().multiplyScalar(6 * dt));
  collide(player.position, 0.4);
  player.position.y = heightAt(player.position.x, player.position.z) + 1.0;
  updateLods(false);
  grassU.uCenter.value.set(VIEWS[VIEW] ? VIEWS[VIEW][1][0] : player.position.x, VIEWS[VIEW] ? VIEWS[VIEW][1][2] : player.position.z);

  const camPos = player.position.clone().add(camOffset.clone().applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')));
  camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 0.6);
  camera.position.copy(camPos); camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
  if (VIEWS[VIEW]) { const [a, b] = VIEWS[VIEW]; camera.position.set(a[0], heightAt(a[0], a[2]) + a[1], a[2]); camera.lookAt(b[0], heightAt(b[0], b[2]) + b[1], b[2]); }

  for (const z of zombies) {
    const tp = player.position.clone().sub(z.position); tp.y = 0; const d = tp.length();
    if (d > 1.2) { z.position.add(tp.normalize().multiplyScalar(z.userData.speed * dt)); collide(z.position, 0.4); z.position.y = heightAt(z.position.x, z.position.z) + 1.1; z.lookAt(player.position.x, z.position.y, player.position.z); }
    else if (d < 1.5 && health > 0) { health -= 8 * dt; healthEl.textContent = Math.max(0, Math.floor(health)); if (health <= 0) document.getElementById('msg').textContent = 'You died. Refresh to try again.'; }
  }
  // atmosphere
  windU.uTime.value = t; if (waterU.mat) waterU.mat.uniforms.uTime.value = t;
  fireLight.intensity = 8 + Math.sin(t * 13) * 1.0 + Math.sin(t * 7.3) * 0.8 + Math.sin(t * 23) * 0.4;
  flames.children.forEach(f => { const k = f.userData.k; f.scale.y = (k === 1 ? 1.25 : k === 0 ? 1 : 0.8) * (0.85 + 0.2 * Math.sin(t * (9 + k * 3) + k)); f.rotation.y = t * (0.6 + k * 0.3); });
  for (let i = 0; i < EMB; i++) { embLife[i] -= dt; if (embLife[i] <= 0) resetEmber(i); embPos[i * 3] += (embVel[i * 3] + Math.sin(t * 2 + i) * 0.2) * dt; embPos[i * 3 + 1] += embVel[i * 3 + 1] * dt; embPos[i * 3 + 2] += embVel[i * 3 + 2] * dt; }
  embGeo.attributes.position.needsUpdate = true;
  const focus = VIEWS[VIEW] ? new THREE.Vector3(...VIEWS[VIEW][1]) : player.position;
  sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN_DIR, 80);
  window.__sky.position.copy(camera.position);

  renderer.render(scene, camera);
  if (DEBUG && (frames++ % 10 === 0)) { const i = renderer.info.render; dbg.textContent = `calls ${i.calls} | tris ${(i.triangles / 1000).toFixed(0)}k | fps ${(1 / Math.max(dt, 1e-3)).toFixed(0)} | ready ${!!window.__bamReady}`; window.__bamStats = { calls: i.calls, triangles: i.triangles }; }
}
loadWorld();
animate();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
setTimeout(() => { const m = document.getElementById('msg'); if (m.textContent.includes('campsite')) m.textContent = 'Check your phone... messages are coming in.'; }, 4000);
if (DEBUG) window.__prof = () => {
  const out = []; const base = () => { renderer.info.reset(); renderer.info.autoReset = false; renderer.render(scene, camera); const r = { c: renderer.info.render.calls, t: renderer.info.render.triangles }; renderer.info.autoReset = true; return r; };
  const all = base(); out.push('ALL ' + JSON.stringify(all));
  for (const o of scene.children) { if (!o.visible) continue; o.visible = false; const r = base(); o.visible = true; const dt = all.t - r.t; if (dt > 3000 || all.c - r.c > 1) out.push((o.name || o.type) + ' ' + (o.geometry?.attributes?.position?.count || '') + ' calls ' + (all.c - r.c) + ' tris ' + dt + (o.material?.map ? ' tex' : '')); }
  return out.join('\n');
};
