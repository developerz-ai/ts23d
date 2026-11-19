import { describe, expect, it } from 'bun:test';
import { BeltLoop, box, compile, defineAsset, type Mesh, merge, place, tread } from '../index.ts';
import { treads } from './treads.ts';

const c: [number, number, number] = [0.3, 0.3, 0.3];
/** A rounded belt line in the side plane: two half turns of 0.25 m, 2 m apart. */
const line: [number, number][] = [
  ...Array.from({ length: 40 }, (_, i): [number, number] => [-1 + i / 20, 0]),
  ...Array.from({ length: 60 }, (_, i): [number, number] => {
    const a = -Math.PI / 2 + (Math.PI * i) / 60;
    return [1 + 0.25 * Math.cos(a), 0.25 + 0.25 * Math.sin(a)];
  }),
  ...Array.from({ length: 40 }, (_, i): [number, number] => [1 - i / 20, 0.5]),
  ...Array.from({ length: 60 }, (_, i): [number, number] => {
    const a = Math.PI / 2 + (Math.PI * i) / 60;
    return [-1 + 0.25 * Math.cos(a), 0.25 + 0.25 * Math.sin(a)];
  }),
];
const loop = new BeltLoop(line.map(([x, z]) => [x, 1, z]));
const LINKS = 32;
const PITCH = loop.length / LINKS;

/** `LINKS` plates laid along the line; `skip` leaves one out. */
function links(skip = -1): Mesh {
  const f = new Float64Array(6);
  const plate = box({ size: [PITCH * 0.8, 0.4, 0.04], color: c });
  return merge(
    Array.from({ length: LINKS }, (_, k) => k)
      .filter((k) => k !== skip)
      .map((k) => {
        loop.frame(k * PITCH, f);
        return place(plate, {
          at: [f[0] ?? 0, 1, f[2] ?? 0],
          pitch: Math.atan2(-(f[5] ?? 0), f[3] ?? 1),
        });
      }),
  );
}

const tank = (mesh: Mesh, pitch: number | null) =>
  compile(
    defineAsset({
      name: 'belt_probe',
      kind: 'vehicle',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        ctx.part('track_l', mesh, pitch === null ? {} : { motion: tread(line, 1, pitch) });
        ctx.part('track_dust_l', box({ size: [0.1, 0.1, 0.1], color: [0.3, 0.3, 0.3] }));
      },
    }),
  );

describe('treads gate', () => {
  it('fails a static track belt', () => {
    const f = treads(tank(links(), null));
    expect(f.map((x) => x.part)).toEqual(['track_l']);
    expect(f[0]?.fix).toContain('tread(');
  });

  it('fails a belt whose loop is not a whole number of pitches', () => {
    const f = treads(tank(links(), PITCH * 1.016));
    expect(f.map((x) => x.code)).toEqual(['T3D_QA_TREADS']);
    expect(f[0]?.message).toContain('31.50 pitches');
    expect(f[0]?.fix).toContain('loop length ÷ link count');
  });

  it('fails a belt that does not repeat every pitch: a missing link, a plain slab', () => {
    const gap = treads(tank(links(5), PITCH));
    expect(gap.map((x) => x.part)).toEqual(['track_l']);
    expect(gap[0]?.message).toContain('24 of 744 vertices have no twin');
    expect(gap[0]?.fix).toContain('one pitch apart');
    const slab = box({ size: [2, 0.4, 0.5], at: [0, 1, 0], color: c });
    expect(treads(tank(slab, PITCH))[0]?.message).toContain('does not repeat');
  });

  it('fails a belt whose links differ in colour or UV from the link one pitch on', () => {
    const even = links();
    // Mud by height, painted over the placed belt: dark on the ground run, clean on the top run.
    const colors = even.colors.map((v, i) =>
      (even.positions[Math.floor(i / 3) * 3 + 2] ?? 0) < 0.1 ? v * 0.5 : v,
    );
    const muddy = treads(tank({ ...even, colors }, PITCH));
    expect(muddy.map((x) => x.code)).toEqual(['T3D_QA_TREADS']);
    expect(muddy[0]?.message).toContain('does not look the same one pitch on');
    expect(muddy[0]?.message).toContain('colour by up to 0.150');
    expect(muddy[0]?.fix).toContain('per link');
    // One link (24 vertices) mapped to another place on the sheet.
    const uvs = even.uvs.map((v, i) => (i < 48 ? v + 0.25 : v));
    const moved = treads(tank({ ...even, uvs }, PITCH));
    expect(moved[0]?.message).toContain('UV by up to 0.2500');
    // A shade under the tolerance (float noise of a per-link pass) is not a finding.
    const faint = even.colors.map((v, i) => (i < 72 ? v + 0.004 : v));
    expect(treads(tank({ ...even, colors: faint }, PITCH))).toEqual([]);
  });

  it('reads a UV seam (two vertices on one point, one normal) as one place', () => {
    // Every plate twice on the same spot, the copy mapped elsewhere: a twin search lands on
    // either copy, and each has a twin that looks the same.
    const plate = links();
    const copy = { ...plate, uvs: plate.uvs.map((v) => v + 0.5) };
    expect(treads(tank(merge([plate, copy]), PITCH))).toEqual([]);
  });

  it('passes a belt of links one pitch apart and ignores other track_* names', () => {
    expect(treads(tank(links(), PITCH))).toEqual([]);
  });

  it('ignores a tread part with no geometry at this LOD', () => {
    const asset = tank(links(), PITCH);
    const bare = { ...asset, parts: asset.parts.map((p) => ({ ...p, mesh: null })) };
    expect(treads(bare)).toEqual([]);
  });
});
