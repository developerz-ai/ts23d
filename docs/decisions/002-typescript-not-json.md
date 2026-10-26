# 002 — Recipes are TypeScript modules, not JSON

Status: accepted
Date: 2026-10-25
Supersedes: —

## Context
The predecessor pipeline used JSON recipes. They worked, then grew: repeat syntax for windows, `$ref` for shared wheels, variant tables for streets, an expression mini-language for derived sizes. Each was a worse copy of a programming-language feature, with no type checker, no editor support and a schema the agent had to learn. The authors are coding agents, and TypeScript is what they write most fluently.

## Decision
An asset is a TypeScript module exporting `defineAsset({ …, build(ctx) })`. Loops, functions, imports and types are the composition model. String mini-languages (split grammar, Whyte notation) stay as small, parsed helpers called *from* TS, where the domain notation is better than code.

## Alternatives considered
- **JSON / YAML recipes** — why not: every growth step re-invents loops, references and expressions, untyped.
- **A custom DSL with its own parser** — why not: an agent has never seen it; we'd own a language, tooling and error messages.
- **Python** — why not: a second runtime next to a TS/Bun toolchain and a browser gallery; recipes must also run in the browser.
- **Lua / sandboxed scripting** — why not: weaker typing and agent fluency, an extra interpreter.

## Consequences
- Easier: composition (`ctx.use`), shared helpers, typed options with docs on hover, the same module runs in the CLI, tests and the browser gallery.
- Harder: a recipe is code, so it can do anything code can, including breaking determinism. Mitigated by the determinism rules and a sealed `Math.random` in tests. Running untrusted recipes means running untrusted code ([SECURITY.md](../../SECURITY.md)).
- Revisit when: recipes must be authored by non-programmers in a GUI. Then emit TS from the GUI; don't add a data format.
