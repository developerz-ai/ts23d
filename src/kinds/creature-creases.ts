// Folds that are anatomy, not modelling seams, declared with reasons so QA `connections` skips
// them: the mouth line and nostrils, eyelid folds, ear roots in the crown fur, the armpit and
// groin where a leg leaves the trunk, the elbow/stifle and carpus/hock flexion folds, the partings
// between the toes, wing and fin roots. Computed from the same skeleton the sculpt uses.

import type { IntendedCrease, Vec3 } from '../core/index.ts';
import { headToWorld } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { headLayout } from './creature-head.ts';
import { EAR_UP } from './creature-head-parts.ts';
import { bonesOf } from './creature-skeleton.ts';
import type { CreatureSpec } from './creature-spec.ts';

const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

export function creatureCreases(s: CreatureSpec, prefix = ''): IntendedCrease[] {
  const b = bonesOf(s);
  const l = headLayout(b, s);
  const head = `${prefix}head`;
  const body = `${prefix}body`;
  const hw = (p: Vec3): Vec3 => headToWorld(b.head, p);
  const both = (
    name: string,
    part: string,
    at: Vec3,
    radius: number,
    why: string,
  ): IntendedCrease[] => [
    { name: `${name}_l`, part, at, radius, why },
    { name: `${name}_r`, part, at: flip(at), radius, why },
  ];
  const front: Vec3 = [l.L - l.rt * 0.5, 0, l.zm];
  const out: IntendedCrease[] = [
    {
      name: 'mouth_line',
      part: head,
      at: hw(v3.lerp(front, [l.corner[0], 0, l.corner[2]], 0.5)),
      radius: v3.len(v3.sub(front, l.corner)) * 0.65 + l.rt * 0.5,
      why: 'the lip line where the jaw closes',
    },
    {
      name: 'nostrils',
      part: head,
      at: hw(l.nose),
      radius: l.rt * 1.1,
      why: 'nostrils bored into the nose leather',
    },
    ...both('eyelids', head, hw(l.eye.centre), l.eye.r * 2.2, 'lid folds round the eyeball'),
  ];
  if (l.ear)
    out.push(
      ...both(
        'ear',
        head,
        hw(v3.add(l.ear, v3.mul(EAR_UP, l.earHeight * 0.35))),
        l.earHeight * 0.85,
        'the ear rising out of the crown fur and the cup inside it',
      ),
    );
  for (const g of b.legs) {
    const r = g.radii[0] ?? 0.05;
    const [root, mid, low] = g.joints;
    if (root)
      out.push(
        ...both(
          g.name === 'fore' ? 'axilla' : 'groin',
          body,
          v3.add(root, [0, -r * 0.5, -r]),
          r * 2.2,
          'the leg leaving the trunk',
        ),
      );
    if (mid)
      out.push(
        ...both(`${g.name}_flexion`, body, mid, r * 1.4, 'the flexion fold of the elbow / stifle'),
      );
    if (low) out.push(...both(`${g.name}_low`, body, low, r * 1.1, 'the carpal / hock fold'));
    out.push(
      ...both(
        `${g.name}_toes`,
        body,
        [g.foot[0], g.foot[1], g.footSize[2]],
        g.footSize[0] * 1.8,
        'partings between the toes',
      ),
    );
  }
  const fore = b.legs.find((g) => g.name === 'fore');
  const elbow = fore?.joints[1];
  if (fore && elbow && b.legs.length > 1 && b.skeleton !== 'biped') {
    // Under the chest: both elbows tucked against the chest wall either side of the sternum.
    const r = fore.radii[0] ?? 0.05;
    out.push({
      name: 'elbows',
      part: body,
      at: [elbow[0], 0, elbow[2]],
      radius: Math.abs(elbow[1]) + 2.5 * r,
      why: 'the elbows folded in against the chest wall either side of the sternum',
    });
  }
  const hind = b.legs.find((g) => g.name === 'hind');
  const hip = hind?.joints[0];
  if (hind && hip && b.legs.length > 1) {
    // Between the hind legs: the groin in front, the perineum behind, the inner thighs.
    const r = hind.radii[0] ?? 0.05;
    out.push({
      name: 'groin',
      part: body,
      at: [hip[0], 0, hip[2] - 2.6 * r],
      radius: 4 * r,
      why: 'the folds between the hind legs (groin, inner thighs, perineum)',
    });
  }
  const ruff = s.build?.ruff ?? 0;
  const base = b.neck[0];
  if (ruff > 0 && base)
    out.push({
      name: 'mane_edge',
      part: body,
      at: [base.at[0], 0, b.height],
      radius: base.r + ruff * 2,
      why: 'the lower edge of the long mane lying over the withers',
    });
  for (const w of b.wings) {
    const root = w.arm[0];
    if (root)
      out.push(...both('wing_root', body, root.at, root.r * 4, 'the wing leaving the shoulder'));
  }
  b.fins.forEach((f, i) => {
    const root = f.nodes[0];
    if (root) out.push(...both(`fin_${i}`, body, root.at, root.r * 1.5, 'the fin root'));
  });
  if (b.tail[0])
    out.push({
      name: 'tail_root',
      part: body,
      at: v3.add(b.tailRoot, [0, 0, -(b.tail[0]?.r ?? 0.03)]),
      radius: (b.tail[0]?.r ?? 0.03) * 3.5,
      why: 'the tail leaving the croup',
    });
  return out;
}
