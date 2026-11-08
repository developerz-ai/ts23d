// How each part is meant to connect (QA `connections`): the recipe's `connect` option, else a
// default from the asset kind and the part name — appendages on creatures grow, eyes sit in
// sockets, everything else is welded over a face. Also the shared issue record the checks emit.

import type { CompiledAsset, ConnectAs, Part, Vec3 } from '../core/index.ts';

/** Kinds whose appendages grow out of the body and whose sculpts are checked for seams. */
export const ORGANIC_KINDS: ReadonlySet<string> = new Set(['character', 'creature']);

/** A name segment naming something that grows out of a body. */
export const APPENDAGE =
  /(^|_)(horns?|spines?|spikes?|claws?|tooth|teeth|tusks?|fangs?|ears?|wings?|tails?|fingers?)(?=_|\d|$)/;
/** eye, eye_l, eyeball_r, eye_3 — not eye_socket, eyelid, eyebrow. */
export const EYE = /(^|_)eye(ball)?(_[lr]|_\d+)?$/;

/** Running gear: contact by a line or a point is the design (wheel on rail, link on link). */
export const RUNNING =
  /(^|_)(wheels?|tyres?|tires?|rollers?|idlers?|sprockets?|tracks?|links?|bogies?|axles?)(?=_|\d|$)/;

export interface Declared {
  readonly as: ConnectAs;
  /** Declared partner part, or null (= the part it touches most). */
  readonly to: string | null;
  /** True when the recipe said so; false for a default. */
  readonly declared: boolean;
}

export function connectionOf(asset: Pick<CompiledAsset, 'kind'>, part: Part): Declared {
  if (part.connect) return { as: part.connect.as, to: part.connect.to ?? null, declared: true };
  if (ORGANIC_KINDS.has(asset.kind)) {
    if (EYE.test(part.name)) return { as: 'socket', to: null, declared: false };
    if (APPENDAGE.test(part.name)) return { as: 'grown', to: null, declared: false };
  }
  // Alpha-cut cards (leaves, grilles, fringes) read as attached through their texture.
  if (RUNNING.test(part.name) || part.surface === 'cutout')
    return { as: 'rest', to: null, declared: false };
  return { as: 'welded', to: null, declared: false };
}

export type ConnectCode =
  | 'T3D_CONNECT_ISLAND'
  | 'T3D_CONNECT_POINT'
  | 'T3D_CONNECT_GLUED'
  | 'T3D_CONNECT_CREASE'
  | 'T3D_CONNECT_POKE'
  | 'T3D_CONNECT_BURIED'
  | 'T3D_CONNECT_SOCKET'
  | 'T3D_CONNECT_EYE_EXPOSED'
  | 'T3D_CONNECT_EYE_STARE'
  | 'T3D_CONNECT_EYE_GAZE'
  | 'T3D_CONNECT_SEAM'
  | 'T3D_CONNECT_INVALID';

/** One connection problem. Errors fail the build; warnings print and draw on the overlay. */
export interface ConnectIssue {
  readonly code: ConnectCode;
  readonly severity: 'error' | 'warning';
  readonly part: string;
  /** World position to circle on the overlay. */
  readonly at: Vec3;
  /** Circle radius on the overlay, metres. */
  readonly radius: number;
  /** Points along a line finding (a seam), drawn instead of a ring. */
  readonly trace?: readonly Vec3[];
  readonly message: string;
  readonly fix: string;
}

/** A connection that passed, for the overlay's green rings. */
export interface ConnectOk {
  readonly part: string;
  readonly to: string;
  readonly at: Vec3;
  readonly radius: number;
}

export const cm = (m: number): string => `${(m * 100).toFixed(1)} cm`;
export const fmt = (p: Vec3): string => `(${p.map((v) => v.toFixed(2)).join(', ')})`;
