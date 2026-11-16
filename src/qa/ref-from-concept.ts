// ref.json for an invented asset (no photos exist): the concept turnaround the `image` task drew
// (front | side | back side by side on a plain background) becomes the reference the ref gate
// holds the model to. Panels are found as runs of columns holding object pixels (background = the
// corner colour within a tolerance), the object segmented by the same rule into alpha, each panel
// fingerprinted (ref-fingerprint.ts). front and side map to ref views; the back has no ref view
// and only feeds texture projection. Cameras stay null: a turnaround is drawn orthographic.

import { Ts23dError } from '../core/index.ts';
import { fingerprint } from './ref-fingerprint.ts';
import { encodeRefMask, type RefFile, type RefSource, type RefView } from './ref-gate.ts';

const TOL = 24;

export interface ConceptPanel {
  readonly x0: number;
  readonly x1: number;
  /** RGBA, alpha = object (segmented against the corner colour). */
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Split a turnaround into its object panels, left to right. */
export function conceptPanels(rgba: Uint8Array, width: number, height: number): ConceptPanel[] {
  const bg = [rgba[0] ?? 255, rgba[1] ?? 255, rgba[2] ?? 255];
  const isObj = (i: number): boolean =>
    [0, 1, 2].some((c) => Math.abs((rgba[i * 4 + c] ?? 0) - (bg[c] ?? 0)) > TOL);
  const used = Array.from({ length: width }, (_, x) => {
    for (let y = 0; y < height; y++) if (isObj(y * width + x)) return true;
    return false;
  });
  const runs: [number, number][] = [];
  for (let x = 0; x < width; x++)
    if (used[x] && !used[x - 1]) runs.push([x, x]);
    else if (used[x]) {
      const r = runs[runs.length - 1];
      if (r) r[1] = x;
    }
  // Specks (a stray stroke) are not panels: keep runs ≥ 4 % of the width.
  return runs
    .filter(([a, b]) => b - a + 1 >= width * 0.04)
    .map(([x0, x1]) => {
      const w = x1 - x0 + 1;
      const out = new Uint8Array(w * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < w; x++) {
          const i = y * width + x0 + x;
          out.set(
            [rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0, isObj(i) ? 255 : 0],
            (y * w + x) * 4,
          );
        }
      return { x0, x1, rgba: out, width: w, height };
    });
}

/** The turnaround (front, side, back) as ref.json views; `source` names the concept output. */
export function refFromConcept(
  rgba: Uint8Array,
  width: number,
  height: number,
  source: RefSource,
): RefFile {
  const panels = conceptPanels(rgba, width, height);
  if (panels.length < 2)
    throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
      cause: `concept turnaround: ${panels.length} panel(s) found, want front | side | back`,
      fix: 'regenerate the turnaround with the views side by side on a plain background (concept.ts TURNAROUND)',
    });
  const view = (p: ConceptPanel): RefView => {
    const f = fingerprint(p.rgba, p.width, p.height);
    return {
      mask: encodeRefMask(f.mask128),
      lab: f.lab,
      spectrum: f.spectrum,
      edges: f.edges,
      camera: null,
      source,
    };
  };
  const [front, side] = panels;
  return {
    views: { ...(front ? { front: view(front) } : {}), ...(side ? { side: view(side) } : {}) },
  };
}
