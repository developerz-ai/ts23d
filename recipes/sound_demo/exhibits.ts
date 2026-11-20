// The sound demo's door and crate, built here (not from the parts kit) so each carries its own
// paint, wear and LOD policy: a painted-pine panel door with raised, chamfered fields, a lever
// handle and three butt hinges in a stained frame; and a battened pine crate whose frame survives
// at LOD2 as edge strips. Origins: door = floor at the centre of the opening; crate = base centre.

import { box, cylinder, hex, type Lod, type Mesh, merge } from '@developerz.ai/ts23d';

const PAINT = hex('#2f5a44');
const FIELD = hex('#3a6b52');
const SHADOW = hex('#13261c');
const SCUFF = hex('#5e5a4c');
const MUD = hex('#4a3a28');
const BARE = hex('#c09a68');
const FRAME = hex('#7a5a3c');
const IRON = hex('#2c2b29');
const BRASS = hex('#a8874a');
const PINE = hex('#b48a58');
const BATTEN = hex('#8a6640');
/** Far battens a shade deeper: at LOD2 the frame is flat quads, so value alone carries it. */
const BATTEN_FAR = hex('#5a3e25');
const CORE = hex('#2e2216');

type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
const FACES: readonly Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
/** A decal keeps only its outward face: 2 triangles. */
const only = (face: Face): Face[] => FACES.filter((f) => f !== face);

export const DOOR = { width: 0.6, height: 1.6, thickness: 0.035, gap: 0.003 } as const;
const JAMB = 0.07;
const JAMB_D = 0.12;

/** Jambs and head, stained oak. */
export function doorFrame(lod: Lod): Mesh {
  const { width: w, height: h } = DOOR;
  const out: Mesh[] = [];
  for (const s of [-1, 1])
    out.push(
      box({
        size: [JAMB_D, JAMB, h + JAMB],
        at: [0, (s * (w + JAMB)) / 2, 0],
        color: FRAME,
        strip: 'wood',
        bevel: lod === 0 ? 0.004 : 0,
      }),
    );
  out.push(box({ size: [JAMB_D, w + 2 * JAMB, JAMB], at: [0, 0, h], color: FRAME, strip: 'wood' }));
  return merge(out);
}

/** Hinge heights (m above the floor). */
const HINGES = [0.15, 0.75, 1.35] as const;

/**
 * The leaf in its pivot's space: x ∈ [0, t] (front face +X at x = t), y from the hinge knuckles
 * (y = 0) to the free edge. Four raised, chamfered fields a face at LOD0/1; at LOD2 the fields are
 * flat shadowed quads, so the panelling still reads at distance for 2 triangles each.
 */
export function doorLeaf(lod: Lod): Mesh {
  const { width, height, thickness: t, gap } = DOOR;
  const y0 = 0.006;
  const lw = width - 2 * gap - y0;
  const lh = height - 2 * gap;
  const out: Mesh[] = [
    box({
      size: [t, lw, lh],
      at: [t / 2, y0 + lw / 2, gap],
      color: PAINT,
      strip: 'plain',
      bevel: lod === 0 ? 0.004 : 0,
    }),
  ];
  const m = 0.09; // stile and rail width
  const pw = (lw - 3 * m) / 2;
  const ph = (lh - 3 * m) / 2;
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      const y = y0 + m + c * (pw + m) + pw / 2;
      const z = gap + m + r * (ph + m);
      for (const front of [true, false]) {
        const x = front ? t : 0;
        const dir = front ? 1 : -1;
        if (lod === 2) {
          // Far: the panel as a shadowed quad, so the four-panel pattern holds for 2 triangles.
          out.push(
            box({
              size: [0.002, pw, ph],
              at: [x + dir * 0.001, y, z],
              color: SHADOW,
              strip: 'plain',
              omit: only(front ? 'front' : 'back'),
            }),
          );
          continue;
        }
        // Raised and fielded: a dark sunk margin round each field (the shadow line a moulding
        // casts) and the field 14 mm proud with a bevel all round, a shade lighter than the
        // stiles, so the four panels read from across the room.
        out.push(
          box({
            size: [0.001, pw + 0.03, ph + 0.03],
            at: [x + dir * 0.0005, y, z - 0.015],
            color: SHADOW,
            strip: 'plain',
            omit: only(front ? 'front' : 'back'),
          }),
          box({
            size: [0.016, pw, ph],
            at: [x + dir * 0.006, y, z],
            color: FIELD,
            strip: 'plain',
            bevel: lod === 0 ? 0.007 : 0,
          }),
        );
      }
    }
  if (lod < 2) {
    // Lever handle both faces: a rose plate and a lever toward the hinge side.
    const hy = y0 + lw - 0.06;
    for (const front of [true, false]) {
      const x = front ? t : 0;
      const dir = front ? 1 : -1;
      out.push(
        box({
          size: [0.008, 0.045, 0.16],
          at: [x + dir * 0.003, hy, 0.88],
          color: BRASS,
          strip: 'brass',
        }),
        box({
          size: [0.022, 0.022, 0.022],
          at: [x + dir * 0.014, hy, 0.94],
          color: BRASS,
          strip: 'brass',
        }),
        box({
          size: [0.016, 0.11, 0.018],
          at: [x + dir * 0.03, hy - 0.045, 0.942],
          color: BRASS,
          strip: 'brass',
        }),
      );
    }
    // Worn paint: bare pine where hands push, round the lever on both faces and along the lock
    // edge at hand height; boot scuffs across the bottom rail (decals 1 mm proud).
    for (const front of [true, false]) {
      const x = front ? t + 0.0005 : -0.0005;
      const omit = only(front ? 'front' : 'back');
      out.push(
        box({
          size: [0.001, 0.1, 0.42],
          at: [x, hy - 0.005, 0.74],
          color: BARE,
          strip: 'wood',
          omit,
        }),
        box({
          size: [0.001, lw - 0.06, 0.07],
          at: [x, y0 + lw / 2, gap + 0.012],
          color: SCUFF,
          strip: 'wood',
          omit,
        }),
      );
    }
    out.push(
      box({
        size: [t - 0.01, 0.001, 0.6],
        at: [t / 2, y0 + lw + 0.0005, 0.62],
        color: BARE,
        strip: 'wood',
        omit: only('left'),
      }),
    );
    // Hinge knuckles on the pin line (the leaf half of each butt hinge).
    for (const z of HINGES)
      out.push(
        cylinder({
          radius: 0.008,
          length: 0.1,
          segments: lod === 0 ? 8 : 6,
          color: IRON,
          strip: 'iron',
          at: [0, 0.002, z + 0.05],
        }),
        box({ size: [0.003, 0.05, 0.1], at: [t + 0.0015, 0.027, z], color: IRON, strip: 'iron' }),
      );
  }
  return merge(out);
}

