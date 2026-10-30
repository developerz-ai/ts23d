# AI-first scorecard

> Written by the developerz.ai maintainer agent — established by dz-runner setup mode. Each onboarding run rewrites this file whole; the latest run wins, and the same card is stored on the platform.

- Run: `run_fd8fb8e352e6417bb2c2564a3eeab0a7`
- Computed: 2026-10-26T05:00:32.855Z
- Proof: **proved** — every command ran green at head.
- Score: 13 of 15 items ok

## `policy` — ok

- .dz/maintainer/maintainer.yml already present, left alone
- .dz/maintainer/reviewer.md established

## `brain` — ok

- CLAUDE.md already present, left alone

## `roster` — ok

- .claude/agents already present, left alone

## `skills` — ok

- .claude/skills already present, left alone

## `scripts` — ok

- bin/setup established
- bin/dev established
- bin/check established
- bin/stop established
- down: ./bin/stop (bin)
- ./bin/setup exited 0 at head (8.3s)

## `wiring` — ok

- .mcp.json established

## `commands` — ok

- .claude/commands already present, left alone

## `access` — ok

- asked for 0 credentials
- ./bin/check exited 0 at head (19.3s) ran with 2 stored secrets: SENTRY_ACCESS_TOKEN, SENTRY_HOST

## `layout` — gap

- partial house layout
- no packages/ at the repository root

## `smoke_test` — ok

- src/core/rng.test.ts in the repository
- run by ./bin/check exited 0 at head (19.3s)

## `env_example` — gap

- nothing recorded

## `agents_md` — ok

- AGENTS.md already present, left alone

## `per_workspace_brains` — ok

- apps/site/CLAUDE.md established

## `docs_readme` — ok

- docs/README.md already present, left alone

## `gate_proved` — ok

- ./bin/check exited 0 at head (19.3s)
