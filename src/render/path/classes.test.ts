// Which shading each part gets: skin only on living things (or a `skin` finish), never on their
// eyes, teeth, armour or plinth; cutout cards are strands on creatures, leaves elsewhere.

import { describe, expect, it } from 'bun:test';
import type { Part } from '../../core/index.ts';
import { CLS, partClass } from './classes.ts';

const part = (name: string, extra: Partial<Part> = {}): Part => ({ name, ...extra }) as Part;

describe('partClass', () => {
  it('never makes a prop skin, however its part is named', () => {
    expect(partClass('prop', part('head'))).toBe(CLS.pbr);
    expect(partClass('vehicle', part('skin'))).toBe(CLS.pbr);
  });

  it('makes plain parts of characters and creatures skin, but not their hard parts', () => {
    expect(partClass('character', part('head'))).toBe(CLS.skin);
    expect(partClass('creature', part('body'))).toBe(CLS.skin);
    for (const n of ['eye_l', 'tusks', 'claws', 'plinth', 'pauldrons', 'hair_knot', 'brooch'])
      expect(partClass('character', part(n))).toBe(CLS.pbr);
    expect(partClass('character', part('head', { finish: 'cornea' }))).toBe(CLS.pbr);
  });

  it('honours a skin finish anywhere', () => {
    expect(partClass('prop', part('face', { finish: 'skin_pale' }))).toBe(CLS.skin);
  });

  it('shades cutout cards as strands on living things and as leaves elsewhere', () => {
    expect(partClass('creature', part('fur', { surface: 'cutout' }))).toBe(CLS.hair);
    expect(partClass('vegetation', part('leaves', { surface: 'cutout' }))).toBe(CLS.foliage);
    expect(partClass('prop', part('window', { surface: 'glass' }))).toBe(CLS.thin);
  });
});
