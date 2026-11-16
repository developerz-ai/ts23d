# 18 — Docs true to code, roadmap, release, Pages (coordinator)

Rule: nothing ships that the docs misdescribe; the release goes out through the normal PR → tag → OIDC path.

## Files
| Path | State | Why |
|---|---|---|
| `README.md`, `llms.txt` | changed | tiers (CPU / GPU), adapters, hero tier, clips, `t3d concept`, `t3d neural` |
| `docs/idea/01-vision.md`, `07-what-fits.md`, `10-sculpting.md` | changed | "realistic anatomy goes through import/neural" (`10-sculpting.md` What-not-to-build) replaced by the hybrid model |
| `docs/plans/roadmap.md` | changed | ticks listed in the overview; new items for KTX2, GPU sculpt eval (not built here) |
| `CHANGELOG.md` | changed | via `bun run changelog` |
| `docs/maintenance.md` | changed | which lane re-runs calibration and checks neural caches |
| `.claude/skills/*` touched by slices | changed | skill text matches shipped commands |
| this plan's `status.yml` | changed | complete + evidence |

## Depends on
All slices.

## Change
- Release per wave with visible gain: after wave 2 (`0.7.0`: measurement + forms + fur + maps), after wave 5 (`0.8.0`). `bun run release <x.y.z>` → PR `chore: release x.y.z` → merge → tag → npm (OIDC) → `pages.yml` deploys the gallery.

## Tests
`bun run verify` full, no GPU.

## Checks
`bun run verify` · `bun run changelog --check` · `bun run site:build`

## Status (2026-11-16)
Docs pass done for README, `llms.txt`, roadmap ticks, `docs/idea/{01,07,10}`, `CHANGELOG.md [Unreleased]`. Not done: `docs/maintenance.md` lane text, skills, release `0.9.0` (waits on slice 17: flagships at calibrated 8.5, hybrid heads).

## Done when
Release on npm; gallery live at developerz-ai.github.io/ts23d with the new flagships.
