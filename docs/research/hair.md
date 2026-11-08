# Research — Hair: how studios make it, and how ts23d should generate it

**Real-time hair is one of three things: alpha-tested cards (the game standard), sculpted shells
(stylised games, and every engine's far LOD), or rendered strands (film, and since about 2019 the
top LOD in some AAA engines). All three come out of one strand description, so ts23d should model
strands as data and emit cards, shells or tubes per LOD from it.** This page surveys the studio
techniques with sources, then states what plain glTF can carry and proposes a DSL, budgets, QA
gates and a test plan. Research as of 2026-11-07; everything under "Proposed" is **planned, not
shipped**. Claims without a fetched source are marked *(unverified)*.

Related: [`docs/idea/10-sculpting.md`](../idea/10-sculpting.md) (SDF edit lists),
[`docs/architecture/gltf-capabilities.md`](../architecture/gltf-capabilities.md),
[`surfaces-volumes.md`](surfaces-volumes.md) (fur shells, scales, other surfaces).

## 1. The three representations

| Representation | What it is | Who uses it | Cost driver |
|---|---|---|---|
| **Strands** | 10⁴–10⁵ curves, each a polyline with a width, shaded as fibres | Film; Unreal Groom LOD0; Frostbite; TressFX | strand count × points; transparency (order-independent) |
| **Cards** | A few hundred to a few thousand alpha-tested ribbons, each textured with a *clump* of strands from an atlas | Almost every shipped game character | overdraw (layers of alpha), card count, sorting |
| **Mesh / shell** | One closed or open surface shaped like the hairstyle, painted with strand bands | Stylised games (hand-painted), all far LODs ("helmet") | triangles only; no alpha |

Evidence for the chain:
- A human head has roughly 100k–150k strands; ~25 % of the render time of *Final Fantasy: The
  Spirits Within* went to the main character's hair (Scheuermann, ATI, GDC 2004, slide 3).
- Epic: a groom "can have multiple levels of details (LODs) and each can use a strand, card, or mesh
  for their representation" ([Setting up cards and meshes](https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-cards-and-meshes-for-grooms-in-unreal-engine)).
