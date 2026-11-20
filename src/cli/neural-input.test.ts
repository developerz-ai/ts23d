// checkMeshInputs (neural-input.ts): every view of a mesh request — `image` and each of `images`
// (Meshy multi-image-to-3d) — passes the input-image rules before anything is sent.

import { describe, expect, it } from 'bun:test';
import { dmath, encodePng, type NeuralInput, Ts23dError } from '../core/index.ts';
import { type NeuralJob, sha256Hex } from '../neural/index.ts';
import { checkMeshInputs } from './neural-input.ts';

/** A 600² grey blob on a plain background, or on the snow-photo clutter (D55). */
function view(clutter: boolean): Uint8Array {
  const w = 600;
  const px = new Uint8Array(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const g = (((dmath.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) + 1) % 1;
      const blob = dmath.pow((x - 300) / 200, 2) + dmath.pow((y - 300) / 150, 2) <= 1;
      const bg = clutter ? (x % 70 < 9 ? 40 + 30 * g : 200 + 50 * g) : 250;
      const v = blob ? 70 + 90 * g : bg;
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
  return encodePng(w, w, px);
}
const clean = view(false);
const messy = view(true);
const ref = (b: Uint8Array): NeuralInput => ({ sha256: sha256Hex(b), mime: 'image/png' });

const job = (
  image: Uint8Array | undefined,
  images: readonly Uint8Array[],
  bytes: readonly Uint8Array[] = [...(image ? [image] : []), ...images],
): NeuralJob => ({
  task: 'mesh',
  request: {
    seed: 1,
    ...(image ? { image: ref(image) } : {}),
    ...(images.length ? { images: images.map(ref) } : {}),
  },
  inputs: new Map(bytes.map((b) => [sha256Hex(b), b])),
});

const thrown = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Ts23dError('T3D_CLI_USAGE', { cause: 'nothing thrown', fix: 'expected a throw' });
};

describe('checkMeshInputs: every view', () => {
  it('a cluttered second view (images[0]) is T3D_NEURAL_INPUT naming image 1', () => {
    const e = thrown(() => checkMeshInputs('statue', job(clean, [messy])));
    expect(e.code).toBe('T3D_NEURAL_INPUT');
    expect(e.message).toMatch(/statue: mesh input image 1 [0-9a-f]{12}…: .*background/);
  });

  it('images without image: each view is checked, indexed from 0', () => {
    const e = thrown(() => checkMeshInputs('statue', job(undefined, [clean, messy])));
    expect(e.message).toContain('mesh input image 1');
  });

  it('a view without bytes is an error, not a pass', () => {
    const e = thrown(() => checkMeshInputs('statue', job(clean, [clean, messy], [clean])));
    expect(e.code).toBe('T3D_NEURAL_INPUT');
    expect(e.message).toMatch(/mesh input image 2 [0-9a-f]{12}…: has no bytes/);
    // --allow-bad-input waives image rules, never missing bytes.
    expect(() => checkMeshInputs('statue', job(clean, [messy], [clean]), true)).toThrow(
      'has no bytes',
    );
  });

  it('--allow-bad-input returns each finding prefixed with its image index', () => {
    const notes = checkMeshInputs('statue', job(messy, [clean, messy]), true);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => n.includes('mesh input image 0'))).toBe(true);
    expect(notes.some((n) => n.includes('mesh input image 2'))).toBe(true);
    expect(notes.some((n) => n.includes('mesh input image 1'))).toBe(false);
  });

  it('clean views and non-mesh tasks pass', () => {
    expect(checkMeshInputs('statue', job(clean, [clean]))).toEqual([]);
    const image: NeuralJob = {
      task: 'image',
      request: { seed: 1, prompt: 'x', width: 4, height: 4 },
    };
    expect(checkMeshInputs('statue', image)).toEqual([]);
  });
});
