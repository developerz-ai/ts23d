// Paint slots and switchable liveries: the colours a recipe declares on `defineAsset({ paint,
// variants })`, normalised to linear RGB, validated with a fix, and applied to a compiled asset's
// vertex colours when a preview asks for one variant. The GLB writes them as KHR_materials_variants.
// A slot may carry a lacquer (`{ colour, clearcoat, clearcoatRoughness, metallicFlake }`): car paint
// → KHR_materials_clearcoat on the slot's material, kept by every livery.

import { Ts23dError } from './errors.ts';
import { type ResolvedFinish, resolveFinish } from './finish.ts';
import type { Part } from './part.ts';
import type { Vec3 } from './vec.ts';

/** '#rrggbb' (sRGB, as on a paint chip) or linear RGB 0..1 (what `hex()` returns). */
export type PaintColor = string | Vec3;

/** A lacquered slot: car paint. Liveries change the colour and keep the lacquer. */
export interface PaintFinish {
  readonly colour: PaintColor;
  /** Clear lacquer 0..1 (KHR_materials_clearcoat). */
  readonly clearcoat?: number;
  /** Lacquer roughness 0..1, default 0.03. */
  readonly clearcoatRoughness?: number;
  /** Metallic flake 0..1: metallicFactor = flake, roughness 0.5 → 0.3 as it rises. */
  readonly metallicFlake?: number;
}

/** Slot name → colour: `{ body: '#84402d', letter: '#e8e2d2' }` or `{ body: { colour, clearcoat: 1 } }`. */
export type PaintSlots = Readonly<Record<string, PaintColor | PaintFinish>>;

/** Variant name → the slots it repaints: `{ oxide_red: { body: '#74382a' } }`. */
export type PaintVariants = Readonly<Record<string, Readonly<Record<string, PaintColor>>>>;

/** Slots and variants in linear RGB, as carried on a CompiledAsset. */
export interface PaintSet {
  readonly paint: Readonly<Record<string, Vec3>>;
  readonly variants: Readonly<Record<string, Readonly<Record<string, Vec3>>>>;
  /** Lacquered slots only (absent when no slot declares a finish). */
  readonly finish?: Readonly<Record<string, ResolvedFinish>>;
}

const isFinish = (v: PaintColor | PaintFinish | undefined): v is PaintFinish =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'colour' in v;

/** A slot's lacquer as a finish (null: plain paint). */
function slotFinish(where: string, f: PaintFinish): ResolvedFinish | null {
  const flake = f.metallicFlake;
  if (f.clearcoat === undefined && flake === undefined && f.clearcoatRoughness === undefined)
    return null;
  if (flake !== undefined && !(flake >= 0 && flake <= 1))
    throw invalid(`${where}.metallicFlake is ${flake}, outside 0..1`, 'use a fraction 0..1');
  return resolveFinish(where, {
    clearcoat: f.clearcoat ?? 1,
    ...(f.clearcoatRoughness !== undefined ? { clearcoatRoughness: f.clearcoatRoughness } : {}),
    ...(flake !== undefined ? { metallic: flake, roughness: 0.5 - 0.2 * flake } : {}),
  });
}

const NAME = /^[a-z][a-z0-9_]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const invalid = (cause: string, fix: string): Ts23dError =>
  new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });

