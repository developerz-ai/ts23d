# Brief: monthly improvement

Fired every Monday by `schedules: improve`. **Act only on the first Monday of the month:**
`[ "$(date -u +%-d)" -le 7 ]`. On any other Monday stop here, file nothing, open nothing.

Once a month, leave ts23d measurably better. `CLAUDE.md` binds every change. A red `main`, a missing
publish and a stuck Dependabot PR belong to `health`.

## Pick at most three, in this order

1. Anything `bun run verify` on fresh `main` found broken or flaky: the root cause, never a retry or a skip.
2. Open bugs (`gh issue list --state open --label bug --json number,title,url`), each starting from a test that fails on `main`.
3. Claims that no longer match the code: `docs/plans/roadmap.md` ticks vs `src/**/planned.ts` stubs,
   `docs/architecture/errors.md` vs the `T3D_*` codes in `src/`, dated claims (`grep -rn 'As of 20' README.md CLAUDE.md docs`)
   older than three months, then dead code.

## Ship

One small PR per improvement, its evidence in the body, `bun run verify` green first. Recipe changes carry
their contact sheets (`bun run t3d shot`). Never bump the version or touch release automation here.
Check no open PR or issue already covers it. If nothing is worth changing, do nothing: no empty PRs, no churn.

## Rows

- `gate-regressions`: anything the gate on fresh `main` found broken or flaky.
- `open-bugs`: open bugs, each from a failing test.
- `claims-and-dead-code`: roadmap, error table and dated claims that no longer match the code, then dead code.
