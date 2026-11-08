// The hair's intended creases (QA `connections`), from the same lines and regions that sculpt
// the hair: each lock's groove on the hair surface, the hairline and nape edges, ribbons, beard
// locks, the moustache, the beard rim, and the centroids QA judges long groove chains by.

import type { IntendedCrease, Vec3 } from '@developerz.ai/ts23d';
import type { FaceBust } from './bust.ts';
import { centroidRegion, regionsOf } from './crease-regions.ts';
import { beardlineOf, hairlineOf } from './hair.ts';
import { beardLines, fallLines, hairCentre, moustacheLines, scalpLines } from './hair-lines.ts';
import type { FaceHead } from './head.ts';
import { type LEFT, MIDLINE } from './landmarks.ts';

/** What the anatomy pass already computed, shared with the hair pass. */
export interface CreaseCtx {
  readonly head: FaceHead;
  readonly up: (p: Vec3) => Vec3;
  readonly L: (k: keyof typeof LEFT) => Vec3;
  readonly R: (k: keyof typeof LEFT) => Vec3;
  readonly M: (k: keyof typeof MIDLINE) => Vec3;
  readonly s: number;
  readonly fold: (name: string, part: string, pts: Vec3[], r: number, why: string) => void;
  /** Warped-base vertices passing `f`, in bust space. */
  readonly pick: (f: (v: number) => boolean) => Vec3[];
  /** Warped-base vertex `v` before the plinth lift. */
  readonly at: (v: number) => Vec3;
}

export function hairCreases(b: FaceBust, c: CreaseCtx): IntendedCrease[] {
  const { head, up, L, R, M, s, pick, at } = c;
  const out: IntendedCrease[] = [];
  const fold = (name: string, part: string, pts: Vec3[], r: number, why: string): void => {
    c.fold(name, part, pts, r, why);
  };
  if (b.hair.cut !== 'none') {
    const degs =
      b.hair.cut === 'crest'
        ? [-10, -5, 0, 5, 10]
        : [-66, -55, -44, -33, -22, -11, 0, 11, 22, 33, 44, 55, 66];
    const crest = b.hair.cut === 'crest';
    // Lock grooves lie on the hair surface: the skin line pushed out by the mass + lock.
    const c0 = hairCentre(head);
    const lift = (crest ? 0.026 : b.hair.cut === 'long' ? 0.014 : 0.012) * s;
    const onHair = (p: Vec3): Vec3 => {
      const d = [p[0] - c0[0], p[1] - c0[1], p[2] - c0[2]];
      const l = Math.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 1) || 1;
      return up([
        p[0] + ((d[0] ?? 0) / l) * lift,
        p[1] + ((d[1] ?? 0) / l) * lift,
        p[2] + ((d[2] ?? 0) / l) * lift,
      ]);
    };
    scalpLines(head, degs, crest ? 20 : 34, crest ? 200 : 205).forEach((l, i) => {
      fold(`hair_lock${i}`, 'hair', l.map(onHair), 0.02, 'groove beside a hair lock');
    });
    const fh = M('forehead');
    const occ = M('occiput');
    fold(
      'hairline',
      'hair',
      [L('earTop'), [fh[0] - 0.01 * s, 0, fh[2] - 0.04 * s], R('earTop')],
      0.03,
      'edge of the hair mass',
    );
    fold(
      'nape_line',
      'hair',
      [L('earBack'), [occ[0], 0, M('nape')[2] + 0.03 * s], R('earBack')],
      0.03,
      'edge of the hair at the nape',
    );
  }
  if (b.hair.cut === 'long')
    fallLines(head).forEach((f, i) => {
      fold(`ribbon${i}`, 'hair', f.pts.map(up), 0.025, 'strand grooves of a falling ribbon');
    });
  if (b.hair.beard === 'full') {
    beardLines(head).forEach((l, i) => {
      fold(`beard_lock${i}`, 'hair', l.map(up), 0.02, 'groove beside a beard lock');
    });
    moustacheLines(head).forEach((l, i) => {
      fold(`moustache${i}`, 'hair', l.map(up), 0.015, 'moustache lock on the lip');
    });
  }
  const sideOf = (lines: Vec3[][], sign: number): Vec3[][] =>
    lines.filter((l) => Math.sign(l[Math.floor(l.length / 2)]?.[1] ?? 0) === sign);
  for (const sign of [1, -1]) {
    const tag = sign > 0 ? 'l' : 'r';
    if (b.hair.cut === 'short' || b.hair.cut === 'long')
      out.push(
        ...centroidRegion(
          `side_locks_${tag}`,
          'hair',
          scalpLines(head, [44 * sign, 55 * sign, 66 * sign]).map((l) => l.map(up)),
          0.03,
          'side locks meeting the mass above the ear',
        ),
      );
    if (b.hair.cut === 'long')
      out.push(
        ...centroidRegion(
          `ribbons_${tag}`,
          'hair',
          sideOf(
            fallLines(head).map((f) => f.pts),
            sign,
          ).map((l) => l.map(up)),
          0.03,
          'ribbons leaving the head behind the ear',
        ),
      );
    if (b.hair.beard === 'full')
      out.push(
        ...centroidRegion(
          `beard_${tag}`,
          'hair',
          sideOf([...beardLines(head), ...moustacheLines(head)], sign).map((l) => l.map(up)),
          0.03,
          'beard locks and moustache on this side',
        ),
      );
  }
  if (b.hair.cut === 'crest')
    out.push(
      ...centroidRegion(
        'crest_front',
        'hair',
        scalpLines(head, [-10, 0, 10], 20, 200).map((l) => [
          up(l[0] ?? [0, 0, 0]),
          up(l[2] ?? [0, 0, 0]),
        ]),
        0.03,
        'front of the crest rising off the brow',
      ),
    );
  const neckZ = head.map(MIDLINE.menton)[2] - 0.09 * s;
  if (b.hair.cut !== 'none') {
    const line = hairlineOf(head, b.hair.cut);
    out.push(
      ...regionsOf(
        'hair_edge',
        'hair',
        pick((v) => at(v)[2] > neckZ && Math.abs(line(at(v))) < 0.005 * s),
        0.025 * s,
        'edge of the hair mass',
      ),
      ...centroidRegion(
        'hair_locks',
        'hair',
        scalpLines(head, [-44, 0, 44]).map((l) => l.map(up)),
        0.03,
        'centre of the swept locks',
      ),
    );
  }
  if (b.hair.beard === 'full') {
    const line = beardlineOf(head);
    const edge = pick((v) => at(v)[2] > neckZ && Math.abs(line(at(v))) < 0.005 * s);
    out.push(
      ...centroidRegion(
        'beard_rim_l',
        'hair',
        [edge.filter((p) => p[1] > 0)],
        0.03,
        'centre of the beard rim round the mouth and jaw',
      ),
      ...centroidRegion(
        'beard_rim_r',
        'hair',
        [edge.filter((p) => p[1] < 0)],
        0.03,
        'centre of the beard rim round the mouth and jaw',
      ),
      ...regionsOf(
        'beard_edge',
        'hair',
        pick((v) => at(v)[2] > neckZ && Math.abs(line(at(v))) < 0.005 * s),
        0.025 * s,
        'edge of the beard',
      ),
      ...centroidRegion(
        'beard_locks',
        'hair',
        [...beardLines(head), ...moustacheLines(head)].map((l) => l.map(up)),
        0.03,
        'centre of the beard locks',
      ),
    );
  }
  return out;
}
