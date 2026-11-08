# Face base — one CC0 anatomical head, warped by landmarks into every race

**The face busts start from a real base head with good topology and stylise it in code with a
landmark-driven thin-plate-spline warp.** No blob union, so no seams; the base's edge loops round
the eyes and mouth survive every warp. Code: `src/primitives/warp*.ts` (the warp),
`recipes/_lib/face/` (base, landmarks, presets, bust), `recipes/face_demo/` (five busts).

## Why
The SDF busts (`recipes/_lib/bust/`) union dozens of primitives; faces read lumpy and gaunt, and
every junction is a potential seam QA has to excuse. A sculptor starts from a clean base mesh and
moves big forms first (Grab brush), then adds detail on subdivision levels — `warpTPS` is the Grab
brush driven by numbers, Catmull–Clark is the multires level.

## Licence (verified 2026-11-07)
| Candidate | Licence | Verdict |
|---|---|---|
| **MakeHuman hm08 base mesh** (`makehuman/data/3dobjs/base.obj`) | **CC0 1.0** — file header: "This asset was explicitly released as CC0 in september 2020"; repo `LICENSE.md` §C: "The base mesh and proxies … Targets and modifiers … These assets have been released under CC0 1.0 Universal"; §D: exports "there is no limitation on what you can do with this combined output" | **used** |
| MPFB2 (Blender add-on) assets | `LICENSE.ASSETS.md` = CC0 1.0 (code is GPL) | same mesh family; not needed |
| MakeHuman *code* | AGPL 3 | **not used** — only mesh data is taken |
| FLAME, Basel Face Model, MetaHuman, ripped game heads | non-commercial / restrictive EULAs | **never** |
| Lee Perry-Smith scan | CC BY 3.0 | analysis only (`head-analysis.md`), not committed |

Pinned: <https://github.com/makehumancommunity/makehuman/blob/3c701a8e52f09e69922e8b598d23be2d7dfc49e3/makehuman/data/3dobjs/base.obj>,
sha256 `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c` (1.75 MB OBJ, 19,158 v).
Committed: only the `body` group's quads above the chest (5,709 vertices, 5,654 quads; head, neck,
shoulders, arm stubs), metres / Z up / +X front, uint16-quantised (≈ 9 µm), base64 in
`recipes/_lib/face/base/hm08-bust.ts` (98 kB) with `base/LICENSE.md`. Regenerate:
`bun recipes/_lib/face/base/extract.ts [base.obj]` (fetches the pinned URL and checks the hash).
Credit (courtesy, not required by CC0): Data Collection AB, Joel Palmius, Jonas Hauquier.

## The base, measured
H (menton 0.6155 → crown 0.8491) = **0.2336 m**. Ratios of H from the menton, compared with the
Lee Perry-Smith scan anchor (`head-analysis.md`):

| Landmark | hm08 | LPS scan |
|---|---|---|
| eye centre | 0.483 | 0.540 |
| glabella | 0.603 | 0.625 |
| nose tip | 0.323 | 0.392 |
| subnasale | 0.264 | 0.339 |
| mouth (stomion) | 0.20 | 0.248 |
| IPD (61.6 mm) | 0.264 | 0.265 |

hm08's lower face is shorter against its vault than the scan's (the scan's crown is hair-free but
its menton sits on a fuller chin); the eye line at 0.48 H is the classic "eyes at half the head".
The lips are slightly parted on the base; `Character.mouth = 0` closes them through three pairs of
lip-margin landmarks. The mouth has an inner cavity and the eye sockets are closed pockets, so the cut bust is
a closed mesh after the chest and arm caps.

## Landmarks
82 points (`recipes/_lib/face/landmarks.ts`): 18 on the midline (crown, forehead, glabella,
nasion, rhinion, pronasale, subnasale, labrale sup/inf, stomion sup/inf, pogonion, menton,
occiput, vertex-back, nape, throat, jugular) and 32 per side (eye centre, endo/exocanthion, upper/
lower lid, brow, outer brow, orbitale, alare, cheilion, four lip-margin points, cheek, zygion,
frontotemporale, euryon, parietal, gonion, jawline, mastoid, ear top/out/back, tragion, lobe, neck,
trapezius, acromion, chest, back). Placed once by reading the base's midline profile and
side/front depth plots (scratch `tmp/face/plot.ts`), then snapped to base vertices — a test keeps
every surface landmark within 0.5 mm of a vertex.

