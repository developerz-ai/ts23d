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

describe('ctx.use seeds', () => {
  const firstDraw = (seen: number[]) =>
    defineAsset({
      name: 'drawer',
      kind: 'prop',
      budget,
      build(ctx) {
        seen.push(ctx.rng.next());
      },
    });

  it("keeps a child's own seed: same first draw as compiling the child alone", () => {
    const seen: number[] = [];
    const child = defineAsset({ ...firstDraw(seen), seed: 42 });
    compile(child);
    const host = defineAsset({
      name: 'host',
      kind: 'prop',
      budget,
      seed: 7,
      build: (ctx) => ctx.use(child, { prefix: 'kid' }),
    });
    compile(host);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0] as number);
  });

  it('gives unseeded instances their own streams, apart from each other and the parent', () => {
    const seen: number[] = [];
    const child = firstDraw(seen);
    const host = defineAsset({
      name: 'host',
      kind: 'prop',
      budget,
      build(ctx) {
        seen.push(ctx.rng.next());
        ctx.use(child, { prefix: 'a' });
        ctx.use(child, { prefix: 'b' });
      },
    });
    compile(host);
    expect(new Set(seen).size).toBe(3);
  });

  it('refuses a fractional per-instance seed', () => {
    const host = defineAsset({
      name: 'host',
      kind: 'prop',
      budget,
      build: (ctx) => ctx.use(firstDraw([]), { prefix: 'a', seed: 0.5 }),
    });
    expect(() => compile(host)).toThrow(/T3D_RECIPE_INVALID/);
  });
});

describe('part, group and use names and placement', () => {
  const built = (build: Parameters<typeof defineAsset>[0]['build']) =>
    defineAsset({ name: 'rig', kind: 'prop', budget, build });
  const codeOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      if (e instanceof Ts23dError) return e.code;
      throw e;
    }
    return 'no error';
  };

  it('refuses part and group names that are not snake_case (they became node names)', () => {
    for (const name of ['Bad Name!', '', '9lives', 'door-left', 'tür'])
      for (const add of [
        built((ctx) => ctx.part(name, null)),
        built((ctx) => ctx.group(name)),
        built((ctx) => ctx.socket(name, { kind: 'attach' } as never)),
      ])
        expect(codeOf(() => compile(add))).toBe('T3D_RECIPE_INVALID');
    expect(() => compile(built((ctx) => ctx.group('Bad Name!')))).toThrow(/snake_case/);
  });

  it('refuses a pivot or yaw that is not finite', () => {
    const bad: readonly Parameters<typeof defineAsset>[0]['build'][] = [
      (ctx) => ctx.group('g', { at: [Number.NaN, 0, 0] }),
      (ctx) => ctx.part('p', null, { at: [0, Number.POSITIVE_INFINITY, 0] }),
      (ctx) => ctx.group('g', { at: [0, 0] as never }),
      (ctx) => ctx.group('g', { yaw: Number.NaN }),
    ];
    for (const build of bad) expect(codeOf(() => compile(built(build)))).toBe('T3D_RECIPE_INVALID');
  });

  it('refuses an empty or non-snake_case ctx.use prefix, and a bad instance pivot', () => {
    const child = built((ctx) => ctx.group('leaf'));
    const using = (
      o: Parameters<Parameters<Parameters<typeof defineAsset>[0]['build']>[0]['use']>[1],
    ) => defineAsset({ name: 'town', kind: 'prop', budget, build: (ctx) => ctx.use(child, o) });
    for (const o of [
      { prefix: '' },
      { prefix: 'Bad Prefix' },
      { prefix: 'ok', at: [0, Number.NaN, 0] as const },
      { prefix: 'ok', yaw: Number.NaN },
    ])
      expect(codeOf(() => compile(using(o)))).toBe('T3D_RECIPE_INVALID');
    expect(compile(using({ prefix: 'house_3' })).parts.map((p) => p.name)).toEqual([
      'house_3',
      'house_3_leaf',
    ]);
  });

  it("drops a child's paint slot named like an Object.prototype member the parent lacks", () => {
    const child = defineAsset({
      name: 'child',
      kind: 'prop',
      budget,
      paint: { constructor: '#808080' },
      build: (ctx) => ctx.part('shell', null, { paint: 'constructor' }),
    });
    const parent = defineAsset({
      name: 'parent',
      kind: 'prop',
      budget,
      paint: { body: '#808080' },
      build: (ctx) => ctx.use(child, { prefix: 'c' }),
    });
    expect(compile(parent).parts.find((p) => p.name === 'c_shell')?.paint).toBeUndefined();
  });
});
