---
name: rigger-animator
description: Rigging and animation basics for ts23d — where pivots and joints go (anatomical and mechanical), hinge lines, range of motion, deformation zones, clearances through the full motion, baked spin/slide/sway clips, sockets and emitters for engines. Use when an asset has moving parts (doors, wheels, turrets, rotors, arms, jaws, lids, pistons), when placing ctx.group pivots or ctx.joint, when clashes fail, or when preparing a character/creature for later rigging.
---

# Rigger / animator (basics)

Use with [02-dsl: ctx API, motion, joints](../../../docs/idea/02-dsl.md#the-ctx-api),
[06-qa clashes](../../../docs/idea/06-qa.md), the playbooks' **Motion** tables and
[16-art-as-text](../../../docs/idea/16-art-as-text.md). ts23d bakes **rigid** motion today: each
moving thing is a named pivot node the engine can drive, plus a 2 s `run` clip. Skinned meshes and
morph targets are **not shipped**; build characters so they could be rigged later.

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
| 7 | Deformation zones (characters/creatures, for later skinning) | keep extra sculpt resolution and clean volume at shoulders, elbows, hips, knees, neck, jaw; separate rigid gear from flesh | listed in dossier |
| 8 | Engine hooks | `ctx.socket` (`seat`, `mount`, `camera`, `attach`, `interact`, `light`), `ctx.emitter` (`smoke`, `dust` with `when: 'moving'`, `muzzle` with `when: 'event'`) | named nodes in manifest |
| 9 | Review | `t3d build` (animations on by default), viewer in the gallery, `t3d critique` | moves like the real thing |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Pivot | node origin the motion rotates/slides about | `ctx.group` `at`; blueprint |
| Hinge line | the axis a door/lid turns about; on the hinge pins, at the panel edge | `hinge` part from `_parts` at the same axis |
| Range of motion (ROM) | min–max angle or stroke from the real spec | `sway.degrees`, `slide.offset` |
| Swept volume | space a moving part occupies over its whole motion | `clashes` (`CLASH_EPS` 1 cm) |
| Running clearance | gap kept between moving and static parts | `clear(a, b, minGap)` |
| Interlock | parts that pass through each other by design (axle in bearing) | `clearOf` |
| Deformation zone | region that bends when skinned; needs volume and resolution (game meshes: 2–3 loops per bending joint) | dossier; skins **planned** |
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
- [automotive-designer](../automotive-designer/SKILL.md): doors and wheels.
- [product-designer](../product-designer/SKILL.md): lids, triggers, buttons.

## Tool status
Shipped: `ctx.group`, `parent`, `motion` (spin/slide/sway/orbit/crank/piston/tread), `clearOf`, `clashes`, `ctx.joint`,
`ctx.socket`, `ctx.emitter`, baked `run` clip (`--no-animations` to skip).
Planned: `motion: 'orbit'` (side rods, pedals), skins with ≤ 4 influences, morph targets (faces,
melting), `pose`/`warp` for sculpts, steering + suspension travel clips.
Neutral positioning: the free code-based option, no claims against other tools.
