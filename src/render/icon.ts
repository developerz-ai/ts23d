// UI art from the asset: a square unit icon (whole asset) and a portrait close-up (the focus
// parts, default the top of the asset: head, turret, roof), both from ONE fixed 3/4 high camera
// and the studio rig, so a whole roster of icons is lit and framed alike. Zero-GPU beauty
// renderer underneath; deterministic bytes. Backdrop: the neutral studio floor (with the contact
// shadow) or transparent for engines that draw their own button frame: straight alpha, so the
// colour of an edge pixel is the asset's alone (never the studio backdrop's) and alpha its coverage.

import { type CompiledAsset, encodePng, Ts23dError, worldMeshes } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { type BeautyOptions, type BeautyRender, cameraFor, renderBeauty } from './beauty.ts';
import { project } from './camera.ts';
import { toSrgb8 } from './lighting.ts';
import { checkBeautyOptions } from './options.ts';

/** The house icon camera: front-left 3/4, high, a long-ish lens (little perspective distortion). */
export const ICON_CAMERA = { azDeg: -35, elDeg: 32, fovDeg: 24 } as const;

export interface IconOptions {
  /** Edge in pixels (square). Icon default 256, portrait default 512. */
  readonly size?: number;
  /** 'studio' (default): the neutral studio floor + contact shadow · 'transparent': straight alpha = coverage. */
  readonly backdrop?: 'studio' | 'transparent';
  /** The painted trim sheet (the CLI passes its own; default paints one per process). */
  readonly sheet?: PaintedSheet;
  /** Samples per pixel edge, 1–4. Default 3 (small images need the extra edge samples). */
  readonly supersample?: number;
}

export interface PortraitOptions extends IconOptions {
  /** Part-name prefixes to frame (e.g. ['head', 'helmet']); default the top 40% of the asset. */
  readonly focus?: readonly string[];
  /** Closest zoom over the full icon shot, default 3: a bust, never a macro of one bolt. */
  readonly maxZoom?: number;
}

export interface IconImage {
  readonly size: number;
  /** RGBA8 sRGB; alpha 255 on a studio backdrop; asset-only colour + coverage on a transparent one. */
  readonly rgba: Uint8Array;
  /** Asset coverage per pixel, 0–255. */
  readonly mask: Uint8Array;
}

function sizeOf(o: IconOptions, fallback: number): number {
  const s = o.size ?? fallback;
  if (!Number.isInteger(s) || s < 16 || s > 4096)
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `icon size ${s} is not an integer in 16…4096 pixels`,
      fix: 'pass size: 256 for a unit icon, 512 for a portrait',
    });
  return s;
}

/**
 * The asset cut out of the studio: per pixel the mean of its ASSET samples only (the resolve step
 * hands them over from the same render), with alpha = their share. Blending the backdrop into the
 * colour and also writing coverage to alpha would count the backdrop twice: a light halo round a
 * dark asset on any button frame.
 */
function cutOut(r: BeautyRender, size: number): IconImage {
  const asset = r.assetSum && r.hits ? { assetSum: r.assetSum, hits: r.hits } : undefined;
  if (!asset)
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: 'a transparent icon needs the asset-only colour, and this beauty render carries none',
      fix: 'render it with renderBeauty (the rasteriser), or use backdrop: "studio"',
    });
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const hits = asset.hits[i] ?? 0;
    if (!hits) continue;
    for (let k = 0; k < 3; k++) rgba[i * 4 + k] = toSrgb8((asset.assetSum[i * 3 + k] ?? 0) / hits);
    rgba[i * 4 + 3] = r.mask[i] ?? 0;
  }
  return { size, rgba, mask: r.mask };
}

function shoot(asset: CompiledAsset, size: number, o: IconOptions, bo: BeautyOptions): IconImage {
  const { supersample } = checkBeautyOptions({ supersample: o.supersample ?? 3 });
  const shot: BeautyOptions = { ...ICON_CAMERA, ...(o.sheet ? { sheet: o.sheet } : {}), ...bo };
  const r = renderBeauty(asset, { ...shot, width: size, height: size, supersample });
  return o.backdrop === 'transparent' ? cutOut(r, size) : { size, rgba: r.rgba, mask: r.mask };
}

