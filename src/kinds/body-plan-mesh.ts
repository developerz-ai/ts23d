// The body-plan skin surface: one closed sweep per chain copy, merged. Sweeps, not an SDF, because
// the triangle count is exact per LOD (a fish stays a few hundred at LOD2), a thin fin or arm tip
// cannot fall between grid cells, a ring sits on every joint so every bone has flesh at every LOD,
// and each chain's vertices are known, so arm A can never be weighted to arm B. A child chain is
// joined to its parent by a flared root and a cone buried down to the parent's bone: no slit, no
// floating shell. Sections are ellipses: height (radius × flatten) along `bend`, width along
// `pitch`, so one thin chain is a fin. Colour is countershaded from the world normal. A chain may
// add `relief` and `tint`, and `blend` fillets it into its neighbours (body-plan-weld.ts).

import { type Mesh, MeshBuilder, merge, Ts23dError, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import {
  type ChainCopy,
  type ChainCurve,
  chainCopies,
  chainCurve,
  linkStops,
} from './body-plan-curve.ts';
import type {
  BodyPlan,
  BodyPlanSpec,
  ChainSpec,
  PlanChain,
  SurfacePoint,
} from './body-plan-types.ts';
import { gridNormals, type WeldItem, weldPieces } from './body-plan-weld.ts';
import { mixRgb, smoothstep, v3 } from './creature-curve.ts';

/** Linear colours of the skin; `line` is the normal z where back gives way to belly. */
export interface BodyPlanLook {
  readonly back: Vec3;
  readonly belly: Vec3;
  /** Colour the chain tips fade to (fin tips, arm ends). */
  readonly tip?: Vec3;
  /** Normal z of the back/belly boundary, -1..1 (-0.3: only the underside is pale). */
  readonly line?: number;
  /** Half-width of that boundary in normal z (0.25). */
  readonly soft?: number;
  readonly strip?: StripId;
}

export interface BodyPiece {
  readonly chain: PlanChain;
  readonly mesh: Mesh;
}

type Lod = 0 | 1 | 2;

const RINGS_PER_LINK: readonly [number, number, number] = [6, 3, 1];
const ROUND_SIDES: readonly [number, number, number] = [20, 12, 6];
const FLAT_SIDES: readonly [number, number, number] = [12, 8, 4];
/** Root flare: extra radius at the joint, and its length in root radii. */
const FLARE = 0.35;
const FLARE_RADII = 2;
/** A chain end under this share of the chain's widest radius closes on a point. */
const POINT_END = 0.06;
const MIN_RING = 0.001;
/** `antiFold`: how much of the local bend radius a section may reach toward the inside. */
const INSIDE_REACH = 0.42;

export function specOf(plan: BodyPlan): BodyPlanSpec {
  if (plan.spec) return plan.spec;
  throw new Ts23dError('T3D_RECIPE_INVALID', {
    cause: `body plan '${plan.name}' carries no spec, so it has no radii to build a skin from`,
    fix: 'make the plan with bodyPlan(spec)',
  });
}

export const chainSpecOf = (plan: BodyPlan, chain: PlanChain): ChainSpec | undefined =>
  specOf(plan).chains.find((c) => c.name === chain.spec);

const isFlat = (c: ChainSpec): boolean => (c.flatten ?? 1) < 0.5 || (c.flatten ?? 1) > 2;

/** Ring positions along a chain: every joint, split per LOD, plus the flare's own at LOD0/1. */
function ringStops(c: ChainSpec, curve: ChainCurve, flareU: number, lod: Lod): number[] {
  const joints = linkStops(c.links, c.bias);
  const per = c.detail?.rings?.[lod] ?? RINGS_PER_LINK[lod];
  const out: number[] = [];
  joints.slice(0, -1).forEach((u, i) => {
    const next = joints[i + 1] ?? 1;
    for (let k = 0; k < per; k++) out.push(u + ((next - u) * k) / per);
  });
  out.push(1);
  // The root end of a body tapers fastest (a snout): one more ring keeps it pointed at LOD2.
  if (!c.parent) out.push((joints[1] ?? 1) / 2);
  if (lod < 2 && flareU > 0) out.push(flareU / 3, (2 * flareU) / 3, flareU);
  const min = 0.25 / Math.max(1, curve.length * 1000);
  return [...out]
    .sort((a, b) => a - b)
    .filter((u, i, all) => i === 0 || u - (all[i - 1] ?? 0) > min);
}

interface Sweep {
  readonly c: ChainSpec;
  readonly curve: ChainCurve;
  readonly copy: ChainCopy;
  readonly flareU: number;
  readonly look: BodyPlanLook;
  readonly lod: Lod;
  /** World point the root closes on (a child: on its parent's bone), or null. */
  readonly anchor: Vec3 | null;
}

const colourAt = (o: BodyPlanLook, n: Vec3, u: number): Vec3 => {
  const line = o.line ?? -0.3;
  const soft = o.soft ?? 0.25;
  const c = mixRgb(o.belly, o.back, smoothstep(line - soft, line + soft, n[2]));
  return o.tip ? mixRgb(c, o.tip, smoothstep(0.6, 1, u)) : c;
};

const flareOf = (s: Sweep, u: number): number =>
  s.flareU > 0 && u < s.flareU ? 1 + FLARE * (1 - u / s.flareU) ** 2 : 1;

/** The section offset, shortened on the inside of a bend tighter than it can follow. */
function keptOutside(curve: ChainCurve, u: number, offset: Vec3): Vec3 {
  // Wide enough to read the bend, not the curve's sampling steps.
  const h = 0.04;
  const [lo, hi] = [Math.max(0, u - h), Math.min(1, u + h)];
  const turn = v3.mul(v3.sub(curve.at(hi).t, curve.at(lo).t), 1 / ((hi - lo) * curve.length));
  const reach = v3.dot(turn, offset);
  if (reach <= 1e-6) return offset;
  // A soft limit: a hard one would leave a kink along the line where it starts to bite.
  return v3.mul(offset, (INSIDE_REACH * (1 - Math.exp(-reach / INSIDE_REACH))) / reach);
}

/** The skin point at (u, angle) before relief, with its shading normal. */
function skinPoint(s: Sweep, u: number, angle: number, eps: number): SurfacePoint {
  const { c, curve, copy } = s;
  const flatten = c.flatten ?? 1;
  const radius = (x: number): number => curve.at(x).r * flareOf(s, x);
  const q = curve.at(u);
  const r = Math.max(MIN_RING, radius(u));
  const slope = (radius(u + eps) - radius(u - eps)) / (2 * eps * curve.length);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const round = v3.add(v3.mul(q.bend, cos * r * flatten), v3.mul(q.pitch, sin * r));
  const out = c.antiFold ? keptOutside(curve, u, round) : round;
  const shade = v3.add(v3.mul(q.bend, cos / flatten), v3.mul(q.pitch, sin));
  return {
    u,
    angle,
    s: u * curve.length,
    radius: r,
    chain: copy.id,
    lod: s.lod,
    p: copy.point(v3.add(q.p, out)),
    n: copy.dir(v3.norm(v3.sub(shade, v3.mul(q.t, slope)))),
  };
}

function sweepChain(s: Sweep, stops: readonly number[], sides: number): Mesh {
  const { c, curve, copy, look } = s;
  const rect = stripRect(look.strip ?? 'plain');
  const du = (rect.u1 - rect.u0) / rect.metres;
  const widest = Math.max(...c.radius);
  const bands = c.uvBands ?? 1;
  const b = new MeshBuilder();
  const radius = (u: number): number => curve.at(u).r * flareOf(s, u);
  const pointy = (u: number): boolean => radius(u) < widest * POINT_END;
  const inner = stops.filter((u, i) => {
    const end = i === 0 || i === stops.length - 1;
    return !(end && pointy(u));
  });
  const kept = inner.length > 0 ? inner : [0.5];
  const eps = 0.5 / Math.max(1, stops.length * 8);
  const pts = kept.map((u) =>
    Array.from({ length: sides + 1 }, (_, j) => skinPoint(s, u, (j / sides) * Math.PI * 2, eps)),
  );
  const moved = pts.map((row) =>
    row.map((q) => (c.relief ? v3.add(q.p, v3.mul(q.n, c.relief(q))) : q.p)),
  );
  const normals = c.relief ? gridNormals(pts, moved, sides) : pts.map((row) => row.map((q) => q.n));
  /** Round the section: 0..1, or a mirrored zigzag over `bands` repeats of the strip. */
  const across = (j: number): number => {
    const x = (j / sides) * bands;
    const f = x - Math.floor(x);
    return bands === 1 ? j / sides : Math.floor(x) % 2 === 0 ? f : 1 - f;
  };
  const rings = pts.map((row, i) =>
    row.map((q, j) => {
      const n = normals[i]?.[j] ?? q.n;
      const base = colourAt(look, n, q.u);
      return b.vertex({
        p: moved[i]?.[j] ?? q.p,
        n,
        uv: [rect.u0 + q.u * curve.length * du, rect.v0 + across(j) * (rect.v1 - rect.v0)],
        color: c.tint ? c.tint({ ...q, n }, base) : base,
      });
    }),
  );
  const tri = (x: number, y: number, z: number): void => {
    if (copy.flips) b.tri(x, z, y);
    else b.tri(x, y, z);
  };
  for (let i = 0; i + 1 < rings.length; i++)
    for (let j = 0; j < sides; j++) {
      const [p, q] = [rings[i] ?? [], rings[i + 1] ?? []];
      tri(p[j] ?? 0, p[j + 1] ?? 0, q[j + 1] ?? 0);
      tri(p[j] ?? 0, q[j + 1] ?? 0, q[j] ?? 0);
    }
  const pole = (
    u: number,
    row: readonly number[],
    ringPoints: readonly SurfacePoint[],
    end: 1 | -1,
    at: Vec3 | null,
  ): void => {
    const q = curve.at(u);
    const n = copy.dir(v3.mul(q.t, end));
    const dome = pointy(u) ? 0 : radius(u) * 0.6;
    const p = at ?? copy.point(v3.add(q.p, v3.mul(q.t, end * dome)));
    // A tinted skin closes in its own colour: the ring's mean, not the plain countershade.
    const tinted = c.tint;
    const color = tinted
      ? v3.mul(
          ringPoints.reduce<Vec3>(
            (sum, r) => v3.add(sum, tinted(r, colourAt(look, r.n, r.u))),
            [0, 0, 0],
          ),
          1 / Math.max(1, ringPoints.length),
        )
      : colourAt(look, n, u);
    const centre = b.vertex({
      p,
      n,
      uv: [rect.u0 + u * curve.length * du, rect.v0],
      color,
    });
    for (let j = 0; j < sides; j++) {
      if (end === 1) tri(centre, row[j] ?? 0, row[j + 1] ?? 0);
      else tri(centre, row[j + 1] ?? 0, row[j] ?? 0);
    }
  };
  pole(0, rings[0] ?? [], pts[0] ?? [], -1, s.anchor);
  pole(1, rings[rings.length - 1] ?? [], pts[pts.length - 1] ?? [], 1, null);
  return b.build();
}

/** The point of bone segment a → b nearest to p. */
function nearestOn(a: Vec3, b: Vec3, p: Vec3): Vec3 {
  const ab = v3.sub(b, a);
  const l2 = v3.dot(ab, ab) || 1;
  const t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, a), ab) / l2));
  return v3.add(a, v3.mul(ab, t));
}

