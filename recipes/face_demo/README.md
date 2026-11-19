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
| `face_orc` | jaw ×1.4 (+0.07 H drop), brow shelf +0.07 H, nose ×1.95 wide ×0.72 projection with a flatter bridge, underbite +0.04 H, neck ×1.5, trapezius +0.2 H, head ×1.12 | 0.4 / 0.3 / 0.8 | olive skin, amber eyes, lower tusks, black crest |
| `face_elf` | jaw ×0.85, zygoma high, nose ×0.85 narrow, face ×1.08 long, eyes tilted +0.032 H, ears ×1.25 pulled into a longer back-swept point | 0.05 / −0.4 / 0.3 | pale skin, green eyes, long pale-gold hair falling behind the ears |
| `face_dwarf` | nose ×1.4 wide ×1.25 projection, brow +0.03 H, jaw ×1.25, face ×0.88 short, vault ×1.08 wide | 0.6 / 0.5 / 0.6 | ruddy skin, brown eyes, copper hair, spade beard and moustache |
| `face_goblin` | vault ×1.16 wide ×1.12 tall, nose ×2.6 projection + a stronger hook, eyes ×1.3, chin −0.03 H, jaw ×0.82, mouth ×1.35, ears ×1.7 swung out 40°, head ×0.84 | 0.3 / −0.3 / 1 | yellow-green skin, slit amber eyes, lips parted on small teeth |

## Measured spec
- Eye spacing: base IPD 61.6 mm × race spacing × head scale (QA `measures`, ±2 %).
- Overall size: as built (L × W × H in `face_demo.ts`), a design spec of an invented character.

## Parts and LODs
`skin` (head, neck, shoulders; chest and arm cuts capped), `eye_l` / `eye_r` (code eyeballs from
`recipes/_lib/bust/eye.ts`, cornea finish), `hair` (the sculpted cap: volume, a parting, locks of
uneven width; a long cut adds fall masses over the back and shoulders), `hair_strands` (cutout
strand cards over the cap at every LOD: swept locks, lifted crown locks, wisps along the hairline,
flyaways; falls for the long cut, a standing crest, a beard), `teeth` (only where the lips part),
`tusk_l` / `tusk_r` (orc), `plinth`.

Every LOD's skin is the painted, AO-baked base QEM-simplified to `SKIN_TRIS`
(`recipes/_lib/face/base-lod.ts`; a CC0 base mesh, so ADR 011 allows it): ears, colour zones and
the clean bust edge survive.

| LOD | Skin | Hair |
|---|---|---|
| 0 | one Catmull–Clark level over the base, simplified to 26k triangles | cap at 7.5 mm + dense cards (16k–32k) |
| 1 | the base topology, simplified to 5.6k | cap at 12 mm + a quarter of the cards, twice as wide (1.1k–3.2k) |
| 2 | the base topology, simplified to 1k | cap at 17 mm + a handful of wide cards (`farStyle`, 0.2k–0.6k), so the far head keeps a broken outline |

## Materials
Skin sits on the shared `face_skin` strip (`recipes/_lib/face/skin-strip.ts`: pores, glossier
crowns, its own roughness) under the `skin` finish (a soft grazing sheen); corneas a clearcoat. The hair
takes no finish: the cutout strand cards carry the strand read, and the sculpted cap under them
is on the `plain` strip in their shade. Tone is vertex colour: flush
(cheeks, nose, ears), lips, cool sockets and jaw underside, brows, hair-coloured scalp under the
hairline, cavity darkening.

## Wear (per character, `characters.ts` → `Character.wear`)
| Asset | Story | Marks |
|---|---|---|
| `face_human` | works outdoors | sun, freckles, a day's stubble, a nick through one brow |
| `face_orc` | a fighter | a cut from forehead through brow to cheek, one along the jaw, a split lip; camp dirt; stained tusks |
| `face_elf` | ageless, not porcelain | a dusting of freckles, a little sun |
| `face_dwarf` | a smith | forge-reddened skin, a burn line over the nose, a forehead cut, soot, forehead lines and deep folds (age 0.6) |
| `face_goblin` | a scavenger | blotched, spotted skin, grime, claw marks over the bald vault |

Every bust also gets age-driven shadows under the eyes, and stands on a weathered stone plinth
(chipped arrises, dust on the ledges, damp at the foot: `weather()`, coverage in the manifest).

## References
Anatomy and proportions: `docs/research/head-analysis.md` (measured scan ratios),
`docs/research/stylised-creatures.md` (race conventions), the owner's sculpting notes (block-out →
planes → features; raking light to judge forms).

## Triangle budget (As of 2026-11-19)
Human 59k / 12k / 2.7k, orc 57k / 11k / 2.5k, goblin 35k / 8k / 1.2k, elf 68k / 14k / 3.4k, dwarf 77k / 15k / 4.0k against the bust band of 60k / 12k / 1.5k (they were 95k–148k / 14k–51k / 5.7k–11k). The skin is the imported base at 26k / 5.6k / 1k (`recipes/_lib/face/base-lod.ts`); the hair mass under the cards is coarse; eyes and plinth lost their sub-pixel density. Human, orc and goblin fit LOD0 and LOD1; the goblin fits every LOD.

Budget why: elf and dwarf carry the long fall and the full beard as strand cards (27k–35k at LOD0); at LOD2 the sculpted hair mass folds below a 1.7 cm cell, so 1–2.5k of it stays under the far cards.

