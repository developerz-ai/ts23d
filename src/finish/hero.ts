// The hero texture tier (ADR 012): one LOD0 texture set baked from the asset's own fine field.
//   LSCM atlas of LOD0 (atlas.ts) → per part tagged with its field (passes/bake-source.ts):
//   tangent normal + height + AO + curvature from the field (passes/bake-height.ts, at `cell`) in
//   the exporter's tangent frame, the strip's micro-normal blended on top (hero-detail.ts) →
//   albedo = the source's colour at the hit (else vertex colour) × trim albedo → ORM = trim occlusion × field AO, trim
//   roughness + cavity, trim metal → `pad` texels of dilation → QA (hero-qa.ts).
// The result's `asset` is LOD0 with finishable parts on atlas UVs and white vertex colour (the
// albedo carries the colour); triangles, skin, morphs, pivots and motion are the input's. LOD1/2
// keep the trim sheet. Deterministic: fixed part and texel order.

import type { CompiledAsset, Part } from '../core/index.ts';
import { dmath, encodePng, Ts23dError } from '../core/index.ts';
import {
  exportLodGlb,
  type GlbOptions,
  HERO_MATERIAL,
  tangentsOf,
  withFinishLayer,
} from '../export/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { bakeHeight, bakeSourceOf, dilateTexels } from '../passes/index.ts';
import { paddedBase } from './fill.ts';
import { trimDetail } from './hero-detail.ts';
import { checkHero, type HeroFinding, type HeroPartStat } from './hero-qa.ts';
import { finishScene } from './scene.ts';
import { atlasTexels } from './texels.ts';

export interface HeroOptions {
  /** Atlas size, texels (ADR 012: 1024, 2048 or 4096). */
  readonly size: 1024 | 2048 | 4096;
  /** Finest detail baked, metres. Default 1.5 mm. */
  readonly cell?: number;
  /** Ray window along ±n, metres. Default 8 cells. */
  readonly cage?: number;
  /** Dilation into atlas padding, texels (4–8). Default 6. */
  readonly pad?: number;
  /** The trim sheet: albedo × vertex colour, ORM, and its strip normals blended on top. */
  readonly sheet?: PaintedSheet;
  /** Strength of the strip's own micro-normal over the field's (0 = field only). Default 1. */
  readonly strip?: number;
}

export interface HeroMaps {
  readonly size: number;
  /** RGBA8: albedo (sRGB), ORM and tangent normal (linear), height (grey, ±heightRange m). */
  readonly albedo: Uint8Array;
  readonly orm: Uint8Array;
  readonly normal: Uint8Array;
  readonly height: Uint8Array;
  readonly heightRange: number;
}

export interface HeroResult {
  readonly asset: CompiledAsset;
  readonly maps: HeroMaps;
  readonly parts: readonly HeroPartStat[];
  readonly texelsPerMetre: number;
  readonly cell: number;
  readonly cage: number;
  /** `T3D_BAKE_FAILED` findings; empty = accepted. */
  readonly findings: readonly HeroFinding[];
}

const area = (p: Float32Array, idx: Uint32Array): number => {
  let s = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [(idx[t] ?? 0) * 3, (idx[t + 1] ?? 0) * 3, (idx[t + 2] ?? 0) * 3];
    const e = [0, 1, 2].map((k) => (p[b + k] ?? 0) - (p[a + k] ?? 0));
    const f = [0, 1, 2].map((k) => (p[c + k] ?? 0) - (p[a + k] ?? 0));
    s += dmath.hypot(
      (e[1] ?? 0) * (f[2] ?? 0) - (e[2] ?? 0) * (f[1] ?? 0),
      (e[2] ?? 0) * (f[0] ?? 0) - (e[0] ?? 0) * (f[2] ?? 0),
      (e[0] ?? 0) * (f[1] ?? 0) - (e[1] ?? 0) * (f[0] ?? 0),
    );
  }
  return s / 2;
};

export function heroTier(lod0: CompiledAsset, o: HeroOptions): HeroResult {
  if (lod0.lod !== 0)
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: `hero bake got '${lod0.name}' at LOD${lod0.lod}`,
      fix: 'bake compile(asset, { lod: 0 }): the hero tier is LOD0 only, LOD1/2 keep the trim sheet',
    });
  const N = o.size;
  const cell = o.cell ?? 0.0015;
  const cage = o.cage ?? 8 * cell;
  const scene = finishScene(lod0, N, o.sheet);
  const tx = atlasTexels(scene);
  const normal = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) normal.set([128, 128, 255, 255], i * 4);
  const height = new Float32Array(N * N);
  const ao = new Float32Array(N * N).fill(1);
  const curv = new Float32Array(N * N);
  const parts: HeroPartStat[] = [];
  for (const p of lod0.parts) {
    const a = scene.atlas.parts.get(p.name);
    if (!a || !p.mesh) continue;
    const pi = scene.names.indexOf(p.name);
    let texels = 0;
    for (let i = 0; i < N * N; i++) if (tx.part[i] === pi) texels++;
    const src = bakeSourceOf(p.mesh);
    let hitRate: number | null = null;
    let color: Float32Array | undefined;
    if (src) {
      const b = bakeHeight(src.field, a.mesh, {
        size: N,
        cell,
        cage,
        tangents: tangentsOf(a.mesh),
        ...(src.lipschitz !== undefined ? { lipschitz: src.lipschitz } : {}),
        ...(src.tris !== undefined ? { tris: src.tris } : {}),
        ...(src.color ? { color: src.color } : {}),
      });
      for (let i = 0; i < N * N; i++) {
        if (!b.covered[i] || tx.part[i] !== pi) continue;
        normal.set(b.normal.subarray(i * 4, i * 4 + 4), i * 4);
        height[i] = b.height[i] ?? 0;
        ao[i] = b.ao[i] ?? 1;
        curv[i] = b.curvature[i] ?? 0;
      }
      hitRate = b.hitRate;
      color = b.color;
    }
    trimDetail(a, N, tx.part, pi, {
      normal,
      base: tx.base,
      ...(o.sheet ? { sheet: o.sheet } : {}),
      ...(o.strip !== undefined ? { strength: o.strip } : {}),
      ...(color ? { color } : {}),
    });
    parts.push({ name: p.name, texels, area: area(a.mesh.positions, a.mesh.indices), hitRate });
  }
  const maps = heroMaps(tx, { normal, height, ao, curv }, cell, o.pad ?? 6);
  const declared = lod0.budget.heroTextures?.size;
  const findings = checkHero({
    size: N,
    texelsPerMetre: scene.atlas.texelsPerMetre,
    parts,
    cage,
    ...(declared !== undefined ? { cap: declared } : {}),
  });
  const heroParts = lod0.parts.map((p): Part => {
    const a = scene.atlas.parts.get(p.name);
    return a
      ? {
          ...p,
          mesh: { ...a.mesh, colors: new Float32Array(a.mesh.colors.length).fill(1) },
          atlas: 'hero',
        }
      : p;
  });
  return {
    asset: { ...lod0, parts: heroParts },
    maps,
    parts,
    texelsPerMetre: scene.atlas.texelsPerMetre,
    cell,
    cage,
    findings,
  };
}

