// Import demo assembly. The imported half is `head`: the cleaned, simplified scan — on the trim
// sheet with its colour in vertex colour ('sheet'), or keeping the scan's own UVs for the baked
// own-texture GLB ('own'). Everything else is code: eyeballs seated in the scan's sockets (placed
// by the scan's hm08 landmarks), the human bust's torso
// under the neck seam in dyed-wool tunic and a slim draped mantle, a leather collar sized to the
// scan's neck as MEASURED on the mesh (it follows the neck's outline, so it sits on the skin all
// round; a socket for the `neck` joint), a brooch and a plinth. The bust is sawn flat through the
// shoulders like a carved one (the shared arm cut), its cloth on the wool strip, lightly
// sun-faded on top and soiled at the hem, the mantle a short cape closed at the throat with a
// woven border and a frayed edge; the scan's skin on the shared pore strip.

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
  valueNoise,
  weather,
} from '@developerz.ai/ts23d';
import { WOOL } from '../_lib/bust/cloth-strips.ts';
import { type EyeSpec, eyes } from '../_lib/bust/eye.ts';
import { brooch, tunicFolds } from '../_lib/bust/human/clothes.ts';
import { CUT_Z, H, L, TORSO } from '../_lib/bust/human/spec.ts';
import { creaseOn, surface } from '../_lib/bust/kit.ts';
import { faceBlocks, settled } from '../_lib/bust/layers.ts';
import { plinth } from '../_lib/bust/plinth.ts';
import { skinMesh } from '../_lib/bust/skin.ts';
import { armCut, baseZ, garment, neckSeam, torsoEdits } from '../_lib/bust/torso.ts';
import { onFineStrip, onSkin } from '../_lib/face/skin-strip.ts';
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
  mantleDark: hex('#3c2a22'),
  leather: hex('#5a4030'),
  brass: hex('#9a8452'),
  plinth: hex('#3a3634'),
};

const CELLS = [0.0075, 0.013, 0.038] as const;
/** The torso's neck matched to the scan's (≈ 0.75 × its jaw width); a leaner build than the hero. */
const TORSO_I = { ...TORSO, neck: 0.05, mass: 0.22, shoulders: 0.16, armCut: 0.02 };
/** Where the shoulders are sawn off: the shared arm cut (torso.ts), a flat oval each side. */
const sawn: Field = armCut(L, TORSO_I);
const THREAD = hex('#8f7155');
const seamField: Field = (p) => (p[2] + 0.3 * p[0] - SEAM_Z) / Math.hypot(1, 0.3);

/** The mantle's hem height round the bust (a = angle from the back): lower behind, in loose
 *  scallops. */
const hemZ = (p: Vec3): number => {
  const a = Math.atan2(p[1], -p[0]);
  return L.mz - 0.62 * H - 0.005 * Math.cos(a * 7) - (0.05 * Math.max(0, -p[0])) / 0.1;
};
/** Where the mantle closes at the throat (it falls open below, in a V). */
const CLOSE_Z = L.mz - 0.4 * H;
/** Mantle: a short cape over the shoulders and down the back, closed at the throat and
 *  falling open below it in a narrow V (not two pads left on the shoulders). */
const mantleRegion: Field = (p) => {
  const open = 0.004 + 0.75 * Math.max(0, CLOSE_Z - p[2]);
  return Math.max(
    hemZ(p) - p[2],
    Math.min(p[0] - (L.gx - 0.36 * H), open - Math.abs(p[1])),
    seamField(p) + 0.02,
  );
};

/**
 * The far bust's cloth as clean colour blocks: the mantle wherever its region is, tunic where a
 * vertex took the mantle's colour outside it (the far cell's vertices sample either side of the
 * mantle's 9 mm step), then one colour per triangle. Averaging the two instead reads as one
 * muddy brown-blue.
 */
function farCloth(m: Mesh): Mesh {
  const colors = new Float32Array(m.colors);
  const d = (a: Vec3, b: Vec3): number =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const p: Vec3 = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const c: Vec3 = [colors[i * 3] ?? 0, colors[i * 3 + 1] ?? 0, colors[i * 3 + 2] ?? 0];
    if (mantleRegion(p) <= 0) colors.set(DYED.mantle, i * 3);
    else if (d(c, DYED.mantle) < d(c, DYED.tunic)) colors.set(DYED.tunic, i * 3);
  }
  return faceBlocks({ ...m, colors });
}

