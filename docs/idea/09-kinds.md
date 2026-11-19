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
| Creature | `creature`, `defineCreature`, `creaturePlan`, `checkCreature`, `creatureCreases`, `biology` | Shipped (quadruped, winged, biped, bird, fish, serpent; fish and serpent have no swim or slither clips: use `defineBodyPlan`); hybrids, exoskeletons, ethereals planned (M4) |
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

With no stretch term, repeat copies widen evenly to fill. Fixed terms longer than the strip → `T3D_GRAMMAR_OVERFLOW`. Fixed terms that sum to less than the strip, with no stretch or repeat term to absorb the rest (beyond 1e-9 m) → `T3D_GRAMMAR_UNDERFILL`: add a stretch (`~`) or a repeat, never rely on a silent gap. A stray brace, a `{…}` without `*` or a non-finite length → `T3D_GRAMMAR_SYNTAX`. `split(src, length)` returns `{ symbol, start, size }[]`.

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

### Creature clips (baked, ADR 013)

Every creature ships skinned with baked clips (`creature-clips.ts`): `idle` (breath, tail sway, an
ear flick), `look`, `bite` and, for four-legged quadrupeds, `walk`, `trot` and `gallop` (`run` is
reserved for part motions). Gaits (`gait.ts`, `gait-bake.ts`, `gait-ik.ts`, `gait-swing.ts`):
Hildebrand footfall tables, speed √(Fr·g·h) and stride 2.3·Fr^0.3·h from the hip height, each
stance toe locked to one ground point while the root travels (root motion: the manifest's
`speed`), the swing on a cycloid with the carpus folding and the toe clear from the first frame,
analytic two-bone IK with a coupled hock / carpus, a scapula glide, pelvis bob and spine rock.
Tail and ears follow through on damped springs solved for their periodic orbit (`springs.ts`).
The armature adds ear bones, joint limits (passive ROM narrowed to the locomotion working range,
`creature-limits.ts`) and half-angle helpers `<joint>_mid` at shoulder, elbow, carpus, hip, stifle
and hock (`creature-helpers.ts`). QA `gait` (planted toe < 1 mm/frame at 30 fps, no sinking, loops
close) and `deform` (volume, stretch, self-crossing at every limit) check them; the review pack's
pose strip (`render/pose-strip.ts`) shows the ROM extremes and gait frames. Heads: `faceMorphs`
adds `blink` / `talk` / `breathe` targets and `headClips(part)` keys them (`head-clips.ts`).

Stylised-to-plausible, not photoreal. Realistic animals go model-first (below).

### Model tier: the model is the surface, code is the animal (plan 2026/11/16/101)

A creature recipe may take its surface from an image-to-3D model and keep everything else code:
sourced scale, skeleton, clips, mass, LOD budgets and QA. The mesh and its own textures stay whole
as one textured part on every LOD (ADR 016); the code creature is the CPU fallback (ADR 014).

