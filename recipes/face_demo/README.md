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
| 0 | one Catmull–Clark level over the base, relief strokes (folds, brow shelf, warts, scar furrows: `relief.ts`), simplified to 25.3k triangles | cap at 7.5 mm + dense cards (16k–32k) |
| 1 | the base topology (strokes ≥ 8 mm only: the brow shelf), simplified to 5.4k | cap at 12 mm + a quarter of the cards, twice as wide (1.1k–3.2k) |
| 2 | the base topology, painted with the zones only (no mottle, blotches, marks or curvature tint: on 900 triangles they are a patchwork), AO from 24 rays at 0.3, simplified to 0.9k | cap at 17 mm + a handful of wide cards (`farStyle`, 0.2k–0.6k), so the far head keeps a broken outline |

## Materials
Skin sits on three strips of `recipes/_lib/face/skin-strip.ts`, one draw: `face_skin` (pores,
glossier crowns, roughness 0.38–0.58), `face_skin_oily` on the T-zone (forehead centre, nose,
chin: 0.2–0.42) and `face_skin_wet` on the lips (0.12–0.2), all under the `skin` finish (a soft
grazing sheen plus a thin oily coat, clearcoat 0.3 at roughness 0.28: the tight second highlight
on brow, nose and shoulder; the path-traced hero adds subsurface diffusion to any `skin` finish);
corneas a clearcoat. The hair
takes no finish: the cutout strand cards carry the strand read, and the sculpted cap under them
is on the `plain` strip in their shade. Tone is vertex colour: flush
(cheeks, nose, ears), lips, cool sockets and jaw underside, brows, hair-coloured scalp under the
hairline, a dark lash line on each upper lid, cavity darkening. The hairline sits a brow's height
above the brows (forehead and eyebrows show); card tones stay within 0.68–1.12 of the hair colour
so the hair reads as one mass, and a long cut's scalp cards are short shingles (its length is the
fall behind the ears).

The hero is a portrait (`recipes/_lib/bust/hero.ts`): a fixed camera that fills 86 % of the frame
height with the bust.

## Wear (per character, `characters.ts` → `Character.wear`)
| Asset | Story | Marks |
|---|---|---|
| `face_human` | works outdoors | sun, four moles, a day's stubble on the jaw, a nick through one brow |
| `face_orc` | a fighter | a cut from forehead through brow to cheek, one along the jaw, a split lip; camp dirt; stained tusks |
| `face_elf` | ageless, not porcelain | three moles, a little sun |
| `face_dwarf` | an old smith | forge-reddened skin, a burn line over the nose, a forehead cut, soot, forehead lines, crow's feet, eye bags and deep folds as relief (age 0.9), a heavy brow |
| `face_goblin` | a scavenger | seven warts (raised), blotched skin, grime, claw marks over the bald vault |

Marks are few on purpose: 3–5 seeded moles per face (`molesOf`), never a noise-driven rash;
scars are a pale ridge with a dark rim in a shallow furrow. Every bust also gets the folds beside
the mouth as relief, age-driven shadows under the eyes, and stands on a weathered stone plinth
(chipped arrises, dust on the ledges, damp at the foot: `weather()`, coverage in the manifest).

## References
Anatomy and proportions: `docs/research/head-analysis.md` (measured scan ratios),
`docs/research/stylised-creatures.md` (race conventions), the owner's sculpting notes (block-out →
planes → features; raking light to judge forms).

## Triangle budget (As of 2026-11-19)
Human 54k / 11k / 2.4k, orc 53k / 10.6k / 2.2k, goblin 34.5k / 8.0k / 1.2k, elf 63k / 13k / 3.1k, dwarf 71k / 14k / 3.7k against the bust band of 60k / 12k / 1.5k (they were 95k–148k / 14k–51k / 5.7k–11k). The skin is the imported base at 25.3k / 5.4k / 0.9k (`recipes/_lib/face/base-lod.ts`); the hair mass under the cards is coarse; eyes and plinth lost their sub-pixel density. Human, orc and goblin fit LOD0 and LOD1; the goblin fits every LOD.

Budget why: elf and dwarf carry the long fall and the full beard as strand cards (24k–32k at LOD0); at LOD2 the sculpted hair mass folds below a 1.7 cm cell, so 1–2.5k of it stays under the far cards.

