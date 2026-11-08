# 19 — The strategy-game kit

**An RTS asks three things of every asset: whose is it, what is it, and can I draw a thousand of
them.** ts23d answers with one paint slot, measured readability from the strategy camera, brutal
LOD2 budgets and families for build and damage states. The worked example is an original sample
faction, the Saltmarch Accord ([`recipes/rts_faction/`](../../recipes/rts_faction/README.md)).

| Need | How | Status |
|---|---|---|
| Team colour | `paint: { team }` + 8 `variants` (KHR_materials_variants): one GLB, the engine picks the team | Shipped (convention + sample) |
| Team colour reads from the RTS camera | `teamCoverage(red, blue)`: share of the 64-px LOD2 silhouette that changes between two liveries | Shipped |
| Build stages × damage states | One `defineFamily`, params `stage` × `damage`, nine exports | Shipped (sample) |
| UI art | `t3d icon`: 256² unit icon, 512² portrait, 64² RTS view, fixed camera and light | Shipped |
| Crowds | LOD2 ≤ 380 tris per infantry, pivots kept at every LOD | Shipped (sample budgets) |
| Impostor LOD3, instancing, era/civ params, walls/gates, projectiles | Roadmap "Strategy-game kit" | Planned |

## Team colour: the `team` slot convention

```ts
import { defineAsset } from '@developerz.ai/ts23d';

export const TEAMS = { red: '#b3261e', blue: '#1f4fb8', green: '#2f8f3a', yellow: '#e2b521',
  purple: '#6d2fa6', orange: '#e0661a', teal: '#139a92', white: '#e8e8e2' } as const;

export const unit = defineAsset({
  name: 'unit', kind: 'character', budget: { triangles: [9000, 3000, 380] },
  paint: { team: TEAMS.red },
  variants: Object.fromEntries(Object.entries(TEAMS).map(([k, v]) => [k, { team: v }])),
  build(ctx) {
    ctx.part('pauldron_l', dome(/* … */), { paint: 'team' });   // big, top-facing, kept at LOD2
  },
});
```

Rules the sample follows (and its test enforces):

1. **One slot named `team`**, exactly the eight variants above, so engines and tools can rely on it.
2. **Top-facing and large**: roofs, pauldrons, helmet crests, pack lids, turret roofs, engine
   decks, banners, floor inlays. A strategy camera looks down at 50–60°; a team stripe on a shin
   is invisible.
3. **Kept at LOD2**: the far mesh is what thousands of units draw. Team parts never sit behind
   `ctx.lod < 2`.
4. **Neutral everything else**: low-saturation masses (bone, slate, gunmetal) so team colour owns
   the chroma; accents (brass, glow) are small.
5. **Every state carries it**: a building site, a ruin and a resource node still say who owns
   them (tarps, floor inlay, fallen roof slabs, a claim plaque).

Team parts' vertex colour is the slot colour (or darker): COLOR_0 stores colour ÷ slot, so
shading and grime survive every livery ([02-dsl](02-dsl.md), paint slots).

## Measuring readability from the strategy camera

```ts
import { compile } from '@developerz.ai/ts23d';
import { RTS_CAMERA, rtsView, teamCoverage } from '@developerz.ai/ts23d/render';

const c = teamCoverage(compile(unit, { lod: 2, variant: 'red' }), compile(unit, { lod: 2, variant: 'blue' }));
// rts_soldier: { covered: 744, team: 202, share: 0.27 } — pixels that change between liveries ARE team colour
```

`RTS_CAMERA` is azimuth −35°, elevation 58°, 20° lens, 64 px. Diffing two liveries finds team
pixels whatever the hue, light or grime. The sample's house floor is **8 %**; measured shares:
worker 31 %, soldier 27 %, tank 22 %, barracks 16–73 % by state, resource 13–15 %.
Also run `silhouetteReads` and `assertArt` from `/testing` on units ([16-art-as-text](16-art-as-text.md)).

## Build stages and damage states as one family

```ts
const hall = defineFamily({
  kind: 'building', budget: { triangles: [40000, 9000, 1200] },
  paint: TEAM_PAINT, variants: TEAM_VARIANTS,
  defaults: { stage: 'complete' as Stage, damage: 'intact' as Damage },
  build(ctx, p) { /* walls from a cell plan: stage caps the courses, damage removes cells */ },
});
export const rts_barracks = hall.variant({ name: 'rts_barracks' });
export const rts_barracks_scaffold_damaged = hall.variant({
  name: 'rts_barracks_scaffold_damaged', params: { stage: 'scaffold', damage: 'damaged' } });
```

The trick that keeps nine assets consistent: **state is data**. The barracks wall is a grid of
block cells per bay ([`plan.ts`](../../recipes/rts_barracks/plan.ts)); a stage caps the courses
(ragged while building), damage knocks seeded holes and tops off, rubble leaves stubs. LOD0 lays
every block, LOD1 merges columns, LOD2 one box per bay — all from the same cells, so the LODs and
the states agree. Damaged and rubble states add `smoke` / `fire` emitters; scaffolds add `dust`.

## UI art: `t3d icon`

```
bun run t3d icon recipes/rts_soldier/rts_soldier.ts --out out
  → out/rts_soldier/icon.png      256², whole unit, 3/4 high camera (−35°, 32°, 24° lens)
  → out/rts_soldier/portrait.png  512², close-up on art.focal (else the top 40 %), ≤ 3× zoom
  → out/rts_soldier/rts.png       64², the strategy camera
  ! T3D_TEAM_COLOUR_HIDDEN when a `team` slot covers < 8 % of the RTS view (warning + fix)
```

Same camera and studio light for every asset, so a roster of icons matches; `--variant blue`
renders `icon_blue.png`. API: `icon`, `portrait`, `renderIcon`, `renderPortrait` (`size`,
`backdrop: 'studio' | 'transparent'`, `focus`, `maxZoom`, `sheet`) in `@developerz.ai/ts23d/render`.
Zero-GPU and deterministic, like every render here.

## Budgets that survive thousands on screen

| Asset | LOD0 | LOD1 | LOD2 |
|---|---|---|---|
| infantry (worker, soldier) | ≤ 9 200 | ≤ 3 000 | ≤ 380 |
| light tank | ≤ 25 000 | ≤ 7 000 | ≤ 600 (wheels → one side slab, pivots kept) |
| barracks (any state) | ≤ 40 000 | ≤ 9 000 | ≤ 1 200 |
| resource node | ≤ 16 000 | ≤ 4 000 | ≤ 500 |

LOD2 tricks in the sample: tubes lose their caps (always inside a neighbour), the gripping fist
keeps a 4 × 4 torus (so the grip joint still fits), wheels become empty spinning pivots over one
track slab, walls become one box per bay.

## Known gaps

- `ctx.use` drops a used part's `clearOf`; the sample tank's gun was designed to need none.
- Impostor LOD3, `EXT_mesh_gpu_instancing`, era/civilisation parameters, walls/gates and
  projectile flipbooks are planned (roadmap).
