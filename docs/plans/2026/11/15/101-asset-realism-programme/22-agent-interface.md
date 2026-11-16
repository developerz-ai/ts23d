# 22 — ts23d for agents: MCP server, shipped skills, one loop (cli tier 5)

Rule: the user of ts23d is a coding agent. It writes a recipe and calls build / look / review / critique; which tools, models or caches filled a piece is invisible config. Every result is machine-readable, and every image comes back where the agent can see it.

## Files
| Path | State | Why |
|---|---|---|
| `src/cli/mcp/server.ts` + `.test.ts` | new | `t3d mcp` — a stdio MCP server (zero deps: JSON-RPC over stdin/stdout, MCP spec pinned in a comment) exposing tools: `build` (recipe path → QA findings + manifest), `shot` / `hero` / `blueprint` / `review` (→ PNG image content blocks the agent sees inline), `critique` (calibrated + panel status), `doctor`, `neural_run` (fill caches through configured adapters), `list_recipes`, `explain_error` (code → cause/fix from errors.md) |
| `src/cli/mcp/tools.ts` + `.test.ts` | new | tool schemas (JSON Schema) + handlers delegating to the existing `run.ts` paths with `--json`; errors return `T3D_*` code + fix, never stacks |
| `src/cli/mcp/images.ts` + `.test.ts` | new | PNG → MCP image content (base64, size-capped; downscale big review packs, list paths for the rest) |
| `.claude-plugin/` (plugin manifest) + `package.json` `files` | new/changed | ship `.claude/skills/*` (author-recipe, creature-artist, character-artist, …) and an `.mcp.json` snippet so installing the package gives an agent the tools and the artist workflows |
| `llms.txt`, `README.md` "For agents" | changed | the agent loop in ten lines: write recipe → `build` → read findings → `shot`/`hero` → read PNGs → `review` → `critique` → iterate; optional tier via `doctor` |
| `docs/idea/05-agent-loop.md` | changed | MCP tools as the primary interface; CLI equivalent per tool |

## Depends on
03 (critique), 13/21 (doctor, neural run). Can start before them with the tools that exist (build, shot, hero, blueprint, review, critique, list, explain).

## Change
- Tool results are small JSON + image blocks; long text (full QA dumps) is summarised with a path to the full `--json` file.
- Deterministic: same recipe + cache → same tool results (bytes of images included).
- Security: tools only read/write inside the project root and `--out`; `neural_run` respects adapter config and never installs (setup stays an explicit CLI command).

## Tests
Failure first: unknown tool → JSON-RPC error with a fix; recipe that throws → `T3D_RECIPE_THREW` result, server stays up; image over the cap is downscaled; a full session transcript test (initialize → tools/list → build → shot) against a fixture recipe.

## Checks
`bun test src/cli/mcp` · `--only lint,typecheck,boundaries,pack` · manual: `claude mcp add ts23d -- bunx t3d mcp` in a scratch project, ask the agent to build and look at the wolf.

## Done when
An agent in a fresh project installs the package, adds the MCP server, and builds + views + critiques an asset without touching a shell.
