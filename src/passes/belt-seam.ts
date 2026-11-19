// Whether a track belt LOOKS the same one pitch on. The run clip puts every link in its
// neighbour's place and starts again (belt-run.ts) without moving its paint, so a vertex and its
// twin must agree in colour and UV, or the belt's weathering jumps at every wrap. A twin is the
// nearest rest vertex, which on a UV seam is one of several on the same spot with the same normal:
// the one nearest in look is the one compared.

import type { VertexGrid } from './belt-bodies.ts';

/** What the look of a belt mesh is read from. */
export interface BeltLook {
  readonly positions: ArrayLike<number>;
  readonly normals: ArrayLike<number>;
  readonly colors: ArrayLike<number>;
  readonly uvs: ArrayLike<number>;
}

/** The most a vertex may differ from its twin: per colour channel (linear) and in U or V. */
export interface SeamLimits {
  readonly colour: number;
  readonly uv: number;
}

export interface BeltSeam {
  /** Vertices over a limit. */
  readonly off: number;
  /** Worst colour-channel and UV difference between a vertex and its twin. */
  readonly colour: number;
  readonly uv: number;
}

/**
 * Compares every vertex of `mesh` with its twin (`twins`, −1 = none: skipped). `grid` holds the
 * mesh's rest positions; rest vertices within `reach` of the twin that face its way stand for it.
 */
export function beltSeam(
  mesh: BeltLook,
  twins: Int32Array,
  grid: VertexGrid,
  reach: number,
  limits: SeamLimits,
): BeltSeam {
  const { positions: p, normals: n, colors, uvs } = mesh;
  const width = twins.length > 0 ? Math.round(colors.length / twins.length) : 0;
  let off = 0;
  let worstColour = 0;
  let worstUv = 0;
  for (let v = 0; v < twins.length; v++) {
    const twin = twins[v] ?? -1;
    if (twin < 0) continue;
    let colour = Infinity;
    let uv = Infinity;
    grid.near(p[twin * 3] ?? 0, p[twin * 3 + 1] ?? 0, p[twin * 3 + 2] ?? 0, reach, (t) => {
      let facing = 0;
      for (let k = 0; k < 3; k++) facing += (n[t * 3 + k] ?? 0) * (n[twin * 3 + k] ?? 0);
      if (facing < 0.999) return;
      let c = 0;
      for (let k = 0; k < width; k++)
        c = Math.max(c, Math.abs((colors[v * width + k] ?? 0) - (colors[t * width + k] ?? 0)));
      const u = Math.max(
        Math.abs((uvs[v * 2] ?? 0) - (uvs[t * 2] ?? 0)),
        Math.abs((uvs[v * 2 + 1] ?? 0) - (uvs[t * 2 + 1] ?? 0)),
      );
      const better =
        Math.max(c / limits.colour, u / limits.uv) <
        Math.max(colour / limits.colour, uv / limits.uv);
      if (better) [colour, uv] = [c, u];
    });
    if (colour > limits.colour || uv > limits.uv) off++;
    worstColour = Math.max(worstColour, colour);
    worstUv = Math.max(worstUv, uv);
  }
  return { off, colour: worstColour, uv: worstUv };
}
