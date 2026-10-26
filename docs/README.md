# ts23d docs

**These docs are versioned with the package:** the copy in `node_modules/@developerz-ai/ts23d/docs/` always matches the installed code, and works offline.

**One owning doc per fact.** The idea docs say what and why; ADRs record decisions and the options they rejected; the architecture docs say where things go. The code wins on any conflict. Open an issue when you find one.

## Start here

| If you want to… | Read |
|---|---|
| Know what this is and isn't | [idea/01-vision.md](idea/01-vision.md) |
| Write a recipe | [idea/02-dsl.md](idea/02-dsl.md) → [idea/09-kinds.md](idea/09-kinds.md) |
| Drive it from an agent | [idea/05-agent-loop.md](idea/05-agent-loop.md) |
| Decide if your asset fits | [idea/07-what-fits.md](idea/07-what-fits.md) · [landscape.md](landscape.md) |
| Add code to the library | [architecture/README.md](architecture/README.md) · [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Decode an error | [architecture/errors.md](architecture/errors.md) |
| See what's built vs planned | [plans/roadmap.md](plans/roadmap.md) |
| Release a version | [../PUBLISHING.md](../PUBLISHING.md) |

## Idea: what and why

| Doc | Covers |
|---|---|
| [01-vision.md](idea/01-vision.md) | The pitch, origin, principles, non-goals |
| [02-dsl.md](idea/02-dsl.md) | `defineAsset`, the `ctx` API, composition with `ctx.use`, determinism rules |
| [03-ir.md](idea/03-ir.md) | Mesh IR, parts, units, axes, LODs |
| [04-materials.md](idea/04-materials.md) | Trim sheet, palettes, vertex colour, the procedural sheet painter, TSL / Godot shader sources |
| [05-agent-loop.md](idea/05-agent-loop.md) | The write → build → shot → read loop, contact sheet layout |
| [06-qa.md](idea/06-qa.md) | Gates: shipped vs planned |
| [07-what-fits.md](idea/07-what-fits.md) | Fit matrix by asset category |
| [08-neural-adapters.md](idea/08-neural-adapters.md) | Optional local-GPU models for organic shapes, image sources |
| [09-kinds.md](idea/09-kinds.md) | Domain builders: building, vehicle, vessel, vegetation, creature, scene |

## Decisions

Index with status: [decisions/README.md](decisions/README.md).

## Architecture: where things go

| Doc | Covers |
|---|---|
| [architecture/README.md](architecture/README.md) | Module tiers and the import rule |
| [architecture/adding-a-primitive.md](architecture/adding-a-primitive.md) | New geometry builder |
| [architecture/adding-a-kind.md](architecture/adding-a-kind.md) | New domain builder |
| [architecture/errors.md](architecture/errors.md) | Every `T3D_*` code: cause, fix |

## Other

| Doc | Covers |
|---|---|
| [plans/roadmap.md](plans/roadmap.md) | M0–M6 milestones |
| [landscape.md](landscape.md) | Neutral survey of AI 3D generators (as of 2026-10) |
