// `bodyPlan`: a BodyPlanSpec resolved to bones and motion axes (contract: body-plan-types.ts). Each
// chain is cut by arc length (`bias` packs the tip), every copy is placed by its mirror or radial
// transform, and each bone records the axes motion turns it about. Radial copies turn their axes
// with the arm. Mirror copies mirror them as rotation axes, so the same angle on `_l` and `_r` gives
// mirror-image motion; `twist` stays the bone's own direction. Pure and deterministic.

import type { Bone, Vec3 } from '../core/index.ts';
import { checkBodyPlan } from './body-plan-check.ts';
import { type ChainCopy, chainCopies, chainCurve, linkStops } from './body-plan-curve.ts';
import type { BodyPlan, BodyPlanSpec, ChainSpec, PlanChain, PlanLink } from './body-plan-types.ts';
import { v3 } from './creature-curve.ts';

/** The parent chain copy that copy `self` of `c` hangs from (the check proved one exists). */
function hostOf(c: ChainSpec, self: ChainCopy, done: readonly PlanChain[]): PlanChain | undefined {
  const name = c.parent?.chain;
  const group = done.filter((d) => d.spec === name);
  if (group.length === 0) return done.find((d) => d.id === name);
  return group.length === 1 ? group[0] : group.find((d) => d.copy === self.copy);
}

function resolveCopy(c: ChainSpec, self: ChainCopy, parent: string | undefined): PlanChain {
  const curve = chainCurve(c);
  const stops = linkStops(c.links, c.bias);
  const links: PlanLink[] = [];
  for (let i = 0; i < c.links; i++) {
    const s = stops[i] ?? 0;
    const end = stops[i + 1] ?? 1;
    const head = curve.at(s).p;
    const tail = curve.at(end).p;
    const mid = curve.at((s + end) / 2);
    const twist = v3.norm(v3.sub(tail, head));
    const bend = v3.norm(v3.sub(mid.bend, v3.mul(twist, v3.dot(mid.bend, twist))));
    const pitch: Vec3 = v3.cross(twist, bend);
    const up = i === 0 ? parent : `${self.id}_${i - 1}`;
    const bone: Bone = {
      name: `${self.id}_${i}`,
      ...(up ? { parent: up } : {}),
      head: self.point(head),
      tail: self.point(tail),
    };
    links.push({
      bone,
      s,
      length: v3.len(v3.sub(tail, head)),
      bend: self.axis(bend),
      pitch: self.axis(pitch),
      twist: self.dir(twist),
    });
  }
  return { id: self.id, spec: c.name, copy: self.copy, links, length: curve.length };
}

export function bodyPlan(spec: BodyPlanSpec): BodyPlan {
  checkBodyPlan(spec);
  const chains: PlanChain[] = [];
  for (const c of spec.chains)
    for (const self of chainCopies(c)) {
      const host = c.parent ? hostOf(c, self, chains) : undefined;
      const parent = c.parent ? host?.links[c.parent.link]?.bone.name : undefined;
      chains.push(resolveCopy(c, self, parent));
    }
  return {
    name: spec.name,
    length: spec.length,
    bones: chains.flatMap((c) => c.links.map((l) => l.bone)),
    chains,
    root: chains[0]?.links[0]?.bone.name ?? '',
    spec,
  };
}
