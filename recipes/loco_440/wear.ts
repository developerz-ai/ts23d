// Jupiter in steam: the marks a wood-burner picks up between wipe-downs, all in vertex colour so
// every LOD carries them. Soot falls back from the balloon stack (stack mouth, smokebox top and
// front, along the boiler crown, the cab roof, the tender's wood), oil is flung from the hubs,
// crank pins and rods, track dust rises from the rails onto the running gear, pilot and tender
// trucks, and hard water leaves pale lime runs down the jacket. The crew keeps the brass bright,
// so brass takes a third of the soot. `worn(ctx, L)` returns a build context whose `part` ages
// each mesh on its way in: the part modules stay about shape.

import {
  type BuildContext,
  type Mesh,
  MeshBuilder,
  type PartOptions,
  type Vec2,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { BOILER_Z, BRASS, type Layout, RAIL_TOP, SMOKEBOX_R } from './shared.ts';

const SOOT: Vec3 = [0.022, 0.02, 0.019];
const OIL: Vec3 = [0.045, 0.036, 0.024];
const DUST: Vec3 = [0.36, 0.3, 0.22];
const LIME: Vec3 = [0.62, 0.62, 0.58];
const STEEL: Vec3 = [0.3, 0.3, 0.31];

const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (c: Vec3, to: Vec3, k: number): Vec3 => {
  const t = clamp(k);
  return [c[0] + (to[0] - c[0]) * t, c[1] + (to[1] - c[1]) * t, c[2] + (to[2] - c[2]) * t];
};
const near = (c: Vec3, to: Vec3): boolean =>
  Math.abs(c[0] - to[0]) + Math.abs(c[1] - to[1]) + Math.abs(c[2] - to[2]) < 0.02;

type Tint = (p: Vec3, c: Vec3, n: Vec3) => Vec3;

function tinted(m: Mesh, at: Vec3, f: Tint): Mesh {
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const p: Vec3 = [
      (m.positions[i * 3] ?? 0) + at[0],
      (m.positions[i * 3 + 1] ?? 0) + at[1],
      (m.positions[i * 3 + 2] ?? 0) + at[2],
    ];
    const c: Vec3 = [colors[i * 3] ?? 0, colors[i * 3 + 1] ?? 0, colors[i * 3 + 2] ?? 0];
    const n: Vec3 = [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 1];
    colors.set(f(p, c, n), i * 3);
  }
  return { ...m, colors };
}

/** Wheel parts live in their wheelset's frame (axle on Y through the origin). */
const WHEEL = /_(wheel|flange|crank)_[lr]$|_axle$/;
/** The motion: rods, crossheads and their guides. */
const MOTION = /^(rod_|crosshead_|guides$)/;
/** Big plain surfaces that need vertices for a gradient to live on (longest edge per LOD, m). */
const PLATES: Readonly<Record<string, readonly [number, number, number]>> = {
  tender_body: [0.45, 1.4, 0],
  cab: [0.45, 1.2, 0],
  boiler_barrel: [0.25, 0.7, 0],
  boiler_front: [0.3, 0, 0],
};

/**
 * Give the big plain plates vertices for a gradient to live on: bisect the longest edge of every
 * triangle longer than `max`, but only where the triangle is plate, not sliver (its height over
 * that edge at least a third of `max`). Lettering, lining, rivets and pipes keep their triangles;
 * a midpoint lies on its edge, so the surface does not move.
 */
