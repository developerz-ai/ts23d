// Vehicle helpers: wheels that spin, tracks, propellers. Named parts follow the engine contract:
// `axle_*` and `wheel_*` spin about local Y, `prop_*`/`rotor_*` spin about their own axis.

import type { BuildContext, Vec3 } from '../core/index.ts';
import { parseWhyte } from '../grammar/index.ts';
import { box, cylinder } from '../primitives/index.ts';

const segs = (ctx: BuildContext, hi: number): number => [hi, Math.max(8, hi / 2), 6][ctx.lod] ?? 6;

/** A pair of wheels on one spinning axle. */
export function axle(
  ctx: BuildContext,
  o: {
    name: string;
    at: Vec3;
    radius: number;
    gauge: number;
    width: number;
    color: Vec3;
    rps: number;
  },
): void {
  ctx.group(o.name, { at: o.at, motion: { kind: 'spin', axis: [0, 1, 0], rps: o.rps } });
  for (const [s, y] of [
    ['l', o.gauge / 2],
    ['r', -o.gauge / 2],
  ] as const) {
    ctx.part(
      `${o.name}_wheel_${s}`,
      cylinder({
        radius: o.radius,
        length: o.width,
        segments: segs(ctx, 24),
        axis: 'y',
        at: [0, y, 0],
        color: o.color,
        strip: 'iron',
      }),
      { parent: o.name },
    );
  }
}

/** Lays out wheel groups from a Whyte arrangement along X; returns axle x-positions per role. */
export function whyteAxles(
  arrangement: string,
  o: { leading: number; driving: number; trailing: number; spacing: number },
): { role: string; x: number; radius: number }[] {
  const groups = parseWhyte(arrangement);
  const out: { role: string; x: number; radius: number }[] = [];
  let x = 0;
  for (const g of groups) {
    const r = g.role === 'driving' ? o.driving : g.role === 'leading' ? o.leading : o.trailing;
    for (let i = 0; i < g.count / 2; i++) {
      out.push({ role: g.role, x: x + r, radius: r });
      x += r * 2 + o.spacing;
    }
  }
  const mid = x / 2;
  // Front (+X) is the leading end.
  return out.map((a) => ({ ...a, x: mid - a.x }));
}

/** One side of a tracked running gear: road wheels (spinning) + a flat track loop. */
export function trackRun(
  ctx: BuildContext,
  o: {
    side: 'l' | 'r';
    y: number;
    length: number;
    wheels: number;
    radius: number;
    width: number;
    color: Vec3;
    track: Vec3;
  },
): void {
  const pitch = o.length / o.wheels;
  for (let i = 0; i < o.wheels; i++) {
    const x = -o.length / 2 + pitch * (i + 0.5);
    ctx.part(
      `road_wheel_${o.side}_${i}`,
      cylinder({
        radius: o.radius,
        length: o.width * 0.8,
        segments: segs(ctx, 20),
        axis: 'y',
        at: [0, 0, 0],
        color: o.color,
        strip: 'iron',
      }),
      { at: [x, o.y, o.radius + 0.06], motion: { kind: 'spin', axis: [0, 1, 0], rps: -0.6 } },
    );
  }
  const t = 0.06;
  ctx.part(
    `track_${o.side}_bottom`,
    box({
      size: [o.length + o.radius, o.width, t],
      at: [0, o.y, 0],
      color: o.track,
      strip: 'iron',
    }),
  );
  ctx.part(
    `track_${o.side}_top`,
    box({
      size: [o.length, o.width, t],
      at: [0, o.y, o.radius * 2 + 0.06],
      color: o.track,
      strip: 'iron',
    }),
  );
}

/** A propeller hub + blades that spin about X (nose direction). */
export function propeller(
  ctx: BuildContext,
  o: { name: string; at: Vec3; radius: number; blades: number; color: Vec3; parent?: string },
): void {
  ctx.group(o.name, {
    at: o.at,
    ...(o.parent ? { parent: o.parent } : {}),
    motion: { kind: 'spin', axis: [1, 0, 0], rps: 6 },
  });
  ctx.part(
    `${o.name}_hub`,
    cylinder({
      radius: o.radius * 0.12,
      length: o.radius * 0.3,
      segments: segs(ctx, 12),
      axis: 'x',
      color: o.color,
    }),
    { parent: o.name },
  );
  for (let i = 0; i < o.blades; i++) {
    const a = (i / o.blades) * Math.PI * 2;
    const r = o.radius / 2;
    ctx.part(
      `${o.name}_blade_${i}`,
      box({ size: [0.03, o.radius * 0.12, o.radius], at: [0, 0, -o.radius / 2], color: o.color }),
      { parent: o.name, at: [0, Math.sin(a) * r * 0.01, Math.cos(a) * r * 0.01] },
    );
  }
}
