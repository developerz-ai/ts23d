# face_demo — five busts from one anatomical base

**One CC0 anatomical head (MakeHuman hm08), five original characters: a human, an orc, an elf, a
dwarf and a goblin.** Each is the same quad mesh moved by named landmarks through a thin-plate-spline
warp (`tpsWarp`, `src/primitives/warp-solve.ts`) — no blobs unioned, so no seams to blend and the
base's edge loops round eyes and mouth survive (ready for later morph targets). Full method,
licence verification and the race table: [docs/research/face-base.md](../../docs/research/face-base.md).

## Why
The SDF-sculpted heads (`human_head`, `elf_head`, `goblin_head`, `orc_head`) read lumpy and gaunt:
every feature is a primitive pushed into the skull. Real anatomy first, stylisation second — the
way a character artist starts from a base mesh and moves big forms before detail.

## Characters (original designs; ratios against the measured human base)
| Asset | Race preset | Age / weight / asymmetry | Look |
|---|---|---|---|
| `face_human` | identity (the base itself) | 0.25 / 0 / 0.3 | short swept-back brown hair, blue-grey eyes |
| `face_orc` | jaw ×1.52 (+0.08 H drop), brow shelf +0.1 H set 0.032 H lower with a relief ridge over it, lids ×0.7 open, nose ×2.25 wide ×0.58 projection with a flat bridge (−0.05 H), underbite +0.04 H, neck ×1.5, trapezius +0.2 H, head ×1.12 | 0.4 / 0.3 / 0.8 | olive skin, amber eyes, lower tusks, black crest |
| `face_elf` | jaw ×0.85, zygoma high, nose ×0.85 narrow, face ×1.08 long, eyes tilted +0.032 H, ears ×1.25 pulled into a longer back-swept point (tip +0.28 H up) | 0.05 / −0.4 / 0.3 | pale skin, green eyes, long honey-gold hair swept back, falling behind the ears |
| `face_dwarf` | nose ×1.6 wide ×1.25 projection, brow +0.05 H, jaw ×1.25, face ×0.88 short, vault ×1.08 wide | 0.9 / 0.5 / 0.6 | ruddy skin, brown eyes, copper hair, spade beard and moustache |
| `face_goblin` | vault ×1.16 wide ×1.12 tall, nose ×2.6 projection + a stronger hook, eyes ×1.42, brow +0.035 H, chin −0.03 H, jaw ×0.82, mouth ×1.35, ears ×1.7 swung out 40°, head ×0.84 | 0.3 / −0.3 / 1 | yellow-green skin, slit amber eyes, lips parted on small teeth |

## Measured spec
- Eye spacing: base IPD 61.6 mm × race spacing × head scale (QA `measures`, ±2 %).
- Overall size: as built (L × W × H in `face_demo.ts`), a design spec of an invented character.

## Parts and LODs
`skin` (head, neck, shoulders; chest and arm cuts capped; below a neckline round the neck's base
the shoulders and chest are painted as a dyed wool tunic and mapped onto the `bust_wool` strip,
`recipes/_lib/face/garment.ts`: the bust ends dressed, not as a sawn mannequin), `collar` (the
tunic's binding as geometry: the neckline found where it crosses the skin's edges, binned round
the neck, smoothed and swept as a flattened roll a third sunk into the skin, `collar.ts`: painted,
its edge stair-stepped between vertices, D477; 128 / 72 / 40 samples × 8 / 6 / 5 sides; its V's
mitred corner is a declared crease), `eye_l` / `eye_r` (code eyeballs from
`recipes/_lib/bust/eye.ts`, cornea finish), `hair` (the sculpted cap: volume, a parting, locks of
uneven width; a long cut adds a curtain mass behind the neck under its fall cards), `hair_strands` (cutout
strand cards over the cap at LOD0/1 in the lock style (`locks`, D461, `hair_locks` strip): dark
mass cards under narrow clumped locks, swept crown locks hugging the cap (kept 7 cm off the ears: one pushed out by an ear stood straight
out of the temple, D478), short wisps along the hairline and a few 2.6 cm strays lying close; falls and curtain locks for the long cut, a standing crest, a beard with a moustache
lying on its own sculpted locks over the upper lip), `teeth` (only where the lips part),
`tusk_l` / `tusk_r` (orc), `plinth`.

Every LOD's skin is the painted, AO-baked base QEM-simplified to `SKIN_TRIS`
(`recipes/_lib/face/base-lod.ts`; a CC0 base mesh, so ADR 011 allows it): ears, colour zones and
the clean bust edge survive.

