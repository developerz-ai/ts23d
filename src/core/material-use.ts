// Which project materials a compile mapped geometry onto. The trim sheet's custom strip rows belong
// to ONE asset, not to the process: two recipes may each put a material on row 4, and each asset's
// sheet holds its own. So a row conflict is a fact about one compile, and it is found here: the
// material module notes every custom strip a primitive asks for (`noteMaterial`), `compile` and
// `definePart` open a scope around their build (`trackMaterials`), and a scope that gets two ids on
// one row throws T3D_MATERIAL_CONFLICT. A scope that closes hands its uses to the scope around it,
// so an asset that `ctx.use`s another holds the child's materials too (one sheet per asset).
// A mesh may be built outside every scope (a module-level constant) and only USED in one, so the
// record also travels on the mesh (D354): whatever maps UVs onto a custom strip writes it into
// `Mesh.mapped`, everything that makes a mesh from meshes carries it (`mappedOf`), and `ctx.part`
// notes it in the compile the mesh is added to (`noteMeshMaterials`).

import { Ts23dError } from './errors.ts';
import type { Mesh } from './mesh.ts';

/** One project material and the custom strip row (0-based among the custom rows) it holds. */
export interface MaterialUse {
  readonly id: string;
  readonly row: number;
}

/** A project material a mesh's UVs were mapped onto, with the V band of the sheet its row holds. */
export interface MappedMaterial extends MaterialUse {
  readonly v0: number;
  readonly v1: number;
}

interface Scope {
  /** `asset 'crate'` or `part 'bolt'`, for the error. */
  readonly label: string;
  readonly byRow: Map<number, string>;
}

const open: Scope[] = [];

/** The uses of the innermost open scope, by row; undefined outside every compile. */
export function materialsInUse(): readonly MaterialUse[] | undefined {
  const scope = open.at(-1);
  return scope && usesOf(scope);
}

/** The material the innermost open scope holds on custom row `row`, if any. */
export const materialOnRow = (row: number): string | undefined => open.at(-1)?.byRow.get(row);

const usesOf = (scope: Scope): MaterialUse[] =>
  [...scope.byRow].sort((a, b) => a[0] - b[0]).map(([row, id]) => ({ id, row }));

/**
 * Record that the running build maps onto `use.id`. Outside a compile this does nothing. `via`
 * says where a material came from when no `stripRect` call in this build asked for it.
 */
export function noteMaterial(use: MaterialUse, via?: string): void {
  const scope = open.at(-1);
  if (!scope) return;
  const held = scope.byRow.get(use.row);
  if (held === undefined) scope.byRow.set(use.row, use.id);
  else if (held !== use.id) {
    const taken = usesOf(scope).map((u) => `${u.row} ${u.id}`);
    throw new Ts23dError('T3D_MATERIAL_CONFLICT', {
      cause: `${scope.label} maps onto materials '${held}' and '${use.id}'${via ? ` (${via})` : ''}, which both hold custom strip row ${use.row}: one asset has one trim sheet, and a row of it shows one material`,
      fix: `give one of them a row this asset leaves free: defineMaterial({ id: '${use.id}', row: … }) (held here: ${taken.join(', ')}). Materials of an asset placed with ctx.use count as this asset's; other assets may reuse any row`,
    });
  }
}

/**
 * Run `build` in a new scope and return what it mapped onto, in row order. The uses then join the
 * scope around this one (a used child's materials are its parent's too).
 */
export function trackMaterials<T>(
  label: string,
  build: () => T,
): { readonly value: T; readonly uses: readonly MaterialUse[] } {
  const scope: Scope = { label, byRow: new Map() };
  open.push(scope);
  let value: T;
  try {
    value = build();
  } finally {
    open.pop();
  }
  const uses = usesOf(scope);
  for (const u of uses) noteMaterial(u);
  return { value, uses };
}

const inRowOrder = (a: MappedMaterial, b: MappedMaterial): number =>
  a.row - b.row || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function union(lists: readonly (readonly MappedMaterial[])[]): MappedMaterial[] {
  const byId = new Map<string, MappedMaterial>();
  for (const list of lists) for (const u of list) byId.set(u.id, u);
  return [...byId.values()].sort(inRowOrder);
}

/**
 * The `mapped` field of a mesh made from `meshes`: every material any of them says it maps onto.
 * Spread it into a mesh literal that does not spread its input: `{ positions, …, ...mappedOf(m) }`.
 * For a list of any length use `mappedOfAll` (spreading a million meshes overflows the call).
 */
export const mappedOf = (...meshes: readonly Mesh[]): Pick<Mesh, 'mapped'> => mappedOfAll(meshes);

/** `mappedOf` for an array of meshes, however long. */
export function mappedOfAll(meshes: readonly Mesh[]): Pick<Mesh, 'mapped'> {
  const lists = meshes.flatMap((m) => (m.mapped?.length ? [m.mapped] : []));
  const [first] = lists;
  if (!first) return {};
  return { mapped: lists.length === 1 ? first : union(lists) };
}

/** `mesh` saying its UVs (also) map onto `uses`. The same mesh when `uses` is empty. */
export const withMapped = (mesh: Mesh, uses: readonly MappedMaterial[]): Mesh =>
  uses.length === 0 ? mesh : { ...mesh, mapped: union([mesh.mapped ?? [], uses]) };

/** True when a triangle of `mesh` samples the V band [v0, v1) (its mean V lies in it). */
function samples(mesh: Mesh, v0: number, v1: number): boolean {
  const { uvs, indices } = mesh;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = uvs[(indices[t] ?? 0) * 2 + 1] ?? 0;
    const b = uvs[(indices[t + 1] ?? 0) * 2 + 1] ?? 0;
    const c = uvs[(indices[t + 2] ?? 0) * 2 + 1] ?? 0;
    const mean = (a + b + c) / 3;
    // A triangle lying wholly on the band's lower edge samples one texel line: neither row's.
    if (mean >= v0 && mean < v1 && !(a === b && b === c && a === v0)) return true;
  }
  return false;
}

/**
 * `ctx.part`: tell the running compile which project materials `mesh` brings with it, wherever
 * it was built. Only those its triangles still sample count: UVs re-pointed by hand since leave
 * a stale entry, and a stale entry must not claim a row.
 */
export function noteMeshMaterials(mesh: Mesh, part: string): void {
  if (open.length === 0 || !mesh.mapped) return;
  for (const { id, row, v0, v1 } of mesh.mapped)
    if (samples(mesh, v0, v1))
      noteMaterial({ id, row }, `'${id}' comes on the mesh of part '${part}'`);
}