- MetaHuman's hair component defaults to **strands at LOD 0 and cards at every other LOD**; forcing
  cards everywhere improved performance by roughly 20–30 % in typical scenes (Epic,
  [Hair Groom Component for UEFN](https://dev.epicgames.com/documentation/en-us/metahuman/hair-groom-component-for-unreal-editor-for-fortnite)).
- Frostbite: "the current standard in the game industry is to use so-called hair cards"; its strand
  system simulated and rendered ~10,000 strands in the demo, ~25 points per strand on a long-hair
  asset, with a single-scattering BSDF based on Marschner 2003
  ([Frostbite blog part 1](https://www.ea.com/frostbite/news/frostbite-hair-rendering-and-simulation),
  [SIGGRAPH 2019 slides](https://www.advances.realtimerendering.com/s2019/hair_presentation_final.pdf)).
- AMD TressFX (*Tomb Raider*, 2013) rendered strands with order-independent transparency through
  per-pixel linked lists; later versions sort only the front *k* fragments per pixel and blend the
  rest unordered (AMD GDC 2013/2014 talks, via [slides](https://www.slideshare.net/slideshow/gs4147-billbilodeau/28502778),
  [TressFX 3.1](https://gpuopen.com/tressfx-3-1/)).

Strands need an engine renderer (a compute rasteriser or OIT) that no plain glTF reader has. **For a
GLB, cards and shells are the portable forms; strands are the source data.**

## 2. Hair cards: how they are built

### 2.1 The atlas
A card does not show one hair; it shows a **clump**: a strip of 5–50 strands painted into a texture
cell, with a transparent background. The atlas holds a range of clump types:

| Cell type | Look | Where on the head |
|---|---|---|
| Dense / base | wide, nearly opaque, few gaps | scalp layer, hides skin |
| Mid | medium density, defined strands | volume layers |
| Fine / tips | sparse, thin, tapered ends | outer layer, silhouette |
| Flyaways | 1–3 stray strands | last, on top |
| Special | braids, curls, buns, eyebrow tufts, lashes | as needed |

Practitioner workflow (Calvin Verhoolen, [80.lv](https://80.lv/articles/techniques-for-game-character-hair-creation),
2018): plan the atlas by painting first; long hair uses a **2:1** texture; density falls off across the
sheet; strands are grown on planes above a ground plane (XGen guides with clumping and noise), baked
into the plane, then the plane is cut into cards. A ~40k-polygon hairstyle is "quite heavy for hair".

### 2.2 Texture channels
No single standard, but the same set recurs across tools and engines:

| Channel | Content | Use in the shader | Sources |
|---|---|---|---|
| **Alpha / coverage** | strand mask | alpha test (cutout) or dithered opacity | all |
| **Depth / height** | per-strand depth inside the clump | fake parallax, depth-offset (pixel depth), AO in clumps | Unreal Cards panel; 80.lv; HairTG |
| **Root → tip gradient** | 0 at the root, 1 at the tip | darker roots, lighter tips, alpha erosion toward the tip | Simple Hair Cards, HairTG (product pages) |
| **ID / seed** | random per strand | per-strand colour/roughness variation, breaks repetition | Unreal `Attributes: RootUV / CoordU / Seed`; 80.lv |
| **Flow / tangent** | strand direction in tangent space | anisotropic highlight direction | Unreal `Tangent` slot; HairTG; Simple Hair Cards |
| **Colour / roughness** | optional albedo | when not tinted by a parameter | Unreal `Material: Color / Roughness` |

Unreal's Cards panel lists exactly: **Depth, Coverage, Tangent, Attributes (RootUV / CoordU / Seed),
Material (Color / Roughness), Auxiliary**; a "Compact" layout packs more attributes into fewer
textures ([Epic](https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-cards-and-meshes-for-grooms-in-unreal-engine)).
Commercial Blender/Substance tools export the same family: Simple Hair Cards (Color, Alpha,
Roughness, Specular, Flow, Height, Root/Tip), HairTG (Mask, Alpha, ID, Depth, Flow, Root/Tip)
([Superhive](https://superhivemarket.com/products/simple-hair-cards),
[FlippedNormals](https://flippednormals.com/product/hairtg-hair-fur-287); product pages, not run).

### 2.3 Card generation from strands
Every studio pipeline is a variant of: **grow strands → cluster into clumps → fit one card per clump
→ bake the clump's strands into an atlas cell → assign the card UVs to that cell**.

- **Unreal Hair Card Generator** (experimental, Dataflow graph): `GenerateCardsClumps →
  GenerateCardsGeometry → GenerateCardsTextures`; per filter: *Num Clumps, Num Flyaways, Num
  Triangles, Num Textures*; multi-card clumps make **3 cards each**; triangles are distributed by each
  card's strand count and coverage; each LOD is a separate element and can reduce cards from the
  previous LOD; texture islands are shared by several cards
  ([Epic](https://dev.epicgames.com/documentation/en-us/unreal-engine/hair-card-generator-for-grooms-in-unreal-engine)).
  For card-to-groom skinning, a "Generated" guide runs through the middle of each card ("assumes the
  input geometry is made of triangle bands").
- **Houdini**: Hair Card Generate "assign[s] groups of nearby curves to clusters and then generates
  polygon cards for each cluster", and can work from the **guides alone**; Hair Card Texture builds the
  materials and default strips ([SideFX docs](https://www.sidefx.com/docs/houdini/fur/haircards.html)).
  Community HDAs bake per card so a card doesn't catch its neighbours' strands
  ([80.lv](https://80.lv/articles/houdini-hair-cards-for-game-meshes/)).
- **Blender** hair curves + geometry nodes ship node groups for *Generate / Interpolate / Clump /
  Frizz / Curl / Braid Hair Curves* ([manual](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/hair/index.html));
  add-ons (Keratin, Simple Hair Cards) then fit cards and bake atlases.
- **Curve-based card tools** (GS CurveTools for Maya, FiberShop and similar; *not fetched*): the
  artist draws curves on the head; each curve extrudes a card ribbon with width/twist/taper
  controls, UV-mapped to an atlas region chosen per card. This is the hand-placement workflow most
  game artists use; it is a sweep along a curve with a width profile.

### 2.4 Layering a haircut
From the 80.lv breakdown and common practice: (1) **scalp / base** layer of dense cards that hides
the skull with no see-through gaps, often over a painted scalp texture; (2) second and third volume
layers, leaving negative space between them for depth; (3) fine detail along the flow; (4)
**flyaways last** to break the silhouette. Vertex AO is baked into the cards to darken the inner
layers ([80.lv](https://80.lv/articles/techniques-for-game-character-hair-creation); ATI 2004 also
used **per-vertex AO** for self-shadowing).

### 2.5 LOD
- 80.lv: reduce the base layer first (it is the most covered); **drop flyaways at LOD1**.
- Epic Hair Card Generator: per-LOD elements; either reuse the previous LOD's textures with fewer
  triangles or regenerate with new islands ([tutorial](https://dev.epicgames.com/documentation/unreal-engine/creating-hair-cards-and-lods-using-hair-card-generator)).
- Far LOD: a closed **helmet mesh** (Unreal's third representation), opaque, painted.

## 3. Transparency: cutout, blend, dither, coverage

| Method | How | Pros | Cons |
|---|---|---|---|
| **Alpha test (MASK)** | discard below a cutoff, depth-write on | no sorting, deferred-friendly, shadows correct | aliasing, shimmer; thin strands vanish at distance |
| **Alpha blend** | sorted back-to-front | soft edges | sorting artefacts; no depth write; costly overdraw |
| **Opaque + blend, multi-pass** | ATI 2004: pass 1 alpha-test opaque texels with Z write; pass 2 blended back faces (no Z write); pass 3 blended front faces; plus a Z-prime pass for early-Z | soft edges on a solid core | engine-side render setup; 3–4 passes |
| **Static draw order** | ATI 2004: a **static index buffer ordered inside → outside**, computed offline, sorting connected patches not triangles | free at runtime; works for heads | breaks for dangling ponytails (handled separately) |
| **Dithered + TAA** | alpha test against a per-pixel/per-frame dither pattern, TAA resolves it into soft coverage | Unreal's default for hair ("what Epic … does with all of their hair materials", per a forum answer) | noisy without TAA; ghosting |
| **Alpha-to-coverage** | MSAA turns alpha into a sample mask | a few levels of order-independent coverage | needs MSAA (forward/VR); banding reports |

Sources: Scheuermann, *Hair Rendering and Shading*, ATI, GDC 2004, slides 14–17
([PDF](https://web.engr.oregonstate.edu/~mjb/cs557/Projects/Papers/HairRendering.pdf); SIGGRAPH 2004
sketch [PDF](https://history.siggraph.org/wp-content/uploads/2022/12/2004-Talks-Scheuermann_Practical-Real-Time-Hair-Rendering-and-Shading.pdf));
Unreal forum threads on dithered hair ([1](https://forums.unrealengine.com/t/improving-hair-shader-dithered-alpha-display-quality/141087),
[2](https://forums.unrealengine.com/t/how-do-you-make-a-good-hair-shader-for-vr-with-msaa/138400),
[3](https://forums.unrealengine.com/t/ue5-masked-materials-tingeling-and-shadow-noise-issues-haircards-why/546368);
practitioner reports, not Epic documentation). Ben Golus, "Anti-aliased Alpha Test: The Esoteric
Alpha To Coverage" (Medium, 2017) is the usual reference for sharpening A2C *(not fetched)*.

**What glTF can say:** only `alphaMode` (`OPAQUE` / `MASK` + `alphaCutoff` / `BLEND`) and
`doubleSided`. Dithering, TAA and A2C are renderer settings. **Triangle order inside an index
buffer is data**, and an engine that draws one primitive with blending draws it in that order: the
ATI inside→outside trick is the one sorting technique a GLB can carry.

## 4. Shading: why hair looks like hair

- **Kajiya–Kay** (SIGGRAPH 1989, "Rendering fur with three dimensional textures"; *paper not
  fetched*, model as reproduced by ATI): use the strand **tangent T** instead of the normal;
  specular `sin(T,H)^p = sqrt(1 − (T·H)²)^p`; diffuse `sin(T,L)`, which ATI found "too bright without
  proper self-shadowing" and replaced with a tweaked N·L (slides 7, 9).
- **Marschner et al. 2003** ("Light Scattering from Human Hair Fibers", SIGGRAPH): measured fibres;
  a fibre is a transparent elliptical cylinder with an absorbing interior and **tilted cuticle
  scales**. Three lobes: **R** (surface reflection, white, shifted toward the tip), **TT** (through
  the fibre, bright back-lit glow), **TRT** (one internal bounce, coloured, shifted toward the root,
  sparkly) ([Stanford page](https://graphics.stanford.edu/papers/hair/),
  [PDF](https://w1.graphics.cornell.edu/pubs/2003/MJC+03.pdf)).
- **ATI's real-time approximation**: two Kajiya–Kay highlights with different colours, exponents and
  **shifted tangents** (`T' = normalize(T + shift·N)`, shift from a texture), the secondary masked by
  a noise texture for sparkle; output = (diffuse + specular) × base × AO; alpha from the alpha
  texture (slides 10–12). This is the "spec shift" every hair shader since inherits.
- Film/AAA strands use Marschner-family BSDFs (Frostbite's single scattering is Marschner-based;
  d'Eon et al. 2011, "An Energy-Conserving Hair Reflectance Model", EGSR, is the common successor
  *(not fetched)*).

The input that matters for every model is **the strand direction per pixel**: a tangent attribute,
or a flow map over the card.

## 5. What plain glTF can carry for hair

| Need | glTF mechanism | Status (2026-11) | Reader support |
|---|---|---|---|
| Cutout cards | `alphaMode: MASK`, `alphaCutoff`, `doubleSided` | core | universal |
| Strand direction | `TANGENT` attribute (xyz + handedness) | core | universal (ts23d writes it only with a normal map today: `src/export/primitive.ts`) |
| Anisotropic highlight | **`KHR_materials_anisotropy`**: `anisotropyStrength`, `anisotropyRotation`, optional `anisotropyTexture` (RG = direction in tangent space, B = strength); direction defaults to the **mesh tangent**; primitives MUST have NORMAL + TANGENT or a normal texture | **Ratified** ([registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md), [spec](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_anisotropy)) | three.js r186 `GLTFLoader` reads it (checked in `node_modules/three@0.186.1`); Babylon likely *(unverified)*; Godot importer *(unverified; Godot's material has anisotropy + flow map)*; glTFast: not confirmed in its 6.8 feature table |
| Soft velvety fur | `KHR_materials_sheen` | Ratified | three.js reads it; glTFast "planned" ([features](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.8/manual/features.html)) |
| Light through thin hair/fur edges | `KHR_materials_diffuse_transmission` | **Release Candidate**, not ratified | three.js r186 does **not** list it |
| Per-strand tint, AO, root darkening | `COLOR_0` (RGB **and A**) | core | universal; alpha multiplies base alpha for the cutout test |
| Spring/jiggle bones | `VRMC_springBone` (VRM 1.0, vendor) | vendor spec (colliders: sphere/capsule; springs = joint chains with stiffness) | three-vrm, VRM SDKs ([types](https://pixiv.github.io/three-vrm/docs/modules/types-vrmc-springbone-1.0)) |
| Strands as curves | `mode: LINE_STRIP` primitives | core, but **no width** | renders 1-px lines everywhere: not usable as hair |
| A "hair" shading model | — | none exists | engine-side: Unreal Hair shading model, a custom three.js/Godot shader |

**Conclusion:** a GLB hair asset that looks right in every reader = MASK cards, double-sided, tangent
along the strand, `KHR_materials_anisotropy` on top (ignored where unsupported: the card still
reads), vertex AO/root tint, inside→outside triangle order. Dual specular lobes, shift textures,
dithering/TAA and depth-offset are engine-side: ts23d can ship the **data** they need (tangents,
root/tip and seed in vertex attributes or atlas channels) plus a reference shader source, as it
already does for wear (`threeMaterialSource` / `godotShaderSource`, `src/material/shader*.ts`).

## 6. Stylised hair (hand-painted games)

Describe, don't copy: in hand-painted MMO styles (the "WoW look") hair is mostly **geometry plus
painted light**, not alpha. Artists build a shell of a few big, chunky locks, then paint each lock
with dark roots/valleys, a mid tone and a bright **painted highlight band** along the top edge of
every chunk; shadows avoid pure black; light comes from the texture, often "diffuse only"
([Polycount 1](https://polycount.com/discussion/comment/1982422),
[2](https://polycount.com/discussion/comment/1983328),
[WoW texturing breakdown thread](https://polycount.com/discussion/215804/world-of-warcraft-style-texturing-breakdown);
practitioner advice). Alpha cards appear only at the fringe (bangs, ponytail tips), UV'd to face the
same direction so painted light reads consistently
([80.lv Blender stylised breakdown](https://80.lv/articles/how-to-enhance-hand-painting-with-blender-shaders-for-stylized-character-art)).

ts23d already does the shell half: `src/kinds/head-hair.ts` builds top-knots, mohawks, swept locks
and braids as SDF sculpt edits on the skull field, and `head-tone.ts` bakes cavity and a warm key
into vertex colour. Missing: the per-lock **highlight band** and **groove lines** between strands.

## 7. Beards, eyebrows, eyelashes

| Piece | Game practice | ts23d today |
|---|---|---|
| Eyebrows | a few small cards on the brow, or painted into the skin; stylised: a sculpted ridge | `browEdits` (sculpted, `head-beard.ts`) |
| Eyelashes | one strip card per lid following the lid curve, cutout, angled outward | none |
| Beard / stubble | stubble painted on skin; short beards as a shell + short cards; long beards as cards like scalp hair | sculpted beard volume (`head-beard.ts`) |
| Moustache | cards or sculpt | sculpted |

*(Eyelash/eyebrow card practice is common knowledge in character art; no single fetched source.)*

## 8. Fur

| Technique | How | Source |
|---|---|---|
| **Shells** | N offset copies of the surface along the normal; each samples a slice of a fur volume texture with noise alpha | Lengyel, Praun, Finkelstein, Hoppe, "Real-Time Fur over Arbitrary Surfaces", I3D 2001 ([project](https://hhoppe.com/proj/fur/)) |
| **Fins** | quads extruded at silhouette edges, textured with a side view of the fur, to hide shell gaps at grazing angles | same paper; NVIDIA geometry-shader version ([whitepaper](https://developer.download.nvidia.com/SDK/10.5/direct3d/Source/Fur/doc/FurShellsAndFins.pdf)) |
| **Cards** | like hair cards, shorter, along a groom flow | standard for long fur (manes, tails) |
| **Sheen + painted fur** | no geometry: `KHR_materials_sheen` + strand texture | velvet/short pelts |

Shells are cheap per layer but are N overdraw layers; Nintendo titles (*Star Fox Adventures*,
current Switch games) and *Smash Bros. 4* (shells + fins) are cited examples
([80.lv](https://80.lv/articles/classic-video-games-trick-for-rendering-grass-fur/),
[Unreal forum](https://forums.unrealengine.com/t/fur-shader/5738); secondary sources). In a GLB,
shells are just N nested MASK meshes each with its own atlas slice: no extension needed, but each
layer is real triangles (no geometry shader).

## 9. Animation

- **Cards skinned to bone chains** is the common game approach: ponytails, braids and long locks
  get a joint chain; a spring/physics solver in the engine drives it. Physics on cards can cause
  intersections that "break the illusion" (80.lv).
- Unreal binds cards to the groom's guides (closest guide per card vertex, or a generated guide
  down each card) and simulates guides ([Epic Cards setup](https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-cards-and-meshes-for-grooms-in-unreal-engine)).
- VRM's `VRMC_springBone` puts the spring chains and sphere/capsule colliders **in the glTF**, which
  VRM-aware runtimes simulate.
- ts23d today: no skins (`gltf-capabilities.md`: later). It can already bake a **`sway`** on a
  pivoted part, so a ponytail or braid emitted as its own part with a pivot at the tie swings in
  every engine now.

## 10. Proposed: hair in ts23d (planned)

### 10.1 Design
One source, three outputs, chosen by LOD: **strands (data) → cards (LOD0/1) → shell (LOD2)**, plus a
`tubes` output for film/close-up renders. Strands never reach the GLB as lines.

The decisive advantage ts23d has over mesh-based tools: **the head is an SDF**
(`sculptField` / the `head` kind). Collision, scalp sampling, "is this card inside the head", root
distance and the shell are all field queries; no BVH, no raycaster.

### 10.2 API sketch

```ts
// src/primitives/hair-strands.ts — tier 2. Pure data, no mesh.
export interface Strand {
  readonly points: readonly Vec3[];     // root first, metres
  readonly width: readonly number[];    // per point (taper)
  readonly clump: number;               // clump index
  readonly seed: number;                // 0..1, per-strand variation (ID channel)
}
export interface HairGuide { readonly root: Vec3; readonly points: readonly Vec3[] }
export interface HairStyle {
  /** Scalp: the head field and a region mask (true where hair grows). */
  readonly scalp: { readonly field: Field; readonly region: (p: Vec3) => boolean; readonly bounds: readonly [Vec3, Vec3] };
  /** Either explicit guides or a preset that writes them from the scalp and a part line. */
  readonly guides: readonly HairGuide[] | { readonly preset: 'swept' | 'side_part' | 'bob' | 'ponytail'
      | 'buzz' | 'mohawk' | 'long_straight' | 'curly'; readonly part?: Vec3; readonly length: number };
  readonly density: number;             // strands per cm² of scalp (data); cards derive from clumps
  readonly clumps: number;              // target clump count (≈ cards at LOD0)
  readonly clumpShape?: number;         // 0 = loose, 1 = tight at the tip (Blender/Houdini clump profile)
  readonly frizz?: number;              // metres of noise at the tip
  readonly curl?: { readonly radius: number; readonly pitch: number };
  readonly gravity?: number;            // 0..1 droop between guide shape and straight down
  readonly offset?: number;             // keep-out distance above the scalp (m), default 0.004
}
export function hairStrands(s: HairStyle, rng: Rng): Strand[];

// src/primitives/hair-cards.ts — tier 2. Strands → card ribbons in the hair strips.
export interface HairCardOptions {
  readonly layers: readonly ('base' | 'mid' | 'top' | 'flyaway')[];   // ctx.pick per LOD
  readonly segments: number;            // along each card; ctx.pick([8, 4, 2])
  readonly widthScale?: number;         // card width ÷ clump width, default 1.2
  readonly strip?: HairStripId;         // 'hair_dense' | 'hair_mid' | 'hair_fine' | 'hair_fly'
  readonly order?: 'inside-out';        // triangle order for blended readers (default on)
}
export function hairCards(strands: readonly Strand[], o: HairCardOptions): Mesh;

// src/primitives/hair-shell.ts — tier 2. Strands → a closed SDF helmet (LOD2, stylised).
export function hairShell(strands: readonly Strand[], o: {
  resolution: number; bands?: number /* painted highlight bands per lock */; grooves?: number;
}): Mesh;

// src/primitives/hair-tubes.ts — strands → thin swept tubes (3–4 sides) for film/close-up.
export function hairTubes(strands: readonly Strand[], o: { sides: 3 | 4; maxStrands: number }): Mesh;

// src/kinds/head — the head kind gains `hair: { style, lod }` and emits a part:
ctx.part('hair', ctx.pick([cardsLod0, cardsLod1, shell]), { surface: ctx.lod < 2 ? 'hair' : 'opaque' });
```

### 10.3 Strand generation (deterministic)
1. **Roots:** sample the scalp's zero set where `region(p)`: mesh the scalp at a coarse resolution,
   then area-weighted Poisson-disk sampling with `ctx.rng` in fixed triangle order. Count = density ×
   area (capped; strands are never all emitted, only clump centres + a few per clump).
2. **Guides:** a preset writes 20–60 guides from a comb direction field (away from a part line,
   down with gravity), stepping each point and **projecting out of the head** with
   `p += n · max(0, offset − field(p))` (n = field gradient). Explicit guides skip this.
3. **Interpolate:** each root takes its three nearest guide roots, blends their shapes
   barycentrically in the local scalp frame (Blender *Interpolate Hair Curves* analogue).
4. **Clump:** k-means-free and deterministic: clump centres = a Poisson subset of roots; each
   strand is pulled toward its clump centre's curve by `clumpShape · t^γ` (t = 0 root, 1 tip).
5. **Frizz / curl:** value noise (`valueNoise(rng)`) scaled by `t`; curl = a helix about the
   clump curve. Re-project out of the head after every step.
6. Output stays a plain array: testable, hashable, reusable for cards, shells and tubes.

### 10.4 Cards: the trim-sheet way
Cards need a texture with alpha. ts23d's sheet has two kinds of slot (`src/material/trim-sheet.ts`):
**strips** (64 px rows that tile along U through REPEAT) and **cells** (256 px decals; foliage cards
live in cells 8–18, cutout alpha in the albedo's A channel).

Proposal: hair goes in **strips, not cells**. U runs along the strand (tiles: any card length, no
stretching), V runs across the clump (64 px at 4096²). Four alpha-bearing rows: `hair_dense`,
`hair_mid`, `hair_fine`, `hair_fly`, painted from the existing `tex.strands` stamp
(`src/material/tex/stamps-organic.ts`, already used by `CREATURE_MATERIALS.hair`) with alpha. Costs 4
of the 14 custom rows (or 4 built-in rows, a sheet-layout version bump). What a strip cannot hold
(root→tip, seed, AO), the vertices carry:

| Channel | Where in ts23d | Why there |
|---|---|---|
| alpha (strand mask) | strip albedo A | per texel |
| strand direction | `TANGENT` = dP/dU (U runs along the strand) → also the anisotropy direction, no texture needed | exact by construction |
| root → tip | vertex colour ramp (dark root → light tip) and **vertex alpha** fading toward the tip | strips tile, so the texture can't know where the tip is |
| tapering tips | strip alpha encodes per-strand *length rank* (0.5–1); vertex alpha ramps 1 → 0.5 along the card; MASK at 0.5 drops strands one by one toward the tip | tapered ends from a tiling texture |
| seed / variation | per-card hue/value jitter in `COLOR_0` from `ctx.rng` | free |
| AO / depth | vertex colour from layer depth + `bakeAo` | ATI's per-vertex AO |

Card geometry: one ribbon per clump along the clump-centre curve, `segments` quads, width from the
clump's spread × `widthScale`, plane oriented so its normal is the **scalp normal transported along
the curve** (cards lie over the head, as artists place them; `transportFrames` already does
parallel transport for `sweep`). Layers come from root depth order: `base` = clumps whose cards hug
the scalp (offset ≈ 2 mm, dense strip), `top`/`fine` outermost, `flyaway` = 1–3-strand cards.
Triangles are emitted **inside → outside** (base → flyaway, then by distance from the head centre),
the ATI static order.

### 10.5 A fifth surface: `'hair'`
ADR 008 caps surfaces at four and says to revisit "when an engine target needs a fifth shading
model". Hair is that case: `surface: 'hair'` = MASK + `doubleSided` + `alphaCutoff 0.5` +
**`KHR_materials_anisotropy`** (`anisotropyStrength ≈ 0.7`, direction = tangent) + `TANGENT`
always written. In `extensionsUsed`, never `extensionsRequired`, so a reader without it shows plain
cutout cards. Same shared texture set: still one texture, one more draw call per pivot with hair.
Needs: an ADR (supersedes 008's cap), `Surface` union in `src/core/part.ts`, `materials.ts`,
`merge-pivots.ts`, tangent writing in `primitive.ts`, and **`COLOR_0` alpha** (today
`writePrimitive` hard-codes A = 65535 and `Mesh.colors` is RGB).

### 10.6 Shell (LOD2 and stylised)
`hairShell` = smooth union of capsule chains (the proposed `roundCone`/`skin()` from
[10-sculpting](../idea/10-sculpting.md)) along each clump curve, unioned with the scalp offset by
`offset`, meshed by `sdf`. Stylised paint: per lock, a **highlight band** = a vertex-colour lift
where the field's normal faces the key light and the point is near the lock's crest (the curve's
outward side), **grooves** = a `crease` stroke between neighbouring clumps. This is the far LOD for
realistic hair and the *only* LOD for hand-painted styles.

### 10.7 LOD policy and budgets
Targets below are ts23d proposals informed by the sources (80.lv: 40k polys "heavy"; MetaHuman:
cards at all non-zero LODs), not quoted industry numbers.

| LOD | Realistic (cards) | Stylised | What drops |
|---|---|---|---|
| 0 | 600–1,500 cards × 8 segs ≈ 10–25k tris; all four layers | shell 3–6k tris + ≤ 100 fringe cards | — |
| 1 | 200–500 cards × 4 segs ≈ 2–4k tris; no flyaways, base layer halved (it's hidden) | shell 1–2k | flyaways, half the base, segments |
| 2 | shell 300–800 tris, opaque, painted | shell 300–600 | all alpha |

Overdraw budget: average alpha layers over the scalp at LOD0 ≤ 4 (dense base + 2 volume + fine);
report it.

### 10.8 Fur (planned)
`furShells(mesh, { layers: ctx.pick([12, 6, 0]), length, density, strip: 'fur_shell' })`: N offset
copies along vertex normals (offset scaled per vertex by a length mask), each mapped to a strip row
whose alpha threshold rises with layer index (Lengyel's slices, via vertex alpha so one strip
serves all layers). Fins only at LOD0 and only for silhouettes known offline (ears, tail): optional.
Long fur (mane, tail) = `hairCards` with fur presets. LOD2 = `KHR_materials_sheen` on the base mesh
(*sheen surface not in ts23d yet*). Effort: M.

### 10.9 Animation (planned, staged)
1. **Now-able:** ponytails/braids as separate parts pivoted at the tie with `sway` (no new code).
2. **With skins** (roadmap: later): one joint chain per lock group, weights by arclength along the
   clump curve; ≤ 4 influences.
3. **Optional `VRMC_springBone`** writer for VRM runtimes (opt-in, `extensionsUsed`).

## 11. QA gates (proposed)

| Gate | Check | Code (proposed) | Cost |
|---|---|---|---|
| **Scalp coverage** | sample 2k scalp points; from each, cast along +normal through the card mesh; a point is covered when the accumulated alpha (strip A × vertex A ≥ cutoff at the hit UV) ≥ 1 before leaving the hair bounds. Fail if covered < 97 % at LOD0, < 90 % LOD1 (LOD2 shell: exact, field test) | `T3D_HAIR_GAPS`, fix: "raise clumps / base layer density in <region>" | `ray-grid.ts` + CPU sheet alpha |
| **Penetration** | every card vertex: `field(p) ≥ offset/2` | `T3D_HAIR_PENETRATES`, fix: "increase `offset` or re-project guides" | O(vertices) field calls |
| **Floating roots** | each base card's first row within 1.5 × offset of the scalp | `T3D_HAIR_FLOATING` | trivial |
| **Edge-on cards** | % of cards whose plane is within 10° of a contact-sheet view axis over > 50 % of their length (they vanish in that view) | warning | trivial |
| **Overdraw** | mean and p95 alpha layers per covered scalp point | report + budget | from the coverage rays |
| **Tangent sanity** | `TANGENT·(next − this point)` > 0.9 along every card | test, not gate | — |
| **Determinism** | strands hash stable for the same seed | existing `bun run determinism` | — |

Plus a **review view**: `t3d review` renders hair over a magenta scalp so gaps are obvious to the
VLM reviewer.

## 12. Test plan (failure case first)

1. `hairStrands`: a guide that starts inside the head → every output point is outside
   (`field ≥ offset`); then same seed ⇒ identical arrays; different seed ⇒ different roots.
2. Region mask false everywhere → `T3D_*` error with a fix, not an empty mesh.
3. `hairCards`: a single straight strand → one ribbon of `segments` quads, U monotonic along the
   strand, `TANGENT` parallel to the strand within 1°.
4. Inside→outside: the triangle index order is non-decreasing in layer rank.
5. Vertex alpha: tip row alpha = 0.5, root = 1; exporter writes them (`COLOR_0` A ≠ 65535).
6. Coverage gate: a deliberately bald patch (region mask hole) fails `T3D_HAIR_GAPS`; full style
   passes.
7. Penetration gate: offset = 0 with a curl that dips into the head fails.
8. Export: `surface: 'hair'` writes `KHR_materials_anisotropy` in `extensionsUsed` only; glTF
   Validator 0 errors; three.js loads it as `MeshPhysicalMaterial` with `anisotropy > 0`.
9. LOD: LOD1 has no flyaway cards and ≤ 40 % of LOD0's triangles; LOD2 has no MASK material.
10. Visual: contact sheet + hero of `human_head` with `swept` and `long_straight`; read the PNGs.

## 13. Recommended build order (hair)

| # | Item | Module | Effort |
|---|---|---|---|
| 1 | `COLOR_0` alpha end to end (Mesh RGBA, exporter) | core, export | S |
| 2 | `hairStrands` (roots, presets, interpolate, clump, frizz, SDF collision) | primitives | M |
| 3 | Hair strips with alpha (`hair_dense/mid/fine/fly`) from `tex.strands` | material | S–M |
| 4 | `hairCards` (ribbons, layers, inside→outside order, vertex root→tip) | primitives | M |
| 5 | `surface: 'hair'` + always-tangent + `KHR_materials_anisotropy` (ADR) | core, export | S–M |
| 6 | `hairShell` LOD2 / stylised bands + grooves | primitives (+ sculpting `roundCone`) | M |
| 7 | Hair QA: coverage, penetration, floating, overdraw | qa | M |
| 8 | Head kind wiring (`hair: { style }`, eyelash strips, brow cards) | kinds | S–M |
| 9 | `furShells` (+ fins optional) | primitives | M |
| 10 | Reference hair shader sources (three/Godot: dual shifted lobes) | material | S |
| 11 | Skinned lock chains / `VRMC_springBone` | export (needs skins) | L |
| 12 | `hairTubes` for film renders, later `.usda` BasisCurves | primitives / export | S / L |

## Sources

- T. Scheuermann, "Hair Rendering and Shading", ATI, GDC 2004 — [slides PDF](https://web.engr.oregonstate.edu/~mjb/cs557/Projects/Papers/HairRendering.pdf) (read: slides 3, 5–17); SIGGRAPH 2004 sketch [PDF](https://history.siggraph.org/wp-content/uploads/2022/12/2004-Talks-Scheuermann_Practical-Real-Time-Hair-Rendering-and-Shading.pdf)
- S. Marschner, H. W. Jensen, M. Cammarano, S. Worley, P. Hanrahan, "Light Scattering from Human Hair Fibers", SIGGRAPH 2003 — [project](https://graphics.stanford.edu/papers/hair/), [PDF](https://w1.graphics.cornell.edu/pubs/2003/MJC+03.pdf)
- J. Kajiya, T. Kay, "Rendering Fur with Three Dimensional Textures", SIGGRAPH 1989 (not fetched; model as reproduced by Scheuermann)
- Epic: [Setting up cards and meshes for grooms](https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-cards-and-meshes-for-grooms-in-unreal-engine) · [Hair Card Generator](https://dev.epicgames.com/documentation/en-us/unreal-engine/hair-card-generator-for-grooms-in-unreal-engine) · [Creating cards and LODs](https://dev.epicgames.com/documentation/unreal-engine/creating-hair-cards-and-lods-using-hair-card-generator) · [Hair rendering and simulation](https://dev.epicgames.com/documentation/en-us/unreal-engine/hair-rendering-and-simulation-in-unreal-engine) · [MetaHuman LODs](https://dev.epicgames.com/documentation/metahuman/controlling-metahuman-levels-of-detail-lods-in-unreal-engine) · [Hair groom component (UEFN)](https://dev.epicgames.com/documentation/en-us/metahuman/hair-groom-component-for-unreal-editor-for-fortnite)
- Frostbite: [Hair rendering and simulation, part 1](https://www.ea.com/frostbite/news/frostbite-hair-rendering-and-simulation) · [part 2](https://www.ea.com/frostbite/news/frostbite-hair-rendering-and-simulation-2) · S. Tafuri, "Strand-based Hair Rendering in Frostbite", SIGGRAPH 2019 Advances — [slides](https://www.advances.realtimerendering.com/s2019/hair_presentation_final.pdf)
- AMD TressFX: [GDC slides](https://www.slideshare.net/slideshow/gs4147-billbilodeau/28502778) · [TressFX 3.1](https://gpuopen.com/tressfx-3-1/)
- SideFX: [Hair cards](https://www.sidefx.com/docs/houdini/fur/haircards.html) · [80.lv: Houdini hair cards](https://80.lv/articles/houdini-hair-cards-for-game-meshes/)
- Blender manual: [Hair nodes](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/hair/index.html)
- C. Verhoolen, [Techniques for game character hair creation](https://80.lv/articles/techniques-for-game-character-hair-creation), 80.lv, 2018
- Tool pages (not run): [Simple Hair Cards](https://superhivemarket.com/products/simple-hair-cards) · [Keratin](https://superhivemarket.com/products/hair-card-studio) · [HairTG](https://flippednormals.com/product/hairtg-hair-fur-287)
- Unreal forum threads on dithered/masked hair (practitioner reports): [1](https://forums.unrealengine.com/t/improving-hair-shader-dithered-alpha-display-quality/141087) · [2](https://forums.unrealengine.com/t/how-do-you-make-a-good-hair-shader-for-vr-with-msaa/138400) · [3](https://forums.unrealengine.com/t/ue5-masked-materials-tingeling-and-shadow-noise-issues-haircards-why/546368)
- Stylised: Polycount [1](https://polycount.com/discussion/comment/1982422) · [2](https://polycount.com/discussion/comment/1983328) · [WoW texturing breakdown](https://polycount.com/discussion/215804/world-of-warcraft-style-texturing-breakdown) · [80.lv stylised Blender](https://80.lv/articles/how-to-enhance-hand-painting-with-blender-shaders-for-stylized-character-art)
- Fur: J. Lengyel, E. Praun, A. Finkelstein, H. Hoppe, "Real-Time Fur over Arbitrary Surfaces", I3D 2001 — [project](https://hhoppe.com/proj/fur/) · [NVIDIA shells and fins](https://developer.download.nvidia.com/SDK/10.5/direct3d/Source/Fur/doc/FurShellsAndFins.pdf) · [80.lv shell texturing](https://80.lv/articles/classic-video-games-trick-for-rendering-grass-fur/)
- glTF: [extension registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md) · [KHR_materials_anisotropy](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_anisotropy) · [KHR_materials_diffuse_transmission](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_diffuse_transmission) · [glTFast features 6.8](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.8/manual/features.html) · three.js r186 `GLTFLoader.js` extension list (local `node_modules`)
- VRM: [three-vrm VRMC_springBone types](https://pixiv.github.io/three-vrm/docs/modules/types-vrmc-springbone-1.0)
