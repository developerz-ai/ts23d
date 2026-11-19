// The two loads on the finish demo's pallet, built here rather than from the parts kit so each can
// carry its own detail and LOD policy: a battened pine crate (plank faces with seams, lid boards,
// diagonal braces, nail heads) and a coopered oak cask (28 faceted staves in varied tones, a
// recessed head inside the chime, four iron hoops, a bung). Origin of each = base centre.

import {
  beam,
  box,
  cylinder,
  hex,
  lathe,
  type Mesh,
  merge,
  type Rng,
  type Vec2,
} from '@developerz.ai/ts23d';

const PLANK = hex('#a8783f');
const BATTEN = hex('#7d5a34');
const CORE = hex('#2e2216');
const NAIL = hex('#55534f');
const OAK = hex('#d0a274');
const HEAD = hex('#dcb488');
const HOOP = hex('#c9c3bb');
const BUNG = hex('#6b4a2c');

type Lod = 0 | 1 | 2;

/** Crate X × Y × Z: inner core, plank faces, edge battens, lid boards; braces LOD0/1, nails LOD0. */
export function crateMesh(lod: Lod, [X, Y, Z]: readonly [number, number, number]): Mesh {
  const w = 0.06; // batten width
  const bt = 0.02; // batten thickness, proud of the planks
  const t = 0.02; // plank thickness
  const gap = 0.005; // plank seam
  if (lod === 2) {
    // A box of the plank faces plus the four corner battens: the frame still reads at distance.
    const out: Mesh[] = [
      box({
        size: [X - 2 * bt, Y - 2 * bt, Z - bt],
        color: PLANK,
        strip: 'wood',
        omit: ['bottom'],
      }),
    ];
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        out.push(
          box({
            size: [w, w, Z],
            at: [(sx * (X - w)) / 2, (sy * (Y - w)) / 2, 0],
            color: BATTEN,
            strip: 'wood',
            omit: ['bottom'],
          }),
        );
    return merge(out);
  }
  const bev = lod === 0 ? 0.004 : 0;
  const out: Mesh[] = [
    box({
      size: [X - 2 * bt - 2 * t, Y - 2 * bt - 2 * t, Z - bt - 2 * t],
      at: [0, 0, t],
      color: CORE,
      strip: 'wood',
    }),
  ];
  // Three horizontal planks per face, seams 5 mm apart over the dark core.
  const ph = (Z - bt - 2 * gap) / 3;
  for (let i = 0; i < 3; i++) {
    const z = i * (ph + gap);
    for (const s of [-1, 1]) {
      out.push(
        box({
          size: [t, Y - 2 * bt - 2 * t, ph],
          at: [s * (X / 2 - bt - t / 2), 0, z],
          color: PLANK,
          strip: 'wood',
          bevel: bev,
        }),
        box({
          size: [X - 2 * bt, t, ph],
          at: [0, s * (Y / 2 - bt - t / 2), z],
          color: PLANK,
          strip: 'wood',
          bevel: bev,
        }),
      );
    }
  }
  // Lid: four boards across Y, flush with the top of the face planks.
  const lw = (X - 2 * bt - 3 * gap) / 4;
  for (let i = 0; i < 4; i++)
    out.push(
      box({
        size: [lw, Y - 2 * bt, t],
        at: [-(X / 2 - bt) + lw / 2 + i * (lw + gap), 0, Z - bt - t],
        color: PLANK,
        strip: 'wood',
        bevel: bev,
      }),
    );
  const bat = (size: [number, number, number], at: [number, number, number]): Mesh =>
    box({ size, at, color: BATTEN, strip: 'wood', bevel: bev });
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) out.push(bat([w, w, Z], [(sx * (X - w)) / 2, (sy * (Y - w)) / 2, 0]));
  for (const z of [0, Z - w])
    for (const s of [-1, 1]) {
      out.push(bat([bt, Y - 2 * w, w], [s * (X / 2 - bt / 2), 0, z]));
      out.push(bat([X - 2 * w, bt, w], [0, s * (Y / 2 - bt / 2), z]));
    }
  // Top rim battens around the lid.
  for (const s of [-1, 1]) {
    out.push(bat([X - 2 * w, w, bt], [0, s * (Y / 2 - bt - w / 2), Z - bt]));
  }
  // Diagonal braces on the two long faces (±Y) and the two ends (±X).
  for (const s of [-1, 1]) {
    out.push(
      beam({
        from: [-(X / 2 - w), s * (Y / 2 - bt / 2), w],
        to: [X / 2 - w, s * (Y / 2 - bt / 2), Z - w],
        width: w * 0.8,
        height: bt,
        up: [0, s, 0],
        color: BATTEN,
        strip: 'wood',
      }),
      beam({
        from: [s * (X / 2 - bt / 2), -(Y / 2 - w), w],
        to: [s * (X / 2 - bt / 2), Y / 2 - w, Z - w],
        width: w * 0.8,
        height: bt,
        up: [s, 0, 0],
        color: BATTEN,
        strip: 'wood',
      }),
    );
  }
  if (lod === 0) {
    // Two nail heads where each horizontal batten crosses a corner batten.
    const nail = (at: [number, number, number], axis: 'x' | 'y'): Mesh =>
      cylinder({ radius: 0.005, length: 0.004, segments: 6, color: NAIL, at, axis });
    for (const z of [w / 2, Z - w / 2])
      for (const s of [-1, 1])
        for (const e of [-1, 1]) {
          out.push(nail([s * (X / 2 + 0.001), e * (Y / 2 - w / 2), z], 'x'));
          out.push(nail([e * (X / 2 - w / 2), s * (Y / 2 + 0.001), z], 'y'));
        }
  }
  return merge(out);
}

