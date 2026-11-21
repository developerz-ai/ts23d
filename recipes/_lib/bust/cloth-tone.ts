// Garment meshes after the mesher: on their cloth strip at true scale, and the bust's sawn section
// in the colours of the cloth it cuts through.
//
// `onCloth`: the mesher's UVs are planar along each vertex's dominant normal axis, so a triangle
// whose corners chose different axes (a band down every sleeve, round every shoulder) spans
// metres of strip across a centimetre of cloth. The renderer and any engine pick that triangle's
// mip by its footprint: the coarse level where the sheet's rows bleed into each other, a dark grey
// patch on the sleeve, and a staircase line along the axis switch (D578). Each triangle instead
// takes the level projection plane facing it, its corners split only where neighbours disagree
// (../face/skin-strip.ts `onFineStrip`), so the weave keeps its true scale and direction.
//
// `sectionColours`: the plug behind the arm cut takes the colour of the garment shell nearest each
// of its vertices, in shade: a flat cut through layered cloth. As a dark neutral it read as a hole
// in the texture at every sleeve (D579).

import {
  DEFAULT_SHEET,
  type Mesh,
  mappedOnto,
  type SculptEdit,
  type StripId,
  sculptField,
} from '@developerz.ai/ts23d';
import { onFineStrip } from '../face/skin-strip.ts';
import type { V } from './kit.ts';

/** World metres one band of `strip` covers along V (its painted scale). */
export const stripRow = (strip: StripId): number => DEFAULT_SHEET.strips[strip]?.scaleMetres ?? 1;

/** `m` on `strip` at true scale, one projection plane per triangle. */
export function onCloth(m: Mesh, strip: StripId): Mesh {
  return mappedOnto(onFineStrip(m, strip, stripRow(strip)), strip);
}

/** A garment the section cuts through: its solid edits and the colour they default to. */
export interface SectionSource {
  readonly edits: readonly SculptEdit[];
  readonly color: V;
}

/** How dark a sawn face reads against the cloth's outside (the faces are in the bust's shadow). */
export const SECTION_SHADE = 0.72;

/** `m` (the sawn plug) recoloured, each vertex the colour of the nearest garment shell × `shade`. */
export function sectionColours(
  m: Mesh,
  sources: readonly SectionSource[],
  shade = SECTION_SHADE,
): Mesh {
  const fields = sources.map((s) =>
    sculptField(
      s.edits.filter((e) => !('op' in e && e.op === 'paint')),
      { color: s.color, mirror: 'y' },
    ),
  );
  if (fields.length === 0) return m;
  const colors = new Float32Array(m.colors);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const p: V = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    let best = Number.POSITIVE_INFINITY;
    let colour: V | null = null;
    for (const f of fields) {
      const d = Math.abs(f.field(p));
      if (d < best) {
        best = d;
        colour = f.colorAt(p);
      }
    }
    if (colour) colors.set([colour[0] * shade, colour[1] * shade, colour[2] * shade], i * 3);
  }
  return { ...m, colors };
}
