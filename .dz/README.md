# `.dz/`

Configuration for the [developerz.ai](https://www.developerz.ai) maintainer bot on this repo. The
platform owns the layout. ts23d is **fully AI-maintained** (owner ruling 2026-11-14): the bot
triages, reviews, merges on a green `verify`, cuts releases and does the monthly upkeep.

| Path | What |
|---|---|
| `maintainer/maintainer.yml` | the policy: triage and stale sweeps, fleet handoff, auto-merge on `verify` for every author, review lane, schedules |
| `maintainer/reviewer.md` | this repo's layer of the reviewer prompt |
| `pipeline/agent-pipeline.json` | merge gate for the agent pipeline: CI only, standing authorization |
| `briefs/` | what each checkup works from, read at `main`'s HEAD when it fires: `health.md` (daily: red `main`, gallery deploy, unpublished release, stuck Dependabot), `security-release.md` (daily: a confirmed advisory fix ships the same day), `release-due.md` (weekly: judge and cut a release), `improve.md` (monthly: gate regressions, bugs, stale claims), `cleanup.md` (monthly: branches, stale plans, generated files, weight, links, dead code) |
| `onboarding/scorecard.md` | written by the platform's onboarding run |
