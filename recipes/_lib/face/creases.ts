// Intended creases of a face bust, declared from the same warped landmarks and hair lines that
// shape it (QA `connections` excuses only seams on these folds): lid margins, nose wings and the
// nasolabial folds, the lip line, each ear's root ring and its folds, every hair / beard lock's
// groove, the moustache and the hairline (creases-hair.ts). Regions are ≤ 3 cm. The warp's seeded asymmetry moves
// landmarks ≤ 3 mm, well inside each region, so a fixed seed here is exact enough.

import { createRng, type IntendedCrease, type Vec3 } from '@developerz.ai/ts23d';
import { creaseCurve } from '../bust/creases.ts';
import { faceBase } from './base.ts';
import type { FaceBust } from './bust.ts';
import { PLINTH_TOP } from './bust.ts';
import { regionsOf } from './crease-regions.ts';
import { hairCreases } from './creases-hair.ts';
import { earMask } from './ears.ts';
import { CUT_Z, faceHead } from './head.ts';
import { LEFT, MIDLINE, mirrorY } from './landmarks.ts';

export function faceCreases(b: FaceBust): IntendedCrease[] {
  const head = faceHead(b.character, createRng(1));
  const dz = PLINTH_TOP - CUT_Z;
  const up = (p: Vec3): Vec3 => [p[0], p[1], p[2] + dz];
  const L = (k: keyof typeof LEFT): Vec3 => up(head.map(LEFT[k]));
  const R = (k: keyof typeof LEFT): Vec3 => up(head.map(mirrorY(LEFT[k])));
  const M = (k: keyof typeof MIDLINE): Vec3 => up(head.map(MIDLINE[k]));
  const s = head.scale;
  const out: IntendedCrease[] = [];
  const fold = (name: string, part: string, pts: Vec3[], r: number, why: string): void => {
    out.push(...creaseCurve(name, part, pts, r * s, why));
  };
  for (const [side, P] of [
    ['l', L],
    ['r', R],
  ] as const) {
    fold(
      `lid_upper_${side}`,
      'skin',
      [P('endocanthion'), P('upperLid'), P('exocanthion')],
      0.012,
      'upper lid margin over the eyeball',
    );
    fold(
      `lid_lower_${side}`,
      'skin',
      [P('endocanthion'), P('lowerLid'), P('exocanthion')],
      0.012,
      'lower lid margin',
    );
    fold(
      `lid_fold_${side}`,
      'skin',
      [P('endocanthion'), P('brow'), P('browOuter')],
      0.014,
      'upper-lid fold under the brow',
    );
    fold(
      `nose_wing_${side}`,
      'skin',
      [P('alare'), M('subnasale')],
      0.012,
      'alar groove and nostril',
    );
    fold(`nasolabial_${side}`, 'skin', [P('alare'), P('cheilion')], 0.014, 'nasolabial fold');
    fold(
      `ear_root_${side}`,
      'skin',
      [P('tragion'), P('earTop'), P('earOut'), P('earBack'), P('earLobe'), P('tragion')],
      0.03,
      'the auricle rising from the side of the head',
    );
    fold(
      `ear_${side}`,
      'skin',
      [P('tragion'), P('earOut')],
      0.03,
      'helix, antihelix and concha folds',
    );
  }
  fold(
    'lip_line',
    'skin',
    [L('cheilion'), L('lipUpper'), M('stomionSup'), R('lipUpper'), R('cheilion')],
    0.012,
    'the lip line where the lips meet',
  );
  fold(
    'lip_lower',
    'skin',
    [L('cheilion'), M('labraleInf'), R('cheilion')],
    0.012,
    'under the lower lip',
  );
  // Neck folds: the nuchal furrow, the submental fold under the jaw, the neck's sides.
  fold(
    'nuchal_furrow',
    'skin',
    [M('nape'), [M('nape')[0] - 0.01 * s, 0, M('nape')[2] - 0.06 * s]],
    0.02,
    'nuchal furrow down the nape between the trapezius',
  );
  fold('submental', 'skin', [M('menton'), M('throat')], 0.02, 'fold where the jaw meets the neck');
  for (const [side, P] of [
    ['l', L],
    ['r', R],
  ] as const)
    fold(
      `neck_side_${side}`,
      'skin',
      [P('mastoid'), P('neck'), P('trapezius')],
      0.025,
      'sternocleidomastoid and trapezius meeting below the ear',
    );
  // Areas of small folds, from the warped base's own vertices.
  const { mesh: base } = faceBase();
  const P = head.mesh.p;
  const V = P.length / 3;
  const at = (v: number): Vec3 => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
  const bp = (v: number, k: number): number => base.p[v * 3 + k] ?? 0;
  const ear = earMask(base);
  const pick = (f: (v: number) => boolean): Vec3[] => {
    const o: Vec3[] = [];
    for (let v = 0; v < V; v++) if (f(v)) o.push(up(at(v)));
    return o;
  };
  out.push(
    ...regionsOf(
      'auricle',
      'skin',
      pick((v) => (ear[v] ?? 0) > 0.2),
      0.025 * s,
      'helix, antihelix, concha and the ear root',
    ),
    ...regionsOf(
      'mouth_cavity',
      'skin',
      pick(
        (v) =>
          bp(v, 0) < 0.148 &&
          bp(v, 0) > 0.03 &&
          Math.abs(bp(v, 1)) < 0.03 &&
          bp(v, 2) > 0.625 &&
          bp(v, 2) < 0.68,
      ),
      0.025 * s,
      'inside of the mouth behind the lips (never seen closed)',
    ),
    ...regionsOf(
      'armpit',
      'skin',
      pick((v) => Math.abs(bp(v, 1)) > 0.13 && bp(v, 2) < CUT_Z + 0.07),
      0.025 * s,
      'armpit fold where the arm is sawn off',
    ),
  );
  out.push(...hairCreases(b, { head, up, L, R, M, s, fold, pick, at }));
  return out;
}
