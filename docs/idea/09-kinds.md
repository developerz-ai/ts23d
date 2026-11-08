# 09 — Kinds

**A kind is a library of builders a recipe calls, not a class the recipe fills in.** `facade(ctx, {...})` adds parts to the caller's `ctx`; the recipe stays in charge of layout, naming and LOD. `kind: '…'` on `defineAsset` is a free string for metadata. Source: `src/kinds/`.

Status as of 2026-11:

| Kind | Builders | Status |
|---|---|---|
| Building / tower | `facade`, `setbacks` | Shipped |
| | `roof` / `roofMesh` (gable, hip, pyramid, mansard, gambrel, shed; chimneys), `opening` (window/door kit), `facade({ kit })`, `mass` (true-scale masonry) | Shipped |
| Vehicle | `axle`, `trackRun`, `whyteAxles`, `propeller` | Shipped |
| | lofted bodies, fuselages, wings | Possible now with `loft`, `sweep`; no dedicated builder yet |
| Vessel | `hull` / `hullMesh` / `hullLines` | Shipped |
| Vegetation | `tree`, `trees` family, `treeReal`; presets `oak`, `pine`, `palm`, `birch`, `willow` | Shipped |
| Character | `head` (orc, goblin, human, dwarf, elf via `HEADS`), `headParams`, `headEdits`, `checkHead` | Shipped (stylised busts) |
| Creature | `creature`, `defineCreature`, `creaturePlan`, `checkCreature`, `creatureCreases`, `biology` | Shipped (quadruped, winged, biped, bird, fish, serpent); hybrids, exoskeletons, ethereals planned (M4) |
| Scene | `ctx.use` (core), `heightfield` terrain with erosion and `terrainColor` | Shipped |
| Families | `defineFamily` (core): variants of any kind | Shipped |

## Building / tower

**Masses, then details.** Block the volumes with `box` or `prism`, then wrap them with `facade`.

