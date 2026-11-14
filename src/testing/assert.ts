// Assertions for a recipe's own `bun test` (or any runner): each compiles the asset, checks one
// property, and throws a Ts23dError with the findings and a fix — no test framework imported.
//   it('passes QA', () => assertQaPass(tiger_1));
//   it('has its pivots', () => assertParts(tiger_1, ['turret', 'gun', 'wheel_l_*']));

import { type Asset, type Lod, type Measure, TOLERANCE } from '../core/index.ts';
import {
  clashes,
  DEFAULT_GATES,
  DEFAULT_LOD_GATES,
  type Gate,
  glob,
  type LodGate,
  measure,
  runLodQa,
  runQa,
} from '../qa/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';

export interface QaOptions extends LodOptions {
  /** Per-LOD gates. Default the build's DEFAULT_GATES. */
  readonly gates?: readonly Gate[];
  /** Chain gates over all compiled LODs. Default DEFAULT_LOD_GATES. */
  readonly lodGates?: readonly LodGate[];
}

/** The same gate `t3d build` runs: every LOD passes QA, plus the LOD-chain gates. */
export function assertQaPass(asset: Asset, o: QaOptions = {}): void {
  const lods = compileLods(asset, o);
  const found = lods.flatMap((a) =>
    runQa(a, o.gates ?? DEFAULT_GATES).map((finding) => ({ finding, lod: a.lod })),
  );
  const chain = lods.length > 1 ? runLodQa(lods, o.lodGates ?? DEFAULT_LOD_GATES) : [];
  failOn(`${asset.name} QA`, [...found, ...chain.map((finding) => ({ finding }))]);
}

/** Triangles per LOD at or under `caps` (default: the asset's own budget). */
export function assertBudget(
  asset: Asset,
  caps: readonly [number, number, number] = asset.budget.triangles,
  o: LodOptions = {},
): void {
  failOn(
    `${asset.name} budget`,
    compileLods(asset, o).flatMap((a) => {
      const tris = a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);
      const cap = caps[a.lod];
      return tris > cap
        ? [
            {
              lod: a.lod,
              finding: {
                gate: 'budget',
                code: 'T3D_QA_BUDGET',
                message: `${tris} triangles > ${cap}`,
                fix: 'drop detail at this LOD (ctx.lod / ctx.pick) — never raise a cap to make a test pass',
              },
            },
          ]
        : [];
    }),
  );
}

/** Each selector (name or glob) matches at least one part at every LOD checked. */
export function assertParts(asset: Asset, selectors: readonly string[], o: LodOptions = {}): void {
  failOn(
    `${asset.name} parts`,
    compileLods(asset, o).flatMap((a) =>
      selectors
        .filter((s) => !a.parts.some((p) => glob(s).test(p.name)))
        .map((s) => ({
          lod: a.lod,
          finding: {
            gate: 'parts',
            code: 'T3D_QA_PARTS',
            message: `no part matches '${s}'`,
            fix: 'engines bind to these names: add the part/group at this LOD (gate its geometry, not its pivot)',
          },
        })),
    ),
  );
}

/** One spec dimension at LOD0, the way the `measures` gate checks `real.measures`. */
export function assertMeasure(asset: Asset, m: Measure, o: { lod?: Lod } = {}): number {
  const [a] = compileLods(asset, { lods: [o.lod ?? 0] });
  const got = a ? measure(a, m) : null;
  const tol = m.tolerance ?? TOLERANCE.measure;
  const bad = got === null || !(Math.abs(got - m.value) / m.value <= tol);
  failOn(
    `${asset.name} measure`,
    bad
      ? [
          {
            finding: {
              gate: 'measure',
              code: 'T3D_QA_MEASURE',
              message:
                got === null
                  ? `'${m.label}': no part matches ${JSON.stringify(m.parts ?? m.between)}`
                  : `${m.label}: ${got.toFixed(3)} m on ${m.axis.toUpperCase()}, want ${m.value} m (±${tol * 100}%)`,
              fix: 'rebuild the part from the spec number; never edit the spec to match the model',
            },
          },
        ]
      : [],
  );
  return got ?? Number.NaN;
}

/** Every moving part sweeps clear of everything else (the `clashes` gate), at every LOD. */
export function assertMotionClear(asset: Asset, o: LodOptions = {}): void {
  failOn(
    `${asset.name} motion`,
    compileLods(asset, o).flatMap((a) => clashes(a).map((finding) => ({ finding, lod: a.lod }))),
  );
}
