---
description: Write a self-contained plan to docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/ that another agent (or /feature) executes — path-disjoint slices, tests and gates named, tied to the roadmap
argument-hint: <the feature, primitive, kind or recipe set to plan>
allowed-tools: Read, Write, Glob, Grep, Bash, Agent
---

Goal: $ARGUMENTS

**Plan only.** No edits outside the plan dir. The executor needs nothing but the plan and the files
it cites. Read `CLAUDE.md` first. Skip `/planx` for a one- or two-file change: just do it.

1. **Resolve path.** `date +%Y/%m/%d` → `Glob docs/plans/<YYYY>/<MM>/<DD>/1*` → next `1NN` (else `101`).
   Slug: kebab-case, ≤ 5 words.
2. **Falsify, then explore.** Read the code the goal touches; docs and the roadmap can be stale.
   Broad sweep → `Agent` (Explore, very thorough), never a git worktree. Collect: roadmap item
   (`docs/plans/roadmap.md` milestone + line) · tier of each module touched (`scripts/lib/tiers.ts`) ·
   existing code to reuse (`file:line`) · `planned.ts` stubs this ships · new `T3D_*` codes · recipes
   whose contact sheets will change.
3. **Write the plan as files, never one `plan.md`.**
   - `overview.md`: `## Goal` (1–2 sentences, what an agent/recipe can do after) · `## Roadmap`
     (milestone + item) · `## Falsified` (claims checked and found wrong) · `## Slices` (ordered
     links, one line each) · `## Done when` · `## Risks / open questions`.
   - One `<NN>-<aspect>.md` per slice: `## Files` (exclusive set: `path` new/changed + why; two
     slices never share a file; shared barrels like `src/index.ts` go to ONE slice) · `## Depends on`
     · `## Change` (signatures, error codes + `fix:`, LOD knobs, units) · `## Tests` (failure case
     first, file beside source) · `## Checks` (scoped: `bun test <files>`, `bun run verify --only
     <steps>`; recipe slices add `t3d build` QA PASS + `t3d shot`, PNG read) · `## Docs` (README,
     `docs/idea/*`, `docs/architecture/errors.md`, roadmap tick, CHANGELOG) · `## Done when`.
4. **`status.yml`** in the plan dir:

```yaml
plan: <1NN>-<slug>
title: <title>
roadmap: <M#: item>
status: not_started        # not_started | in_progress | blocked | complete | superseded
owner: <git config user.name>
worked_by: ""
percent: 0
current_focus: ""
slices:
  - file: 01-<aspect>.md
    status: not_started
    percent: 0
evidence: []               # PR links, verify --json summaries, contact-sheet paths
notes: ""
last_updated: <YYYY-MM-DD>
```

Rules: house style (rule first, fragments, tables); reference code, don't restate it; no checkboxes
(`status.yml` is the only tracker); tiers only import down; planned ≠ shipped; neutral positioning.
Execution is one checkout, ≤ 4 parallel agents, slices disjoint by path; the coordinator alone edits
shared index files and runs the full `bun run verify` once at the end.

Output:
```
✓ docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/overview.md + 01-…, 02-… + status.yml
Next: /feature docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/overview.md
```
