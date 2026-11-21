// Orc armour: forged iron pauldrons. Each is built the way a smith builds one, from separate
// plates with real thickness (../_lib/bust/plates.ts): a domed CROWN plate over the deltoid lapped
// over a flaring SKIRT plate whose lip is rolled over a wire, the two held by a ring of domed
// rivets through the lap; two overlapping lames down the arm, each rolled at its lower edge and
// riveted at its ends and centre (where the leather inside hangs them); a boss on the crown and
// bone spikes in iron collars. Bare dark steel: the `aluminium` metal strip under a dark steel tint
// (`PLATE_STRIP`, `C.plate`; metal, not paint),
// hammer-peened all over and dented by blows at LOD0, then worn by `weather`: edges rubbed
// bright, scratches across the open plate and rust under the rivets (D547, D548). LOD1 coarsens the rings; the far LOD's solids are far.ts.

import {
  type BuildContext,
  dmath,
  type Mesh,
  merge,
  type Rng,
  type SculptEdit,
  sculpt,
  weather,
} from '@developerz.ai/ts23d';
import { add, cone2, cross, mul, norm, sub, type V } from '../_lib/bust/kit.ts';
import { plateProfile, type Revolve, revolvePlate } from '../_lib/bust/plates.ts';
import { farPauldron, farSpikes } from './far.ts';
import { cap, capPoint, LAME_R, LAP, lameAxis, SPIKES, spikeEnd } from './fittings.ts';
import { C, FITTING_STRIP, PLATE_STRIP } from './palette.ts';

type P2 = readonly [number, number];
interface Dent {
  readonly theta: number;
  readonly h: number;
  readonly radius: number;
  readonly depth: number;
}

/** The crown plate ends at this polar angle (deg); the skirt starts under it at `SKIRT_FROM`. */
const CROWN_TO = 62;
const SKIRT_FROM = 53;
/** The rivet ring's polar angle: through the lap, between the two plates' edges. */
const RIVET_PHI = 58;
const RIVETS = 8;

/** `n` + 1 points down a meridian of the ellipsoid (radius r, height h), polar a → b degrees. */
function meridian(r: number, h: number, a: number, b: number, n: number): P2[] {
  return Array.from({ length: n + 1 }, (_, i): P2 => {
    const phi = ((a + ((b - a) * i) / n) * Math.PI) / 180;
    return [r * dmath.sin(phi), h * dmath.cos(phi)];
  });
}

/** A plate's cross-section (plates.ts `plateProfile`) with its unseen inner face thinned to
 *  three points: the hidden side of a 64-ring dome is half its triangles otherwise. */
function section(outer: readonly P2[], t: number, edge: number): P2[] {
  const n = outer.length;
  const full = plateProfile(outer, t, edge);
  const from = n + edge - 1;
  const mid = from + Math.floor(n / 2);
  return full.filter(
    (_, i) => i < from || i >= from + n || i === from || i === mid || i === from + n - 1,
  );
}

/** A forged dome (a rivet head, a boss): a solid of revolution `r` wide and `h` proud at `at`,
 *  its foot sunk 3 mm into the plate. */
function dome(
  at: V,
  axis: V,
  r: number,
  h: number,
  steps: number,
  color: V,
  strip = FITTING_STRIP,
): Mesh {
  const profile: P2[] = [
    [r * 0.04, h],
    [r * 0.5, h * 0.88],
    [r * 0.86, h * 0.52],
    [r, h * 0.08],
    [r, -0.003],
    [r * 0.04, -0.003],
  ];
  const ref: V = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return revolvePlate(profile, {
    at,
    axis,
    ref,
    from: 0,
    to: 360,
    steps,
    color,
    strip,
  });
}

/** The wire a plate's edge is rolled over, as a ring of its own in brighter, rubbed steel (the
 *  fitting strip): the bright line along every plate edge that says metal. `c` is the wire's
 *  centre in the plate's (r, z) section. */
function wire(c: P2, r: number, seg: number, o: Omit<Revolve, 'color' | 'strip'>): Mesh {
  const ring = Array.from({ length: seg }, (_, i): P2 => {
    const a = (-i / seg) * 2 * Math.PI;
    return [c[0] + r * dmath.cos(a), c[1] + r * dmath.sin(a)];
  });
  return revolvePlate(ring, { ...o, color: C.plateRim, strip: FITTING_STRIP });
}

