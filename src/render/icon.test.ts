import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset, Ts23dError } from '../core/index.ts';
import { DEFAULT_SHEET, hex, paintTrimSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { icon, portrait, renderIcon, renderPortrait } from './icon.ts';
import { rtsView, teamCoverage } from './icon-rts.ts';

/** A grey block with a team-painted roof slab, or with the slab hidden inside the block. */
const unit = (hidden: boolean) =>
  defineAsset({
    name: 'unit',
    kind: 'prop',
    budget: { triangles: [24, 24, 24] },
    paint: { team: '#b3261e' },
    variants: { red: { team: '#b3261e' }, blue: { team: '#1f4fb8' } },
    build(ctx) {
      ctx.part('body', box({ size: [1, 1, 1], color: hex('#8a8a84') }));
      ctx.part(
        'roof',
        box({ size: [0.9, 0.9, 0.1], at: [0, 0, hidden ? 0.4 : 1], color: hex('#b3261e') }),
        { paint: 'team' },
      );
    },
  });
/** A small sheet: the default 2048² one costs seconds to paint. */
const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
const red = compile(unit(false), { variant: 'red' });
const blue = compile(unit(false), { variant: 'blue' });

/** PNG IHDR width × height. */
const dims = (png: Uint8Array): [number, number] => {
  const dv = new DataView(png.buffer, png.byteOffset);
  return [dv.getUint32(16), dv.getUint32(20)];
};

describe('icon', () => {
  it('refuses a size that is not 16…4096 px', () => {
    expect(() => icon(red, { size: 8 })).toThrow(Ts23dError);
    expect(() => portrait(red, { size: 300.5 })).toThrow(/icon size/);
  });

  it('refuses a portrait focus that matches no part', () => {
    expect(() => renderPortrait(red, { size: 32, focus: ['turret'] })).toThrow(/matches no part/);
  });

  it('writes a 256² icon and a 512² portrait by default', () => {
    expect(dims(icon(red, { supersample: 1, sheet }))).toEqual([256, 256]);
    expect(dims(portrait(red, { supersample: 1, sheet }))).toEqual([512, 512]);
  });

  it('is byte-deterministic', () => {
    const o = { size: 48, sheet };
    expect(Bun.hash(icon(red, o))).toBe(Bun.hash(icon(red, o)));
    expect(Bun.hash(portrait(red, o))).toBe(Bun.hash(portrait(red, o)));
  });

  it('shows the team colour: icons of two liveries differ, transparent corners are clear', () => {
    const a = renderIcon(red, { size: 48, backdrop: 'transparent', sheet });
    const b = renderIcon(blue, { size: 48, backdrop: 'transparent', sheet });
    let changed = 0;
    for (let i = 0; i < a.rgba.length; i += 4)
      if (Math.abs((a.rgba[i] ?? 0) - (b.rgba[i] ?? 0)) > 24) changed++;
    expect(changed).toBeGreaterThan(48 * 48 * 0.05);
    expect(a.rgba[3]).toBe(0);
  });

  it('portrait zooms in: the focus fills more of the frame than in the icon', () => {
    const share = (m: Uint8Array): number => m.filter((v) => v > 127).length / m.length;
    const whole = renderIcon(red, { size: 64, sheet });
    const close = renderPortrait(red, { size: 64, focus: ['roof'], sheet });
    expect(share(close.mask)).toBeGreaterThan(share(whole.mask));
  });
});

describe('RTS camera team coverage', () => {
  const hiddenRed: CompiledAsset = compile(unit(true), { variant: 'red' });
  const hiddenBlue: CompiledAsset = compile(unit(true), { variant: 'blue' });

  it('finds no team colour when the team part is buried', () => {
    expect(teamCoverage(hiddenRed, hiddenBlue, { sheet }).share).toBe(0);
  });

  it('refuses two different assets', () => {
    const other = compile(defineAsset({ ...unit(false), name: 'other' }), { variant: 'blue' });
    expect(() => teamCoverage(red, other)).toThrow(Ts23dError);
  });

  it('finds the roof from 58° up at 64 px', () => {
    const c = teamCoverage(red, blue, { sheet });
    expect(c.covered).toBeGreaterThan(100);
    expect(c.share).toBeGreaterThan(0.3);
  });

  it('renders a deterministic 64² RTS view', () => {
    expect(dims(rtsView(red, { sheet }))).toEqual([64, 64]);
    expect(Bun.hash(rtsView(red, { sheet }))).toBe(Bun.hash(rtsView(red, { sheet })));
  });
});
