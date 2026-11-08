# Playbooks — what to know before modelling a class of real thing

**A playbook is the research a good asset artist does before opening a modeller, written once per
class so a coding agent does not start from zero.** Asked for "a forklift", the agent opens
[`vehicles/forklift.md`](vehicles/forklift.md) and learns what to look up, which dimensions matter,
the part tree an engine expects, what moves and how far, the details that make it read as real,
which material strips to use, how to split detail across LODs, what QA to declare and the mistakes
that make it look like a toy.

A playbook does not replace the dossier. It tells you **what to research**; the dossier
(`recipes/<name>/README.md`, template in [`recipes/README.md`](../../recipes/README.md)) records
**what you found** for the one object you are building, with every number sourced. The ranges here
are sanity bounds, not specs: never copy a playbook range into `real.measures` — find the number
for your variant and cite it.

## How to use one in the recipe loop

| Recipe-loop step ([author-recipe skill](../../.claude/skills/author-recipe/SKILL.md)) | Playbook section |
|---|---|
| 1 research → dossier | **Research**: which spec sheets and standards to fetch, which photo views to collect, typical ranges to sanity-check your numbers against |
| 2 masses | **Part tree**: names and pivots, so `ctx.part` / `ctx.group` match what engines expect; **QA**: the `real`, `measures` and `checks` to declare before the first build |
| 3 look | **Signature details** + **Common mistakes**: the checklist to read the contact sheet against |
| 4 detail | **LOD policy** + **Reuse**: what goes in LOD0 / LOD1 / LOD2, which `recipes/_parts` and kind builders to call |
| 5 grime | **Materials**: strips and where wear and dirt collect |
| 7 iterate | **Common mistakes**, again, harshly |

