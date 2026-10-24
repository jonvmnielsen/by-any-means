import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Inventory, buildUI, ITEMS } from './inventory.js';

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
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 175);
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

// distant ridges: a hazy mountain silhouette ring that follows the camera (no fog, 1 draw call)
const ridges = (() => {
  const N = 96, pos = [], col = [], near = new THREE.Color(0x7f9a82), far = new THREE.Color(0xb7c4c0), top = new THREE.Color(0xd9d2b8);
  const g = new THREE.BufferGeometry(), idx = [];
  for (let layer = 0; layer < 2; layer++) { const r = layer ? 140 : 128, base = pos.length / 3;
    for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const h = (layer ? 26 : 16) * (0.35 + fbm(Math.cos(a) * 3 + layer * 7, Math.sin(a) * 3, 77, 3)) + (layer ? 6 : 0);
      pos.push(Math.cos(a) * r, -6, Math.sin(a) * r, Math.cos(a) * r, h, Math.sin(a) * r);
      const c = (layer ? far : near).clone(); col.push(c.r, c.g, c.b); const t = c.clone().lerp(top, 0.35); col.push(t.r, t.g, t.b); }
    for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = -0.5; scene.add(m); return m;
})();

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
  const C = { grass: new THREE.Color(0x86ad48), grass2: new THREE.Color(0x96b850), dry: new THREE.Color(0xb7b062), moss: new THREE.Color(0x5b7f35), dirt: new THREE.Color(0x9d7448), sand: new THREE.Color(0xd8bf8a), wet: new THREE.Color(0x8c7652), rock: new THREE.Color(0x8f8574) };
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    c.copy(C.grass).lerp(C.grass2, fbm(x * 0.08, z * 0.08, 5));
    c.lerp(C.dry, sstep(0.6, 0.8, fbm(x * 0.04, z * 0.04, 21)) * 0.7 + sstep(3, 9, y) * 0.3);
    { const fm = forestMask(x, z); c.lerp(C.moss, fm * 0.75); c.multiplyScalar(1 - 0.32 * sstep(0.35, 1, fm)); }
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
  const pos = [], col = [], base = new THREE.Color(0x4a7d2a), tip = new THREE.Color(0xa9c95a);
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
  if (Math.hypot(x, z) > WORLD_R - 12) return true;
  if (lakeN(x, z) < (o.lakeMin ?? 1.12)) return true;
  if (o.path !== false && pathDist(x, z) < (o.pathPad ?? 2.2) + r) return true;
  if (o.clear !== false && clearingW(x, z) > 0.15) return true;
  for (const p of placed) { const dx = x - p.x, dz = z - p.z, m = r + p.r; if (dx * dx + dz * dz < m * m) return true; }
  return false;
}
function item(def, x, z, o = {}) { const it = { def, x, z, ry: o.ry ?? rand() * Math.PI * 2, tilt: o.tilt ?? 0, tiltZ: o.tiltZ ?? 0, size: o.size ?? rr(def.size[0], def.size[1]), tint: o.tint ?? rr(0.86, 1.1), sink: o.sink ?? def.sink ?? 0, yOff: o.yOff ?? 0, stretch: o.stretch, free: o.free }; items.push(it); return it; }
function segCol(ax, az, bx, bz, r) { colliders.push({ seg: 1, ax, az, bx, bz, x: (ax + bx) / 2, z: (az + bz) / 2, r }); }
function axisCol(x, z, ry, half, r) { const dx = Math.cos(ry) * half, dz = -Math.sin(ry) * half; segCol(x - dx, z - dz, x + dx, z + dz, r); }
const isTree = d => d.url && d.url.includes('/trees/');
const treeR = size => Math.max(0.35, size * 0.042); // trunk radius from real tree height
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
  hidebag: { url: E + 'bag_hide_forge.glb', fit: 'h', size: [0.5, 0.5], shadow: true },
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
axisCol(TENT.x, TENT.z, TENT.ry + Math.PI / 2, 1.1, 1.2);
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
item(D.car, CAR.x, CAR.z, { ry: CAR.ry, tilt: 0.03, tiltZ: -0.05 }); segCol(CAR.x + Math.sin(CAR.ry) * 1.5, CAR.z + Math.cos(CAR.ry) * 1.5, CAR.x - Math.sin(CAR.ry) * 1.5, CAR.z - Math.cos(CAR.ry) * 1.5, 1.0);
item(D.crate, CAR.x + 2.6, CAR.z + 1.4, { ry: 0.7, tilt: 0.3, tint: 0.9 }); item(D.gascan, CAR.x - 2.2, CAR.z + 2.0, { tilt: 1.45, ry: 1 }); item(D.hidebag, CAR.x + 1.4, CAR.z + 2.8, { tilt: 1.2, ry: 0.4 });
for (let i = 0; i < 7; i++) { if (i === 3 || i === 5) continue; const x = CAR.x - 6 + i * 2.0 * 0.95, z = CAR.z - 4.2 - i * 0.6; axisCol(x, z, Math.atan2(2.0 * 0.95, -0.6) - Math.PI / 2, 1.0, 0.2); item(D.fence, x, z, { ry: Math.atan2(2.0 * 0.95, -0.6) - Math.PI / 2 + rr(-0.06, 0.06), tilt: i === 4 ? 0.35 : rr(-0.06, 0.06), tiltZ: i === 6 ? 0.5 : 0, tint: rr(0.8, 1.0) }); }

// story clue: someone was dragged from the car into the north-west woods
const TRAIL = [];
{ let x = CAR.x + 2.5, z = CAR.z - 1.5, a = -2.3; for (let i = 0; i < 26; i++) { a += rr(-0.25, 0.25); x += Math.cos(a) * 0.9; z += Math.sin(a) * 0.9; TRAIL.push([x, z, rr(0.25, 0.6) * (1 - i / 40), rand() * 6.28]); }
  const end = TRAIL[TRAIL.length - 1]; item(D.hidebag, end[0] + 0.6, end[1] + 0.3, { tilt: 1.3, ry: 0.8, tint: 0.85 }); item(D.lantern, end[0] - 0.8, end[1] + 0.5, { tiltZ: 1.45, ry: 2, yOff: 0.15 }); }
