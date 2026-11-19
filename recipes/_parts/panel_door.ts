// Panelled door in its frame: jambs + head (`frame`), and a `leaf` with raised panels, a lever
// handle each side and hinge knuckles, swinging 90° (one way, to −X) about its hinge edge at −Y.
// Origin = floor, centre of the opening; front face +X. Composes hinge and door_handle.
// Real: 826 × 2040 × 40 mm leaf in a ~0.9 m opening; hinges at 150 mm / middle / 250 mm.

import { box, defineMaterial, definePart, type Mesh, merge, place } from '@developerz.ai/ts23d';
import { door_handle } from './door_handle.ts';
import { hinge } from './hinge.ts';
import { DOOR_GREEN, NAT } from './shape.ts';

/**
 * Painted joinery (vertex colour = paint). The library's `wood_painted` is weathered
 * boarding: 14 cm planks with a third of the film chipped through in blotches, which on a door
 * leaf reads as camouflage. A kept door is one smooth film over joined timber: the grain only
 * telegraphs through it, and the paint wears through only along the arrises.
 */
export const JOINERY_PAINT = defineMaterial({
  id: 'joinery_paint',
  kind: 'planks',
  scaleMetres: 0.6,
  roughness: 0.84,
  albedo: '#ededed',
  albedo2: '#a08c74',
  params: {
    width: 0.6,
    length: 2.4,
    gap: 0.0005,
    depth: 0.0003,
    knots: 0,
    paint: 1,
    paintRough: 0.45,
    chips: 0.02,
    grain: 0.3,
    film: 0.0003,
  },
  description: 'Painted joinery (doors, frames): one smooth film, grain faintly through it.',
  sources: ['https://physicallybased.info (paint film roughness)'],
});

export const panel_door = definePart({
  name: 'panel_door',
  description: 'panelled door and frame; the leaf swings about its −Y hinge edge',
  tags: ['building', 'door', 'moving'],
  params: { width: 0.86, height: 2.04, thickness: 0.04, rows: 3, swing: true },
  schema: {
    width: { min: 0.5, max: 1.5, unit: 'm', doc: 'clear opening' },
    height: { min: 1.6, max: 3, unit: 'm', doc: 'clear opening' },
    thickness: { min: 0.025, max: 0.08, unit: 'm', doc: 'leaf thickness' },
    rows: { min: 1, max: 4, unit: 'count', doc: 'panel rows (two panels per row)' },
    swing: { doc: 'bake a 90° one-way sway on the leaf' },
  },
  build(b, p) {
    const j = 0.07;
    const jd = 0.12;
    const gap = 0.003;
    const bev = b.lod === 0 ? 0.004 : 0;
    const wood = (
      size: [number, number, number],
      at: [number, number, number],
      bevel = bev,
      color = NAT,
    ): Mesh => box({ size, at, color, strip: JOINERY_PAINT, bevel });
    const frame: Mesh[] = [
      wood([jd, j, p.height + j], [0, -(p.width + j) / 2, 0]),
      wood([jd, j, p.height + j], [0, (p.width + j) / 2, 0]),
      wood([jd, p.width, j], [0, 0, p.height], 0),
    ];
    // Leaf, in its pivot's space: x ∈ [0, t], y from the knuckles to the free edge.
    const t = p.thickness;
    const y0 = 0.006;
    const lw = p.width - 2 * gap - y0;
    const lh = p.height - 2 * gap;
    const leaf: Mesh[] = [wood([t, lw, lh], [t / 2, y0 + lw / 2, gap], bev, DOOR_GREEN)];
    if (b.lod < 2) {
      const m = 0.12;
      const pw = (lw - 3 * m) / 2;
      const ph = (lh - (p.rows + 1) * m) / p.rows;
      for (let r = 0; r < p.rows; r++)
        for (let c = 0; c < 2; c++)
          // Raised fields 12 mm proud each face, chamfered so they catch the light.
          for (const x of [t - 0.003, -0.012 + 0.003])
            leaf.push(
              wood(
                [0.012, pw, ph],
                [x + 0.006, y0 + m + c * (pw + m) + pw / 2, gap + m + r * (ph + m)],
                b.lod === 0 ? 0.005 : 0,
                DOOR_GREEN,
              ),
            );
      const handle = b.mesh(door_handle);
      const hy = y0 + lw - 0.065;
      leaf.push(
        place(handle, { at: [t, hy, 1.0] }),
        place(handle, { at: [0, hy, 1.0], pitch: Math.PI }),
      );
    }
    for (const z of [0.15, p.height / 2 - 0.05, p.height - 0.25]) {
      const [fixed, moving] = b.pieces(hinge, { swing: false });
      if (fixed?.mesh) frame.push(place(fixed.mesh, { at: [-t / 2, -p.width / 2 + gap, z] }));
      if (moving?.mesh) leaf.push(place(moving.mesh, { at: [0, 0, z] }));
    }
    return [
      { name: 'frame', mesh: merge(frame) },
      {
        name: 'leaf',
        mesh: merge(leaf),
        at: [-t / 2, -p.width / 2 + gap, 0],
        // Hinged in its frame by design: the leaf turns away from the hinge jamb (every point
        // keeps its ≥ 6 mm distance from the pin), but the jamb sits behind the pivot inside the
        // clashes gate's conservative swept sector.
        clearOf: ['frame'],
        ...(p.swing
          ? {
              motion: {
                kind: 'sway',
                axis: [0, 0, 1],
                degrees: 90,
                hz: 0.25,
                oneWay: true,
              } as const,
            }
          : {}),
      },
    ];
  },
});
