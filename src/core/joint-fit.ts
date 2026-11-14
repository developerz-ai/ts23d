// Joint fit: does a declared `ctx.joint` fit? Each joint is cut by its plane (through `at`,
// perpendicular to `axis`) a little way into each side, and the two sections are compared:
//   T3D_JOINT_MISMATCH  sizes differ beyond tolerance (a hand twice the wrist, a too-thin handle)
//   T3D_JOINT_GAP       a side never reaches the plane, or the parts stop short of each other
//   T3D_JOINT_OFFSET    the sections' centres miss each other by more than a quarter of the size
//   T3D_JOINT_BURIED    one part runs through the other far past the joint (flush joints)
// Sections are LOCAL: only the cut within LOCAL_REACH × the smaller part's in-plane size of `at`
// counts, so a 3 cm eye is compared with its orbit, not with the whole 20 cm head. A socket's `to`
// side is measured at its OPENING round the peg's centre (the clear span along both in-plane
// axes): a peg in a holed plate is compared with the hole, not the plate's outline (a half-shell
// socket that never closes round the peg keeps its local outline).
// Every issue names both numbers, the % off and the concrete fix. QA `joints` reports them; the
// blueprint colours joints by them.

import type { CompiledAsset } from './definition.ts';
import { type Mesh, merge } from './mesh.ts';
import type { Joint } from './part.ts';
import { innerRadius, opening, picks, planeAxes, type Section, section, wrap } from './section.ts';
import { TOLERANCE } from './validate-asset.ts';
import type { Vec3 } from './vec.ts';
import { worldMeshes } from './world.ts';

/** One problem with a joint, shaped like a QA finding (gate 'joints', part = the joint name). */
export interface JointIssue {
  readonly gate: 'joints';
  readonly part: string;
  /** Starts with the code: T3D_JOINT_MISMATCH · _GAP · _OFFSET · _BURIED. */
  readonly message: string;
  readonly fix: string;
}

export interface JointFit {
  readonly joint: Joint;
  /** Sections a little inside `from` and inside `to` (grip: both at the plane). */
  readonly from: Section | null;
  readonly to: Section | null;
  readonly findings: readonly JointIssue[];
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cm = (m: number): string => `${(m * 100).toFixed(1)} cm`;
const pct = (r: number): string => `${Math.round(Math.abs(r - 1) * 100)}%`;
const off = (at: Vec3, axis: Vec3, d: number): Vec3 => [
  at[0] + axis[0] * d,
  at[1] + axis[1] * d,
  at[2] + axis[2] * d,
];

/** Section window radius, × the smaller part's in-plane size (its widest extent across the axis). */
export const LOCAL_REACH = 2;

/** A mesh's widest extent across the joint axis (in the joint plane's u / v directions). */
function across(m: Mesh, axis: Vec3): number {
  const { u, v } = planeAxes(axis);
  let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    const p: Vec3 = [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
    const a = dot(p, u);
    const b = dot(p, v);
    [u0, u1, v0, v1] = [Math.min(u0, a), Math.max(u1, a), Math.min(v0, b), Math.max(v1, b)];
  }
  return Math.max(u1 - u0, v1 - v0);
}

/** World point `p` in a section's in-plane (u, v), relative to its plane point `o`. */
const inPlane = (p: Vec3, o: Vec3, s: Section): [number, number] => {
  const w: Vec3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  return [dot(w, s.u), dot(w, s.v)];
};

/** Along-axis span of a mesh's vertices relative to the joint point. */
function span(m: Mesh, j: Joint): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    const t = dot(
      [
        (m.positions[i] ?? 0) - j.at[0],
        (m.positions[i + 1] ?? 0) - j.at[1],
        (m.positions[i + 2] ?? 0) - j.at[2],
      ],
      j.axis,
    );
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return [lo, hi];
}