function plated(m: Mesh, max: number): Mesh {
  type V = { p: Vec3; n: Vec3; uv: Vec2; color: Vec3 };
  const read = (i: number): V => ({
    p: [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, m.positions[i * 3 + 2] ?? 0],
    n: [m.normals[i * 3] ?? 0, m.normals[i * 3 + 1] ?? 0, m.normals[i * 3 + 2] ?? 1],
    uv: [m.uvs[i * 2] ?? 0, m.uvs[i * 2 + 1] ?? 0],
    color: [m.colors[i * 3] ?? 0, m.colors[i * 3 + 1] ?? 0, m.colors[i * 3 + 2] ?? 0],
  });
  const half = (a: number, b: number): number => (a + b) / 2;
  const mid = (x: V, y: V): V => {
    const n: Vec3 = [half(x.n[0], y.n[0]), half(x.n[1], y.n[1]), half(x.n[2], y.n[2])];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return {
      p: [half(x.p[0], y.p[0]), half(x.p[1], y.p[1]), half(x.p[2], y.p[2])],
      n: [n[0] / l, n[1] / l, n[2] / l],
      uv: [half(x.uv[0], y.uv[0]), half(x.uv[1], y.uv[1])],
      color: [
        half(x.color[0], y.color[0]),
        half(x.color[1], y.color[1]),
        half(x.color[2], y.color[2]),
      ],
    };
  };
  const dist = (x: V, y: V): number =>
    Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1], x.p[2] - y.p[2]);
  const b = new MeshBuilder();
  const split = (x: V, y: V, z: V, depth: number): void => {
    const e = [dist(x, y), dist(y, z), dist(z, x)];
    const top = Math.max(...e);
    const u = [y.p[0] - x.p[0], y.p[1] - x.p[1], y.p[2] - x.p[2]];
    const v = [z.p[0] - x.p[0], z.p[1] - x.p[1], z.p[2] - x.p[2]];
    const area2 = Math.hypot(
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    );
    if (depth > 12 || top <= max || area2 / top < max / 3) {
      b.tri(b.vertex(x), b.vertex(y), b.vertex(z));
      return;
    }
    if (top === e[0]) {
      const q = mid(x, y);
      split(x, q, z, depth + 1);
      split(q, y, z, depth + 1);
    } else if (top === e[1]) {
      const q = mid(y, z);
      split(x, y, q, depth + 1);
      split(x, q, z, depth + 1);
    } else {
      const q = mid(z, x);
      split(x, y, q, depth + 1);
      split(q, y, z, depth + 1);
    }
  };
  for (let t = 0; t < m.indices.length; t += 3)
    split(read(m.indices[t] ?? 0), read(m.indices[t + 1] ?? 0), read(m.indices[t + 2] ?? 0), 0);
  return b.build();
}

/** Parts that carry a declared finish (see `FINISHES`): coach enamel, planished Russia iron. */
const FINISH: Readonly<Record<string, string>> = {
  cab: 'enamel',
  tender_body: 'enamel',
  pilot: 'enamel',
  headlamp: 'enamel',
  boiler_domes: 'enamel',
  boiler_barrel: 'russia_iron',
};

/**
 * The finishes the family declares. Coach enamel: brushed-on oil paint under varnish, a clear
 * coat with visible orange peel (not a car's mirror lacquer). Russia iron: planished sheet, a
 * dark metal with a soft sheen, distinct from the polished brass strip and the matt graphite.
 */
export const FINISHES = {
  enamel: { clearcoat: 0.8, clearcoatRoughness: 0.22 },
  russia_iron: { metallic: 1, roughness: 0.34 },
} as const;

/** Far LOD wheel: a red disc with a dark hub and a steel tyre (wheel frame), not a red block. */
export function farWheel(m: Mesh, r: number): Mesh {
  return tinted(m, [0, 0, 0], (p, c) => {
    const rho = Math.hypot(p[0], p[2]);
    if (rho < r * 0.1) return OIL;
    return rho > r - 0.03 ? STEEL : c;
  });
}

