import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  defineAsset,
  LOOP_SECONDS,
  type Part,
} from '../core/index.ts';
import { BeltLoop } from '../passes/index.ts';
import { cylinder } from '../primitives/index.ts';
import { beltMesh, beltTank, stadium, WHEEL_R } from './tread-fixtures.ts';
import { treadMorphs } from './tread-morphs.ts';
import { beltSpeed, FREE_BELT_SPEED } from './tread-speed.ts';

const GREY: [number, number, number] = [0.3, 0.3, 0.3];

const speedOf = (asset: CompiledAsset, edit: (p: Part) => Part | null = (p) => p): number => {
  const parts = asset.parts.flatMap((p) => edit(p) ?? []);
  const belt = parts.find((p) => p.name === 'track_l');
  if (belt?.motion?.kind !== 'tread') throw new Error('no belt');
  return beltSpeed(parts, belt, new BeltLoop(belt.motion.path));
};

describe('beltSpeed', () => {
  // 0.75 rev/s is 3 whole turns over the 4 s clip.
  const rim = (3 * 2 * Math.PI * WHEEL_R) / LOOP_SECONDS;

  it('falls back to a fixed speed when no wheel spins inside the loop', () => {
    const lone = speedOf(compile(beltTank()), (p) => (p.name.startsWith('wheel') ? null : p));
    expect(lone).toBe(FREE_BELT_SPEED);
    // A wheel beside the belt (the other side of the hull) or outside the loop does not drive it.
    const away = speedOf(compile(beltTank()), (p) =>
      p.name.startsWith('wheel') ? { ...p, at: [p.at[0], -0.8, p.at[2]] } : p,
    );
    expect(away).toBe(FREE_BELT_SPEED);
    const above = speedOf(compile(beltTank()), (p) =>
      p.name.startsWith('wheel') ? { ...p, at: [p.at[0], p.at[1], 2] } : p,
    );
    expect(above).toBe(FREE_BELT_SPEED);
  });

  it('is the wheels rim speed, signed against the path winding for a forward roll', () => {
    // The fixture's line runs +x along the ground: driving forward moves the ground run to −x.
    expect(speedOf(compile(beltTank()))).toBeCloseTo(-rim, 6);
    expect(speedOf(compile(beltTank({ rps: -0.75 })))).toBeCloseTo(rim, 6);
  });

  it('ignores a spin about another axis', () => {
    const turret = speedOf(compile(beltTank()), (p) =>
      p.name === 'wheel_l_0' ? { ...p, motion: { kind: 'spin', axis: [0, 0, 1], rps: 5 } } : p,
    );
    expect(turret).toBeCloseTo(-rim, 6);
  });
});

// The fixture's wheels sink 2 cm into its links; here they sit on the face they run on (0.26 m
// from the axle), drawn at LOD0 and kept as empty pivots at LOD2, as a tank's far LOD keeps them.
const SEATED_R = 0.26;
const seated = defineAsset({
  name: 'seated_tank',
  kind: 'vehicle',
  budget: { triangles: [9999, 9999, 9999] },
  build(ctx) {
    const { mesh, pitch } = beltMesh(ctx.lod === 0 ? 40 : 10);
    ctx.part('track_l', mesh, {
      motion: { kind: 'tread', path: stadium().map(([x, z]) => [x, 0.8, z] as const), pitch },
    });
    const wheel = cylinder({ radius: SEATED_R, length: 0.2, segments: 32, axis: 'y', color: GREY });
    for (const [i, x] of [-1, 1].entries())
      ctx.part(`wheel_l_${i}`, ctx.lod === 0 ? wheel : null, {
        at: [x, 0.8, 0.3],
        motion: { kind: 'spin', axis: [0, 1, 0], rps: 0.75 },
      });
  },
});

describe('beltSpeed without wheel meshes', () => {
  const rim = (3 * 2 * Math.PI * SEATED_R) / LOOP_SECONDS;

  it('reads a mesh-less wheel off the belt face it runs on, not the centre line', () => {
    // To the centre line the radius is 0.30 m: the far belt ran 15 % faster than the near one.
    expect(speedOf(compile(seated, { lod: 2 }))).toBeCloseTo(-rim, 3);
    expect(speedOf(compile(seated, { lod: 0 }))).toBeCloseTo(-rim, 3);
  });

  it('runs the belt at one ground speed at every LOD, wheels drawn or not', () => {
    const clip = (lod: 0 | 2): { speed: number; pitch: number } => {
      const { parts } = compile(seated, { lod });
      const belt = parts.find((p) => p.name === 'track_l');
      if (belt?.motion?.kind !== 'tread') throw new Error('no belt');
      const run = treadMorphs(parts, belt, lod);
      if (!run) throw new Error('belt does not loop');
      return { speed: run.speed, pitch: belt.motion.pitch };
    };
    const [near, far] = [clip(0), clip(2)];
    // Each LOD rounds to whole pitches per loop: at most half a pitch per loop off the wheels.
    const slip = (near.pitch + far.pitch) / 2 / LOOP_SECONDS;
    expect(Math.abs(near.speed - far.speed)).toBeLessThanOrEqual(slip);
    expect(Math.abs(far.speed + rim)).toBeLessThanOrEqual(far.pitch / 2 / LOOP_SECONDS + 1e-9);
  });
});
