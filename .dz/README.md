# `.dz/`

Configuration for the [developerz.ai](https://www.developerz.ai) maintainer bot on this repo. The
platform owns the layout.

| Path | What |
|---|---|
| `maintainer/maintainer.yml` | the policy. As of 2026-11: every PR is reviewed and the `schedules:` checkups file issues; no triage, merges or releases by the bot yet |
| `briefs/` | what each checkup works from, read at `main`'s HEAD when it fires: `health.md` (daily: red `main`, gallery deploy, unpublished release, stuck Dependabot), `release-due.md` (weekly: is a release worth filing), `improve.md` (monthly upkeep) |
