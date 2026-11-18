---
name: rigger-animator
description: Rigging and animation basics for ts23d — where pivots and joints go (anatomical and mechanical), hinge lines, range of motion, deformation zones, clearances through the full motion, baked spin/slide/sway clips, sockets and emitters for engines. Use when an asset has moving parts (doors, wheels, turrets, rotors, arms, jaws, lids, pistons), when placing ctx.group pivots or ctx.joint, when clashes fail, or when skinning a character/creature (bones, weights, morphs, clips, hitboxes).
---

# Rigger / animator (basics)

Use with [02-dsl: ctx API, motion, joints](../../../docs/idea/02-dsl.md#the-ctx-api),
[06-qa clashes](../../../docs/idea/06-qa.md), the playbooks' **Motion** tables and
[16-art-as-text](../../../docs/idea/16-art-as-text.md). ts23d bakes all motion to keys (ADR 013): rigid parts move on named pivots (the
`run` clip); skinned bodies (creatures) carry bones, weights, morphs and named clips — gaits, IK and
springs solved at build time, never in the engine.

## When
Any part that moves or that an engine will move: wheels, tracks, doors, hatches, turrets, guns,
rotors, propellers, pistons, cranes, jaws, wings, tails, lids, drawers.

## Workflow
| # | Rigging stage | ts23d | Exit |
|---|---|---|---|
| 1 | Motion list: what moves, about which axis, how far (from the playbook Motion table + real specs) | dossier table: part, motion, axis, limits | every moving part listed |
| 2 | Pivot placement at the real hinge / axle / bearing, never the mesh centre | `ctx.group('door_l', { at: hingeLine })`, children authored relative to it; `parent` | pivot on the hinge line in `blueprint.png` |
| 3 | Hierarchy: parent chains match the mechanism (hull → turret → gun mantlet → gun) | `parent` option; one `yaw` or `motion` per node, not both (`T3D_RECIPE_INVALID`) | engine can drive each node alone |
| 4 | Motion | `motion: { kind: 'spin', axis, rps }` (wheels about local Y), `{ kind: 'slide', offset, hz }` (drawers, gates), `{ kind: 'orbit', axis, arm, hz }` (coupling rods), `{ kind: 'crank', axis, centre, pin, line, hz }` / `'piston'` (connecting rod / crosshead or piston on the exact slider-crank; check with `assertFollows`), `{ kind: 'sway', axis, degrees, hz }` (doors, turrets, tails), `tread(beltLine, y, pitch)` (track belts: loop in `extras.ts23d.tread`) | baked `run` clip plays |
| 5 | Clearance through the full range | `clashes` gate (swept volume), `clearOf: ['bearing']` only for real interlocks, `checks: [clear(a, b, gap)]` | QA PASS at every LOD |
| 6 | Joints between separately built parts | `ctx.joint(name, { from, to, at, axis, kind: 'flush' \| 'socket' \| 'grip' })` | `joints` gate PASS |
| 7 | Skeleton + skin (characters/creatures) | `ctx.bone(name, { parent, head, tail, limit })` parent first; weights `skinWeights(mesh, bones, { blend, only, offset })` with each bone's flesh radii (`creature()` does all of it, kinds/creature-rig.ts), cards/claws `skinPieces`, imported meshes `heatWeights`; morphs `fieldMorph` / `hingeMorph`; clips `{ name, seconds, loop, tracks: [{ bone, path, times, values }] }` (keys relative to rest) | QA `skin` PASS; validator 0 errors; clips play in the gallery |
| 8 | Engine hooks | `ctx.socket` (`seat`, `mount`, `camera`, `attach`, `interact`, `light`), `ctx.emitter` (`smoke`, `dust` with `when: 'moving'`, `muzzle` with `when: 'event'`) | named nodes in manifest |
| 9 | Review | `t3d build` (animations on by default), viewer in the gallery, `t3d critique` | moves like the real thing |

## Model-built bodies: rig and weights from a model (As of 2026-11)
A model-first creature or humanoid ([creature-artist](../creature-artist/SKILL.md),
[character-artist](../character-artist/SKILL.md)) is ONE skinned textured part per LOD; you place bones and fix
weights with Blender steps, not `ctx.bone` + `skinWeights`.
| Need | Do | Check |
|---|---|---|
| Quadruped skeleton | our sourced plan fitted INTO the mesh (`fitSkeleton`: legs on each leg's centre line, spine under the dorsal line); optional learned joints: `modelChain({ rig: 'unirig' })`, mapped by topology | QA `model`: every joint inside the mesh (`T3D_MODEL_SKELETON`), mesh hugs the bones (`T3D_MODEL_FIT`) |
| Humanoid skeleton | the model's own (hosted rig: Meshy `rig` with `height`); `bind: { from: 'source' }` keeps its weights and clips | no vertex unweighted, <= 4 influences (Blender report) |
| Gait clips (quadruped) | the creature clips (`idle`, `look`, `walk`, `trot`, `gallop`) baked on the fitted bones; `bite` and `blink` are dropped (fused head, no jaw or lids); `drop: ['gallop']` when the skin cannot take it | QA `deform` poses the skin at the limits; QA `gait` seam, slide, sink |
| Humanoid clips | library clips by name (`Idle`, `Casual Walk`, `Run 2`) renamed `idle`, `walk`, `jog`; `importModel` closes a cycle one frame short and warns; `lift` raises a root that sinks | `gait`: skin of a foot <= 3 mm under the floor in in-place clips |
| Turned head, uneven stance | `repose` (after `bind`): straighten and symmetrize the armature, keep the deformed mesh, same weights; never mirror a turned head | `T3D_MODEL_DOUBLED` finds two muzzles |
| Bad weights | `weights` by mask: `assign` / `scale` / `smooth` one bone (`sphere`, `box`, `z`, `plane`); `joint` moves a bone end BEFORE `bind`; bone heat that weights nothing falls back to a voxel proxy (reported) | `t3d blender review --views weights,poses`, one tile per bone |
```sh
bun run t3d blender review recipes/<name>/<name>.ts --out review --views weights,poses --pose neck:x:-30   # READ
```
Limits: no finger bones (one hand bone), no jaw or blink on a fused head, no cloth or hair sim, a skirt skinned to
the thighs stretches on a high knee. Planned: finger bones, jaw and blink on model heads, AI motion with
commercial-use weights.

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Pivot | node origin the motion rotates/slides about | `ctx.group` `at`; blueprint |
| Hinge line | the axis a door/lid turns about; on the hinge pins, at the panel edge | `hinge` part from `_parts` at the same axis |
| Range of motion (ROM) | min–max angle or stroke from the real spec | `sway.degrees`, `slide.offset` |
| Swept volume | space a moving part occupies over its whole motion | `clashes` (`CLASH_EPS` 1 cm) |
| Running clearance | gap kept between moving and static parts | `clear(a, b, minGap)` |
| Interlock | parts that pass through each other by design (axle in bearing) | `clearOf` |
| Deformation zone | region that bends when skinned; needs volume and resolution (game meshes: 2–3 loops per bending joint) | linear-blend skin keeps ≥ 85 % volume at a 90° bend (skin-weights.test.ts) |
| Influences | bones moving one vertex: ≤ 4, weights sum to 1 (1/255 grid) | QA `skin` |
| Bind pose | joints at rest reproduce the modelled mesh | QA `skin` (≤ 1e-5 m) |
| Own paws | below a paired limb's wrist/hock (`<limb>_l_2` / `_r_2`) no vertex carries both sides' weights (≥ 5 % each): feet that stand close would drag each other. A model's touching paws need the mesh cut (`unweb`, a retopo voxel under the gap ÷ 1.5); weights alone tear a joined web | QA `skin` (`T3D_SKIN_CROSSED`, model-built parts; code-built pending D73) |
| Hitbox | per-bone capsule holding ≥ 95 % of the vertices that bone dominates | `--physics`, manifest `hitboxes` |
| Foot lock | a planted toe stays on one ground point while the root travels | QA `gait`: < 1 mm/frame at 30 fps, root motion applied |
| Duty factor / Froude | share of the stride a foot is down (> 0.5 walk); v = √(Fr·g·hip), stride 2.3·Fr^0.3·hip | `GAITS`, `gaitTiming` (kinds/gait.ts) |
| Half-angle helper | `<joint>_mid` under the joint's parent, keyed at half its rotation, holds the blend band's volume | QA `deform` poses it at half; `withMidTracks` keys it |
| Follow-through | tail / ears / jowls lag their parent on damped springs, baked periodic | `bakeSprings` (seam < 1e-4) |
| Joint fit | sections either side of a connection match | `joints`, `assertJointsFit`, `jointFit` |
| Arc | natural motion follows arcs, not straight lines | sway about a real pivot |

## Quality bar
- [ ] Every moving part is its own named pivot with the engine-contract name (`wheel_*`, `door_*`, `rotor_*`).
- [ ] Pivots sit on real hinges/axles; wheels spin about local Y.
- [ ] Motion limits sourced; `clashes` PASS through the whole range at every LOD.
- [ ] No `clearOf` used to silence a real collision.
- [ ] Sockets and emitters named and parented so they follow their part.
- [ ] Characters: rigid gear separate from flesh; deformation zones listed.

## Common mistakes
- Pivot at the mesh centre: doors swing through their frame.
- `yaw` and `motion` on the same node; put yaw on the parent group.
- Wheels spinning about Z or X; tracks without `trackRun`.
- Silencing `clashes` with `clearOf` instead of fixing clearance.
- Writing engine animation controllers or game logic: out of scope.
- Weighting a skin from bare bone segments: the belly follows the legs. Give each bone its flesh
  radius (a spine on the dorsal top line weighs the trunk below it).
- A skinned mesh under a moving pivot, or a clip named `run` (reserved for part motions): a
  creature's fastest gait is `gallop`.
- Posing a foot in the body frame: it slides. Plan stance toes in the ground frame and solve IK
  per key (`gaitClip`); let QA `gait` prove it at the manifest speed.
- Shortest-arc bend poles taken from the rest pose without turning them with the leg: knees flip.
- Joint limits at full passive ROM on a linear-blend skin: a folded carpus loses half its volume.
  Limit to the range the clips use and add `_mid` helpers; QA `deform` checks every extreme.

## Test it
```ts
import { assertMotionClear, assertPartMotionClear } from '@developerz.ai/ts23d/testing';
it('every moving part clears', () => assertMotionClear(boxcar));
it('door swings clear of the frame', () => assertPartMotionClear(boxcar, 'door_l'));
```

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d build recipes/<name>/<name>.ts --out out --no-animations  # static build to compare
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [hard-surface-artist](../hard-surface-artist/SKILL.md): mechanisms and hinges.
- [character-artist](../character-artist/SKILL.md) / [creature-artist](../creature-artist/SKILL.md): anatomical joints.
- [technical-artist](../technical-artist/SKILL.md): node naming and engine contract.
- [blender-artist](../blender-artist/SKILL.md): weights and binds on generated meshes, in one open Blender.
- [automotive-designer](../automotive-designer/SKILL.md): doors and wheels.
- [product-designer](../product-designer/SKILL.md): lids, triggers, buttons.

## Tool status
Shipped: `ctx.group`, `parent`, `motion` (spin/slide/sway/orbit/crank/piston/tread), `clearOf`, `clashes`, `ctx.joint`,
`ctx.socket`, `ctx.emitter`, baked `run` clip (`--no-animations` to skip), `ctx.bone` skeletons, glTF skins
(≤ 4 influences), sparse morph targets, named `Clip`s, per-bone hitbox capsules, sockets on bones
(`data: { bone }`); creatures ship skinned with `idle`, `look`, `bite`, `walk`, `trot`, `gallop`
(root motion, planted feet), baked tail/ear springs, ear bones, joint limits and `_mid` helpers, a
`blink` morph; QA `gait` + `deform`; review pose strip (`poseStrip` + qa `poseFrames`); head
`faceMorphs` (`blink`, `talk`, `breathe`) + `headClips`.
Model-built bodies (kinds `modelChain`, `riggedChain`, ops `bind` / `repose` / `weights` / `joint`) are shipped; see above. Planned: MakeHuman expression targets for heads, `pose`/`warp` for sculpts, steering + suspension travel clips.
Neutral positioning: the free code-based option, no claims against other tools.
