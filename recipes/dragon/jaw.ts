// Lower jaw: its own part, pivoted at the hinge so it can bite. Sculpted closed in a hinge frame
// (origin = hinge, +X forward, the mouth line at z = 0), then opened by the rest angle. Block-out:
// a long, deep mandible tapering to a rounded chin. Planes: flat floor of the mouth (gum trough),
// flattened sides. Features: masseter bulge behind, chin boss, throat skin under it, lip ridge.
// Then the tongue (forked) on the floor and the lower teeth seated on the gum.

import { type Field, type Mesh, merge, place, type SculptEdit } from '@developerz.ai/ts23d';
import { mixRgb, smoothstep } from '../_lib/creature/curve.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { type SkinNode, skin } from '../_lib/creature/skin.ts';
import { C } from './palette.ts';
import { SK } from './skeleton.ts';
import { lowerTeeth, teethMesh } from './teeth.ts';

/** Half-width of the jaw's gum line at hinge-frame x (matches the upper lip, overbite inside). */
export const jawWidth = (x: number): number =>
  0.185 - 0.11 * Math.min(1, Math.max(0, (x - 0.25) / 1.0));

function mandible(lod: number): SculptEdit[] {
  const lip: SkinNode[] = [0.05, 0.4, 0.75, 1.05, 1.2].map((x, i) => ({
    at: [x, Math.max(0.0, jawWidth(x) - 0.005), -0.035],
    r: 0.04 - i * 0.002,
  }));
  const gum: SkinNode[] = [0.15, 0.5, 0.85, 1.12].map((x) => ({
    at: [x, jawWidth(x) - 0.035, -0.005],
    r: 0.024,
  }));
  const out: SculptEdit[] = [
    // Block-out: deep at the back, slim at the chin (a little shorter than the upper jaw).
    { shape: 'ellipsoid', at: [0.48, 0, -0.07], size: [0.68, 0.2, 0.13], blend: 0 },
    { shape: 'ellipsoid', at: [1.08, 0, -0.05], size: [0.17, 0.115, 0.08], blend: 0.1 },
    // Masseter: the jaw muscle bulging wide at the back corners.
    {
      shape: 'ellipsoid',
      at: [0.1, 0.18, -0.04],
      size: [0.22, 0.1, 0.15],
      rotate: [0, -20, 0],
      blend: 0.08,
    },
    // Under-jaw skin: soft throat pouch behind the chin.
    {
      shape: 'ellipsoid',
      at: [0.4, 0, -0.16],
      size: [0.42, 0.13, 0.08],
      blend: 0.1,
      color: C.belly,
    },
    // Plane: the top is the mouth line; anything above is cut away.
    {
      shape: 'roundBox',
      at: [0.6, 0, 0.3],
      size: [1.8, 0.8, 0.6],
      op: 'subtract',
      blend: 0.015,
      color: C.gum,
    },
    // Floor of the mouth: a dark trough between the gums.
    {
      shape: 'ellipsoid',
      at: [0.6, 0, 0.0],
      size: [0.54, 0.11, 0.06],
      op: 'subtract',
      blend: 0.03,
      color: C.mouth,
    },
    // Lip ridge along the jaw's edge, and the gum line inside it the teeth root in.
    skin(lip, { blend: 0.035 }),
    skin(gum, { blend: 0.02, color: C.gum }),
  ];
  if (lod < 2) {
    // Chin boss, labial scales along the lip and throat scutes.
    out.push({
      shape: 'ellipsoid',
      at: [1.17, 0.035, -0.09],
      size: [0.07, 0.05, 0.04],
      blend: 0.03,
    });
    const n = lod === 0 ? 10 : 5;
    for (let i = 0; i < n; i++) {
      const x = 0.15 + (i / (n - 1)) * 0.98;
      const s = 1 - 0.4 * (i / (n - 1));
      out.push({
        shape: 'ellipsoid',
        at: [x, jawWidth(x) + 0.01, -0.07],
        size: [0.045 * s, 0.018, 0.028 * s],
        blend: 0.015,
        color: C.belly,
      });
    }
    for (let i = 0; i < 5; i++)
      out.push({
        shape: 'ellipsoid',
        at: [0.2 + i * 0.17, 0.1 - i * 0.01, -0.2 + i * 0.02],
        size: [0.06, 0.04, 0.025],
        blend: 0.025,
        color: C.belly,
      });
  }
  return out;
}

/** Tongue lying in the trough, forked at the tip. */
function tongue(): SculptEdit[] {
  const t = C.tongue;
  return [
    skin(
      [
        { at: [0.18, 0, -0.03], r: 0.06 },
        { at: [0.5, 0, -0.03], r: 0.052 },
        { at: [0.82, 0, -0.025], r: 0.035 },
        { at: [0.94, 0.0, -0.02], r: 0.022 },
      ],
      { blend: 0.02, color: t, mirror: false },
    ),
    skin(
      [
        { at: [0.94, 0.0, -0.02], r: 0.018 },
        { at: [1.02, 0.028, -0.012], r: 0.011 },
      ],
      { blend: 0.01, color: t },
    ),
  ];
}

const jawPaint = (p: readonly [number, number, number], c: readonly [number, number, number]) =>
  mixRgb(c, C.back, smoothstep(-0.05, -0.2, p[2]) * smoothstep(0.1, 0.18, Math.abs(p[1])) * 0.5);

export const JAW_RES = [0.018, 0.04, 0.1] as const;

/** Jaw mesh in the hinge's frame (part pivot = SK.head.hinge), opened by the rest angle. */
export function jawMesh(lod: 0 | 1 | 2): { mesh: Mesh; field: Field } {
  const bone = sculptPart({
    edits: [...mandible(lod), ...tongue()],
    res: JAW_RES[lod],
    color: C.flank,
    mirror: true,
    paint: jawPaint,
    tone: { reach: 0.05 },
  });
  const teeth = teethMesh(lowerTeeth(lod, SK.head.hinge[0], jawWidth), lod);
  const open = (SK.head.open * Math.PI) / 180;
  return { mesh: place(merge([bone.mesh, teeth]), { pitch: open }), field: bone.field };
}
