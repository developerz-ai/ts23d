# Head analysis — measured proportions for the bust heads

**The human, elf, goblin and orc busts take their landmarks from ratios measured on a real head
scan, and every stylised race states its exaggerations against that anchor.** Reference meshes were
downloaded for analysis only into `tmp/heads-ref/` (gitignored, never committed); the scratch
reader and measurements are scripts there, not shipped code.

## Sources and licences
| Mesh | Source | Licence | Used |
|---|---|---|---|
| Lee Perry-Smith head scan (`LeePerrySmith.glb`, 17,684 triangles) | three.js examples, [examples/models/gltf/LeePerrySmith](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/LeePerrySmith); scan by Infinite Realities / triplegangers.com | CC BY 3.0 (`LeePerrySmith_License.txt`: "Infinite, 3D Head Scan by Lee Perry-Smith is licensed under a Creative Commons Attribution 3.0 Unported License") | all ratios below, silhouettes, density |
| Face Cap head (`facecap.glb`) | three.js examples (`webgl_morphtargets_face`), model by [Face Cap / Bannaflak](https://www.bannaflak.com/face-cap) | no licence file in the repo — **analysis only**, nothing derived is committed | cross-check of the eye line and IPD only |
| A CC0 stylised head (Quaternius, Kenney, Poly Haven) | searched, none found as a head-only glTF | — | not used |

`facecap.glb` uses `EXT_meshopt_compression` + `KHR_mesh_quantization`; it was decoded with
`gltf-transform copy` (scratch only). Its mesh is a face mask (open behind, eyes as separate meshes),
so only the eye line and IPD were cross-checked.

## Method
1. Read the GLB (scratch reader `tmp/heads-ref/glb.ts`: JSON + BIN chunks, accessors incl. normalised
   ints, node TRS), convert glTF Y-up/+Z-front to ts23d Z-up/+X-front.
2. Rasterise the triangles into a front depth map (front-most x per (y, z) cell) and print the
   midline profile, lanes through the eyes, the silhouette width and the back-most x per height
   (`profile.ts`, `rows.ts`). Landmarks were READ off that table (the profile walker that tried to
   find them automatically was unreliable on scan noise, so the numbers below are hand-picked from
   the printed profile, each named by the profile feature it is).
3. Ratios are of **H = menton → vertex** (chin bottom to crown): heights from the menton,
   widths full, projections forward of the glabella.

## Human anchor (Lee Perry-Smith; menton z = −0.75, vertex 3.97, H = 4.72 scan units)
| Landmark | Profile evidence | Ratio of H |
|---|---|---|
| eye centre (pupil line) | eyeball bulge max at z ≈ 1.8, lanes y = −0.75 / +0.50 about the nose ridge | **0.540** |
| nasion | profile minimum 2.067 at z 1.84 | 0.549 |
| glabella | profile max 2.205 at z 2.2 | **0.625** |
| nose tip | profile max 2.546 at z 1.10 | **0.392** |
| subnasale | profile min 2.278 at z 0.85 | **0.339** |
| mouth (stomion) | profile min at z ≈ 0.42 | **0.248** |
| pogonion (chin front) | profile max 2.268 at z −0.15 | **0.127** |
| ear top / bottom | silhouette width jumps 3.22 → 3.53 at z 1.87; drops at 0.63 | **0.555 / 0.292** |
| interpupillary distance | 1.25 | **0.265** |
| cranium width (no ears) / with ears | 3.224 / 3.658 | **0.683** / 0.775 |
| bigonial (jaw) width | silhouette 2.12 at z 0 | **0.449** |
| skull depth glabella → back | 2.205 − (−1.987) | **0.888** |
| nose tip past nasion / past subnasale | 0.479 / 0.268 | 0.101 / 0.057 |
| chin vs upper lip (x) | −0.063 | −0.013 (chin just behind the lips) |

Cross-check (Face Cap): eye line ≈ 0.50–0.54 H depending on where its cut-off chin is assumed, IPD
≈ 0.30 H — consistent within that uncertainty; not used for numbers.

**Triangle density** (scan, triangles per H²): face 6,016 · ears 6,166 · cranium 1,663 · neck 494.
The scan concentrates ~3.6× the cranium's density on the face and ears. Our SDF busts mesh at one
uniform cell (≈ 1,600–4,300 per H² everywhere), so detail budget is spent evenly; the busts claw some
back by splitting into a fine-celled `head` and a coarser `bust` part at the neck seam, but true
adaptive meshing (idea doc 10, item 9) is what would match the scan's distribution.

## Stylised races: declared exaggerations against the anchor
| Ratio / knob | Human (anchor) | Elf | Goblin | Orc |
|---|---|---|---|---|
| head H (m) | 0.23 | 0.23 | 0.19 (×0.83) | 0.30 (×1.3) |
| eye line | 0.540 | 0.550 | 0.530 | 0.557 |
| IPD | 0.265 | 0.278 (×1.05) | 0.331 (×1.25) | 0.310 (×1.17) |
| eyeball radius / H | 0.052 | 0.056 | 0.075 (×1.45) | 0.053 |
| cranium width | 0.683 | 0.642 (×0.94) | 0.779 (×1.14) | 0.60 (×0.88) |
| bigonial (jaw) | 0.449 | 0.382 (×0.85) | 0.359 (×0.8) | ≈ 0.79 (×1.75) |
| nose projection | 0.072 | 0.068 | 0.202 (×2.8) + hook 0.035 | 0.127 (×1.25 past nasion; broad, flat) |
| mouth half-width | 0.10 | 0.09 | 0.17 (grin) | ≈ 0.19 (muzzle) |
| chin projection | +0.013 | +0.03 (pointed) | −0.02 (receding) | +0.027, lower lip +0.063 (underbite) |
| ear | human, 0.263 H | human structure, helix drawn to a point, ×2.3 long, swept back | ×2.1 long, held out sideways, notched | pointed, swept back (hand-built) |
| lid cover (upper / lower iris share) | 0.25 / 0.12 | 0.24 / 0.10, tilt +10° (almond) | 0.36 / 0.14, tilt −7° (heavy) | 0.32 / 0.14, scowl 12° |

Every number above is the code: `recipes/_lib/bust/head.ts` (`HUMAN`), `recipes/<race>_head/spec.ts`
and `recipes/orc_head/landmarks.ts`.

## Silhouettes vs the scan
Front + side silhouette IoU of each bust's head against the scan, both normalised to H and aligned
at the glabella (`tmp/heads-ref/iou.ts`; LOD1 meshes; the window includes the neck, so a hunched
orc or a bust's collar lowers the score — the number is a sanity check, not a target):

| Bust | Front IoU | Side IoU | Why it differs |
|---|---|---|---|
| human_head | **0.843** | **0.830** | the anchor itself; hair volume and the collar |
| elf_head | 0.762 | 0.879 | long swept ears, hair falling behind them |
| goblin_head | 0.675 | 0.862 | ears ×2.1 held out sideways, bigger vault, thin neck |
| orc_head | 0.535 | 0.636 | head sunk between trapezius that rise to the ears, jaw ×1.75 |

The human should score highest; the stylised races deliberately less.
