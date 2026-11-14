# 02 — Material and grammar (tier 1)

Rule: a colour or a split string is parsed strictly or rejected; output never depends on what the
process built before.

## Files
| Path | State | Why |
|---|---|---|
| `src/material/palette.ts`, `palette.test.ts` | changed | strict `hex` |
| `src/material/define.ts`, `slots.ts`, `trim-sheet.ts` + their tests | changed | custom-strip row independent of call order |
| `src/grammar/split.ts`, `split.test.ts` | changed | strict tokens, underfill, length check |
| `src/grammar/whyte.ts`, `whyte.test.ts` | changed | strict pattern |

## Depends on
01 (`T3D_GRAMMAR_UNDERFILL`).

## Change
- `hex(s)` (`palette.ts:9-16`): accept `#rgb` and `#rrggbb` only (case-insensitive); anything else → `T3D_MATERIAL_INVALID`, fix: "use #rrggbb; alpha is not supported on palette colours". `src/core/paint.ts` already rejects the same inputs; material is tier 1 so it may import a shared parser from core if one is exported, otherwise keep the regex local.
- Custom strip rows (`define.ts:67`, `trim-sheet.ts:96`): today the row is "next free", so `fur_neutral` gets v0 = 0.65625 alone and 0.671875 after `reptile_scales`. Assign rows per build from the sorted ids of the materials the asset actually uses, not from module-level registration order. Same asset + same materials = same rows in any process. `T3D_SHEET_FULL` unchanged.
- `split` (`split.ts:35-46, 58-86`): tokenise on `|` only; a stray `{` / `}` or a `{…}` without `*` → `T3D_GRAMMAR_SYNTAX`. `length` must be finite and ≥ 0 → `T3D_GRAMMAR_SYNTAX`. When fixed terms sum to less than `length` and no flex or repeat term can absorb the remainder (beyond 1e-9 m) → `T3D_GRAMMAR_UNDERFILL`. `split("a:1|{b:2}*", 2.5)`: no whole `b` fits the 1.5 m left over, so it is unabsorbed → underfill.
- `parseWhyte` (`whyte.ts:11`): match `/^\d+-\d+-\d+$/`, driving wheels > 0, else `T3D_GRAMMAR_SYNTAX`.

## Tests
- `hex('#fff')` → `[1,1,1]`; `hex('#ff000080')`, `hex('zzz')`, `hex('')` throw.
- Row stability: build asset A alone, then after defining an unrelated material in the same process → identical UV V for A's custom strip.
- `split('{arch:2}', 4)`, `split('a:1}b:2', 3)`, `split('a:1|b:1', 5)`, `split('a:1', NaN)` each throw their code; `split('a:1|~b|c:1', 5)` still fills 5 m.
- `parseWhyte('--')`, `parseWhyte('4-0-0')` throw; `'4-4-0'` parses.

## Checks
`bun test src/material src/grammar` · `bun run verify --only lint,typecheck,boundaries,filesize` ·
`bun run verify --only recipes` to list recipes that relied on underfill or on old strip rows
(report them to the coordinator; do not edit recipes in this slice).

## Docs
Slice 11: defect rows D29 (`hex` mis-parse), D30 (strip row depends on process history), D31
(silent split underfill). `docs/idea/` grammar page gets the underfill rule.

## Done when
The four repros above throw; strip rows are identical across process histories; the list of
recipes needing a `bun run shots` refresh is handed to the coordinator.
