// The container's far LOD: a box with baked colour. One closed body (five outer faces, the door
// end as a ring round a 7 cm recess the leaves sit in), then colour blocks 3 mm off its faces:
// six bay panels a side, each in its own weathered tone (the near LODs' stains, averaged per
// bay), a dirt strip along each sill, the louvres as darker quads, the orange band, six dusty
// roof sheets, the blind end and its service panel. The eight ISO castings are dark caps on
// their outer faces. The two leaves still hang on their hinge lines and swing; lock bars are
// painted on. No gradients anywhere: on a two-triangle face any per-vertex variation is a
// diagonal seam.

import {
  type BuildContext,
  type Mesh,
  merge,
  planar,
  translate,
  type Vec3,
} from '@developerz.ai/ts23d';
import { reproject, restrip, tessellate } from '../_lib/finish/finish.ts';
import { mix } from '../_lib/finish/wear.ts';
import {
  ACCENT,
  bevelled,
  CAST,
  CH,
  CL,
  CW,
  DARK,
  DOOR_T,
  DOOR_Z0,
  DOOR_Z1,
  doorMount,
  FRAME,
  GLOW,
  GRIME,
  H,
  HL,
  HW,
  L,
  LEAF,
  LEAF_X,
  METAL,
  POST,
  RULES,
  RUST_STAIN,
  SHELL,
  SHELL_DARK,
} from './shared.ts';

/** Roof dust and sill dirt, the tones the near LODs' weather pass lays down, as flat colours. */
const DUST: Vec3 = [0.5, 0.44, 0.33];
const MUD: Vec3 = [0.028, 0.02, 0.012];
/** Colour blocks stand this far off the body face they are painted on. */
const OFF = 0.003;
/** The leaves sit in a recess this deep (leaf 6 cm thick, 1 cm clear of the back wall). */
const POCKET = 0.07;

/** A flat quad facing `dir`, lifted `off` along it (the corners may come in either winding). */
function face(pts: readonly [Vec3, Vec3, Vec3, Vec3], dir: Vec3, color: Vec3, off = 0): Mesh {
  const [a, b, , d] = pts;
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const out = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] > 0;
  const l = Math.hypot(...dir) || 1;
  const points = (out ? [...pts] : [...pts].reverse()).map(
    (p): Vec3 => [p[0] + (dir[0] / l) * off, p[1] + (dir[1] / l) * off, p[2] + (dir[2] / l) * off],
  );
  return planar({ points, color });
}

/** Rectangle on the plane x = `x` (facing ±X by `dir`). */
const onX = (
  x: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): [Vec3, Vec3, Vec3, Vec3] => [
  [x, y0, z0],
  [x, y1, z0],
  [x, y1, z1],
  [x, y0, z1],
];
/** Rectangle on the plane y = `y`. */
const onY = (
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): [Vec3, Vec3, Vec3, Vec3] => [
  [x0, y, z0],
  [x1, y, z0],
  [x1, y, z1],
  [x0, y, z1],
];
/** Rectangle on the plane z = `z`. */
const onZ = (
  z: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): [Vec3, Vec3, Vec3, Vec3] => [
  [x0, y0, z],
  [x1, y0, z],
  [x1, y1, z],
  [x0, y1, z],
];

/** Flat colours onto their material strips at true scale (no vertex is added). */
const mapped = (m: Mesh): Mesh => reproject(restrip(tessellate(m, 100), RULES));

