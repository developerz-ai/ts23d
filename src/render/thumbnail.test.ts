import { expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { thumbnail } from './thumbnail.ts';

it('renders a deterministic transparent-background PNG', () => {
  const a = defineAsset({
    name: 'cube',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [0.6, 0.2, 0.2] })),
  });
  const png = thumbnail(compile(a), { size: 64 });
  expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  expect(Bun.hash(png)).toBe(Bun.hash(thumbnail(compile(a), { size: 64 })));
});
