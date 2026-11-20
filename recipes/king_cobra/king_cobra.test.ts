// The cobra against its sources and its stance: arc length, tail share, raised third and hood on the
// compiled skeleton and mesh; ground contact, planted coil and hood motion in the baked clips.
// `bun test recipes/king_cobra`.

import { describe, expect, it } from 'bun:test';
import {
  type Clip,
  compile,
  dmath,
  type Mesh,
  quatRotate,
  triangleCount,
  type Vec3,
} from '@developerz.ai/ts23d';
import { clipPose, jointWorlds } from '../../src/qa/clip-pose.ts';
import { posedMesh } from '../../src/render/pose-strip.ts';
import { mixRgb, norm } from '../_lib/body-plan-kit.ts';
import { REAR, rearHinge } from './clips.ts';
import { IDLE_GROUND, jointArcs } from './ground.ts';
import { CLIPS, king_cobra, PLAN, RIG } from './king_cobra.ts';
import {
  DUST,
  dustAt,
  dusted,
  FAR_DUST,
  marked,
  NEAR_DUST,
  SCAR_AT,
  SHED_AT,
  scarAt,
  shedAt,
} from './material.ts';
import {
  bellyHalf,
  COIL_TOP,
  frameAt,
  HEAD,
  HOOD_WIDTH,
  halfW,
  RAISED,
  SVL,
  seatHeight,
  surfacePoint,
  TOTAL,
} from './shape.ts';
import { bodyArc } from './skin.ts';
import { dorsalAverage, dorsalColour, farBand, scaleSheet, scutes, trunkMesh } from './surface.ts';

const sk = { bones: PLAN.bones };
const clip = (name: string) => {
  const c = CLIPS.find((x) => x.name === name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
};
const dist = (a: Vec3, b: Vec3): number => dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const heads = (name: string, u: number): Vec3[] => {
  const c = clip(name);
  const w = jointWorlds(sk, clipPose(c, u * c.seconds));
  return RIG.spine.map((b) => w.get(b)?.head ?? [0, 0, 0]);
};
const restHeads: Vec3[] = RIG.spine.map(
  (n) => PLAN.bones.find((b) => b.name === n)?.head ?? ([0, 0, 0] as Vec3),
);
const body = (lod: 0 | 1 | 2): Mesh => {
  const m = compile(king_cobra, { lod }).parts.find((p) => p.name === 'body')?.mesh;
  if (!m) throw new Error('no body');
  return m;
};

/** Spine joint heads plus the tail tip, and each link's dorsal direction, at clip time u (0..1). */
const spineAt = (c: Clip, u: number): { at: Vec3[]; dorsal: Vec3[] } => {
  const w = jointWorlds(sk, clipPose(c, u * c.seconds));
  const at: Vec3[] = [];
  const dorsal: Vec3[] = [];
  RIG.spine.forEach((name, i) => {
    const f = w.get(name);
    const b = PLAN.bones.find((x) => x.name === name);
    if (!f || !b) throw new Error(`no joint ${name}`);
    at.push(f.head);
    dorsal.push(quatRotate(f.rot, frameAt(((i + 0.5) / RIG.spine.length) * TOTAL).d));
    if (i === RIG.spine.length - 1)
      at.push(
        add3(
          f.head,
          quatRotate(f.rot, [b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]]),
        ),
      );
  });
  return { at, dorsal };
};
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const ARCS = jointArcs({
  at: [
    ...restHeads,
    PLAN.bones.find((b) => b.name === RIG.spine.at(-1))?.tail ?? ([0, 0, 0] as Vec3),
  ],
  dorsal: [],
});
/** Section radius toward unit `dir` (side, back or belly) of the link with dorsal `d` at arc s. */
const radiusToward = (s: number, d: Vec3, along: Vec3, dir: Vec3): number => {
  const w = bellyHalf(s) / 0.7;
  const side = cross3(d, along);
  const a = dot3(dir, side);
  const b = dot3(dir, d);
  const v = b >= 0 ? 0.92 * w : 0.7 * w;
  // Along the body the tube reads as round: the lateral radius.
  const c = dot3(dir, along);
  return 1 / Math.sqrt(dmath.pow(a / w, 2) + dmath.pow(b / v, 2) + dmath.pow(c / w, 2));
};
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Smallest gap between two joints at least 0.35 m apart along the body (negative: they overlap). */
function selfClearance(c: Clip, u: number): number {
  const { at, dorsal } = spineAt(c, u);
  const n = at.length - 1;
  let low = Infinity;
  for (let i = 1; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if ((ARCS[j] ?? 0) - (ARCS[i] ?? 0) < 0.35) continue;
      const [p, q] = [at[i] as Vec3, at[j] as Vec3];
      const v: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const l = dmath.hypot(v[0], v[1], v[2]);
      const u1: Vec3 = [v[0] / l, v[1] / l, v[2] / l];
      const ti = norm([
        (at[i + 1] as Vec3)[0] - p[0],
        (at[i + 1] as Vec3)[1] - p[1],
        (at[i + 1] as Vec3)[2] - p[2],
      ]);
      const tj = norm([
        (at[j + 1] as Vec3)[0] - q[0],
        (at[j + 1] as Vec3)[1] - q[1],
        (at[j + 1] as Vec3)[2] - q[2],
      ]);
      const need =
        radiusToward(ARCS[i] ?? 0, dorsal[i] as Vec3, ti, u1) +
        radiusToward(ARCS[j] ?? 0, dorsal[j] as Vec3, tj, [-u1[0], -u1[1], -u1[2]]);
      low = Math.min(low, l - need);
    }
  return low;
}
/** Angle (degrees) between consecutive links at every inner joint. */
const bends = (at: readonly Vec3[]): number[] =>
  at.slice(1, -1).map((p, k) => {
    const [a, b] = [at[k] as Vec3, at[k + 2] as Vec3];
    const u: Vec3 = norm([p[0] - a[0], p[1] - a[1], p[2] - a[2]]);
    const v: Vec3 = norm([b[0] - p[0], b[1] - p[1], b[2] - p[2]]);
    return (dmath.acos(Math.min(1, dot3(u, v))) * 180) / Math.PI;
  });

