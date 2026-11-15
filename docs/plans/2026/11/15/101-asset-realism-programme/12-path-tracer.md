# 12 — Deterministic CPU path tracer (render, tier 3)

Rule: critique and gallery heroes are judged under physically based light, byte-deterministic, no GPU.

## Files
| Path | State | Why |
|---|---|---|
| `src/render/path/bvh.ts` + `.test.ts` | new | SAH BVH over triangles, own copy: render cannot import qa (same tier); mirror `qa/contact-bvh.ts` node layout |
| `src/render/path/sampler.ts` + `.test.ts` | new | Sobol + Owen scramble seeded per pixel; no `Math.random` |
| `src/render/path/integrator.ts` + `.test.ts` | new | unidirectional PT, next-event estimation, Russian roulette with fixed seed |
| `src/render/path/sky.ts` + `.test.ts` | new | procedural sky IBL + sun, importance sampled |
| `src/render/path/sss.ts` + `.test.ts` | new | Burley normalised diffusion (random-walk-free, dipole profile) for `translucent` / skin zones |
| `src/render/path/hair.ts` + `.test.ts` | new | Kajiya-Kay + Marschner-lite lobes for cutout strand cards |
| `src/render/path/denoise.ts` + `.test.ts` | new | à-trous wavelet guided by albedo + normal |
| `src/render/path/path-hero.ts` + `.test.ts` | new | `pathHero(asset, o)` entry |
| `src/cli/render-cmds.ts` | changed | `t3d hero --quality path` (`--spp`, default 64) |
| `scripts/shots.ts` | changed | critique renders use `--quality path` at 960×540 |

## Depends on
01. Uses `brdf.ts` (unchanged).

## Change
Every file < 200 LOC. Threads: deterministic tile order, results merged by tile index.

## Tests
Failure first: white furnace test (energy within 1%); two runs byte-identical; golden image hash for a 64×64 scene.

## Checks
`bun test src/render/path` · `--only determinism,filesize` · CI time: shots shard stays < 5 min (measure, cap spp/size if not)

## Docs
`docs/idea/` presentation note; presentation-artist skill.

## Done when
`hero.png` for flagships is path traced; fur and skin read correctly under it.
