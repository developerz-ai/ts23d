// Surface finishes beyond base PBR: a recipe's named `finishes` (sheen cloth, brushed metal,
// heat-tinted titanium, clearcoat, specular), validated with a fix and normalised to linear RGB.
// The GLB writes them as KHR_materials_* extensions; the beauty render shades them.

import { Ts23dError } from './errors.ts';
import type { Part } from './part.ts';
import type { Vec3 } from './vec.ts';

/** '#rrggbb' (sRGB) or linear RGB 0..1, as in paint slots. */
export type Colour = string | Vec3;

const WHITE: Vec3 = [1, 1, 1];

/** A shading model for opaque parts (`{ finish: 'velvet' }`): one material per finish. */
export interface Finish {
  /** metallicFactor 0..1; set → the material uses factors instead of the sheet's ORM. */
  readonly metallic?: number;
  /** roughnessFactor 0..1; set → as `metallic`. */
  readonly roughness?: number;
  /** KHR_materials_clearcoat: a clear lacquer layer 0..1 over the base. */
  readonly clearcoat?: number;
  /** Lacquer roughness 0..1, default 0.03 (showroom gloss). */
  readonly clearcoatRoughness?: number;
  /** KHR_materials_sheen: velvet, felt, peach fuzz. Roughness default 0.5. */
  readonly sheen?: { readonly colour: Colour; readonly roughness?: number };
  /** KHR_materials_anisotropy: brushed metal, hair. Strength 0..1, rotation radians from +U. */
  readonly anisotropy?: { readonly strength: number; readonly rotation?: number };
  /** KHR_materials_iridescence: thin-film heat tint, oil slick, beetle shell. Thickness nm. */
  readonly iridescence?: {
    readonly factor?: number;
    readonly ior?: number;
    readonly thickness?: readonly [number, number];
  };
  /** KHR_materials_specular: dielectric reflectance strength 0..1 and its tint. */
  readonly specular?: { readonly factor?: number; readonly colour?: Colour };
}

/** A finish with colours in linear RGB and every default filled in its own block. */
export interface ResolvedFinish {
  readonly metallic?: number;
  readonly roughness?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly sheen?: { readonly colour: Vec3; readonly roughness: number };
  readonly anisotropy?: { readonly strength: number; readonly rotation: number };
  readonly iridescence?: {
    readonly factor: number;
    readonly ior: number;
    readonly thickness: readonly [number, number];
  };
  readonly specular?: { readonly factor: number; readonly colour: Vec3 };
}

export type Finishes = Readonly<Record<string, Finish>>;

const NAME = /^[a-z][a-z0-9_]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
export const fail = (cause: string, fix: string): Ts23dError =>
  new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });

export function lin(where: string, c: Colour): Vec3 {
  if (typeof c === 'string') {
    if (!HEX.test(c))
      throw fail(`${where} is '${c}', not a #rrggbb colour`, "write it as '#c8c8d0'");
    const n = Number.parseInt(c.slice(1), 16);
    const f = (v: number): number =>
      v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
    return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
  }
  if (c.some((v) => !(v >= 0 && v <= 1)))
    throw fail(
      `${where} is [${c.join(', ')}]: channels must be 0..1`,
      "use hex('#rrggbb') or linear 0..1",
    );
  return [c[0], c[1], c[2]];
}

export function range(
  where: string,
  v: number | undefined,
  lo: number,
  hi: number,
  fix: string,
): void {
  if (v !== undefined && !(v >= lo && v <= hi))
    throw fail(`${where} is ${v}, outside ${lo}..${hi}`, fix);
}