| LOD | Skin | Hair |
|---|---|---|
| 0 | one Catmull–Clark level over the base, relief strokes (folds, brow shelf, warts, scar furrows: `relief.ts`), simplified to 25.3k triangles | cap at 7.5 mm + dense cards (16k–32k) |
| 1 | the base topology (strokes ≥ 8 mm only: the brow shelf), simplified to 5.4k | cap at 12 mm + a quarter of the cards, twice as wide (1.1k–3.2k) |
| 2 | the base topology, painted with the zones only (no mottle, blotches, marks or curvature tint: on a far mesh they are a patchwork), AO from 24 rays at 0.3, simplified to 1.5k (at 0.9k the face broke into a handful of flat plates of different tone) | cap at 17 mm with its painted hairline and no cards (the lock style's far rule: a handful of wide cards over it read as chips); a beard is a spade: a dark root mass along the jaw, a tapering body and three lock tips with open notches between them, a darker moustache mass standing proud of the lip (D478) |

## Materials
Skin sits on four strips of `recipes/_lib/face/skin-strip.ts` plus the tunic's wool, one draw:
`face_skin` (pores: roughness 0.5–0.68, cheeks and shoulders), `face_skin_oily` on the T-zone
(the lower half of the forehead's centre, nose, chin: satin, 0.34–0.5), `face_skin_matte` on the
scalp (above the forehead's middle and behind the ears: 0.76–0.9, so a bald or shaven dome has a
broad soft sheen, not wet hot spots, D479) and `face_skin_wet` on the lips (0.12–0.2),
all under the shared `skin` finish (`skinFinish`: a soft grazing sheen and a dielectric
reflectance of 0.8, no clear coat: one coat over the whole part lit head and shoulders alike as wet
latex; the path-traced hero adds subsurface diffusion to any `skin` finish); corneas a clearcoat.
The hair takes no finish: the cutout strand cards carry the strand read, and the sculpted cap
under them is on the `plain` strip at 0.8 of the hair's mid tone, so the hair reads as one mass
with locks over it. Tone is vertex colour (`paint.ts`), in the portrait painter's bands: the
forehead lightest, a faint, broad flush along the cheekbone to the nose's wing (a path, not a
round blob: discs read as rouge, D476), the nose and ears warm, the jaw and chin cooler, the sockets cool and
dark; lips, brows, hair-coloured scalp under the hairline, the lid's fold in shadow above a dark
lash line 3 mm wide on each upper lid, cavity darkening. Skin tones are linear albedo in skin's
measured range. The eyeballs carry the upper lid's shadow (`lidShadow`), so the white and the iris
do not read as lit stickers. Card tones run dark at the root to light at the tip (0.42–1.18 of the
hair colour) with the cards laid along the comb; a long cut's scalp cards are short shingles (its
length is the fall cards behind the ears).

The hero is a portrait (`recipes/_lib/bust/hero.ts`): a fixed front-left 3/4 camera just above eye
level framing the head and shoulders (crown to upper chest), the face filling the frame.

## Wear (per character, `characters.ts` → `Character.wear`)
| Asset | Story | Marks |
|---|---|---|
| `face_human` | works outdoors | sun and wind, four moles, a day's stubble (dark dots in a soft-edged beard zone) on jaw, chin and upper lip, a nick through one brow, a split on the chin |
| `face_orc` | a fighter | a cut from forehead through brow to cheek, one along the jaw, a split lip; camp dirt; stained tusks |
| `face_elf` | ageless, not porcelain | freckle blotches and moles, a little sun and wind, a thin old cut along the cheekbone |
| `face_dwarf` | an old smith | forge-reddened skin (`wind`: a broad raw redness over the cheekbones and nose), a burn line over the nose, a forehead cut, soot, forehead lines, crow's feet, eye bags and deep folds as relief (age 0.9), a heavy brow |
| `face_goblin` | a scavenger | seven warts (raised), blotched skin, grime, claw marks over the bald vault |

Each tunic (`characters.ts` → `garment`) carries wear at hero scale: dust settled on the shoulder
tops (a coarse blot breaks it up), the shoulder seams' tops sun-faded paler and greyer, a broad
band of collar grime under the binding, grime darkening toward the chest cut and fold streaks a
hand wide running down from the collar: human undyed wool with a leather collar, orc rust hide-cloth
under an iron band, elf forest green with a gold braid and a deeper V, dwarf madder red under a
brass-studded collar with ash on the shoulders, goblin filthy sackcloth with a rope collar.

Marks are few on purpose: 3–5 seeded moles per face (`molesOf`), never a noise-driven rash;
scars are a pale ridge with a dark rim in a shallow furrow, paler and greyer than the skin round them (relative to its own value: a fixed near-white read as a wet hot spot on green skin). Every bust also gets the folds beside
the mouth as relief, age-driven shadows under the eyes, and stands on a weathered stone plinth
(chipped arrises, dust on the ledges, damp at the foot: `weather()`, coverage in the manifest).

## References
Anatomy and proportions: `docs/research/head-analysis.md` (measured scan ratios),
`docs/research/stylised-creatures.md` (race conventions), the owner's sculpting notes (block-out →
planes → features; raking light to judge forms).

## Triangle budget (As of 2026-11-20)
Human 56k / 12.3k / 3.2k, orc 56.3k / 12.3k / 3.0k, goblin 36.6k / 8.9k / 2.2k, elf 65.8k / 14.4k / 3.8k, dwarf 78.3k / 16.3k / 3.8k against the bust band of 60k / 12k / 1.5k (they were 95k–148k / 14k–51k / 5.7k–11k). The skin is the imported base at 25.3k / 5.4k / 1.5k (`recipes/_lib/face/base-lod.ts`; LOD2 raised from 0.9k because the far face is shaded per facet); the tunic is paint on the same skin, its collar a 2k / 0.9k / 0.4k swept roll; the hair mass under the cards is coarse; eyes and plinth lost their sub-pixel density. Goblin fits LOD0 and LOD1.

Budget why: elf and dwarf carry the long fall and the full beard as strand cards (23k–34k at LOD0); at LOD2 the sculpted hair mass folds below a 1.7 cm cell, so 1–2.5k of it stays as the far hair, and the far skin keeps 1.5k triangles so the face is not a few flat plates.

