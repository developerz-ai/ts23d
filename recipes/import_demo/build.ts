// Import demo assembly. The imported half is `head`: the cleaned, simplified scan — on the trim
// sheet with its colour in vertex colour ('sheet'), or keeping the scan's own UVs for the baked
// own-texture GLB ('own'). Everything else is code: eyeballs seated in the scan's sockets (placed
// by the scan's hm08 landmarks), the human bust's torso
// under the neck seam in dyed-wool tunic and a slim draped mantle, a leather collar sized to the
// scan's neck as MEASURED on the mesh (a socket for the `neck` joint), a brooch and a plinth.

import {
  type BuildContext,
  bakeAo,
  type Field,
  hex,
  type Mesh,
  merge,
  onSheet,
  type SculptEdit,
  sculpt,
  sculptField,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type EyeSpec, eyes } from '../_lib/bust/eye.ts';
import { brooch, tunicFolds } from '../_lib/bust/human/clothes.ts';
import { CUT_Z, H, L, TORSO } from '../_lib/bust/human/spec.ts';
import { creaseOn, surface } from '../_lib/bust/kit.ts';
import { plinth } from '../_lib/bust/plinth.ts';
import { skinMesh } from '../_lib/bust/skin.ts';
import { baseZ, garment, neckSeam, torsoEdits } from '../_lib/bust/torso.ts';
import { collarMesh } from './collar.ts';
import { HM08, SEAM_Z, toBust } from './scan-head.ts';
import { headLod } from './source.ts';

/** Dyed wool, vegetable-tanned leather, old brass: muted, not toy colours. */
export const DYED = {
  skin: hex('#c49478'),
  warm: hex('#cfa084'),
  cool: hex('#9c7c70'),
  cavity: hex('#5e3a30'),
  tunic: hex('#4a5566'),
  tunicDark: hex('#343c48'),
  mantle: hex('#6b4a3a'),
  leather: hex('#5a4030'),
  brass: hex('#9a8452'),
  plinth: hex('#3a3634'),
};

const CELLS = [0.0065, 0.011, 0.024] as const;
/** The torso's neck matched to the scan's (≈ 0.75 × its jaw width); a leaner build than the hero. */
const TORSO_I = { ...TORSO, neck: 0.05, mass: 0.3, shoulders: 0.19 };
const seamField: Field = (p) => (p[2] + 0.3 * p[0] - SEAM_Z) / Math.hypot(1, 0.3);

/** Mantle: over the shoulders and down the back, open in front, lower edge in loose folds. */
const mantleRegion: Field = (p) => {
  const a = Math.atan2(p[1], -p[0]);
  const hem = L.mz - 0.6 * H - 0.01 * Math.cos(a * 9) - (0.05 * Math.max(0, -p[0])) / 0.1;
  return Math.max(
    hem - p[2],
    Math.min(p[0] - (L.gx - 0.36 * H), 0.12 - Math.abs(p[1])),
    seamField(p) + 0.02,
  );
};

/** Tunic paint, a slim mantle and folds on the torso. */
function outfit(body: Field, lod: number): SculptEdit[] {
  const seam = neckSeam(L);
  const skin = surface(body);
  const box: [Vec3, Vec3] = [
    [-0.3, -0.35, 0],
    [0.3, 0.35, L.mz + 0.02],
  ];
  return [
    {
      field: (p) =>
        Math.max(
          Math.min(seamField(p) + 0.012, 0.072 - Math.hypot(p[0] - seam.at[0], p[1])),
          p[2] - (L.mz - 0.12 * H),
        ),
      bounds: box,
      op: 'paint',
      blend: 0.002,
      color: DYED.tunic,
    },
    {
      field: garment(body, 0.0065, mantleRegion, baseZ(TORSO_I)),
      bounds: box,
      color: DYED.mantle,
      blend: 0.002,
    },
    ...(lod < 2
      ? tunicFolds().map((f) => creaseOn(skin, f, 0.004, 0.0025, { color: DYED.tunicDark }))
      : []),
  ];
}

