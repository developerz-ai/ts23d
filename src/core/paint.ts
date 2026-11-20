// Paint slots and switchable liveries: the colours a recipe declares on `defineAsset({ paint,
// variants })`, normalised to linear RGB, validated with a fix, and applied to a compiled asset's
// vertex colours when a preview asks for one variant. The GLB writes them as KHR_materials_variants.
// A slot may carry a lacquer (`{ colour, clearcoat, clearcoatRoughness, metallicFlake }`): car paint
// → KHR_materials_clearcoat on the slot's material, kept by every livery. A slot with `wear: true`
// lets its parts carry wear that is not paint (bare steel, primer, rust, dust): see paint-wear.ts.

import * as dmath from './dmath.ts';
import { Ts23dError } from './errors.ts';
import { type ResolvedFinish, resolveFinish } from './finish.ts';
import { bareVertices, hueSat, settleWear, tone, WEAR_MIN_SATURATION } from './paint-wear.ts';
import type { Part } from './part.ts';
import type { Vec3 } from './vec.ts';

/** '#rrggbb' (sRGB, as on a paint chip) or linear RGB 0..1 (what `hex()` returns). */
export type PaintColor = string | Vec3;

/** A slot with options: a lacquer (car paint; liveries change the colour and keep it) or wear. */
export interface PaintFinish {
  readonly colour: PaintColor;
  /**
   * Wear that is not paint (opt-in): triangles whose colour is no darkening of the slot (bare
   * steel, primer, rust, pale dust, sun-fade) keep that colour in every livery and export in the
   * plain trim material; the rest stays paint. Default false: every vertex is a tone of the slot.
   */
  readonly wear?: boolean;
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
  /** Slots declared `wear: true`, in declaration order (absent when none). */
  readonly wear?: readonly string[];
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
    return s <= 0.04045 ? s / 12.92 : dmath.pow((s + 0.055) / 1.055, 2.4);
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/** Linear RGB → '#rrggbb' sRGB (manifests, docs). */
export function linearToHex(c: Vec3): string {
  const s = (v: number): string => {
    const x = Math.min(1, Math.max(0, v));
    const g = x <= 0.0031308 ? x * 12.92 : 1.055 * dmath.pow(x, 1 / 2.4) - 0.055;
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
  const wear: string[] = [];
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
    if (isFinish(given) && given.wear !== undefined && typeof given.wear !== 'boolean')
      throw invalid(
        `'${asset}' paint.${s}.wear is ${JSON.stringify(given.wear)}`,
        'use wear: true',
      );
    if (isFinish(given) && given.wear) {
      if (f)
        throw invalid(
          `'${asset}' paint.${s} has both wear and a lacquer: its bare triangles leave the lacquered slot material in the GLB, but renders would still lacquer them`,
          'drop the lacquer (clearcoat, metallicFlake) or the wear on this slot',
        );
      const sat = hueSat(out[s] as Vec3).sat;
      if (sat < WEAR_MIN_SATURATION)
        throw invalid(
          `'${asset}' paint.${s} is a wear slot but its colour is near-grey (saturation ${sat.toFixed(2)} < ${WEAR_MIN_SATURATION}): steel, primer and dust could not be told from the paint`,
          'make the saturated livery the default colour and the neutral one a variant, or drop wear',
        );
      wear.push(s);
    }
  }
  const vs: Record<string, Readonly<Record<string, Vec3>>> = {};
  for (const [v, over] of Object.entries(variants ?? {})) {
    if (!NAME.test(v))
      throw invalid(`variant '${v}' in '${asset}' is not snake_case`, 'rename it [a-z][a-z0-9_]*');
    const repaint: Record<string, Vec3> = {};
    for (const [s, c] of Object.entries(over)) {
      if (!Object.hasOwn(out, s))
        throw invalid(
          `variant '${v}' in '${asset}' repaints slot '${s}', which paint does not declare`,
          `declare it in paint (slots: ${slots.join(', ')}) or fix the name`,
        );
      repaint[s] = linear(`variants.${v}.${s} in '${asset}'`, c);
    }
    vs[v] = repaint;
  }
  return {
    paint: out,
    variants: vs,
    ...(Object.keys(finish).length ? { finish } : {}),
    ...(wear.length ? { wear } : {}),
  };
}

/** Every painted part must name a declared slot and be opaque (glass tint stays vertex colour). */
export function checkPaintedParts(asset: string, parts: readonly Part[], l: PaintSet | null): void {
  for (const p of parts) {
    if (p.paint === undefined) continue;
    if (!l || !Object.hasOwn(l.paint, p.paint))
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
    // A wear slot's bright vertices are bare wear, not clamped paint (settleWear).
    const over = slot && p.mesh && !l.wear?.includes(p.paint) ? brightest(p.mesh.colors, slot) : 0;
    if (over > 1.01)
      throw invalid(
        `part '${p.name}' in '${asset}' has colours ${over.toFixed(2)}× brighter than paint slot '${p.paint}' (they would clamp)`,
        `move the unpainted bits (bare iron, chrome, lettering) into their own part, raise the slot colour, or declare the slot with wear: paint: { ${p.paint}: { colour, wear: true } }`,
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
    // A wear slot's bare triangles are written in the trim material: no livery reaches them.
    const keep = p.paint && l.wear?.includes(p.paint) ? bareVertices(p.mesh, from) : null;
    // Exactly what an engine shows: the stored tone × the variant's baseColorFactor.
    const colors = new Float32Array(p.mesh.colors.length);
    for (let i = 0; i < colors.length; i += 3) {
      if (keep?.[i / 3]) {
        colors.set(p.mesh.colors.subarray(i, i + 3), i);
        continue;
      }
      const t = tone(
        [p.mesh.colors[i] ?? 0, p.mesh.colors[i + 1] ?? 0, p.mesh.colors[i + 2] ?? 0],
        from,
      );
      colors.set([t[0] * to[0], t[1] * to[1], t[2] * to[2]], i);
    }
    return { ...p, mesh: { ...p.mesh, colors } };
  });
}

/** Settle every part painted with a wear slot (paint-wear.ts); other parts pass through. */
export function settlePaintWear(parts: readonly Part[], l: PaintSet | null): Part[] {
  const wear = l?.wear;
  return parts.map((p) => {
    const slot = p.paint !== undefined && wear?.includes(p.paint) ? l?.paint[p.paint] : undefined;
    return p.mesh && slot ? { ...p, mesh: settleWear(p.mesh, slot) } : p;
  });
}

export {
  bareVertices,
  hueSat,
  isBare,
  settleWear,
  splitWear,
  tone,
  WEAR_HUE,
  WEAR_MIN_SATURATION,
} from './paint-wear.ts';