export function worn(ctx: BuildContext, L: Layout): BuildContext {
  const blotch = valueNoise(ctx.rng.fork('wear_blotch'), { scale: 0.7, octaves: 3 });
  const fine = valueNoise(ctx.rng.fork('wear_fine'), { scale: 0.09, octaves: 2 });
  const n01 = (f: (p: Vec3) => number, p: Vec3): number => clamp(0.5 + 0.5 * f(p));
  const stackTop: Vec3 = [L.stackX, 0, L.stackBase + 1.6];
  const crown = BOILER_Z + SMOKEBOX_R;

  /** Oil thrown outward from the hub and crank pin; brake and rail dust on the rim. */
  const wheel: Tint = (p, c) => {
    const rho = Math.hypot(p[0], p[2]);
    const r = Math.max(rho, 0.3);
    const hub = 1 - smooth(0.08, 0.34, rho);
    // Spatter rays: oil leaves the hub along the spokes.
    const ray = n01(fine, [Math.atan2(p[2], p[0]) * 0.4, 0, rho * 0.3]);
    let out = mix(c, OIL, 0.75 * hub + 0.3 * ray * (1 - smooth(0.3, 0.75, rho)));
    out = mix(out, DUST, 0.3 * smooth(0.55, 0.8, rho / r) * (0.5 + 0.5 * ray));
    return out;
  };

  /** Rods and guides: an oil film, black round the pins (the ends of each rod's frame). */
  const motion: Tint = (p, c) => mix(c, OIL, 0.3 + 0.35 * n01(fine, [p[0] * 0.5, p[1], p[2]]));

  const body =
    (name: string): Tint =>
    (p, c, n) => {
      const b = n01(blotch, p);
      const f = n01(fine, p);
      const brass = near(c, BRASS);
      let out = c;
      // Lime: pale runs down the jacket sides from the crown fittings (constant x on a barrel).
      if (name === 'boiler_barrel') {
        const run = smooth(0.62, 0.8, n01(fine, [p[0] * 1.6, 0, 0]));
        const side =
          smooth(BOILER_Z + 0.55, BOILER_Z + 0.2, p[2]) * smooth(BOILER_Z - 0.6, BOILER_Z, p[2]);
        out = mix(out, LIME, 0.45 * run * side);
      }
      // Tender: water slopped from the filler runs dark down the tank sides.
      if (name === 'tender_body' && Math.abs(n[1]) > 0.7) {
        const run = smooth(0.6, 0.85, n01(fine, [p[0] * 1.2, 0, 0]));
        out = mix(
          out,
          [out[0] * 0.3, out[1] * 0.3, out[2] * 0.32],
          0.6 * run * smooth(1.6, 2.6, p[2]),
        );
      }
      // Track dust rising from the rails: thick on the trucks and pilot, gone by the boards.
      const top = 1.05 + 0.45 * b;
      const dust = (1 - smooth(RAIL_TOP + 0.05, top, p[2])) * (0.28 + 0.27 * f);
      out = mix(out, DUST, brass ? dust * 0.5 : dust);
      // Oil and coal-black grease low on the under-works, inboard of the wheels.
      if (name === 'frame' || name === 'lead_truck' || name === 'boiler_saddle')
        out = mix(out, OIL, 0.4 * (1 - smooth(0.9, 1.7, p[2])) * (0.4 + 0.6 * b));
      // Soot. 1: everything within a metre of the stack mouth.
      const d = Math.hypot(p[0] - stackTop[0], p[1] - stackTop[1], p[2] - stackTop[2]);
      let soot = 0.85 * (1 - smooth(0.25, 1.15, d));
      // 2: fallout on upward faces behind the stack, thinning down the train.
      const behind = stackTop[0] + 0.7 - p[0];
      if (behind > 0) {
        const up = smooth(0.1, 0.75, n[2]);
        const high = smooth(1.7, 2.6, p[2]);
        soot = Math.max(soot, up * high * (0.42 + 0.45 * Math.exp(-behind / 7)) * (0.5 + 0.5 * b));
      }
      // 3: runs down the smokebox from the stack base and over the door.
      if (p[0] > L.barrelFront - 0.1 && p[2] > BOILER_Z - 0.35) {
        const fall = smooth(BOILER_Z - 0.35, crown, p[2]);
        const run = 0.45 + 0.55 * n01(fine, [p[0] * 0.3, p[1] * 2.2, 0]);
        soot = Math.max(soot, 0.7 * fall * run);
      }
      // 4: the tender carries the fuel: wood dust and bark on every upward face.
      if (name === 'tender_body')
        soot = Math.max(soot, 0.4 * smooth(0.3, 0.9, n[2]) * (0.5 + 0.5 * b));
      return mix(out, SOOT, brass ? soot * 0.35 : soot);
    };

  const part = (name: string, mesh: Mesh | null, o?: PartOptions): void => {
    if (!mesh || o?.surface === 'glass' || name.startsWith('track_')) {
      ctx.part(name, mesh, o);
      return;
    }
    if (WHEEL.test(name)) {
      ctx.part(name, ctx.lod === 2 ? mesh : tinted(mesh, [0, 0, 0], wheel), o);
      return;
    }
    if (MOTION.test(name)) {
      ctx.part(name, tinted(mesh, [0, 0, 0], motion), o);
      return;
    }
    const res = PLATES[name]?.[ctx.lod] ?? 0;
    const fineMesh = res > 0 ? plated(mesh, res) : mesh;
    const finish = FINISH[name];
    ctx.part(name, tinted(fineMesh, o?.at ?? [0, 0, 0], body(name)), {
      ...o,
      ...(finish ? { finish } : {}),
    });
  };
  return { ...ctx, part };
}
