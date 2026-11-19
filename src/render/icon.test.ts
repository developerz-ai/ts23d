import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset, Ts23dError } from '../core/index.ts';
import { DEFAULT_SHEET, hex, paintTrimSheet } from '../material/index.ts';
import { box, lathe } from '../primitives/index.ts';
import { renderBeauty } from './beauty.ts';
import { ICON_CAMERA, icon, portrait, renderIcon, renderPortrait } from './icon.ts';
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
const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 }, []);
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

  it('frames the skin a focus bone drives when no part has that name (one skinned body)', () => {
    // Bone `crest` owns exactly the vertices of part `roof`; `root` owns the rest.
    const skinned: CompiledAsset = {
      ...red,
      skeleton: {
        bones: [
          { name: 'root', head: [0, 0, 0], tail: [0, 0, 0.5] },
          { name: 'crest', parent: 'root', head: [0, 0, 1], tail: [0, 0, 1.1] },
        ],
      },
      parts: red.parts.map((p) => {
        if (!p.mesh) return p;
        const n = p.mesh.positions.length / 3;
        const joints = new Uint16Array(n * 4).fill(p.name === 'roof' ? 1 : 0);
        const weights = new Float32Array(n * 4);
        for (let v = 0; v < n; v++) weights[v * 4] = 1;
        return { ...p, mesh: { ...p.mesh, joints, weights } };
      }),
    };
    // Without the skin the name is still refused.
    expect(() => renderPortrait(red, { size: 32, focus: ['crest'] })).toThrow(/matches no part/);
    // The bone's framing IS the framing of the part holding the same vertices, and neither is the
    // whole-asset default: the bone selected its own skin, not the mesh.
    const byBone = renderPortrait(skinned, { size: 48, sheet, focus: ['crest'] });
    const byPart = renderPortrait(skinned, { size: 48, sheet, focus: ['roof'] });
    const whole = renderPortrait(skinned, { size: 48, sheet });
    expect(Bun.hash(byBone.rgba)).toBe(Bun.hash(byPart.rgba));
    expect(Bun.hash(byBone.rgba)).not.toBe(Bun.hash(whole.rgba));
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

  it('a transparent icon carries the asset colour to its edge, not a halo of the studio backdrop', () => {
    // Near-black block: any backdrop blended into a partly covered pixel shows as a light rim.
    const dark = compile(
      defineAsset({
        name: 'dark',
        kind: 'prop',
        budget: { triangles: [12, 12, 12] },
        build(ctx) {
          ctx.part('b', box({ size: [1, 1, 1], at: [0, 0, 0.5], color: [0.01, 0.01, 0.01] }));
        },
      }),
    );
    const r = renderIcon(dark, { size: 64, backdrop: 'transparent', sheet });
    const mean = (pick: (a: number) => boolean): number => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < r.mask.length; i++) {
        if (!pick(r.rgba[i * 4 + 3] ?? 0)) continue;
        sum += ((r.rgba[i * 4] ?? 0) + (r.rgba[i * 4 + 1] ?? 0) + (r.rgba[i * 4 + 2] ?? 0)) / 3;
        n++;
      }
      expect(n).toBeGreaterThan(20);
      return sum / n;
    };
    const inside = mean((a) => a === 255);
    const rim = mean((a) => a > 0 && a < 128);
    expect(rim).toBeLessThan(inside + 40);
    // Alpha is the coverage mask, and a pixel the asset never touches is fully clear.
    for (let i = 0; i < r.mask.length; i++) expect(r.rgba[i * 4 + 3]).toBe(r.mask[i] ?? -1);
    expect([...r.rgba.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it('a transparent icon of glass does not bake in the studio backdrop: alpha says how see-through', () => {
    // A glass ball alone: everything behind it is backdrop. With and without the studio floor
    // (`medium: 'water'` drops it) the studio icons differ, the cut-outs must not.
    const ring = Array.from({ length: 9 }, (_, k): [number, number] => {
      const a = (k / 8) * Math.PI;
      return [Math.sin(a) * 0.5, 0.5 - Math.cos(a) * 0.5];
    });
    const ball = compile(
      defineAsset({
        name: 'ball',
        kind: 'prop',
        budget: { triangles: [400, 400, 400] },
        build(ctx) {
          ctx.part('glass', lathe({ profile: ring, segments: 16, color: [0.9, 0.95, 1] }), {
            surface: 'glass',
          });
        },
      }),
    );
    const o = { size: 48, sheet } as const;
    const floorless = { ...ball, medium: 'water' } as const;
    expect(Bun.hash(renderIcon(ball, o).rgba)).not.toBe(Bun.hash(renderIcon(floorless, o).rgba));
    const a = renderIcon(ball, { ...o, backdrop: 'transparent' });
    const b = renderIcon(floorless, { ...o, backdrop: 'transparent' });
    expect(Bun.hash(a.rgba)).toBe(Bun.hash(b.rgba));
    // Covered but see-through: alpha below coverage inside the ball, still clear outside it.
    const inside = [...a.mask.keys()].filter((i) => a.mask[i] === 255);
    expect(inside.length).toBeGreaterThan(100);
    expect(inside.every((i) => (a.rgba[i * 4 + 3] ?? 255) < 255)).toBe(true);
    expect([...a.rgba.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it('a studio icon is the beauty render byte for byte, with the same silhouette as the cut-out', () => {
    const studio = renderIcon(red, { size: 48, sheet });
    const shot = { ...ICON_CAMERA, width: 48, height: 48, supersample: 3, sheet };
    const b = renderBeauty(red, { ...shot, window: { x: 0.5, y: 0.5, zoom: 1.06 } });
    expect(Bun.hash(studio.rgba)).toBe(Bun.hash(b.rgba));
    expect(Bun.hash(renderIcon(red, { size: 48, sheet, backdrop: 'studio' }).rgba)).toBe(
      Bun.hash(b.rgba),
    );
    expect(Bun.hash(renderIcon(red, { size: 48, sheet, backdrop: 'transparent' }).mask)).toBe(
      Bun.hash(studio.mask),
    );
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
