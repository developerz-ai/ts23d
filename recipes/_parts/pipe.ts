// A rigid pipe with filleted bends, or a sagging flexible hose (Catmull-Rom smoothed), along a
// polyline; optional flanges at both ends (composes `flange`). Path = flat [x, y, z, …] in metres.

import { definePart, merge, sweep, type Vec3 } from '@developerz.ai/ts23d';
import { flange } from './flange.ts';
import { filletPath, inset, smoothPath } from './path.ts';
import { alongAxis, PAINT_GREEN, RUBBER } from './shape.ts';

export const pipe = definePart({
  name: 'pipe',
  description: 'pipe with filleted bends, or a smooth hose, along a polyline; optional end flanges',
  tags: ['pipe', 'industrial', 'hose'],
  params: {
    path: [0, 0, 0, 1, 0, 0, 1, 0, 0.8] as readonly number[],
    diameter: 0.114,
    style: 'pipe' as 'pipe' | 'hose',
    bend: 1.5,
    flanges: true,
  },
  schema: {
    path: { doc: 'polyline as flat x, y, z triples (metres), at least two points' },
    diameter: { min: 0.006, max: 2, unit: 'm', doc: 'outside diameter' },
    style: { oneOf: ['pipe', 'hose'], doc: 'pipe: straight runs + fillets; hose: smooth spline' },
    bend: { min: 0.5, max: 10, doc: 'bend radius in pipe diameters (pipe style)' },
    flanges: { doc: 'weld-neck flanges at both ends (pipe style)' },
  },
  validate: (p) =>
    p.path.length % 3 !== 0 || p.path.length < 6
      ? 'path must be ≥ 2 points as flat x, y, z triples'
      : undefined,
  build(b, p) {
    const pts: Vec3[] = [];
    for (let i = 0; i < p.path.length; i += 3)
      pts.push([p.path[i] ?? 0, p.path[i + 1] ?? 0, p.path[i + 2] ?? 0]);
    const hose = p.style === 'hose';
    const steps = b.pick([8, 4, 2]);
    // Pipe ends stop 3 mm inside the flange faces, so the tube cap never z-fights the face.
    const run = hose || !p.flanges ? pts : inset(pts, 0.003);
    const path = hose ? smoothPath(run, steps) : filletPath(run, p.bend * p.diameter, steps);
    const tube = sweep({
      section: { radius: p.diameter / 2, segments: b.pick([16, 10, 6]) },
      path,
      caps: true,
      color: hose ? RUBBER : PAINT_GREEN,
      strip: hose ? 'rubber' : 'steel_painted',
    });
    if (hose || !p.flanges) return tube;
    const f = b.mesh(flange, {
      pipe: p.diameter,
      outer: p.diameter * 1.9,
      bolts: p.diameter > 0.08 ? 8 : 4,
      boltSize: p.diameter > 0.08 ? 'M16' : 'M10',
    });
    const a = pts[0] ?? [0, 0, 0];
    const a1 = pts[1] ?? [1, 0, 0];
    const z = pts[pts.length - 1] ?? [1, 0, 0];
    const z1 = pts[pts.length - 2] ?? [0, 0, 0];
    const dir = (from: Vec3, to: Vec3): Vec3 => [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    return merge([tube, alongAxis(f, dir(a, a1), a), alongAxis(f, dir(z, z1), z)]);
  },
});
