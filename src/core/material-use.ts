// Which project materials a compile mapped geometry onto. The trim sheet's custom strip rows belong
// to ONE asset, not to the process: two recipes may each put a material on row 4, and each asset's
// sheet holds its own. So a row conflict is a fact about one compile, and it is found here: the
// material module notes every custom strip a primitive asks for (`noteMaterial`), `compile` and
// `definePart` open a scope around their build (`trackMaterials`), and a scope that gets two ids on
// one row throws T3D_MATERIAL_CONFLICT. A scope that closes hands its uses to the scope around it,
// so an asset that `ctx.use`s another holds the child's materials too (one sheet per asset).

import { Ts23dError } from './errors.ts';

/** One project material and the custom strip row (0-based among the custom rows) it holds. */
export interface MaterialUse {
  readonly id: string;
  readonly row: number;
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

const usesOf = (scope: Scope): MaterialUse[] =>
  [...scope.byRow].sort((a, b) => a[0] - b[0]).map(([row, id]) => ({ id, row }));

/** Record that the running build maps onto `use.id`. Outside a compile this does nothing. */
export function noteMaterial(use: MaterialUse): void {
  const scope = open.at(-1);
  if (!scope) return;
  const held = scope.byRow.get(use.row);
  if (held === undefined) scope.byRow.set(use.row, use.id);
  else if (held !== use.id) {
    const taken = usesOf(scope).map((u) => `${u.row} ${u.id}`);
    throw new Ts23dError('T3D_MATERIAL_CONFLICT', {
      cause: `${scope.label} maps onto materials '${held}' and '${use.id}', which both hold custom strip row ${use.row}: one asset has one trim sheet, and a row of it shows one material`,
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
