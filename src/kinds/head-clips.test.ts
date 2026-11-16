// Head clips: a broken rig is refused; blink moves only the lids, talk only the lower face, breathe
// only the chest; every mesh gets the same three targets; the clips key all three and loop.

import { describe, expect, it } from 'bun:test';
import { type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { type FaceRig, faceMorphs, HEAD_MORPHS, headClips } from './head-clips.ts';

/** A UV ball: 10 cm radius at z = 0.4 (a head), outward normals. */
function ball(r: number, z: number, rings = 32, seg = 48): Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j < seg; j++) {
      const t = (i / rings) * Math.PI;
      const p = (j / seg) * Math.PI * 2;
      const n = [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
      nor.push(...n);
      pos.push((n[0] ?? 0) * r, (n[1] ?? 0) * r, (n[2] ?? 0) * r + z);
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      idx.push(a, a + seg, b, b, a + seg, b + seg);
    }
  const v = pos.length / 3;
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    uvs: new Float32Array(v * 2),
    colors: new Float32Array(v * 3).fill(0.7),
    indices: new Uint32Array(idx),
  };
}
const head = ball(0.1, 0.4);
const rig: FaceRig = {
  eye: { centre: [0.085, 0.035, 0.43], r: 0.012, lid: 0.002 },
  jaw: { hinge: [0.0, 0.07, 0.39], chin: [0.08, 0, 0.31], lips: 0.36 },
  chest: { centre: [0, 0, 0.12], r: 0.12 },
};

const moved = (m: Mesh, name: string): Vec3[] => {
  const t = m.morphs?.find((x) => x.name === name);
  const out: Vec3[] = [];
  for (let v = 0; v < m.positions.length / 3; v++)
    if (
      Math.hypot(
        t?.positions[v * 3] ?? 0,
        t?.positions[v * 3 + 1] ?? 0,
        t?.positions[v * 3 + 2] ?? 0,
      ) > 1e-6
    )
      out.push([m.positions[v * 3] ?? 0, m.positions[v * 3 + 1] ?? 0, m.positions[v * 3 + 2] ?? 0]);
  return out;
};

describe('head morphs', () => {
  it('refuses a jaw hinge below the chin and a zero eye', () => {
    expect(() => faceMorphs(head, { ...rig, jaw: { ...rig.jaw, hinge: [0, 0.07, 0.2] } })).toThrow(
      Ts23dError,
    );
    expect(() => faceMorphs(head, { ...rig, eye: { ...rig.eye, r: 0 } })).toThrow('eye r 0');
  });

  it('adds blink, talk, breathe in that order, replacing older ones of those names', () => {
    const once = faceMorphs(head, rig);
    expect(once.morphs?.map((m) => m.name)).toEqual([...HEAD_MORPHS]);
    expect(faceMorphs(once, rig).morphs?.map((m) => m.name)).toEqual([...HEAD_MORPHS]);
  });

  it('blink moves only round the eyes, talk only below the lips, breathe nothing on a head', () => {
    const m = faceMorphs(head, rig);
    const lids = moved(m, 'blink');
    expect(lids.length).toBeGreaterThan(0);
    for (const p of lids)
      expect(Math.hypot(p[0] - 0.085, Math.abs(p[1]) - 0.035, p[2] - 0.43)).toBeLessThan(0.03);
    const jaw = moved(m, 'talk');
    expect(jaw.length).toBeGreaterThan(0);
    for (const p of jaw) expect(p[2]).toBeLessThan(0.36 + 0.004);
    expect(moved(m, 'breathe')).toEqual([]);
    expect(moved(faceMorphs(ball(0.1, 0.12), rig), 'breathe').length).toBeGreaterThan(0);
  });
});

describe('head clips', () => {
  it('key all three weights on the part and close every loop', () => {
    const clips = headClips('face');
    expect(clips.map((c) => c.name)).toEqual(['blink', 'talk', 'breathe']);
    for (const c of clips) {
      const t = c.tracks[0];
      expect(t && 'part' in t ? t.part : '').toBe('face');
      const n = t?.times.length ?? 0;
      expect((t?.values.length ?? 0) / n).toBe(3);
      expect([...(t?.values.subarray(0, 3) ?? [])]).toEqual([
        ...(t?.values.subarray((n - 1) * 3) ?? []),
      ]);
      expect(Math.max(...(t?.values ?? []))).toBeGreaterThan(0.9);
    }
  });
});