/** Measure and judge one joint on a compiled asset. */
export function jointFit(asset: CompiledAsset, j: Joint): JointFit {
  const world = worldMeshes(asset.parts);
  const pick = (sel: string): Mesh | null => {
    const ms = [...world].filter(([n]) => picks(sel, n)).map(([, m]) => m);
    return ms.length ? merge(ms) : null;
  };
  const tol = j.tolerance ?? TOLERANCE.joint;
  const kind = j.kind ?? 'flush';
  const finding = (code: string, message: string, fix: string): JointIssue => ({
    gate: 'joints',
    part: j.name,
    message: `${code} joint '${j.name}' (${j.from} → ${j.to}, ${kind}): ${message}`,
    fix,
  });
  const ma = pick(j.from);
  const mb = pick(j.to);
  if (!ma || !mb) {
    const missing = ma ? j.to : j.from;
    // Detail parts may drop out at far LODs; only LOD0 must have both sides.
    const findings =
      asset.lod === 0
        ? [
            finding(
              'T3D_JOINT_GAP',
              `no part matches '${missing}'`,
              'name the parts the joint connects, or fix the selector',
            ),
          ]
        : [];
    return { joint: j, from: null, to: null, findings };
  }
  const [aLo, aHi] = span(ma, j);
  const [bLo, bHi] = span(mb, j);
  // Probe depth: 4% of the shorter side's length along the axis, 3 mm … 3 cm.
  const probe = Math.max(0.003, Math.min(0.03, 0.04 * Math.min(aHi - aLo, bHi - bLo)));
  if (kind === 'grip') return gripFit(j, ma, mb, finding, tol);
  const reach = LOCAL_REACH * Math.min(across(ma, j.axis), across(mb, j.axis));
  const from = section(ma, { at: off(j.at, j.axis, -probe), normal: j.axis }, reach);
  const toPlane = off(j.at, j.axis, probe);
  const cut = section(mb, { at: toPlane, normal: j.axis }, reach);
  const findings: JointIssue[] = [];
  // A socket is measured at its opening round the peg's centre, not by its outline; a half-shell
  // socket that does not close round the peg (a cup, a lid) keeps its local outline.
  const to =
    kind === 'socket' && from && cut
      ? (opening(cut, ...inPlane(from.centroid, toPlane, cut)) ?? cut)
      : cut;
  const size = Math.max(from?.width ?? 0, from?.depth ?? 0, to?.width ?? 0, to?.depth ?? 0, 0.01);
  const apart = bLo - aHi;
  if (!from || !to || apart > Math.max(0.01, 0.05 * size)) {
    const which = !from ? j.from : !to ? j.to : null;
    findings.push(
      finding(
        'T3D_JOINT_GAP',
        which
          ? `'${which}' does not reach the joint plane at [${j.at.map((v) => v.toFixed(3)).join(', ')}]`
          : `${cm(apart)} gap along the axis between ${j.from} and ${j.to}`,
        which
          ? `move '${which}' (or the joint's \`at\`) so it crosses the plane — the joint is where the two meet`
          : `extend ${j.from} or move ${j.to} ${cm(apart)} back along the axis so they meet`,
      ),
    );
    return { joint: j, from, to, findings };
  }
  for (const [dim, a, b] of [
    ['width', from.width, to.width],
    ['depth', from.depth, to.depth],
  ] as const) {
    const bad =
      kind === 'socket'
        ? a > b * 1.02 || a < b * (1 - tol)
        : Math.max(a, b) / Math.max(Math.min(a, b), 1e-6) - 1 > tol;
    if (!bad) continue;
    const r = b / Math.max(a, 1e-6);
    findings.push(
      finding(
        'T3D_JOINT_MISMATCH',
        `${dim} ${cm(a)} on ${j.from} vs ${cm(b)} on ${j.to} — ${pct(r)} ${r > 1 ? 'larger' : 'smaller'} (±${Math.round(tol * 100)}%)`,
        kind === 'socket' && a > b
          ? `the peg is wider than its socket: scale ${j.from} ×${(b / a).toFixed(2)} or open ${j.to} to ${cm(a)}`
          : `scale ${j.to} ×${(a / b).toFixed(2)} at the joint, or ${r > 1 ? 'flare' : 'taper'} ${j.from} to ${cm(b)} (×${r.toFixed(2)})`,
      ),
    );
    break;
  }
  const dc = Math.hypot(
    dot(
      [
        to.centroid[0] - from.centroid[0],
        to.centroid[1] - from.centroid[1],
        to.centroid[2] - from.centroid[2],
      ],
      from.u,
    ),
    dot(
      [
        to.centroid[0] - from.centroid[0],
        to.centroid[1] - from.centroid[1],
        to.centroid[2] - from.centroid[2],
      ],
      from.v,
    ),
  );
  const ref = Math.min(Math.max(from.width, from.depth), Math.max(to.width, to.depth));
  if (dc > 0.25 * ref)
    findings.push(
      finding(
        'T3D_JOINT_OFFSET',
        `centres ${cm(dc)} apart across the joint (${Math.round((dc / ref) * 100)}% of the ${cm(ref)} section)`,
        `slide ${j.to} by ${cm(dc)} in the joint plane so it sits centred on ${j.from}`,
      ),
    );
  const buried = aHi - Math.max(0, bLo);
  if (kind === 'flush' && aHi > 0 && buried > 1.5 * size && bHi > aHi)
    findings.push(
      finding(
        'T3D_JOINT_BURIED',
        `${j.from} runs ${cm(aHi)} past the joint into ${j.to} (section ${cm(size)})`,
        `shorten ${j.from} to end at the joint, or move the joint's \`at\` to where they actually meet`,
      ),
    );
  return { joint: j, from, to, findings };
}

