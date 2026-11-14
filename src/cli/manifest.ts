// manifest.json per asset: what an engine pipeline or an agent needs without opening a GLB —
// files, triangles per LOD, pivots (the names game code binds to), emitters, joints, surfaces, QA,
// measures with their measured values, sources, paint slots and switchable variants.
// Location-independent: every path in `files` is relative to the manifest's own folder
// (<out>/<asset>/), so two builds into two --out dirs write the same bytes. Per-LOD arrays
// (triangles, drawCalls, lodCoverage) are indexed like `lods`, the levels actually built.

import {
  type Asset,
  type CompiledAsset,
  type Lod,
  linearToHex,
  type WeatherCoverage,
} from '../core/index.ts';
import { mergeToPivots, soundUses } from '../export/index.ts';
import { type Finding, measure } from '../qa/index.ts';

export interface AssetManifest {
  readonly name: string;
  readonly kind: string;
  readonly description?: string;
  readonly tags: readonly string[];
  /** The levels built (`--lods`): entry i of every per-LOD array is LOD `lods[i]`. */
  readonly lods: readonly Lod[];
  /** Paths relative to this manifest's folder. */
  readonly files: {
    readonly lods: readonly string[];
    /** All built LODs in one GLB (MSFT_lod), when `--lods single|both`. */
    readonly single?: string;
    readonly hero?: string;
    readonly sheet?: string;
    readonly thumb?: string;
    /** `<clip>.wav` files the GLBs' KHR_audio_emitter entries reference. */
    readonly sounds?: readonly string[];
  };
  readonly triangles: readonly number[];
  /** MSFT_screencoverage written into `files.single`: where each LOD hands over (last = cull). */
  readonly lodCoverage?: readonly number[];
  readonly drawCalls: readonly number[];
  readonly pivots: readonly { name: string; parent: string | null; motion?: string }[];
  readonly emitters: readonly { name: string; kind: string; when: string }[];
  readonly sockets: readonly { name: string; kind: string; parent: string | null }[];
  /** Sound sources (KHR_audio_emitter): node, clip, what starts it; absent when none. */
  readonly sounds?: readonly {
    node: string;
    clip: string;
    trigger: string;
    loop: boolean;
    seconds: number;
  }[];
  /** Declared connections (`ctx.joint`), checked by QA `joints`; absent when none. */
  readonly joints?: readonly {
    name: string;
    from: string;
    to: string;
    kind: string;
    at: readonly number[];
  }[];
  readonly surfaces: readonly string[];
  /** Paint slots → default colour (sRGB hex); each is one material, one draw per pivot using it. */
  readonly paint?: Readonly<Record<string, string>>;
  /** KHR_materials_variants liveries in the GLBs: name → the slots it repaints (sRGB hex). */
  readonly variants?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly real?: { length: number; width: number; height: number };
  readonly measures: readonly {
    label: string;
    spec: number;
    measured: number | null;
    source?: string;
  }[];
  readonly sources: readonly string[];
  /**
   * Measured weathering at LOD0 per effect (`weather(ctx, …)`): declared `target` (coverage
   * fraction; dents depth, sag/warp max in m), `actual`, the `eligible` selector, its `area` (m²);
   * `by` splits it per weathered target when there are several.
   */
  readonly weather?: Readonly<Record<string, WeatherSummary>>;
  readonly qa: { readonly pass: boolean; readonly findings: readonly Finding[] };
}

const tris = (a: CompiledAsset): number =>
  a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);

/** One draw per merged mesh, glowing parts in their own emissive layer (as the GLB writes them). */
export const drawCallsOf = (l: CompiledAsset): number =>
  mergeToPivots(
    l,
    (l.glow ?? []).map((g) => g.parts),
  ).parts.filter((p) => p.mesh).length;