const CLUES = [[CAMP.x + 6.5, CAMP.z + 5.5, 0.35, 0], [CAMP.x + 7.2, CAMP.z + 6.6, 0.25, 1]];
// ruined cabin on the north trail (built from log instances below)
placed.push({ x: CABIN.x, z: CABIN.z, r: 5.5 });
// rock formation on the east ridge
placed.push({ x: ROCKS.x, z: ROCKS.z, r: 6 });
for (const [dx, dz, h, sx, t, tz] of [[0, 0, 9.5, 0.55, 0.06, -0.05], [2.4, 1.2, 7.2, 0.5, -0.12, 0.1], [-2.2, 1.6, 6.0, 0.6, 0.1, 0.16], [1.0, -2.4, 5.0, 0.7, 0.18, -0.1], [-3.4, -1.2, 3.4, 0.8, -0.2, -0.2], [4.2, -1.0, 2.6, 1.0, 0.1, 0.25], [-1.0, 3.6, 2.2, 1.1, 0.0, 0.1]]) {
  item(D.rock, ROCKS.x + dx, ROCKS.z + dz, { size: h, stretch: [sx, 1, sx * rr(0.8, 1.1)], tilt: t, tiltZ: tz, ry: rand() * 6.28, sink: 0.12, tint: rr(0.88, 1.02) }); colliders.push({ x: ROCKS.x + dx, z: ROCKS.z + dz, r: Math.max(0.8, h * sx * 0.22) });
}
for (let i = 0; i < 10; i++) { const a = rand() * 6.28, d = rr(5, 8); item(rand() < 0.5 ? D.rock : D.rockC, ROCKS.x + Math.cos(a) * d, ROCKS.z + Math.sin(a) * d, { size: rr(0.4, 1.4), sink: 0.2 }); }
// fallen giant tree with its broken stump
placed.push({ x: GIANT.x, z: GIANT.z, r: 7 });
const GDIR = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(-Math.PI / 2 + 0.05, GIANT.ry, 0, 'YXZ'));
{ const ry = GIANT.ry, fdir = GDIR;
  // bare trunk (stretched stump mesh lying along GDIR) + snapped top section + a few dead limbs: reads as a trunk, not a foliage blob
  item(D.stumpL, GIANT.x, GIANT.z, { ry, tilt: -Math.PI / 2 + 0.05, size: 13, stretch: [0.12, 1, 0.12], free: true, yOff: 0.85, tint: 0.8 });
  const tp = 13.6; item(D.stumpL, GIANT.x + fdir.x * tp, GIANT.z + fdir.z * tp, { ry: ry + 0.35, tilt: -Math.PI / 2 + 0.02, size: 6, stretch: [0.17, 1, 0.17], free: true, yOff: 0.6, tint: 0.78 });
  for (let k = 0; k < 5; k++) { const t = 4 + k * 2.3, sd = k % 2 ? 1 : -1; item(D.log, GIANT.x + fdir.x * t - fdir.z * sd * 1.2, GIANT.z + fdir.z * t + fdir.x * sd * 1.2, { ry: ry + sd * rr(0.6, 1.1), tilt: rr(0.1, 0.5), size: rr(1.6, 2.6), free: true, yOff: rr(0.2, 0.7), tint: 0.75 }); }
  for (let k = 0; k < 3; k++) segCol(GIANT.x + fdir.x * k * 6.4, GIANT.z + fdir.z * k * 6.4, GIANT.x + fdir.x * (k + 1) * 6.4, GIANT.z + fdir.z * (k + 1) * 6.4, 0.8); colliders.push({ x: GIANT.x - fdir.x * 0.6, z: GIANT.z - fdir.z * 0.6, r: 1.5 });
  item(D.stumpL, GIANT.x - fdir.x * 0.6, GIANT.z - fdir.z * 0.6, { ry, tilt: -Math.PI / 2 + 0.25, size: 1.0, stretch: [1.6, 1, 1.6], free: true, yOff: 1.1, tint: 0.9 });
  for (let i = 0; i < 6; i++) item(D.rockC, GIANT.x - fdir.x * rr(1, 2) + rr(-1, 1), GIANT.z - fdir.z * rr(1, 2) + rr(-1, 1), { size: rr(0.25, 0.5), sink: 0.2 }); }
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
  place(def, x, z, m > 0.5 ? 2.6 : 3.4, { size: sz, collide: treeR(sz), tint: rr(0.85, 1.05) * (1 - 0.28 * sstep(0.4, 1, m)) });
}
// tree wall around the playable area hides the world edge
for (let i = 0; i < 2200; i++) { const a = rand() * 6.283, d = rr(WORLD_R - 10, WORLD_R + 14), x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (lakeN(x, z) < 1.3 || pathDist(x, z) < 2) continue; let ok = true; for (const p of placed) if ((x - p.x) ** 2 + (z - p.z) ** 2 < 2.8 * 2.8) { ok = false; break; }
  if (!ok) continue; placed.push({ x, z, r: 2.8 }); const def = rand() < 0.65 ? pick(D.pine) : pick(D.broad); const wsz = rr(def.size[1] * 0.9, def.size[1] * 1.25); item(def, x, z, { size: wsz, tint: rr(0.7, 0.9) }).wall = 1; colliders.push({ x, z, r: treeR(wsz) }); }
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
for (let i = 0; i < 90; i++) { const x = rr(-90, 90), z = rr(-90, 90); const big = rand() < 0.12; place(rand() < 0.75 ? D.rock : D.rockC, x, z, big ? 1.8 : 0.8, { size: big ? rr(1.6, 2.8) : undefined, collide: big ? 1.0 : 0.45, pathPad: 1.2, tint: rr(0.85, 1.05) }); }
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
  const st = it.stretch || [1, 1, 1];
  const s = it.def.fit === 'len' ? it.size / Math.max(sz.x, sz.z) : it.size / (sz.y * st[1]);
  const foot = Math.min(Math.max(sz.x * st[0], sz.z * st[2]) * s * 0.35, 3);
  const g = it.yOff || it.free ? heightAt(it.x, it.z) : groundUnder(it.x, it.z, foot);
  const y = g - (it.free ? 0 : bb.min.y * s * st[1]) - it.sink * sz.y * s * st[1] + it.yOff;
  _e.set(it.tilt, it.ry, it.tiltZ, 'YXZ'); _q.setFromEuler(_e); _s.set(s * st[0], s * st[1], s * st[2]); _p.set(it.x, y, it.z);
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
    let gn = one(keepAttrs(collect(g.scene, 1).map(x => x.g), attrs)), gm = one(keepAttrs(collect(g.scene, 2).map(x => x.g), attrs));
    let gf = gm; if (f) { const l = collect(f.scene).map(x => x.g); l.forEach(x => x.computeVertexNormals()); gf = one(keepAttrs(l, attrs)); }
    if (d.url.includes('/rocks/')) { const flat = q => { const n = q.toNonIndexed(); n.computeVertexNormals(); n.setIndex([...Array(n.attributes.position.count).keys()]); return n; }; gn = flat(gn); gm = gf = flat(gm); } // faceted rocks
    gn.computeBoundingBox(); geos.push([d, gn, gm, gf]);
    V += gn.attributes.position.count; I += gn.index.count; FV += gm.attributes.position.count + gf.attributes.position.count; FI += gm.index.count + gf.index.count; }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); addWind(mat);
  // near batch casts shadows; far batch (LOD2) does not -> shadow pass stays cheap
  batch = new THREE.BatchedMesh(batchItems.length + 96, V, I, mat); farBatch = new THREE.BatchedMesh(batchItems.length * 2 + 4, FV, FI, mat);
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
function buildDecals() { // flat blood splats (one instanced draw call)
  const g = new THREE.CircleGeometry(1, 9); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; for (let i = 1; i < p.count; i++) { const k = rr(0.6, 1.25); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  const all = [...TRAIL, ...CLUES]; const extra = []; for (const [x, z, s] of TRAIL) if (rand() < 0.5) extra.push([x + rr(-0.4, 0.4), z + rr(-0.4, 0.4), s * 0.4, rand() * 6]);
  const L = [...all, ...extra];
  const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x6e120c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), L.length);
  L.forEach(([x, z, s, r], i) => { _e.set(0, r, 0); _q.setFromEuler(_e); _p.set(x, heightAt(x, z) + 0.03, z); _s.set(s, 1, s * rr(0.6, 1.4)); im.setMatrixAt(i, new THREE.Matrix4().compose(_p, _q, _s)); im.setColorAt(i, _c.setScalar(rr(0.7, 1.1))); });
  im.receiveShadow = true; im.renderOrder = 1; scene.add(im);
}
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
  const rp = []; for (const z of [-L / 2 - 0.02, L / 2 + 0.02]) { const s = Math.sign(z); rp.push(0, H + 0.1, z, 0, 0.12, z + s * 1.1); }
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) { const zz = -L / 2 + 0.2 + i * (L - 0.4) / 5; rp.push(sx * W * 0.55, H * 0.45, zz, sx * (W + 0.12), 0.12, zz); }
  const ropes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)), new THREE.LineBasicMaterial({ color: 0xd8c9a0 })); grp.add(ropes);
  const stake = new THREE.CylinderGeometry(0.02, 0.012, 0.3, 4);
  const sk = new THREE.InstancedMesh(stake, wood, 14); let si = 0; const o3 = new THREE.Object3D();
  for (const z of [-L / 2 - 1.12, L / 2 + 1.12]) { o3.position.set(0, 0.1, z); o3.rotation.set(Math.sign(z) * 0.4, 0, 0); o3.updateMatrix(); sk.setMatrixAt(si++, o3.matrix); }
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) { o3.position.set(sx * (W + 0.12), 0.08, -L / 2 + 0.2 + i * (L - 0.4) / 5); o3.rotation.set(0, 0, sx * -0.3); o3.updateMatrix(); sk.setMatrixAt(si++, o3.matrix); }
  grp.add(sk);
  const tarp = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 0.3, L + 0.9), new THREE.MeshLambertMaterial({ color: 0x4f5f3a, polygonOffset: true, polygonOffsetFactor: -2 }));
  tarp.rotation.x = -Math.PI / 2; tarp.position.set(0, 0.03, 0.25); tarp.receiveShadow = true; grp.add(tarp);
  const bed = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.5, 3, 8), new THREE.MeshLambertMaterial({ color: 0x3c6e8f })); bed.rotation.x = Math.PI / 2; bed.scale.set(1, 1, 0.45); bed.position.set(0.35, 0.14, 0.35); bed.castShadow = true; grp.add(bed);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0xd9cfb4 })); pillow.position.set(0.35, 0.12, -0.75); grp.add(pillow);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0x4a4a4a })); pot.position.set(-0.9, 0.1, L / 2 + 0.75); pot.castShadow = true; grp.add(pot);
  grp.position.set(TENT.x, heightAt(TENT.x, TENT.z) - 0.04, TENT.z); grp.rotation.y = TENT.ry; scene.add(grp);
}
// ---- ruined log cabin (one InstancedMesh of logs + collapsed roof planks) ----
function buildCabin() {
  // Proper log cabin: interlocking notched logs with overhangs and cut ends, gable ends, plank roof with a
  // collapsed hole, open door, broken windows, stone chimney and a porch. 3 instanced draw calls.
  const W = 6.2, Dp = 4.8, R = 0.2, ROWS = 9, OH = 0.4;
  const base = groundUnder(CABIN.x, CABIN.z, 3.5) - 0.05;
  const up = new THREE.Vector3(0, 1, 0), origin = new THREE.Vector3(CABIN.x, base, CABIN.z);
  const M = (x, y, z, ry, sx, sy, sz, rx = 0, rz = 0) => { _e.set(rx, CABIN.ry + ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z).applyAxisAngle(up, CABIN.ry).add(origin); _s.set(sx, sy, sz); return new THREE.Matrix4().compose(_p, _q, _s); };
  const logs = [], planks = [], stones = [];
  const logAt = (x, y, z, alongX, len, broken = 0) => logs.push(M(x, y, z, alongX ? 0 : Math.PI / 2, len, 1, 1, 0, broken));
  const topY = ROWS * R * 1.8;
  for (let k = 0; k < ROWS; k++) {
    const yA = R + k * R * 1.8, yB = yA + R * 0.9; // front/back rows and side rows interleave (notched corners)
    // front wall (z = +Dp/2): door gap and window gap
    const fz = Dp / 2;
    if (k < 6) { logAt(-W / 4 - 0.35 - OH / 2, yA, fz, true, W / 2 - 0.7 + OH); if (k < 3 || k > 4) logAt(W / 4 + 0.35 + OH / 2, yA, fz, true, W / 2 - 0.7 + OH); else { logAt(0.9, yA, fz, true, 0.7); logAt(W / 2 - 0.1, yA, fz, true, 0.9); } }
    else logAt(0, yA, fz, true, W + OH * 2);
    // back wall: collapsed upper corner on the east side
    if (k < 6 || rand() < 0.3) logAt(0, yA, -Dp / 2, true, W + OH * 2); else logAt(-W * 0.22, yA, -Dp / 2, true, W * 0.56 + OH);
    // west side wall (with window) and east side wall (top rows fallen)
    if (k < 3 || k > 4) logAt(-W / 2, yB, 0, false, Dp + OH * 2); else { logAt(-W / 2, yB, -Dp / 4 - 0.4, false, Dp / 2 - 0.4); logAt(-W / 2, yB, Dp / 4 + 0.6, false, Dp / 2 - 0.6); }
    if (k < 6) logAt(W / 2, yB, 0, false, Dp + OH * 2); else if (k < 8) logAt(W / 2, yB, Dp * 0.18, false, Dp * 0.6);
  }
  // gable triangles on both side walls
  const gH = 1.9, gRows = 6;
  for (let k = 0; k < gRows; k++) { const f = 1 - (k + 0.5) / gRows, len = Dp * f + 0.2, y = topY + R + k * R * 1.75; logAt(-W / 2, y, 0, false, len); if (k < 3) logAt(W / 2, y, 0, false, len); }
  // ridge + purlins
  logs.push(M(0, topY + gH + 0.15, 0, 0, W + 1.0, 0.9, 0.9));
  for (const zz of [-Dp / 4, Dp / 4]) logs.push(M(-0.2, topY + gH / 2 + 0.1, zz, 0, W * (zz < 0 ? 0.62 : 1.05), 0.7, 0.7));
  // fallen logs from the collapsed corner, lying outside
  for (let k = 0; k < 4; k++) logs.push(M(W / 2 + 1.0 + k * 0.45, R * 0.9, -Dp / 2 + 0.4 + k * 0.5, 0.4 + k * 0.35, 3.0 - k * 0.3, 1, 1, 0, 0.05));
  // roof: planks running down each slope; north slope has a collapsed hole
  const slope = Math.atan2(gH, Dp / 2 + 0.5), sl = Math.hypot(gH, Dp / 2 + 0.5) + 0.25;
  for (let i = 0; i < 22; i++) { const x = -W / 2 - 0.45 + i * ((W + 0.9) / 21);
    for (const side of [1, -1]) {
      const hole = side < 0 && x > 0.2 && x < 2.6; const jitter = rr(-0.03, 0.03);
      if (hole) { if (rand() < 0.35) planks.push(M(x, topY + 0.3, -Dp / 4 + rr(-0.5, 0.5), 0, 1, 1, rr(1.2, 2.2), rr(0.9, 1.4), rr(-0.3, 0.3))); continue; }
      planks.push(M(x, topY + gH / 2 + 0.22 + jitter, side * (Dp / 4 + 0.2), 0, 1, 1, sl * (side < 0 && x > 2.6 ? 0.7 : 1), side * slope));
    } }
  // door (open, hinged) + porch steps
  planks.push(M(-0.75, 1.0, Dp / 2 + 0.45, 1.25, 0.9, 1.95, 0.08 / 0.06 * 0.06 + 0.02));
  for (let i = 0; i < 3; i++) planks.push(M(0, 0.12, Dp / 2 + 0.55 + i * 0.32, 0, 1.6 / 0.28 * 0.28 + 1.2, 1.6, 1.0));
  // stone chimney on the west gable
  for (let k = 0; k < 18; k++) { const y = 0.25 + k * 0.32, w = k < 10 ? 1.1 : 0.7; stones.push(M(-W / 2 - 0.55 + rr(-0.04, 0.04), y, -0.2 + rr(-0.04, 0.04), rr(-0.1, 0.1), w, 0.34, w * 0.9)); }
  const bark = new THREE.MeshLambertMaterial({ color: 0x9b7552 }), cut = new THREE.MeshLambertMaterial({ color: 0xd9b98a });
  const logGeo = new THREE.CylinderGeometry(R, R * 1.05, 1, 8, 1); logGeo.rotateZ(Math.PI / 2);
  const im = new THREE.InstancedMesh(logGeo, [bark, cut, cut], logs.length);
  logs.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, _c.setScalar(rr(0.78, 1.05))); });
  const pg = new THREE.BoxGeometry(0.3, 0.06, 1); const pl = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0x8d7158 }), planks.length);
  planks.forEach((m, i) => { pl.setMatrixAt(i, m); pl.setColorAt(i, _c.setRGB(rr(0.7, 1.0), rr(0.7, 0.95), rr(0.7, 0.9))); });
  const sg = new THREE.DodecahedronGeometry(0.5, 0); sg.scale(1, 0.6, 1);
  const st = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: 0x9a948a, flatShading: true }), stones.length);
  stones.forEach((m, i) => { st.setMatrixAt(i, m); st.setColorAt(i, _c.setScalar(rr(0.8, 1.1))); });
  for (const o of [im, pl, st]) { o.castShadow = o.receiveShadow = true; scene.add(o); }
  // collision: four walls as circles
  const wp = (x, z) => new THREE.Vector3(x, 0, z).applyAxisAngle(up, CABIN.ry).add(new THREE.Vector3(CABIN.x, 0, CABIN.z));
  for (const [a, b] of [[[-W / 2, -Dp / 2], [W / 2, -Dp / 2]], [[-W / 2, -Dp / 2], [-W / 2, Dp / 2]], [[W / 2, -Dp / 2], [W / 2, Dp / 2]], [[-W / 2, Dp / 2], [-0.65, Dp / 2]], [[0.65, Dp / 2], [W / 2, Dp / 2]]]) { const A = wp(...a), B = wp(...b); segCol(A.x, A.z, B.x, B.z, 0.3); }
  { const c = wp(-W / 2 - 0.55, -0.2); colliders.push({ x: c.x, z: c.z, r: 0.7 }); }
  buildGrid();
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
    if (it.nearId === undefined || it.gone || it.anim) continue; const d = Math.hypot(it.x - p.x, it.z - p.z);
    const nearD = it.big ? (isMobile ? 18 : 24) : 16;
    const near = d < (it.wall ? 0 : nearD), inRange = d < (it.big ? 112 : 70), mid = !near && inRange && (it.farId === undefined || d < (it.wall ? (isMobile ? 22 : 34) : 50));
    batch.setVisibleAt(it.nearId, near); farBatch.setVisibleAt(it.midId, mid);
    if (it.farId !== undefined) farBatch.setVisibleAt(it.farId, !near && !mid && inRange);
  }
  for (const g of instGroups) {
    if (!g.cull) { if (g.dirty) { g.dirty = 0; let n = 0; for (const it of g.list) if (!it.gone) { g.im.setMatrixAt(n, it.matrix); g.im.setColorAt(n, _c.setScalar(it.tint)); n++; } g.im.count = n; g.im.instanceMatrix.needsUpdate = true; if (g.im.instanceColor) g.im.instanceColor.needsUpdate = true; } else if (!g.init) { g.init = 1; g.im.count = g.list.length; } continue; }
    // reorder visible instances to the front (only nearby small plants are drawn)
    let n = 0; for (const it of g.list) { if (!it.gone && Math.hypot(it.x - p.x, it.z - p.z) < g.cull) { g.im.setMatrixAt(n, it.matrix); g.im.setColorAt(n, _c.setScalar(it.tint)); n++; } }
    g.im.count = n; g.im.instanceMatrix.needsUpdate = true; if (g.im.instanceColor) g.im.instanceColor.needsUpdate = true; g.im.frustumCulled = false;
  }
}

