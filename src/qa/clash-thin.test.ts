// Thin moving parts still clash: a rotor a few centimetres thick or a 2 cm sliding door used to
// lose its whole thickness to the CLASH_EPS shave on both faces, and 10 cm static sampling could
// step over the thin band it sweeps, so a blade spinning through a fin passed.
import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Motion } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { clashes } from './clash.ts';

const c: [number, number, number] = [1, 1, 1];
const heli = (thick: number, motion: Motion, rotorZ = 1.2) =>
  defineAsset({
    name: 'heli',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('hull', box({ size: [2, 1, 1], color: c }));
      ctx.part('fin', box({ size: [0.2, 0.2, 2], at: [1.5, 0, 0], color: c }));
      ctx.part('rotor', box({ size: [4, 0.2, thick], color: c }), { at: [0, 0, rotorZ], motion });
    },
  });
const spin: Motion = { kind: 'spin', axis: [0, 0, 1], rps: 1 };
const sway: Motion = { kind: 'sway', axis: [0, 0, 1], degrees: 60, hz: 0.5 };

const door = (thick: number, postY = 0) =>
  defineAsset({
    name: 'door',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('floor', box({ size: [4, 1, 0.1], color: c }));
      ctx.part('post', box({ size: [0.2, 0.2, 2], at: [1.2, postY, 0.1], color: c }));
      ctx.part('leaf', box({ size: [1, thick, 1.9], color: c }), {
        at: [0, 0, 0.1],
        motion: { kind: 'slide', offset: [1, 0, 0], hz: 0.2 },
      });
    },
  });

const rod = (thick: number, barZ: number) =>
  defineAsset({
    name: 'rod',
    kind: 'prop',
    budget: { triangles: [9999, 9999, 9999] },
    build(ctx) {
      ctx.part('rod', box({ size: [2, thick, 0.1], at: [-1, 0, 0], color: c }), {
        at: [0, 0, 1],
        motion: { kind: 'orbit', axis: [0, 1, 0], arm: [0, 0, 0.3], hz: 1 },
      });
      ctx.part('post', box({ size: [0.2, 0.2, 2], at: [-1, 0, 1 - barZ], color: c }));
    },
  });

describe('clashes gate: thin moving parts', () => {
  it('fails a rotor 1.5–4 cm thick spinning or swaying through a fin', () => {
    for (const t of [0.04, 0.03, 0.02, 0.015]) {
      expect(clashes(compile(heli(t, spin))).map((f) => f.part)).toEqual(['fin']);
      expect(clashes(compile(heli(t, sway))).map((f) => f.part)).toEqual(['fin']);
    }
  });

  it('passes the same thin rotor spinning clear above the fin', () => {
    expect(clashes(compile(heli(0.02, spin, 2.05)))).toEqual([]);
  });

  it('fails a 2 cm sliding door through a post, passes it 5 cm clear of the post', () => {
    for (const t of [0.05, 0.02, 0.015]) {
      expect(clashes(compile(door(t))).map((f) => f.part)).toEqual(['post']);
    }
    expect(clashes(compile(door(0.02, 0.16)))).toEqual([]);
  });

  it('fails a 2 cm coupling rod orbiting through a post', () => {
    expect(clashes(compile(rod(0.02, 0.2))).map((f) => f.part)).toEqual(['post']);
  });
});
