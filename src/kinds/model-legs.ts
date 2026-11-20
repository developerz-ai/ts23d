// The legs of a standing model, found from the ground up: just above the ground every leg is its
// own island of cells (model-sections.ts); each island is matched to one of the plan's feet (the
// cheapest one-to-one pairing; left stays left and fore stays fore, or it throws) and followed
// upward level by level along its medial axis, up to the belly's height or until it runs into
// another leg. The centres of those sections are the leg's centre
// line: joints go on it at the plan's heights. Fewer islands than feet, a left leg right of its
// partner, or two legs that meet below mid-shank fail with T3D_MODEL_SKELETON.

import { dmath, Ts23dError, type Vec3 } from '../core/index.ts';
import type { TriBvh } from '../primitives/index.ts';
import { components, type Levels, medial, near, sectionOf } from './model-sections.ts';

export interface LegTrace {
  /** Sections from the ground up: z (level middle), centre x, y, inscribed radius (metres). */
  readonly line: readonly (readonly [number, number, number, number])[];
  /** Half-width of the paw's outline just above the ground, metres. */
  readonly paw: number;
  /** Height where the leg stops being free (it joined the trunk or another leg), metres. */
  readonly top: number;
  /** Unit XY direction ankle → toes (from the sole's outline), or [1, 0] when it reads as round. */
  readonly toe: readonly [number, number];
}

const fail = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_MODEL_SKELETON', { cause: `model skeleton: ${cause}`, fix });
};

/** Highest slab the legs may first be told apart at (slabs are 1/40 of the plan's height). */
const SEED_TOP = 6;

const REROLL =
  'ask the concept image for a square neutral stand with all legs apart and visible (side-on, no crossed or hidden legs), re-run the mesh model, or fall back to the code creature';

/** Cheapest one-to-one pairing of feet to islands (by XY distance); feet.length ≤ islands. */
function pair(feet: readonly Vec3[], centres: readonly (readonly number[])[]): number[] {
  let best: number[] = [];
  let cost = Infinity;
  const used = new Set<number>();
  const pick: number[] = [];
  const go = (i: number, sum: number): void => {
    if (sum >= cost) return;
    const f = feet[i];
    if (!f) {
      [best, cost] = [[...pick], sum];
      return;
    }
    centres.forEach((c, k) => {
      if (used.has(k)) return;
      used.add(k);
      pick.push(k);
      go(i + 1, sum + dmath.hypot((c[0] ?? 0) - f[0], (c[1] ?? 0) - f[1]));
      pick.pop();
      used.delete(k);
    });
  };
  go(0, 0);
  return best;
}

/** Each plan foot's leg in the model; `free[i]` is the height leg i must stay separate up to,
 *  `ceil[i]` the height its trace stops at (the belly: above it the leg is in the trunk). */
