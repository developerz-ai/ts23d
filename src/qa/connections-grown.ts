// `grown` connections: a horn, spine, claw or tooth grows OUT of its parent instead of being set
// on its surface. Per appendage piece, along its long axis from the parent:
//   T3D_CONNECT_GLUED  — the root ring is not buried: around the axis, sectors whose deepest point
//                        is not ≥ δ inside the parent show a seam ring (reported as visible %)
//   T3D_CONNECT_CREASE — where it leaves the parent, the two surfaces meet at a hard angle (no boss
//                        or fillet on the parent rising into the root); horns, spines, ears, wings…
//                        (teeth, tusks, fangs and claws emerge from gum or skin: exempt)
//   T3D_CONNECT_POKE   — it comes out through the far side of its parent, or runs into another part
//   T3D_CONNECT_BURIED — (warning) most of it is hidden inside the parent: wasted triangles

import type { Vec3 } from '../core/index.ts';
import { APPENDAGE, type ConnectIssue, cm, fmt } from './connections-declare.ts';
import { basis, dot, norm, partnerOf, principalAxis, sub } from './connections-partner.ts';
import type { Shell } from './connections-shells.ts';
import { boxGap, epsOf, patch, probeOf, samplesIn, stepOf } from './contact.ts';
import { CONTACT_EPS } from './types.ts';

const SECTORS = 16;
/** Share of root sectors allowed to show a seam. */
const GLUED_SHARE = 0.1;
/** Median junction angle (degrees) above which the root reads as a crease. */
const CREASE_DEG = 55;
/** Buried share of the length above which the part is mostly hidden. */
const BURIED_SHARE = 0.6;
/** Emerge from gum or skin with a natural crease. */
const NO_FILLET = /(^|_)(tooth|teeth|tusks?|fangs?|claws?)(?=_|\d|$)/;

/** The appendage word of a name (`wing_l_membrane` → `wing`), or null. */
const word = (name: string): string | null => APPENDAGE.exec(name)?.[2]?.replace(/s$/, '') ?? null;

export function grownIssues(s: Shell, shells: readonly Shell[], to: string | null): ConnectIssue[] {
  const host = partnerOf(s, shells, to);
  if (!host?.shell.solid) return [];
  // A wing membrane on its wing arm, a horn tip on its horn: parts of one appendage join
  // each other (welded); only the appendage's root grows from the body. Unless declared.
  const w = word(s.part);
  if (!to && w !== null && word(host.shell.part) === w) return [];
  const parent = host.shell;
  const q = probeOf(parent);
  // Fine samples: the root ring is a narrow band on long lathe/sweep triangles.
  const S = samplesIn(s, null, 0, Math.max(0.001, stepOf(s) / 3), 6000, 24);
  const size = Math.hypot(...([0, 1, 2] as const).map((k) => s.bounds.max[k] - s.bounds.min[k]));
  const R = Math.max(0.05, size);
  const eps = epsOf(s);
  const depth = new Float64Array(S.count);
  const at = (i: number): Vec3 => [S.p[i * 3] ?? 0, S.p[i * 3 + 1] ?? 0, S.p[i * 3 + 2] ?? 0];
  let cin: Vec3 = [0, 0, 0];
  let cout: Vec3 = [0, 0, 0];
  let win = 0;
  let wout = 0;
  for (let i = 0; i < S.count; i++) {
    const p = at(i);
    const d = q.depth(p, R);
    depth[i] = d;
    const w = S.w[i] ?? 0;
    if (d > -eps) {
      cin = [cin[0] + p[0] * w, cin[1] + p[1] * w, cin[2] + p[2] * w];
      win += w;
    } else {
      cout = [cout[0] + p[0] * w, cout[1] + p[1] * w, cout[2] + p[2] * w];
      wout += w;
    }
  }
  const issues: ConnectIssue[] = [];
  const name = `piece ${s.index} of '${s.part}'`;
  if (win === 0) return [];
  cin = [cin[0] / win, cin[1] / win, cin[2] / win];
  if (wout === 0) {
    issues.push(buried(s, parent, name, 1, cin, size));
    return issues;
  }
  cout = [cout[0] / wout, cout[1] / wout, cout[2] / wout];
  let { axis } = principalAxis(S);
  if (dot(axis, sub(cout, cin)) < 0) axis = [-axis[0], -axis[1], -axis[2]];
  if (dot(norm(sub(cout, cin)), axis) < 0.3) axis = norm(sub(cout, cin));
  const [u, v] = basis(axis);
  // Axial extent of the buried part and of the whole piece.
  let tInMin = Infinity;
  let tInMax = -Infinity;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < S.count; i++) {
    const t = dot(sub(at(i), cin), axis);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
    if ((depth[i] ?? 0) > eps) {
      tInMin = Math.min(tInMin, t);
      tInMax = Math.max(tInMax, t);
    }
  }
  // Root radius: median distance from the axis of the samples at the parent's surface.
  const band = Math.max(0.003, eps);
  const radial: number[] = [];
  for (let i = 0; i < S.count; i++)
    if (Math.abs(depth[i] ?? 0) <= band) {
      const d = sub(at(i), cin);
      radial.push(Math.hypot(dot(d, u), dot(d, v)));
    }
  radial.sort((a, b) => a - b);
  const rho = radial[radial.length >> 1] ?? size / 4;
  const delta = Math.min(0.02, Math.max(0.002, 0.1 * rho));
  // GLUED: per sector around the axis, the deepest point must be δ inside the parent.
  const deepest = new Float64Array(SECTORS).fill(-Infinity);
  for (let i = 0; i < S.count; i++) {
    const d = sub(at(i), cin);
    const x = dot(d, u);
    const y = dot(d, v);
    if (Math.hypot(x, y) < 0.3 * rho) continue;
    const k = Math.min(
      SECTORS - 1,
      Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * SECTORS),
    );
    deepest[k] = Math.max(deepest[k] ?? -Infinity, depth[i] ?? 0);
  }
  const used = [...deepest].filter((x) => x > -Infinity);
  const open = used.filter((x) => x < delta).length;
  const share = used.length ? open / used.length : 0;
  if (share > GLUED_SHARE)
    issues.push({
      code: 'T3D_CONNECT_GLUED',
      severity: 'error',
      part: s.part,
      at: cin,
      radius: rho * 1.6 + 0.01,
      message: `${name} sits on '${parent.part}' instead of growing from it: ${(share * 100).toFixed(0)}% of its root ring shows (needs ≥ ${cm(delta)} buried all round, root radius ${cm(rho)})`,
      fix: `sink its root ≥ ${cm(delta)} into '${parent.part}' along ${fmt(axis)} (push it in, or extend the root inward) so no seam ring is left`,
    });
  // POKE: exposed on both sides of the buried band — it went through the parent.
  let far = 0;
  for (let i = 0; i < S.count; i++)
    if ((depth[i] ?? 0) < -eps && dot(sub(at(i), cin), axis) < tInMin - delta) far += S.w[i] ?? 0;
  if (Number.isFinite(tInMin) && far > 0.02 * (win + wout))
    issues.push({
      code: 'T3D_CONNECT_POKE',
      severity: 'error',
      part: s.part,
      at: [cin[0] + axis[0] * tInMin, cin[1] + axis[1] * tInMin, cin[2] + axis[2] * tInMin],
      radius: rho + 0.02,
      message: `${name} pokes out through the far side of '${parent.part}' (${(far * 1e4).toFixed(1)} cm² of it shows behind the root)`,
      fix: `shorten its root or move it out along ${fmt(axis)} until it ends inside '${parent.part}'`,
    });
  issues.push(...pokesInto(s, parent, shells, name, eps));
  const hidden = Number.isFinite(tInMax) ? (tInMax - tMin) / Math.max(1e-6, tMax - tMin) : 0;
  if (hidden > BURIED_SHARE) issues.push(buried(s, parent, name, hidden, cin, size));
  if (!NO_FILLET.test(s.part) && share <= GLUED_SHARE) {
    const c = crease(S, depth, at, q, band, cin, u, v, rho);
    if (c !== null && c > CREASE_DEG)
      issues.push({
        code: 'T3D_CONNECT_CREASE',
        severity: 'error',
        part: s.part,
        at: cin,
        radius: rho * 1.6 + 0.01,
        message: `${name} meets '${parent.part}' at a hard ${c.toFixed(0)}° crease — no boss or fillet blends the root (limit ${CREASE_DEG}°)`,
        fix: `grow a boss on '${parent.part}' around the root, blend radius ≥ ${cm(Math.max(0.005, rho * 0.5))} (sculpt blend / a flared base), or merge the root into the parent's sculpt`,
      });
  }
  return issues;
}