/** How much deeper a dent at height h must be pressed to read `depth` deep: `revolvePlate`
 *  pushes along the radius, which near a dome's crown lies almost in the surface. */
type Gain = (h: number) => number;
const FLAT: Gain = () => 1;

/** `n` dents scattered over `turn` degrees and heights h0 … h1, `r` wide and `d` deep ([min,
 *  extra] each, metres). */
function dents(
  rng: Rng,
  n: number,
  turn: readonly [number, number],
  [h0, h1]: readonly [number, number],
  r: readonly [number, number],
  d: readonly [number, number],
  gain: Gain,
): Dent[] {
  return Array.from({ length: n }, (): Dent => {
    const h = h0 + (h1 - h0) * rng.next();
    return {
      theta: turn[0] + (turn[1] - turn[0]) * rng.next(),
      h,
      radius: r[0] + rng.next() * r[1],
      depth: (d[0] + rng.next() * d[1]) * gain(h),
    };
  });
}

/** Dents of a full ring, repeated a turn either side: `revolvePlate` measures a dent's reach in
 *  unwrapped degrees, so one near 0° or 360° stops at the ring's seam and opens a crack there. */
const wrapped = (list: readonly Dent[]): Dent[] =>
  list.flatMap((d) => [d, { ...d, theta: d.theta - 360 }, { ...d, theta: d.theta + 360 }]);

/** Hammer peening: the forging's facets, 1.2–2.2 mm deep and 2.6–4 cm across. Raking light reads
 *  beaten iron, not a pressed bowl. */
const peen = (
  rng: Rng,
  n: number,
  turn: readonly [number, number],
  h0: number,
  h1: number,
  gain = FLAT,
): Dent[] => dents(rng, n, turn, [h0, h1], [0.013, 0.007], [0.0012, 0.001], gain);

/** Blows taken: dents 3–5 mm deep and 3–4.5 cm across. */
const blows = (
  rng: Rng,
  n: number,
  turn: readonly [number, number],
  h0: number,
  h1: number,
  gain = FLAT,
): Dent[] => dents(rng, n, turn, [h0, h1], [0.015, 0.008], [0.003, 0.002], gain);

export interface Pauldron {
  readonly plates: Mesh[];
  /** Wires, rivet heads and the boss: fitted after the plates were worn. */
  readonly fittings: Mesh[];
  readonly bone: SculptEdit[];
  /** Rivet heads (the weathering's fastener spots: rust starts under them). */
  readonly rivets: V[];
}

