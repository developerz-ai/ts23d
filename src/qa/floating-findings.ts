// floating-parts findings: the text and the order. Parts that float together form a chain; its
// root (the member nearest a support) gets the "move it" fix and is listed first, and every
// other member is told to travel with the root (same distance and direction, or one `ctx.group`
// parent that carries them all) rather than close its own gap to the ground: moved alone, the
// root leaves the parts placed on it behind. One finding per floating part, so the count stays
// honest.

import { CONTACT_EPS, type Finding } from './types.ts';

const CODE = 'T3D_QA_FLOATING_PARTS';
/** Where `at` sits, as docs/idea/02-dsl.md's anchor column states it. */
export const ANCHOR =
  '`box`: `at.z` is the bottom (it spans `at.z` to `at.z + size[2]`); `cylinder`: centred on `at` along its axis (a standing post goes at `at: [x, y, h / 2]`); `lathe`: profile heights are measured from `at`';

const cm = (m: number): string => `${(m * 100).toFixed(1)} cm`;

export interface FloatingInput {
  /** Floating (not held, not sunk) parts, in part order. */
  readonly floating: readonly string[];
  /** Wholly-below-ground parts and how deep their base is. */
  readonly sunk: ReadonlyArray<readonly [string, number]>;
  readonly water: boolean;
  /** `a` and `b` touch (symmetric). */
  readonly touch: (a: string, b: string) => boolean;
  /** The closest support of a floating part: a held part, or the ground (`nearest` undefined). */
  readonly closest: (part: string) => { gap: number; nearest?: string };
}

function sunkFinding(part: string, depth: number): Finding {
  return {
    gate: 'floating-parts',
    code: CODE,
    part,
    gap: depth,
    message: `'${part}' is wholly below ground: its base is ${depth.toFixed(2)} m under z = 0`,
    fix: `raise it ${depth.toFixed(2)} m onto the ground or what holds it, or drop it (nobody sees buried geometry); ${ANCHOR}`,
  };
}

/** Every floating part reachable from `start` through touching floating parts. */
function component(
  start: string,
  pool: readonly string[],
  touch: FloatingInput['touch'],
): string[] {
  const out = [start];
  for (let i = 0; i < out.length; i++) {
    const at = out[i] ?? '';
    for (const n of pool) if (!out.includes(n) && touch(at, n)) out.push(n);
  }
  return out;
}

/** Breadth-first from `root`: each member with the floating part it hangs from. */
function chain(
  root: string,
  members: readonly string[],
  touch: FloatingInput['touch'],
): Array<readonly [string, string | undefined]> {
  const out: Array<readonly [string, string | undefined]> = [[root, undefined]];
  for (let i = 0; i < out.length; i++) {
    const at = out[i]?.[0] ?? '';
    for (const n of members) if (!out.some(([m]) => m === n) && touch(at, n)) out.push([n, at]);
  }
  return out;
}

export function floatingFindings(input: FloatingInput): Finding[] {
  const out = input.sunk.map(([n, d]) => sunkFinding(n, d));
  const held = input.water ? 'the main body' : 'anything attached to the ground';
  const done = new Set<string>();
  for (const start of input.floating) {
    if (done.has(start)) continue;
    const members = component(start, input.floating, input.touch);
    for (const m of members) done.add(m);
    const near = new Map(members.map((m) => [m, input.closest(m)]));
    const root = members.reduce((a, b) =>
      (near.get(b)?.gap ?? 0) < (near.get(a)?.gap ?? 0) ? b : a,
    );
    for (const [n, via] of chain(root, members, input.touch)) {
      if (via === undefined) {
        const c = near.get(n) ?? { gap: 0 };
        const onto = c.nearest ? `'${c.nearest}'` : 'the ground';
        const hung = members.length - 1;
        const rest = hung ? `; ${hung} part(s) hang from it` : '';
        const together = hung
          ? `; move the ${hung} part(s) that hang from it by the same distance and direction, unless they are placed relative to it (a shared \`ctx.group\` parent carries them: move that)`
          : '';
        out.push({
          gate: 'floating-parts',
          code: CODE,
          part: n,
          gap: c.gap,
          ...(c.nearest ? { nearest: c.nearest } : {}),
          message: `'${n}' has no surface within ${cm(CONTACT_EPS)} of ${held}; nearest support ${onto} is ${cm(c.gap)} away${rest}`,
          fix: `move it ${cm(c.gap)} onto ${onto} (check \`at\`, parent and the LOD-gated detail around it)${together} — bounding boxes touching is not enough; ${ANCHOR}`,
        });
        continue;
      }
      out.push({
        gate: 'floating-parts',
        code: CODE,
        part: n,
        message: `'${n}' touches '${via}', which is itself floating (root of the chain: '${root}')`,
        fix: `fix '${root}' first (its finding is listed above): '${n}' is held through it, so move '${n}' by the same distance and direction as '${root}' — nothing to do when a \`ctx.group\` parent that was moved already carries both; closing '${n}''s own gap to ${held} is the wrong distance`,
      });
    }
  }
  return out;
}
