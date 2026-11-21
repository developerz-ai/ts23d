import { describe, expect, it } from 'bun:test';
import { createRng, dmath, type Vec3 } from '@developerz.ai/ts23d';
import { type FaceHead, faceHead } from '../_lib/face/head.ts';
import { LEFT, MIDLINE } from '../_lib/face/landmarks.ts';
import { tuskPath, wrapTusks } from '../_lib/face/tusks.ts';
import { CHARACTERS } from './characters.ts';

const orc = CHARACTERS.orc.character;
const length = orc.tusks ?? 0;
/** The face as buildFaceBust renders it: the lower lip wrapped round the tusks' bases. */
const raw = faceHead(orc, createRng(1).fork('face'));
const head = wrapTusks(raw, length);
/** The tusks' root radius (tusks.ts `tuskRadius` for the orc's knob). */
const R = 0.0058 * raw.scale * Math.max(1, length / 0.12);

/** The skin's front (largest x) near (y, z): the warped base's vertices in a 5 mm window. */
function frontX(h: FaceHead, y: number, z: number): number {
  const p = h.mesh.p;
  let x = Number.NEGATIVE_INFINITY;
  for (let v = 0; v < p.length; v += 3)
    if (Math.abs((p[v + 1] ?? 0) - y) < 0.005 && Math.abs((p[v + 2] ?? 0) - z) < 0.005)
      x = Math.max(x, p[v] ?? 0);
  return x;
}

/** How far a point stands in front of the skin (negative: inside the face). */
const proud = (h: FaceHead, q: Vec3): number => q[0] - frontX(h, q[1], q[2]);

/** Where the tusk leaves the face: the first path point after which it stays in the air. */
function exitOf(h: FaceHead, path: readonly Vec3[]): Vec3 {
  let i = path.length - 1;
  while (i > 0 && proud(h, path[i - 1] ?? [0, 0, 0]) > 0) i--;
  return path[i] ?? [0, 0, 0];
}

/** The tusk anatomy every orc must keep, in the face's own landmarks (bust metres). */
function tuskFindings(h: FaceHead, path: readonly Vec3[]): string[] {
  const st = h.map(MIDLINE.stomionInf);
  const inf = h.map(MIDLINE.labraleInf);
  const sup = h.map(MIDLINE.labraleSup);
  const al = h.map(LEFT.alare);
  const cl = h.map(LEFT.cheilion);
  const root = path[0] ?? [0, 0, 0];
  const tip = path[path.length - 1] ?? [0, 0, 0];
  const exit = exitOf(h, path);
  const out: string[] = [];
  if (!(root[2] < st[2] && proud(h, root) < -0.005 && Math.abs(root[1]) < Math.abs(cl[1])))
    out.push('root not in the lower jaw behind the lower lip');
  if (!(exit[2] > (inf[2] + st[2]) / 2 - 0.002 && exit[2] < sup[2]))
    out.push(`leaves the face at z ${exit[2].toFixed(3)}, not at the lower lip's top`);
  if (!(tip[2] > al[2] - 0.006 && tip[2] > sup[2])) out.push('tip below the nose wing');
  if (!(proud(h, tip) > 0.002 && proud(h, tip) < 0.025))
    out.push(`tip ${proud(h, tip).toFixed(3)} m off the face (in front, within 2.5 cm)`);
  const atLip = path.find((q) => q[2] >= sup[2]) ?? tip;
  if (!(proud(h, atLip) > 0.008)) out.push('not in front of the upper lip');
  return out;
}

describe('face_orc tusks (lower canines)', () => {
  it('a tusk hung from the upper lip (the old fang) is caught', () => {
    // Rooted above the mouth line and pointing down: the vampire-fang read.
    const st = head.map(MIDLINE.stomionSup);
    const fang = tuskPath(head, 0.16).map((q): Vec3 => [q[0], q[1], 2 * st[2] - q[2]]);
    expect(tuskFindings(head, fang).length).toBeGreaterThan(0);
  });
  it('roots behind the lower lip, leaves at its top, rises in front of the upper lip to the nose wing', () => {
    expect(length).toBe(0.16);
    expect(tuskFindings(head, tuskPath(head, length, 24))).toEqual([]);
  });

  it('the lower lip sleeves the tusk base and lets go of the exposed shaft (the unwrapped face fails)', () => {
    const path = tuskPath(head, length, 24);
    /** Nearest skin vertex of `h` to `q`, metres. */
    const nearest = (h: FaceHead, q: Vec3): number => {
      let d = Number.POSITIVE_INFINITY;
      const p = h.mesh.p;
      for (let v = 0; v < p.length; v += 3)
        d = Math.min(
          d,
          dmath.hypot((p[v] ?? 0) - q[0], (p[v + 1] ?? 0) - q[1], (p[v + 2] ?? 0) - q[2]),
        );
      return d;
    };
    // The buried base (root → the gum, a third of the path): no skin within the tusk's flank.
    const base = path.slice(1, 8);
    const clear = (h: FaceHead): number => Math.min(...base.map((q) => nearest(h, q)));
    expect(clear(raw)).toBeLessThan(R);
    expect(clear(head)).toBeGreaterThan(1.2 * R);
    // The exposed shaft (past where the lip lets go): the skin round it is the unwrapped face's.
    const shaft = path.slice(10);
    let moved = 0;
    const p = raw.mesh.p;
    const w = head.mesh.p;
    for (let v = 0; v < p.length; v += 3) {
      const q: Vec3 = [p[v] ?? 0, p[v + 1] ?? 0, p[v + 2] ?? 0];
      const d = (k: readonly Vec3[]): number =>
        Math.min(...k.map((c) => dmath.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2])));
      if (d(shaft) > 2.6 * R || d(shaft) > d(path.slice(0, 10))) continue;
      moved = Math.max(
        moved,
        dmath.hypot((w[v] ?? 0) - q[0], (w[v + 1] ?? 0) - q[1], (w[v + 2] ?? 0) - q[2]),
      );
    }
    expect(moved).toBeLessThan(0.02 * R);
  });
});
