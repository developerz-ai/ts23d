import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, encodePng, type Vec3 } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { project } from './camera.ts';
import { type Mark, type PhotoCamera, perspectiveOf } from './camera-solve.ts';
import { photoMatch, photoView } from './photo-match.ts';
import { resizePhoto, segmentPhoto } from './photo-segment.ts';

const asset = compile(
  defineAsset({
    name: 'bench',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      ctx.part('seat', box({ size: [1.6, 0.4, 0.08], at: [0, 0, 0.45], color: [0.4, 0.25, 0.1] }));
      ctx.part(
        'leg_f',
        box({ size: [0.08, 0.4, 0.45], at: [0.7, 0, 0.205], color: [0.2, 0.2, 0.2] }),
      );
      ctx.part(
        'leg_r',
        box({ size: [0.08, 0.4, 0.45], at: [-0.7, 0, 0.205], color: [0.2, 0.2, 0.2] }),
      );
      ctx.part(
        'back',
        box({ size: [1.6, 0.06, 0.5], at: [0, 0.2, 0.74], color: [0.4, 0.25, 0.1] }),
      );
    },
  }),
);
const CAM: PhotoCamera = { eye: [2.2, -2.6, 1.3], target: [0, 0, 0.45], fovDeg: 35 };
const [W, H] = [320, 240];

/** A "photo": the asset from CAM over an opaque pale-blue sky (segmentation must find it). */
function photo(): Uint8Array {
  const v = photoView(asset, CAM, W, H);
  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++)
    px.set(v.mask[i] ? [...v.rgba.subarray(i * 4, i * 4 + 3), 255] : [200, 215, 235, 255], i * 4);
  return encodePng(W, H, px);
}

const CORNERS: Vec3[] = [
  [0.8, -0.2, 0.49],
  [-0.8, -0.2, 0.49],
  [0.8, 0.23, 0.99],
  [-0.8, 0.23, 0.99],
  [0.74, -0.2, 0],
  [-0.74, 0.2, 0],
  [0.8, 0.2, 0.41],
];
const marks = (): Mark[] => {
  const pc = perspectiveOf(CAM, W, H);
  return CORNERS.map((p) => {
    const [x, y] = project(pc, p[0], p[1], p[2]);
    return { px: [x, y], world: p };
  });
};

describe('photoMatch', () => {
  it('refuses a photo that is not PNG and a call with no camera', () => {
    expect(() => photoMatch(asset, { photo: new Uint8Array([1, 2, 3]), camera: CAM })).toThrow(
      /not a PNG/,
    );
    expect(() => photoMatch(asset, { photo: photo() })).toThrow(/neither camera nor marks/);
  });

  it('matches the asset against a photo from its own camera', () => {
    const m = photoMatch(asset, { photo: photo(), camera: CAM });
    expect(m.iou).toBeGreaterThan(0.97);
    const sheet = decodePng(m.png, (c) => {
      throw new Error(c);
    });
    expect([sheet.width, sheet.height]).toEqual([W, H * 3]);
    expect(m.errorMap.length).toBe(W * H);
  });

  it('drops IoU and marks misses under a wrong camera', () => {
    const m = photoMatch(asset, { photo: photo(), camera: { ...CAM, eye: [2.6, -1.4, 1.6] } });
    expect(m.iou).toBeLessThan(0.8);
    expect(m.errorMap.some((e) => e === 1)).toBe(true);
  });

  it('solves the camera from marks and lands on the silhouette', () => {
    const m = photoMatch(asset, { photo: photo(), marks: marks() });
    expect(m.iou).toBeGreaterThan(0.95);
    expect(Math.abs(m.camera.fovDeg - CAM.fovDeg)).toBeLessThan(2);
  });

  it('is deterministic', () => {
    const a = photoMatch(asset, { photo: photo(), marks: marks(), width: 160 });
    const b = photoMatch(asset, { photo: photo(), marks: marks(), width: 160 });
    expect(a.png).toEqual(b.png);
  });
});

describe('segmentPhoto / resizePhoto', () => {
  it('uses alpha when present and floods an opaque background otherwise', () => {
    const data = new Uint8Array(20 * 20 * 4);
    for (let i = 0; i < 400; i++) {
      const [x, y] = [i % 20, Math.floor(i / 20)];
      const inside = x >= 5 && x < 15 && y >= 6 && y < 14;
      data.set(inside ? [90, 60, 40, 255] : [230, 230, 240, 255], i * 4);
    }
    const flood = segmentPhoto({ width: 20, height: 20, data });
    expect(flood.reduce((s, v) => s + v, 0)).toBe(80);
    const cut = data.map((v, i) => (i % 4 === 3 && flood[i >> 2] === 0 ? 0 : v));
    expect(segmentPhoto({ width: 20, height: 20, data: cut })).toEqual(flood);
    expect(resizePhoto({ width: 20, height: 20, data }, 10).height).toBe(10);
  });
});