describe('ventral scutes', () => {
  it('continue past the 241 body plates onto the tail', () => {
    const plateTriangles = 8 * 2;
    expect(triangleCount(scutes()) / plateTriangles).toBeGreaterThan(241);
  });

  it("carry the near coil's dust on the ground, not the far tube's hint of it", () => {
    // LOD0 plates (no story marks): at FAR_DUST the ground plates came out 0.50 from the loam on
    // average, at NEAR_DUST 0.28 (the dark rear edges of each plate keep the average off 0).
    const m = scutes();
    let [n, d] = [0, 0];
    for (let v = 0; v < m.positions.length / 3; v++) {
      if ((m.positions[v * 3 + 2] ?? 1) > 0.02) continue;
      n++;
      d += dmath.hypot(
        (m.colors[v * 3] ?? 0) - (DUST[0] ?? 0),
        (m.colors[v * 3 + 1] ?? 0) - (DUST[1] ?? 0),
        (m.colors[v * 3 + 2] ?? 0) - (DUST[2] ?? 0),
      );
    }
    expect(n).toBeGreaterThan(1000);
    expect(d / n).toBeLessThan(0.35);
  });
});

describe('sourced proportions', () => {
  it('is 3.5 m along the body, and the bones follow it', () => {
    let arc = 0;
    for (let i = 0; i < 2000; i++)
      arc += dist(frameAt((i / 2000) * TOTAL).p, frameAt(((i + 1) / 2000) * TOTAL).p);
    expect(Math.abs(arc / TOTAL - 1)).toBeLessThan(0.005);
    let chords = 0;
    for (const n of RIG.spine) {
      const b = PLAN.bones.find((x) => x.name === n);
      if (b) chords += dist(b.head, b.tail);
    }
    expect(Math.abs(chords / TOTAL - 1)).toBeLessThan(0.02);
  });
  it('keeps the neotype tail share', () => {
    expect((TOTAL - SVL) / TOTAL).toBeCloseTo(462 / 2547, 5);
  });
  it('scales the head from the holotype', () => {
    expect(HEAD.length / TOTAL).toBeCloseTo(72 / 3005, 5);
    expect(HEAD.width / TOTAL).toBeCloseTo(52.5 / 3005, 5);
  });
  it('holds the front third up off the pile, the head at an alert height', () => {
    expect(RAISED).toBeCloseTo(TOTAL / 3, 6);
    const front = restHeads.filter((_, i) => (i / restHeads.length) * TOTAL < RAISED);
    for (const p of front) expect(p[2]).toBeGreaterThan(COIL_TOP - 0.02);
    expect(restHeads[0]?.[2] ?? 0).toBeGreaterThan(0.65);
    expect(restHeads[0]?.[2] ?? 1).toBeLessThan(0.85);
  });
  it('turns the hood square to the hero camera', () => {
    const d = frameAt(0.26).d;
    const front = norm([-d[0], -d[1], 0]);
    const yaw = (-35 * Math.PI) / 180;
    expect(front[0] * dmath.cos(yaw) + front[1] * dmath.sin(yaw)).toBeGreaterThan(0.95);
    // Its face tips up toward a camera above the horizon, never down at the ground.
    expect(-d[2]).toBeGreaterThan(0);
  });
  it('rests every turn of the pile on the ground or on the turn under it, none in the air', () => {
    const n = 500;
    const S = Array.from(
      { length: n + 1 },
      (_, i) => RAISED + 0.1 + (i / n) * (TOTAL - RAISED - 0.1),
    );
    const F = S.map((s) => frameAt(s).p);
    let worst = 0;
    S.forEach((s, i) => {
      const p = F[i] as Vec3;
      let under = 0;
      S.forEach((s2, j) => {
        const q = F[j] as Vec3;
        const reach = halfW(s) + halfW(s2);
        if (Math.abs(s2 - s) < 0.4 || q[2] >= p[2] || dmath.hypot(q[0] - p[0], q[1] - p[1]) > reach)
          return;
        under = Math.max(under, q[2] + 0.92 * halfW(s2));
      });
      worst = Math.max(worst, p[2] - bellyHalf(s) - under);
    });
    expect(worst).toBeLessThan(0.006);
    // Still a pile, not a puddle: the top turn rides on the tail, and the coil stays compact.
    const pile = restHeads.filter((_, i) => (i / restHeads.length) * TOTAL > RAISED);
    expect(Math.max(...pile.map((p, i) => p[2] - seatHeight(RAISED + i * 0.109)))).toBeGreaterThan(
      0.01,
    );
    expect(Math.max(...pile.map((p) => dmath.hypot(p[0], p[1])))).toBeLessThan(0.42);
    // Two turns, not one flat ring: the smaller top turn rides a body depth above the ground ring.
    expect(COIL_TOP).toBeGreaterThan(0.06);
  });
  it('keeps every skin point on its own turn, never inside the turn it touches', () => {
    let foreign = 0;
    for (let s = 0.05; s < TOTAL - 0.02; s += 0.01)
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const [p, q] = [surfacePoint(s, a), surfacePoint(s, a, 0.001)];
        const n: Vec3 = [(q[0] - p[0]) / 0.001, (q[1] - p[1]) / 0.001, (q[2] - p[2]) / 0.001];
        if (Math.abs(bodyArc(p, n) - s) > 0.15) foreign++;
      }
    expect(foreign).toBe(0);
  });
  it('spreads the hood wider than the head and the neck below it', () => {
    expect(2 * halfW(0.205)).toBeCloseTo(HOOD_WIDTH, 3);
    expect(HOOD_WIDTH).toBeGreaterThan(HEAD.width * 1.5);
    expect(HOOD_WIDTH).toBeGreaterThan(2 * halfW(0.8) * 1.8);
  });
  it('lies on the ground: the lowest skin touches z = 0 and none goes under', () => {
    const m = body(0);
    let low = Infinity;
    for (let i = 2; i < m.positions.length; i += 3) low = Math.min(low, m.positions[i] ?? 0);
    expect(low).toBeGreaterThan(-0.004);
    expect(low).toBeLessThan(0.006);
  });
  it('faces the belly forward on the raised neck, the back up on the ground', () => {
    expect(frameAt(0.5).d[2]).toBeLessThan(0.3);
    expect(frameAt(2.5).d[2]).toBeGreaterThan(0.95);
  });
});

