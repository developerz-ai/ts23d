// River plan shapes shared by the terrain tiles: the least-cost floor path (ground.ts
// `valleyPath`) runs in long straight runs that read as a road from above; `meander` swings it
// into bends where the floor is wide enough to wander.

/**
 * A river's meanders over a plan path: resampled every `step` m and pushed sideways by
 * `amplitude(x, y)` m along a wave of `wavelength` m (plus a 0.43× harmonic so no two bends
 * match). The least-cost floor path runs in long straight runs that read as a road; `amplitude`
 * says where the floor leaves room to wander (0 in a gorge). The ends stay put.
 */
export function meander(
  path: readonly [number, number][],
  o: {
    readonly amplitude: (x: number, y: number) => number;
    readonly wavelength: number;
    readonly step: number;
  },
): [number, number][] {
  const run = [0];
  for (let i = 1; i < path.length; i++) {
    const a: readonly [number, number] = path[i - 1] ?? [0, 0];
    const b: readonly [number, number] = path[i] ?? [0, 0];
    run.push((run[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = run[run.length - 1] ?? 0;
  /** Point and unit direction at distance `d` along the path. */
  const at = (d: number): [number, number, number, number] => {
    let i = 1;
    while (i < path.length - 1 && (run[i] ?? 0) < d) i++;
    const a: readonly [number, number] = path[i - 1] ?? [0, 0];
    const b: readonly [number, number] = path[i] ?? [0, 0];
    const len = Math.max(1e-9, (run[i] ?? 0) - (run[i - 1] ?? 0));
    const t = Math.min(1, Math.max(0, (d - (run[i - 1] ?? 0)) / len));
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      (b[0] - a[0]) / len,
      (b[1] - a[1]) / len,
    ];
  };
  const n = Math.max(1, Math.round(total / o.step));
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const d = (total * k) / n;
    const [x, y, ux, uy] = at(d);
    // Fade the swing in and out over a wavelength at each end, so the river leaves the tile
    // where the valley does.
    const ends = Math.min(1, d / o.wavelength, (total - d) / o.wavelength);
    const w = (2 * Math.PI * d) / o.wavelength;
    const side = o.amplitude(x, y) * ends * (Math.sin(w) + 0.35 * Math.sin(0.43 * w + 1.3));
    out.push([x - uy * side, y + ux * side]);
  }
  return out;
}
