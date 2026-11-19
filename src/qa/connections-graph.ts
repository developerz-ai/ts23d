// Connectivity of the pieces (every shell of every part) to the ground or main body. Two pieces
// share a weak edge when their surfaces come within CONTACT_EPS; a strong edge when the contact
// patch is a real face (≥ STRONG_SHARE of the smaller piece's cross-section, thickness²).
//   T3D_CONNECT_ISLAND — a piece reaches nothing that holds it (merged meshes hide these)
//   T3D_CONNECT_POINT  — a piece hangs on by a point or an edge (unless declared rest/hinge), or
//                        hovers inside CONTACT_EPS without touching anything
// A cluster that only kisses its holders still counts as held when its contacts (those that
// really touch: gap ≤ the piece's eps) add up to a face, when it sits on a rim all round
// (connections-rim.ts), or when it bridges: two or more contacts spread across it (a slat across a vent, a rung
// between stiles) — one corner is a hinge, two ends are a span.

import type { ConnectAs, Vec3 } from '../core/index.ts';
import { edgeContact } from './connections-crossing.ts';
import { type ConnectIssue, cm } from './connections-declare.ts';
import {
  clusterIssue,
  NAMED_ISLANDS_DEFAULT,
  nearest,
  STRONG_SHARE,
  span,
} from './connections-island.ts';
import { rimContact } from './connections-rim.ts';
import type { Shell } from './connections-shells.ts';
import { boxGap, epsOf, holds, patch, stepOf, thickness } from './contact.ts';
import { CONTACT_EPS } from './types.ts';

export { STRONG_SHARE } from './connections-island.ts';

/** Islands whose nearest neighbour is measured for the message. */
const NAMED_ISLANDS = NAMED_ISLANDS_DEFAULT;
/** Kinds where a point or line contact is the design. */
const LOOSE: ReadonlySet<ConnectAs> = new Set(['rest', 'hinge', 'free']);

class Union {
  private readonly up: Int32Array;
  constructor(n: number) {
    this.up = new Int32Array(n).map((_, i) => i);
  }
  find(i: number): number {
    let r = i;
    while ((this.up[r] ?? r) !== r) r = this.up[r] ?? r;
    while ((this.up[i] ?? i) !== r) {
      const n = this.up[i] ?? i;
      this.up[i] = r;
      i = n;
    }
    return r;
  }
  join(a: number, b: number): void {
    const x = this.find(a);
    const y = this.find(b);
    if (x !== y) this.up[Math.max(x, y)] = Math.min(x, y);
  }
  same(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }
}

/** Candidate pairs whose boxes come within CONTACT_EPS: a sweep along X (deterministic order). */
function pairs(shells: readonly Shell[]): [number, number][] {
  const order = shells
    .map((_, i) => i)
    .sort((a, b) => {
      const d = (shells[a]?.bounds.min[0] ?? 0) - (shells[b]?.bounds.min[0] ?? 0);
      return d !== 0 ? d : a - b;
    });
  const out: [number, number][] = [];
  for (let x = 0; x < order.length; x++) {
    const i = order[x] ?? 0;
    const a = shells[i];
    if (!a) continue;
    for (let y = x + 1; y < order.length; y++) {
      const j = order[y] ?? 0;
      const b = shells[j];
      if (!b || b.bounds.min[0] > a.bounds.max[0] + CONTACT_EPS) break;
      if (boxGap(a, b) <= CONTACT_EPS) out.push(i < j ? [i, j] : [j, i]);
    }
  }
  return out;
}

/** A weak contact between two pieces: where, its tight patch area (0 when the pieces come
 *  within CONTACT_EPS but do not touch) and how far apart they are. */
interface Kiss {
  readonly i: number;
  readonly j: number;
  readonly area: number;
  readonly at: Vec3;
  readonly gap: number;
  readonly touches: boolean;
}

/** A cluster none of whose contacts touch: it hovers, which is not "hanging on by a point". */
function hovering(issue: ConnectIssue, k: Kiss, onto: string): ConnectIssue {
  return {
    ...issue,
    message: `${issue.message.split(' hang on by ')[0]} hover ${cm(k.gap)} off '${onto}': inside the ${cm(CONTACT_EPS)} floating-parts tolerance, but no surface touches`,
    fix: `move it ${cm(k.gap)} onto '${onto}' and seat it on a face (sink it a few mm in); a gap you can see under a part is never a joint`,
  };
}

/** Join clusters whose weak contacts to held pieces add up to a face or span the cluster. */
function bridge(
  live: readonly Shell[],
  strong: Union,
  kisses: readonly Kiss[],
  ROOT: number,
): void {
  for (let changed = true; changed; ) {
    changed = false;
    const byCluster = new Map<number, Kiss[]>();
    for (const k of kisses) {
      const [mine, other] = strong.same(k.j, ROOT) ? [k.i, k.j] : [k.j, k.i];
      if (!strong.same(other, ROOT) || strong.same(mine, ROOT)) continue;
      // A kiss that does not touch is a hover: it adds no area and is no end of a span.
      if (!k.touches) continue;
      const r = strong.find(mine);
      byCluster.set(r, [...(byCluster.get(r) ?? []), k]);
    }
    for (const [r, ks] of byCluster) {
      const group = live.filter((_, i) => strong.find(i) === r);
      const need = STRONG_SHARE * Math.min(...group.map(thickness)) ** 2;
      const { size } = span(group);
      let spread = 0;
      for (const a of ks)
        for (const b of ks)
          spread = Math.max(
            spread,
            Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1], a.at[2] - b.at[2]),
          );
      if (ks.reduce((m, k) => m + k.area, 0) >= need || spread >= size / 2) {
        strong.join(r, ROOT);
        changed = true;
      }
    }
  }
}