let loadedOk = 0, loadFail = 0;
async function loadWorld() {
  buildTent(); buildCabin(); buildDecals();
  const tasks = [buildBatch(), placeCampfire(), ...[...new Set(items.filter(i => !i.def.batch).map(i => i.def))].map(d => buildInstanced(d))];
  const r = await Promise.allSettled(tasks); r.forEach(x => x.status === 'fulfilled' ? loadedOk++ : (loadFail++, console.warn('[BAM] load failed', x.reason)));
  console.log('[BAM] world ready: groups ok', loadedOk, 'failed', loadFail, 'objects', items.length, 'colliders', colliders.length);
  buildGrid(); for (const it of items) if ((it.def === D.rock || it.def === D.rockC) && it.size > 0.6 && !it.free && !solidAt(it.x, it.z, 0)) colliders.push({ x: it.x, z: it.z, r: it.size * 0.42 });
  buildGrid(); safeSpawn(player.position); registerNodes();
  window.__bamReady = true;
}

// ================= Characters (Grok-Bot AI-track rigs from asset-forge) =================
// Each GLB: one skeleton, 14 skinned part meshes (<id>_<part>, extras.part) + flesh-cap material.
// At load the 14 parts are merged into ONE SkinnedMesh with 2 groups (body texture + flesh caps) and a
// per-vertex `part` id -> 2 draw calls per character. A per-actor uniform bitmask hides severed parts in the
// shader; the cut piece is CPU-skinned once into a static mesh and falls with physics-lite; the stump shows
// the neighbouring part's flesh cap.
const PARTS = ['torso', 'head', 'upperarm_L', 'forearm_L', 'hand_L', 'upperarm_R', 'forearm_R', 'hand_R', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'];
const PART_CHILDREN = { head: ['head'], upperarm_L: ['upperarm_L', 'forearm_L', 'hand_L'], forearm_L: ['forearm_L', 'hand_L'], upperarm_R: ['upperarm_R', 'forearm_R', 'hand_R'], forearm_R: ['forearm_R', 'hand_R'], thigh_L: ['thigh_L', 'shin_L', 'foot_L'], shin_L: ['shin_L', 'foot_L'], thigh_R: ['thigh_R', 'shin_R', 'foot_R'], shin_R: ['shin_R', 'foot_R'] };
const PART_BONE = { head: 'head', upperarm_L: 'upperarm_L', forearm_L: 'forearm_L', upperarm_R: 'upperarm_R', forearm_R: 'forearm_R', thigh_L: 'thigh_L', shin_L: 'shin_L', thigh_R: 'thigh_R', shin_R: 'shin_R' };
function charShader(mat, glowEyes) {
  mat.userData.uHide = { value: 0 }; mat.userData.uGlow = { value: glowEyes ? 1 : 0 };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uHide = mat.userData.uHide; sh.uniforms.uGlow = mat.userData.uGlow;
    sh.vertexShader = 'attribute float part;\nvarying float vPart;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPart = part;');
    sh.fragmentShader = 'uniform float uHide; uniform float uGlow; varying float vPart;\n' + sh.fragmentShader
      .replace('void main() {', 'void main() {\n if (mod(floor(uHide / exp2(floor(vPart + 0.5))), 2.0) > 0.5) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { float isHead = 1.0 - step(0.5, abs(vPart - 1.0)); vec3 c = diffuseColor.rgb; float yel = step(0.45, c.r) * step(0.35, c.g) * step(c.b, 0.6 * c.g) * step(0.25, c.r - c.b); totalEmissiveRadiance += vec3(1.0, 0.8, 0.1) * yel * isHead * uGlow * 0.7; }');
  };
  mat.customProgramCacheKey = () => 'bamchar' + (glowEyes ? 'g' : '');
  return mat;
}
function mergeCharacter(gltf, glowEyes) {
  const root = gltf.scene; root.updateMatrixWorld(true);
  const skinned = []; root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  const body = [], caps = []; let texMat = null;
  for (const m of skinned) {
    const pn = (m.parent?.userData?.part || m.userData?.part || PARTS.find(p => (m.parent?.name || m.name).endsWith('_' + p)) || 'torso');
    let g = m.geometry.clone(); if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    if (g.attributes.normal && !skinned[0].geometry.attributes.normal) g.deleteAttribute('normal');
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (g.attributes.skinIndex.array.constructor !== Uint16Array) g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(g.attributes.skinIndex.array), 4));
    for (const k of ['position', 'normal', 'uv', 'skinWeight']) { const a = g.attributes[k]; if (!a) continue; if (a.isInterleavedBufferAttribute || a.normalized || a.array.constructor !== Float32Array) { const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c); g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize)); } }
    { const M = skinned[0].bindMatrixInverse.clone().multiply(m.bindMatrix); g.applyMatrix4(M); } // undo per-part (quantization) node transforms -> common bind space
    g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(Math.max(0, PARTS.indexOf(pn))), 1));
    if (/flesh_cap/.test(m.material.name)) caps.push(g); else { body.push(g); texMat = texMat || m.material; }
  }
  const first = skinned[0]; first.bindMatrixInverse; const groups = [mergeGeometries(body)]; if (caps.length) groups.push(mergeGeometries(caps));
  const geo = mergeGeometries(groups, true);
  // per-part vertex index lists (for CPU-skinning cut pieces)
  const P = geo.attributes.part.array; geo.userData.partVerts = PARTS.map((_, pi) => { const l = []; for (let i = 0; i < P.length; i++) if (P[i] === pi) l.push(i); return l; });
  geo.userData.capStart = groups[0].attributes.position.count;
  const flat = !geo.attributes.normal; const mBody = charShader(new THREE.MeshLambertMaterial({ map: texMat.map, side: THREE.FrontSide, flatShading: flat }), glowEyes);
  const mCap = charShader(new THREE.MeshLambertMaterial({ color: 0x8a1d16, side: THREE.DoubleSide, flatShading: flat }), false);
  const sm = new THREE.SkinnedMesh(geo, [mBody, mCap]); sm.bind(first.skeleton, first.bindMatrix); sm.name = 'body'; sm.castShadow = true; sm.frustumCulled = false;
  sm.position.copy(first.position); sm.quaternion.copy(first.quaternion); sm.scale.copy(first.scale); first.parent.add(sm); skinned.forEach(m => m.removeFromParent());
  root.updateMatrixWorld(true); const bw = n => { let b = null; root.traverse(o => { if (o.isBone && o.name === n) b = o; }); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
  const rY = Math.min(bw('foot_L').y, bw('foot_R').y) - 0.06 * (bw('head').y - bw('foot_L').y), box = { min: { y: rY }, max: { y: rY + (bw('head').y - rY) / 0.88 } }; console.log('[BAM] char h', (box.max.y - box.min.y).toFixed(2), box.min.y.toFixed(2));
  return { root, clips: gltf.animations, height: box.max.y - box.min.y, minY: box.min.y, mats: [mBody, mCap] };
}
const CHAR = { player: null, zombies: {}, npc: null };
const GB = 'assets/characters/gb/Grok-Bot_', ZLO = isMobile || Q.has('lo') ? '_lo' : ''; // mobile: ~8.5k-tri simplified zombies
async function loadCharacters() {
  const L = n => loader.loadAsync(GB + n + '.glb');
  const [pl, axe, zs, zh, zc, npc] = await Promise.all([L('survivor_player'), loader.loadAsync('assets/characters/axe.glb'), L('zombie_standing_v2' + ZLO), L('zombie_hunched' + ZLO), L('zombie_crawler' + ZLO), L('survivor_npc_v2')]);
  CHAR.player = { ...mergeCharacter(pl, false), axe: axe.scene };
  CHAR.zombies = { standing: mergeCharacter(zs, true), hunched: mergeCharacter(zh, true), crawler: mergeCharacter(zc, true) };
  CHAR.npc = mergeCharacter(npc, false);
}
// game clip names -> asset clip names (crawler has its own crawl_* set)
const ALIAS = { Idle: 'idle', Idle_Neutral: 'idle', Walk: 'walk', Run: 'run', Sword_Slash: 'attack', Punch_Left: 'attack', Punch_Right: 'attack', Death: 'death', HitRecieve: 'hit_react', HitRecieve_2: 'hit_react_left', Interact: 'interact' };
const CRAWL = { idle: 'crawl_idle', walk: 'crawl', run: 'crawl', attack: 'crawl_attack', hit_react: 'crawl_hit', hit_react_left: 'crawl_hit', death: 'crawl_death', interact: 'crawl_idle' };

