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
| `face_orc` | jaw ×1.4 (+0.07 H drop), brow shelf +0.07 H, nose ×1.8 wide ×0.72 projection, underbite +0.04 H, neck ×1.5, head ×1.12 | 0.4 / 0.3 / 0.8 | olive skin, amber eyes, lower tusks, black crest |
| `face_elf` | jaw ×0.85, zygoma high, nose ×0.85 narrow, face ×1.08 long, eyes tilted +0.02 H, ears ×1.15 pulled into a back-swept point | 0.05 / −0.4 / 0.3 | pale skin, green eyes, long pale-gold hair falling behind the ears |
| `face_dwarf` | nose ×1.4 wide ×1.25 projection, brow +0.03 H, jaw ×1.25, face ×0.88 short, vault ×1.08 wide | 0.6 / 0.5 / 0.6 | ruddy skin, brown eyes, copper hair, spade beard and moustache |
| `face_goblin` | vault ×1.16 wide ×1.12 tall, nose ×2.6 projection + hook, chin −0.03 H, jaw ×0.82, mouth ×1.35, ears ×1.7 swung out 40°, head ×0.84 | 0.3 / −0.3 / 1 | yellow-green skin, slit amber eyes, lips parted on small teeth |

## Measured spec
- Eye spacing: base IPD 61.6 mm × race spacing × head scale (QA `measures`, ±2 %).
- Overall size: as built (L × W × H in `face_demo.ts`), a design spec of an invented character.

## Parts and LODs
`skin` (head, neck, shoulders; chest and arm cuts capped), `eye_l` / `eye_r` (code eyeballs from
`recipes/_lib/bust/eye.ts`, cornea finish), `hair`, `teeth` (only where the lips part), `tusk_l` /
`tusk_r` (orc), `plinth`. LOD0 = one Catmull–Clark level, LOD1 = the base topology, LOD2 = a 1.4 cm
distance-field re-mesh with sockets and mouth filled.

## References
Anatomy and proportions: `docs/research/head-analysis.md` (measured scan ratios),
`docs/research/stylised-creatures.md` (race conventions), the owner's sculpting notes (block-out →
planes → features; raking light to judge forms).
