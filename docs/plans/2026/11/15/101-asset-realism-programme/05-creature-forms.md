# 05 — Creature forms: muscle/bone trunk, neck into skull, bones as parts (kinds, tier 3)

Rule: a creature is built from bones and muscles, each with tight blends, never from three blobs.

## Files
| Path | State | Why |
|---|---|---|
| `src/kinds/creature-quadruped.ts` | changed | trunk `:62`: ribcage superellipsoid (exponent ≈ 2.5, deep/narrow), scapula–humerus wedge, loin tuck, pelvis block |
| `src/kinds/creature-muscles.ts` + `.test.ts` | new | 15–25 fibre-aligned tapered ellipsoids/roundCones per quadruped: triceps, latissimus, brachiocephalicus, pectorals, gluteals, biceps femoris, semitendinosus; radii × allometric `r` |
| `src/kinds/creature-body.ts` | changed | blend `k` `:21` 1.6 → per-edit 0.15–0.3 × radius; cubic kernel (04); crease strokes for muscle separations, flank fold |
| `src/kinds/creature-head.ts` | changed | neck skin with elliptical section ending inside the skull behind the jaw angle; masseter, occiput, zygomatic masses bridging |
| `src/kinds/creature-bones.ts` | changed | export the skeleton as `Skeleton` (01) |
| `src/kinds/creature.ts` | changed | `ctx.bone` for spine, neck, head, jaw, tail chain, limb segments; detail regions (04) on head + paws; jaw as its own part with pivot |
| `src/kinds/creature-biology.ts` | changed | chest depth/width ≥ 1.25 (canids), neck/skull section continuity |
| `src/kinds/creature-quadruped.test.ts`, `creature.test.ts`, `creature-family.test.ts` | changed | new rules |

## Depends on
01, 04.

## Change
- `spec.build.muscle` (0–1, default per family) scales masses; `spec.coat.length` for later fur (07).
- LOD: muscles LOD0 + LOD1 (merged groups), LOD2 trunk only. Budget `[150000,40000,4000]` unchanged; detail regions move triangles to head/paws.
- Jaw part enables mouth-open clips (09/10).

## Tests
Failure first: a three-blob trunk fails the chest ratio check; neck/skull gap probe finds no crease; bones list contains `spine_*`, `neck_*`, `head`, `jaw`, `tail_*`, `fore_l_*`, `hind_l_*` (mirrored `_r`).

## Checks
`bun test src/kinds/creature*.test.ts` · `bun run t3d build recipes/wolf/wolf.ts --out out` QA PASS · `bun run t3d shot` + `hero` → READ PNGs · `t3d critique` predicted ≥ 7.5 (wolf) at wave end

## Docs
`docs/playbooks/` creature playbook muscle list; `.claude/skills/creature-artist/SKILL.md` stage names.

## Done when
Wolf hero reads lean and muscular (no barrel, head grows from the neck); calibrated silhouette + proportions ≥ 8.5.
