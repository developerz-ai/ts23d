# Architecture

**Imports only go down a tier.** A module imports from strictly lower tiers, never sideways, never up, and only through the other module's `index.ts`. `scripts/boundaries.ts` enforces it in `bun run verify`; the executable copy of the table below is `scripts/lib/tiers.ts`. Change both together.

## Tiers

| Tier | Module | Job |
|---|---|---|
| 0 | `core` | Errors, seeded RNG, vector math, the Mesh IR, `defineAsset` / `compile`, mesh transforms (`place`), world transforms |
| 1 | `grammar` | String mini-languages: split grammar, Whyte notation |
| 1 | `material` | Trim-sheet layout, palettes, `paintTrimSheet`, TSL and Godot shader sources |
| 2 | `primitives` | Geometry builders → `Mesh`: `box`, `lathe`, `cylinder`, `prism`, `beam`, `planar`, `sweep`, `loft`, `heightfield`, `triangulate`; planned `tiled`, `cell`, `sdf` |
| 2 | `neural` | Optional AI adapters: local-GPU mesh generators, `importGlb`, image sources (all planned) |
| 2 | `passes` | Whole-mesh post-processing: `grime`; planned `optimize` (weld, vertex-cache reorder, ACMR) |
| 3 | `kinds` | Domain builders: building, vehicle, vegetation (`tree`, `trees`); planned vessel, creature |
| 3 | `qa` | Gates over a `CompiledAsset` |
| 3 | `export` | `CompiledAsset` → GLB |
| 3 | `render` | CPU rasteriser, PNG encoder, contact sheet; planned `photoMatch` |
| 4 | `cli` | `t3d build / shot / list` |
| 5 | `src/index.ts` | Re-exports every public module |

```
            src/index.ts (5)        cli (4)
                    │                 │
     ┌──────────┬───┴──────┬──────────┤
   kinds      qa       export      render     (3)
     │
 primitives   neural   passes                 (2)
     │
 grammar   material                           (1)
     │
   core                                       (0)
```

Rules the guard prints with a `fix:`:

| Violation | Fix |
|---|---|
| Import from a same or higher tier | Move the shared code lower, or invert the dependency |
| Deep import (`../core/mesh.ts`) | Import from `../core/index.ts`; export what you need there |
| Module missing from the tier table | Add it to `scripts/lib/tiers.ts` and this table |

## Data flow

```
recipe.ts ─► defineAsset ─► compile(asset, { lod }) ─► CompiledAsset { parts[] }
                                                         ├─► runQa ─► Finding[]
                                                         ├─► toGlb ─► .glb
                                                         └─► contactSheet ─► .png
```

`Mesh` is the only geometry type crossing modules ([IR](../idea/03-ir.md)).

## Module conventions

- `index.ts` per module, one header comment stating the module's job, named re-exports only.
- Declared-but-unbuilt API lives in a `planned.ts` with its final signature, throwing `notImplemented(what, plan?)`. Recipes and docs can target it; it fails loudly until built.
- Public subpath per module: `@developerz-ai/ts23d/<module>` ([ADR 006](../decisions/006-single-package-subpath-exports.md)).

## Guides

| Doc | |
|---|---|
| [adding-a-primitive.md](adding-a-primitive.md) | New geometry builder |
| [adding-a-kind.md](adding-a-kind.md) | New domain builder |
| [errors.md](errors.md) | Every `T3D_*` code |
| [glb-production.md](glb-production.md) | Production GLB rules, validator results, per-engine import table, gap list |
