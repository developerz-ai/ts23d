# Reviewer instructions — developerz-ai/ts23d

> Read by the developerz.ai reviewer at EVERY review of this repository, at the reviewed
> commit, as this repo's own layer of the reviewer's prompt — established by dz-runner setup mode.
> It refines the platform rules (a finding is cited or withheld; the bot always discloses)
> and never overrides them. Edit freely; keep it under 12,000 characters — past that it is cut.

## Stack

Bun 1.4.3 (mise-pinned) + TypeScript + Biome. The gate is `bin/check` (`mise exec bun@$(cat .bun-version) -- bun run verify`): a change that does not pass it is not proven, whatever its description says.

## Review conventions
- Hold every PR to a green `bun run verify` — the exact command CI runs; a red, skipped or subset-only run is not proven.
- Imports go down the tier table only, through each module's `index.ts` (`scripts/lib/tiers.ts` is the executable copy).
- Reject `any`, non-null `!`, default exports, missing `import type`; Biome rules are errors, not suggestions.
- Require `Ts23dError('T3D_…', { cause, fix })` for library throws — a bare `Error` or a finding without an actionable `fix:` is a defect.
- One job per file, header comment, target < 200 lines, 300 enforced ceiling.
- No `Math.random`, `Date`, `performance.now` or locale formatting in `src/` or `recipes/`; determinism findings route to `ctx.rng` / `createRng(seed)`.
- Require the contact sheet on any recipe change (`bun run t3d shot recipes/x.ts` → `out/x/sheet.png`).
- Hold declared `real` dimensions to ±5% overall and `measures` to ±2%; the model is fixed, never the spec.
- Planned APIs stay in `planned.ts` with `notImplemented()`; a silent stub or a doc claiming shipped-early is a defect.
- `dependencies` in the library stays empty; three/vite live only in `apps/site`.
- Docs land in the same PR: idea doc, roadmap tick, `CHANGELOG.md` under `## [Unreleased]`; one-way doors get an ADR in `docs/decisions/`.
- Conventional titles, one concern per PR; `chore: release x.y.z` is reserved for release stamping (PUBLISHING.md).
- Keep positioning neutral toward image-to-3D vendors (docs/landscape.md is the reference).

## Gates that matter
- `bun run verify` decides everything: lint, typecheck, boundaries, determinism, filesize, test, recipes, build — identical to CI's verify job per `scripts/ci-parity.test.ts`.
- `recipes` step: every gallery recipe compiles at LOD 0/1/2, passes QA, and builds byte-identically twice — no recipe PR is proven without it.
- CI's `shots` job uploads per-recipe contact sheets; visual claims are judged from the PNG, not the diff.
- Site (`pages.yml`) and publish (`release-tag.yml` → `release.yml`) run only on main/tags; a PR proves itself with verify alone.
- Run under the pinned bun (`.bun-version` = 1.4.3, e.g. `mise exec bun@$(cat .bun-version)`) so local green matches CI.

## Never flag
- Generated output: `dist/`, `apps/site/dist/`, `out/`, `renders/`, and the README bench block between `<!-- bench:start/end -->`.
- `.claude/` agents, commands and the `author-recipe` skill plus `docs/` — they ship inside the npm package (package.json `files`); they are product.
- Biome formatting (2-space, single quotes, width 100, trailing commas) — `bun run lint:fix` owns it.
- `planned.ts` files throwing `T3D_NOT_IMPLEMENTED` — deliberate 0.x scaffold owned by docs/plans/roadmap.md.
- The `.bun-version` pin and SHA-pinned GitHub Actions — deliberate; Dependabot moves the pins.
- The `apps/site/vite.config.ts` default export — the one sanctioned exception (biome override).
