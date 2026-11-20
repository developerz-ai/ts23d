// Pose strip for the review pack (plan 101 slice 10): the skinned asset rendered at each given pose
// — joint-limit (ROM) extremes and gait frames — in a labelled grid from ONE camera framed on the
// rest pose, so a collapsing elbow, a knee through the belly or a foot through the floor reads at a
// glance. Linear-blend skinning on the CPU, positions and normals, the sum every engine evaluates.

import {
  type CompiledAsset,
  dmath,
  encodePng,
  type Mesh,
  type Part,
  type Quat,
  quatRotate,
  SKIN_INFLUENCES,
  Ts23dError,
  toWorld,
  type Vec3,
  worldTransforms,
} from '../core/index.ts';
import { type BeautyOptions, renderBeauty } from './beauty.ts';
import { drawText } from './font.ts';

/** One panel: a label and every joint's world head + rotation (bones missing stay at rest). */
export interface PoseFrame {
  readonly label: string;
  readonly joints: ReadonlyMap<string, { readonly head: Vec3; readonly rot: Quat }>;
}

export interface PoseStripOptions
  extends Omit<BeautyOptions, 'frameFrom' | 'window' | 'width' | 'height'> {
  /** Panel size in pixels. Default 320 × 240. */
  readonly panel?: readonly [number, number];
  /** Panels per row. Default 6. */
  readonly columns?: number;
}

/** A skinned mesh (asset frame positions) under joint frames: positions and normals. */
export function posedMesh(
  m: Mesh,
  rest: readonly Vec3[],
  frames: readonly { head: Vec3; rot: Quat }[],
): Mesh {
  const js = m.joints;
  const ws = m.weights;
  if (!js || !ws) return m;
  const n = m.positions.length / 3;
  const positions = new Float32Array(m.positions.length);
  const normals = new Float32Array(m.normals.length);
  for (let v = 0; v < n; v++) {
    const p: Vec3 = [
      m.positions[v * 3] ?? 0,
      m.positions[v * 3 + 1] ?? 0,
      m.positions[v * 3 + 2] ?? 0,
    ];
    const q: Vec3 = [m.normals[v * 3] ?? 0, m.normals[v * 3 + 1] ?? 0, m.normals[v * 3 + 2] ?? 0];
    const acc = [0, 0, 0, 0, 0, 0];
    for (let s = 0; s < SKIN_INFLUENCES; s++) {
      const w = ws[v * SKIN_INFLUENCES + s] ?? 0;
      const j = js[v * SKIN_INFLUENCES + s] ?? 0;
      const f = frames[j];
      const h = rest[j];
      if (w === 0 || !f || !h) continue;
      const r = quatRotate(f.rot, [p[0] - h[0], p[1] - h[1], p[2] - h[2]]);
      const nr = quatRotate(f.rot, q);
      for (let k = 0; k < 3; k++) {
        acc[k] = (acc[k] ?? 0) + w * ((r[k] ?? 0) + (f.head[k] ?? 0));
        acc[k + 3] = (acc[k + 3] ?? 0) + w * (nr[k] ?? 0);
      }
    }
    const l = dmath.hypot(acc[3] ?? 0, acc[4] ?? 0, acc[5] ?? 1) || 1;
    positions.set([acc[0] ?? 0, acc[1] ?? 0, acc[2] ?? 0], v * 3);
    normals.set([(acc[3] ?? 0) / l, (acc[4] ?? 0) / l, (acc[5] ?? 0) / l], v * 3);
  }
  return { ...m, positions, normals };
}

/** The asset with every skinned part posed (moved to the asset frame, at the root). */
export function posedAsset(asset: CompiledAsset, frame: PoseFrame): CompiledAsset {
  const sk = asset.skeleton;
  if (!sk) return asset;
  const rest = sk.bones.map((b) => b.head);
  const frames = sk.bones.map(
    (b) => frame.joints.get(b.name) ?? { head: b.head, rot: [0, 0, 0, 1] as Quat },
  );
  const xf = worldTransforms(asset.parts);
  const parts = asset.parts.map((p): Part => {
    const m = p.mesh;
    const t = xf.get(p.name);
    if (!m?.joints || !t) return p;
    const positions = new Float32Array(m.positions.length);
    for (let i = 0; i < positions.length; i += 3)
      positions.set(
        toWorld(t, [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0]),
        i,
      );
    const normals = new Float32Array(m.normals.length);
    for (let i = 0; i < normals.length; i += 3)
      normals.set(
        toWorld({ origin: [0, 0, 0], yaw: t.yaw }, [
          m.normals[i] ?? 0,
          m.normals[i + 1] ?? 0,
          m.normals[i + 2] ?? 0,
        ]),
        i,
      );
    return {
      ...p,
      at: [0, 0, 0],
      yaw: 0,
      parent: null,
      mesh: posedMesh({ ...m, positions, normals }, rest, frames),
    };
  });
  return { ...asset, parts };
}

/** The strip PNG: panels left to right, top to bottom, each labelled. */
export function poseStrip(
  asset: CompiledAsset,
  frames: readonly PoseFrame[],
  o: PoseStripOptions = {},
): Uint8Array {
  if (!asset.skeleton || frames.length === 0)
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `pose strip of '${asset.name}': ${asset.skeleton ? 'no frames' : 'the asset has no skeleton'}`,
      fix: 'pass a skinned asset and at least one frame (qa poseFrames: ROM extremes + gait frames)',
    });
  const [w, h] = o.panel ?? [320, 240];
  const cols = Math.max(1, Math.min(o.columns ?? 6, frames.length));
  const rows = Math.max(1, Math.ceil(frames.length / cols));
  const W = w * cols;
  const out = new Uint8Array(W * h * rows * 4).fill(255);
  const { panel: _p, columns: _c, ...beauty } = o;
  frames.forEach((f, i) => {
    const r = renderBeauty(posedAsset(asset, f), {
      azDeg: -90,
      elDeg: 8,
      supersample: 1,
      ...beauty,
      width: w,
      height: h,
      frameFrom: asset,
    });
    const x0 = (i % cols) * w;
    const y0 = Math.floor(i / cols) * h;
    for (let y = 0; y < h; y++)
      out.set(r.rgba.subarray(y * w * 4, (y + 1) * w * 4), ((y0 + y) * W + x0) * 4);
    const label = f.label.toUpperCase().replace(/_/g, ' ').replace(/°/g, '');
    drawText(out, W, x0 + 8, y0 + 8, label, 2, [40, 44, 52]);
  });
  return encodePng(W, h * rows, out);
}
