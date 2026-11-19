// Deformations that move vertices carry their normals too (failure first: the stretched neck
// (pose.ts), the snapped horn and the torn wing edge (field.ts) moved vertices and kept the
// undeformed normals, so the lighting described the old surface). Each check deforms a fine
// sphere whose normals start true and compares them with the deformed faces.

import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { brokenTip, tornEdge } from './field.ts';
import { poseMesh } from './pose.ts';
import { JOINT } from './shoulder.ts';
import { SK } from './skeleton.ts';

/** A UV sphere with true (radial) normals, its seam welded. */
function sphere(c: Vec3, r: number, rings = 48, segs = 96): Mesh {
  const P: number[] = [];
  const N: number[] = [];
  const I: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * Math.PI;
    for (let j = 0; j < segs; j++) {
      const ph = (j / segs) * Math.PI * 2;
      const n: Vec3 = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      N.push(...n);
      P.push(c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const [a, a1] = [i * segs + j, i * segs + ((j + 1) % segs)];
      const [b, b1] = [a + segs, a1 + segs];
      I.push(a, b, a1, a1, b, b1);
    }
  const n = P.length / 3;
  return {
    positions: new Float32Array(P),
    normals: new Float32Array(N),
    uvs: new Float32Array(n * 2),
    colors: new Float32Array(n * 3).fill(1),
    indices: new Uint32Array(I),
  };
}

const at = (a: Float32Array, v: number): Vec3 => [
  a[v * 3] ?? 0,
  a[v * 3 + 1] ?? 0,
  a[v * 3 + 2] ?? 0,
];

/** Each triangle's normal from its winding, scaled by twice its area. */
function faceNormal(m: Mesh, t: number): Vec3 {
  const [a, b, c] = [0, 1, 2].map((k) => at(m.positions, m.indices[t + k] ?? 0));
  const u = [0, 1, 2].map((k) => (b?.[k] ?? 0) - (a?.[k] ?? 0));
  const v = [0, 1, 2].map((k) => (c?.[k] ?? 0) - (a?.[k] ?? 0));
  const f: Vec3 = [
    (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
    (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
    (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
  ];
  return f;
}

/** The worst agreement (dot) between a picked vertex's normal and its faces' area-weighted mean. */
function worst(m: Mesh, pick: (v: number) => boolean): number {
  const acc = new Float64Array(m.positions.length);
  for (let t = 0; t < m.indices.length; t += 3) {
    const f = faceNormal(m, t);
    for (let k = 0; k < 3; k++) {
      const v = m.indices[t + k] ?? 0;
      for (let c = 0; c < 3; c++) acc[v * 3 + c] = (acc[v * 3 + c] ?? 0) + (f[c] ?? 0);
    }
  }
  let w = 1;
  for (let v = 0; v < m.positions.length / 3; v++) {
    if (!pick(v)) continue;
    const g: Vec3 = [acc[v * 3] ?? 0, acc[v * 3 + 1] ?? 0, acc[v * 3 + 2] ?? 0];
    const l = Math.hypot(...g);
    if (l === 0) continue;
    const n = at(m.normals, v);
    w = Math.min(w, (n[0] * g[0] + n[1] * g[1] + n[2] * g[2]) / l);
  }
  return w;
}

const TWO_DEG = Math.cos((2 * Math.PI) / 180);
const POLE = (m: Mesh) => (v: number) => Math.abs(at(m.normals, v)[2]) < 0.9;

describe('poseMesh normals follow the stretch', () => {
  it('along the neck (body family)', () => {
    const [a, b] = [SK.neck[1] ?? [0, 0, 0], SK.neck[2] ?? [0, 0, 0]];
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const ball = sphere(mid, 0.03);
    const posed = poseMesh(ball, 'body');
    expect(worst(posed, POLE(ball))).toBeGreaterThan(TWO_DEG);
    // The check is not blind: the bind normals disagree with the stretched faces.
    expect(worst({ ...posed, normals: ball.normals }, POLE(ball))).toBeLessThan(TWO_DEG);
  });

  it('in the stretched leg band (every family)', () => {
    const z = (SK.fore.elbow[2] + SK.fore.palm[2]) / 2;
    for (const family of ['body', 'rigid'] as const) {
      const ball = sphere([SK.fore.elbow[0], 0.4, z], 0.02);
      expect(worst(poseMesh(ball, family), POLE(ball))).toBeGreaterThan(TWO_DEG);
    }
  });
});

describe('field.ts deformations carry their normals', () => {
  it('the snapped horn: every vertex pressed onto the break follows its new faces', () => {
    const horn = sphere([0, 0, 0.5], 0.1);
    const snapped = brokenTip(horn, [0, 0, 0.5], 0.6);
    const moved = (v: number) =>
      [0, 1, 2].some((k) => snapped.positions[v * 3 + k] !== horn.positions[v * 3 + k]);
    let count = 0;
    for (let v = 0; v < horn.positions.length / 3; v++) if (moved(v)) count++;
    expect(count).toBeGreaterThan(20);
    expect(worst(snapped, moved)).toBeGreaterThan(TWO_DEG);
    expect(worst({ ...snapped, normals: horn.normals }, moved)).toBeLessThan(TWO_DEG);
  });

  it('the torn wing edge: normals follow the pulled-in notch', () => {
    // A ball on the panel between the second and third fingers, in the left wing pivot's frame.
    const [tk, tn] = [SK.wing.tips[1] ?? SK.wing.wrist, SK.wing.tips[2] ?? SK.wing.wrist];
    const c: Vec3 = [
      (tk[0] + tn[0]) / 2 - JOINT[0],
      (tk[1] + tn[1]) / 2 - JOINT[1],
      (tk[2] + tn[2]) / 2 - JOINT[2],
    ];
    const ball = sphere(c, 0.2);
    const torn = tornEdge(ball, 1, 1, 0.55, 0.05);
    // Off the notch's apex (the rim vertex, pulled the farthest: a cone point with no one normal).
    let apex = 0;
    let most = 0;
    for (let v = 0; v < ball.positions.length / 3; v++) {
      const [p, q] = [at(ball.positions, v), at(torn.positions, v)];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d > most) [most, apex] = [d, v];
    }
    const apexAt = at(ball.positions, apex);
    const pick = (v: number) => {
      const p = at(ball.positions, v);
      return (
        POLE(ball)(v) && Math.hypot(p[0] - apexAt[0], p[1] - apexAt[1], p[2] - apexAt[2]) > 0.06
      );
    };
    expect(worst(torn, pick)).toBeGreaterThan(TWO_DEG);
    expect(worst({ ...torn, normals: ball.normals }, pick)).toBeLessThan(TWO_DEG);
  });
});