export function traceLegs(
  lv: Levels,
  bvh: TriBvh,
  feet: readonly Vec3[],
  free: readonly number[],
  ceil: readonly number[],
): LegTrace[] {
  const z = (k: number): number => (k + 0.5) * lv.dz;
  const islandsAt = (k: number): number[][] =>
    components(lv.cells[k] ?? new Set()).filter((g) => g.length >= 3);
  // The legs are told apart at the lowest level that shows them all: one slab up as a rule;
  // higher when spread toes or claws touch on the ground (a dragon's fore feet), never past
  // SEED_TOP slabs.
  const seedLevel =
    Array.from({ length: SEED_TOP }, (_, i) => i + 1).find(
      (k) => islandsAt(k).length >= feet.length,
    ) ?? 1;
  const islands = islandsAt(seedLevel);
  const kept = islands.slice(0, 8);
  if (kept.length < feet.length)
    fail(
      `${kept.length} separate leg section(s) at z = ${z(seedLevel).toFixed(3)} m, the plan has ${feet.length} legs (legs fused together or missing)`,
      REROLL,
    );
  const centres = kept.map((g) => sectionOf(g, lv.cell));
  const chosen = pair(feet, centres);
  feet.forEach((f, i) => {
    feet.forEach((g, j) => {
      const [a, b] = [centres[chosen[i] ?? 0], centres[chosen[j] ?? 0]];
      if (j <= i || !a || !b) return;
      const side = Math.abs(f[0] - g[0]) < Math.abs(f[1] - g[1]) ? 1 : 0;
      if ((f[side] - g[side]) * (a[side] - b[side]) <= 0)
        fail(
          `legs ${i} and ${j} swap ${side ? 'left and right' : 'front and back'} in the model (crossed legs, or the model faces the other way)`,
          REROLL,
        );
    });
  });
  // Up each leg: from the centre below, walk to the medial axis of the section at this height
  // (model-sections.ts `medial`). A tail or a partner leg touching the leg is another hill of the
  // distance field, which a walk bounded by the leg's own radius does not climb.
  const lines: [number, number, number, number][][] = chosen.map((k) => {
    const c = centres[k] ?? [0, 0, 0];
    const m = medial(bvh, [c[0], c[1], z(seedLevel)], [0, 0, 1], c[2]);
    return [[z(seedLevel), m.at[0], m.at[1], m.inside ? m.r : c[2]]];
  });
  const top: number[] = feet.map(() => 0);
  for (let k = seedLevel + 1; top.some((t) => t === 0); k++) {
    lines.forEach((line, i) => {
      const last = line[line.length - 1];
      if (top[i] || !last) return;
      // In the level's own plane: the trace records z(k), so an entry at another height would
      // put another section's centre at this one.
      const reach = Math.max(last[3], lv.cell) * 1.5;
      const m = medial(bvh, [last[1], last[2], z(k)], [0, 0, 1], reach, true);
      if (!m.inside || (k + 1) * lv.dz > (ceil[i] ?? Infinity)) top[i] = k * lv.dz;
      else line.push([z(k), m.at[0], m.at[1], m.r]);
    });
    // Every meeting at this level is read from the lines as they stand, before any is cut back:
    // both of two legs that meet stop here, not only the first one visited.
    const meets = lines.map((line, i) => {
      const a = line[line.length - 1];
      if (top[i] || !a || a[0] !== z(k)) return false;
      return lines.some((other, j) => {
        const o = other[other.length - 1];
        return (
          j !== i &&
          !!o &&
          o[0] === a[0] &&
          dmath.hypot(a[1] - o[1], a[2] - o[2]) < (a[3] + o[3]) * 0.6
        );
      });
    });
    lines.forEach((line, i) => {
      if (!meets[i]) return;
      if (k * lv.dz < (free[i] ?? 0))
        fail(
          `leg ${i} runs into another leg at z = ${(k * lv.dz).toFixed(3)} m, below the ${(free[i] ?? 0).toFixed(3)} m it must stay free to (legs fused)`,
          REROLL,
        );
      top[i] = k * lv.dz;
      line.pop();
    });
  }
  return lines.map((line, i) => {
    const sole = near(lv.cells[0] ?? new Set(), new Set(kept[chosen[i] ?? 0] ?? []), 2);
    const [sx, sy] = sole.size ? sectionOf(sole, lv.cell) : [line[0]?.[1] ?? 0, line[0]?.[2] ?? 0];
    const ankle = line[Math.min(2, line.length - 1)] ?? [0, sx, sy, 0];
    const d: [number, number] = [sx - ankle[1], sy - ankle[2]];
    const l = dmath.hypot(d[0], d[1]);
    return {
      line,
      paw: centres[chosen[i] ?? 0]?.[2] ?? 0,
      top: top[i] || lv.cells.length * lv.dz,
      // Toes point forward of the ankle; a sole that reads round or backwards keeps +X.
      toe: l > lv.cell && d[0] > 0 ? [d[0] / l, d[1] / l] : [1, 0],
    };
  });
}

/** The centre line's XY at height z (clamped to its ends). */
export function legAt(t: LegTrace, z: number): [number, number] {
  const line = t.line;
  const first = line[0] ?? [0, 0, 0, 0];
  if (z <= first[0]) return [first[1], first[2]];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1] ?? first, line[i] ?? first];
    if (z > b[0]) continue;
    const u = (z - a[0]) / Math.max(b[0] - a[0], 1e-9);
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }
  const last = line[line.length - 1] ?? first;
  return [last[1], last[2]];
}
