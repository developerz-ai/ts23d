# Brief: monthly repo hygiene

Fired every Tuesday by `schedules: cleanup`. **Act only in the first week of the month:**

```bash
[ "$(date -u +%-d)" -le 7 ] || { echo "not the first Tuesday of the month: cleanup does nothing"; exit 0; }
```

ts23d is maintained by agents only. Once a month, sweep what accumulates when nobody owns it:
branches, stale plans, generated files, weight, drifted docs and dead code. `CLAUDE.md` binds every
change. Feature work and bugs belong to `improve`; a red `main` belongs to `health`.

## Sweep

| Row | Look | Act |
|---|---|---|
| `branches` | `git fetch --prune origin`, then `git branch -r --merged origin/main` and `gh pr list --state open --json headRefName` | delete remote branches merged into `main` with no open PR. An unmerged branch older than 60 days with no open PR: list it in the PR body, never delete it |
| `plans` | `grep -l 'status: \(not_started\|in_progress\)' docs/plans/**/status.yml` with `last_updated` older than 60 days | resume it as an `improve` item, or mark `superseded` with the reason in `notes`; never leave a plan claiming work nobody does |
| `generated` | `git ls-files -ci --exclude-standard`; `ls recipes/*/out` against `ls recipes/*/*.ts`; `bun run shots` on fresh `main` then `git status --porcelain` | untrack ignored files; delete `out/` folders whose recipe is gone; commit refreshed outputs only when the `recipes` gate says they are stale |
| `ignore` | `git status --porcelain --ignored` after `bun run verify` | every path the gate or the CLI writes (`out/`, `renders/`, `review/`, `critique/`) is in `.gitignore` |
| `weight` | `bun pm pack --dry-run` (size, file count), `git ls-files -z \| xargs -0 du -b \| sort -n \| tail -20` | a tarball growing past last month's PR body by more than 10 %, or a tracked file over 5 MB, gets the cause fixed (`files` in `package.json`, a smaller PNG) |
| `dependencies` | `bun outdated`; open Dependabot PRs | land the devDependency majors Dependabot can't (full gate green); the library's `dependencies` stays empty |
| `links` | every relative link in `README.md`, `CLAUDE.md`, `llms.txt`, `docs/**/*.md` (`grep -o '](\.[^)#]*'` + `test -e`); README badges answer 200 | fix or remove the dead ones |
| `dead-code` | exports nothing imports (`grep -rn "export function\|export const" src` vs their uses), `it.skip` / `test.todo`, `planned.ts` entries the roadmap dropped | delete with the test that proves nothing used it; a `planned.ts` stub stays while the roadmap names it |
| `docs-drift` | `docs/architecture/errors.md` vs `T3D_*` in `src/` (`bun run verify --only conventions`), CLAUDE.md commands table vs `package.json` scripts, dated claims (`grep -rn 'As of 20' README.md CLAUDE.md docs .dz`) older than three months | rewrite the claim to match the code, never the code to match the claim |

## Ship

One PR, `chore: monthly cleanup <YYYY-MM>`, `bun run verify` green first. The body has one line per
row: what was looked at, the numbers (tarball size, file count, branches deleted) and what changed,
so next month's run compares against it. Deleting a branch is the only act outside the PR, and only
for branches already merged. If every row is clean, open nothing and end the run summary with
`clean: <rows checked>`.

## Rows

- `branches`: merged remote branches pruned; old unmerged ones listed.
- `plans`: no stale `not_started` / `in_progress` plan.
- `generated`: committed outputs fresh, no orphans, nothing ignored tracked.
- `ignore`: `.gitignore` covers every generated path.
- `weight`: tarball and repo weight compared with last month.
- `dependencies`: devDependency majors landed; library deps still empty.
- `links`: relative links and badges resolve.
- `dead-code`: dead exports and skipped tests removed.
- `docs-drift`: docs say what the code does.