`facade(ctx, opts)` runs a [split-grammar](#split-grammar) line along each side, per floor. Slots named `win`, `door`, `arch`, `shop` become inset panels; every other symbol stays wall.

| Option | Meaning |
|---|---|
| `prefix` | Part name prefix → `<prefix>_<side>_<floor>_<slot>` |
| `at`, `footprint` | Base centre and `[width X, depth Y]` of the mass it wraps |
| `floors`, `floorHeight` | Storeys, metres per storey |
| `grammar`, `ground?` | The line for every floor; `ground` overrides floor 0 |
| `sides` | Any of `front` (+X), `back`, `left` (+Y), `right` |
| `glass`, `frame?`, `windowRatio?` | Colours; window height as a fraction of the floor (default 0.6) |

`setbacks(ctx, { prefix, tiers, floorHeight, color, grammar, glass, detail })` stacks shrinking masses (Empire State, Chrysler-style). Each tier: `{ footprint, floors }`. Returns the top z for the spire. Pass `detail: ctx.lod < 2`.

### Split grammar

After CGA shape grammar (Müller et al. 2006). One string lays out one strip.

```
"pier:0.9 | {arch:2.5}* | door:3 | pier:~"
```

| Term | Meaning |
|---|---|
| `sym:1.2` | Fixed width, metres |
| `sym:~` / `sym:~2` | Stretch: shares the leftover, by weight (default 1) |
| `{a:1.4 \| b:0.6}*` | Repeat: as many whole copies as fit. Fixed sizes only; one repeat per line |

With no stretch term, repeat copies widen evenly to fill. Fixed terms longer than the strip → `T3D_GRAMMAR_OVERFLOW`. `split(src, length)` returns `{ symbol, start, size }[]`.

## Vehicle

Named parts follow the engine contract: `axle_*` and `wheel_*` spin about local Y; `prop_*` / `rotor_*` spin about their own axis.

| Builder | Adds | Notes |
|---|---|---|
| `axle(ctx, { name, at, radius, gauge, width, color, rps })` | Group `name` (spinning about Y) + `name_wheel_l`, `name_wheel_r` | Segments drop per LOD (24 → 12 → 6) |
| `trackRun(ctx, { side, y, length, wheels, radius, width, color, track })` | `road_wheel_<side>_<i>` (spinning), `track_<side>_top`, `track_<side>_bottom` | Tracked running gear, one side per call |
| `whyteAxles('4-4-0', { leading, driving, trailing, spacing })` | Nothing; returns `{ role, x, radius }[]` | Whyte notation → axle positions along X, leading end at +X |
| `propeller(ctx, { name, at, radius, blades, color, parent? })` | Group spinning about X + hub + blades | |

Domain-native params are the point: a loco recipe says `'2-6-2'`, not twelve wheel coordinates.

## Vessel

`hull(ctx, o)` adds `hull` + `hull_deck`; `hullMesh(o, lod)` returns the mesh for `place`/`merge`; `hullLines(o)` exposes the shape functions. Required: `length`, `beam`, `draft`, `freeboard`, `colors: { topsides, bottom, boot?, deck, bulwark? }`. Optional: `sheer: [bow, stern]`, `stern: 'round' | 'transom'`, `transomWidth`, `fullness`, `entrance`, `flare`, `deadriseDeg`, `bulwark`, `camber`, `bootTop`, `fender`, `at` (the waterline). Bow toward +X. Watertight at every LOD; waterline and boot-top bands are crisp.

## Roofs and openings

Every builder has a pure mesh form (`roofMesh(o, lod)`, `opening(o, lod)`, `mass(o, lod)`) and recipes compose them with `place`/`merge`; `roof(ctx, o)` is the thin ctx wrapper and returns `{ ridge, eave, heightAt(x, y) }`. A roof is the lower envelope of its slope planes, so ridges and hips fall out exactly; the underside sits on the walls' top outer edge, gable and shed ends get infill walls, LOD0/1 add slab thickness, soffit, fascia, ridge/hip caps and chimneys (pots at LOD0), LOD2 is bare slopes (≤ 40 triangles). `opening` is a window or door with a true-scale reveal, sill, lintel, sash and glazing bars; `facade(…, { kit })` places one in every opening slot. `mass` is a wall block whose masonry courses start at the ground line, unlike `box`, which stretches its strip over the face.

## Vegetation

`tree(ctx, { … })`: Weber–Penn botanical skeleton. Recursive branch levels (length, curve, split, taper per level) swept with `sweep`, leaves as cards on the foliage cells (`cutout` surface).

| API | Does |
|---|---|
| `tree(ctx, options)` | One tree into the caller's `ctx` |
| `trees` | A family: `trees.variant({ name, params: { species: 'pine', … } })` |
| `treeReal(params)` | `real` dimensions for the `proportions` gate |
| `SPECIES`: `oak`, `pine`, `palm`, `birch`, `willow` | Presets as data (`TreeParams`) |

The `oak`, `pine` and `palm` recipes are about 18 lines each. Wind is a crown `sway` for now. Planned: per-vertex wind weights; LOD2 impostors as crossed billboards from the foliage cells (today's are crude).

## Character

`head(ctx, { race: 'orc' | 'goblin' | 'human' | 'dwarf' | 'elf' | HeadParams, params?, prefix?, at?, jawSway? })` sculpts a stylised head and bust from SDF edits (`sculpt`) and adds `bust` (on z = 0), `head`, `jaw` (pivot at the hinge, optional sway) and `eye_l` / `eye_r` (pivots at the eyeball centres, looking along +X). Races are data (`HEADS`); `params` overrides one level deep; `checkHead` rejects impossible proportions with a fix. Vertex AO is baked at LOD0/1. Recipes: `orc_head`, `goblin_head`, `human_head`.

## Creature

`creature(ctx, spec, { prefix?, strip? })` sculpts a whole animal from a `CreatureSpec`: `skeleton`
(`quadruped`, `winged` = quadruped + bat/dragon wings, `biped`, `bird`, `fish`, `serpent`), `stance`
(`digitigrade`, `plantigrade`, `unguligrade`), and a few sourced numbers — `mass` (kg), `length`
(nose → tail root), `height` (withers, or body depth/diameter), optional `head`, `neck`, `tail`
lengths, `build` ratios (chest depth/width, limb and tail girth, ruff), `face` (muzzle share, ears
`erect`/`round`/`none`, eye forwardness, pupil, fangs), `surface` (`fur`, `scales`, `feathers`,
`skin`), `coat` depth, zone `colours`, a seeded `pattern` (`stripes`, `spots`, `rosettes`,
`patches`) and `pose`. Recipe: `recipes/wolf` (the whole wolf in one spec).

- **Landmarks from proportions.** The trunk length is solved so nose → tail root equals `length`;
  joints follow the stance (digitigrade hock at ~0.28 × height, plantigrade heel on the ground,
  unguligrade fetlock on a long cannon); anatomy defaults per type (head, neck, tail, muzzle, ears).
- **Staged sculpt** (one blended body sculpt + a head sculpt): block-out masses → planes (none by
  default: mammal backs are round) → features (scapulae, brisket, gluteals, croup, ruff, spine,
  legs with muscle masses and joint knobs, paws/toes, hooves, bird toes, wings, fins) → head
  (braincase, cheeks, muzzle, jaw, nose leather or beak, eye sockets with lids round a seated
  eyeball, ears grown from the crown, fangs rooted above the lip) → coat zones and tone
  (countershading, saddle, legs, muzzle mask, tail tip, cavity/ground/top light; the head holds
  the most contrast).
- **Parts:** `body`, `head` (pivot at the atlas), `eye_l` / `eye_r` (pivots at the ball centres;
  LOD2 paints them), `claws` (grown from the toes). Prefix with `prefix`.
- **LOD:** body cell ≈ 13 % of the upper-limb radius at LOD0, ×2.2 at LOD1, ×6.5 at LOD2 where the
  legs become 6-sided tubes; relief (fur clumps, domed scales, feather scallops) at LOD0 only;
  coarse-LOD carves (ear cups, mouth groove) become paint.
- **Biology built in:** allometry (Campione & Evans 2012: limb-implied mass must be ×0.5–×2.5 of
  `mass`, else `T3D_RECIPE_INVALID` with the thickness fix), effective density of the furred
  volume for QA `mass` (flesh under a hair shell), eye size ∝ mass^0.2, wing loading ≤ 250 N/m²
  when `flies`, and the `balance` check (centre of mass inside the support polygon at every LOD).
- `defineCreature({ name, spec, options?, real?, … })` = `defineAsset` with kind `creature`, the
  kind's `creases` (mouth, eyelids, ears, armpits, groin, flexion folds, toes, mane, tail root),
  the `balance` check, part densities and `art: { focal: 'head' }` filled in.

Stylised-to-plausible, not photoreal: no fur cards/shells, no jaw part or tail sway yet. Realistic
animals can still go through [`/neural`](08-neural-adapters.md).

## Scene

A scene is an asset whose `build` calls `ctx.use(other, { prefix, at, yaw, seed })`. No special kind is needed. Example (a street of varied houses): [02-dsl.md#composition-ctxuse](02-dsl.md#composition-ctxuse). Planned on top: layout helpers (street grids, scatter on a footprint) built on the split grammar.

Terrain for scenes and presentation dioramas: `heightfield({ rect: [x0, y0, x1, y1], cells: [nx, ny], height: (x, y) => z, color, strip? })`. `color` may be a function of `(x, y, z)` (ruts darker, slopes greener); `cells` is the LOD knob.

## Families and emitters

Any kind can be wrapped in a family: `defineFamily({ defaults, build })` → `variant` / `extend` ([02-dsl](02-dsl.md#families-one-build-many-assets)). Vehicles and buildings add `ctx.emitter` nodes for exhaust, steam, chimney smoke and muzzle flash ([02-dsl](02-dsl.md#emitters)).

Adding a kind: [architecture/adding-a-kind.md](../architecture/adding-a-kind.md).
