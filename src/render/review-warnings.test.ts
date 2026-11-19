// Review warnings carry stable T3D_REVIEW_* codes that `explain_error` resolves from errors.md.

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { warningsOf } from './review-warnings.ts';

const view = { view: 'SIDE', lod0: { coverage: 0.3, bboxFill: 0.8 }, lodIoU: 0.5 };
const metrics = (mean: number) => ({
  asset: 'x',
  triangles: [1, 1, 1],
  hero: { coverage: 0.3, span: 0.1, mean, contrast: 0.01, nearBlack: 0.5, nearWhite: 0.5 },
  views: [{ ...view, lod2: view.lod0, lodIoUExact: 0.5 }],
});

describe('review warnings', () => {
  it('every warning has a T3D_REVIEW_* code with a row in docs/architecture/errors.md', () => {
    const codes = [...warningsOf(metrics(0.05)), ...warningsOf(metrics(0.95))].map((w) => w.code);
    const doc = readFileSync(join(import.meta.dir, '../../docs/architecture/errors.md'), 'utf8');
    expect(new Set(codes).size).toBe(7);
    for (const code of codes) {
      expect(code).toMatch(/^T3D_REVIEW_[A-Z_]+$/);
      expect(doc).toContain(`| \`${code}\` |`);
    }
  });
});
