// Runs the mesh optimiser (passes/optimize: weld → vertex cache → vertex fetch) over every part
// headed for the GLB, and sums what it did into one report the CLI and manifest can print.

import type { CompiledAsset } from '../core/index.ts';
import { type OptimizeOptions, type OptimizeReport, optimize } from '../passes/index.ts';

export interface PartOptimizeReport extends OptimizeReport {
  readonly part: string;
}

/** Totals over all parts; ACMR/ATVR are triangle-weighted means. */
export interface ExportReport {
  readonly optimized: boolean;
  readonly verticesBefore: number;
  readonly verticesAfter: number;
  readonly trianglesBefore: number;
  readonly trianglesAfter: number;
  readonly degenerate: number;
  readonly duplicate: number;
  readonly acmrBefore: number;
  readonly acmr: number;
  readonly atvrBefore: number;
  readonly atvr: number;
  readonly parts: readonly PartOptimizeReport[];
}

export function summarize(parts: readonly PartOptimizeReport[], optimized: boolean): ExportReport {
  const sum = (f: (r: PartOptimizeReport) => number): number => parts.reduce((s, r) => s + f(r), 0);
  const tb = sum((r) => r.trianglesBefore);
  const ta = sum((r) => r.trianglesAfter);
  const mean = (f: (r: PartOptimizeReport) => number, by: number, w: 'b' | 'a'): number =>
    by ? sum((r) => f(r) * (w === 'b' ? r.trianglesBefore : r.trianglesAfter)) / by : 0;
  return {
    optimized,
    verticesBefore: sum((r) => r.verticesBefore),
    verticesAfter: sum((r) => r.verticesAfter),
    trianglesBefore: tb,
    trianglesAfter: ta,
    degenerate: sum((r) => r.degenerate),
    duplicate: sum((r) => r.duplicate),
    acmrBefore: mean((r) => r.acmrBefore, tb, 'b'),
    acmr: mean((r) => r.acmr, ta, 'a'),
    atvrBefore: mean((r) => r.atvrBefore, tb, 'b'),
    atvr: mean((r) => r.atvr, ta, 'a'),
    parts,
  };
}

/** Optimise every part mesh. `false` passes meshes through and reports them as-is. */
export function optimizeParts(
  asset: CompiledAsset,
  o: OptimizeOptions | false,
): { asset: CompiledAsset; report: ExportReport } {
  const reports: PartOptimizeReport[] = [];
  const parts = asset.parts.map((p) => {
    if (!p.mesh || p.mesh.indices.length === 0) return p;
    if (o === false) {
      const v = p.mesh.positions.length / 3;
      const t = p.mesh.indices.length / 3;
      reports.push({
        part: p.name,
        verticesBefore: v,
        verticesAfter: v,
        trianglesBefore: t,
        trianglesAfter: t,
        degenerate: 0,
        duplicate: 0,
        acmrBefore: 0,
        acmr: 0,
        atvrBefore: 0,
        atvr: 0,
      });
      return p;
    }
    const { mesh, report } = optimize(p.mesh, o);
    reports.push({ part: p.name, ...report });
    return { ...p, mesh };
  });
  return { asset: { ...asset, parts }, report: summarize(reports, o !== false) };
}
