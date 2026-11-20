// The nose meets the grit head on: `roadFilm` puts spray on the nose (x > 1.85 m), so the fleck
// sampler must reach it. Failure first: it stopped at the station where the rocker is at x 1.75 m,
// where no sampled line passes 1.8 m, and the nose carried no flecks at all.
import { describe, expect, test } from 'bun:test';
import { compile } from '@developerz.ai/ts23d';
import { roadster_v10 } from '../roadster_v10.ts';

describe('roadster_v10 road spatter', () => {
  test('flecks reach the nose', () => {
    const c = compile(roadster_v10, { lod: 1 });
    const film = c.parts.find((p) => p.name === 'road_film');
    const pos = film?.mesh?.positions ?? new Float32Array();
    let nose = 0;
    for (let i = 0; i < pos.length / 3; i++) if ((pos[i * 3] ?? 0) > 1.85) nose++;
    expect(nose).toBeGreaterThan(30);
  }, 120_000);
});
