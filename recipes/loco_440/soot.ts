// Soot that stays matt. The jacket and the cab roof are lacquered (`enamel` clear coat), and a
// clear coat mirrors the sky however dark the paint under it is baked, so the fallout from the
// stack is also laid on as two thin blankets with no finish: one along the boiler crown, ragged
// down the flanks and widest by the stack, one down the middle of the cab roof. Each lies 2 mm
// off the sheet under it and follows its facets (columns at the lathe's own vertices, stations
// at the profile's breaks), black in the middle and fading to the paint's tone at its edge.

import {
  type BuildContext,
  type Mesh,
  MeshBuilder,
  stripRect,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { ROOF } from './cab.ts';
import {
  BOILER_Z,
  facetRadius,
  jacketRadius,
  type Layout,
  RED,
  RUSSIA,
  TAPER_LEN,
  WAGON_LEN,
} from './shared.ts';

const SOOT: Vec3 = [0.022, 0.02, 0.019];
const LIFT = 0.002;

const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

interface Column {
  readonly p: Vec3;
  readonly n: Vec3;
  /** 0 at the blanket's edge … 1 in its middle. */
  readonly depth: number;
}

/** Rows of columns → one sheet; every row has the same number of columns. */
function sheet(rows: readonly (readonly Column[])[], paint: Vec3): Mesh {
  const b = new MeshBuilder();
  const r = stripRect('plain');
  const uv: [number, number] = [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2];
  const ids = rows.map((row) =>
    row.map((c) => ({
      p: c.p,
      id: b.vertex({
        p: c.p,
        n: c.n,
        uv,
        color: mix(mix(paint, SOOT, 0.35), SOOT, Math.min(1, c.depth * 2.2)),
      }),
    })),
  );
  type Corner = (typeof ids)[number][number];
  const same = (u: Corner, v: Corner): boolean =>
    Math.hypot(u.p[0] - v.p[0], u.p[1] - v.p[1], u.p[2] - v.p[2]) < 1e-9;
  // Columns pulled in to a ragged edge coincide there: those triangles have no area, skip them.
  const tri = (u: Corner | undefined, v: Corner | undefined, w: Corner | undefined): void => {
    if (u && v && w && !same(u, v) && !same(v, w) && !same(w, u)) b.tri(u.id, v.id, w.id);
  };
  for (let i = 0; i + 1 < ids.length; i++) {
    const [a, c] = [ids[i] ?? [], ids[i + 1] ?? []];
    for (let k = 0; k + 1 < a.length; k++) {
      tri(a[k], a[k + 1], c[k + 1]);
      tri(a[k], c[k + 1], c[k]);
    }
  }
  return b.build();
}

/** Stations from x0 to x1 every `step`, plus the given breaks that fall inside. */
function stations(x0: number, x1: number, step: number, breaks: readonly number[]): number[] {
  const n = Math.max(1, Math.round((x1 - x0) / step));
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
  for (const x of breaks) if (x > x0 + 0.02 && x < x1 - 0.02) xs.push(x);
  return xs.sort((a, b) => a - b);
}

/** The blanket on the jacket crown: `cols` lathe vertices either side of the top, ragged edges. */
function crown(L: Layout, ragged: (x: number) => number): Mesh {
  const step = (Math.PI * 2) / L.segs;
  const reach = Math.floor((75 * Math.PI) / 180 / step);
  const xs = stations(L.barrelRear + 0.12, L.barrelFront - 0.03, 0.3, [
    L.barrelRear + WAGON_LEN,
    L.barrelRear + WAGON_LEN + TAPER_LEN,
  ]);
  const rows = xs.map((x) => {
    const r = jacketRadius(L, x);
    // Half-angle from the top: 32–58°, and 12° wider in the last metre before the stack.
    const half =
      ((32 + 26 * ragged(x) + 12 * Math.exp(-(L.barrelFront - x) / 1.0)) * Math.PI) / 180;
    // Angles from +Y (the lathe's first vertex): the lathe's own vertices, pulled in to the edge.
    const top = Math.PI / 2;
    const first = Math.ceil((top - reach * step) / step - 1e-9);
    const angles: number[] = [];
    for (
      let k = 0;
      first + k <= first + 2 * reach && (first + k) * step <= top + reach * step + 1e-9;
      k++
    )
      angles.push((first + k) * step);
    return angles.map((a0): Column => {
      const a = Math.min(top + half, Math.max(top - half, a0));
      const rr = facetRadius(r, L.segs, a) + LIFT;
      return {
        p: [x, Math.cos(a) * rr, BOILER_Z + Math.sin(a) * rr],
        n: [0, Math.cos(a), Math.sin(a)],
        depth: 1 - Math.abs(a - top) / half,
      };
    });
  });
  return sheet(rows, RUSSIA);
}

/** The blanket down the middle of the arched cab roof, on the roof's own nine-point section. */
function roof(L: Layout, ragged: (x: number) => number): Mesh {
  const section = Array.from({ length: 9 }, (_, i): [number, number] => {
    const a = Math.PI * (i / 8);
    return [Math.cos(a) * ROOF.halfWidth, Math.sin(a) * ROOF.rise];
  });
  /** Roof height over y, on the section's chords. */
  const zAt = (y: number): number => {
    for (let i = 0; i + 1 < section.length; i++) {
      const p = section[i] ?? [0, 0];
      const q = section[i + 1] ?? [0, 0];
      if (y <= p[0] && y >= q[0]) return p[1] + ((q[1] - p[1]) * (p[0] - y)) / (p[0] - q[0] || 1);
    }
    return 0;
  };
  const inner = section.slice(3, 6).map((p) => p[0]);
  const xs = stations(L.cabRear - ROOF.rear + 0.03, L.cabFront + ROOF.front - 0.03, 0.2, []);
  const rows = xs.map((x) => {
    const edge = 0.62 + 0.32 * ragged(x * 1.7 + 9);
    return [edge, ...inner, -edge].map(
      (y): Column => ({
        p: [x, y, ROOF.z + zAt(y) + LIFT],
        n: [0, 0, 1],
        depth: 1 - Math.abs(y) / edge,
      }),
    );
  });
  return sheet(rows, RED);
}

/** Add the matt soot blankets (near and mid LOD; far, the baked vertex soot is all there is). */
export function buildSoot(ctx: BuildContext, L: Layout): void {
  if (ctx.lod === 2) return;
  const f = valueNoise(ctx.rng.fork('soot_edge'), { scale: 0.45, octaves: 2 });
  const ragged = (x: number): number => Math.min(1, Math.max(0, 0.5 + 0.5 * f([x, 0, 0])));
  ctx.part('boiler_soot', crown(L, ragged), { parent: 'locomotive' });
  ctx.part('cab_soot', roof(L, ragged), { parent: 'locomotive' });
}
