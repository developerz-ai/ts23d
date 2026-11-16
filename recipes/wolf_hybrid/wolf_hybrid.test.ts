// The hybrid's contract: with no cache it IS the code wolf; with the committed cache the model
// moves the coat by at most the blend's amplitude (anatomy and the gates stay the code's), paints
// it with the model's texture, and rebuilds byte-identically.

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { clearNeuralSources, compile, toGlb } from '@developerz.ai/ts23d';
import { provideRecipeNeural } from '../../src/cli/neural-store.ts';
import { BLEND } from './surface.ts';
import { wolf_hybrid } from './wolf_hybrid.ts';

const SLOW = 300_000;
const file = join(import.meta.dir, 'wolf_hybrid.ts');
const body = (lod: 0 | 1 | 2) =>
  compile(wolf_hybrid, { lod }).parts.find((p) => p.name === 'body')?.mesh;

describe('wolf_hybrid', () => {
  it(
    'no cache: the code body; the committed cache moves it, never more than BLEND.amp',
    async () => {
      clearNeuralSources();
      const cpu = body(1);
      await provideRecipeNeural(file, ['wolf_hybrid'], true);
      const hybrid = body(1);
      clearNeuralSources();
      expect(cpu && hybrid).toBeTruthy();
      expect(cpu?.positions.length).toBe(hybrid?.positions.length);
      // The cache is committed: the model must have moved something…
      let moved = 0;
      let worst = 0;
      const a = cpu?.positions ?? new Float32Array();
      const b = hybrid?.positions ?? new Float32Array();
      for (let i = 0; i < a.length; i += 3) {
        const d = Math.hypot(
          (a[i] ?? 0) - (b[i] ?? 0),
          (a[i + 1] ?? 0) - (b[i + 1] ?? 0),
          (a[i + 2] ?? 0) - (b[i + 2] ?? 0),
        );
        if (d > 1e-4) moved++;
        worst = Math.max(worst, d);
      }
      expect(moved / (a.length / 3)).toBeGreaterThan(0.3);
      // …and never more than the blend's amplitude: code owns the anatomy.
      expect(worst).toBeLessThanOrEqual(BLEND.amp + 1e-6);
    },
    SLOW,
  );

  it(
    'LOD2 takes the colour only (same shape); the cached build is byte-identical twice',
    async () => {
      clearNeuralSources();
      const plain = compile(wolf_hybrid, { lod: 2 }).parts.find((p) => p.name === 'body')?.mesh;
      await provideRecipeNeural(file, ['wolf_hybrid'], true);
      const hy = compile(wolf_hybrid, { lod: 2 }).parts.find((p) => p.name === 'body')?.mesh;
      expect(Bun.hash(hy?.positions ?? new Float32Array())).toBe(
        Bun.hash(plain?.positions ?? new Float32Array()),
      );
      expect(Bun.hash(hy?.colors ?? new Float32Array())).not.toBe(
        Bun.hash(plain?.colors ?? new Float32Array()),
      );
      const once = Bun.hash(toGlb(compile(wolf_hybrid, { lod: 1 })));
      expect(Bun.hash(toGlb(compile(wolf_hybrid, { lod: 1 })))).toBe(once);
      clearNeuralSources();
    },
    SLOW,
  );
});