function sweepOf(plan: BodyPlan, chain: PlanChain, look: BodyPlanLook, lod: Lod): Sweep | null {
  const c = chainSpecOf(plan, chain);
  const copy = c && chainCopies(c).find((k) => k.id === chain.id);
  if (!c || !copy) return null;
  const curve = chainCurve(c);
  const root = curve.at(0);
  const reach = (root.r * Math.max(1, c.flatten ?? 1) * FLARE_RADII) / curve.length;
  // A filleted chain needs no flare: the weld makes the shoulder.
  const flareU = c.parent !== undefined && !(c.blend ?? 0) ? Math.min(0.3, reach) : 0;
  const up = plan.bones.find((b) => b.name === chain.links[0]?.bone.parent);
  const anchor = up ? nearestOn(up.head, up.tail, copy.point(root.p)) : null;
  return { c, curve, copy, flareU, look, lod, anchor };
}

/** One closed skin per chain copy, in plan order, at this LOD (`skin: false` chains have none). */
export function bodyPlanPieces(plan: BodyPlan, lod: Lod, look: BodyPlanLook): BodyPiece[] {
  specOf(plan);
  const items: WeldItem[] = plan.chains.flatMap((chain) => {
    const s = sweepOf(plan, chain, look, lod);
    if (!s || s.c.skin === false) return [];
    const sides = s.c.detail?.sides?.[lod] ?? (isFlat(s.c) ? FLAT_SIDES : ROUND_SIDES)[lod];
    const mesh = sweepChain(s, ringStops(s.c, s.curve, s.flareU, lod), sides);
    return [{ chain, mesh, spec: s.c, curve: s.curve, copy: s.copy }];
  });
  return weldPieces(plan, items).map(({ chain, mesh }) => ({ chain, mesh }));
}

/** The rest skin at (u, angle) of a chain copy, relief included: where detail is seated. */
export function chainSurface(
  plan: BodyPlan,
  id: string,
  look: BodyPlanLook,
): (u: number, angle: number) => SurfacePoint {
  const chain = plan.chains.find((x) => x.id === id);
  const s = chain && sweepOf(plan, chain, look, 0);
  if (!s)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `body plan '${plan.name}' has no chain '${id}'`,
      fix: `use one of: ${plan.chains.map((x) => x.id).join(', ')}`,
    });
  return (u, angle) => {
    const q = skinPoint(s, u, angle, 0.01);
    return s.c.relief ? { ...q, p: v3.add(q.p, v3.mul(q.n, s.c.relief(q))) } : q;
  };
}

/** The whole unskinned surface (a static body, or a look at the shape). */
export function bodyPlanMesh(plan: BodyPlan, lod: Lod, look: BodyPlanLook): Mesh {
  return merge(bodyPlanPieces(plan, lod, look).map((p) => p.mesh));
}