/** Validate one finish and fill the defaults of each block it uses. */
export function resolveFinish(where: string, f: Finish): ResolvedFinish {
  const u = (k: string, v: number | undefined): void =>
    range(`${where}.${k}`, v, 0, 1, 'use a fraction 0..1');
  u('metallic', f.metallic);
  u('roughness', f.roughness);
  u('clearcoat', f.clearcoat);
  u('clearcoatRoughness', f.clearcoatRoughness);
  u('sheen.roughness', f.sheen?.roughness);
  u('anisotropy.strength', f.anisotropy?.strength);
  u('iridescence.factor', f.iridescence?.factor);
  u('specular.factor', f.specular?.factor);
  range(
    `${where}.iridescence.ior`,
    f.iridescence?.ior,
    1,
    3,
    'thin films sit near 1.3 (oil) to 2.5 (oxide)',
  );
  const th = f.iridescence?.thickness ?? [100, 400];
  if (!(th[0] >= 0 && th[1] >= th[0] && th[1] <= 2000))
    throw fail(
      `${where}.iridescence.thickness is [${th.join(', ')}] nm`,
      'pass [min, max] nanometres, 0 ≤ min ≤ max ≤ 2000',
    );
  return {
    ...(f.metallic !== undefined ? { metallic: f.metallic } : {}),
    ...(f.roughness !== undefined ? { roughness: f.roughness } : {}),
    ...(f.clearcoat !== undefined
      ? { clearcoat: f.clearcoat, clearcoatRoughness: f.clearcoatRoughness ?? 0.03 }
      : {}),
    ...(f.sheen
      ? {
          sheen: {
            colour: lin(`${where}.sheen.colour`, f.sheen.colour),
            roughness: f.sheen.roughness ?? 0.5,
          },
        }
      : {}),
    ...(f.anisotropy
      ? { anisotropy: { strength: f.anisotropy.strength, rotation: f.anisotropy.rotation ?? 0 } }
      : {}),
    ...(f.iridescence
      ? {
          iridescence: {
            factor: f.iridescence.factor ?? 1,
            ior: f.iridescence.ior ?? 1.3,
            thickness: [th[0], th[1]] as const,
          },
        }
      : {}),
    ...(f.specular
      ? {
          specular: {
            factor: f.specular.factor ?? 1,
            colour: lin(`${where}.specular.colour`, f.specular.colour ?? WHITE),
          },
        }
      : {}),
  };
}

/** Validate `finishes` (null when the asset declares none). */
export function finishesOf(
  asset: string,
  finishes: Finishes | undefined,
): Record<string, ResolvedFinish> | null {
  const names = Object.keys(finishes ?? {});
  if (!names.length) return null;
  const out: Record<string, ResolvedFinish> = {};
  for (const n of names) {
    if (!NAME.test(n))
      throw fail(`finish '${n}' in '${asset}' is not snake_case`, 'rename it [a-z][a-z0-9_]*');
    out[n] = resolveFinish(`'${asset}' finishes.${n}`, finishes?.[n] ?? {});
  }
  return out;
}

/** Every finished part names a declared finish, is opaque and carries no paint slot. */
export function checkFinishedParts(
  asset: string,
  parts: readonly Part[],
  f: Record<string, ResolvedFinish> | null,
): void {
  for (const p of parts) {
    if (p.finish === undefined) continue;
    if (!f || !(p.finish in f))
      throw fail(
        `part '${p.name}' in '${asset}' uses finish '${p.finish}', which the asset does not declare`,
        `add it to defineAsset({ finishes: { ${p.finish}: { … } } })${f ? ` or use one of: ${Object.keys(f).join(', ')}` : ''}`,
      );
    if (p.surface && p.surface !== 'opaque')
      throw fail(
        `part '${p.name}' in '${asset}' is ${p.surface} and has a finish`,
        'finishes are opaque only; tune see-through surfaces with `optics`',
      );
    if (p.paint !== undefined)
      throw fail(
        `part '${p.name}' in '${asset}' has both paint '${p.paint}' and finish '${p.finish}'`,
        'put clearcoat/flake on the paint slot: paint: { body: { colour, clearcoat: 1 } }',
      );
  }
}