/** The scan's neck where it crosses the collar plane: centre and half-axes, from the mesh. */
export function neckAtSeam(m: Mesh): { centre: Vec3; rx: number; ry: number } {
  const pts: Vec3[] = [];
  for (let i = 0; i < m.positions.length; i += 3) {
    const p: Vec3 = [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
    if (Math.abs(p[2] + 0.3 * p[0] - SEAM_Z) < 0.004) pts.push(p);
  }
  const lo = (k: 0 | 1): number => Math.min(...pts.map((p) => p[k]));
  const hi = (k: 0 | 1): number => Math.max(...pts.map((p) => p[k]));
  const cx = (lo(0) + hi(0)) / 2;
  const cy = (lo(1) + hi(1)) / 2;
  return {
    centre: [cx, cy, SEAM_Z - 0.3 * cx],
    rx: (hi(0) - lo(0)) / 2,
    ry: (hi(1) - lo(1)) / 2,
  };
}

export function buildImportDemo(ctx: BuildContext, mode: 'sheet' | 'own'): void {
  const lod = ctx.lod;
  const body = sculptField(torsoEdits(L, TORSO_I), { color: DYED.skin, mirror: 'y' }).field;
  const skin = surface(body);
  const cell = ctx.pick(CELLS);
  const head = headLod(lod);
  // Collar: a leather roll round the collar plane, sized to the scan's neck (a socket for it).
  const neck = neckAtSeam(headLod(0));
  const meshes: Record<string, Mesh> = {
    bust: skinMesh([...torsoEdits(L, TORSO_I), ...outfit(body, lod)], cell, {
      rng: ctx.rng.fork('skin'),
      tone: DYED,
      // The torso neck stops under the collar tube's centre line, so its cut never shows.
      clip: (p) => seamField(p) + 0.004,
      within: [
        [-0.4, -0.4, 0],
        [0.4, 0.4, L.mz],
      ],
    }),
    collar: onSheet(
      collarMesh(
        {
          ...neck,
          rx: neck.rx + 0.001,
          ry: neck.ry + 0.001,
          tube: 0.0075,
          seamZ: SEAM_Z,
          color: DYED.leather,
        },
        ctx.pick([64, 40, 20]),
        ctx.pick([12, 8, 5]),
      ),
      'leather',
    ),
    ...(lod < 2
      ? {
          brooch: sculpt({
            edits: brooch(skin),
            resolution: 0.0016,
            color: DYED.brass,
            strip: 'brass',
          }),
        }
      : {}),
    plinth: plinth(ctx, { radius: 0.13, top: CUT_Z, color: DYED.plinth }),
  };
  const all = merge([...Object.values(meshes), head]);
  const ao = (m: Mesh): Mesh =>
    lod < 2 ? bakeAo(m, { samples: ctx.pick([14, 9, 6]), radius: 0.08, strength: 0.45 }, all) : m;
  for (const [name, m] of Object.entries(meshes)) ctx.part(name, ao(m));
  ctx.part('head', mode === 'sheet' ? onSheet(ao(head), 'plain') : head);
  const eye: EyeSpec = {
    centre: toBust(HM08.eye),
    r: 0.0128,
    iris: 0.0058,
    upper: 0.25,
    lower: 0.12,
    lid: 0.002,
    colours: {
      sclera: [0.84, 0.82, 0.78],
      iris: [0.34, 0.3, 0.22],
      pupil: [0.03, 0.02, 0.02],
      wet: [0.8, 0.5, 0.5],
      caruncle: [0.8, 0.5, 0.5],
    },
  };
  eyes(ctx, eye, { cell: ctx.pick([0.0012, 0.0024, 0.006]), finish: 'cornea' });
  // The scan's neck plugs into the collar on the seam plane (and on into the torso's neck).
  ctx.joint('neck', {
    from: 'head',
    to: 'collar',
    at: neck.centre,
    axis: [-0.287, 0, -0.958],
    kind: 'socket',
  });
}
