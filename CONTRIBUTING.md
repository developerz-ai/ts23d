# Contributing

**One command sets you up, one command is the gate.** `bun run verify` locally is exactly the `verify` job in CI (`scripts/ci-parity.test.ts` holds them together). Green here means green there.

Most contributors are coding agents. These rules are written for them and apply to humans unchanged.

## Setup

```sh
git clone https://github.com/developerz-ai/ts23d && cd ts23d
bun run setup        # checks .bun-version, bun install, lefthook hooks (installs only; it does not run the gate)
```

Bun version: `.bun-version`. Setup warns on a mismatch; CI uses the pinned one.

## The gate

```sh
bun run verify                       # every step, stops on the first red
bun run verify --only lint,test      # the inner loop
bun run verify --json                # for agents: { ok, failed, results, output }
```

| Step | Checks | Alone |
|---|---|---|
| `lint` | Biome: format + lint | `bun run lint` (`lint:fix` to write) |
| `typecheck` | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | `bun run typecheck` |
| `boundaries` | Imports only go down a tier, only through `index.ts` ([architecture](docs/architecture/README.md)) | `bun run boundaries` |
| `determinism` | No `Math.random`, wall clock, `performance.now`, locale formatting in `src/` / `recipes/` | `bun run determinism` |
| `filesize` | No source file over 300 lines | `bun run filesize` |
| `placeholders` | No elided or stubbed code (`// ...`, "rest of the code", "same as above", `TODO: implement`); planned work uses `notImplemented()` | `bun run placeholders` |
| `conventions` | CLAUDE.md rules a script can check: no bare `Error` in `src/`, a header comment per file, every `T3D_*` code in [errors.md](docs/architecture/errors.md), no `simplify` on code-built geometry, vehicle/building recipes declare `real` + `sources` + `measures`, every shipped [defect row](docs/architecture/defect-catalogue.md) names an existing check path | `bun run conventions` |
| `test` | The `test` script in `package.json` (`src`, `scripts`, `examples`, `apps/site/src`; one 120 s per-test timeout) | `bun run test` |
| `recipes` | Every recipe compiles at 3 LODs, passes QA, builds byte-identically twice, has `hero.png` + `sheet.png` + `manifest.json`; also runs each recipe's own `*.test.ts` | `bun run recipes` |
| `build` | `dist/` JS + `.d.ts` | `bun run build` |
| `pack` | Packs the tarball, installs it in an empty project, imports every `exports` subpath under Bun and Node, runs `t3d build` | `bun run scripts/pack-smoke.ts` |

11 steps, in this order (`STEPS` in `scripts/verify.ts`). An unknown `--only` name exits 2. CI shards 2..n run only `recipes`.

Hooks: pre-commit runs Biome on staged files; pre-push runs only the fast steps (lint, typecheck, boundaries, determinism, filesize, placeholders, conventions); the full gate is CI's `verify` check.

## Conventions

| Rule | Detail |
|---|---|
| **SRP files** | One job per file, target < 200 lines; 300 is the enforced ceiling. Split by responsibility, re-export from `index.ts` |
| **Named exports only** | No `export default` (Biome `noDefaultExport`) |
| **No `any`** | Biome `noExplicitAny`; no `!` non-null assertions either |
| **Errors** | `throw new Ts23dError('T3D_…', { cause, fix })`. `fix` is an action. New code → add to `ErrorCode` and [errors.md](docs/architecture/errors.md) |
| **Tests next to source** | `foo.ts` → `foo.test.ts` in the same folder. Test files (`src`, `recipes`) are excluded from the package |
| **Determinism** | No `Math.random` (tests make it throw), no `Date`, no `performance.now` in geometry. Use `ctx.rng` / `createRng(seed)` |
| **Header comment** | Every file opens with a comment stating its job |
| **Planned API** | Final signature in a `planned.ts`, body `notImplemented(what, plan?)`. Never a silent stub |
| **Units** | Metres, Z up, +X front ([ADR 004](docs/decisions/004-z-up-metres.md)) |
| **No runtime deps** | `dependencies` stays empty ([ADR 005](docs/decisions/005-zero-runtime-deps.md)) |
| **Docs in the same PR** | API change → the idea doc, [roadmap](docs/plans/roadmap.md) tick, `CHANGELOG.md` under `## [Unreleased]`. One-way-door call → an ADR in `docs/decisions/` |

## Recipes

New or changed recipe → attach its contact sheet (`bun run t3d shot recipes/x/x.ts` → `out/x/sheet.png`) to the PR. CI's `shots` job uploads sheets for every recipe as an artefact. Real dimensions with `sources`, so the `proportions` gate can hold them.

## Pull requests

- Conventional titles: `feat(primitives): tiled`, `fix(qa): …`, `docs: …`, `chore: release x.y.z` (reserved for releases, see [PUBLISHING.md](PUBLISHING.md)).
- One concern per PR. Green `verify` before review.
- Guides: [adding a primitive](docs/architecture/adding-a-primitive.md) · [adding a kind](docs/architecture/adding-a-kind.md).

## Licence

Contributions are MIT, like the rest of the repo.
