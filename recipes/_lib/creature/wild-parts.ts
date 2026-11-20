// Geometry a wild animal carries beyond the creature kind's sculpt (wolf, fox, bear share it):
// whiskers as thin tapered tubes from the whisker pads and over the brows, a second, denser layer
// of short coat cards over the regions the kind's sparse guard hair leaves as painted skin, and a
// healed nick pinched into one ear's rear rim. Cards are bound with the kind's own skinning
// (`info.rig.pieces`: rigid per card at its root), so the gait and deform gates see one animal.

import {
  type CardZone,
  CREATURE_MATERIALS,
  type CreatureInfo,
  chainSeed,
  defineMaterial,
  dmath,
  furChains,
  hairCards,
  hairFlow,
  type Lod,
  type Mesh,
  MeshBuilder,
  type Rng,
  strandCells,
  stripRect,
  type Vec3,
} from '@developerz.ai/ts23d';

type Head = CreatureInfo['head'];
type Frame = CreatureInfo['bones']['head'];

/** Head-local point (+X to the nose, origin at the atlas) → the pitched head part's frame. */
export function pitched(h: Frame, p: Vec3): Vec3 {
  const c = dmath.cos(h.pitch);
  const s = dmath.sin(h.pitch);
  return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
}

/** The pitched head part's frame → head-local. */
export function unpitched(h: Frame, p: Vec3): Vec3 {
  const c = dmath.cos(h.pitch);
  const s = dmath.sin(h.pitch);
  return [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
}

/** Two meshes as one, skin included when both carry it (cards onto the kind's own cards). */
export function joinSkinned(a: Mesh, b: Mesh): Mesh {
  const na = a.positions.length / 3;
  const cat = (x: Float32Array, y: Float32Array): Float32Array => {
    const out = new Float32Array(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  for (let i = 0; i < b.indices.length; i++)
    indices[a.indices.length + i] = (b.indices[i] ?? 0) + na;
  const skinned = a.joints && a.weights && b.joints && b.weights;
  const joints = new Uint16Array(skinned ? (a.joints?.length ?? 0) + (b.joints?.length ?? 0) : 0);
  if (skinned) {
    joints.set(a.joints ?? []);
    joints.set(b.joints ?? [], a.joints?.length ?? 0);
  }
  return {
    positions: cat(a.positions, b.positions),
    normals: cat(a.normals, b.normals),
    uvs: cat(a.uvs, b.uvs),
    colors: cat(a.colors, b.colors),
    indices,
    ...(skinned && a.weights && b.weights ? { joints, weights: cat(a.weights, b.weights) } : {}),
  };
}

/** Each vertex's connected piece (the lowest vertex index in it). */
function pieces(m: Mesh): Int32Array {
  const parent = new Int32Array(m.positions.length / 3).map((_, i) => i);
  const find = (v: number): number => {
    let r = v;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    while ((parent[v] ?? v) !== r) {
      const next = parent[v] ?? r;
      parent[v] = r;
      v = next;
    }
    return r;
  };
  for (let t = 0; t < m.indices.length; t += 3) {
    for (const k of [1, 2]) {
      // Re-find the first corner's root each time: the previous union may have moved it.
      const a = find(m.indices[t] ?? 0);
      const b = find(m.indices[t + k] ?? 0);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  return parent.map((_, v) => find(v));
}

export interface CoatOptions {
  /** Cards per m² at LOD0 where `where` is 1 (LOD1 grows a quarter, 1.5× wider). */
  readonly density: number;
  /** Card length, metres. */
  readonly length: number | ((p: Vec3, n: Vec3) => number);
  /** Card width at the root, metres. */
  readonly width: number;
  /** 0..1 share of the density at a body point (0 = bare: the kind's own cards cover it). */
  readonly where: (p: Vec3, n: Vec3) => number;
  /** Root → tip tone (default [0.9, 1.22]: shadowed roots, lit tips). */
  readonly tone?: readonly [number, number];
  /** A card's colour from its root point and the skin colour there (frost on the topline's
   *  hair, a pale saddle); default the skin's colour. Short cards and guard locks both. */
  readonly color?: (p: Vec3, skin: Vec3) => Vec3;
  /**
   * Clumped guard locks over the same region (LOD0/1): longer cards sharing a tip, curved across
   * their width, lit at the tip. They are what breaks the light between the short cards.
   */
  readonly guard?: {
    readonly density: number;
    readonly length: number | ((p: Vec3, n: Vec3) => number);
    readonly width: number;
    readonly tone?: readonly [number, number];
  };
  /**
   * LOD2: a few big locks where the outline needs its fringe (mane, back, breeches). The far mesh
   * has no other cards; without this the animal's edge goes smooth at the switch.
   */
  readonly far?: {
    readonly density: number;
    readonly length: number;
    readonly width: number;
    readonly where: (p: Vec3, n: Vec3) => number;
  };
}

/** A dense short layer of coat cards over the painted body (world space), bound card by card
 *  with the kind's own skinning (`info.rig.pieces`: rigid per card at its root). */
export function coatCards(
  body: Mesh,
  info: CreatureInfo,
  lod: Lod,
  rng: Rng,
  o: CoatOptions,
): Mesh | null {
  const far = lod === 2 ? o.far : undefined;
  if (lod === 2 && !far) return null;
  defineMaterial(CREATURE_MATERIALS.fur_clumps);
  const k = lod === 0 ? 1 : 0.25;
  const zone: CardZone = {
    name: 'coat',
    density: far
      ? (p, n) => far.density * far.where(p, n)
      : (p, n) => o.density * k * o.where(p, n),
    length: far ? far.length : o.length,
    width: far ? far.width : o.width * (lod === 0 ? 1 : 1.5),
    // Lying close: the layer thickens the coat's surface, it must not bristle.
    lift: 0.24,
    bend: 0.65,
    droop: 0.06,
    roll: 0.5,
    cells: strandCells('fur_clumps', far ? 'guard' : 'fur'),
    tone: o.tone ?? [0.9, 1.22],
    sink: 0.002,
    ...(o.color && !far ? { color: o.color } : {}),
  };
  const flow = hairFlow(body, chainSeed(furChains(info.bones), { gravity: 0.35 }));
  const grow = (z: CardZone, segments: number): Mesh | null => {
    const out = hairCards({
      surface: body,
      flow,
      zones: [z],
      rng: rng.fork(z.name),
      segments,
      maxCards: 20000,
    });
    return out.roots.length > 0 ? out.mesh : null;
  };
  const g = far ? undefined : o.guard;
  const guard = g
    ? grow(
        {
          name: 'coat-guard',
          density: (p, n) => g.density * k * o.where(p, n),
          length: g.length,
          width: g.width * (lod === 0 ? 1 : 1.5),
          lift: 0.3,
          bend: 0.6,
          droop: 0.12,
          roll: 0.7,
          clump: 4,
          fold: lod === 0 ? 0.6 : 0,
          cells: strandCells('fur_clumps', 'guard'),
          tone: g.tone ?? [0.8, 1.4],
          sink: 0.003,
          ...(o.color ? { color: o.color } : {}),
        },
        lod === 0 ? 3 : 2,
      )
    : null;
  const short = grow(zone, far ? 1 : 2);
  const all = short && guard ? joinSkinned(short, guard) : (short ?? guard);
  return all ? info.rig.pieces(all, 'body', [0, 0, 0]) : null;
}

/**
 * Drop every card (connected piece) with a vertex outside the box |y| ≤ `y`, z ≤ `z`: the coat
 * may not grow the animal past its sourced width and height, whatever a stray lock does.
 * A skinned mesh keeps its joints and weights.
 */
export function withinBox(cards: Mesh, box: { readonly y?: number; readonly z?: number }): Mesh {
  const ids = pieces(cards);
  const n = ids.length;
  const dropped = new Set<number>();
  const P = cards.positions;
  for (let v = 0; v < n; v++)
    if (
      Math.abs(P[v * 3 + 1] ?? 0) > (box.y ?? Infinity) ||
      (P[v * 3 + 2] ?? 0) > (box.z ?? Infinity)
    )
      dropped.add(ids[v] ?? v);
  if (dropped.size === 0) return cards;
  const remap = new Int32Array(n).fill(-1);
  const keep: number[] = [];
  for (let v = 0; v < n; v++)
    if (!dropped.has(ids[v] ?? v)) {
      remap[v] = keep.length;
      keep.push(v);
    }
  const take = (src: Float32Array, k: number): Float32Array => {
    const out = new Float32Array(keep.length * k);
    keep.forEach((v, i) => {
      for (let c = 0; c < k; c++) out[i * k + c] = src[v * k + c] ?? 0;
    });
    return out;
  };
  const indices: number[] = [];
  for (let t = 0; t < cards.indices.length; t += 3) {
    const a = remap[cards.indices[t] ?? 0] ?? -1;
    if (a < 0) continue;
    indices.push(a, remap[cards.indices[t + 1] ?? 0] ?? 0, remap[cards.indices[t + 2] ?? 0] ?? 0);
  }
  const joints = new Uint16Array(cards.joints ? keep.length * 4 : 0);
  if (cards.joints)
    keep.forEach((v, i) => {
      for (let c = 0; c < 4; c++) joints[i * 4 + c] = cards.joints?.[v * 4 + c] ?? 0;
    });
  return {
    positions: take(cards.positions, 3),
    normals: take(cards.normals, 3),
    uvs: take(cards.uvs, 2),
    colors: take(cards.colors, 3),
    indices: new Uint32Array(indices),
    ...(cards.joints && cards.weights ? { joints, weights: take(cards.weights, 4) } : {}),
  };
}

/** One layer of a full groom: a card zone and how many quads run along each card. */
export interface GroomLayer extends CardZone {
  readonly segments?: number;
}

/**
 * A whole coat from layers (undercoat, guard hair, mane…) over a skinned surface, for an animal
 * whose spec turns the kind's own cards off (`cards: false`) to place every lock itself. `box`
 * (asset frame) drops any card that leaves the animal's sourced width or height; `bind` skins
 * what is left (the creature kind's `info.rig.pieces`; omitted for rigid, unskinned animals).
 * Null when no layer grows a card.
 */
export function groom(
  surface: Mesh,
  flow: Float32Array,
  layers: readonly GroomLayer[],
  rng: Rng,
  box?: { readonly y?: number; readonly z?: number },
  bind: (cards: Mesh) => Mesh = (cards) => cards,
): Mesh | null {
  defineMaterial(CREATURE_MATERIALS.fur_clumps);
  let out: Mesh | null = null;
  for (const layer of layers) {
    const { segments, ...zone } = layer;
    const cards = hairCards({
      surface,
      flow,
      zones: [zone],
      rng: rng.fork(layer.name),
      segments: segments ?? 2,
      maxCards: 20000,
    });
    if (cards.roots.length > 0) out = out ? joinSkinned(out, cards.mesh) : cards.mesh;
  }
  return out ? bind(box ? withinBox(out, box) : out) : null;
}

export interface WhiskerOptions {
  /** Mystacial whiskers per side (rows of 4) and their longest length, metres. */
  readonly count: number;
  readonly length: number;
  /** Root radius, metres (real ≈ 0.4 mm; thicker reads at hero distance). */
  readonly radius: number;
  readonly colour: Vec3;
  /** Brow whiskers over each eye (default 2). */
  readonly brow?: number;
}

/** One tapered three-sided strand through `pts` (head part frame). */
function strand(b: MeshBuilder, pts: readonly Vec3[], r: number, colour: Vec3): void {
  const rect = stripRect('plain');
  const uv: [number, number] = [(rect.u0 + rect.u1) / 2, (rect.v0 + rect.v1) / 2];
  const rings: number[][] = [];
  const n = pts.length - 1;
  pts.forEach((p, i) => {
    const q = pts[Math.min(n, i + 1)] ?? p;
    const o = pts[Math.max(0, i - 1)] ?? p;
    const t: Vec3 = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
    const tl = dmath.hypot(t[0], t[1], t[2]) || 1;
    // Any axis not along the strand gives a stable frame for a hair this thin.
    const ref: Vec3 = Math.abs(t[2] / tl) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u: Vec3 = [
      t[1] * ref[2] - t[2] * ref[1],
      t[2] * ref[0] - t[0] * ref[2],
      t[0] * ref[1] - t[1] * ref[0],
    ];
    const ul = dmath.hypot(u[0], u[1], u[2]) || 1;
    const w: Vec3 = [
      (t[1] * u[2] - t[2] * u[1]) / (tl * ul),
      (t[2] * u[0] - t[0] * u[2]) / (tl * ul),
      (t[0] * u[1] - t[1] * u[0]) / (tl * ul),
    ];
    const rr = r * (1 - 0.85 * (i / n));
    const ring: number[] = [];
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI * 2;
      const d: Vec3 = [
        (u[0] / ul) * dmath.cos(a) + w[0] * dmath.sin(a),
        (u[1] / ul) * dmath.cos(a) + w[1] * dmath.sin(a),
        (u[2] / ul) * dmath.cos(a) + w[2] * dmath.sin(a),
      ];
      ring.push(
        b.vertex({
          p: [p[0] + d[0] * rr, p[1] + d[1] * rr, p[2] + d[2] * rr],
          n: d,
          uv,
          // Dark at the follicle, the shaft pale toward the tip.
          color: [colour[0] * (0.6 + 0.4 * (i / n)), colour[1] * (0.6 + 0.4 * (i / n)), colour[2]],
        }),
      );
    }
    rings.push(ring);
  });
  for (let i = 0; i < n; i++)
    for (let j = 0; j < 3; j++) {
      const a = rings[i]?.[j] ?? 0;
      const c = rings[i]?.[(j + 1) % 3] ?? 0;
      const d = rings[i + 1]?.[(j + 1) % 3] ?? 0;
      const e = rings[i + 1]?.[j] ?? 0;
      b.quad(a, c, d, e);
    }
}

/** Tapered three-sided strands (whiskers, bristles) along the given centre lines. */
export function strands(paths: readonly (readonly Vec3[])[], radius: number, colour: Vec3): Mesh {
  const b = new MeshBuilder();
  for (const pts of paths) if (pts.length > 1) strand(b, pts, radius, colour);
  return b.build();
}

/**
 * Whiskers in the pitched head part's frame (unskinned; the caller binds them to the head bone).
 * Roots start inside the muzzle on the whisker pad and inside the brow, so no strand can float;
 * each sweeps out, slightly back and down. LOD1 keeps half of them, twice as thick.
 */
export function whiskers(l: Head, h: Frame, lod: Lod, rng: Rng, o: WhiskerOptions): Mesh | null {
  if (lod === 2) return null;
  const b = new MeshBuilder();
  const muzzle = l.L - l.lc;
  const r = o.radius * (lod === 0 ? 1 : 2);
  const steps = lod === 0 ? 5 : 3;
  const grow = (root: Vec3, dir: Vec3, len: number, side: number, droop: number): void => {
    const dl = dmath.hypot(dir[0], dir[1], dir[2]) || 1;
    const pts: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Out along `dir`, curving back toward the cheek and sagging under its own weight.
      pts.push(
        pitched(h, [
          root[0] + (dir[0] / dl) * len * t - len * 0.22 * t * t,
          (root[1] + (dir[1] / dl) * len * t) * side,
          root[2] + (dir[2] / dl) * len * t - len * droop * t * t,
        ]),
      );
    }
    strand(b, pts, r, o.colour);
  };
  for (const side of [1, -1]) {
    for (let i = 0; i < o.count; i++) {
      if (lod === 1 && i % 2 === 1) continue;
      const row = i % 4;
      const col = Math.floor(i / 4);
      const cols = Math.max(1, Math.ceil(o.count / 4));
      // Rows stacked on the pad, columns from behind the nose back toward the mouth corner; the
      // rear columns carry the longest whiskers (as on a real muzzle).
      const back = col / cols;
      const root: Vec3 = [
        l.lc + muzzle * (0.72 - 0.3 * back) + (rng.next() - 0.5) * muzzle * 0.03,
        l.rt * 0.45,
        l.zm + l.rt * (0.18 + 0.2 * row),
      ];
      const dir: Vec3 = [0.25 - 0.35 * back, 1, 0.28 - 0.2 * row + (rng.next() - 0.5) * 0.12];
      grow(root, dir, o.length * (0.55 + 0.45 * back) * (0.85 + 0.3 * rng.next()), side, 0.16);
    }
    const [ex, ey, ez] = l.eye.centre;
    for (let i = 0; i < (o.brow ?? 2); i++) {
      if (lod === 1 && i > 0) continue;
      const root: Vec3 = [ex - l.eye.r * (0.2 + 0.9 * i), ey * 0.8, ez + l.eye.r * 0.9];
      grow(root, [0.1, 0.55, 1], o.length * 0.5 * (0.85 + 0.3 * rng.next()), side, -0.05);
    }
  }
  return b.build();
}

/**
 * A healed nick in one ear's rear rim: the rim vertices near the notch are pulled forward into
 * the ear (no triangle is cut, so the shell stays closed). `side` 1 = left (+Y), −1 = right.
 */
export function earNick(head: Mesh, l: Head, h: Frame, side: 1 | -1, depth = 0.22): Mesh {
  if (!l.ear || l.earHeight <= 0) return head;
  const n = head.positions.length / 3;
  const at = (v: number): Vec3 =>
    unpitched(h, [
      head.positions[v * 3] ?? 0,
      head.positions[v * 3 + 1] ?? 0,
      head.positions[v * 3 + 2] ?? 0,
    ]);
  const lo = l.ear[2] + l.earHeight * 0.5;
  const hi = l.ear[2] + l.earHeight * 0.72;
  // The notch sits on the rearmost rim vertex of the band.
  let rim: Vec3 | null = null;
  for (let v = 0; v < n; v++) {
    const p = at(v);
    if (p[1] * side <= 0 || p[2] < lo || p[2] > hi) continue;
    if (!rim || p[0] < rim[0]) rim = p;
  }
  if (!rim) return head;
  const radius = l.earHeight * 0.17;
  const positions = new Float32Array(head.positions);
  for (let v = 0; v < n; v++) {
    const p = at(v);
    const d = dmath.hypot(p[0] - rim[0], p[2] - rim[2]);
    if (p[1] * side <= 0 || d >= radius || Math.abs(p[1] - rim[1]) > radius * 2) continue;
    const push = l.earHeight * depth * dmath.pow(1 - d / radius, 2);
    positions.set(pitched(h, [p[0] + push, p[1], p[2]]), v * 3);
  }
  return { ...head, positions };
}
