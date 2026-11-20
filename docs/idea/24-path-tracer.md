# 24 — The path-traced hero

**What.** `t3d hero --quality path` (library: `pathHero`, `renderPathThreaded`) renders the same
3/4 studio shot as the raster beauty render, but with light that behaves physically: a CPU path
tracer in `src/render/path/`, zero dependencies, no GPU, byte-deterministic.

**Why.** Critiques and the gallery judge `hero.png`. The raster renderer lights each pixel once
(sun + PCF shadow + screen-space ambient): fur cards read as flat painted quads, skin as plastic,
and nothing bounces. An agent cannot fix what the picture misrepresents, so the committed hero
(`bun run shots`) and the critique pack's `hero.png` are path traced; the raster stays for fast
iteration, contact sheets, review close-ups and the calibrated metric vector.

**How (one file per job).**

| Piece | File | Notes |
|---|---|---|
| Ray queries | `bvh.ts`, `bvh-sah.ts` | binned-SAH BVH, own copy (render may not import qa) |
| Samples | `sampler.ts` | 4-D Sobol, hash-based Owen scrambling, seeded per pixel |
| Lights | `sky.ts`, `nee.ts` | procedural studio sky (tabulated CDF) + sun disc, MIS with the BSDF |
| Surfaces | `surf.ts`, `bsdf.ts`, `ggx-table.ts` | glTF BRDF (GGX, Smith, Schlick, clearcoat), tabulated multiple-scatter compensation: white furnace within 1% |
| Textured parts | `../texture-sets.ts`, `../set-shade.ts` | a part's own texture set (ADR 016): albedo × vertex colour, ORM or the set's factors, normal map in the exporter's per-vertex tangent frame (glTF: green up, v down); shared with the raster and the contact sheet |
| Fur / hair | `hair.ts` | diffuse + R / TT / TRT lobes about the strand; cutout cards alpha-tested on the coverage-preserving mips |
| Skin | `sss.ts`, `classes.ts` | Burley normalised diffusion, disk-probe exit points; skin = `skin*` finish, or plain parts of characters/creatures |
| Image | `film.ts`, `denoise.ts` | 32 px tiles merged by index; asset layer + floor shadow-catcher layer; the asset layer variance-guided à-trous denoised (SVGF-style, using the film's per-pixel variance), the shadow layer à-trous |
| Threads | `parallel.ts`, `worker.ts` | shared arrays, atomic tile counter; same bytes on 1 or N threads |

**Textured parts.** A model-built part keeps its own albedo / normal / ORM on every LOD (ADR 016),
and every renderer samples them through the same two files, so `hero.png` and `sheet.png` show the
surface the GLB carries. Each PNG is decoded once per process (content key) into 8-bit mips
(2048² ≈ 22 MB per map; workers share them), sampled bilinearly with clamp addressing, and
released with the last scene that holds it. Classes are unchanged: a textured part of a
`creature` or `character` is skin unless its name says otherwise (`classes.ts`); a textured
`cutout` part is alpha-tested on its albedo's alpha. An undecodable map is `T3D_TEXTURE_INVALID`
naming the part, never a grey render.

**Engines too.** A finish named `skin` / `skin_*` also exports
`KHR_materials_diffuse_transmission` + `KHR_materials_volume` (`src/export/transmission.ts`), so
ears and nostrils glow in engines that support it.

**Budget.** Committed heroes: 960×540, 16 spp + denoise (`HERO_PATH`). Measured on 4 threads:
wolf 6.7 s of tracing, human_head ≈ 6 s, roadster_v10 (900k triangles) 13 s. Raise it only with
a fresh shots-shard timing.

**Not yet.** HDRI environments, emissive (`glow`) parts as lights, sheen / anisotropy /
iridescence lobes (raster only), refraction through thick glass (thin-slab only), a thickness
texture for the transmission export (per-vertex thickness is baked, not yet written to the sheet).
