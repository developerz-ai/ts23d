import { expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { contactSheet } from './sheet.ts';

it('renders a six-view PNG', () => {
  const a = defineAsset({
    name: 'cube',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) => {
      ctx.part('body', box({ size: [1, 1, 1], color: [0.6, 0.2, 0.2] }));
    },
  });
  const png = contactSheet(compile(a), { cell: 64 });
  expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  expect(Bun.hash(png)).toBe(Bun.hash(contactSheet(compile(a), { cell: 64 })));
});
