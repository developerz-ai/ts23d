# Roadmap

**Each milestone ships something an agent can use end to end, gated by `bun run verify`. Scope ends at the GLB, textures and manifest; engines and game code are out of scope.** Ticked = on `main` with a test and, where it makes geometry, a recipe. Order within a milestone is a suggestion; order between milestones is a dependency. No dates promised.

Status as of 2026-11-14: **M0 done, M1 done but for recipes, M2 under way.** Every exported entry point that isn't ticked throws `T3D_NOT_IMPLEMENTED` with a pointer here.

## M0: Scaffold (0.x)

- [x] Mesh IR, `MeshBuilder`, seeded forkable RNG, vector math
- [x] `defineAsset` / `compile` / `ctx.part` / `ctx.group` / `ctx.use`, LODs by re-run
- [x] `real` dimensions + `sources` on `defineAsset`
- [x] Mesh transforms: `place`, `affine`, `frame`, `applyAffine`
- [x] `Ts23dError` with code + cause + fix
- [x] Split grammar (`split`, `parseSplit`, `layoutSplit`), Whyte notation
- [x] Trim-sheet layout, palettes, `hex()`
- [x] Primitives: `box`, `lathe`, `cylinder`
- [x] Kinds: `facade`, `setbacks`, `axle`, `trackRun`, `whyteAxles`, `propeller`
- [x] `grime` pass
- [x] QA: `triangle-budget`, `floating-parts` (surface contact), `clashes` (swept motion, `clearOf`), `part-names`, `proportions`, `measures` (`real.measures`)
- [x] GLB writer: one material, baked spin/slide clip, Z-up → Y-up root
- [x] `defineFamily`: variants and derived families
- [x] `ctx.emitter`: particle sources as named nodes
- [x] `sway` motion; `run` clip baked by `t3d build`, opt-in in `toGlb`
- [x] Recipe `checks` (`clear`, `noOverlap`, `touches`, `symmetric`) and `inspect`
- [x] `ctx.joint` + QA `joints` (flush / socket / grip fit by cross-section), `ruler`, `assertSize` / `assertBetween` / `assertJointsFit`
- [x] `ctx.socket`; surfaces (opaque / cutout / glass / translucent, ≤ 4 materials)
- [x] CLI output: `out/<asset>/` with GLBs, sheet, manifest; `out/index.json`
- [x] `heightfield` terrain
- [x] GLB production pass: front axis +Z, seamless loops, `rest` + `run` clips, u16 indices, u16 colours, shared time accessors, glTF-Validator in tests ([glb-production.md](../architecture/glb-production.md) G1, G2, G4, G5, G10)
- [x] `mergeToPivots`: static geometry batched into its nearest pivot (default in `toGlb`; `keepParts` opts out)
- [x] CPU contact sheet: six views, metre grid, header dims
- [x] CLI: `t3d build | shot | list`, `--out`, `--json`
- [x] Repo gates (11 steps): lint, typecheck, boundaries, determinism, filesize, placeholders, conventions, tests, recipes (QA + double-build hash + recipe tests), build, pack
- [x] Release flow: stamp → PR → tag → OIDC publish
- [x] Recipes: `tiger_1`, `t34` + `t34_1941` (family), `loco_440` (family; the Jupiter, drivers 1.626 m sourced), `material_swatches`
- [x] Asset gallery site (every recipe, compiled in the browser)
- [x] First npm publish (bootstrap, [PUBLISHING.md](../../PUBLISHING.md)); releases since publish from CI via OIDC with provenance (0.4.0 as of 2026-11-08)
- [x] Hardening sweep ([plan 101](2026/11/14/101-production-readiness-audit/overview.md)): coded errors and strict flags in the CLI, validated inputs (assets, colours, `split`, primitives, GLB reader), QA findings with codes and distances, explicit `exports`, pack smoke test, release guards, `conventions` and `pack` gate steps, defect rows D26–D41

## M1: Architecture primitives

