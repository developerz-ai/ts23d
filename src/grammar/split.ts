// Split grammar (after CGA shape, Müller et al. 2006): one line lays out a facade strip.
//   "pier:0.9 | {arch:2.5}* | door:3 | pier:~"
//   x:n fixed width · {a:n | b:m}* repeat to fill · x:~ stretch (shares leftover equally)

import { Ts23dError } from '../core/index.ts';

export type SplitTerm =
  | { readonly kind: 'fixed'; readonly symbol: string; readonly size: number }
  | { readonly kind: 'stretch'; readonly symbol: string; readonly weight: number }
  | { readonly kind: 'repeat'; readonly body: readonly SplitTerm[] };

export interface Slot {
  readonly symbol: string;
  readonly start: number;
  readonly size: number;
}

const syntax = (src: string, why: string): Ts23dError =>
  new Ts23dError('T3D_GRAMMAR_SYNTAX', {
    cause: `cannot parse split "${src}": ${why}`,
    fix: 'use `sym:<metres>`, `sym:~`, `sym:~<weight>` or `{a:1 | b:2}*`, separated by `|`',
  });

function parseTerm(raw: string, src: string): SplitTerm {
  const t = raw.trim();
  const m = /^([a-z_][a-z0-9_]*):(~(\d*\.?\d+)?|\d*\.?\d+)$/.exec(t);
  if (!m) throw syntax(src, `bad term '${t}'`);
  const [, symbol = '', size = ''] = m;
  if (size.startsWith('~')) return { kind: 'stretch', symbol, weight: m[3] ? Number(m[3]) : 1 };
  return { kind: 'fixed', symbol, size: Number(size) };
}

export function parseSplit(src: string): SplitTerm[] {
  const out: SplitTerm[] = [];
  const re = /\{([^}]*)\}\*|([^|{}]+)/g;
  for (const m of src.matchAll(re)) {
    if (m[1] !== undefined) {
      const body = m[1].split('|').map((s) => parseTerm(s, src));
      if (body.some((b) => b.kind !== 'fixed'))
        throw syntax(src, 'a repeat body takes fixed sizes');
      out.push({ kind: 'repeat', body });
    } else if (m[2] !== undefined && m[2].trim() !== '') {
      out.push(parseTerm(m[2], src));
    }
  }
  if (out.length === 0) throw syntax(src, 'empty');
  if (out.filter((t) => t.kind === 'repeat').length > 1) throw syntax(src, 'at most one repeat');
  return out;
}

const sizeOf = (terms: readonly SplitTerm[]): number =>
  terms.reduce((s, t) => s + (t.kind === 'fixed' ? t.size : 0), 0);

/** Lay a parsed split across `length` metres. Repeats take whole copies; stretches share the rest. */
export function layoutSplit(terms: readonly SplitTerm[], length: number): Slot[] {
  const fixed = sizeOf(terms);
  const repeat = terms.find((t) => t.kind === 'repeat');
  const unit = repeat?.kind === 'repeat' ? sizeOf(repeat.body) : 0;
  if (fixed > length + 1e-9) {
    throw new Ts23dError('T3D_GRAMMAR_OVERFLOW', {
      cause: `fixed terms need ${fixed} m but the strip is ${length} m`,
      fix: 'shrink a fixed term, or turn one into a stretch (`sym:~`)',
    });
  }
  const copies = unit > 0 ? Math.floor((length - fixed) / unit) : 0;
  const weights = terms.reduce((s, t) => s + (t.kind === 'stretch' ? t.weight : 0), 0);
  const leftover = length - fixed - copies * unit;
  // No stretch term: the repeat absorbs the leftover by widening each copy evenly.
  const grow = weights === 0 && copies > 0 ? (copies * unit + leftover) / (copies * unit) : 1;
  const slots: Slot[] = [];
  let x = 0;
  const push = (symbol: string, size: number): void => {
    slots.push({ symbol, start: x, size });
    x += size;
  };
  for (const t of terms) {
    if (t.kind === 'fixed') push(t.symbol, t.size);
    else if (t.kind === 'stretch')
      push(t.symbol, weights > 0 ? (leftover * t.weight) / weights : 0);
    else
      for (let i = 0; i < copies; i++)
        for (const b of t.body) if (b.kind === 'fixed') push(b.symbol, b.size * grow);
  }
  return slots;
}

export const split = (src: string, length: number): Slot[] => layoutSplit(parseSplit(src), length);
