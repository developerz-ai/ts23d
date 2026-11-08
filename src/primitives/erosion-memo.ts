// Exact memo for erosion across LODs: a recipe erodes the SAME grid with the SAME droplets in
// every `compile` (LOD0/1/2 in one process), and the simulation is LOD-independent. Keys are the
// full inputs compared element by element (no hash, so no collision), results are copied in and
// out (a caller mutating its grid cannot poison the memo). A few entries, oldest dropped first.

export interface MemoKey {
  /** Every scalar input (sizes, rect, resolved options). */
  readonly scalars: readonly number[];
  /** Every array input (heights, droplet starts). */
  readonly arrays: readonly Float64Array[];
}

const KEEP = 4;

const same = (a: MemoKey, b: MemoKey): boolean =>
  a.scalars.length === b.scalars.length &&
  a.arrays.length === b.arrays.length &&
  a.scalars.every((v, i) => Object.is(v, b.scalars[i])) &&
  a.arrays.every((x, i) => {
    const y = b.arrays[i];
    if (!y || x.length !== y.length) return false;
    for (let k = 0; k < x.length; k++) if (!Object.is(x[k], y[k])) return false;
    return true;
  });

const copy = (v: readonly Float64Array[]): Float64Array[] => v.map((a) => a.slice());

/** A memo of `run(key)` → arrays, exact on its key. */
export function arrayMemo(): (key: MemoKey, run: () => Float64Array[]) => Float64Array[] {
  const entries: { key: MemoKey; value: Float64Array[] }[] = [];
  return (key, run) => {
    const hit = entries.find((e) => same(e.key, key));
    if (hit) return copy(hit.value);
    const value = run();
    entries.push({
      key: { scalars: [...key.scalars], arrays: copy(key.arrays) },
      value: copy(value),
    });
    if (entries.length > KEEP) entries.shift();
    return value;
  };
}