- [x] `prism`: extrude a 2D profile in the `xy` / `xz` / `yz` plane
- [x] `beam`: member between two points, square or round
- [x] `planar`: flat polygon in 3D
- [x] `triangulate`: ear clipping
- [x] `tiled`: quad tiling a strip at true scale
- [x] `cell`: quad mapped to a decal cell (with `inset` reveals)
- [x] `roof`: hip, gable, pyramid, mansard, gambrel, shed; `opening` window/door kit, `mass` true-scale masonry
- [ ] Opt-out for genuinely floating parts (aircraft in flight, hanging signs)
- [ ] Cross-machine determinism check; a `t3d build` flag for users' recipes
- [x] Recipe: `eiffel_tower` (188,016 / 21,860 / 1,062 triangles, 1 draw call; profile from Weidman & Pinelis 2004 and Eiffel's 1887 drawing)
- [x] `lattice` truss primitive (Warren / Pratt / Howe / X)
- [ ] Recipes: a terrace street, a station, an Art Deco tower, townhouse, gas lamp (landing)

## Recipe-agent backlog (unscheduled)

- [ ] `orbit` motion + `phase` for side rods and quartering
- [x] Sector sweep for `sway` clashes; `oneWay` slide / sway
- [ ] `recipes/_lib/` shared helpers: `trackLoop`, `roadWheel`, decal font with Cyrillic
- [ ] `subdivide(mesh, maxEdge)` pass for vertex-colour camo
- [ ] Exact-match option for measure `parts` (today: prefix match)
- [ ] TriangleGrid filling only the cells a triangle crosses

## M2: High definition, cheap to draw

Materials:
- [x] `paintTrimSheet`: procedural albedo / normal / ORM; strips bond, planks, plates, noise, flat, slate, concrete, glass; 6 decal + 11 foliage cells
- [x] Sheet in the GLB: embedded or shared external PNGs (`--sheet`, `--sheet-size`)
- [ ] KTX2 profile; fix mip bleed between strips; per-face V mapping on `box`
- [ ] Image-stamped cells (decals from any `ImageSource`)
- [ ] Painter curvature + `edgeWear` mask (`params.edgeWear`, `PaintKit.curvature`) ([11](../idea/11-materials-authoring.md))
- [ ] `edgeWear(mesh)` pass (dihedral / SDF-Laplacian convexity → vertex colour; `_WEAR` attribute for shader sources)
- [ ] `roughnessVariation` on `MaterialDef` + flat-roughness test
- [ ] `worn_edge` strip mapped by `box({ bevel })` chamfers; `decal()` offset-quad primitive

Optimisation and GLB production (gap ids from [glb-production.md](../architecture/glb-production.md)):
- [x] `optimize(mesh)`: vertex weld + vertex-cache reorder, reports ACMR (default in export)
- [ ] Gate: ACMR ceiling
- [ ] Opt-in `web` profile: `KHR_mesh_quantization` + `EXT_meshopt_compression` (G14). Default stays core glTF: Godot refuses required extensions
- [x] `MSFT_lod` single-file LOD set + screen-coverage switch hints (G11)
- [x] `KHR_materials_variants`: paint slots + switchable liveries in one GLB (`paint`, `variants`, `--variant`)
- [ ] Placeholder pivots at LOD2 so engine-bound names exist in every LOD (G3)
- [ ] `engine-names` gate against Godot suffix hints like `_wheel`, `-col` (G6)
- [ ] Clip naming Godot loops (`*_loop`) (G7)
- [x] Asset metadata: generator version, copyright, XMP provenance (G8)
- [ ] Mesh dedupe: identical geometry shares one mesh (G9)
- [x] Emissive surface (`KHR_materials_emissive_strength`) for lit windows (G13 remainder)

Shape:
- [x] `sweep`: parallel-transport frames, taper, twist
- [x] `loft` over `rings`, `ringXY` with wobble
- [x] `hull` (vessel kind) from length / beam / draft / freeboard
- [ ] Lofted vehicle bodies, fuselages, wings

Checking:
- [ ] `photoMatch(asset, { photo, camera })`: photo · model · overlay in one PNG + silhouette IoU
- [ ] `silhouetteIoU` gate on top of it
- [ ] Gates: manifold + outward normals, texel density

Exit bar: a 4-4-0 with tender matching [`docs/reference/loco-photo-match.png`](https://raw.githubusercontent.com/developerz-ai/ts23d/main/docs/reference/loco-photo-match.png) (predecessor output: ~16k triangles, 17 named nodes, one embedded trim-sheet material, baked `run`). Recipes: that loco, a harbour tug, a biplane.

## M3: Vegetation and engine import adapters

- [x] `tree`: Weber–Penn skeleton, leaf cards; presets oak / pine / palm / birch / willow; `trees` family; `treeReal`
- [x] Recipes: `oak`, `pine`, `palm`
- [ ] Per-vertex wind weights (crown `sway` today)
- [ ] LOD2 impostors as crossed billboards from the foliage cells
- [ ] Species presets as data
- [x] `threeMaterialSource` (TSL) and `godotShaderSource`: wind, window glow, wear
- [ ] Engine import adapters as data, not runtime: import settings for Unity (glTFast), Godot, Unreal; mapping extras + shader hints onto each engine's material
- [ ] Engine collision naming: `ctx.collider` → Godot `-convcolonly`, Unreal `UCX_`, generic extras (G12)
- [ ] Motion baked into vertex attributes (pivot + spin axis per vertex): a shader animates every wheel in one draw call
- [ ] Recipes: a park, an orchard

## M4: Creatures

- [x] `sdf`: surface nets or marching cubes over a signed-distance field; `sculpt` edit lists (Dreams-style)
- [x] Draw → 3D from SVG: `extrudeSvg` (holes, chamfer), `latheSvg`, `visualHull` front/side/top silhouettes as a sculpt edit (`recipes/svg_showcase`)
- [x] `creature`: SDF flesh over biped / quadruped / bird / fish / serpent / winged skeletons (landmarks from proportions + stance), staged sculpt, seeded coat patterns, fur/scale/feather relief LOD-gated, biology checks (allometry, furred density, eye size, wing loading, balance) — `recipes/wolf`
- [ ] `creature` next: bones as named parts (jaw, tail, limb segments with pivots), fur cards/shells, feather cards, per-zone hair flow
- [ ] Hybrid skeletons joined at a fitted joint: humanoid+serpent (naga-like), humanoid+quadruped (centaur-like), humanoid+bird (harpy-like), humanoid+fish (merfolk)
- [ ] Exoskeleton type (arthropods): segmented bevelled plates as jointed parts — crab-warrior (humanoid crab), giant spider, scorpion, beetle
- [ ] Ethereal type: translucent + edge-fading glow body, wispy tail, glowing eyes (ghost, spirit); elementals (fire core + flame cards, glass water body, orbiting earth chunks, air ribbons)
- [ ] Breadth reference: large fantasy MMOs' creature variety — original designs only, no names/characters/designs from any IP
- [ ] Bestiary recipes: ~~wolf~~ (done: `recipes/wolf`), dog (2–3 breeds), chicken, eagle, shark, trout; full-body orc, goblin, troll, dwarf, human; naga-like, centaur-like, harpy-like, merfolk; crab-warrior, giant spider, scorpion; ghost, spirit, fire/water/earth/air elementals; dragon (flagship, in progress), wyvern, golem, ogre, ogre-mage (original caster brute: robes, runes, glow)
- [ ] Recipes: stylised critters, rocks
- [ ] `roundCone` sculpt shape + `skin()` (draw-skin capsule chains) — ported into `src/kinds/creature-skin.ts` for the creature kind; a public sculpt shape still to do ([10](../idea/10-sculpting.md))
- [ ] Sculpt `form` tags (primary/secondary/tertiary) as an LOD filter + primary-only review view
- [ ] Group `pose` (pivot + rotate) and `warp` (twist/bend/taper) with declared Lipschitz factors
- [ ] `ffd()` cage deform pass (Sederberg–Parry)
- [x] Landmark warp: `warpTPS` / `tpsWarp` (3D thin-plate spline, normals by cofactor(J), `T3D_WARP_INVALID`); faces from a CC0 anatomical base (MakeHuman hm08) warped by 82 named landmarks into race presets (`recipes/_lib/face`, `recipes/face_demo`: human, orc, elf, dwarf, goblin) — [face-base](../research/face-base.md)
- [ ] Face base next: masculine/feminine axis from MakeHuman's CC0 targets, expression morph targets on the base topology, hair cards instead of SDF locks, move the bust heads (`human_head`…) onto the face base
- [ ] Sculpt strokes along a path: `crease`, `clay`, `inflate` (then `pinch`, `flatten`); `revolve` SDF shape
- [ ] `t3d shot --ref front=… side=…` overlays + per-view silhouette IoU

## M5: Neural adapters and import

- [ ] `localGenerator`: HTTP adapter for a local TRELLIS.2 / Hunyuan3D 2.1 / SF3D server
- [ ] Content-hash cache under `.ts23d/neural/`; a CI cache miss is an error naming the regenerate command (shipped for `refine` via `RefineCache` + `offline` → `T3D_REFINE_FAILED`, and for imports via `provideImports` → `T3D_IMPORT_MISSING`; the on-disk `.ts23d/neural/` store and CLI wiring are open)
- [x] `importGlb`: any GLB as a part, fitted and recoloured onto the trim sheet ([21](../idea/21-import.md)): licence gate, sha256 offline bytes, cleanup, QEM `simplify` LODs ([ADR 011](../decisions/011-imported-meshes-may-be-decimated.md)), `bakeNormals` + `withOwnTextures` opt-in own texture set, `refine` adapter (protocol + cache, no model); recipe `import_demo`
- [ ] `kubeezImages`: kubeez.com image source for references, decals, texture sources
- [ ] Concept before model: `t3d concept "<idea>"` → design brief with personality (drives shape language: aggressive/friendly/stable) → optional kubeez.com concept sheet (front/side/3-4 turnaround, face close-up, palette, material callouts, variations), cached by brief hash → agent traces silhouettes to SVG for `visualHull` block-out → critique compares model to its concept (silhouette IoU, palette, focal). Offline fallback: SVG thumbnails per the concept-artist skill. Original prompts only; image rights per provider terms recorded in the dossier.
- [ ] Recipe: a code-built cart drawn by a generated horse
- [ ] Optional Blender bridge, never in the gate ([12](../idea/12-blender-bridge.md)): ADR, shared content-hash cache with /neural, `t3d blender doctor | render | remesh | convert`
- [ ] Vendored-input convention (sha256 + URL + licence) and a `licence` check in `bun run verify`; CC0 HDRI loader for `beauty()` IBL

## Light and surface: cinema-grade PBR

- [x] `KHR_materials_clearcoat` on paint-slot materials (car paint), `transmission` + `ior` + `volume` on glass surfaces
- [x] `sheen` (cloth), `anisotropy` (brushed metal, machined discs), `specular`, `iridescence` (heat tint)
- [x] Beauty renderer + gallery show them (clearcoat lobe, refraction, sheen)
- [ ] HDRI environment option; `KHR_mesh_quantization` for the web profile

## Autonomy: no human polish step

- [x] `t3d critique`: renders beside reference photos (+ raking-light close-up, zebra for smooth surfaces) and a fixed rubric (silhouette, proportions, materials, detail density, wear/story, LOD consistency)
- [x] (warn mode until 2027-01-15, then enforced: `ENFORCE_FROM` in `scripts/lib/critique.ts`) `recipes/<name>/out/critique.json` scored 0–10 per criterion, bound to the render hashes; the recipes gate fails when missing, stale or any score < 8
- [ ] Optional CI fresh-eyes reviewer re-scores on each PR
- [x] Readability checks from artists' rules ([reading list](../research/reading-list.md)): thumbnail silhouette test, greyscale value-contrast focus, detail-density rest areas
- [x] Offline tuning ([20-tuning](../idea/20-tuning.md)): `tune: { params, objectives }` + `ctx.tuned`; `t3d tune` runs deterministic CMA-ES (or coordinate search) against silhouette masks, measures, art metrics, budget or a custom function and commits `tune.json` + a before/after report; `tune_demo` fits an amphora to a drawn outline (front IoU 0.643 → 0.940)
- [ ] Parallel tuning (Bun workers, results in submission order) and restarts (IPOP-CMA-ES) for > 10 knobs

## Test helpers: agents catch errors with code

Shipped: 18 helpers in `src/testing` ([15-testing](../idea/15-testing.md)). Remaining items below are unticked.

- [x] 3D: `assertClosed` · `assertManifold` · `assertOutward` · `assertNoSelfIntersection` · `assertMinThickness` · `assertSymmetric` · `assertUprightOnGround` · `assertCentreOfMassInside` · `assertMotionClear` · `assertLodSilhouette` · `assertTexelDensity` · `assertBudget`
- [x] 2D: `assertPolygonValid` · `assertTileable` · `assertNoBleed` · `assertValueRange` (plausible albedo/roughness/metal)
- [x] Renders: `assertSilhouetteMatches` (IoU vs reference mask) · `assertNotEmpty(region)` · `assertNoHoles` · `expectImageClose` (golden + diff image on failure)
- [x] Every failure: code + measured value + `fix:`

## Realism: imperfection, randomness, weathering

- [x] Imperfection API with four controls — random (seeded), where (`convex-edges`, `up-facing`, `below-fasteners`, `cavities`, `shaded & wet`, `touched`, `ground-near`, `long-spans`, `exposed-panels`), how (chips, rust, streaks, dust, dents, scratches, cracks, moss, bleach, mud, sag, warp), % (`amount` = coverage of the eligible area); measured coverage per effect written to the manifest; QA: coverage within declared amounts and physically plausible placement (no upward streaks, no dust on undersides) — shipped as `weather()` + QA `weather` ([18](../idea/18-weathering.md)); cracks still open
- [x] `weather(ctx, { age, climate, use, exposure })`: rust streaks below bolts, dust on up-facing faces, sun bleach, water stains under sills, moss on the shaded/wet side, polish where touched — from geometry (normals, flow paths, curvature, cavity, height) — shipped with `use`/`exposure` expressed as selectors (`touched`, `sunlit`, `shaded`); water stains under sills are not yet their own effect
- [x] Edge wear from mesh curvature (chipped paint on convex edges) in vertex colour (`weather` chips; the `_WEAR` attribute is still open)
- [x] `imperfect()` deform pass (LOD0/1): sag on long spans, dents, warped boards (bent fenders, cloth wrinkles still open)
- [ ] Organic `asymmetry` in sculpting; seeded jitter helpers (`jitter`, `scatter`, Poisson disk) used systematically
- [ ] `variations(n)`: N unique seeded instances of an asset in one build

## Biology: believable living things

- [ ] Creature checks: mass from volume, allometric limb cross-sections (`T3D_ALLOMETRY`), wing loading, joint placement on the skeleton
- [ ] Plant checks: da Vinci branch-area rule, phyllotaxis (golden angle) for leaves/scales/seeds, tropism (branches toward light, roots down)
- [ ] Anatomy order in kinds: skeleton → muscle → skin; human face ratios as the base for stylised races (declared exaggerations)

## Equipment: clothes, armour, weapons that swap

- [ ] Body zones (head, shoulders, chest, arms, hands, waist, legs, feet) on biped bodies/busts; `equip(ctx, item)` — items declare covered zones, the body hides them (no skin through armour)
- [ ] Fit to any body: shrink-wrap along the body surface at a declared thickness (one chestplate fits orc, human, elf)
- [ ] Rigid gear on sockets (`hand_r`, `hand_l`, `back`, `hip`, `head`, `shoulder_*`) via `ctx.use`; grip joints check weapon fit (shipped mechanism)
- [ ] QA: body never pokes through gear, gear never hovers, no skin gaps between pieces
- [ ] Export: each item its own GLB with matching socket/zone names + a dressed preview; dyes via paint slots (shipped mechanism); item sets sharing palette and shape language
- [ ] Demo: orc wearing a swappable original set (helmet, pauldrons, chestplate, belt, axe); the chestplate also fits the human

## Strategy-game kit (RTS: original factions, eras, civs)

- [x] Team colour everywhere via paint slots + `KHR_materials_variants` (shipped mechanism); a `team` slot convention ([19-rts-kit](../idea/19-rts-kit.md): one `team` slot, 8 liveries, top-facing, kept at LOD2)
- [x] Build stages (foundation → scaffold → complete) and damage states (intact → damaged → burning → rubble) as families/variants from one recipe (`rts_barracks`: 3 × 3 from one seeded cell plan; burning = the damaged state's fire/smoke emitters)
- [ ] Era / civilisation parameters on families (materials, roofs, ornament sets) for AoE-style progressions
- [x] RTS camera readability: silhouette and team colour legible from a high top-down angle at small screen size (`teamCoverage` / `rtsView`, 58° / 64 px, LOD2; recipe test + `t3d icon` warning)
- [ ] Impostor LOD3 for thousands of units; instancing for scatter
- [ ] Resource nodes, walls/gates, projectiles (arrows, shells, rockets) + flipbook effects (muzzle flash, explosion, dust) — resource node shipped (`rts_resource` + depleted); walls/gates, projectiles, flipbooks planned
- [x] UI art from the asset: square unit icons, portrait close-ups, build buttons with consistent lighting (`t3d icon`: icon.png 256², portrait.png 512², rts.png 64²)
- [x] Sample original faction: worker, soldier, tank, barracks (3 build stages × 3 damage states), resource node, icons — all team-coloured (Saltmarch Accord, `recipes/rts_*`)

## World scale: an open-world city of original assets

- [ ] City kit: procedural blocks and road networks (grammar), buildings with enterable interiors, kerbs/markings/signage, street furniture sets
- [ ] Vehicle fleet from playbooks: original cars, SUVs, trucks, buses, bikes, boats — opening parts, liveries, LODs
- [ ] `EXT_mesh_gpu_instancing` for scatter (props, foliage, crowds) + `variations(n)` for unique-looking instances
- [ ] Consistency at scale: shared trim sheet, texel density gate, one palette system per world

## DSL gaps found by recipe agents

- [ ] `motion: { kind: 'orbit', axis, radius, rps, phase }` — parts that translate on a circle without rotating (locomotive side rods, pedals, pistons via crank)
- [ ] `ornament({ svgPath, on: face, strip })` — flat raised decals/scrollwork from SVG on a surface
- [x] `text({ font: 'serif' })` — smooth vector faces for period lettering: Hershey `sans`, `serif`, `script`, `gothic` stroke fonts beside the 5×7 pixel font; `weight`, `segments` (LOD), `cap`, optical kerning (`recipes/type_specimen`). A true Clarendon (bracketed slab serif with stroke contrast) still needs outline glyphs

## Sound: what the asset sounds like

- [x] `audio` module (zero deps, deterministic WAV; OGG planned): modal impact synthesis from material + size (steel plate, oak crate, glass, brick), engine loops from cylinders/RPM/firing order, mechanism sounds driven by part motion (creak, squeak, whine, rattle, hydraulic hiss), sfxr-style UI/retro effects
- [x] Sound emitters in the GLB (`KHR_audio_emitter`, external `<clip>.wav`) placed on parts; `ctx.emitter(name, { kind: 'sound', clip })`, part `sound` on motion
- [ ] Optional `kubeezAudio` adapter (music beds, voice lines, ambience), content-hash cached like `/neural`; core never needs an account

## Surfaces and volumes

Research: [hair](../research/hair.md) · [surfaces and volumes](../research/surfaces-volumes.md)

- [ ] Vertex colour alpha end to end (RGBA meshes + export) · per-surface optical presets (IOR, attenuation) · emissive texture layer (lava cracks; ADR) · morph targets (melting, faces)
- [ ] Scale stamper: overlapping plates along surface flow, phyllotaxis rows, graded dorsal→ventral, LOD fallback to normal-mapped pattern
- [ ] Hair: sculpted locks (stylised) · hair cards (alpha strand strips, game standard) · strand curves → thin tubes (cinema); fur shells / fur cards
- [ ] Particles: richer `ctx.emitter` specs (rate, size/colour over life) + baked flipbook textures (smoke, fire, dust, magic)
- [ ] Porous solids: SDF minus seeded noise / gyroid (sponge, pumice, foam, coral, bread, cheese)
- [ ] Translucent bodies: jelly/slime via `transmission` + `volume` + soft translucency, wobble motion
- [ ] Liquids: wave surfaces, meniscus in containers, puddles, drips/splashes; `ior` 1.33
- [ ] Ice: clear/frosted ice via `transmission` + `ior` 1.31 + `volume` tint, internal cracks and trapped bubbles (SDF), frost rim, icicles (tapered drips), crystal clusters
- [ ] Mist / fog / smoke wisps: layered soft cards with depth-fade alpha, ground-fog volumes as engine fog hints in `extras`, emitter-driven drifting wisps
- [ ] Lava: cooled crust plates (dark basalt, rough) over glowing cracks (emissive strength from a temperature field), pāhoehoe ropes vs ʻaʻā clinker as two forms, heat glow fading with crust thickness
- [ ] Melting / state change: SDF blend from solid to slumped (gravity sag + smooth union with a puddle), drips at the lowest edges; candle wax, melting ice, molten metal; a `melt: 0…1` param baked per LOD or as morph targets for animation
- [ ] Clouds: stylised SDF-metaball mesh clouds, impostor cards for skies, optional OpenVDB export for cinema pipelines

## Learn from the masters (methods, never designs)

- [ ] `docs/research/` guides distilled from top artists' published breakdowns, talks and tutorials, each ending in DSL features + checks + agent rules: creatures (in progress), characters & faces, hard surface & vehicles, environments & modular kits, materials & texturing (PBR and hand-painted)

## Gaps the discipline skills exposed ([skills matrix](../research/skills-matrix.md))

- [ ] Skinning (bones + weights from sculpt blend weights, ≤ 4 influences) and morph targets (faces, melting); deformation test poses
- [ ] Architecture checks: room/area model, stair rule (2R+G), headroom, door clearances, daylight factor; adjustable human scale figure
- [ ] Set-level consistency: palette membership, texel density across a set, modular kit grid snapping
- [ ] Surface quality for designers: zebra/reflection lines, curvature combs, section cuts, G1/G2 continuity check; optional subdivision surfaces
- [ ] Product design: draft-angle and uniform-wall checks for moulded parts; STL export (see Reach)

## Geometry maths for good-looking code shapes
- [ ] Quadruped base meshes: CC0 canid / felid / ungulate / ursid bases imported with `importGlb`, warped to `creature()` skeleton landmarks (the same "code is the brain, the mesh is the face" split as `import_demo`), then fur shells + cards; the code-sculpted wolf (critique 6) is the baseline to beat

- [ ] C2-smooth blend kernels in the sculpt engine (replace polynomial smin where curvature continuity matters) + a surface fairing pass (bi-Laplacian / Willmore energy minimisation, feature-preserving) for organic kinds
- [ ] Subdivision-surface primitive (Catmull-Clark / Loop): code builds a coarse cage, the limit surface is smooth; subdivision level per LOD
- [ ] Energy-based fitting in `t3d tune`: concept silhouettes + anatomical distance constraints + smoothness → solved shape
- [ ] Cloth and soft tissue by position-based dynamics (drapes, folds, sag); combed direction fields for hair, fur and scale flow; conformal UVs (LSCM/ABF) for per-asset textures

## Machine learning, offline (results committed as numbers; the gate never runs a model)

- [x] `t3d tune`: deterministic CMA-ES over declared recipe knobs against objectives (silhouette vs reference/concept masks, measures, art metrics, budget, custom) → committed `tune.json` ([20-tuning](../idea/20-tuning.md))
- [ ] AI critics as objectives: a vision model scores renders ("reads as a wolf", appeal, concept match) so tuning runs without an agent reviewing every iteration
- [ ] Inverse procedural modelling: a local generator (`/neural`: TRELLIS, Hunyuan3D) makes a rough mesh from an idea or concept; the optimiser fits recipe parameters to it → clean code-built asset with the AI's look
- [ ] Learn from our own data: critique.json + metrics across all assets as a dataset; a small model predicts scores and suggests the next fix
- [x] AI finish layer ([22](../idea/22-ai-finish.md)): control maps → model (mock / local HTTP; cached by hash) → part-masked projection onto a per-asset atlas → one extra LOD0 material; finish QA (`T3D_FINISH_*`); `t3d finish`. Hosted provider (kubeez) adapter still planned
- [ ] Learned detail: texture synthesis / super-resolution for trim-sheet strips; learned priors for wrinkles, scales, fur

## Engines and ray tracing

- [x] Export profiles `--profile unreal|unity|godot|rt|web`: AO bake on/off (path tracers compute their own), LOD packaging (Nanite: LOD0 only; split; MSFT_lod), collision naming (UCX_ / -col), texture format
- [ ] Per-engine import checklists (UE5 Interchange + Nanite + Lumen, Unity glTFast, Godot 4) and a local sample project to verify; label untested claims
- [ ] Rigged characters keep ≤ 4 influences per vertex (Interchange truncates)

## Reuse: define once, use everywhere

- [x] `definePart`: typed parametric components (defaults, validation, cache by params, own test + thumbnail)
- [x] Parts catalogue (bolts, hinges, wheels, tyres, seats, pipes, windows, doors, handles, lamps, rivet rows) + gallery page; agents search it before writing new geometry
- [ ] Hero recipes (roadster, dragon, loco) extract their reusable pieces into the catalogue

## Reach: anyone building anything in 3D

- [ ] STL / 3MF export for 3D printing (watertight + wall-thickness checks), OBJ, USDZ (film pipelines, Apple AR)
- [ ] Surface-quality review for designers: zebra / reflection-line renders, curvature combs, section cuts
- [x] Dimensioned blueprint sheets (`t3d blueprint`: side/front/top on a metre grid, L×W×H, `real.measures` measured vs spec, joints, 1.8 m figure)
- [ ] Field guides: product design, automotive, architecture, film/VFX, education, makers

## Real data: pinned, offline, licence-tracked ([23-real-data](../idea/23-real-data.md))

- [x] `bun run data wikidata <QID…>`: CC0 facts → committed `wikidata-<QID>.json` (revision URL, sha256, m/kg); `realFrom`, `crossCheck`
- [x] `bun run data dem`: AWS Terrain Tiles (terrarium) → committed 16-bit DEM JSON with tile hashes, licence, attribution; `terrainFromDEM`
- [x] `recipes/real_valley`: Yosemite Valley east end from USGS 3DEP, Half Dome checked against Wikidata
- [ ] OpenStreetMap via Overpass (ODbL share-alike: extract stays ODbL, meshes credited as Produced Works): rivers carved into DEMs, lakes, footprints + levels, land cover replacing slope colouring
- [ ] Licence propagation: inputs carry a licence; the build refuses an asset `license` that contradicts them
- [ ] More sources on the same contract: Copernicus GLO-30 (global), OpenTopography lidar (small sites), Commons photos as review references
- [ ] `realFrom` for item-valued facts (resolve a gauge item to its millimetres); Wikidata into existing recipes (`eiffel_tower` Q243, `tiger_1`, `t34`)

## M6: Reverse direction and reach

- [ ] Camera solve for `photoMatch` from ≥ 4 marked correspondences
- [ ] Reverse direction: a VLM proposes recipe params from photos, scored by silhouette IoU, best kept
- [ ] MCP server: `build`, `shot`, `list` as tools, PNG inline
- [ ] Playground: edit a recipe in the browser, see GLB + contact sheet live