/** Tunic paint, a slim mantle and folds on the torso. */
function outfit(body: Field, lod: number, fray: Field): SculptEdit[] {
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
      field: garment(body, 0.009, mantleRegion, baseZ(TORSO_I)),
      bounds: box,
      color: DYED.mantle,
      blend: 0.002,
    },
    ...(lod < 2
      ? tunicFolds().map((f) => creaseOn(skin, f, 0.004, 0.0025, { color: DYED.tunicDark }))
      : []),
    // The hem's stitched border: a darker woven band a finger above the edge, all round.
    {
      // (A band as wide as a cell: a thinner one breaks into dashes on the 7.5 mm mesh.)
      field: (p) => Math.max(Math.abs(mantleRegion(p) + 0.016) - 0.0045, mantleRegion(p)),
      bounds: box,
      op: 'paint',
      blend: 0.001,
      color: DYED.mantleDark,
    },
    // Fray: the mantle's edge worn to pale thread, ragged (a fine noise breaks the line).
    {
      field: (p) =>
        Math.max(Math.abs(mantleRegion(p) + 0.003) - 0.003 - 0.002 * fray(p), mantleRegion(p)),
      bounds: box,
      op: 'paint',
      blend: 0.002,
      color: THREAD,
    },
    // The saw cut through each shoulder, and its face in the cloth's shadow colour.
    {
      field: sawn,
      bounds: [
        [-2, -2, -1],
        [2, 2, 3],
      ],
      op: 'intersect',
      blend: 0.004,
    },
    {
      field: (p) => -sawn(p) - 0.0015,
      bounds: box,
      op: 'paint',
      blend: 0.001,
      color: DYED.tunicDark,
    },
  ];
}

/** The scan's neck where it crosses the collar plane: centre and half-axes, from the mesh, and
 *  its outline as a radius per angle about the centre (the largest in each of 48 sectors, gaps
 *  filled from their neighbours, lightly smoothed). */