/** Median angle between the piece's and the parent's surface normals just outside the root. */
function crease(
  S: ReturnType<typeof samplesIn>,
  depth: Float64Array,
  at: (i: number) => Vec3,
  q: ReturnType<typeof probeOf>,
  band: number,
  cin: Vec3,
  u: Vec3,
  v: Vec3,
  rho: number,
): number | null {
  const angles: number[] = [];
  for (let i = 0; i < S.count; i++) {
    const d = depth[i] ?? 0;
    if (d > -0.0005 || d < -band * 2) continue;
    const r = sub(at(i), cin);
    if (Math.hypot(dot(r, u), dot(r, v)) < 0.5 * rho) continue;
    const np = q.normalAt(at(i), Math.max(0.0003, -d / 2), band * 4);
    if (!np) continue;
    const ns: Vec3 = [S.n[i * 3] ?? 0, S.n[i * 3 + 1] ?? 0, S.n[i * 3 + 2] ?? 0];
    angles.push((Math.acos(Math.max(-1, Math.min(1, dot(ns, np)))) * 180) / Math.PI);
  }
  if (angles.length < 6) return null;
  angles.sort((a, b) => a - b);
  return angles[angles.length >> 1] ?? null;
}

function pokesInto(
  s: Shell,
  parent: Shell,
  shells: readonly Shell[],
  name: string,
  eps: number,
): ConnectIssue[] {
  const out: ConnectIssue[] = [];
  for (const o of shells) {
    if (o === parent || o.part === s.part || o.part === parent.part || !o.solid) continue;
    if (boxGap(s, o) > CONTACT_EPS) continue;
    const p = patch(s, o, eps, stepOf(s));
    if (p.buried > 0.05 * s.area && p.at)
      out.push({
        code: 'T3D_CONNECT_POKE',
        severity: 'error',
        part: s.part,
        at: p.at,
        radius: Math.sqrt(p.buried) + 0.01,
        message: `${name} runs into '${o.part}' (${((p.buried / s.area) * 100).toFixed(0)}% of its surface inside it), which it does not grow from`,
        fix: `shorten or re-aim it so it stays clear of '${o.part}', or declare connect: { to: '${o.part}' } if that is its root`,
      });
  }
  return out;
}

function buried(
  s: Shell,
  parent: Shell,
  name: string,
  share: number,
  at: Vec3,
  size: number,
): ConnectIssue {
  return {
    code: 'T3D_CONNECT_BURIED',
    severity: 'warning',
    part: s.part,
    at,
    radius: Math.min(size / 2, 0.3),
    message: `${name} is ${(share * 100).toFixed(0)}% buried in '${parent.part}' — hidden triangles`,
    fix: `pull it out along its axis or shorten the root to ~${cm(size * 0.15)} below the surface`,
  };
}