// ---------- generic animated actor ----------
class Actor {
  constructor(src, targetH, crawl = false) {
    this.src = src; this.crawl = crawl; this.model = SkeletonUtils.clone(src.root); // shares geometry + clips
    const s = targetH / src.height; this.model.scale.setScalar(s); this.model.position.y = -src.minY * s;
    this.obj = new THREE.Group(); this.obj.add(this.model); scene.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.model); this.actions = {}; this.cur = null; this.acc = 0;
    this.body = null; this.model.traverse(o => { if (o.isSkinnedMesh) this.body = o; });
    this.mats = this.body.material.map(m => { const c = m.clone(); charShader(c, !!m.userData.uGlow.value); return c; }); this.body.material = this.mats; // per-actor (hide mask + tint), same program
    this.bones = {}; this.model.traverse(o => { if (o.isBone) this.bones[o.name.replace(/[^A-Za-z0-9]/g, '')] = o; });
  }
  act(name) { let n = ALIAS[name] || name; if (this.crawl) n = CRAWL[n] || n;
    if (!this.actions[n]) { const c = THREE.AnimationClip.findByName(this.src.clips, n); if (!c) return null; this.actions[n] = this.mixer.clipAction(c); } return this.actions[n]; }
  play(name, { fade = 0.2, once = false, speed = 1 } = {}) {
    const a = this.act(name); if (!a) return; if (this.cur === a && !once) { a.timeScale = speed; this.curName = name; return a; }
    a.reset(); a.timeScale = speed; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    a.enabled = true; a.setEffectiveWeight(1); if (this.cur && this.cur !== a) this.cur.crossFadeTo(a, fade, false); a.play(); this.cur = a; this.curName = name; return a;
  }
  tickAnim(dt, dist) { // throttle animation for distant actors
    this.acc += dt; const every = dist > 45 ? 4 : dist > 22 ? 2 : 1; this.frame = (this.frame || 0) + 1;
    if (dist > 90) { this.acc = 0; return false; }
    if (this.frame % every) return false; this.mixer.update(this.acc); this.acc = 0; return true;
  }
  hide(parts) { for (const p of parts) this.hidden = (this.hidden || 0) | (1 << PARTS.indexOf(p)); for (const m of this.mats) m.userData.uHide.value = this.hidden; }
}

// ---------- dismemberment: CPU-skin the severed subtree once -> static falling piece ----------
const pieces = [];
function severPart(a, part, dir) {
  if (!PART_CHILDREN[part]) return; const sub = PART_CHILDREN[part], sm = a.body, geo = sm.geometry;
  a.model.updateMatrixWorld(true); sm.skeleton.update();
  const idx = []; for (const p of sub) idx.push(...geo.userData.partVerts[PARTS.indexOf(p)]); idx.sort((x, y) => x - y);
  const cs = geo.userData.capStart, pos = new Float32Array(idx.length * 3), uv = new Float32Array(idx.length * 2), v = new THREE.Vector3(), c = new THREE.Vector3(); let nBody = 0;
  idx.forEach((vi, k) => { sm.getVertexPosition(vi, v); v.applyMatrix4(sm.matrixWorld); pos.set([v.x, v.y, v.z], k * 3); c.add(v); uv.set([geo.attributes.uv.getX(vi), geo.attributes.uv.getY(vi)], k * 2); if (vi < cs) nBody++; });
  c.divideScalar(idx.length); for (let k = 0; k < idx.length; k++) { pos[k * 3] -= c.x; pos[k * 3 + 1] -= c.y; pos[k * 3 + 2] -= c.z; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals();
  g.addGroup(0, nBody - nBody % 3, 0); g.addGroup(nBody - nBody % 3, idx.length - (nBody - nBody % 3), 1);
  const mesh = new THREE.Mesh(g, [new THREE.MeshLambertMaterial({ map: a.src.mats[0].map }), new THREE.MeshLambertMaterial({ color: 0x8a1d16, side: THREE.DoubleSide })]);
  mesh.position.copy(c); mesh.castShadow = true; scene.add(mesh);
  const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
  pieces.push({ mesh, vel: dir.clone().multiplyScalar(rr(2, 3.5)).add(new THREE.Vector3(rr(-0.6, 0.6), rr(2.2, 3.5), rr(-0.6, 0.6))), spin: new THREE.Vector3(rr(-8, 8), rr(-4, 4), rr(-8, 8)), r: Math.max(0.05, (box.max.y - box.min.y) * 0.25), t: 0 });
  if (pieces.length > 8) { const o = pieces.shift(); scene.remove(o.mesh); o.mesh.geometry.dispose(); }
  a.hide(sub); bloodBurst(c, dir, 34);
}
function tickPieces(dt) {
  for (let i = pieces.length - 1; i >= 0; i--) { const p = pieces[i]; p.t += dt; const m = p.mesh;
    if (!p.rest) { p.vel.y -= 9.8 * dt; m.position.addScaledVector(p.vel, dt); m.rotation.x += p.spin.x * dt; m.rotation.y += p.spin.y * dt; m.rotation.z += p.spin.z * dt;
      const gy = heightAt(m.position.x, m.position.z) + p.r; if (m.position.y < gy) { m.position.y = gy; p.vel.y *= -0.3; p.vel.x *= 0.55; p.vel.z *= 0.55; p.spin.multiplyScalar(0.5); if (Math.abs(p.vel.y) < 0.6 && p.vel.lengthSq() < 0.5) p.rest = 1; } }
    if (p.t > 25) { m.position.y -= dt * 0.1; if (p.t > 28) { scene.remove(m); m.geometry.dispose(); pieces.splice(i, 1); } } }
}

// ---------- player ----------
var player = new THREE.Group(); player.position.set(CAMP.x - 3.2, 0, CAMP.z - 3.4); scene.add(player);
let hero = null, heroFacing = -2.25 + Math.PI, attackT = -1, attackHit = false, heroHurtT = 0, dead = false;
const camOffset = new THREE.Vector3(0, 1.9, 3.6);
let yaw = -2.25, pitch = 0.12;
function setupHero() {
  const P = CHAR.player; hero = new Actor(P, 1.8); scene.remove(hero.obj); player.add(hero.obj);
  const hand = hero.bones['handR'] || hero.bones['forearmR'];
  if (hand) { hero.obj.updateMatrixWorld(true); const ws = hand.getWorldScale(new THREE.Vector3()).x;
    const a = P.axe.clone(); const b = new THREE.Box3().setFromObject(a), sz = b.getSize(new THREE.Vector3()); const s = 0.8 / Math.max(sz.x, sz.y, sz.z) / ws;
    a.scale.setScalar(s); a.rotation.set(0, 0, Math.PI / 2); a.position.set(0, 0.06 / ws, 0); a.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); hand.add(a); window.__axe = a; }
  hero.play('Idle');
  // friendly survivor NPC at camp (idle; E to talk -> interact clip)
  const n = new Actor(CHAR.npc, 1.76); const nx = FIRE.x + 2.2, nz = FIRE.z - 1.6; n.obj.position.set(nx, heightAt(nx, nz), nz); n.obj.rotation.y = Math.atan2(FIRE.x - nx, FIRE.z - nz); n.play('Idle'); n.mixer.setTime(1.3);
  colliders.push({ x: nx, z: nz, r: 0.4 }); buildGrid(); npcActor = n; window.__npc = n;
  nodes.push({ type: 'npc', it: { x: nx, z: nz }, x: nx, z: nz, r: 0.5, hits: 0, id: nodes.length });
}
let npcActor = null;

