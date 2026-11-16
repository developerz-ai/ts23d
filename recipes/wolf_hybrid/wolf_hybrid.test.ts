// The hybrid's contract: with no cache it IS the code wolf; with the committed cache the model
// replaces the head's surface (skull, muzzle, ears) and adds the torso's ruff, while forearms,
// shanks, paws and tail move by at most the skin amplitude (code owns them), the mass stays the
// code's, LOD2 takes the colour only, and the build is byte-identical twice.

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { clearNeuralSources, compile, toGlb } from '@developerz.ai/ts23d';
import { massProperties } from '@developerz.ai/ts23d/physics';
import { provideRecipeNeural } from '../../src/cli/neural-store.ts';
import { shareOf } from './masks.ts';
import { BLEND } from './surface.ts';
import { wolf_hybrid } from './wolf_hybrid.ts';

const SLOW = 300_000;
const file = join(import.meta.dir, 'wolf_hybrid.ts');
const part = (lod: 0 | 1 | 2, name: string) => {
  const a = compile(wolf_hybrid, { lod });
  return { a, mesh: a.parts.find((p) => p.name === name)?.mesh };
};
const moves = (a: Float32Array, b: Float32Array): Float64Array =>
  Float64Array.from({ length: a.length / 3 }, (_, v) =>
    Math.hypot(
      (a[v * 3] ?? 0) - (b[v * 3] ?? 0),
      (a[v * 3 + 1] ?? 0) - (b[v * 3 + 1] ?? 0),
      (a[v * 3 + 2] ?? 0) - (b[v * 3 + 2] ?? 0),
    ),
  );

describe('wolf_hybrid', () => {
  it(
    'no cache: the code wolf; the cache reshapes the head, keeps legs and tail, keeps the mass',
    async () => {
      clearNeuralSources();
      const cpu = part(1, 'body');
      const cpuHead = part(1, 'head').mesh;
      await provideRecipeNeural(file, ['wolf_hybrid'], true);
      const hy = part(1, 'body');
      const hyHead = part(1, 'head').mesh;
      clearNeuralSources();
      const [a, b] = [cpu.mesh?.positions, hy.mesh?.positions];
      if (!a || !b || !cpuHead || !hyHead || !cpu.mesh) throw new Error('no body or head part');
      expect(b.length).toBe(a.length);
      // The head takes the model's skull: centimetres, not millimetres.
      const head = moves(cpuHead.positions, hyHead.positions);
      expect(Math.max(...head)).toBeGreaterThan(0.03);
      // Where the share is ~0 (< 0.001: forearm, shank, paws, tail) only the skin move: ≤ BLEND.skin.amp.
      const bones = cpu.a.skeleton?.bones.map((x) => x.name) ?? [];
      const share = shareOf(cpu.mesh, bones, true);
      const body = moves(a, b);
      let kept = 0;
      let worst = 0;
      share.forEach((s, v) => {
        if (s >= 1e-3) return;
        kept++;
        worst = Math.max(worst, body[v] ?? 0);
      });
      expect(kept).toBeGreaterThan(1000);
      expect(worst).toBeLessThanOrEqual(BLEND.skin.amp + 1e-6);
      // Code owns the mass: reshaped parts keep it.
      expect(massProperties(hy.a).mass).toBeCloseTo(massProperties(cpu.a).mass, 1);
    },
    SLOW,
  );

  it(
    'LOD2 takes the colour only (same shape); the cached build is byte-identical twice',
    async () => {
      clearNeuralSources();
      const plain = part(2, 'body').mesh;
      await provideRecipeNeural(file, ['wolf_hybrid'], true);
      const hy = part(2, 'body').mesh;
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