/** Unit icon pixels: the whole asset, filling ~85% of the square. */
export function renderIcon(asset: CompiledAsset, o: IconOptions = {}): IconImage {
  return shoot(asset, sizeOf(o, 256), o, { window: { x: 0.5, y: 0.5, zoom: 1.06 } });
}

/** Skin weight above which a vertex belongs to a focus bone. */
const BONE_SHARE = 0.4;

/**
 * World-space points of the focus: parts matching a prefix; else (a single skinned body has no
 * `head` part) the skin that bones matching the prefix drive; else the top 40% of the asset.
 */
function focusPoints(asset: CompiledAsset, focus: readonly string[] | undefined): number[] {
  const all: number[] = [];
  const picked: number[] = [];
  const skinned: number[] = [];
  const bones = new Set<number>();
  (asset.skeleton?.bones ?? []).forEach((b, i) => {
    if (focus?.some((f) => b.name.startsWith(f))) bones.add(i);
  });
  for (const [name, m] of worldMeshes(asset.parts)) {
    const hit = focus?.some((f) => name.startsWith(f));
    for (let i = 0; i < m.positions.length; i++) {
      const v = m.positions[i] ?? 0;
      all.push(v);
      if (hit) picked.push(v);
    }
    if (!bones.size || !m.joints || !m.weights) continue;
    for (let v = 0; v < m.positions.length / 3; v++) {
      let share = 0;
      for (let k = 0; k < 4; k++)
        if (bones.has(m.joints[v * 4 + k] ?? -1)) share += m.weights[v * 4 + k] ?? 0;
      if (share >= BONE_SHARE)
        skinned.push(
          m.positions[v * 3] ?? 0,
          m.positions[v * 3 + 1] ?? 0,
          m.positions[v * 3 + 2] ?? 0,
        );
    }
  }
  if (picked.length === 0 && skinned.length) return skinned;
  if (focus?.length && picked.length === 0)
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `portrait focus ${focus.join(', ')} matches no part or bone of '${asset.name}'`,
      fix: 'pass part-name or bone-name prefixes that exist (t3d shot lists them in manifest.json), or omit focus',
    });
  if (picked.length) return picked;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 2; i < all.length; i += 3) {
    lo = Math.min(lo, all[i] ?? 0);
    hi = Math.max(hi, all[i] ?? 0);
  }
  const cut = hi - (hi - lo) * 0.4;
  const top: number[] = [];
  for (let i = 0; i < all.length; i += 3)
    if ((all[i + 2] ?? 0) >= cut) top.push(all[i] ?? 0, all[i + 1] ?? 0, all[i + 2] ?? 0);
  return top;
}

/** Portrait pixels: the same camera, zoomed onto the focus (a true crop, not an upscale). */
export function renderPortrait(asset: CompiledAsset, o: PortraitOptions = {}): IconImage {
  const size = sizeOf(o, 512);
  const cam = cameraFor(asset, { ...ICON_CAMERA, width: size, height: size });
  const pts = focusPoints(asset, o.focus);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const p = project(cam, pts[i] ?? 0, pts[i + 1] ?? 0, pts[i + 2] ?? 0);
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  const span = Math.max(x1 - x0, y1 - y0, 1);
  // Frame the focus at ~80% of the square: no wider than the full shot, no closer than maxZoom.
  const zoom = Math.min(o.maxZoom ?? 3, Math.max(1, (size * 0.8) / span));
  const window = { x: (x0 + x1) / 2 / size, y: (y0 + y1) / 2 / size, zoom };
  return shoot(asset, size, o, { window });
}

/** The unit icon as PNG bytes (default 256 × 256). */
export function icon(asset: CompiledAsset, o: IconOptions = {}): Uint8Array {
  const r = renderIcon(asset, o);
  return encodePng(r.size, r.size, r.rgba);
}

/** The portrait close-up as PNG bytes (default 512 × 512). */
export function portrait(asset: CompiledAsset, o: PortraitOptions = {}): Uint8Array {
  const r = renderPortrait(asset, o);
  return encodePng(r.size, r.size, r.rgba);
}