// ---------- zombies ----------
const zombies = []; const zombieCountEl = document.getElementById('zombieCount'); let remaining = 0, wave = 0;
function spawnZombie(x, z, forceType) {
  const runner = rand() < 0.12, type = forceType || (runner ? (rand() < 0.5 ? 'standing' : 'hunched') : rand() < 0.18 ? 'crawler' : rand() < 0.5 ? 'standing' : 'hunched');
  const crawl = type === 'crawler';
  const a = new Actor(CHAR.zombies[type], (type === 'hunched' ? rr(1.6, 1.85) : rr(1.7, 1.95)), crawl);
  a.type = type; a.mats[0].color.setRGB(rr(0.85, 1.05), rr(0.85, 1.02), rr(0.82, 1.0)); // per-zombie tint
  a.obj.position.set(x, heightAt(x, z), z); a.obj.rotation.y = rand() * 6.28;
  Object.assign(a, { hp: crawl ? 2 : runner ? 2 : 3, speed: crawl ? rr(0.55, 0.8) : runner ? rr(2.6, 3.2) : rr(0.8, 1.35), runner: runner && !crawl, state: 'idle', stateT: 0, atkCd: 0, hitT: 0, lean: rr(0.0, 0.12), limp: rr(-1, 1), tilt: rr(-0.25, 0.25), lurchF: rr(1.4, 2.4), ph: rand() * 6.28, armUp: rr(0.75, 1.1), wander: rand() * 6.28, kb: new THREE.Vector3() });
  a.play('Idle_Neutral', { speed: rr(0.7, 1.0) }); a.mixer.setTime(rand() * 3);
  zombies.push(a); remaining++; updateCount();
}
function spawnWave() {
  wave++; const n = Math.min(4 + wave * 2, isMobile ? 8 : 12); let k = 0;
  for (let i = 0; i < 4000 && k < n; i++) { const ang = rand() * 6.283, d = rr(24, 42); const x = player.position.x + Math.cos(ang) * d, z = player.position.z + Math.sin(ang) * d;
    if (Math.hypot(x, z) > WORLD_R - 8 || lakeN(x, z) < 1.25 || solidAt(x, z, 0.6)) continue; spawnZombie(x, z); k++; }
  msg(wave === 1 ? 'Something is moving in the trees...' : `Wave ${wave}: they keep coming.`);
}
function updateCount() { zombieCountEl.textContent = remaining; }
const msgEl = document.getElementById('msg'); function msg(t) { msgEl.textContent = t; }

// procedural zombie posture on top of the clip: forward lean + reaching arms (axis-agnostic, world space)
const _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _ax = new THREE.Vector3();
function bendBone(bone, axisWorld, ang) { if (!bone) return; bone.parent.getWorldQuaternion(_qp); _ax.copy(axisWorld).applyQuaternion(_qp.invert()); _qa.setFromAxisAngle(_ax, ang); bone.quaternion.premultiply(_qa); }
function zombiePosture(a, w) {
  if (w <= 0) return; const ry = a.obj.rotation.y, right = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
  a.model.updateMatrixWorld(true);
  if (a.crawl) return; bendBone(a.bones['chest'], right, a.lean * w);
  const t = performance.now() / 1000 * a.lurchF + a.ph, fwdA = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  bendBone(a.bones['chest'], fwdA, (Math.sin(t) * 0.1 + a.limp * 0.08) * w); // side-to-side lurch/limp roll
  bendBone(a.bones['chest'], right, Math.max(0, Math.sin(t * 2)) * 0.08 * w); // forward lurch pulses
  bendBone(a.bones['head'], fwdA, a.tilt * w);
  a.model.updateMatrixWorld(true);
}

// ---------- blood particles (pooled, one draw call) ----------
const BL = 160, blPos = new Float32Array(BL * 3), blVel = new Float32Array(BL * 3), blLife = new Float32Array(BL); let blNext = 0;
const blGeo = new THREE.BufferGeometry(); blGeo.setAttribute('position', new THREE.BufferAttribute(blPos, 3));
const blood = new THREE.Points(blGeo, new THREE.PointsMaterial({ color: 0x8a0e0a, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false })); blood.frustumCulled = false; scene.add(blood);
for (let i = 0; i < BL; i++) blPos[i * 3 + 1] = -999;
function bloodBurst(p, dir, n = 18) { for (let k = 0; k < n; k++) { const i = blNext++ % BL; blPos.set([p.x, p.y, p.z], i * 3); blVel.set([dir.x * rr(1, 3) + rr(-1, 1), rr(0.5, 2.5), dir.z * rr(1, 3) + rr(-1, 1)], i * 3); blLife[i] = rr(0.5, 0.9); } }
function tickBlood(dt) { for (let i = 0; i < BL; i++) { if (blLife[i] <= 0) continue; blLife[i] -= dt; blVel[i * 3 + 1] -= 9.8 * dt; for (let c = 0; c < 3; c++) blPos[i * 3 + c] += blVel[i * 3 + c] * dt; const g = heightAt(blPos[i * 3], blPos[i * 3 + 2]) + 0.02; if (blPos[i * 3 + 1] < g) { blPos[i * 3 + 1] = g; blVel.fill(0, i * 3, i * 3 + 3); } if (blLife[i] <= 0) blPos[i * 3 + 1] = -999; } blGeo.attributes.position.needsUpdate = true; }

