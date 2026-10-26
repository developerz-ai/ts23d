// manifest.json per asset: what an engine pipeline or an agent needs without opening a GLB —
// files, triangles per LOD, pivots (the names game code binds to), emitters, surfaces, QA,
// measures with their measured values, sources.

import type { Asset, CompiledAsset } from '../core/index.ts';
import { mergeToPivots } from '../export/index.ts';
import { type Finding, measure } from '../qa/index.ts';

export interface AssetManifest {
  readonly name: string;
  readonly kind: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly files: {
    readonly lods: readonly string[];
    readonly sheet?: string;
    readonly thumb?: string;
  };
  readonly triangles: readonly number[];
  readonly drawCalls: readonly number[];
  readonly pivots: readonly { name: string; parent: string | null; motion?: string }[];
  readonly emitters: readonly { name: string; kind: string; when: string }[];
  readonly sockets: readonly { name: string; kind: string; parent: string | null }[];
  readonly surfaces: readonly string[];
  readonly real?: { length: number; width: number; height: number };
  readonly measures: readonly {
    label: string;
    spec: number;
    measured: number | null;
    source?: string;
  }[];
  readonly sources: readonly string[];
  readonly qa: { readonly pass: boolean; readonly findings: readonly Finding[] };
}

const tris = (a: CompiledAsset): number =>
  a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);

export function manifestOf(
  asset: Asset,
  lods: readonly CompiledAsset[],
  files: AssetManifest['files'],
  findings: readonly Finding[],
): AssetManifest {
  const top = lods[0];
  const merged = top ? mergeToPivots(top) : null;
  return {
    name: asset.name,
    kind: asset.kind,
    ...(asset.description ? { description: asset.description } : {}),
    tags: asset.tags ?? [],
    files,
    triangles: lods.map(tris),
    drawCalls: lods.map((l) => mergeToPivots(l).parts.filter((p) => p.mesh).length),
    pivots: (merged?.parts ?? [])
      .filter((p) => !p.emitter && !p.socket)
      .map((p) => ({
        name: p.name,
        parent: p.parent,
        ...(p.motion ? { motion: p.motion.kind } : {}),
      })),
    emitters: (top?.parts ?? []).flatMap((p) =>
      p.emitter ? [{ name: p.name, kind: p.emitter.kind, when: p.emitter.when ?? 'always' }] : [],
    ),
    sockets: (top?.parts ?? []).flatMap((p) =>
      p.socket ? [{ name: p.name, kind: p.socket.kind, parent: p.parent }] : [],
    ),
    surfaces: [...new Set((top?.parts ?? []).map((p) => p.surface ?? 'opaque'))].sort(),
    ...(asset.real
      ? { real: { length: asset.real.length, width: asset.real.width, height: asset.real.height } }
      : {}),
    measures: (asset.real?.measures ?? []).map((m) => ({
      label: m.label,
      spec: m.value,
      measured: top ? measure(top, m) : null,
      ...(m.source ? { source: m.source } : {}),
    })),
    sources: asset.sources ?? [],
    qa: { pass: findings.length === 0, findings },
  };
}
