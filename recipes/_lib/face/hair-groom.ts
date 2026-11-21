// Opt-in Blender groom for the busts' card hair (ADR 014): our code owns the scalp, hairline,
// parting and flow — guides are traced on the bust's root surface by the card style's comb and
// one of its layers, shaped by the groom op list (comb, puff, cut… in TypeScript) — and the
// `groom` tool task (Blender hair curves: children, clump, curl, frizz, then lock cards by
// Geometry Nodes) returns the cards; groomCards maps them into the `hair_clumps` strip and
// validates them (roots on the scalp, nothing through the head, triangle cap). Layers named in
// `keep` (beard, moustache, hairline wisps) stay today's cards in the same `hair` part (one draw).
// LOD0 only; LOD1/2 and a cache miss build exactly as `cardHair` (the CPU tier), LOD2 from the
// style as the recipe built it for that LOD.

import {
  applyGroomOps,
  type BuildContext,
  checkGroomOps,
  childrenFor,
  collisionMesh,
  type GroomField,
  type GroomOp,
  groomCards,
  groomJson,
  merge,
  type NeuralRequest,
  providedNeural,
  scalpCards,
  scalpGlb,
  scalpGuides,
  sha256Hex,
  Ts23dError,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type CardHairStyle, cardHair } from './hair-cards.ts';

export interface GroomStyle {
  /** The card layer whose region, length, lift, bend, droop and hug the guides copy. */
  readonly from: string;
  /** Card layers still emitted as cards beside the groom (beard, moustache, edge wisps). */
  readonly keep?: readonly string[];
  /** Guides per m² of scalp. */
  readonly guides: number;
  /** Segments per guide (default 8). */
  readonly segments?: number;
  readonly ops: readonly GroomOp[];
  readonly zones?: Readonly<Record<string, GroomField>>;
  /** Child strands per guide (a `density` op overrides). */
  readonly children: number;
  /** Cards (locks) and points along each. */
  readonly cards: number;
  readonly points: number;
  /** Card width root → tip, metres, and V depth (share of the half-width). */
  readonly width: readonly [number, number];
  readonly fold: number;
  /** Flyaway strands as thin flat cards, and their width (default 4 mm). */
  readonly wisps?: number;
  readonly wispWidth?: number;
  readonly maxTriangles: number;
  readonly tone?: readonly [number, number];
  readonly tint?: Vec3;
  readonly seed?: number;
  /** Meshing cell of the collision body, metres (default 6 mm). */
  readonly collisionCell?: number;
}

/** The groom request + input bytes for a style (exported for tests and `t3d neural run`). */
export function groomJob(style: CardHairStyle, g: GroomStyle, ctx: BuildContext) {
  checkGroomOps(g.ops, g.zones);
  const layer = style.layers.find((l) => l.name === g.from);
  if (!layer)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `groom: card layer '${g.from}' is not in the style`,
      fix: `name one of: ${style.layers.map((l) => l.name).join(', ')}`,
    });
  const { guides, surface, area } = scalpGuides({
    field: style.field,
    bounds: style.bounds,
    cell: style.cell,
    comb: style.comb,
    ...(style.collide ? { collide: style.collide } : {}),
    layer: {
      region: layer.region,
      density: g.guides,
      length: layer.length,
      ...(layer.lift !== undefined ? { lift: layer.lift } : {}),
      ...(layer.bend !== undefined ? { bend: layer.bend } : {}),
      ...(layer.droop !== undefined ? { droop: layer.droop } : {}),
      ...(layer.hug !== undefined ? { hug: layer.hug } : {}),
    },
    segments: g.segments ?? 8,
    rng: ctx.rng.fork('groom'),
  });
  const zones = g.zones ?? {};
  const shaped = applyGroomOps(guides, g.ops, { zones, field: style.field, stage: 'guide' });
  const glb = scalpGlb(surface);
  // The solid long hair falls onto (head, shoulders), down to the longest guide below the box.
  const [lo, hi] = style.bounds;
  const drop = Math.max(0, ...shaped.map((x) => lo[2] - Math.min(...x.points.map((q) => q[2]))));
  const body = style.collide
    ? scalpGlb(
        collisionMesh(
          style.collide,
          [
            [lo[0] - 0.04, -0.3, lo[2] - drop - 0.03],
            [hi[0] + 0.02, 0.3, hi[2]],
          ],
          g.collisionCell ?? 0.006,
        ),
      )
    : undefined;
  const card = {
    width: g.width,
    fold: g.fold,
    ...(g.wisps ? { wisps: g.wisps } : {}),
    ...(g.wispWidth ? { wispWidth: g.wispWidth } : {}),
  };
  const json = groomJson(shaped, g.ops, card, zones);
  const ref = (b: Uint8Array, mime: string) => ({ sha256: sha256Hex(b), mime });
  const request: NeuralRequest<'groom'> = {
    seed: g.seed ?? 0,
    mesh: ref(glb, 'model/gltf-binary'),
    ...(body ? { body: ref(body, 'model/gltf-binary') } : {}),
    guides: ref(json, 'application/json'),
    children: childrenFor(g.ops, shaped.length, area, g.children),
    cards: g.cards,
    points: g.points,
    maxTriangles: g.maxTriangles,
  };
  return {
    request,
    inputs: new Map([
      [request.mesh.sha256, glb],
      [request.guides.sha256, json],
      ...(body && request.body ? [[request.body.sha256, body] as const] : []),
    ]),
  };
}

/** `hair` from the cached Blender groom (+ `keep` layers as cards), or `cardHair` on a miss. */
export function groomHair(
  ctx: BuildContext,
  recipe: string,
  style: CardHairStyle,
  g: GroomStyle,
  part = 'hair',
): 'groom' | 'cards' {
  if (ctx.lod > 0) {
    // The style is the recipe's own for this LOD (its style function takes the LOD): the far
    // LOD's cards are emitted as given, not thinned again by `farStyle` (D585).
    cardHair(ctx, style, part, { far: (s) => s });
    return 'cards';
  }
  const { request, inputs } = groomJob(style, g, ctx);
  const hit = providedNeural(recipe).get('groom', request, { inputs });
  if (hit.fallback) {
    cardHair(ctx, style, part);
    return 'cards';
  }
  const glb = hit.result.outputs.find((o) => o.mime === 'model/gltf-binary')?.bytes;
  const [lo, hi] = style.bounds;
  const groom = groomCards(glb ?? new Uint8Array(), {
    color: style.color,
    ...(g.tone ? { tone: g.tone } : {}),
    ...(g.tint ? { tint: g.tint } : {}),
    scalp: style.field,
    ...(style.collide ? { collide: style.collide } : {}),
    maxTriangles: g.maxTriangles,
    centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    rng: ctx.rng.fork('groom-cards'),
  }).mesh;
  const keep = new Set(g.keep ?? []);
  const rest = scalpCards({
    ...style,
    layers: style.layers.filter((l) => keep.has(l.name)),
    lod: ctx.lod,
    rng: ctx.rng.fork(part),
  });
  ctx.part(part, rest ? merge([groom, rest]) : groom, { surface: 'cutout' });
  return 'groom';
}