Conventions every playbook assumes: metres, **Z up, +X front**, left = +Y. Wheels and axles spin
about local Y. Named parts are the engine contract (`axle_*`, `wheel_*`, `door_*`, `rotor_*`).
Motion is `spin` / `slide` / `sway` ([02-dsl](../idea/02-dsl.md#the-ctx-api)); a hinged part gets a
pivot `ctx.group` at its hinge line, never at its centre.

## Index

### Vehicles
| Playbook | Covers |
|---|---|
| [Passenger car](vehicles/passenger-car.md) | sedan, hatchback, estate |
| [SUV and pickup](vehicles/suv-pickup.md) | crossover, body-on-frame SUV, pickup |
| [Sports car](vehicles/sports-car.md) | front- and mid-engined coupés, roadsters |
| [Truck](vehicles/truck.md) | semi tractor, box/curtain/flatbed trailer, rigid truck |
| [Bus](vehicles/bus.md) | city bus, coach, school bus |
| [Forklift](vehicles/forklift.md) | counterbalance truck: mast, carriage, forks |
| [Farm tractor](vehicles/farm-tractor.md) | row-crop and utility tractors, 3-point hitch |
| [Excavator](vehicles/excavator.md) | crawler excavator, boom/arm/bucket |
| [Bicycle](vehicles/bicycle.md) | road, city, mountain bikes |
| [Motorcycle](vehicles/motorcycle.md) | standard, sport, cruiser, scooter |
| [Rail](vehicles/rail.md) | steam/diesel locomotives, wagons, coaches |
| [Armoured vehicles](vehicles/afv.md) | tanks, tracked and wheeled AFVs (historic) |
| [Aircraft](vehicles/aircraft.md) | light prop plane, airliner basics |
| [Helicopter](vehicles/helicopter.md) | light and medium single-rotor helicopters |
| [Boat](vehicles/boat.md) | rowing/motor boat, small ship basics |

### Buildings and infrastructure
| Playbook | Covers |
|---|---|
| [House](buildings/house.md) | detached / terraced houses, roofs, openings |
| [Apartment block](buildings/apartment-block.md) | 3–15 storey residential, balconies |
| [Shop front](buildings/shop-front.md) | ground-floor retail, signage, awnings |
| [Station and platform](buildings/station-platform.md) | halts, platforms, canopies |
| [Bridge](buildings/bridge.md) | beam, truss, arch |
| [Street furniture](buildings/street-furniture.md) | lamp post, bench, bin, sign, traffic light, hydrant, bollard |
| [Fences and walls](buildings/fences-walls.md) | timber, metal, masonry, dry-stone |
| [Road, kerb and markings](buildings/road-kerb.md) | carriageway, kerbs, footways, markings |

### Interiors and props
| Playbook | Covers |
|---|---|
| [Furniture](props/furniture.md) | chair, table, sofa, bed, shelf, cabinet |
| [Kitchen appliances](props/kitchen-appliances.md) | fridge, cooker, dishwasher, sink, microwave |
| [Office and electronics](props/electronics.md) | PC, monitor, laptop, phone, keyboard |
| [Tools](props/tools.md) | hand tools, power tools, workbench |
| [Crates, barrels, pallets](props/crates-barrels-pallets.md) | EUR pallet, crates, casks, drums |
| [Freight containers](props/containers.md) | ISO 668 series 1 containers |
| [Historic and fantasy weapons](props/weapons-historic.md) | swords, axes, bows, shields, museum firearms |
| [Musical instruments](props/instruments.md) | guitar, violin family, piano, drums, brass |

### Nature
| Playbook | Covers |
|---|---|
| [Trees](nature/trees.md) | broadleaf, conifer, palm, by species |
| [Rocks and boulders](nature/rocks.md) | boulders, outcrops, scree |
| [Terrain](nature/terrain.md) | heightfields, dioramas, erosion |
| [Plants and flowers](nature/plants.md) | shrubs, grass, flowers, crops |
| [Water features](nature/water.md) | ponds, rivers, fountains, troughs |

### Characters and creatures
| Playbook | Covers |
|---|---|
| [Characters and creatures](characters/characters-creatures.md) | humanoid busts and bodies, animals, fantasy creatures (M4) |

## Rules that hold for every class

1. **Scale comes from one trusted number.** Pick the dimension the world standardises (wheel
   diameter, track gauge, door height, pallet size, fork length) and measure everything else from
   the photo against it. Declare that number as a `measures` entry.
2. **Wheels, doors, steps and handles are human- or standard-scaled; bodies are not.** A model
   whose door handle sits at 0.6 m or whose tyre is 0.45 m reads as a toy at any size.
3. **Silhouette first, then the 5–10 signature details, then everything else.** If the LOD2
   silhouette is wrong, no LOD0 detail rescues it.
4. **Break up flat colour.** Real objects are 3–6 materials (paint, rubber, glass, bare metal,
   plastic trim) plus wear. One vertex colour on one strip is always a failure, even at QA PASS.
5. **Every gap is either closed or declared.** Panel shut-lines are 3–6 mm grooves, not slits you
   can see through; real openings go in `gaps: [{ parts, why }]`.
6. **Moving parts pivot at the real hinge and clear everything** (`clashes`); state intent with
   `checks: [clear(…), touches(…), symmetric('_l', '_r', 'y')]`.
7. **Original design in the class.** Learn proportions and engineering from real products and
   standards; never copy a brand's logo, badge, grille shape or trade dress. Named historic or
   public-domain subjects (a 1943 tank, an 1868 locomotive) are fine.

## Playbook template

Copy this for a new class. Keep it 80–200 lines; dense tables over prose; every number either
sourced (standard, regulation, manufacturer sheet, museum) or labelled *typical, verify*.

```md
# <Class> playbook

One paragraph: what the class is, the variants it covers, the one number to scale from.

## Research
What to fetch (standards, spec-sheet fields, photo views) and where.
| Dimension | Typical range | Notes / source |

## Part tree
Names and pivots, matching `ctx.part` / `ctx.group` and the engine contract.

## Motion
| Part | Motion | Axis | Limits |

## Signature details
5–10 things that make it read as real.

## Materials
Strip ids from the material library and where each goes.

## LOD policy
LOD0 / LOD1 / LOD2 and a triangle budget band.

## QA
`real`, `measures`, `checks`, `gaps` to declare.

## Common mistakes

## Reuse
`recipes/_parts` components and kind builders.

## Sources
```

## Reuse catalogue (status 2026-11)

Shipped `definePart` components in [`recipes/_parts/`](../../recipes/_parts/): `wheel` (tyre on a
spoked rim, spins about Y), `hinge`, `door_handle`, `panel_door`, `casement_window`, `railing`,
`ladder`, `lamp` (pendant / bulkhead, glowing piece), `pipe` (rigid or hose, optional flanges),
`flange`, `hex_bolt`, `hex_nut`, `washer`, `rivet_row`, `steel_beam` (IPE / UPN / angle),
`valve_wheel`. Call one as `wheel(ctx, 'axle_f', { diameter: 0.66 }, { at })`, or take
`wheel.mesh(params, ctx)` and `place` / `merge` it. **Planned** (named in playbooks so recipes
converge on them; not shipped yet): seats, tyres-only, mirrors, light clusters, steps, stairs,
gutters, number plates.

Kind builders ([09-kinds](../idea/09-kinds.md)): `axle`, `trackRun`, `whyteAxles`, `propeller`,
`hull` / `hullMesh`, `roof` / `roofMesh`, `opening`, `facade`, `mass`, `setbacks`, `tree` / `trees`,
`head`, plus primitives `lattice`, `loft`, `sweep`, `tiled`, `heightfield`, `sculpt`, `extrudeSvg`.

Material strips ([materials](../architecture/materials.md)): classic `plain brick stone slate iron
wood glass concrete`; library `oak pine wood_weathered wood_painted iron_rust iron_cast
steel_painted steel_galvanised brass copper aluminium chrome rubber canvas leather plastic`; nature
`sand soil gravel mud rock_strata cliff moss grass snow ice bark_oak bark_pine bark_birch
leaf_litter cobblestone asphalt water lava`. Use `NATURAL` vertex colour on library strips; paint
colour goes in the vertex colour of `steel_painted`, `wood_painted` and `plastic`.
