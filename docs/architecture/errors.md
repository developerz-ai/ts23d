# Errors

**Every failure is a `Ts23dError` with a stable `code`, a `cause` in the message, and a `fix`.** The reader is usually an agent: act on `fix`, don't parse prose. Codes are stable across minor versions. Source: `src/core/errors.ts`.

```
T3D_PART_UNKNOWN: part 'gun_barrel' parents to 'gun', which does not exist yet
  fix: add the parent (ctx.group or ctx.part) before its children
```

`--json`: `{"ok":false,"error":{"code":"…","message":"…","fix":"…"}}`, exit 1.

## Library codes

| Code | Thrown by | Cause | Fix |
|---|---|---|---|
| `T3D_NOT_IMPLEMENTED` | Anything in a `planned.ts` (`tiled`, `cell`, `sdf`, `roof`, `hull`, `creature`), `optimize`, `photoMatch`, `/neural`, `silhouetteIoU` | Declared API, not built yet. The message names the doc tracking it | Use a shipped alternative ([roadmap](../plans/roadmap.md)), or implement it ([adding a primitive](adding-a-primitive.md), [adding a kind](adding-a-kind.md)) |
| `T3D_GRAMMAR_SYNTAX` | `parseSplit`, `split`, `parseWhyte` | Bad split term, empty split, a repeat with stretch terms, more than one repeat; or a Whyte string that isn't three even numbers | Split: `sym:<metres>`, `sym:~`, `sym:~<weight>`, `{a:1 \| b:2}*`, joined by `\|`. Whyte: `'4-4-0'`, `'2-8-2'` |
| `T3D_GRAMMAR_OVERFLOW` | `layoutSplit`, `split`, `facade` | Fixed terms sum to more than the strip length | Shrink a fixed term or make one a stretch (`sym:~`) |
| `T3D_PART_DUPLICATE` | `ctx.part`, `ctx.group`, `ctx.use` | A part name added twice in one asset | Suffix the loop index: `wheel_0`, `wheel_1`; give each `ctx.use` a unique `prefix` |
| `T3D_PART_UNKNOWN` | `ctx.part`, `ctx.group` | `parent` names a part not added yet | Add the parent first |
| `T3D_RECIPE_INVALID` | `defineAsset`, `ctx.part` | Asset name not `[a-z][a-z0-9_]*`; or a part with both `yaw` and `motion` | Rename to snake_case; put yaw on a parent `ctx.group`, motion on the child |
| `T3D_NO_ASSET_EXPORT` | CLI loader | The module exports no `defineAsset` result | `export const my_thing = defineAsset({ … })`. Named export, no default |
| `T3D_QA_FAILED` | Reserved | Declared for a QA failure surfaced as an exception. As of 2026-10 nothing throws it: the CLI reports findings and exits 1 | Fix each finding's `fix:` line |

## Repo tooling codes

In `ErrorCode`, raised by this repo's scripts and test tooling rather than by the library at runtime.

| Code | Where | Cause | Fix |
|---|---|---|---|
| `T3D_AMBIENT_RANDOM` | Test preload (`scripts/test-setup.ts`) | Code under test called `Math.random` | Use `ctx.rng` or `createRng(seed)` |
| `T3D_RELEASE` | `scripts/release.ts` | Bad version string, missing `## [Unreleased]`, or tree not stamped at the version | The printed `fix:` (usually `bun run release <x.y.z>`) |
| `T3D_BENCH` | `scripts/bench.ts --write` | `README.md` has no bench block | The printed `fix:`; the markers are `<!-- bench:start -->` / `<!-- bench:end -->` on their own lines |

Guards (`boundaries`, `determinism`, `filesize`, `recipes`) print `file:line`, message and `fix:` without a code.

## QA findings are not errors

A gate returns `Finding { gate, part?, message, fix }`. Findings don't throw; `t3d build` prints them all and exits 1. Gate list: [06-qa](../idea/06-qa.md).

## Adding a code

1. Add it to `ErrorCode` in `src/core/errors.ts`. `T3D_` + area + problem, upper snake case.
2. Throw `new Ts23dError(code, { cause, fix })`. `cause` names the offending value; `fix` is an action, ideally a literal snippet.
3. Add a row here in the same PR.
4. Never rename or reuse a code. Retire by leaving it in the union, documented as unused.