/** One pauldron (s = +1 left, −1 right). */
export function pauldron(s: number, lod: number, rng: Rng): Pauldron {
  if (lod === 2) return { plates: [farPauldron(s)], fittings: [], bone: [], rivets: [] };
  const near = lod === 0;
  // (56 rings round the dome at LOD0: the peening is 2–3 cm across and the rubbed edges and
  // scratches are vertex colour, so the plate needs a vertex every centimetre to carry them.)
  const steps = near ? 56 : 20;
  const edge = near ? 4 : 2;
  const { at, axis, R, H } = cap(s);
  const rev = { at, axis, ref: [1, 0, 0] as V, from: 0, to: 360, steps, strip: PLATE_STRIP };
  const all = [0, 360] as const;
  const plates: Mesh[] = [];
  const fittings: Mesh[] = [];
  // A plate's lower edge (its last outer point and the rounded edge after it) rubbed to bare
  // iron: the rows of an `n`-point outer face that every strap, cloak and blow slides over.
  const rubbed = (n: number) => ({
    rng,
    from: n - 1,
    to: n + edge,
    edge: C.bareIron,
    bare: C.bareIron,
    chip: 0,
    rust: C.rust,
    drip: [],
    length: 0,
  });
  // Crown: the dome's upper plate, 6 mm thick, lapped over the skirt (a plate and a gap proud
  // of it: the skirt keeps the radius that clears the deltoid).
  const crown = meridian(R + LAP, H + LAP, 8, CROWN_TO, near ? 10 : 4);
  const crownLow = (H + LAP) * dmath.cos((CROWN_TO * Math.PI) / 180);
  // (The radius meets the dome at sin φ: a dent near the crown is pressed up to 1.7 × deeper;
  // more, and the outer face is pushed through the plate's own inner one.)
  const crownGain: Gain = (h) => {
    const c = Math.min(1, h / (H + LAP));
    return 1 / Math.max(0.6, Math.sqrt(1 - c * c));
  };
  plates.push(
    revolvePlate(section(crown, 0.006, edge), {
      ...rev,
      color: C.plate,
      wear: rubbed(crown.length),
      dents: near
        ? wrapped([
            ...blows(rng, 3, all, crownLow + 0.015, H * 0.7, crownGain),
            ...peen(rng, 26, all, crownLow + 0.01, H, crownGain),
          ])
        : [],
    }),
  );
  // Skirt: lapped under the crown, flaring to a lip rolled over a wire.
  const skirt: P2[] = [...meridian(R, H, SKIRT_FROM, 88, near ? 7 : 3), [R * 1.085, -0.016]];
  plates.push(
    revolvePlate(section(skirt, 0.007, edge), {
      ...rev,
      color: C.plate,
      dents: near
        ? wrapped([
            ...blows(rng, 2, all, 0.005, crownLow - 0.01),
            ...peen(rng, 20, all, -0.01, crownLow),
          ])
        : [],
    }),
  );
  fittings.push(wire([R * 1.085 - 0.001, -0.019], 0.006, near ? 6 : 5, rev));
  const rivets: V[] = [];
  /** A point on the crown plate's outer face and the way out of it there. */
  const onCrown = (phi: number, theta: number): { at: V; out: V } => {
    const p = capPoint(s, phi, theta, LAP);
    return { at: p, out: norm(sub(capPoint(s, phi, theta, LAP + 0.01), p)) };
  };
  // Boss over the crown of the dome, where the central spike roots.
  const top = onCrown(12, 90 * s);
  fittings.push(dome(top.at, top.out, 0.042, 0.006, near ? 20 : 8, C.bareIron, PLATE_STRIP));
  // The rivet ring through the lap: domed heads 3.5 mm proud, holding the crown to the skirt.
  if (near)
    for (let i = 0; i < RIVETS; i++) {
      const head = onCrown(RIVET_PHI, (i + 0.5) * (360 / RIVETS));
      rivets.push(head.at);
      fittings.push(dome(head.at, head.out, 0.0068, 0.0035, 8, C.rivet));
    }
  // Lames: two overlapping bands down the outer arm, the lower flaring wider. They end where the
  // arm stub does (z 0.15): a third hung below the bust's cut like a stump beside the body.
  const { at: armAt, axis: armAxis } = lameAxis(s);
  const zz = norm(armAxis);
  const xr = norm(sub([0, s, 0], mul(zz, zz[1] * s)));
  const yr = cross(zz, xr);
  const span = [-70, 70] as const;
  for (let i = 0; i < 2; i++) {
    const top = 0.232 - i * 0.037;
    const r0 = LAME_R + i * 0.007;
    const outer: P2[] = [
      [r0, top],
      [r0 + 0.003, top - 0.012],
      [r0 + 0.006, top - 0.024],
      [r0 + 0.0095, top - 0.035],
      [r0 + 0.013, top - 0.046],
    ];
    const band = near ? outer : ([outer[0], outer[2], outer[4]] as P2[]);
    const turn = {
      at: armAt,
      axis: armAxis,
      ref: [0, s, 0] as V,
      from: -105,
      to: 105,
      steps: near ? 26 : 11,
    };
    plates.push(
      revolvePlate(section(band, 0.007, edge), {
        ...turn,
        color: C.plate,
        strip: PLATE_STRIP,
        wear: rubbed(band.length),
        dents: near
          ? [
              ...blows(rng, 1, span, top - 0.035, top - 0.012),
              ...peen(rng, 8, [-100, 100], top - 0.044, top),
            ]
          : [],
      }),
    );
    fittings.push(wire([r0 + 0.012, top - 0.049], 0.0055, near ? 6 : 5, turn));
    // Rivets at the band ends and centre, set into the outer face.
    if (near)
      for (const a of [-92, 0, 92]) {
        const t = (a * Math.PI) / 180;
        const dir = add(mul(xr, dmath.cos(t)), mul(yr, dmath.sin(t)));
        const head = add(add(armAt, mul(dir, r0 + 0.003)), mul(zz, top - 0.013));
        rivets.push(head);
        fittings.push(dome(head, dir, 0.006, 0.003, 8, C.rivet));
      }
  }
  return { plates, fittings, bone: spikeEdits(s), rivets };
}

