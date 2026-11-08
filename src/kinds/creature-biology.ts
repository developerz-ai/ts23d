// Biology checks built into the creature kind, each a number with a source:
//   allometry     limbs must be thick enough for the mass (Campione & Evans 2012: body mass from
//                 humerus + femur circumference, bone = BONE_FRACTION of the furred limb width);
//                 a stick-legged elephant is refused before sculpting
//   density       the mesh is the coat's outer surface: flesh (≈ 1050 kg/m³; birds ≈ 750 with air
//                 sacs) under a hair shell (≈ 100 kg/m³), so the mass gate fills the furred volume
//                 with an effective density (tiger dossier method, solved for thick coats)
//   wing loading  weight ÷ wing area; a creature that declares `flies` must stay ≤ 250 N/m²
//   balance       a QA check: the centre of mass (volume × density) projects inside the support
//                 polygon of the ground contacts, at every LOD
// Sources: Campione & Evans, BMC Biology 10:60 (2012); Meunier 1951 / Alexander, Animal Mechanics
// (wing loading of large flyers ≈ 100–250 N/m²).

import type { Check, CheckFinding, CompiledAsset, Vec3 } from '../core/index.ts';
import { worldMeshes } from '../core/index.ts';
import { massProperties } from '../physics/index.ts';
import { BONE_FRACTION, type Bones, massFromBones } from './creature-bones.ts';
import type { CreatureSpec } from './creature-spec.ts';

/** Allowed band of limb-implied mass ÷ declared mass (C&E's 95% band is about ×0.5–×2). */
export const ALLOMETRY_BAND = [0.5, 2.5] as const;
export const MAX_WING_LOADING = 250;

export interface Biology {
  /** Mass the limbs carry (kg), or null for legless types. */
  readonly limbMass: number | null;
  /** Effective density of the furred volume, kg/m³. */
  readonly density: number;
  /** N/m² over both wings, or null without wings. */
  readonly wingLoading: number | null;
  readonly findings: readonly CheckFinding[];
}

/** Mass (kg) the upper limbs of these bones carry. */
export function limbMass(b: Bones): number | null {
  if (b.legs.length === 0 || b.limbR <= 0) return null;
  const each = Math.PI * 2 * BONE_FRACTION * b.limbR * 1000;
  return massFromBones(2 * each);
}

export function effectiveDensity(s: CreatureSpec): number {
  const flesh = s.skeleton === 'bird' ? 750 : 1050;
  const coat = s.coat ?? ((s.surface ?? 'fur') === 'fur' ? 0.02 : 0);
  // Flesh volume, then the furred volume around it: Vc = Vf + A(Vc)·coat, with the surface of an
  // animal shape A ≈ 9.05 · V^(2/3) (measured on the tiger: 14.5 m⁻¹ at 0.23 m³). Fixed point.
  const vf = s.mass / flesh;
  let vc = vf;
  for (let i = 0; i < 12; i++) vc = vf + 9.05 * vc ** (2 / 3) * coat;
  return Math.round((s.mass + (vc - vf) * 100) / vc);
}

export function biology(s: CreatureSpec, b: Bones): Biology {
  const findings: CheckFinding[] = [];
  const lm = limbMass(b);
  if (lm !== null) {
    const k = lm / s.mass;
    if (k < ALLOMETRY_BAND[0] || k > ALLOMETRY_BAND[1])
      findings.push({
        message: `allometry: the limbs carry ${lm.toFixed(1)} kg but the creature weighs ${s.mass} kg (×${k.toFixed(2)}, allowed ×${ALLOMETRY_BAND[0]}–×${ALLOMETRY_BAND[1]})`,
        fix:
          k < 1
            ? `thicken the limbs: build.limbs ×${(1 / k ** (1 / 2.749)).toFixed(2)} (limb width grows with mass^0.36), or lower the mass`
            : `thin the limbs: build.limbs ×${(1 / k ** (1 / 2.749)).toFixed(2)}, or raise the mass`,
      });
  }
  const area = b.wings.reduce((a, w) => a + w.area, 0) * 2;
  const wl = area > 0 ? (s.mass * 9.81) / area : null;
  if (s.flies && wl !== null && wl > MAX_WING_LOADING)
    findings.push({
      message: `wing loading ${wl.toFixed(0)} N/m² is above ${MAX_WING_LOADING} N/m²: these wings cannot lift ${s.mass} kg`,
      fix: `raise wingspan ×${Math.sqrt(wl / MAX_WING_LOADING).toFixed(2)} or drop \`flies\``,
    });
  return { limbMass: lm, density: effectiveDensity(s), wingLoading: wl, findings };
}

/** 2D convex hull (monotone chain), counter-clockwise. */
export function hull2(pts: readonly (readonly [number, number])[]): [number, number][] {
  const p = [...pts]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map((q): [number, number] => [q[0], q[1]]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]): number =>
    ((a[0] ?? 0) - (o[0] ?? 0)) * ((b[1] ?? 0) - (o[1] ?? 0)) -
    ((a[1] ?? 0) - (o[1] ?? 0)) * ((b[0] ?? 0) - (o[0] ?? 0));
  const half = (list: [number, number][]): [number, number][] => {
    const h: [number, number][] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2] ?? q, h[h.length - 1] ?? q, q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
}

/** Signed distance of (x, y) inside a CCW convex polygon (> 0 inside). */
export function insideBy(poly: readonly [number, number][], x: number, y: number): number {
  if (poly.length < 3) return -Infinity;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i] ?? [0, 0];
    const [bx, by] = poly[(i + 1) % poly.length] ?? [0, 0];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    d = Math.min(d, ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / l);
  }
  return d;
}

/** Ground contacts of a compiled asset: every vertex within `eps` of its lowest point. */
export function groundPoints(a: CompiledAsset, eps = 0.02): [number, number][] {
  const ms = [...worldMeshes(a.parts).values()];
  let low = Infinity;
  for (const m of ms)
    for (let i = 2; i < m.positions.length; i += 3) low = Math.min(low, m.positions[i] ?? 0);
  const out: [number, number][] = [];
  for (const m of ms)
    for (let i = 0; i < m.positions.length; i += 3)
      if ((m.positions[i + 2] ?? 0) < low + eps)
        out.push([m.positions[i] ?? 0, m.positions[i + 1] ?? 0]);
  return out;
}

/** QA check: centre of mass over the support polygon (the creature does not tip over). */
export const balanced: Check = (a) => {
  const com: Vec3 = massProperties(a).centerOfMass;
  const poly = hull2(groundPoints(a));
  const d = insideBy(poly, com[0], com[1]);
  if (d >= 0) return [];
  return [
    {
      message: `balance: the centre of mass (${com[0].toFixed(3)}, ${com[1].toFixed(3)}) is ${(-d * 100).toFixed(1)} cm outside the support polygon of the feet`,
      fix: 'move the feet under the body (fore paw under the withers, hind under the hip) or shift the mass (head, tail) back over them',
    },
  ];
};