export interface Graph {
  readonly issues: ConnectIssue[];
  /** Pieces that reach the root through strong contacts. */
  readonly held: ReadonlySet<Shell>;
}

export function connectivity(
  shells: readonly Shell[],
  kindOf: (part: string) => ConnectAs,
  water = false,
): Graph {
  const live = shells.filter((s) => s.area > 1e-9 && kindOf(s.part) !== 'free');
  const n = live.length;
  const ROOT = n;
  const weak = new Union(n + 1);
  const strong = new Union(n + 1);
  let grounded = false;
  live.forEach((s, i) => {
    if (!water && s.bounds.min[2] <= CONTACT_EPS) {
      weak.join(i, ROOT);
      strong.join(i, ROOT);
      grounded = true;
    }
  });
  if (!grounded && n > 0) {
    const main = live.reduce((m, s, i) => (s.area > (live[m]?.area ?? 0) ? i : m), 0);
    weak.join(main, ROOT);
    strong.join(main, ROOT);
  }
  const kisses: Kiss[] = [];
  for (const [i, j] of pairs(live)) {
    if (strong.same(i, j)) continue;
    const a = live[i];
    const b = live[j];
    if (!a || !b) continue;
    const [small, big] = a.area <= b.area ? [a, b] : [b, a];
    const need = STRONG_SHARE * thickness(small) ** 2;
    const eps = epsOf(small);
    const one = patch(small, big, eps, stepOf(small), need);
    const loose = LOOSE.has(kindOf(a.part)) || LOOSE.has(kindOf(b.part));
    if (!one.touches) {
      // The patch samples saw nothing: a wall across a joist or a rail through a post still
      // meet, and a wall 1 cm over its joists still hovers.
      const there = edgeContact(big, small, eps, CONTACT_EPS);
      const back = there && there.gap <= eps ? null : edgeContact(small, big, eps, CONTACT_EPS);
      const near = back && (!there || back.gap < there.gap) ? back : there;
      if (!near) continue;
      weak.join(i, j);
      if (loose) strong.join(i, j);
      else kisses.push({ i, j, area: 0, at: near.at, gap: near.gap, touches: near.gap <= eps });
      continue;
    }
    weak.join(i, j);
    const two = loose || holds(one, eps, need) ? null : patch(big, small, eps, stepOf(small), need);
    // Seated all round on a rim (a roof on a tank, an open-backed box on a wall) holds like a face.
    if (!two || holds(two, eps, need) || (one.gap <= eps && rimContact(small, big, eps)))
      strong.join(i, j);
    else {
      // `tight` is measured from the closest approach, whatever it is: only a patch that
      // touches (gap ≤ eps) is contact area. A lid hovering 1 cm has a full face of `tight`.
      const real = Math.max(one.gap <= eps ? one.tight : 0, two.gap <= eps ? two.tight : 0);
      kisses.push({
        i,
        j,
        area: real,
        at: one.closest ?? small.centroid,
        gap: Math.min(one.gap, two.gap),
        touches: one.gap <= eps || two.gap <= eps,
      });
    }
  }
  bridge(live, strong, kisses, ROOT);
  const held = live.filter((_, i) => strong.same(i, ROOT));
  // One issue per strongly-joined cluster that is not held: the cluster hangs as a unit.
  const clusters = new Map<number, Shell[]>();
  live.forEach((s, i) => {
    if (strong.same(i, ROOT)) return;
    const r = strong.find(i);
    clusters.set(r, [...(clusters.get(r) ?? []), s]);
  });
  const issues: ConnectIssue[] = [];
  const partShells = new Map<string, number>();
  for (const s of live) partShells.set(s.part, (partShells.get(s.part) ?? 0) + 1);
  let named = 0;
  for (const [r, group] of clusters) {
    const island = !weak.same(r, ROOT);
    const parts = [...new Set(group.map((s) => s.part))];
    // A whole part adrift alone is the floating-parts gate's finding; here: hidden pieces.
    if (island && parts.length === 1 && group.length === partShells.get(parts[0] ?? '')) continue;
    // Nearest neighbour only for the first few islands: it is for the message, and costs.
    const near = island && ++named <= NAMED_ISLANDS ? nearest(group, held) : null;
    const issue = clusterIssue(group, parts, island, near);
    const mine = kisses.filter((k) => (strong.find(k.i) === r) !== (strong.find(k.j) === r));
    const closest = mine.reduce<Kiss | null>((m, k) => (m && m.gap <= k.gap ? m : k), null);
    const other = closest ? live[strong.find(closest.i) === r ? closest.j : closest.i] : undefined;
    issues.push(
      !island && closest && other && !mine.some((k) => k.touches)
        ? hovering(issue, closest, other.part)
        : issue,
    );
  }
  return { issues, held: new Set(held) };
}
