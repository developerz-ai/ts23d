import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import { Ts23dError } from './errors.ts';

const budget = { triangles: [10, 10, 10] as const };

describe('compile', () => {
  it('collects named parts with pivots and parents', () => {
    const asset = defineAsset({
      name: 'rig',
      kind: 'prop',
      budget,
      build(ctx) {
        ctx.group('root');
        ctx.part('arm', null, { parent: 'root', at: [1, 0, 0] });
      },
    });
    const out = compile(asset);
    expect(out.parts.map((p) => p.name)).toEqual(['root', 'arm']);
    expect(out.parts[1]?.at).toEqual([1, 0, 0]);
  });

  it('refuses duplicate part names with a fix', () => {
    const asset = defineAsset({
      name: 'dup',
      kind: 'prop',
      budget,
      build(ctx) {
        ctx.group('a');
        ctx.group('a');
      },
    });
    expect(() => compile(asset)).toThrow(Ts23dError);
  });

  it('refuses non-snake_case names', () => {
    expect(() => defineAsset({ name: 'Bad Name', kind: 'prop', budget, build() {} })).toThrow(
      /snake_case/,
    );
  });
});

describe('use (composition)', () => {
  it('instances a child asset under a prefixed group', () => {
    const lamp = defineAsset({
      name: 'lamp',
      kind: 'prop',
      budget,
      build: (ctx) => ctx.group('pole'),
    });
    const street = defineAsset({
      name: 'street',
      kind: 'scene',
      budget,
      build(ctx) {
        for (let i = 0; i < 3; i++) ctx.use(lamp, { prefix: `lamp_${i}`, at: [i * 10, 0, 0] });
      },
    });
    const names = compile(street).parts.map((p) => p.name);
    expect(names).toContain('lamp_2_pole');
    expect(compile(street).parts.find((p) => p.name === 'lamp_1_pole')?.parent).toBe('lamp_1');
  });
});

describe('sockets and emitters', () => {
  it('are named empty nodes carrying their data, prefixed through ctx.use', () => {
    const seat = defineAsset({
      name: 'jeep',
      kind: 'vehicle',
      budget,
      build(ctx) {
        ctx.socket('seat_driver', { kind: 'seat', at: [0.3, 0.4, 0.8] });
        ctx.emitter('exhaust', { kind: 'smoke', rate: 5, life: 2, size: [0.1, 0.6] });
      },
    });
    const convoy = defineAsset({
      name: 'convoy',
      kind: 'scene',
      budget,
      build: (ctx) => ctx.use(seat, { prefix: 'jeep_1' }),
    });
    const parts = compile(convoy).parts;
    expect(parts.find((p) => p.name === 'jeep_1_seat_driver')?.socket?.kind).toBe('seat');
    expect(parts.find((p) => p.name === 'jeep_1_exhaust')?.emitter?.kind).toBe('smoke');
  });
});
