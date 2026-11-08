// Horns, claws, teeth and spikes as sculpt edits: a bent, tapering skin with optional growth rings
// (radius ripples) and colour bands from root to tip. One generic `horn`; `claw`, `tooth` and
// `spikeRow` are presets of it. Shared by any creature (dragon, demon, ram, beetle…).

import type { Mesh, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { arc, mixRgb, smoothstep, v3 } from './curve.ts';
import { tubeMesh } from './lowpoly.ts';
import { type SkinNode, skin } from './skin.ts';

export interface HornOptions {
  readonly base: Vec3;
  /** Initial heading (need not be unit). */
  readonly dir: Vec3;
  readonly length: number;
  /** Root radius, metres. */
  readonly radius: number;
  /** Tip radius (> 0: keep about half a sculpt cell so the tip survives meshing). */
  readonly tip?: number;
  /** Curl axis and total curl, degrees (right-hand rule about `axis`). */
  readonly axis: Vec3;
  readonly bend: number;
  /** Corkscrew: degrees the curl axis turns about the heading over the length. */
  readonly twist?: number;
  /** Segments along the length (LOD knob). */
  readonly segments: number;
  /** Growth rings: count and depth as a fraction of the radius (0 = smooth). */
  readonly rings?: number;
  readonly ringDepth?: number;
  /** Taper exponent: 1 = straight cone, < 1 = stays thick then points. */
  readonly taper?: number;
  /** Log-spiral tightening of the curl toward the tip (0 = constant curvature). */
  readonly spiral?: number;
  /**
   * Skin → keratin transition: the first `skinLen` metres of the horn blend from this skin colour
   * into the root colour, so a horn growing from a boss has no painted seam.
   */
  readonly skin?: Vec3;
  readonly skinLen?: number;
  /** Colours root → middle → tip. */
  readonly colors: readonly [Vec3, Vec3, Vec3];
  readonly blend?: number;
  readonly mirror?: boolean;
}

/** Radius at arc fraction t. */
export function hornRadius(o: HornOptions, t: number): number {
  const tip = o.tip ?? o.radius * 0.08;
  const shape = (1 - t) ** (o.taper ?? 0.85);
  const r = tip + (o.radius - tip) * shape;
  const rings = o.rings ?? 0;
  if (rings <= 0) return r;
  // Rings fade out toward the smooth tip, like real horn growth.
  const ripple = Math.max(0, Math.sin(t * rings * Math.PI * 2)) ** 2;
  return r * (1 - (o.ringDepth ?? 0.06) * ripple * (1 - smoothstep(0.6, 0.95, t)));
}

/** The horn's centre line (segments + 1 points). */
export const hornPath = (o: HornOptions): Vec3[] =>
  arc(o.base, o.dir, o.length, o.axis, o.bend, o.segments, o.twist ?? 0, o.spiral ?? 0);

export function hornNodes(o: HornOptions): SkinNode[] {
  const path = hornPath(o);
  const n = path.length - 1;
  return path.map((at, i) => ({ at, r: hornRadius(o, i / n) }));
}

/** Colour band for segment i of n: root → mid by 45%, mid → tip after. */
export function hornBand(colors: readonly [Vec3, Vec3, Vec3]): (i: number, n: number) => Vec3 {
  return (i, n) => {
    const t = (i + 0.5) / n;
    return t < 0.45
      ? mixRgb(colors[0], colors[1], smoothstep(0, 0.45, t))
      : mixRgb(colors[1], colors[2], smoothstep(0.55, 1, t));
  };
}

export function horn(o: HornOptions): SculptEdit {
  return skin(hornNodes(o), {
    band: hornBand(o.colors),
    blend: o.blend ?? 0,
    ...(o.mirror !== undefined ? { mirror: o.mirror } : {}),
  });
}

/**
 * The horn as a tube mesh (far LODs, thin horns, many small teeth): smooth root → mid → tip colour
 * and each growth ring's groove painted darker, so it reads as banded horn without a sculpt.
 */
export function hornTube(o: HornOptions, sides: number): Mesh {
  const nodes = hornNodes(o);
  const n = nodes.length - 1;
  const colors = nodes.map((nd, i) => {
    const t = i / n;
    const c =
      t < 0.45
        ? mixRgb(o.colors[0], o.colors[1], smoothstep(0, 0.45, t))
        : mixRgb(o.colors[1], o.colors[2], smoothstep(0.55, 1, t));
    const smooth = hornRadius({ ...o, rings: 0 }, t);
    const groove = Math.max(0, 1 - nd.r / smooth) / (o.ringDepth ?? 0.06);
    const k = 1 - 0.35 * Math.min(1, groove);
    const ringed: Vec3 = [c[0] * k, c[1] * k, c[2] * k];
    // Skin creeping up the root: skin colour → keratin over `skinLen` metres.
    const len = o.skinLen ?? 0;
    return o.skin && len > 0 ? mixRgb(o.skin, ringed, smoothstep(0, len, t * o.length)) : ringed;
  });
  return tubeMesh(nodes, { sides, colors });
}

/** Options for a claw (see `claw`). */
export interface ClawOptions {
  readonly base: Vec3;
  readonly dir: Vec3;
  readonly down: Vec3;
  readonly length: number;
  readonly radius: number;
  readonly segments: number;
  readonly colors: readonly [Vec3, Vec3, Vec3];
  readonly curl?: number;
  readonly mirror?: boolean;
  readonly tip?: number;
}

/** A claw as horn options: short, thick at the root, curled toward `down`. */
export function clawHorn(o: ClawOptions): HornOptions {
  const axis = v3.cross(v3.norm(o.dir), v3.norm(o.down));
  return {
    base: o.base,
    dir: o.dir,
    length: o.length,
    radius: o.radius,
    tip: o.tip ?? o.radius * 0.12,
    axis,
    bend: o.curl ?? 70,
    segments: o.segments,
    taper: 0.7,
    colors: o.colors,
    ...(o.mirror !== undefined ? { mirror: o.mirror } : {}),
  };
}

/** A claw: short, thick at the root, strongly curled down toward its tip (`down` = curl side). */
export const claw = (o: ClawOptions): SculptEdit => horn(clawHorn(o));

/** Spikes standing on a list of bases, each with its own height and lean (degrees back). */
export function spikeRow(
  spikes: readonly {
    readonly base: Vec3;
    readonly up: Vec3;
    readonly back: Vec3;
    readonly height: number;
    readonly radius: number;
    readonly lean: number;
  }[],
  o: {
    readonly segments: number;
    readonly colors: readonly [Vec3, Vec3, Vec3];
    readonly mirror?: boolean;
  },
): SculptEdit[] {
  return spikes.map((s) => {
    const axis = v3.cross(v3.norm(s.up), v3.norm(s.back));
    return horn({
      base: s.base,
      dir: s.up,
      length: s.height,
      radius: s.radius,
      tip: s.radius * 0.1,
      axis,
      bend: s.lean,
      segments: o.segments,
      taper: 0.9,
      colors: o.colors,
      ...(o.mirror !== undefined ? { mirror: o.mirror } : {}),
    });
  });
}