// ---------- combat ----------
const hurtEl = document.getElementById('hurt');
function heroAttack() {
  if (!hero || dead || attackT >= 0) return;
  attackT = 0; attackHit = false; heroFacing = yaw + Math.PI;
  hero.play('Sword_Slash', { once: true, fade: 0.08, speed: 1.35 });
}
function resolveHeroHit() {
  const f = new THREE.Vector3(Math.sin(heroFacing), 0, Math.cos(heroFacing));
  for (const z of zombies) { if (z.state === 'dead') continue; const d = z.obj.position.clone().sub(player.position); d.y = 0; const L = d.length();
    if (L < 2.3 && d.normalize().dot(f) > 0.35) hitZombie(z, f); }
}
function hitZombie(z, dir) {
  z.hp--; bloodBurst(z.obj.position.clone().add(new THREE.Vector3(0, 1.4, 0)), dir);
  z.kb.copy(dir).multiplyScalar(z.hp > 0 ? 3.2 : 4.5);
  if (z.hp <= 0) { if (rand() < (window.__cutAll ? 1 : 0.45)) severPart(z, pick(['head', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'head', 'shin_L', 'thigh_R']), dir); z.state = 'dead'; z.stateT = 0; z.fallDir = dir.clone(); z.play('Death', { once: true, fade: 0.1, speed: rr(0.9, 1.2) }); remaining--; updateCount();
    if (remaining <= 0) { msg('Area clear for now. More will come...'); setTimeout(spawnWave, 9000); } }
  else { z.state = 'hit'; z.stateT = 0; z.play(rand() < 0.5 ? 'HitRecieve' : 'HitRecieve_2', { once: true, fade: 0.06 }); }
}
function hurtHero(amount, from) {
  if (dead) return; health = Math.max(0, health - amount); healthEl.textContent = Math.floor(health); heroHurtT = 0.35;
  hurtEl.style.opacity = 0.55; setTimeout(() => hurtEl.style.opacity = 0, 160);
  bloodBurst(player.position.clone().add(new THREE.Vector3(0, 1.3, 0)), from, 10);
  if (health <= 0) { dead = true; hero.play('Death', { once: true, fade: 0.15 }); msg('You died. Tap to try again.'); setTimeout(() => addEventListener('pointerdown', () => location.reload(), { once: true }), 1500); }
  else if (attackT < 0) hero.play('HitRecieve', { once: true, fade: 0.06, speed: 1.4 });
}
function updateZombie(z, dt, t) {
  const to = player.position.clone().sub(z.obj.position); to.y = 0; const d = to.length();
  z.stateT += dt; z.atkCd -= dt;
  // knockback
  if (z.kb.lengthSq() > 0.001) { z.obj.position.addScaledVector(z.kb, dt); z.kb.multiplyScalar(Math.max(0, 1 - dt * 7)); }
  if (z.state === 'dead') {
    if (z.stateT < 0.9) { const k = Math.min(1, z.stateT / 0.9); z.obj.rotation.x = 0; } // ragdoll-lite: clip falls, small slide along hit dir handled by knockback
    if (z.stateT > 10) z.obj.position.y -= dt * 0.25;
    if (z.stateT > 14) { scene.remove(z.obj); zombies.splice(zombies.indexOf(z), 1); }
    return 0;
  }
  if (z.state === 'hit') { if (z.stateT > 0.55) z.state = 'chase'; return 0.3; }
  if (z.state === 'attack') {
    if (!z.dealt && z.stateT > 0.45) { z.dealt = true; if (d < 1.9 && !dead) hurtHero(z.runner ? 8 : 12, to.clone().normalize().negate()); }
    if (z.stateT > 1.1) { z.state = 'chase'; z.atkCd = rr(0.6, 1.2); }
    face(z, to, dt * 6); return 0.4;
  }
  const aware = d < (z.state === 'chase' ? 40 : 20) && !dead;
  if (aware) {
    if (z.state !== 'chase') { z.state = 'chase'; z.play(z.runner ? 'Run' : 'Walk', { speed: z.runner ? 0.95 : z.crawl ? z.speed * 1.3 : z.speed * 0.75, fade: 0.4 }); }
    if (d < 1.5 && z.atkCd <= 0) { z.state = 'attack'; z.stateT = 0; z.dealt = false; z.play(rand() < 0.5 ? 'Punch_Left' : 'Punch_Right', { once: true, fade: 0.12, speed: 0.85 }); return 0.4; }
    if (d > 1.2) { const lur = z.runner ? 1 : 0.55 + 0.9 * Math.max(0, Math.sin((performance.now() / 1000 * z.lurchF + z.ph) * 2)); z.obj.position.addScaledVector(to.normalize(), z.speed * lur * dt); face(z, to, dt * 3); }
  } else {
    if (z.state !== 'idle' && z.state !== 'wander') z.state = 'idle';
    z.wander += (Math.sin(t * 0.3 + z.lean * 50) * 0.5) * dt;
    if (Math.sin(t * 0.2 + z.armUp * 9) > 0.3) { if (z.curName !== 'Walk') z.play('Walk', { speed: 0.35, fade: 0.6 }); const w = new THREE.Vector3(Math.sin(z.wander), 0, Math.cos(z.wander)); z.obj.position.addScaledVector(w, 0.35 * dt); face(z, w, dt * 2); }
    else if (z.curName !== 'Idle_Neutral') z.play('Idle_Neutral', { speed: 0.6, fade: 0.6 });
  }
  return 1;
}
function face(z, dir, k) { const target = Math.atan2(dir.x, dir.z); let dd = target - z.obj.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); z.obj.rotation.y += dd * Math.min(1, k); }
// zombie-zombie separation (cheap, O(n^2) on <=12)
function separate() { for (let i = 0; i < zombies.length; i++) for (let j = i + 1; j < zombies.length; j++) { const a = zombies[i].obj.position, b = zombies[j].obj.position; const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz); if (d < 0.8 && d > 1e-3) { const p = (0.8 - d) / 2; a.x += dx / d * p; a.z += dz / d * p; b.x -= dx / d * p; b.z -= dz / d * p; } } }

// spatial hash for colliders
const CELL = 8, cgrid = new Map();
function buildGrid() { cgrid.clear(); for (const c of colliders) { const k = Math.floor(c.x / CELL) + ',' + Math.floor(c.z / CELL); (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c); } }
buildGrid();
function solidAt(x, z, pad) { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = cgrid.get((cx + i) + ',' + (cz + j)); if (!l) continue;
    for (const c of l) { let px = c.x, pz = c.z; if (c.seg) { const vx = c.bx - c.ax, vz = c.bz - c.az, t = clamp(((x - c.ax) * vx + (z - c.az) * vz) / (vx * vx + vz * vz), 0, 1); px = c.ax + vx * t; pz = c.az + vz * t; } if (Math.hypot(x - px, z - pz) < c.r + pad) return true; } }
  return false; }
function safeSpawn(p) { if (!solidAt(p.x, p.z, 0.6)) return; for (let r = 0.5; r < 20; r += 0.5) for (let a = 0; a < 6.28; a += 0.4) { const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (!solidAt(x, z, 0.7) && lakeN(x, z) > 1.05) { p.x = x; p.z = z; console.log('[BAM] spawn moved', r); return; } } }
function collide(pos, rad) { collide1(pos, rad); collide1(pos, rad); }
function collide1(pos, rad) {
  const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = cgrid.get((cx + i) + ',' + (cz + j)); if (!l) continue;
    for (const c of l) { let cx = c.x, cz = c.z; if (c.seg) { const vx = c.bx - c.ax, vz = c.bz - c.az, t = clamp(((pos.x - c.ax) * vx + (pos.z - c.az) * vz) / (vx * vx + vz * vz), 0, 1); cx = c.ax + vx * t; cz = c.az + vz * t; }
      let ox = pos.x - cx, oz = pos.z - cz, d = Math.hypot(ox, oz); const m = c.r + rad; if (d < m) { if (d < 1e-4) { ox = 1; oz = 0; d = 1; } pos.x = cx + ox / d * m; pos.z = cz + oz / d * m; } } }
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
let drag = null; renderer.domElement.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { if (e.clientX > innerWidth * 0.5) heroAttack(); return; } drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; if (drag.moved > 6) { yaw -= dx * 0.005; pitch = clamp(pitch - dy * 0.003, -0.6, 0.6); } });
addEventListener('pointerup', e => { if (drag && drag.moved <= 6 && e.target === renderer.domElement) heroAttack(); drag = null; });
addEventListener('keydown', e => { if (e.key === 'Tab') e.preventDefault(); keys[e.key.toLowerCase()] = true; if (ui.open()) return; if (e.key === ' ' || e.key.toLowerCase() === 'f') heroAttack(); if (e.key.toLowerCase() === 'e' && !e.repeat) interact(); });
// no browser zoom (pinch, double-tap, ctrl+wheel, Safari gestures)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || e.scale && e.scale !== 1) e.preventDefault(); }, { passive: false });
document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0; document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouchEnd < 350) e.preventDefault(); lastTouchEnd = n; }, { passive: false });
addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

