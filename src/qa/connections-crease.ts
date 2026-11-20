// A declared crease is a local exception: an eyelid, a mouth line, one fold. A sphere big enough to
// swallow the mesh it excuses is not an exception but the seam check switched off, so it is refused
// (T3D_CONNECT_INVALID) and excuses nothing. Blanket means, on one sculpt-dense shell: the sphere's
// diameter reaches the shell's bounding diagonal AND it holds at least half of the shell's surface.
// Measured on every committed recipe at the time (7,260 creases): radius ÷ part diagonal has p99 0.11
// and its largest honest value is 0.41 (a tiger's mouth on its jaw); the blankets sat at 0.75 and up.
// The model tier's whole-surface exemption (ADR 016) is the one declared exception.

import type { CompiledAsset, IntendedCrease, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { type ConnectIssue, cm, fmt } from './connections-declare.ts';
import type { Shell } from './connections-shells.ts';
import { glob } from './inspect.ts';

/** Sphere radius, as a share of the shell's bounding diagonal, at which it can hold all of it. */
export const BLANKET_RADIUS = 0.5;
/** Share of the shell's surface inside the sphere for it to count as covered. */
export const BLANKET_SHARE = 0.5;
/** The name the model-tier kinds give their whole-surface exemption. */
export const MODEL_SURFACE = 'model_surface';
/** Triangles sampled per shell for the covered share. */
const SAMPLES = 2000;

const diagonal = (s: Shell): number =>
  dmath.hypot(
    s.bounds.max[0] - s.bounds.min[0],
    s.bounds.max[1] - s.bounds.min[1],
    s.bounds.max[2] - s.bounds.min[2],
  );

/** Share of the shell's area (triangle soup, sampled) whose centres lie inside the sphere. */
function coveredShare(s: Shell, c: IntendedCrease): number {
  const P = s.mesh.positions;
  const tris = P.length / 9;
  const step = Math.max(1, Math.floor(tris / SAMPLES));
  let [inside, total] = [0, 0];
  for (let t = 0; t < tris; t += step) {
    const o = t * 9;
    const at = (k: number): Vec3 => [P[o + k] ?? 0, P[o + k + 1] ?? 0, P[o + k + 2] ?? 0];
    const [a, b, d] = [at(0), at(3), at(6)];
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const area = dmath.hypot(
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    );
    total += area;
    const m: Vec3 = [
      (a[0] + b[0] + d[0]) / 3 - c.at[0],
      (a[1] + b[1] + d[1]) / 3 - c.at[1],
      (a[2] + b[2] + d[2]) / 3 - c.at[2],
    ];
    if (dmath.hypot(m[0], m[1], m[2]) <= c.radius) inside += area;
  }
  return total > 0 ? inside / total : 0;
}

export interface BlanketCrease {
  readonly crease: IntendedCrease;
  readonly shell: Shell;
  readonly share: number;
}

/** Every crease that blankets a shell dense enough for the seam check to read. */
export function blanketCreases(
  creases: readonly IntendedCrease[],
  shells: readonly Shell[],
  minTriangles: number,
): BlanketCrease[] {
  const out: BlanketCrease[] = [];
  for (const crease of creases) {
    if (crease.name === MODEL_SURFACE) continue;
    const part = glob(crease.part);
    for (const shell of shells) {
      if (!part.test(shell.part) || shell.mesh.positions.length / 9 < minTriangles) continue;
      if (crease.radius < BLANKET_RADIUS * diagonal(shell)) continue;
      const share = coveredShare(shell, crease);
      if (share >= BLANKET_SHARE) {
        out.push({ crease, shell, share });
        break;
      }
    }
  }
  return out;
}

export function blanketIssues(
  asset: Pick<CompiledAsset, 'creases'>,
  shells: readonly Shell[],
  minTriangles: number,
): ConnectIssue[] {
  return blanketCreases(asset.creases ?? [], shells, minTriangles).map(
    ({ crease: c, shell, share }) => ({
      code: 'T3D_CONNECT_INVALID',
      severity: 'error',
      part: shell.part,
      at: c.at,
      radius: c.radius,
      message: `crease '${c.name}' at ${fmt(c.at)} (radius ${cm(c.radius)}) covers ${(share * 100).toFixed(0)}% of piece ${shell.index} of '${shell.part}', ${cm(diagonal(shell))} across: that switches the seam check off instead of excusing one fold`,
      fix: 'fix the seams it hides (blend, softer relief), and declare only the folds that are meant, each with a small region',
    }),
  );
}

/** The creases that may excuse a seam: a refused one excuses nothing. */
export function honestCreases(
  creases: readonly IntendedCrease[],
  shells: readonly Shell[],
  minTriangles: number,
): readonly IntendedCrease[] {
  const refused = new Set(blanketCreases(creases, shells, minTriangles).map((b) => b.crease));
  return refused.size === 0 ? creases : creases.filter((c) => !refused.has(c));
}
