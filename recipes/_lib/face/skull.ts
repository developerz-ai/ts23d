// The skull stage of the bust heads: the CC0 MakeHuman base head warped to the race (faceHead:
// cranium, maxilla, mandible, orbits, nose cartilages, lips, ears and the neck with its
// sternocleidomastoids, all from one anatomical mesh), placed in a bust's frame by a similarity
// (menton → crown = the spec's H, glabella on the spec's glabella), sawn off below the neck and
// turned into a signed distance field the bust sculpt unions with its torso. Landmarks come out
// in the same frame, so eyes, hair and clothes sit where the mesh puts the anatomy.

import { createRng, type Mesh, type SculptEdit, type Vec3 } from '@developerz.ai/ts23d';
import { clipCap } from './clip.ts';
import { type FaceHead, faceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { meshField } from './mesh-field.ts';
import { quadToMesh, stripUv, subdivide } from './quad.ts';
import type { Character } from './spec.ts';

/** Where a bust wants its head: menton → crown height and the glabella, metres. */
export interface SkullFrame {
  readonly H: number;
  readonly glabella: Vec3;
}

export interface Skull {
  readonly head: FaceHead;
  /** Base point → bust frame (warp, race scale, then the similarity). */
  readonly at: (base: Vec3) => Vec3;
  /** Metres in the bust frame per metre on the base at a base point. */
  readonly sizeAt: (base: Vec3) => number;
  /** Face-bust space (the warped mesh's own) → bust frame. */
  readonly sim: (q: Vec3) => Vec3;
  /** Uniform factor of `sim`. */
  readonly k: number;
}

const memo = new Map<Character, Map<string, Skull>>();

/** The warped base in a bust's frame (memoised per character + frame). */
export function skullOf(c: Character, f: SkullFrame): Skull {
  const key = `${f.H}:${f.glabella.join(',')}`;
  const byC = memo.get(c) ?? new Map<string, Skull>();
  memo.set(c, byC);
  const hit = byC.get(key);
  if (hit) return hit;
  const head = faceHead(c, createRng(1).fork('face'));
  const g = head.map(MIDLINE.glabella);
  const h = head.map(MIDLINE.crown)[2] - head.map(MIDLINE.menton)[2];
  const k = f.H / h;
  const sim = (q: Vec3): Vec3 => [
    f.glabella[0] + (q[0] - g[0]) * k,
    f.glabella[1] + (q[1] - g[1]) * k,
    f.glabella[2] + (q[2] - g[2]) * k,
  ];
  const out: Skull = {
    head,
    at: (b) => sim(head.map(b)),
    sizeAt: (b) => head.sizeAt(b) * k,
    sim,
    k,
  };
  byC.set(key, out);
  return out;
}

/** Named landmarks of a skull in its bust frame (left side; mirror y for the right). */
export function skullLandmarks(s: Skull) {
  const m = (n: keyof typeof MIDLINE): Vec3 => s.at(MIDLINE[n]);
  const l = (n: keyof typeof LEFT): Vec3 => s.at(LEFT[n]);
  const sup = m('stomionSup');
  const inf = m('stomionInf');
  return {
    crown: m('crown'),
    glabella: m('glabella'),
    nasion: m('nasion'),
    pronasale: m('pronasale'),
    subnasale: m('subnasale'),
    stomion: [(sup[0] + inf[0]) / 2, 0, (sup[2] + inf[2]) / 2] as Vec3,
    pogonion: m('pogonion'),
    menton: m('menton'),
    occiput: m('occiput'),
    throat: m('throat'),
    jugular: m('jugular'),
    nape: m('nape'),
    eye: l('eye'),
    /** Eyeball radius that fills the base's orbit (12.8 mm on the base, × local warp size). */
    eyeR: 0.0128 * s.sizeAt(LEFT.eye),
    endocanthion: l('endocanthion'),
    exocanthion: l('exocanthion'),
    brow: l('brow'),
    browOuter: l('browOuter'),
    alare: l('alare'),
    cheilion: l('cheilion'),
    cheek: l('cheek'),
    zygion: l('zygion'),
    euryon: l('euryon'),
    gonion: l('gonion'),
    mastoid: l('mastoid'),
    tragion: l('tragion'),
    earTop: l('earTop'),
    earLobe: l('earLobe'),
    neck: l('neck'),
    trapezius: l('trapezius'),
    earOut: l('earOut'),
    earBack: l('earBack'),
    labraleSup: m('labraleSup'),
    labraleInf: m('labraleInf'),
    /** Helix tips after the race's ear deformer. */
    earTip: s.sim(s.head.earTips[0]),
  };
}

export type SkullLandmarks = ReturnType<typeof skullLandmarks>;

const fields = new Map<Skull, Map<string, SculptEdit>>();

/** The face box (eyes, nose, mouth, chin) a finer field covers, bust frame. */
export function faceBox(s: Skull): [Vec3, Vec3] {
  const k = skullLandmarks(s);
  const w = Math.abs(k.exocanthion[1]) + 0.03 * s.k;
  return [
    [k.eye[0] - 0.035 * s.k, -w, k.menton[2] - 0.01 * s.k],
    [k.pronasale[0] + 0.015 * s.k, w, k.brow[2] + 0.025 * s.k],
  ];
}

/** Weight 1 deep inside `box`, 0 at its walls, smooth over `margin`. */
function inBox(p: Vec3, box: readonly [Vec3, Vec3], margin: number): number {
  let d = Infinity;
  for (let a = 0; a < 3; a++)
    d = Math.min(d, (p[a] ?? 0) - (box[0][a] ?? 0), (box[1][a] ?? 0) - (p[a] ?? 0));
  const t = Math.min(1, Math.max(0, d / margin));
  return t * t * (3 - 2 * t);
}

export interface SkullEditOptions {
  /** Field sample spacing, metres; the face box samples at `fineCell` when given. */
  readonly cell: number;
  readonly fineCell?: number;
  /** One Catmull–Clark level more on the base before sampling. */
  readonly fine: boolean;
  /** A plane below the neck: its normal points at the part removed. */
  readonly cut: { readonly at: Vec3; readonly normal: Vec3 };
  readonly color: Vec3;
}

/**
 * The skull as one sculpt edit: the warped base, cut below the neck and capped, as a distance
 * field (signs by ray parity, so no gap leaks), finer over the face. Memoised per skull + options.
 */
export function skullEdit(s: Skull, o: SkullEditOptions): SculptEdit {
  const key = JSON.stringify(o);
  const byS = fields.get(s) ?? new Map<string, SculptEdit>();
  fields.set(s, byS);
  const hit = byS.get(key);
  if (hit) return hit;
  const qm = o.fine ? subdivide(s.head.mesh) : s.head.mesh;
  const p = new Float64Array(qm.p.length);
  for (let v = 0; v < p.length; v += 3) {
    const q = s.sim([qm.p[v] ?? 0, qm.p[v + 1] ?? 0, qm.p[v + 2] ?? 0]);
    p[v] = q[0];
    p[v + 1] = q[1];
    p[v + 2] = q[2];
  }
  const raw: Mesh = quadToMesh({ p, q: qm.q }, () => o.color, stripUv('plain'));
  // The chest and arms below the cut go, capped flat so the field has an inside; the shoulder
  // tops left above it sit inside the bust's own torso.
  const cut = clipCap(raw, [o.cut], o.color);
  // A plug behind the closed lips seals the oral cavity, which then fills as a void.
  const k = skullLandmarks(s);
  const plug = {
    at: [k.stomion[0] - 0.014 * s.k, 0, k.stomion[2]] as Vec3,
    r: [0.008 * s.k, Math.abs(k.cheilion[1]) * 0.8, 0.006 * s.k] as Vec3,
  };
  const coarse = meshField(cut, o.cell, 3, { inside: 'parity', fillVoids: true, plugs: [plug] });
  const box = faceBox(s);
  const fine = o.fineCell ? meshField(cut, o.fineCell, 3, { inside: 'parity', box }).field : null;
  const margin = o.cell * 4;
  // The fine field cannot see voids its box cuts open; the filled coarse field closes them (deep
  // inside the coarse, the fine is pulled inside too; near the skin they agree to a cell).
  const deep = o.cell * 1.5;
  const field = fine
    ? (q: Vec3): number => {
        const w = inBox(q, box, margin);
        const c = coarse.field(q);
        if (w <= 0) return c;
        const v = Math.min(fine(q), c + deep);
        return w >= 1 ? v : c + (v - c) * w;
      }
    : coarse.field;
  const pad = o.cell * 4;
  const edit: SculptEdit = {
    field,
    bounds: [
      [coarse.bounds[0][0] - pad, coarse.bounds[0][1] - pad, coarse.bounds[0][2] - pad],
      [coarse.bounds[1][0] + pad, coarse.bounds[1][1] + pad, coarse.bounds[1][2] + pad],
    ],
    color: o.color,
    mirror: false,
  };
  byS.set(key, edit);
  return edit;
}