/** Bone spikes: one big through the boss, a smaller one raked forward, each in a flared collar. */
function spikeEdits(s: number): SculptEdit[] {
  const { at: capAt, axis: capAxis } = cap(s);
  const bone: SculptEdit[] = [];
  SPIKES.forEach(([phi, theta, full, r], i) => {
    const { len, tip } = spikeEnd(s, i, full);
    const root = capPoint(s, phi, theta * s, LAP - 0.004);
    const out = norm(sub(root, capAt));
    const dir = norm(add(mul(out, 0.6), mul(capAxis, 0.8)));
    // The collar flares onto the plate (a ~35° skirt, not a step) and the spike is filleted
    // into it: one sculpt, so the root is blended, iron below and bone above.
    bone.push(
      cone2(add(root, mul(dir, -0.008)), add(root, mul(dir, 0.009)), r + 0.013, r + 0.003, {
        color: C.collar,
      }),
      cone2(add(root, mul(dir, 0.004)), add(root, mul(dir, len)), r, tip, { blend: 0.004 }),
    );
  });
  return bone;
}

export interface ArmourParts {
  readonly pauldrons: Mesh;
  readonly spikes: Mesh;
}

export function armour(ctx: BuildContext): ArmourParts {
  const lod = ctx.lod;
  const rng = ctx.rng.fork('armour');
  const l = pauldron(1, lod, rng.fork('l'));
  const r = pauldron(-1, lod, rng.fork('r'));
  const fresh = merge([...l.plates, ...r.plates]);
  // (The far spikes are cones of revolution: a 1.9 cm spike sculpted at a 1.7 cm cell is a lump.)
  const spikes =
    lod === 2
      ? merge([farSpikes(1), farSpikes(-1)])
      : sculpt({
          edits: [...l.bone, ...r.bone],
          resolution: ctx.pick([0.0062, 0.0085, 0.017]),
          color: C.bone,
        });
  if (lod === 2) return { pauldrons: fresh, spikes };
  // Years of campaigning, laid down where it happens: the plates' edges and the rolled beads
  // rubbed to bright iron, scratches across the open plate, rust under each rivet running down
  // the plate, soot in the hollows.
  const rivets = [...l.rivets, ...r.rivets];
  const worn = weather(
    ctx,
    { pauldrons: fresh },
    {
      name: 'plate',
      age: 0.8,
      resolution: 0,
      under: C.bareIron,
      fasteners: rivets.map((at) => ({ at, radius: 0.008 })),
      effects: {
        // (LOD1's rings are 3 × wider: a rubbed edge there is a third of the plate, so it takes
        // a quarter of the wear at half the strength to keep the plate as dark as LOD0's.)
        chips: {
          where: 'convex-edges',
          amount: ctx.pick([0.45, 0.12, 0]),
          strength: ctx.pick([0.8, 0.45, 0]),
        },
        scratches: {
          where: 'exposed-panels | side-facing',
          amount: ctx.pick([0.06, 0.04, 0]),
          strength: 0.4,
        },
        // Soot and old grease packed into the lap, the rolled lips and the hammer's hollows.
        mud: { where: 'cavities', amount: 0.5, strength: 0.6, color: C.soot },
        // (LOD1 carries no rivet heads: nothing for the rust to start under.)
        ...(rivets.length
          ? {
              rust: {
                where: 'below-fasteners | fasteners',
                amount: 0.12,
                strength: 0.7,
                color: C.rust,
                streaks: true,
                streakLength: 0.03,
              },
            }
          : {}),
      },
    },
  );
  return { pauldrons: merge([worn['pauldrons'] ?? fresh, ...l.fittings, ...r.fittings]), spikes };
}
