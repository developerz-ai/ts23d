import { afterAll, describe, expect, test } from 'bun:test';
import type { Group as GroupType } from 'three';

// three.js mints every object's UUID from Math.random, which the test preload seals (recipes must
// not use it). Nothing here depends on those ids: a fixed sequence stands in while this file runs,
// and three is imported only after it is in place.
const sealed = Math.random;
let tick = 0;
Math.random = () => (tick++ % 997) / 997;
afterAll(() => {
  Math.random = sealed;
});

const { Box3, Color, Group, Line, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } = await import(
  'three'
);
const { clearOverlay, dimensions, humanFigure, measureLine } = await import('./measure-overlay.ts');

const BOX = new Box3(new Vector3(-1, 0, -2), new Vector3(1, 1.5, 2));

/** Every geometry and material under `root`, each with a flag set when it is disposed. */
function watch(root: GroupType): { disposed: boolean }[] {
  const seen = new Map<object, { disposed: boolean }>();
  root.traverse((o) => {
    if (!(o instanceof Mesh) && !(o instanceof Line)) return;
    for (const res of [o.geometry, ...[o.material].flat()]) {
      if (seen.has(res)) continue;
      const flag = { disposed: false };
      seen.set(res, flag);
      res.addEventListener('dispose', () => {
        flag.disposed = true;
      });
    }
  });
  return [...seen.values()];
}

describe('clearOverlay', () => {
  test('detaching alone frees nothing: Group.clear leaves every buffer and material alive', () => {
    const layer = new Group().add(dimensions(BOX, new Color('#123456')));
    const resources = watch(layer);
    layer.clear();
    expect(resources.length).toBeGreaterThan(0);
    expect(resources.some((r) => r.disposed)).toBe(false);
  });

  test('disposes every geometry and material of the dimensions, the figure and a ruler', () => {
    const layer = new Group();
    layer.add(dimensions(BOX, new Color('#123456')), humanFigure(BOX));
    const dot = new Mesh(new SphereGeometry(0.01), new MeshBasicMaterial());
    const line = measureLine(new Vector3(), new Vector3(0, 1, 0), '1.00 m', new Color('red'), 0.1);
    layer.add(dot, line);
    const resources = watch(layer);
    // 3 dimension lines × (line + cone, 2 materials) + figure (6 geometries, 1 material) + ruler.
    expect(resources.length).toBeGreaterThanOrEqual(20);
    clearOverlay(layer);
    expect(resources.filter((r) => !r.disposed)).toEqual([]);
    expect(layer.children).toEqual([]);
  });

  test('an empty group clears without complaint', () => {
    expect(() => clearOverlay(new Group())).not.toThrow();
  });
});