describe('surface', () => {
  const luma = (c: readonly number[]): number =>
    0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  it('LOD2 shows the averaged pattern, not single bands', () => {
    const sampled = Array.from({ length: 60 }, (_, i) =>
      luma(dorsalColour(0.9 + i * 0.011, 0.6, 1)),
    );
    const averaged = Array.from({ length: 60 }, (_, i) =>
      luma(dorsalAverage(0.9 + i * 0.011, 0.6)),
    );
    const spread = (v: number[]): number => Math.max(...v) - Math.min(...v);
    expect(spread(sampled)).toBeGreaterThan(0.2);
    expect(spread(averaged)).toBeLessThan(0.05);
  });
  it('gives every scale a rim-to-crown UV ramp (matte rim, glossy crown)', () => {
    const m = scaleSheet();
    const us = new Set<number>();
    for (let i = 0; i < 300; i += 2) us.add(Math.round((m.uvs[i] ?? 0) * 100));
    expect(us.size).toBeGreaterThan(1);
  });
  it('carries its story: a pre-shed patch and a healed scar', () => {
    let [shed, scar] = [0, 0];
    for (let s = 0.2; s < 3.4; s += 0.01) {
      shed = Math.max(shed, shedAt(s, 0.3));
      scar = Math.max(scar, scarAt(s, 0));
    }
    expect(shed).toBeGreaterThan(0.8);
    expect(scar).toBeGreaterThan(0.8);
    // Dust coats the turn lying on the ground, broad enough to read from the hero camera; the raised
    // front stays clean.
    expect(dustAt(2.9, Math.PI * 0.7)).toBeGreaterThan(0.5);
    expect(dustAt(0.5, Math.PI * 0.7)).toBe(0);
  });
});

