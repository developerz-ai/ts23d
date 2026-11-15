// Sections probed on the sculpted fields, for the biology checks: the chest's widest section —
// depth ÷ width (canids are deep and narrow, ≥ 1.25) and its swell over the declared ribcage width
// (wide blends between trunk blobs bloat it into a barrel) — and
// the neck → skull join (the axis from the neck into the skull behind the jaw angle stays inside
// body ∪ head, and the neck is as wide as the back of the skull where it meets it — no collar).

import type { Vec3 } from '../core/index.ts';
import { type Field, sculptField } from '../primitives/index.ts';
import { blockOut } from './creature-body.ts';
import type { Bones } from './creature-bones.ts';
import { headToWorld } from './creature-bones.ts';
import { headEdits } from './creature-head.ts';
import type { CreatureSpec } from './creature-spec.ts';

/** Deepest canid chest ÷ width allowed below (wolf ≈ 1.5–1.8; greyhound deeper still). */
export const CANID_CHEST_RATIO = 1.25;

const mirrored =
  (f: Field): Field =>
  (p) =>
    f([p[0], Math.abs(p[1]), p[2]]);

/** Distance from `from` along unit `dir` to the first point where `f` turns positive (≤ max). */
function exit(f: Field, from: Vec3, dir: Vec3, max: number, step: number): number {
  let t = 0;
  while (t < max && f([from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t]) < 0)
    t += step;
  return t;
}

/** The trunk masses' field (block-out only: no limbs, no fur). */
export function trunkField(b: Bones): Field {
  return mirrored(sculptField(blockOut(b), { color: [0, 0, 0] }).field);
}

export interface ChestSection {
  /** Widest section of the ribcage: its width and depth (z extent at the midline), metres. */
  readonly width: number;
  readonly depth: number;
  /** depth ÷ width (canids ≥ 1.25). */
  readonly ratio: number;
  /** Widest width ÷ the ribcage's declared width: > 1 is blend swelling (a barrel). */
  readonly swell: number;
}

/** The widest cross-section along the ribcage, probed on the trunk field. */
export function chestSection(b: Bones, f: Field = trunkField(b)): ChestSection {
  const rib = b.trunk[0];
  if (!rib) return { depth: 0, width: 0, ratio: 0, swell: 0 };
  const step = b.height / 1000;
  let best = { width: 0, depth: 0 };
  for (let i = 0; i <= 16; i++) {
    const x = rib.at[0] + rib.r[0] * (-0.8 + 1.6 * (i / 16));
    let half = 0;
    for (let j = 0; j <= 40; j++) {
      const z = rib.at[2] + rib.r[2] * (-0.9 + 1.8 * (j / 40));
      half = Math.max(half, exit(f, [x, 0, z], [0, 1, 0], b.height, step));
    }
    if (2 * half <= best.width) continue;
    const c: Vec3 = [x, 0, rib.at[2]];
    const depth = exit(f, c, [0, 0, 1], b.height, step) + exit(f, c, [0, 0, -1], b.height, step);
    best = { width: 2 * half, depth };
  }
  const { width, depth } = best;
  return { width, depth, ratio: width > 0 ? depth / width : 0, swell: width / (2 * rib.r[1]) };
}

/** World → head-local (inverse of headToWorld). */
function toHead(b: Bones, p: Vec3): Vec3 {
  const h = b.head;
  const c = Math.cos(h.pitch);
  const s = Math.sin(h.pitch);
  const d: Vec3 = [p[0] - h.atlas[0], p[1] - h.atlas[1], p[2] - h.atlas[2]];
  return [c * d[0] - s * d[2], d[1], s * d[0] + c * d[2]];
}

export interface NeckJoin {
  /** Share of the neck → skull axis inside body ∪ head (1 = no gap between the parts). */
  readonly inside: number;
  /** Neck half-width at the atlas ÷ the head's half-width there (≥ ~0.8: no collar). */
  readonly widthRatio: number;
}

/** Probe the join of the body's neck and the head part on the axis neck → jaw angle. */
export function neckJoin(b: Bones, s: CreatureSpec, body: Field = trunkField(b)): NeckJoin {
  const prev = b.neck[b.neck.length - 2];
  if (!prev) return { inside: 1, widthRatio: 1 };
  const he = headEdits(b, s, 1, b.head.length * 0.033);
  const head = mirrored(sculptField(he.edits, { color: [0, 0, 0] }).field);
  const hf: Field = (p) => head(toHead(b, p));
  const end = headToWorld(b.head, [0.15 * he.layout.lc, 0, -0.12 * he.layout.H]);
  let hit = 0;
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: Vec3 = [
      prev.at[0] + (end[0] - prev.at[0]) * t,
      0,
      prev.at[2] + (end[2] - prev.at[2]) * t,
    ];
    if (Math.min(body(p), hf(p)) < 0) hit++;
  }
  const step = b.height / 2000;
  const a = b.head.atlas;
  const neckW = exit(body, a, [0, 1, 0], b.height, step);
  const headW = exit(hf, a, [0, 1, 0], b.height, step);
  return { inside: hit / (n + 1), widthRatio: headW > 0 ? neckW / headW : 1 };
}