| Call | File | Does |
|---|---|---|
| `modelChain(ctx, { concept, surface, spec, steps: (rig) => […], … })` | `model-chain.ts` | Four cached asks, each named by the previous output's sha256: `image` → `mesh` (kept local: raw meshes are 70–100 MB, a build never sees them) → `blender` PROXY (clean → 6 000-triangle shell: the committed geometry TS fits on) → `blender` FINAL (`transform(fit)` first, then the recipe's steps built from the rig, with the fitted skeleton as input so Blender can `bind`). `null` on any miss; with `required: true` (a recipe whose code creature is not a shippable asset) a miss in a build is `T3D_NEURAL_MISSING` instead. A plain `steps` array is one pass (rigged models) |
| `modelRig(mesh, spec, { symmetric, drop })` | `model-rig.ts` | Everything TS derives from one mesh, memoised: fit, registered mesh, fitted skeleton, clips, limb capsules for `unweb`, `at(bone)` for focus spheres. `symmetric` (exact side-profile concepts; `true`, or '+' / '-' for the half the camera saw): puts the plane midway between the traced left and right legs, takes the far legs off, mirrors the kept half and forces a left/right symmetric skeleton; `side` feeds the `symmetrize` step and `far` the `amputate` step before it |
| `modelFit(mesh, bones)` | `model-fit.ts`, `model-flesh.ts` | Registers a mesh of any yaw and size onto the plan's flesh capsules: 12 yaw starts, a two-sided trimmed ICP solved upright, scale set by the sourced dorsal height, levelled (≤ 6°) and grounded. Returns the similarity, a row-major 4×4 and the residual |
| `fitSkeleton(mesh, bones, prefix)` | `model-skeleton.ts`, `model-legs.ts`, `model-ends.ts`, `model-sections.ts` | Fits the plan's armature INTO the mesh (its pose is not our rest pose): legs traced from the ground up along their medial axis, spine under the dorsal line, the head wherever the model turned it, the tail to its tip. Same names, order and parents |
| `bindModel(mesh, bones, height, legs)` | `model-bind.ts` | Weights in TS: geodesic through the voxelised solid, limbs that touch told apart, relaxed over the surface, ≤ 4 influences in 255ths, half-angle helpers |
| `modelClips(bones, prefix, drop)` | `model-clips.ts` | The creature's clips baked on the FITTED bones (`boneClips`): gait IK reads the fitted joints; `bite` and `blink` dropped (fused head) |
| `reposeTarget(bones)` · `modelRig(…, { repose: true })` | `model-repose.ts` | The straightened, bilaterally symmetric rest (centre chains unrolled onto y = 0, left/right averaged, ≤ 25° per bone or `T3D_MODEL_SKELETON`): the asset's bones and clips. Blender binds in the fitted rest, then the `repose` step poses the mesh to `rig.target`: a head turned a few degrees is straightened, never mirrored |
| `mirrorResidual(mesh, bones, height)` | `model-mirror.ts` | Before any mirror: the mesh's mirror image against itself per region; over 8 % of height on head, neck or trunk nothing is mirrored (`rig.symmetric` false, `rig.mirror` says where) |
| `modelBody(ctx, { model, spec })` | `model-body.ts` | The part for the LOD being compiled: bones, one skinned textured part (`body_fur` on a furred spec, so the path tracer does not shade it as bare skin), density solved from `spec.mass`. After two passes the mesh is already registered and, if the program bound it, carries its own skin on the fitted bones (checked within 1 mm, else `T3D_MODEL_SKELETON`: re-run `t3d neural run`); otherwise TS binds |
| `defineModelCreature({ spec, model, … })` | `model-creature.ts` | The asset: model body when `model(ctx)` returns one, else `creature(ctx, spec)`; the clips follow whichever built |
| `extra: ExtraChain[] \| (fit) => ExtraChain[]` on `modelChain`, `modelRig`, `modelBody` | `model-extra.ts`, `model-extra-clips.ts`, `model-extra-trace.ts` | Bone chains the plan lacks (wings, fins, a second tail, antennae). A chain is a name (`wing_l`), the plan bone it hangs from, n + 1 joints root to tip in the rest the mesh is bound in, one `JointLimit` per bone with a `source`, and an optional `motion` (`clip`, `hz`, per-bone `stroke`, `down`, `lag`, `idle`, `carry`, `source`). Its bones (`wing_l_0…`) follow the plan's in the fitted skeleton, so they go to Blender's `bind`, a `_l` / `_r` pair is made symmetric by `repose`, QA `deform` poses the skin at their limits and QA `model` wants their joints inside the mesh. Clips: the chain's own loop, ± `idle` with the breath, ± `carry` twice a stride in the gaits. `tracePath(mesh, from, to, { cell })` gives the centre line of a limb through the solid (deep flesh cheap, thin membrane dear) to put joints on. A skin with a bone that is neither the plan's nor declared: `T3D_MODEL_SKELETON` |

Rules the code enforces: nothing at build time needs the raw mesh (the fit is recomputed from
the committed proxy by the code that wrote the final program); a model that is not the
planned animal throws `T3D_MODEL_FIT`; missing, fused or crossed legs, a joint left outside the
mesh, or a leg bone outside 0.6–1.6 × its plan length throw `T3D_MODEL_SKELETON`. QA `model`
(`qa/model.ts`) then checks every textured part: albedo not blank under its UVs
(`T3D_MODEL_TEXTURE`), joints inside the mesh (`T3D_MODEL_SKELETON`), no doubled feature (one
muzzle outline, one leg outline per foot: `T3D_MODEL_DOUBLED`), the surface hugging the
skeleton and every foot on the ground (`T3D_MODEL_FIT`); `skin`, `deform` and `gait` judge the
weights and the motion as for any creature.

Known limits (v1): the head is the model's, fused (no jaw, eye or lid parts); a turned head stays
turned in every clip (`look` sweeps about it); the scale follows the dorsal line, so `real`
length and height are the model's at that scale; limbs fused in the mesh (a tail pressed on the
hocks) cannot deform apart and fail `deform`: re-roll the concept with the limbs clear.
`clips: 'model'` takes a rigged model (a humanoid from a rigging service) with its own skin,
armature and clips, untouched. Wings and other chains keep the plan's joints.

## Scene

A scene is an asset whose `build` calls `ctx.use(other, { prefix, at, yaw, seed })`. No special kind is needed. Example (a street of varied houses): [02-dsl.md#composition-ctxuse](02-dsl.md#composition-ctxuse). Planned on top: layout helpers (street grids, scatter on a footprint) built on the split grammar.

Terrain for scenes and presentation dioramas: `heightfield({ rect: [x0, y0, x1, y1], cells: [nx, ny], height: (x, y) => z, color, strip? })`. `color` may be a function of `(x, y, z)` (ruts darker, slopes greener); `cells` is the LOD knob.

## Families and emitters

Any kind can be wrapped in a family: `defineFamily({ defaults, build })` → `variant` / `extend` ([02-dsl](02-dsl.md#families-one-build-many-assets)). Vehicles and buildings add `ctx.emitter` nodes for exhaust, steam, chimney smoke and muzzle flash ([02-dsl](02-dsl.md#emitters)).

Adding a kind: [architecture/adding-a-kind.md](../architecture/adding-a-kind.md).
