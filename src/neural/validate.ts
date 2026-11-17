// Task validation of model outputs, after the structural check (checkNeuralResult): PNGs decode at
// the requested size, GLBs parse with finite positions under the triangle cap (a rig GLB carries a
// skin, a cloth or groom GLB has triangles, a fracture GLB ≥ 2 pieces; a meshopt GLB is compressed, so only
// its container is read; a `blender` GLB comes first, has a node `lod0` and its cap counts LOD0
// alone; its report is second and only review PNGs follow), KTX2 has its identifier, JSON parses.
// Every refusal is
// T3D_NEURAL_OUTPUT_INVALID: a model's (or tool's) bytes are untrusted.

import {
  type NeuralOutput,
  type NeuralRequest,
  type NeuralResult,
  type NeuralTask,
  Ts23dError,
} from '../core/index.ts';
import { arr, readGlb } from './glb-read.ts';
import { type ScenePrimitive, scenePrimitives } from './glb-scene.ts';
import { readPng } from './png-read.ts';

function bad(task: NeuralTask, i: number, cause: string, fix: string): never {
  throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
    cause: `${task}: output ${i} ${cause}`,
    fix,
  });
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function png(task: NeuralTask, i: number, o: NeuralOutput, want?: [number, number]): void {
  const img = ((): { width: number; height: number } => {
    try {
      return readPng(o.bytes, `${task} output ${i}`);
    } catch (e) {
      return bad(task, i, `does not decode as PNG (${why(e)})`, 'return 8-bit RGB(A) PNG bytes');
    }
  })();
  if (want && (img.width !== want[0] || img.height !== want[1]))
    bad(
      task,
      i,
      `is ${img.width}×${img.height}, asked ${want[0]}×${want[1]}`,
      'return the size the request asked for',
    );
}

function glb(task: NeuralTask, i: number, o: NeuralOutput, maxTriangles?: number): void {
  const { prims, skins } = ((): { prims: ScenePrimitive[]; skins: number } => {
    try {
      const doc = readGlb(o.bytes);
      return { prims: scenePrimitives(doc), skins: arr(doc.json, 'skins').length };
    } catch (e) {
      return bad(task, i, `is not a readable GLB (${why(e)})`, 'return glTF 2.0 binary bytes');
    }
  })();
  // A step program's GLB holds every LOD: only the node `lod0` (and its extra primitives) counts.
  const lod0 = (name: string): boolean => name === 'lod0' || name.startsWith('lod0_');
  if (task === 'blender' && !prims.some((p) => lod0(p.name)))
    bad(task, i, "has no mesh node named 'lod0'", "end the program with { op: 'export' }");
  let tris = 0;
  for (const p of prims) {
    if (!p.mesh.positions.every(Number.isFinite))
      bad(task, i, `has non-finite positions in '${p.name}'`, 'fix the model export');
    if (task !== 'blender' || lod0(p.name)) tris += p.mesh.indices.length / 3;
  }
  if (TRIANGLES.includes(task) && tris === 0)
    bad(task, i, 'has no triangles', 'return a triangle mesh');
  if (task === 'fracture' && prims.length < 2)
    bad(task, i, `has ${prims.length} piece(s)`, 'fracture into ≥ 2 pieces (raise pieces)');
  if (maxTriangles !== undefined && tris > maxTriangles)
    bad(
      task,
      i,
      `has ${tris} triangles, cap ${maxTriangles}`,
      'decimate on the server or raise maxTriangles',
    );
  if (task === 'rig' && skins === 0) bad(task, i, 'has no skin', 'return a skinned GLB (skins[0])');
}

const TRIANGLES: readonly NeuralTask[] = ['mesh', 'cloth', 'groom', 'blender'];

/** A compressed GLB (EXT_meshopt_compression): header, version 2 and a JSON chunk with meshes. */
function glbShell(task: NeuralTask, i: number, o: NeuralOutput): void {
  const b = o.bytes;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2)
    bad(task, i, 'is not a glTF 2.0 binary', 'return GLB bytes');
  const len = dv.getUint32(12, true);
  let meshes: unknown;
  try {
    const doc = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len))) as {
      meshes?: unknown;
    };
    meshes = doc.meshes;
  } catch (e) {
    bad(task, i, `has an unreadable JSON chunk (${why(e)})`, 'return GLB bytes');
  }
  if (!Array.isArray(meshes) || meshes.length === 0)
    bad(task, i, 'has no meshes', 'check the tool kept the meshes');
}

const KTX2_ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

function ktx2(task: NeuralTask, i: number, o: NeuralOutput): void {
  if (o.bytes.length < 80 || KTX2_ID.some((x, k) => o.bytes[k] !== x))
    bad(task, i, 'is not a KTX2 file (bad identifier)', 'return .ktx2 bytes (basisu -ktx2)');
}

function json(task: NeuralTask, i: number, o: NeuralOutput): void {
  try {
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(o.bytes));
  } catch (e) {
    bad(task, i, `is not JSON (${why(e)})`, 'return UTF-8 JSON bytes');
  }
}

export function validateOutputs<T extends NeuralTask>(
  task: T,
  request: NeuralRequest<T>,
  result: NeuralResult<T>,
): void {
  const r = request as unknown as Readonly<Record<string, unknown>>;
  const size = (): [number, number] | undefined => {
    if (task === 'image') return [Number(r['width']), Number(r['height'])];
    if (task === 'texture') return [Number(r['size']), Number(r['size'])];
    return undefined;
  };
  const cap = typeof r['maxTriangles'] === 'number' ? r['maxTriangles'] : undefined;
  if (task === 'blender') {
    if (result.outputs[0]?.mime !== 'model/gltf-binary')
      bad(task, 0, 'is not the GLB', 'return the GLB first, then the JSON report');
    // After the GLB and the report come only the review renders.
    result.outputs.forEach((o, i) => {
      if (i >= 1 && o.mime !== (i === 1 ? 'application/json' : 'image/png'))
        bad(
          task,
          i,
          `is ${o.mime}, not ${i === 1 ? 'the JSON report' : 'a review PNG'}`,
          'return the GLB, the JSON report, then the review PNGs',
        );
    });
  }
  result.outputs.forEach((o, i) => {
    if (o.mime === 'image/png') png(task, i, o, size());
    else if (o.mime === 'image/ktx2') ktx2(task, i, o);
    else if (o.mime === 'model/gltf-binary' && task === 'meshopt') glbShell(task, i, o);
    else if (o.mime === 'model/gltf-binary') glb(task, i, o, cap);
    else json(task, i, o);
  });
}