/** Oak cask: height h, head radius r, bilge radius rb; staves toned one by one with `rng`. */
export function caskMesh(lod: Lod, h: number, r: number, rb: number, rng: Rng): Mesh {
  const staves = [28, 16, 9][lod] ?? 9;
  const rows = [12, 6, 3][lod] ?? 3;
  const rAt = (z: number): number => r + (rb - r) * Math.sin((Math.PI * z) / h);
  const chime = 0.012; // stave wall at the chime
  const croze = 0.025; // head recessed this far below the stave ends
  const side: Vec2[] = Array.from({ length: rows + 1 }, (_, i): Vec2 => {
    const z = (i / rows) * h;
    return [rAt(z), z];
  });
  const profile: Vec2[] =
    lod === 2
      ? side
      : [
          [0, croze],
          [r - chime, croze],
          [r - chime, 0],
          ...side,
          [r - chime, h],
          [r - chime, h - croze],
          [0, h - croze],
        ];
  const body = lathe({
    profile,
    segments: staves,
    caps: lod === 2,
    faceted: true,
    color: OAK,
    strip: 'oak',
    uv: 'metres',
  });
  // Each stave its own tone (oak varies board to board); heads a touch lighter.
  const colors = new Float32Array(body.colors);
  const tone = Array.from({ length: staves }, () => rng.range(0.82, 1.12));
  const triCount = body.indices.length / 3;
  for (let tIdx = 0; tIdx < triCount; tIdx++) {
    let cx = 0;
    let cy = 0;
    let z0 = Number.POSITIVE_INFINITY;
    let z1 = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < 3; k++) {
      const v = body.indices[tIdx * 3 + k] ?? 0;
      cx += body.positions[v * 3] ?? 0;
      cy += body.positions[v * 3 + 1] ?? 0;
      const z = body.positions[v * 3 + 2] ?? 0;
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    // Flat in z: a head or a chime ring, not a stave.
    const head = z1 - z0 < 1e-6;
    const a = (Math.atan2(cy, cx) + 2 * Math.PI) % (2 * Math.PI);
    const k = head ? 1 : (tone[Math.floor((a / (2 * Math.PI)) * staves) % staves] ?? 1);
    const base = head ? HEAD : OAK;
    for (let c = 0; c < 3; c++) {
      const v = body.indices[tIdx * 3 + c] ?? 0;
      colors[v * 3] = base[0] * k;
      colors[v * 3 + 1] = base[1] * k;
      colors[v * 3 + 2] = base[2] * k;
    }
  }
  const out: Mesh[] = [{ ...body, colors }];
  // Iron hoops: two pairs, each a flat band hugging the staves.
  // LOD2 keeps the two inner hoops (the ones that read at distance).
  for (const f of lod === 2 ? [0.24, 0.76] : [0.07, 0.24, 0.76, 0.93]) {
    const z = f * h;
    const hr = Math.max(rAt(z - 0.022), rAt(z + 0.022)) - 0.001;
    const ring: Vec2[] =
      lod === 2
        ? [
            [hr + 0.004, z - 0.022],
            [hr + 0.004, z + 0.022],
          ]
        : [
            [hr - 0.002, z - 0.024],
            [hr + 0.005, z - 0.02],
            [hr + 0.005, z + 0.02],
            [hr - 0.002, z + 0.024],
          ];
    out.push(
      lathe({ profile: ring, segments: staves, faceted: true, color: HOOP, strip: 'iron_rust' }),
    );
  }
  if (lod < 2) {
    // The bung: an oak plug in the bilge stave, facing the viewer (−Y).
    out.push(
      cylinder({
        radius: 0.024,
        length: 0.02,
        segments: lod === 0 ? 10 : 6,
        color: BUNG,
        strip: 'oak',
        at: [0, -(rb + 0.002), h / 2],
        axis: 'y',
      }),
    );
  }
  return merge(out);
}

/** Where the bung sits, in the cask's frame: the wine weeps down from here. */
export const bungAt = (h: number, rb: number): [number, number, number] => [
  0,
  -(rb + 0.004),
  h / 2,
];
