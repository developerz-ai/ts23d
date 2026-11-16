// Scalp coverage (defect D57): under hair the scalp must read as hair, never as a bare skin patch.
// Strand cards are cut out — the cap under them shows through every gap — so the skin part's
// vertices deeper than `depth` inside the hairline must carry a hair-dark albedo. A vertex is
// skin-like when its luminance is above the geometric mean of the hair's and the skin's (AO and
// the painter's warm/cool lift move a colour by < 2×; skin and dark hair differ by ≈ 10×).
// A recipe check: every LOD, fails the build with T3D_QA_CHECK.

import type { Check, CheckFinding, Field, Mesh, Vec3 } from '@developerz.ai/ts23d';

export interface ScalpCover {
  /** The skin part the cap is meshed in (`head`). */
  readonly part: string;
  /** The hairline: negative where hair grows. */
  readonly line: Field;
  /** Scalp paint (the hair's root colour) and the bare skin colour, linear RGB. */
  readonly hair: Vec3;
  readonly skin: Vec3;
  /** Only vertices this far inside the line count (the soft edge is skin by design). Default 4 mm. */
  readonly depth?: number;
  /** Share of scalp vertices allowed to be skin-like (stray specks). Default 0.5 %. */
  readonly share?: number;
}

const lum = (c: readonly number[]): number =>
  0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);

/** Scalp vertices (inside the line by `depth`) and how many of them read as skin. */
export function scalpCover(m: Mesh, at: Vec3, o: ScalpCover): { scalp: number; bare: number } {
  const cut = Math.sqrt(Math.max(1e-6, lum(o.hair)) * lum(o.skin));
  const depth = o.depth ?? 0.004;
  let scalp = 0;
  let bare = 0;
  const p: [number, number, number] = [0, 0, 0];
  for (let i = 0; i * 3 < m.positions.length; i++) {
    p[0] = (m.positions[i * 3] ?? 0) + at[0];
    p[1] = (m.positions[i * 3 + 1] ?? 0) + at[1];
    p[2] = (m.positions[i * 3 + 2] ?? 0) + at[2];
    if (o.line(p) > -depth) continue;
    scalp++;
    const c = [m.colors[i * 3] ?? 0, m.colors[i * 3 + 1] ?? 0, m.colors[i * 3 + 2] ?? 0];
    if (lum(c) > cut) bare++;
  }
  return { scalp, bare };
}

export function scalpCoverCheck(o: ScalpCover): Check {
  return (asset) => {
    const part = asset.parts.find((x) => x.name === o.part);
    if (!part?.mesh) return [];
    const { scalp, bare } = scalpCover(part.mesh, part.at, o);
    const share = o.share ?? 0.005;
    if (scalp === 0 || bare / scalp <= share) return [];
    const f: CheckFinding = {
      part: o.part,
      message: `bare scalp: ${bare} of ${scalp} vertices inside the hairline read as skin (${((100 * bare) / scalp).toFixed(1)} % > ${(100 * share).toFixed(1)} %), so skin shows through the hair cards`,
      fix: 'paint the scalp hair-coloured under the hairline (BustRecipe.scalp → skinMesh `scalp`), or move the hairline the cards grow from',
    };
    return [f];
  };
}