const clock = new THREE.Clock(); var health = 100; const healthEl = document.getElementById('health');
let frames = 0; const dbg = document.createElement('div');
if (DEBUG) { dbg.style.cssText = 'position:fixed;top:78px;left:10px;color:#fff;font:12px monospace;z-index:30;text-shadow:0 1px 2px #000'; document.body.appendChild(dbg); }
const VIEWS = {
  top: [[-60, 60, 70], [0, 0, -5]], camp: [[CAMP.x - 7, 3.2, CAMP.z + 6], [CAMP.x, 0.4, CAMP.z]],
  lake: [[CAMP.x + 2, 3, CAMP.z - 2], [LAKE.x, 0, LAKE.z]], car: [[CAR.x + 8, 2.5, CAR.z + 6], [CAR.x, 0.5, CAR.z]],
  cabin: [[CABIN.x + 9, 3, CABIN.z + 8], [CABIN.x, 1, CABIN.z]], rocks: [[ROCKS.x - 13, 2.5, ROCKS.z + 11], [ROCKS.x, 2, ROCKS.z]],
  meadow: [[CAMP.x + 10, 1.7, CAMP.z - 14], [CAMP.x + 16, 0.5, CAMP.z - 26]],
  giant: [[GIANT.x + GDIR.x * 3 - GDIR.z * 13, 3.5, GIANT.z + GDIR.z * 3 + GDIR.x * 13], [GIANT.x + GDIR.x * 5, 1, GIANT.z + GDIR.z * 5]], trail: [[CAR.x + 4, 2.5, CAR.z + 3], [CAR.x - 6, 0, CAR.z - 10]], edge: [[-5, 2.5, 62], [-5, 9, 130]], tent: [[CAMP.x - 7, 2.2, CAMP.z + 7.5], [CAMP.x - 4.6, 0.6, CAMP.z + 3.2]], forest: [[-24, 1.8, -36], [-40, 2.5, -52]],
};
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  let dx = moveX, dz = moveZ;
  if (keys['w'] || keys['arrowup']) dz += 1; if (keys['s'] || keys['arrowdown']) dz -= 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1; if (keys['d'] || keys['arrowright']) dx += 1;
  yaw -= lookX * 2.5 * dt; pitch = clamp(pitch - lookY * 1.8 * dt, -0.6, 0.6);
  if (keys['q']) yaw += 1.5 * dt; if (keys['r']) yaw -= 1.5 * dt;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const mag = Math.min(1, Math.hypot(dx, dz)); const running = keys['shift'] || Math.hypot(moveX, moveZ) > 0.8;
  let spd = 0;
  if (!dead && mag > 0.1) {
    const dir = fwd.clone().multiplyScalar(dz).add(right.clone().multiplyScalar(dx)).normalize();
    spd = (running ? 6.2 : 3.0) * (attackT >= 0 ? 0.35 : 1);
    player.position.addScaledVector(dir, spd * dt);
    if (attackT < 0) heroFacing = Math.atan2(dir.x, dir.z);
  }
  collide(player.position, 0.4);
  player.position.y = heightAt(player.position.x, player.position.z);
  if (hero) {
    let dd = heroFacing - hero.obj.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); hero.obj.rotation.y += dd * Math.min(1, dt * 12);
    if (attackT >= 0) { attackT += dt; if (!attackHit && attackT > 0.32) { attackHit = true; resolveHeroHit(); } if (attackT > 0.75) attackT = -1; }
    heroHurtT -= dt;
    if (!dead && attackT < 0 && heroHurtT <= 0) hero.play(spd > 4 ? 'Run' : spd > 0 ? 'Walk' : 'Idle', { fade: 0.18, speed: spd > 4 ? 1 : spd > 0 ? 1.15 : 1 });
    hero.mixer.update(dt);
  }
  // zombies: AI + throttled animation + posture
  for (const z of [...zombies]) {
    const w = updateZombie(z, dt, t);
    collide(z.obj.position, 0.35); z.obj.position.y = heightAt(z.obj.position.x, z.obj.position.z) - (z.state === 'dead' && z.stateT > 10 ? (z.stateT - 10) * 0.25 : 0);
    const dist = z.obj.position.distanceTo(camera.position);
    if (z.tickAnim(dt, dist) && dist < 30) zombiePosture(z, z.runner ? w * 0.4 : w);
    z.obj.visible = dist < 95; z.body.castShadow = dist < (isMobile ? 14 : 24);
  }
  separate();
  tickBlood(dt); tickPieces(dt); if (npcActor) npcActor.tickAnim(dt, npcActor.obj.position.distanceTo(camera.position));
  updateLods(false); tickGather(dt);
  grassU.uCenter.value.set(VIEWS[VIEW] ? VIEWS[VIEW][1][0] : player.position.x, VIEWS[VIEW] ? VIEWS[VIEW][1][2] : player.position.z);

  const camPos = player.position.clone().add(new THREE.Vector3(0, 0.2, 0)).addScaledVector(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), 0.55).add(camOffset.clone().applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')));
  { const head = player.position.clone().add(new THREE.Vector3(0, 1.6, 0)); for (let k = 1; k <= 10; k++) { const q = head.clone().lerp(camPos, k / 10); if (solidAt(q.x, q.z, 0.3)) { camPos.copy(head.lerp(camPos, Math.max(0.15, (k - 1.5) / 10))); break; } } }
  camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 0.6);
  camera.position.copy(camPos); camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 1.55, 0)).addScaledVector(right, 0.35));
  if (VIEW === 'zside') { const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); const c = player.position.clone().addScaledVector(f, 2.5); camera.position.copy(c).addScaledVector(r, 5).add(new THREE.Vector3(0, 1.4, 0)); camera.lookAt(c.x, c.y + 1, c.z); }
  if (VIEW === 'zface' && zombies.length) { const z = zombies[(window.__zi | 0) % zombies.length], ry = z.obj.rotation.y, hz = z.obj.position; const h = z.bones['head'] ? z.bones['head'].getWorldPosition(new THREE.Vector3()) : hz.clone().add(new THREE.Vector3(0, 1.6, 0)); camera.position.set(h.x + Math.sin(ry + 0.5) * 1.5, h.y - 0.15, h.z + Math.cos(ry + 0.5) * 1.5); camera.lookAt(h.x, h.y - 0.45, h.z); }
  if (VIEWS[VIEW]) { const [a, b] = VIEWS[VIEW]; camera.position.set(a[0], heightAt(a[0], a[2]) + a[1], a[2]); camera.lookAt(b[0], heightAt(b[0], b[2]) + b[1], b[2]); }

  // atmosphere
  windU.uTime.value = t; if (waterU.mat) waterU.mat.uniforms.uTime.value = t;
  fireLight.intensity = 8 + Math.sin(t * 13) * 1.0 + Math.sin(t * 7.3) * 0.8 + Math.sin(t * 23) * 0.4;
  flames.children.forEach(f => { const k = f.userData.k; f.scale.y = (k === 1 ? 1.25 : k === 0 ? 1 : 0.8) * (0.85 + 0.2 * Math.sin(t * (9 + k * 3) + k)); f.rotation.y = t * (0.6 + k * 0.3); });
  for (let i = 0; i < EMB; i++) { embLife[i] -= dt; if (embLife[i] <= 0) resetEmber(i); embPos[i * 3] += (embVel[i * 3] + Math.sin(t * 2 + i) * 0.2) * dt; embPos[i * 3 + 1] += embVel[i * 3 + 1] * dt; embPos[i * 3 + 2] += embVel[i * 3 + 2] * dt; }
  embGeo.attributes.position.needsUpdate = true;
  const focus = VIEWS[VIEW] ? new THREE.Vector3(...VIEWS[VIEW][1]) : player.position;
  sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN_DIR, 80);
  window.__sky.position.copy(camera.position); ridges.position.set(camera.position.x, 0, camera.position.z);

  renderer.render(scene, camera);
  if (DEBUG && (frames++ % 10 === 0)) { const i = renderer.info.render; dbg.textContent = `calls ${i.calls} | tris ${(i.triangles / 1000).toFixed(0)}k | fps ${(1 / Math.max(dt, 1e-3)).toFixed(0)} | ready ${!!window.__bamReady}`; window.__bamStats = { calls: i.calls, triangles: i.triangles }; }
}
// ================= Gathering + inventory =================
const inv = new Inventory(); const isTouchUI = isMobile || 'ontouchstart' in window;
const ui = buildUI(inv, { onUse: () => interact(), isTouch: isTouchUI });
const NODE_T = {
  tree: { hits: 5, verb: 'Chop tree', give: () => [['wood', 1]], last: () => [['wood', 3], ['sticks', 2]], respawn: 300, anim: 'Sword_Slash' },
  rock: { hits: 4, verb: 'Mine rock', give: () => [['stone', 1]], last: () => [['stone', 2]], respawn: 180, anim: 'Sword_Slash', keep: 1 },
  wood: { hits: 3, verb: 'Chop wood', give: () => [['wood', 1]], last: () => [['wood', 2]], respawn: 240, anim: 'Sword_Slash' },
  stump: { hits: 3, verb: 'Chop stump', give: () => [['wood', 1]], last: () => [['wood', 1]], respawn: 240, anim: 'Sword_Slash', keep: 1 },
  bush: { hits: 2, verb: 'Pick bush', give: () => [['berries', 1 + (Math.random() < 0.5)]], last: () => [['berries', 1], ['sticks', 2]], respawn: 150, anim: 'Interact', keep: 1 },
  reed: { hits: 1, verb: 'Cut reeds', give: () => [], last: () => [['fiber', 3]], respawn: 120, anim: 'Interact' },
  grass: { hits: 1, verb: 'Pull grass', give: () => [], last: () => [['fiber', 1]], respawn: 90, anim: 'Interact' },
  loot: { hits: 1, verb: 'Search bag', anim: 'Interact' },
  npc: { hits: 1, verb: 'Talk to survivor', anim: 'Interact' },
};
const nodes = [];
function addNode(type, it, r, extra = {}) { nodes.push({ type, it, x: it.x, z: it.z, r, hits: 0, id: nodes.length, ...extra }); }
// reeds along the lake shore (procedural, one draw call) -> fiber
const REEDS = []; let reedIM = null;
{ const g = []; for (let k = 0; k < 7; k++) { const c = new THREE.ConeGeometry(0.035, rr(1.0, 1.6), 3); const a = k / 7 * 6.28; c.translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12); c.translate(0, 0.6, 0); c.rotateZ(rr(-0.15, 0.15)); g.push(c); }
  const cat = new THREE.CylinderGeometry(0.04, 0.04, 0.22, 5); cat.translate(0.05, 1.3, 0); g.push(cat);
  const geo = mergeGeometries(g.map(x => x.toNonIndexed())); const col = []; const P = geo.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); const c = y > 1.18 && y < 1.42 && i >= P.count - 60 ? [0.33, 0.2, 0.1] : [0.35 + y * 0.12, 0.5 + y * 0.12, 0.2]; col.push(...c); } geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  for (let i = 0; i < 300 && REEDS.length < 48; i++) { const a = rand() * 6.283, d = LAKE.r * rr(0.9, 1.02); const x = LAKE.x + Math.cos(a) * d, z = LAKE.z + Math.sin(a) * d; if (REEDS.some(r => Math.hypot(r.x - x, r.z - z) < 1.6)) continue;
    const it = { x, z, tint: 1, matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3().setScalar(rr(0.8, 1.2))) }; REEDS.push(it); }
  reedIM = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), REEDS.length); REEDS.forEach((it, i) => reedIM.setMatrixAt(i, it.matrix)); scene.add(reedIM);
  instGroups.push({ im: reedIM, list: REEDS, cull: 0 }); }
function registerNodes() {
  for (const it of items) { if (it.free) continue; const d = it.def;
    if (isTree(d) && !it.wall && it.size < 16) addNode('tree', it, treeR(it.size) + 0.3);
    else if ((d === D.rock || d === D.rockC) && it.size > 0.45) addNode('rock', it, it.size * 0.45);
    else if (d === D.log) addNode('wood', it, 0.7); else if (d === D.stump || d === D.stumpL) addNode('stump', it, 0.5);
    else if (d === D.bushA || d === D.bushB || d === D.bushF) addNode('bush', it, 0.6);
    else if (d === D.grass) addNode('grass', it, 0.3); }
  REEDS.forEach(it => addNode('reed', it, 0.3));
  // lootable backpacks: camp bag (canvas) + bag at the blood trail's end (hide)
  const end = TRAIL[TRAIL.length - 1];
  const near = (def, x, z) => items.filter(i => i.def === def).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
  const camp = near(D.bag, TENT.x, TENT.z), trail = near(D.hidebag, end[0], end[1]), car = near(D.hidebag, CAR.x, CAR.z);
  if (camp) addNode('loot', camp, 0.4, { loot: [['backpack', 1], ['berries', 3]], name: 'Canvas backpack' });
  if (trail) addNode('loot', trail, 0.4, { loot: [['backpack', 2], ['cloth', 2], ['fiber', 4]], name: 'Hide backpack' });
  if (car && car !== trail) addNode('loot', car, 0.4, { loot: [['cloth', 3], ['sticks', 2]], name: 'Bag' });
  for (const n of nodes) if (n.type === 'loot' && inv.looted.includes(n.id)) hideNode(n);
  window.__nodes = nodes;
}
const groupOf = it => instGroups.find(g => g.list.includes(it));
function hideNode(n) { const it = n.it; it.gone = 1;
  if (it.nearId !== undefined) { batch.setVisibleAt(it.nearId, false); farBatch.setVisibleAt(it.midId, false); if (it.farId !== undefined) farBatch.setVisibleAt(it.farId, false); }
  else { const g = groupOf(it); if (g) g.dirty = 1; updateLods(true); }
  n.gone = 1; n.col = colliders.find(c => !c.seg && Math.abs(c.x - it.x) < 0.05 && Math.abs(c.z - it.z) < 0.05); if (n.col) { n.colR = n.col.r; n.col.r = 0; } }