/** Battened crate L × W × H: plank faces over a dark core, edge battens, nail heads (LOD0). */
export function crateMesh(lod: Lod, [L, W, H]: readonly [number, number, number]): Mesh {
  const b = 0.05; // batten width
  const bt = 0.02; // batten thickness: planks sit this far inside the outer box
  const t = 0.018; // plank thickness
  const bat = (size: [number, number, number], at: [number, number, number]): Mesh =>
    box({
      size,
      at,
      color: lod === 2 ? BATTEN_FAR : BATTEN,
      strip: 'wood',
      bevel: lod === 0 ? 0.003 : 0,
    });
  const corners: Mesh[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      corners.push(bat([b, b, H], [(sx * (L - b)) / 2, (sy * (W - b)) / 2, 0]));
  // Damp and mud splashed up the lower boards of every face (decals 1 mm proud).
  const mud: Mesh[] = [];
  for (const s of [-1, 1]) {
    const band = (size: [number, number, number], at: [number, number, number], face: Face) =>
      mud.push(box({ size, at, color: MUD, strip: 'wood', omit: only(face) }));
    band([0.001, W - 2 * b, 0.14], [s * (L / 2 - bt + 0.0005), 0, 0], s > 0 ? 'front' : 'back');
    band([L - 2 * b, 0.001, 0.14], [0, s * (W / 2 - bt + 0.0005), 0], s > 0 ? 'left' : 'right');
  }
  // LOD2: the plank box, its four corner battens, and top and bottom battens as flat quads a
  // shade darker, so the frame still reads.
  if (lod === 2) {
    const strips: Mesh[] = [];
    for (const z of [0, H - b])
      for (const s of [-1, 1]) {
        strips.push(
          box({
            size: [0.002, W - 2 * b, b],
            at: [s * (L / 2 - bt + 0.001), 0, z],
            color: BATTEN_FAR,
            strip: 'wood',
            omit: only(s > 0 ? 'front' : 'back'),
          }),
          box({
            size: [L - 2 * b, 0.002, b],
            at: [0, s * (W / 2 - bt + 0.001), z],
            color: BATTEN_FAR,
            strip: 'wood',
            omit: only(s > 0 ? 'left' : 'right'),
          }),
        );
      }
    return merge([
      box({ size: [L - 2 * bt, W - 2 * bt, H], color: PINE, strip: 'wood', omit: ['bottom'] }),
      ...corners,
      ...strips,
    ]);
  }
  const out: Mesh[] = [
    box({ size: [L - 2 * (bt + t), W - 2 * (bt + t), H - t], color: CORE, strip: 'wood' }),
    ...corners,
    ...mud,
  ];
  // Plank faces: three a side, 4 mm seams over the dark core.
  const ph = (H - t - 2 * 0.004) / 3;
  for (let i = 0; i < 3; i++) {
    const z = i * (ph + 0.004);
    for (const s of [-1, 1])
      out.push(
        box({
          size: [t, W - 2 * b, ph],
          at: [s * (L / 2 - bt - t / 2), 0, z],
          color: PINE,
          strip: 'wood',
        }),
        box({
          size: [L - 2 * b, t, ph],
          at: [0, s * (W / 2 - bt - t / 2), z],
          color: PINE,
          strip: 'wood',
        }),
      );
  }
  // Lid: three boards across the full top.
  const lw = (L - 2 * 0.004) / 3;
  for (let i = 0; i < 3; i++)
    out.push(
      box({
        size: [lw, W - 2 * bt, t],
        at: [-L / 2 + lw / 2 + i * (lw + 0.004), 0, H - t],
        color: PINE,
        strip: 'wood',
      }),
    );
  // Top and bottom battens on every face.
  for (const z of [0, H - t - b])
    for (const s of [-1, 1]) {
      out.push(bat([bt, W - 2 * b, b], [s * (L / 2 - bt / 2), 0, z]));
      out.push(bat([L - 2 * b, bt, b], [0, s * (W / 2 - bt / 2), z]));
    }
  if (lod === 0)
    for (const z of [b / 2, H - t - b / 2])
      for (const s of [-1, 1])
        for (const e of [-1, 1]) {
          const nail = (at: [number, number, number], axis: 'x' | 'y'): Mesh =>
            cylinder({ radius: 0.005, length: 0.004, segments: 4, color: IRON, at, axis });
          out.push(nail([s * (L / 2 + 0.001), e * (W / 2 - b - 0.03), z], 'x'));
          out.push(nail([e * (L / 2 - b - 0.03), s * (W / 2 + 0.001), z], 'y'));
        }
  return merge(out);
}