function gripFit(
  j: Joint,
  hand: Mesh,
  handle: Mesh,
  finding: (code: string, message: string, fix: string) => JointIssue,
  tol: number,
): JointFit {
  const plane = { at: j.at, normal: j.axis };
  const from = section(hand, plane);
  const to = section(handle, plane);
  if (!from || !to) {
    const which = from ? j.to : j.from;
    return {
      joint: j,
      from,
      to,
      findings: [
        finding(
          'T3D_JOINT_GAP',
          `'${which}' does not cross the grip plane`,
          `put the grip point \`at\` inside both the fist and the handle, axis along the handle`,
        ),
      ],
    };
  }
  const rel = (p: Vec3): [number, number] => {
    const w: Vec3 = [p[0] - j.at[0], p[1] - j.at[1], p[2] - j.at[2]];
    return [dot(w, from.u), dot(w, from.v)];
  };
  const [cu, cv] = rel(to.centroid);
  const handleR = (to.width + to.depth) / 4;
  const fistR = innerRadius(from, cu, cv);
  const wrapped = wrap(from, cu, cv);
  const findings: JointIssue[] = [];
  if (wrapped < 0.5)
    findings.push(
      finding(
        'T3D_JOINT_GAP',
        `the hand wraps ${Math.round(wrapped * 100)}% of the handle (≥ 50% to hold it)`,
        `close the fingers round ${j.to}, or move the grip point to where the fist is`,
      ),
    );
  // A fist that clamps a little into the handle is fine; a handle rattling in the fist is not.
  const r = handleR / Math.max(fistR, 1e-6);
  if (r < 1 - tol || r > 1 + tol)
    findings.push(
      finding(
        'T3D_JOINT_MISMATCH',
        `handle Ø ${cm(handleR * 2)} vs fist opening Ø ${cm(fistR * 2)} — ${pct(r)} ${r > 1 ? 'too thick' : 'too thin'} (±${Math.round(tol * 100)}%)`,
        r > 1
          ? `thin the ${j.to} handle to Ø ${cm(fistR * 2)}, or scale the hand ×${r.toFixed(2)}`
          : `thicken the ${j.to} handle to Ø ${cm(fistR * 2)} (×${(1 / r).toFixed(2)}), or close the fist ×${r.toFixed(2)}`,
      ),
    );
  return { joint: j, from, to, findings };
}