describe('story marks by LOD', () => {
  const c: Vec3 = [0.3, 0.32, 0.22];
  it('drops the shed patch and the scar at LOD2: dust only (a coarse ring painted a segment)', () => {
    for (const [s, a] of [
      [SHED_AT, 0.3],
      [SCAR_AT, 0],
    ] as const) {
      expect(marked(c, s, a)).not.toEqual(marked(c, s, a, true));
      expect(marked(c, s, a, true)).toEqual(mixRgb(c, DUST, dustAt(s, a) * FAR_DUST));
      expect(dusted(c, s, a, NEAR_DUST)).toEqual(mixRgb(c, DUST, dustAt(s, a) * NEAR_DUST));
    }
  });
});

describe('LOD2 coil (D480)', () => {
  const luma = (c: readonly number[]): number =>
    0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  // Dorsal vertices of the far tube on the pile (sides 0, 1, 5 of 6: up and the upper flanks).
  const coil = (): number[][] => {
    const m = trunkMesh(
      2,
      Array.from({ length: 32 }, (_, i) => (i / 32) * 3.5),
    );
    const rings: number[][] = [];
    for (let i = 0; i < m.positions.length / 3; i++) {
      const z = m.positions[i * 3 + 2] ?? 0;
      if (z > 0.12 || (m.normals[i * 3 + 2] ?? 0) < 0.3) continue;
      rings.push([m.colors[i * 3] ?? 0, m.colors[i * 3 + 1] ?? 0, m.colors[i * 3 + 2] ?? 0]);
    }
    return rings;
  };
  it('keeps the dark olive pile at LOD2: the switch does not pop pale', () => {
    const v = coil()
      .map(luma)
      .sort((a, b) => a - b);
    // The pattern's own far average is ≈ 0.1 linear; dusted at 0.9 the far coil's median was 0.21.
    expect(v[Math.floor(v.length / 2)] ?? 1).toBeLessThan(0.15);
  });
  it('paints a few crossbands on every third far ring', () => {
    // The far coil's dark olive (≈ 0.03 linear): a band ring must stand well clear of it.
    const base: Vec3 = [0.03, 0.028, 0.015];
    const s = 3.5 / 32;
    const odd = farBand(base, 12 * s);
    expect(farBand(base, 13 * s)).toEqual(base);
    expect(luma(odd)).toBeGreaterThan(luma(base) * 3);
  });
});

describe('detail by LOD', () => {
  it('emits scales up close only and stays a few hundred triangles far away', () => {
    expect(triangleCount(body(0))).toBeGreaterThan(30_000);
    expect(triangleCount(body(2))).toBeLessThan(900);
  });
});

