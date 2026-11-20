import { expect, it } from 'bun:test';
import {
  boundsOf,
  compile,
  defineAsset,
  dmath,
  rotateZ,
  type Vec3,
  worldTransforms,
} from '../core/index.ts';
import { bindRigid } from '../passes/index.ts';
import { box } from '../primitives/index.ts';
import { readGlbChunks } from './finish-glb.ts';
import { toGlb } from './glb.ts';
import { mergeToPivots } from './merge-pivots.ts';
import { albedo, hide, plate } from './texture-fixtures.ts';
import { floats } from './tread-fixtures.ts';

const c: [number, number, number] = [1, 1, 1];

it('merges static parts into their pivot and keeps pivots by name', () => {
  const tank = defineAsset({
    name: 'tank',
    kind: 'vehicle',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      ctx.part('hull_a', box({ size: [2, 1, 1], color: c }));
      ctx.part('hull_b', box({ size: [1, 1, 0.5], color: c }), { at: [0, 0, 1] });
      ctx.group('turret', { at: [0, 0, 1.5], yaw: 0.3 });
      ctx.part('turret_body', box({ size: [1, 1, 0.5], color: c }), { parent: 'turret' });
      ctx.part('hatch', box({ size: [0.3, 0.3, 0.1], color: c }), {
        parent: 'turret',
        at: [0, 0, 0.5],
      });
    },
  });
  const merged = mergeToPivots(compile(tank));
  expect(merged.parts.map((p) => p.name)).toEqual(['body', 'turret']);
  const turret = merged.parts[1];
  // Turret-local: the hatch sits on top of the body, both still in the turret's own frame.
  expect(turret?.mesh && boundsOf(turret.mesh).max[2]).toBeCloseTo(0.6, 5);
});

const spin = { kind: 'spin', axis: [0, 1, 0], rps: 1 } as const;

it('re-parents a pivot past a static chain to the root, at its world transform', () => {
  const asset = compile(
    defineAsset({
      name: 'chain',
      kind: 'vehicle',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        ctx.part('frame', box({ size: [1, 1, 1], color: c }), { at: [0, 0, 1], yaw: Math.PI / 2 });
        ctx.part('axle', box({ size: [0.2, 0.2, 0.2], color: c }), {
          parent: 'frame',
          at: [1, 0, 0],
          yaw: Math.PI / 2,
        });
        ctx.part('wheel', box({ size: [0.2, 0.2, 0.2], color: c }), {
          parent: 'axle',
          at: [0.5, 0, 0],
          motion: spin,
        });
      },
    }),
  );
  const wheel = mergeToPivots(asset).parts.find((p) => p.name === 'wheel');
  const qa = worldTransforms(asset.parts).get('wheel');
  expect(wheel?.parent).toBeNull();
  expect(wheel?.yaw).toBeCloseTo(Math.PI, 9);
  for (const k of [0, 1, 2]) expect(wheel?.at[k] ?? 9).toBeCloseTo(qa?.origin[k] ?? 0, 9);
});

it('re-parents to the nearest pivot ancestor and keeps moving-under-moving chains', () => {
  const asset = compile(
    defineAsset({
      name: 'rotor',
      kind: 'vehicle',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        ctx.group('turret', { at: [0, 0, 1], yaw: 0.3 });
        ctx.part('mount', box({ size: [0.4, 0.4, 0.4], color: c }), {
          parent: 'turret',
          at: [1, 0, 0],
          yaw: 0.2,
        });
        ctx.part('hub', box({ size: [0.2, 0.2, 0.2], color: c }), {
          parent: 'mount',
          at: [0, 0.5, 0],
          motion: spin,
        });
        ctx.part('blade', box({ size: [0.1, 0.6, 0.02], color: c }), {
          parent: 'hub',
          at: [0, 0, 0.2],
          motion: { kind: 'spin', axis: [0, 0, 1], rps: 2 },
        });
      },
    }),
  );
  const merged = mergeToPivots(asset);
  const hub = merged.parts.find((p) => p.name === 'hub');
  const blade = merged.parts.find((p) => p.name === 'blade');
  expect(hub?.parent).toBe('turret');
  expect(hub?.yaw).toBeCloseTo(0.2, 9);
  // Turret-local: the mount's 0.2 rad yaw turns the hub's [0, 0.5, 0] offset.
  expect(hub?.at[0] ?? 9).toBeCloseTo(1 - 0.5 * dmath.sin(0.2), 9);
  expect(hub?.at[1] ?? 9).toBeCloseTo(0.5 * dmath.cos(0.2), 9);
  expect(blade?.parent).toBe('hub');
  expect(blade?.at).toEqual([0, 0, 0.2]);
});