/** sRGB '#rrggbb' → linear RGB (the space of COLOR_0 and baseColorFactor). */
export function srgbToLinear(value: string): Vec3 {
  const n = Number.parseInt(value.slice(1), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/** Linear RGB → '#rrggbb' sRGB (manifests, docs). */
export function linearToHex(c: Vec3): string {
  const s = (v: number): string => {
    const x = Math.min(1, Math.max(0, v));
    const g = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(g * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${s(c[0])}${s(c[1])}${s(c[2])}`;
}

function linear(where: string, given: PaintColor): Vec3 {
  if (typeof given === 'string' && !HEX.test(given))
    throw invalid(`${where} is '${given}', not a #rrggbb colour`, "write it as '#84402d' (sRGB)");
  const c = typeof given === 'string' ? srgbToLinear(given) : given;
  // Painted vertices store colour / slot colour (see `tone`), so pure black has nothing to divide by.
  if (c.some((v) => !(v >= 0 && v <= 1)) || Math.max(...c) < 1e-4)
    throw invalid(
      `${where} is [${c.join(', ')}]: channels must be in 0..1 and not all zero`,
      "use a near-black like '#060606' instead of pure black (the slot colour divides the paint)",
    );
  return [c[0], c[1], c[2]];
}

/** Validate and normalise `paint` + `variants` (null when the asset declares no paint). */
export function paintSetOf(
  asset: string,
  paint: PaintSlots | undefined,
  variants: PaintVariants | undefined,
): PaintSet | null {
  const slots = Object.keys(paint ?? {});
  if (!slots.length) {
    if (Object.keys(variants ?? {}).length)
      throw invalid(
        `'${asset}' declares variants but no paint slots`,
        "declare the default colours first: paint: { body: '#84402d' }",
      );
    return null;
  }
  const out: Record<string, Vec3> = {};
  const finish: Record<string, ResolvedFinish> = {};
  for (const s of slots) {
    if (!NAME.test(s))
      throw invalid(
        `paint slot '${s}' in '${asset}' is not snake_case`,
        'rename it [a-z][a-z0-9_]*',
      );
    const given = paint?.[s] ?? '#ffffff';
    out[s] = linear(`paint.${s} in '${asset}'`, isFinish(given) ? given.colour : given);
    const f = isFinish(given) ? slotFinish(`'${asset}' paint.${s}`, given) : null;
    if (f) finish[s] = f;
  }
  const vs: Record<string, Readonly<Record<string, Vec3>>> = {};
  for (const [v, over] of Object.entries(variants ?? {})) {
    if (!NAME.test(v))
      throw invalid(`variant '${v}' in '${asset}' is not snake_case`, 'rename it [a-z][a-z0-9_]*');
    const repaint: Record<string, Vec3> = {};
    for (const [s, c] of Object.entries(over)) {
      if (!(s in out))
        throw invalid(
          `variant '${v}' in '${asset}' repaints slot '${s}', which paint does not declare`,
          `declare it in paint (slots: ${slots.join(', ')}) or fix the name`,
        );
      repaint[s] = linear(`variants.${v}.${s} in '${asset}'`, c);
    }
    vs[v] = repaint;
  }
  return { paint: out, variants: vs, ...(Object.keys(finish).length ? { finish } : {}) };
}

/** Every painted part must name a declared slot and be opaque (glass tint stays vertex colour). */
export function checkPaintedParts(asset: string, parts: readonly Part[], l: PaintSet | null): void {
  for (const p of parts) {
    if (p.paint === undefined) continue;
    if (!l || !(p.paint in l.paint))
      throw invalid(
        `part '${p.name}' in '${asset}' uses paint slot '${p.paint}', which the asset does not declare`,
        `add it to defineAsset({ paint: { ${p.paint}: '#rrggbb' } })${l ? ` or use one of: ${Object.keys(l.paint).join(', ')}` : ''}`,
      );
    if (p.surface && p.surface !== 'opaque')
      throw invalid(
        `part '${p.name}' in '${asset}' is ${p.surface} and painted`,
        'paint slots are opaque only: drop `paint` (tint glass with its vertex colour)',
      );
    const slot = l.paint[p.paint];
    const over = slot && p.mesh ? brightest(p.mesh.colors, slot) : 0;
    if (over > 1.01)
      throw invalid(
        `part '${p.name}' in '${asset}' has colours ${over.toFixed(2)}× brighter than paint slot '${p.paint}' (they would clamp)`,
        'move the unpainted bits (bare iron, chrome, lettering) into their own part, or raise the slot colour',
      );
  }
}

/** Largest colour ÷ slot ratio over the channels the slot really has (see `tone`). */
function brightest(colors: Float32Array, slot: Vec3): number {
  const top = Math.max(...slot);
  let max = 0;
  for (let i = 0; i < colors.length; i++) {
    const s = slot[i % 3] ?? 1;
    if (s >= 0.1 * top) max = Math.max(max, (colors[i] ?? 0) / s);
  }
  return max;
}

/**
 * What a painted vertex stores in COLOR_0: its colour ÷ the slot colour, per channel, so the
 * material's baseColorFactor (= slot colour) restores it exactly and a variant's factor keeps the
 * grime, wear and shading tones. Channels the slot barely has (< 10 % of its strongest, e.g. the
 * blue of a pure red) take the mean ratio of the others instead of dividing by ~0. Clamped to 0..1:
 * a vertex brighter than its slot (lettering, chrome) belongs in another slot or none.
 */
export function tone(c: Vec3, slot: Vec3): Vec3 {
  const top = Math.max(...slot);
  const sure = [0, 1, 2].filter((i) => (slot[i] ?? 0) >= 0.1 * top);
  const mean = sure.reduce((t, i) => t + (c[i] ?? 0) / (slot[i] ?? 1), 0) / sure.length;
  const ch = (i: number): number =>
    Math.min(1, Math.max(0, sure.includes(i) ? (c[i] ?? 0) / (slot[i] ?? 1) : mean));
  return [ch(0), ch(1), ch(2)];
}

/** The asset as variant `name` looks: each painted vertex's `tone` × the variant colour. */
export function repaint(
  asset: string,
  parts: readonly Part[],
  l: PaintSet | null,
  name: string,
): Part[] {
  const over = l?.variants[name];
  if (!l || !over)
    throw invalid(
      `'${asset}' has no variant '${name}'`,
      l && Object.keys(l.variants).length
        ? `pick one of: ${Object.keys(l.variants).join(', ')}`
        : 'declare it: defineAsset({ paint: {...}, variants: { name: { slot: colour } } })',
    );
  return parts.map((p) => {
    const to = p.paint ? over[p.paint] : undefined;
    const from = p.paint ? l.paint[p.paint] : undefined;
    if (!p.mesh || !to || !from) return p;
    // Exactly what an engine shows: the stored tone × the variant's baseColorFactor.
    const colors = new Float32Array(p.mesh.colors.length);
    for (let i = 0; i < colors.length; i += 3) {
      const t = tone(
        [p.mesh.colors[i] ?? 0, p.mesh.colors[i + 1] ?? 0, p.mesh.colors[i + 2] ?? 0],
        from,
      );
      colors.set([t[0] * to[0], t[1] * to[1], t[2] * to[2]], i);
    }
    return { ...p, mesh: { ...p.mesh, colors } };
  });
}
