import { describe, expect, it } from 'bun:test';
import { sculptField, type Vec3 } from '@developerz.ai/ts23d';
import { bustEdits } from '../_lib/bust/bust.ts';
import { measureHead, proportionFindings } from '../_lib/face/proportions.ts';
import { bodySurface, ORC_BUST } from './build.ts';
import { beardRegion } from './hair.ts';
import { ORC_PROPORTIONS, SK, SPEC } from './spec.ts';
import { lowerTeeth, TUSK_R, tuskExit, tuskPath } from './tusks.ts';

const skin = bodySurface(1).field;
/** The finished head (features, lips rolled round the tusks), as the build meshes it. */
const face = sculptField(bustEdits(ORC_BUST, 4, 1).edits, { color: SPEC.skin, mirror: 'y' }).field;

/** The face's front (largest x inside the skin) at (y, z). */
function frontX(y: number, z: number): number {
  for (let x = 0.3; x > 0; x -= 0.0005) if (face([x, y, z]) < 0) return x;
  return Number.NEGATIVE_INFINITY;
}

/** How far a point stands in front of the face (negative: inside it). */
const proud = (q: Vec3): number => q[0] - frontX(q[1], q[2]);

/** The tusk anatomy: a lower canine, read against the mouth's own landmarks (bust metres). */
function tuskFindings(path: readonly Vec3[]): string[] {
  const root = path[0] ?? [0, 0, 0];
  const tip = path[path.length - 1] ?? [0, 0, 0];
  let i = path.length - 1;
  while (i > 0 && proud(path[i - 1] ?? root) > 0) i--;
  const exit = path[i] ?? root;
  const out: string[] = [];
  if (!(root[2] < SK.stomion[2] && proud(root) < -0.01 && root[1] < SK.cheilion[1]))
    out.push('root not in the lower jaw behind the lower lip');
  if (!(exit[2] > (SK.labraleInf[2] + SK.stomion[2]) / 2 && exit[2] < SK.labraleSup[2]))
    out.push(`leaves the face at z ${exit[2].toFixed(3)}, not at the lower lip's top`);
  if (!(tip[2] > SK.alare[2] - 0.006)) out.push('tip below the nose wing');
  if (!(proud(tip) > 0.003 && proud(tip) < 0.03))
    out.push(`tip ${proud(tip).toFixed(3)} m off the face (in front, within 3 cm)`);
  const atLip = path.find((q) => q[2] >= SK.labraleSup[2]) ?? tip;
  if (!(proud(atLip) > 0.012)) out.push('not in front of the upper lip');
  return out;
}

describe('orc tusks (lower canines)', () => {
  it('a tusk hung from the upper jaw (rooted above the mouth, pointing down) is caught', () => {
    const fang = tuskPath(1, 24).map((q): Vec3 => [q[0], q[1], 2 * SK.stomion[2] - q[2]]);
    expect(tuskFindings(fang).length).toBeGreaterThan(0);
  });
  it('roots in the jaw, leaves at the lower lip top, rises in front of the upper lip to the nose wing', () => {
    expect(tuskFindings(tuskPath(1, 24))).toEqual([]);
  });
  it('a tusk pulled out of the jaw is caught (its root sits outside the skin)', () => {
    const root = tuskPath()[0] ?? [0, 0, 0];
    expect(skin([root[0] + 0.06, root[1], root[2]])).toBeGreaterThan(0);
    expect(skin(root)).toBeLessThan(-0.005);
  });
  it('the beard parts round the tusk bases (no beard where a tusk leaves the lip)', () => {
    const e = tuskExit();
    for (const side of [1, -1])
      expect(beardRegion([e[0], e[1] * side, e[2] - 0.012])).toBeGreaterThan(0);
  });
});

/** What is wrong with the lower teeth between the tusks (D526): each crown must stand above the
 *  mouth line, proud of the face (seen, not sunk in the lip), clear of the tusks. */
function teethFindings(crowns: readonly Vec3[]): string[] {
  const out: string[] = [];
  if (crowns.length < 3) out.push(`${crowns.length} lower teeth (want ≥ 3 between the tusks)`);
  const tuskY = Math.abs(tuskExit()[1]) - TUSK_R * 0.8;
  for (const c of crowns) {
    if (!(c[2] > SK.stomion[2] + 0.002))
      out.push(`crown at z ${c[2].toFixed(3)} under the lip line`);
    if (!(proud(c) > 0.002)) out.push(`crown ${proud(c).toFixed(3)} m: buried in the face`);
    if (!(Math.abs(c[1]) < tuskY)) out.push(`crown at y ${c[1].toFixed(3)} inside a tusk`);
  }
  return out;
}

describe('orc lower teeth (D526)', () => {
  it('a mouth with no teeth showing is caught', () => {
    expect(teethFindings([]).length).toBeGreaterThan(0);
  });
  it('teeth sunk behind the lips are caught', () => {
    const sunk = lowerTeeth().crowns.map((c): Vec3 => [c[0] - 0.02, c[1], c[2]]);
    expect(teethFindings(sunk).length).toBeGreaterThan(0);
  });
  it('a few uneven lower teeth stand between the tusks above the lower lip', () => {
    const { crowns } = lowerTeeth();
    expect(teethFindings(crowns)).toEqual([]);
    const tops = crowns.map((c) => c[2]);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(0.0015);
  });
});

describe('orc proportions', () => {
  it('a human eye line on the orc head is out of its declared band', () => {
    const m = measureHead(SK, skin);
    expect(proportionFindings({ ...m, eyeLine: 0.5 - 0.01 }, ORC_PROPORTIONS, 'orc')).toHaveLength(
      1,
    );
  });
  it('the built head lands in every declared band', () => {
    expect(proportionFindings(measureHead(SK, skin), ORC_PROPORTIONS, 'orc')).toEqual([]);
  });
});
