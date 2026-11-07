import { describe, expect, it } from 'bun:test';
import { envRadiance } from './lighting.ts';

describe('envRadiance', () => {
  it('a polished reflection sees the horizon line; a rough one sees a soft blur', () => {
    const contrast = (rough: number): number =>
      envRadiance(0.02, rough, 1) - envRadiance(-0.05, rough, 1);
    expect(contrast(0)).toBeGreaterThan(0.4);
    expect(contrast(1)).toBeLessThan(0.1);
  });

  it('stays positive and bounded everywhere', () => {
    for (let rz = -1; rz <= 1; rz += 0.05)
      for (const rough of [0, 0.3, 1])
        for (let k = 0; k < 3; k++) {
          const v = envRadiance(rz, rough, k);
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(1.2);
        }
  });
});