interface Baked {
  readonly normal: Uint8Array;
  readonly height: Float32Array;
  readonly ao: Float32Array;
  readonly curv: Float32Array;
}

/** Pack the baked channels with the texels' base colour and trim ORM; dilate `pad` texels. */
function heroMaps(
  tx: ReturnType<typeof atlasTexels>,
  b: Baked,
  cell: number,
  pad: number,
): HeroMaps {
  const N = tx.size;
  const orm = new Uint8Array(N * N * 4);
  const grey = new Float32Array(N * N);
  let range = 1e-6;
  for (let i = 0; i < N * N; i++) range = Math.max(range, Math.abs(b.height[i] ?? 0));
  // Cavity: concave mean curvature over an 8-cell fold → up to +60 roughness (dirt sits matte).
  const reach = 8 * cell;
  for (let i = 0; i < N * N; i++) {
    const cav = Math.max(0, Math.min(1, -(b.curv[i] ?? 0) * reach));
    orm[i * 4] = Math.round((tx.orm[i * 4] ?? 255) * (b.ao[i] ?? 1));
    orm[i * 4 + 1] = Math.min(255, Math.round((tx.orm[i * 4 + 1] ?? 204) + 60 * cav));
    orm[i * 4 + 2] = tx.orm[i * 4 + 2] ?? 0;
    orm[i * 4 + 3] = 255;
    grey[i] = 0.5 + (0.5 * (b.height[i] ?? 0)) / range;
  }
  const covered = (): Uint8Array => Uint8Array.from(tx.part, (p) => (p >= 0 ? 1 : 0));
  dilateTexels(orm, 4, covered(), N, pad);
  dilateTexels(b.normal, 4, covered(), N, pad);
  dilateTexels(grey, 1, covered(), N, pad);
  const height = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const g = Math.round(Math.max(0, Math.min(1, grey[i] ?? 0.5)) * 255);
    height.set([g, g, g, 255], i * 4);
  }
  return {
    size: N,
    albedo: paddedBase(tx, pad),
    orm,
    normal: b.normal,
    height,
    heightRange: range,
  };
}

export interface HeroPngs {
  readonly albedo: Uint8Array;
  readonly orm: Uint8Array;
  readonly normal: Uint8Array;
  readonly height: Uint8Array;
}

export function heroPngs(r: HeroResult): HeroPngs {
  const n = r.maps.size;
  const m = r.maps;
  return {
    albedo: encodePng(n, n, m.albedo),
    orm: encodePng(n, n, m.orm),
    normal: encodePng(n, n, m.normal),
    height: encodePng(n, n, m.height),
  };
}

/** LOD0 on `ts23d_hero`, LOD1/2 as compiled on the trim sheet; refuses a failed bake unless forced. */
export function heroGlb(
  r: HeroResult,
  lower: readonly CompiledAsset[],
  o: GlbOptions & { readonly force?: boolean } = {},
): Uint8Array {
  const f = r.findings[0];
  if (f && !o.force)
    throw new Ts23dError(f.code, {
      cause: `${f.part ?? r.asset.name}: ${f.message}${r.findings.length > 1 ? ` (+${r.findings.length - 1} more)` : ''}`,
      fix: f.fix,
    });
  const { force: _force, ...glb } = o;
  const pngs = heroPngs(r);
  return withFinishLayer(exportLodGlb([r.asset, ...lower], glb).glb, {
    albedo: pngs.albedo,
    orm: pngs.orm,
    normal: pngs.normal,
    material: HERO_MATERIAL,
    key: 'hero',
    provenance: {
      tier: 'hero (ADR 012)',
      size: r.maps.size,
      cell: r.cell,
      cage: r.cage,
      heightRange: r.maps.heightRange,
      texelsPerMetre: Math.round(r.texelsPerMetre),
      note: 'normal, AO, height and cavity baked from the fine signed-distance field; albedo from vertex colour × trim',
      ...(r.findings.length ? { forced: r.findings.map((x) => `${x.code}: ${x.message}`) } : {}),
    },
  });
}