## The warp
`tpsWarp(from, to, { stiffness })` (src/primitives/warp-solve.ts): 3D thin-plate spline with the
biharmonic kernel U(r) = r plus an affine part; landmarks are centred and scaled to unit RMS radius
before the (n+4)² float64 solve (Gaussian elimination, partial pivoting); a singular system
(coplanar / duplicated landmarks) is `T3D_WARP_INVALID`. `warpTPS(mesh, …)` moves vertices and turns
normals by cofactor(J) (∝ J^-T), so shading stays right without re-smoothing. Stiffness 0
interpolates landmarks exactly; > 0 relaxes them.

Ears get their own deformer (`ears.ts`): a soft ear mask (1 on the auricle, 0 across its root)
weights a swing out about the root axis, a stretch along lobe → top, and a pull of the helix top
into a tip — a global spline cannot draw a point out of the helix without dragging the scalp.

## Race presets (ratios against the human base; original stylisations)
| Knob | Human | Orc | Elf | Dwarf | Goblin |
|---|---|---|---|---|---|
| head scale | 1 | 1.12 | 1 | 1.04 | 0.84 |
| cranium w / h / d | 1 / 1 / 1 | 1.05 / 0.84 / 0.95 | 0.95 / 1.03 / 1.02 | 1.08 / 0.94 / 1.03 | 1.16 / 1.12 / 1.1 |
| brow forward / height (ΔH) | 0 / 0 | +0.07 / −0.022 | −0.004 / +0.006 | +0.03 / −0.01 | +0.012 / 0 |
| eye spacing, tilt (ΔH), opening | 1, 0, 1 | 1.06, −0.014, 0.78 | 1.04, +0.02, 0.95 | 1.02, −0.006, 0.88 | 1.14, +0.008, 1.08 |
| nose width / projection / length | 1 / 1 / 1 | 1.8 / 0.72 / 0.9 | 0.85 / 1.08 / 1.04 | 1.4 / 1.25 / 1 | 1.05 / 2.6 / 1.3 (+hook 0.05) |
| zygoma width | 1 | 1.16 | 1.04 (+0.02 H high) | 1.1 | 1.06 |
| jaw (bigonial) width / drop | 1 / 0 | **1.4** / 0.07 | **0.85** / 0.02 | 1.25 / −0.01 | 0.82 / −0.01 |
| chin forward (ΔH) / width | 0 / 1 | +0.04 / 1.35 | +0.012 / 0.8 | +0.01 / 1.2 | −0.03 / 0.7 |
| mouth width, underbite | 1, 0 | 1.3, +0.04 | 0.92, 0 | 1.05, 0 | 1.35, 0 |
| face length (nasion → menton) | 1 | 1.06 | 1.08 | 0.88 | 0.95 |
| ears: length, tip (back, out, up ΔH), swing | 1, 0, 0° | 0.95, (0.04, 0.03, 0.07), 12° | 1.15, (0.16, 0.05, 0.2), 6° | 1.05, 0, 4° | 1.7, (0.12, 0.22, 0.1), 40° |
| neck / traps / shoulders | 1 / 0 / 1 | 1.5 / +0.14 / 1.12 | 0.9 / −0.02 / 0.95 | 1.35 / +0.07 / 1.12 | 0.82 / −0.02 / 0.9 |

Per character: `age` 0–1 (lids, brow tail and jowls sag, nose and lobes lengthen, lips thin),
`weight` −1–1 (cheek and jaw fat, neck), `asym` 0–1 (seeded per-landmark offsets ≤ 1.2 % H; lip
margins and body anchors stay put), `mouth` (0 closed … 1 parted). All validated
(`T3D_RECIPE_INVALID` outside 0.2–5 for ratios).

## Assembly and LODs
LOD0 = one Catmull–Clark level over the warped base (≈ 22k quads), LOD1 = the warped base itself
(base topology), LOD2 = the cut skin turned into a distance field (`mesh-field.ts`) and re-meshed
at ≈ 1.4 cm with eye sockets (to 75 % of the ball) and mouth filled first, cut flat at the chest — LOD-gated, like the SDF busts' coarse cell.
Chest and arm cuts are plane clips with flat caps; eyes are the bust library's code eyeballs
(`recipes/_lib/bust/eye.ts`) at the warped eye centre sized by the warp's local Jacobian; teeth and
orc tusks are sweeps placed from warped landmarks; hair and beard are sculpted against the warped
skin's distance field along lines cast onto the skin.

## Status and gaps
- Hair is still SDF locks over a mass: better than a cap, not yet hair cards or strand groups.
- No expression shapes yet: the base's topology would carry morph targets (planned).
- The base is gender-neutral; a masculine / feminine axis (MakeHuman's targets are CC0 too) is the
  obvious next preset dimension.