it('never merges a texture set with trim-sheet geometry or another set under one pivot', () => {
  const door = defineAsset({
    name: 'door',
    kind: 'prop',
    budget: { triangles: [999, 999, 999], textureSets: { count: 2, size: 1024 } },
    build(ctx) {
      // A moving textured pivot with an untextured static child and a second set on it.
      ctx.part('leaf', plate(1), { motion: spin, textures: hide });
      ctx.part('knob', box({ size: [0.1, 0.1, 0.1], color: c }), { parent: 'leaf' });
      ctx.part('sign', plate(1), { parent: 'leaf', textures: { name: 'sign', albedo } });
      ctx.part('frame', plate(2), { textures: hide });
    },
  });
  const merged = mergeToPivots(compile(door));
  const seen = merged.parts.map((p) => [p.name, p.textures?.name ?? null, p.parent]);
  expect(seen).toEqual([
    // Static geometry of one set and nothing else: the root carries the set itself.
    ['body', 'hide', null],
    // The pivot's own mesh is its trim-sheet child; each set is its own draw.
    ['leaf', null, null],
    ['leaf_tex_hide', 'hide', 'leaf'],
    ['leaf_tex_sign', 'sign', 'leaf'],
  ]);
  const tris = (name: string): number =>
    (merged.parts.find((p) => p.name === name)?.mesh?.indices.length ?? 0) / 3;
  expect([tris('body'), tris('leaf'), tris('leaf_tex_hide'), tris('leaf_tex_sign')]).toEqual([
    8, 12, 2, 2,
  ]);
  expect(merged.parts.find((p) => p.name === 'leaf')?.motion).toEqual(spin);
});

it("keeps a moving painted pivot's slot off its unpainted children", () => {
  const cab = defineAsset({
    name: 'cab',
    kind: 'vehicle',
    budget: { triangles: [999, 999, 999] },
    paint: { body: [0.5, 0.1, 0.1] },
    build(ctx) {
      ctx.part('door', box({ size: [1, 0.1, 1], color: [0.5, 0.1, 0.1] }), {
        motion: spin,
        paint: 'body',
      });
      ctx.part('handle', box({ size: [0.1, 0.1, 0.1], color: c }), { parent: 'door' });
    },
  });
  const merged = mergeToPivots(compile(cab));
  expect(merged.parts.map((p) => [p.name, p.paint ?? null])).toEqual([
    ['door', null],
    ['door_paint_body', 'body'],
  ]);
});

// A skinned child placed with `ctx.use`: its bones land in the parent's frame, so its mesh must
// too, in the root's skinned body, not under the still prefix group (a skinned node away from the
// root is refused by the writer, and a morph delta left unturned would point the wrong way).
const AT: Vec3 = [0, 1, 0.2];
const YAW = Math.PI / 2;
const placed = (p: Vec3): Vec3 => {
  const r = rotateZ(p, YAW);
  return [r[0] + AT[0], r[1] + AT[1], r[2] + AT[2]];
};
const forearm = defineAsset({
  name: 'forearm',
  kind: 'creature',
  budget: { triangles: [999, 999, 999] },
  build(ctx) {
    ctx.bone('upper', { head: [0, 0, 0], tail: [0, 0, 0.5] });
    ctx.bone('fore', { head: [0, 0, 0.5], tail: [0, 0, 1], parent: 'upper' });
    const flesh = bindRigid(box({ size: [0.2, 0.2, 1], color: c }), 1);
    const bulge = new Float32Array(flesh.positions.length);
    for (let i = 0; i < bulge.length; i += 3) bulge[i] = 0.1;
    ctx.part('skin', { ...flesh, morphs: [{ name: 'bulge', positions: bulge }] });
  },
});
const rig = (moving: boolean) =>
  compile(
    defineAsset({
      name: 'rig',
      kind: 'creature',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        ctx.bone('root', { head: [0, 0, 0], tail: [0, 0, 0.1] });
        ctx.part('pelvis', bindRigid(box({ size: [0.3, 0.3, 0.1], color: c }), 0));
        if (moving) ctx.group('arm', { motion: spin });
        ctx.use(forearm, { prefix: 'l', at: AT, yaw: YAW, ...(moving ? { parent: 'arm' } : {}) });
      },
    }),
  );