export function neckAtSeam(m: Mesh): {
  centre: Vec3;
  rx: number;
  ry: number;
  outline: (a: number) => number;
} {
  const pts: Vec3[] = [];
  for (let i = 0; i < m.positions.length; i += 3) {
    const p: Vec3 = [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
    if (Math.abs(p[2] + 0.3 * p[0] - SEAM_Z) < 0.004) pts.push(p);
  }
  const lo = (k: 0 | 1): number => Math.min(...pts.map((p) => p[k]));
  const hi = (k: 0 | 1): number => Math.max(...pts.map((p) => p[k]));
  const cx = (lo(0) + hi(0)) / 2;
  const cy = (lo(1) + hi(1)) / 2;
  const N = 48;
  const r = new Float64Array(N);
  for (const p of pts) {
    const a = Math.atan2(p[1] - cy, p[0] - cx);
    const k = ((Math.round((a / (Math.PI * 2)) * N) % N) + N) % N;
    r[k] = Math.max(r[k] ?? 0, Math.hypot(p[0] - cx, p[1] - cy));
  }
  for (let pass = 0; pass < N; pass++)
    for (let k = 0; k < N; k++)
      if (!r[k]) r[k] = Math.max(r[(k + 1) % N] ?? 0, r[(k + N - 1) % N] ?? 0);
  for (let pass = 0; pass < 2; pass++) {
    const prev = Float64Array.from(r);
    for (let k = 0; k < N; k++)
      r[k] = ((prev[(k + N - 1) % N] ?? 0) + 2 * (prev[k] ?? 0) + (prev[(k + 1) % N] ?? 0)) / 4;
  }
  const outline = (a: number): number => {
    const f = (((a / (Math.PI * 2)) % 1) + 1) % 1;
    const k = Math.floor(f * N);
    const t = f * N - k;
    return (r[k % N] ?? 0) * (1 - t) + (r[(k + 1) % N] ?? 0) * t;
  };
  return {
    centre: [cx, cy, SEAM_Z - 0.3 * cx],
    rx: (hi(0) - lo(0)) / 2,
    ry: (hi(1) - lo(1)) / 2,
    outline,
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
  const fray = valueNoise(ctx.rng.fork('fray'), { scale: 0.006, octaves: 2 });
  const scuff = valueNoise(ctx.rng.fork('scuff'), { scale: 0.012, octaves: 2 });
  const sculpted = skinMesh([...torsoEdits(L, TORSO_I), ...outfit(body, lod, fray)], cell, {
    rng: ctx.rng.fork('skin'),
    tone: DYED,
    // The torso neck stops under the collar tube's centre line, so its cut never shows.
    clip: (p) => seamField(p) + 0.004,
    within: [
      [-0.4, -0.4, 0],
      [0.4, 0.4, L.mz],
    ],
  });
  const meshes: Record<string, Mesh> = {
    bust: lod === 2 ? farCloth(sculpted) : sculpted,
    collar: onSheet(
      collarMesh(
        {
          ...neck,
          rx: neck.rx + 0.001,
          ry: neck.ry + 0.001,
          // On the skin all round: the neck's own outline plus a millimetre of clearance.
          outline: (a) => neck.outline(a) + 0.001,
          scuff,
          tube: 0.0075,
          seamZ: SEAM_Z,
          color: DYED.leather,
        },
        ctx.pick([64, 40, 12]),
        ctx.pick([12, 8, 4]),
      ),
      'leather',
    ),
    ...(lod < 2
      ? {
          brooch: sculpt({
            edits: brooch(skin),
            resolution: ctx.pick([0.0026, 0.0042, 0.008]),
            color: DYED.brass,
            strip: 'brass',
          }),
        }
      : {}),
  };
  // Worn cloth: the shoulders and the top of the chest sun-faded and dusty, the hem soiled where
  // the bust has been handled and set down. Painted on the sculpt's own vertices (LOD0/1; the far
  // cell's vertices would each take one sample of the noise: pale and dark triangles, so the far
  // LOD settles the same dust evenly on what faces up).
  const worn =
    lod === 2
      ? { bust: settled(meshes['bust'] as Mesh, [0.5, 0.44, 0.35], 0.3 * 0.16) }
      : weather(
          ctx,
          { bust: meshes['bust'] as Mesh },
          {
            name: 'cloth',
            seed: 3,
            age: 0.6,
            resolution: 0,
            ground: CUT_Z,
            groundBand: 0.04,
            effects: {
              // (Dust only, light and even: at a 7 mm vertex spacing a sun-fade reads as blotches.)
              dust: { where: 'up-facing', amount: 0.3, strength: 0.16 },
              mud: { where: 'ground-near', amount: 0.4, color: [0.16, 0.12, 0.09], strength: 0.45 },
            },
          },
        );
  // Woven cloth, not skin: the garment goes on the wool strip (twill relief, matte; the dye is
  // its vertex colour).
  meshes['bust'] = onFineStrip(worn.bust, WOOL, 1);
  const stone = weather(
    ctx,
    { plinth: plinth(ctx, { radius: 0.13, top: CUT_Z, color: DYED.plinth }) },
    {
      name: 'plinth',
      seed: 5,
      age: 0.6,
      resolution: [0.03, 0.06, 0],
      groundBand: 0.03,
      under: [DYED.plinth[0] * 1.6, DYED.plinth[1] * 1.6, DYED.plinth[2] * 1.55],
      effects: {
        chips: { where: 'convex-edges', amount: 0.35 },
        dust: { where: 'up-facing', amount: 0.5, strength: 0.3 },
        mud: { where: 'ground-near & side-facing', amount: 0.4 },
      },
    },
  );
  const all = merge([...Object.values(meshes), stone.plinth, head]);
  const ao = (m: Mesh): Mesh =>
    lod < 2 ? bakeAo(m, { samples: ctx.pick([14, 9, 6]), radius: 0.08, strength: 0.45 }, all) : m;
  for (const [name, m] of Object.entries(meshes)) ctx.part(name, ao(m));
  ctx.part('plinth', stone.plinth);
  // The scan's skin on the shared pore strip (micro relief, its own roughness) under a sheen.
  if (mode === 'sheet') ctx.part('head', onSkin(ao(head)), { finish: 'skin' });
  else ctx.part('head', head);
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
  eyes(ctx, eye, { cell: ctx.pick([0.0017, 0.0034, 0.012]), finish: 'cornea' });
  // The scan's neck plugs into the collar on the seam plane (and on into the torso's neck).
  ctx.joint('neck', {
    from: 'head',
    to: 'collar',
    at: neck.centre,
    axis: [-0.287, 0, -0.958],
    kind: 'socket',
  });
}