/** Build the far LOD under `root` (doors at −X, as the near build). */
export function buildFar(ctx: BuildContext, root: string): void {
  const oy = HW - POST;
  const xd = -HL + POCKET;
  // ── body: closed, frame-coloured; the door pocket's back wall is the dark interior ──────────
  const body: Mesh[] = [
    face(onY(HW, -HL, HL, 0, H), [0, 1, 0], FRAME),
    face(onY(-HW, -HL, HL, 0, H), [0, -1, 0], FRAME),
    face(onZ(H, -HL, HL, -HW, HW), [0, 0, 1], FRAME),
    face(onZ(0, -HL, HL, -HW, HW), [0, 0, -1], DARK),
    face(onX(HL, -HW, HW, 0, H), [1, 0, 0], FRAME),
    // Door end: two posts, sill and header round the opening.
    face(onX(-HL, -HW, -oy, 0, H), [-1, 0, 0], FRAME),
    face(onX(-HL, oy, HW, 0, H), [-1, 0, 0], FRAME),
    face(onX(-HL, -oy, oy, 0, DOOR_Z0), [-1, 0, 0], FRAME),
    face(onX(-HL, -oy, oy, DOOR_Z1, H), [-1, 0, 0], FRAME),
    // The pocket: four reveals and the back wall.
    face(onY(oy, -HL, xd, DOOR_Z0, DOOR_Z1), [0, -1, 0], FRAME),
    face(onY(-oy, -HL, xd, DOOR_Z0, DOOR_Z1), [0, 1, 0], FRAME),
    face(onZ(DOOR_Z0, -HL, xd, -oy, oy), [0, 0, 1], FRAME),
    face(onZ(DOOR_Z1, -HL, xd, -oy, oy), [0, 0, -1], FRAME),
    face(onX(xd, -oy, oy, DOOR_Z0, DOOR_Z1), [-1, 0, 0], DARK),
  ];
  ctx.part('frame', mapped(merge(body)), { parent: root });

  // ── colour blocks: bays, sill dirt, louvres, accent, roof, blind end ────────────────────────
  const rng = ctx.rng.fork('far_bays');
  const paint: Mesh[] = [];
  const span = L - 2 * CL;
  const bay = span / 6;
  for (const sy of [-1, 1]) {
    const dir: Vec3 = [0, sy, 0];
    for (let i = 0; i < 6; i++) {
      const x0 = -span / 2 + i * bay;
      // One tone per bay: rain-run grime on all of them, a rust bloom on about one in three.
      const tone = mix(
        mix(SHELL, GRIME, rng.range(0.08, 0.3)),
        RUST_STAIN,
        rng.next() < 0.35 ? rng.range(0.18, 0.32) : 0,
      );
      // Bay against bay with no gap: the ribs between them are the step from tone to tone.
      paint.push(face(onY(sy * HW, x0, x0 + bay, 0.5, H - 0.2), dir, tone, OFF));
      // Louvres: the slats and the paint between them, averaged.
      if (i % 2 === 1)
        paint.push(
          face(
            onY(sy * HW, x0 + 0.22, x0 + bay - 0.22, 1.5, 2.04),
            dir,
            mix(tone, DARK, 0.55),
            2 * OFF,
          ),
        );
    }
    // Dirt splashed up from the ground: the lowest 30 cm of the bays, one strip per side.
    paint.push(
      face(onY(sy * HW, -span / 2, span / 2, 0.2, 0.5), dir, mix(SHELL, MUD, 0.45), OFF),
      face(onY(sy * HW, -span / 2, span / 2, 1.21, 1.27), dir, ACCENT, 2 * OFF),
    );
  }
  // Roof: the six sheets between the ribs, dusted, each a shade apart.
  const rx = HL - 0.13;
  for (let i = 0; i < 6; i++)
    paint.push(
      face(
        onZ(H, -rx + (2 * rx * i) / 6, -rx + (2 * rx * (i + 1)) / 6, -HW + 0.12, HW - 0.12),
        [0, 0, 1],
        mix(mix(SHELL_DARK, DUST, 0.22), GRIME, rng.range(0, 0.35)),
        OFF,
      ),
    );
  paint.push(
    face(onX(HL, -HW + POST, HW - POST, 0.18, H - 0.15), [1, 0, 0], mix(SHELL, GRIME, 0.2), OFF),
    face(onX(HL, -0.7, 0.7, 0.5, 2.0), [1, 0, 0], SHELL_DARK, 2 * OFF),
  );
  ctx.part('body', mapped(merge(paint)), { parent: root });

  // ── castings: dark caps on the three outer faces of each ISO corner block ───────────────────
  let ci = 0;
  for (const top of [false, true])
    for (const sx of [1, -1])
      for (const sy of [1, -1]) {
        const [x0, x1] = sx > 0 ? [HL - CL, HL] : [-HL, -HL + CL];
        const [y0, y1] = sy > 0 ? [HW - CW, HW] : [-HW, -HW + CW];
        const [z0, z1] = top ? [H - CH, H] : [0, CH];
        ctx.part(
          `casting_${ci++}`,
          mapped(
            merge([
              face(onX(sx > 0 ? x1 : x0, y0, y1, z0, z1), [sx, 0, 0], CAST, OFF),
              face(onY(sy > 0 ? y1 : y0, x0, x1, z0, z1), [0, sy, 0], CAST, OFF),
              face(onZ(top ? z1 : z0, x0, x1, y0, y1), [0, 0, top ? 1 : -1], CAST, OFF),
            ]),
          ),
          { parent: root },
        );
      }

  // ── status strip (glow) on the header ───────────────────────────────────────────────────────
  ctx.part('status_light', face(onX(-HL, -0.8, 0.8, H - 0.12, H - 0.07), [-1, 0, 0], GLOW, OFF), {
    parent: root,
  });

  // ── doors: a leaf each, in hinge space; two lock bars painted on its outer face ─────────────
  for (const [s, side] of [
    [1, 'r'],
    [-1, 'l'],
  ] as const) {
    const zt = DOOR_Z1 - DOOR_Z0;
    const leaf: Mesh[] = [bevelled([DOOR_T, LEAF, zt], SHELL, 0, [0, -s * (LEAF / 2), 0])];
    for (const y of [0.32, 0.78])
      leaf.push(
        face(
          onX(-DOOR_T / 2, -s * (y - 0.03), -s * (y + 0.03), 0.01, zt - 0.01),
          [-1, 0, 0],
          METAL,
          OFF,
        ),
      );
    ctx.part(
      `door_${side}`,
      mapped(translate(merge(leaf), [LEAF_X, 0, 0])),
      doorMount(root, s, side),
    );
  }
}
