# Maintenance: how ts23d keeps itself running

ts23d is fully AI-maintained (owner ruling 2026-11-14): no human is needed to triage, review, merge,
release or keep the toolchain current. This page is the contract that makes that hold for a decade:
what wears out in a repo nobody touches, and which automated lane catches each thing before a user
notices. The lanes are developerz.ai checkups configured in
[`.dz/maintainer/maintainer.yml`](../.dz/maintainer/maintainer.yml); each runs from a brief in
[`.dz/briefs/`](../.dz/briefs/) read at `main`'s HEAD, so changing a brief changes the next run.

## The loop

| Lane | Cadence | Does | Brief |
|---|---|---|---|
| review + merge | every PR | reviews, drives `verify` green, merges (any author) | [`maintainer.yml`](../.dz/maintainer/maintainer.yml) `pr:` / `review:` |
| triage | every issue | qualifies, asks for a repro, hands ready work to the coding fleet, sweeps stale | `maintainer.yml` `triage:` / `handoff:` |
| `health` | daily | red `main`, gallery not deployed, a release npm does not serve, stuck Dependabot | [`health.md`](../.dz/briefs/health.md) |
| `security-release` | daily | a first-tier-confirmed advisory fix ships the same day | [`security-release.md`](../.dz/briefs/security-release.md) |
| `release-due` | weekly (Wed) | judges whether users get something; cuts and merges `chore: release x.y.z` | [`release-due.md`](../.dz/briefs/release-due.md) |
| `improve` | monthly (1st Mon) | gate regressions, bugs, stale claims, one roadmap step | [`improve.md`](../.dz/briefs/improve.md) |
| `cleanup` | monthly (1st Tue) | branches, stale plans, generated files, weight, links, dead code, the Bun pin; each January the yearly review below | [`cleanup.md`](../.dz/briefs/cleanup.md) |
| Dependabot | weekly (Bun deps), monthly (Actions) | version PRs with a 14-day cooldown; merged by the review lane on green | [`.github/dependabot.yml`](../.github/dependabot.yml) |

Every change still passes the same gate a human's would: `bun run verify` (11 steps, including
every recipe's QA and a consumer install of the packed tarball). Nothing in a brief may weaken a
gate; a red gate is fixed at the root cause.

## What decays, and what catches it

| Decays | Symptom | Caught by | Fix the lane applies |
|---|---|---|---|
| npm and devDependencies | security advisories, majors with breaking APIs | Dependabot weekly; `cleanup` row `dependencies` lands the majors Dependabot can't | bump, full gate, merge |
| GitHub Actions pins | deprecated runtimes (an action's `node20` → `node24`), warnings turning into failures | Dependabot monthly (SHA pins); `health` on a red `main` | bump the pin; never unpin |
| Bun (`.bun-version`) | new releases Dependabot does not track; old versions drop from setup-bun | `cleanup` row `toolchain` monthly | move `.bun-version`, `engines.bun` and the README badge to the latest stable older than 14 days; `bun run verify` + `bun run shots`; a byte change in renders is reviewed, not hidden |
| Node (library consumers) | an LTS line reaches end of life | `cleanup` yearly row `runtimes` | raise `engines.node` to the oldest maintained LTS; the `pack` step proves imports |
| Runner images | `ubuntu-latest` moves; packages (`webp`) change names | `health` (red `ci` / `pages`) | adapt the workflow step; keep the job's check name |
| Determinism across toolchains | same source, different bytes after a Bun or OS change | `recipes` gate (stale outputs) and the `shots` job's byte diff | refresh with `bun run shots`, explain the cause in the PR; roadmap line on cross-machine determinism |
| Publishing | npm trusted-publishing or provenance rules change | `health` row `release-published` | follow npm's current OIDC docs in `release.yml`; recoveries in [`PUBLISHING.md`](../PUBLISHING.md) |
| Docs | claims drift from code; links and badges rot | `conventions` gate (error codes, defect rows); `cleanup` rows `links`, `docs-drift` | rewrite the claim to match the code |
| Plans and roadmap | plans left `in_progress`, roadmap ticks that lie | `cleanup` row `plans`; `improve` row `claims` | resume, or mark `superseded` with the reason |
| Repo and package weight | renders and PNGs pile up | `cleanup` row `weight` (compared month to month) | `files` exclusions, smaller PNGs; history rewrite only by a human |
| CI time | recipes and tests grow; the push → green target is under 5 minutes. Measured 2026-11-19 (run 44460876935, old layout): 9 minutes, 26 jobs, 87.5 runner-minutes. Now 16 `gate` shards, each running its `bun test --shard` slice and its recipe units split by measured cost; measured 2026-11-19 (run 44474402275): 6.6 minutes, 18 jobs, 76 runner-minutes, slowest shard 6.4 minutes. The floor is one unit: `human_head`'s renders, because `shot`, `hero`, `blueprint` and `icon` each compile LOD0 again (about 55 s each) | nothing automatic yet: the target lives in `ci.yml`'s header; `improve` should compare the median `ci` run time on `main` month to month, and refresh the costs when shards drift (`bun run scripts/recipe-costs.ts --tests`, then `--plan` to pick the shard count; the shots step logs seconds per folder) | done: cost-balanced shards (`scripts/lib/shard.ts`, `scripts/lib/recipe-costs.json`), tests split across shards, renders in one process per folder (`scripts/shots-folder.ts`), docs-only changes skip recipe work. Next: share one compile across a folder's four renders (a `src/cli` compile cache or one multi-output command; `human_head` renders would drop from about 240 s to about 90 s locally); never by dropping a check |
| Gallery | three.js / Vite majors break the viewer | Dependabot + the `site` CI job; `health` row `pages-deployed` | port the viewer; the site stays a gallery, never a game |
| The policy itself | schema changes on developerz.ai | the platform validates `maintainer.yml` on ingest | update the file to the published schema |

## The yearly review (January `cleanup`)

Once a year the cleanup lane also walks this list and records the outcome in its PR body:
- **runtimes**: `engines.node` is the oldest maintained Node LTS; `.bun-version` is current; the
  README Bun/Node badges match.
- **actions**: no workflow uses an action runtime GitHub has announced for removal.
- **publishing**: the last release on npm shows provenance; `PUBLISHING.md` matches npm's current
  trusted-publisher setup.
- **this page**: every row still names a lane that exists; new failure modes found during the year
  get a row.

## What still needs a human

Only what an agent must not grant itself. These are one-time settings, listed so they are never
forgotten:
- the `main` ruleset (require a pull request and the `verify` check) and the `v*` tag ruleset;
- the npm trusted publisher (`developerz-ai/ts23d`, `release.yml`, environment `npm-publish`);
- org membership, billing and the developerz.ai account the bot runs under;
- the 1.0.0 decision: `release-due` files it as a question instead of cutting it.

A breaking change in 0.x is the agent's to judge (`escalate.ask_before_acting: []`); the
platform's own asks (security, licence, CLA) still reach a person.
