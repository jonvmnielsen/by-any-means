import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
export function jsonToGlb(f) {
  const J = JSON.parse(fs.readFileSync(f)); const uri = J.buffers[0].uri; delete J.buffers[0].uri;
  const bin = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'); J.buffers[0].byteLength = bin.length;
  let js = Buffer.from(JSON.stringify(J)); const jp = (4 - js.length % 4) % 4; js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
  const bp = (4 - bin.length % 4) % 4; const b2 = Buffer.concat([bin, Buffer.alloc(bp)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + b2.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(b2.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  return new Uint8Array(Buffer.concat([h, c1, js, c2, b2]));
}
export function glbToJson(glb, out) {   // GLB -> glTF JSON with buffer embedded as base64 data URI
  const b = Buffer.from(glb); const jl = b.readUInt32LE(12); const J = JSON.parse(b.slice(20, 20 + jl).toString());
  const bl = b.readUInt32LE(20 + jl); const bin = b.slice(28 + jl, 28 + jl + bl);
  J.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64'); fs.writeFileSync(out, JSON.stringify(J));
}