export function manifestOf(
  asset: Asset,
  lods: readonly CompiledAsset[],
  files: AssetManifest['files'],
  findings: readonly Finding[],
  lodCoverage?: readonly number[],
): AssetManifest {
  const top = lods[0];
  const merged = top ? mergeToPivots(top) : null;
  return {
    name: asset.name,
    kind: asset.kind,
    ...(asset.description ? { description: asset.description } : {}),
    tags: asset.tags ?? [],
    lods: lods.map((l) => l.lod),
    files,
    triangles: lods.map(tris),
    ...(lodCoverage?.length ? { lodCoverage } : {}),
    drawCalls: lods.map(drawCallsOf),
    pivots: (merged?.parts ?? [])
      .filter((p) => !p.emitter && !p.socket && !p.audio)
      .map((p) => ({
        name: p.name,
        parent: p.parent,
        ...(p.motion ? { motion: p.motion.kind } : {}),
      })),
    emitters: (top?.parts ?? []).flatMap((p) =>
      p.emitter ? [{ name: p.name, kind: p.emitter.kind, when: p.emitter.when ?? 'always' }] : [],
    ),
    // From the merged parts: `parent` must name a node the GLB has.
    sockets: (merged?.parts ?? []).flatMap((p) =>
      p.socket ? [{ name: p.name, kind: p.socket.kind, parent: p.parent }] : [],
    ),
    ...soundsOf(top),
    ...(top?.joints?.length
      ? {
          joints: top.joints.map((j) => ({
            name: j.name,
            from: j.from,
            to: j.to,
            kind: j.kind ?? 'flush',
            at: j.at.map((v) => Math.round(v * 1e4) / 1e4),
          })),
        }
      : {}),
    surfaces: [...new Set((top?.parts ?? []).map((p) => p.surface ?? 'opaque'))].sort(),
    ...paintOf(top),
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
    ...weatherOf(top),
    qa: { pass: findings.length === 0, findings },
  };
}

function soundsOf(top: CompiledAsset | undefined): Pick<AssetManifest, 'sounds'> {
  const uses = top ? soundUses(top) : [];
  if (!uses.length) return {};
  return {
    sounds: uses.map((u) => ({
      node: u.node,
      clip: u.clip.name,
      trigger: u.trigger,
      loop: u.loop,
      seconds:
        Math.round((u.clip.samples.length / u.clip.channels / u.clip.sampleRate) * 1e3) / 1e3,
    })),
  };
}

const hexes = (slots: Readonly<Record<string, readonly [number, number, number]>>) =>
  Object.fromEntries(Object.entries(slots).map(([k, c]) => [k, linearToHex(c)]));

function paintOf(top: CompiledAsset | undefined): Pick<AssetManifest, 'paint' | 'variants'> {
  const set = top?.paintSet;
  if (!set) return {};
  const variants = Object.entries(set.variants);
  return {
    paint: hexes(set.paint),
    ...(variants.length
      ? { variants: Object.fromEntries(variants.map(([v, slots]) => [v, hexes(slots)])) }
      : {}),
  };
}

export interface WeatherSummary {
  readonly target: number;
  readonly actual: number;
  readonly eligible: string;
  readonly area: number;
  readonly count?: number;
  readonly by?: Readonly<Record<string, { target: number; actual: number; area: number }>>;
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** Coverage effects aggregate area-weighted; shape effects (dents, sag, warp) take the max. */
function weatherOf(top: CompiledAsset | undefined): { weather?: Record<string, WeatherSummary> } {
  const all = top?.weather ?? [];
  if (!all.length) return {};
  const byEffect = new Map<string, WeatherCoverage[]>();
  for (const w of all) byEffect.set(w.effect, [...(byEffect.get(w.effect) ?? []), w]);
  const out: Record<string, WeatherSummary> = {};
  for (const [effect, ws] of byEffect) {
    const area = ws.reduce((t, w) => t + w.area, 0);
    const shape = effect === 'dents' || effect === 'sag' || effect === 'warp';
    const mean = (k: 'amount' | 'actual'): number =>
      area > 0 ? ws.reduce((t, w) => t + w[k] * w.area, 0) / area : 0;
    out[effect] = {
      target: r4(shape ? Math.max(...ws.map((w) => w.amount)) : mean('amount')),
      actual: r4(shape ? Math.max(...ws.map((w) => w.actual)) : mean('actual')),
      eligible: [...new Set(ws.map((w) => w.where))].join(' ; '),
      area: r4(area),
      ...(effect === 'dents' ? { count: ws.reduce((t, w) => t + (w.count ?? 0), 0) } : {}),
      ...(ws.length > 1
        ? {
            by: Object.fromEntries(
              ws.map((w) => [
                w.target,
                { target: w.amount, actual: r4(w.actual), area: r4(w.area) },
              ]),
            ),
          }
        : {}),
    };
  }
  return { weather: out };
}