it('bakes a skinned part under a still group into the root body, in world space', () => {
  const merged = mergeToPivots(rig(false));
  const group = merged.parts.find((p) => p.name === 'l');
  expect(group?.mesh).toBeNull();
  expect(merged.parts.filter((p) => p.mesh?.joints).map((p) => p.name)).toEqual(['body']);
  // The file: the far corner of the forearm, where the use put it, on the prefixed bone.
  const { json, bin } = readGlbChunks(toGlb(rig(false)));
  type Prim = { attributes: Record<string, number>; targets?: Record<string, number>[] };
  const nodes = json['nodes'] as { name: string; mesh?: number }[];
  const body = nodes.find((n) => n.name === 'body');
  const prim = (json['meshes'] as { primitives: Prim[] }[])[body?.mesh ?? -1]?.primitives[0];
  if (!prim) throw new Error('no body mesh');
  const positions = floats(json, bin, prim.attributes['POSITION'] ?? -1, 3);
  const corner: Vec3 = [0.1, 0.1, 1];
  const want = placed(corner);
  const near = (v: number, to: Vec3): number =>
    dmath.norm(to.map((x, k) => (positions[v * 3 + k] ?? 0) - x));
  const v = [...Array(positions.length / 3).keys()].find((i) => near(i, want) < 1e-5) ?? -1;
  expect(v).toBeGreaterThanOrEqual(0);
  const skin = (json['skins'] as { joints: number[]; inverseBindMatrices: number }[])[0];
  const fore = (skin?.joints ?? []).findIndex((j) => nodes[j]?.name === 'l_fore');
  const u16 = (index: number): Uint16Array => {
    const acc = (json['accessors'] as { bufferView: number; byteOffset?: number }[])[index];
    const view = (json['bufferViews'] as { byteOffset?: number }[])[acc?.bufferView ?? -1];
    const at = bin.byteOffset + (view?.byteOffset ?? 0) + (acc?.byteOffset ?? 0);
    return new Uint16Array(bin.buffer.slice(at, at + (positions.length / 3) * 8));
  };
  expect(fore).toBeGreaterThan(0);
  expect(u16(prim.attributes['JOINTS_0'] ?? -1)[v * 4]).toBe(fore);
  expect(u16(prim.attributes['WEIGHTS_0'] ?? -1)[v * 4]).toBe(65535);
  // The morph delta (+0.1 along the child's X) turned with the yaw: +0.1 along the parent's Y.
  const delta = floats(json, bin, prim.targets?.[0]?.['POSITION'] ?? -1, 3);
  expect([...delta.subarray(v * 3, v * 3 + 3)].map((x) => Math.round(x * 1e5) / 1e5)).toEqual([
    0, 0.1, 0,
  ]);
  // Posed: turn the forearm bone a quarter about Z. The bone's head is minus its inverse bind
  // translation; the vertex must land where the child's own pose, then the use, puts it.
  const ibm = floats(json, bin, skin?.inverseBindMatrices ?? -1, 16).subarray(fore * 16);
  const head: Vec3 = [-(ibm[12] ?? 0), -(ibm[13] ?? 0), -(ibm[14] ?? 0)];
  const quarter = (p: Vec3, about: Vec3): Vec3 => {
    const r = rotateZ([p[0] - about[0], p[1] - about[1], p[2] - about[2]], Math.PI / 2);
    return [r[0] + about[0], r[1] + about[1], r[2] + about[2]];
  };
  const posed = quarter(
    [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0],
    head,
  );
  const expected = placed(quarter(corner, [0, 0, 0.5]));
  posed.forEach((x, k) => {
    expect(x).toBeCloseTo(expected[k] ?? 0, 5);
  });
});

it('leaves a skinned part under a moving pivot there, for the writer to refuse', () => {
  const merged = mergeToPivots(rig(true));
  expect(merged.parts.find((p) => p.name === 'l')?.mesh?.joints).toBeDefined();
  expect(() => toGlb(rig(true))).toThrow('T3D_SKIN_INVALID');
});