function showNode(n) { const it = n.it; it.gone = 0; n.gone = 0; n.hits = 0; if (n.col) n.col.r = n.colR;
  if (it.nearId !== undefined) { batch.setMatrixAt(it.nearId, it.matrix); lastLod.set(1e9, 0, 0); } else { const g = groupOf(it); if (g) g.dirty = 1; lastLod.set(1e9, 0, 0); }
  if (n.stumpId !== undefined) { batch.setVisibleAt(n.stumpId, false); } }
let curNode = null, useCd = 0; const anims = [];
function findNode() {
  const p = player.position, f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); let best = null, bs = 1e9;
  for (const n of nodes) { if (n.gone || n.depleted) continue; const dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz) - n.r; if (d > 1.6) continue; const dot = (dx * f.x + dz * f.z) / Math.max(0.01, Math.hypot(dx, dz)); const sc = d - dot * 0.8; if (dot > -0.2 && sc < bs) { bs = sc; best = n; } }
  return best;
}
function give(list) { for (const [id, k] of list) { if (!k) continue; const left = inv.add(id, k); if (k - left > 0) ui.pop(id, k - left); if (left) ui.pop(null, 0, 'Inventory full'); } }
function interact() {
  if (!hero || dead || performance.now() < useCd || ui.open()) return; const n = curNode; if (!n) return; const T = NODE_T[n.type];
  useCd = performance.now() + (T.anim === 'Interact' ? 700 : 600); heroFacing = Math.atan2(n.x - player.position.x, n.z - player.position.z); attackT = 0.4; attackHit = true; // reuse swing lock
  hero.play(T.anim, { once: true, fade: 0.08, speed: T.anim === 'Interact' ? 1.4 : 1.35 }); heroHurtT = 0.55;
  if (n.type === 'npc') { const lines = ['"Stay near the fire. They don\'t like the light."', '"I followed the blood trail north-west... found a bag, then ran."', '"Chop wood, find stone. We need to fortify this camp."', '"The cabin by the woods? Something broke the roof from inside."'];
    msg('Survivor: ' + lines[(n.hits++) % lines.length]); if (npcActor) { npcActor.obj.rotation.y = Math.atan2(player.position.x - n.x, player.position.z - n.z); npcActor.play('Interact', { once: true, fade: 0.15 }); setTimeout(() => npcActor.play('Idle', { fade: 0.4 }), 2200); } return; }
  if (n.type === 'loot') { for (const [id, k] of n.loot) { if (id === 'backpack') { if (inv.equipBackpack(k)) ui.pop(k === 1 ? 'backpack_canvas' : 'backpack_hide', 1); else ui.pop(null, 0, 'Already have a better backpack'); } else give([[id, k]]); }
    inv.looted.push(n.id); inv.save(); hideNode(n); return; }
  n.hits++;
  if (n.type === 'tree') shake(n);
  if (n.hits < T.hits) { give(T.give()); return; }
  give(T.last());
  if (n.type === 'tree') fell(n);
  else if (T.keep) { n.depleted = 1; setTimeout(() => { n.depleted = 0; n.hits = 0; }, T.respawn * 1000); }
  else { hideNode(n); setTimeout(() => showNode(n), T.respawn * 1000); }
}
const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _gv = new THREE.Vector3();
function shake(n) { if (n.it.nearId === undefined) return; anims.push({ n, t: 0, kind: 'shake', axis: new THREE.Vector3(rr(-1, 1), 0, rr(-1, 1)).normalize() }); n.it.anim = 1; batch.setVisibleAt(n.it.nearId, true); }
function fell(n) { const it = n.it; n.gone = 1; const away = new THREE.Vector3(it.x - player.position.x, 0, it.z - player.position.z).normalize(); anims.push({ n, t: 0, kind: 'fall', axis: new THREE.Vector3(away.z, 0, -away.x) });
  it.anim = 1; batch.setVisibleAt(it.nearId, true); farBatch.setVisibleAt(it.midId, false); if (it.farId !== undefined) farBatch.setVisibleAt(it.farId, false);
  n.col = colliders.find(c => !c.seg && Math.abs(c.x - it.x) < 0.05 && Math.abs(c.z - it.z) < 0.05); if (n.col) { n.colR = n.col.r; n.col.r = Math.min(n.col.r, 0.35); }
  // stump stays
  const G = batchGeo.get(D.stump); if (G) { if (n.stumpId === undefined) { n.stumpId = batch.addInstance(G.near); const h = G.bb.max.y - G.bb.min.y, s = (treeR(it.size) * 2.6) / Math.max(G.bb.max.x - G.bb.min.x, 0.01);
      batch.setMatrixAt(n.stumpId, new THREE.Matrix4().compose(new THREE.Vector3(it.x, heightAt(it.x, it.z) - G.bb.min.y * s - 0.05, it.z), new THREE.Quaternion(), new THREE.Vector3(s, Math.min(s, 0.6 / h), s))); batch.setColorAt(n.stumpId, _c.setScalar(0.95)); }
    batch.setVisibleAt(n.stumpId, true); }
  setTimeout(() => { it.anim = 0; showNode(n); }, NODE_T.tree.respawn * 1000);
}
function tickGather(dt) {
  for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i], it = a.n.it; a.t += dt; const base = _gv.set(it.x, heightAt(it.x, it.z), it.z);
    let ang = 0, sink = 0; if (a.kind === 'shake') { ang = Math.sin(a.t * 40) * 0.04 * Math.max(0, 1 - a.t / 0.35); if (a.t > 0.35) { anims.splice(i, 1); if (!a.n.gone) { it.anim = 0; batch.setMatrixAt(it.nearId, it.matrix); lastLod.set(1e9, 0, 0); } continue; } }
    else { const k = Math.min(1, a.t / 1.6); ang = (Math.PI / 2 - 0.08) * k * k; if (a.t > 3.5) sink = (a.t - 3.5) * 0.8; if (a.t > 6) { anims.splice(i, 1); batch.setVisibleAt(it.nearId, false); continue; } }
    _gq.setFromAxisAngle(a.axis, ang); _gm.makeTranslation(-base.x, -base.y, -base.z).premultiply(new THREE.Matrix4().makeRotationFromQuaternion(_gq)).premultiply(new THREE.Matrix4().makeTranslation(base.x, base.y - sink, base.z));
    batch.setMatrixAt(it.nearId, _gm.clone().multiply(it.matrix)); }
  if (!hero) return; const n = findNode(); curNode = n;
  ui.prompt(n && !ui.open() ? (isTouchUI ? '' : '[E] ') + (n.type === 'loot' ? 'Search ' + n.name : NODE_T[n.type].verb) + (NODE_T[n.type].hits > 1 && n.type !== 'loot' ? ` (${n.hits}/${NODE_T[n.type].hits})` : '') : '');
}
window.__inv = inv; window.__interact = () => { const r = { useCd, dead, open: ui.open(), cur: curNode && curNode.type, hero: !!hero }; interact(); return r; }; window.__ui = ui;

loadWorld();
loadCharacters().then(() => { setupHero(); if (Q.has('zdemo')) { const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); for (let i = 0; i < 4; i++) { const p = player.position.clone().addScaledVector(f, 3.5 + i * 1.6).add(new THREE.Vector3((i - 1.5) * 1.3, 0, 0)); spawnZombie(p.x, p.z, ['standing', 'hunched', 'crawler', 'hunched'][i]); } } else spawnWave(); window.__charsReady = true; window.__attack = heroAttack; window.__zombies = zombies; window.__hero = () => hero; console.log('[BAM] characters ready'); }).catch(e => console.error('[BAM] characters failed', e));
animate();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

if (DEBUG) window.__pose = (x, z, y) => { player.position.x = x; player.position.z = z; yaw = y; return [player.position.x, player.position.z]; };
if (DEBUG) window.__treeNear = () => { const t = items.filter(i => isTree(i.def) && !i.wall).sort((a, b) => Math.hypot(a.x - player.position.x, a.z - player.position.z) - Math.hypot(b.x - player.position.x, b.z - player.position.z))[0]; return { x: t.x, z: t.z, r: treeR(t.size) }; };
if (DEBUG) window.__cabin = () => CABIN;
if (DEBUG) window.__collTest = () => {
  const miss = {}; let n = 0; for (const it of items) { const k = isTree(it.def) ? 'tree' : it.def === D.rock && it.size > 0.6 ? 'rock' : [D.car, D.fence, D.log, D.stumpL].includes(it.def) ? 'prop' : null; if (!k || it.free) continue; n++; if (!solidAt(it.x, it.z, 0.05)) miss[k] = (miss[k] || 0) + 1; }
  const p = new THREE.Vector3(); let through = 0; for (const it of items.filter(i => isTree(i.def)).slice(0, 200)) { p.set(it.x + 0.05, 0, it.z); collide(p, 0.4); if (Math.hypot(p.x - it.x, p.z - it.z) < 0.4) through++; }
  return { checked: n, missing: miss, through, colliders: colliders.length, player: [player.position.x.toFixed(1), player.position.z.toFixed(1)], inSolid: solidAt(player.position.x, player.position.z, 0.3) };
};
if (DEBUG) window.__prof = () => {
  const out = []; const base = () => { renderer.info.reset(); renderer.info.autoReset = false; renderer.render(scene, camera); const r = { c: renderer.info.render.calls, t: renderer.info.render.triangles }; renderer.info.autoReset = true; return r; };
  const all = base(); out.push('ALL ' + JSON.stringify(all));
  for (const o of scene.children) { if (!o.visible) continue; o.visible = false; const r = base(); o.visible = true; const dt = all.t - r.t; if (dt > 3000 || all.c - r.c > 1) out.push((o.name || o.type) + ' ' + (o.geometry?.attributes?.position?.count || '') + ' calls ' + (all.c - r.c) + ' tris ' + dt + (o.material?.map ? ' tex' : '')); }
  return out.join('\n');
};