describe('clips', () => {
  it('ships the ground and stance clips, and no sidewind', () => {
    expect(CLIPS.map((c) => c.name).sort()).toEqual([
      'hood_up',
      'idle',
      'idle_ground',
      'rear',
      'slither',
    ]);
  });

  for (const name of ['idle', 'hood_up'])
    it(`${name} starts and ends on the rest pose, so Play does not jump`, () => {
      for (const u of [0, 1]) {
        heads(name, u).forEach((p, i) => {
          expect(dist(p, restHeads[i] as Vec3)).toBeLessThan(0.001);
        });
        const pose = clipPose(clip(name), u * clip(name).seconds);
        for (const { bone } of RIG.ribs) {
          const q = pose.rotation.get(bone) ?? [0, 0, 0, 1];
          expect(dmath.hypot(q[0], q[1], q[2])).toBeLessThan(0.005);
        }
        for (const bone of RIG.tongue) {
          const t = pose.translation.get(bone) ?? [0, 0, 0];
          expect(dmath.hypot(t[0], t[1], t[2])).toBeLessThan(0.001);
        }
      }
    });

  it('idle stays reared and alive, with the coil planted', () => {
    const rest = restHeads[0] as Vec3;
    let moved = 0;
    for (let i = 0; i <= 24; i++) {
      const now = heads('idle', i / 24);
      expect(now[0]?.[2] ?? 0).toBeGreaterThan(rest[2] - 0.03);
      moved = Math.max(moved, dist(now[0] as Vec3, rest));
      now.forEach((p, k) => {
        if ((k / now.length) * TOTAL > RAISED * 1.2)
          expect(dist(p, restHeads[k] as Vec3)).toBeLessThan(0.004);
      });
    }
    expect(moved).toBeGreaterThan(0.01);
  });

  it('idle_ground is the low clip: flat, hood folded', () => {
    for (const p of heads('idle_ground', 0.3)) expect(p[2]).toBeLessThan(0.08);
  });

  it('slithers flat on the ground, bending and travelling', () => {
    const [a, b] = [heads('slither', 0.1), heads('slither', 0.35)];
    for (const p of a) expect(p[2]).toBeLessThan(0.08);
    const ys = a.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.25);
    expect(dist(a[0] as Vec3, b[0] as Vec3)).toBeGreaterThan(0.1);
  });

  it('keeps every slither joint at or above belly height', () => {
    for (const u of [0, 0.2, 0.4, 0.6, 0.8])
      heads('slither', u).forEach((p, i) => {
        expect(p[2]).toBeGreaterThan(bellyHalf((i / RIG.spine.length) * TOTAL) * 0.4);
      });
  });

  it('sways only the raised front in hood_up: the coil stays planted', () => {
    const [a, b] = [heads('hood_up', 0.13), heads('hood_up', 0.63)];
    expect(dist(a[1] as Vec3, b[1] as Vec3)).toBeGreaterThan(0.015);
    a.forEach((p, i) => {
      if ((i / a.length) * TOTAL > RAISED * 1.2) expect(dist(p, b[i] as Vec3)).toBeLessThan(0.004);
    });
  });

  it('folds the hood ribs for the ground and spreads them when alert', () => {
    const rib = RIG.ribs[1]?.bone ?? '';
    const turn = (name: string): number => {
      const q = clipPose(clip(name), 0.2).rotation.get(rib) ?? [0, 0, 0, 1];
      return 2 * dmath.atan2(dmath.hypot(q[0], q[1], q[2]), Math.abs(q[3]));
    };
    expect(turn('slither')).toBeGreaterThan(1);
    expect(turn('hood_up')).toBeLessThan(0.3);
  });

  it('rears from low to the alert stance', () => {
    expect(heads('rear', 0)[0]?.[2] ?? 1).toBeLessThan(0.1);
    expect(dist(heads('rear', 1)[0] as Vec3, restHeads[0] as Vec3)).toBeLessThan(0.01);
  });

  it('never puts skin through the floor', () => {
    const c = compile(king_cobra, { lod: 1 });
    const part = c.parts.find((p) => p.name === 'body')?.mesh;
    if (!part) throw new Error('no body');
    const rest = PLAN.bones.map((b) => b.head);
    for (const name of ['slither', 'idle', 'idle_ground', 'hood_up', 'rear'])
      for (let i = 0; i <= 12; i++) {
        const w = jointWorlds(sk, clipPose(clip(name), (i / 12) * clip(name).seconds));
        const frames = PLAN.bones.map((b) => {
          const f = w.get(b.name);
          if (!f) throw new Error(`no joint ${b.name}`);
          return f;
        });
        const m = posedMesh(part, rest, frames);
        let low = Infinity;
        for (let v = 2; v < m.positions.length; v += 3) low = Math.min(low, m.positions[v] ?? 0);
        expect(low).toBeGreaterThan(-0.003);
      }
  });

  /** Per spine bone, the lowest posed skin of the vertices it carries most: its belly. */
  const bellies = (() => {
    const part = compile(king_cobra, { lod: 1 }).parts.find((p) => p.name === 'body')?.mesh;
    if (!part?.joints) throw new Error('no skinned body');
    const rest = PLAN.bones.map((b) => b.head);
    const spineIndex = new Set(RIG.spine.map((n) => PLAN.bones.findIndex((b) => b.name === n)));
    return (name: string, u: number): number[] => {
      const w = jointWorlds(sk, clipPose(clip(name), u * clip(name).seconds));
      const frames = PLAN.bones.map(
        (b) => w.get(b.name) ?? { head: b.head, rot: [0, 0, 0, 1] as const },
      );
      const m = posedMesh(part, rest, frames);
      const low = new Map<number, number>();
      for (let v = 0; v < m.positions.length / 3; v++) {
        const j = part.joints?.[v * 4] ?? 0;
        if (!spineIndex.has(j)) continue;
        low.set(j, Math.min(low.get(j) ?? Infinity, m.positions[v * 3 + 2] ?? 0));
      }
      return [...low.values()];
    };
  })();

  for (const name of ['idle_ground', 'slither'])
    it(`${name} lies with its belly on the ground the whole way along, every frame`, () => {
      for (let i = 0; i <= 12; i++) {
        const lows = bellies(name, i / 12);
        expect(Math.min(...lows)).toBeGreaterThan(-0.003);
        expect(lows.filter((z) => z < 0.01).length / lows.length).toBeGreaterThanOrEqual(0.95);
      }
    });

  it('idle_ground rests in loose curves near the coil, not as a straight stick', () => {
    for (let i = 0; i <= 12; i++) {
      const at = heads('idle_ground', i / 12);
      const span = (k: 0 | 1): number =>
        Math.max(...at.map((p) => p[k])) - Math.min(...at.map((p) => p[k]));
      expect(Math.min(span(0), span(1))).toBeGreaterThan(0.5);
      for (const p of at) expect(dmath.hypot(p[0], p[1])).toBeLessThan(IDLE_GROUND.footprint);
    }
  });

  it('idle_ground breathes, shifts its head and flicks its tongue', () => {
    const head = (u: number): Vec3 => heads('idle_ground', u)[0] as Vec3;
    expect(dist(head(0), head(0.7))).toBeGreaterThan(0.01);
    const t = RIG.tongue[0] ?? '';
    const out = (u: number): number => {
      const v = clipPose(clip('idle_ground'), u * 8).translation.get(t) ?? [0, 0, 0];
      return dmath.hypot(v[0], v[1], v[2]);
    };
    expect(out(0.69)).toBeLessThan(out(0.2) - 0.02);
  });

  for (const name of ['slither', 'idle_ground', 'idle', 'hood_up', 'rear'])
    it(`${name} never passes the body through itself, nor folds a joint past its limit`, () => {
      for (let i = 0; i <= 12; i++) {
        expect(selfClearance(clip(name), i / 12)).toBeGreaterThan(-0.006);
        const b = bends(spineAt(clip(name), i / 12).at);
        // Design limits: the head on the neck 75°, any other link 60° (the rest pose's tightest is 55°).
        expect(b[0] ?? 0).toBeLessThan(75);
        expect(Math.max(...b.slice(1))).toBeLessThan(60);
      }
    });

  it('rears from the ground: the body behind the raised length stays down, the pile stays put', () => {
    const hinge = rearHinge(restHeads.length + 1);
    const start = heads('rear', 0);
    const H = ARCS[hinge] ?? RAISED;
    // It starts laid out: the head on the ground, the neck no higher than the pile under it.
    expect((start[0] as Vec3)[2]).toBeLessThan(seatHeight(0) + 0.01);
    for (let i = 0; i < hinge; i++) expect((start[i] as Vec3)[2]).toBeLessThan(COIL_TOP + 0.03);
    const top = Math.max(...restHeads.map((p) => p[2]));
    for (let f = 0; f <= 12; f++) {
      const u = f / 12;
      const now = heads('rear', u);
      const raised = H * REAR.rise(u);
      now.forEach((p, i) => {
        if (i >= hinge) expect(dist(p, restHeads[i] as Vec3)).toBeLessThan(0.005);
        else if ((ARCS[i] ?? 0) >= raised) expect(p[2]).toBeLessThan((start[i] as Vec3)[2] + 0.01);
        expect(p[2]).toBeLessThan(top + 0.02);
      });
    }
  });

  it('closes every loop', () => {
    for (const name of ['slither', 'idle', 'idle_ground', 'hood_up']) {
      const a = clipPose(clip(name), 0).rotation;
      const b = clipPose(clip(name), clip(name).seconds).rotation;
      for (const [bone, q] of a) {
        const r = b.get(bone) ?? [0, 0, 0, 1];
        expect(Math.abs(q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3])).toBeGreaterThan(
          0.9999,
        );
      }
    }
  });
});
