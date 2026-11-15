# 10 — Procedural gait, baked springs, deformation QA (kinds + qa)

Rule: a creature walks with planted feet and keeps its volume at every joint limit; all motion is baked keys.

## Files
| Path | State | Why |
|---|---|---|
| `src/kinds/gait.ts` + `.test.ts` | new | Hildebrand phase tables (walk 0/.5/.25/.75, trot, canter, gallop); stance foot locked, swing on a cycloid; analytic two-bone IK (three-bone digitigrade with coupled hock); pelvis bob as inverted pendulum; spine/tail counter-sway phase-lagged; stride from Froude number and leg length |
| `src/kinds/springs.ts` + `.test.ts` | new | damped spring per chain bone (tail, ears, jowls) driven by parent acceleration; simulate two loops fixed-step semi-implicit Euler, keep the second (periodic) |
| `src/kinds/creature-clips.ts` + `.test.ts` | new | `idle`, `walk`, `trot`, `run`, `bite` (jaw), `look` clips for `creature()` |
| `src/kinds/head-clips.ts` + `.test.ts` | new | `blink`, `talk`, `breathe` morph clips for heads |
| `src/qa/deform.ts` + `.test.ts` | new | ROM poses from joint limits, CPU linear-blend skinning; per-zone volume (signed tetrahedra), self-intersection (`contact-bvh.ts`), max triangle stretch |
| `src/qa/gait.ts` + `.test.ts` | new | `T3D_GAIT_FOOT_SLIDE` (stance foot < 1 mm/frame at manifest speed), foot penetration z ≥ 0, loop seam |
| `src/render/pose-strip.ts` + `.test.ts` | new | review pack image: ROM poses + gait frames |

## Depends on
01, 05, 09.

## Change
- `defineCreature` gains `clips: ['idle','walk','run']` (default) — wiring in `creature.ts` is a two-line call the coordinator adds after 05 lands (shared file note).
- Helper bones auto-added where `T3D_DEFORM_VOLUME` fires at shoulder/hip (twist + volume bones).

## Tests
Failure first: foot-sliding gait fails; collapsing elbow fails volume; spring loop seam error < 1e-4.

## Checks
`bun test src/kinds/{gait,springs,creature-clips,head-clips}.test.ts src/qa/{deform,gait}.test.ts src/render/pose-strip.test.ts` · wolf build QA PASS, review pack READ

## Docs
rigger-animator skill; `docs/idea/09-kinds.md` creature clips.

## Done when
Wolf walks/trots/runs in the site viewer with planted feet; heads blink and talk.
