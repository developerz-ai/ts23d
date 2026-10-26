# 006 — One npm package with subpath exports

Status: accepted
Date: 2026-10-25
Supersedes: —

## Context
The library has ten modules (core, grammar, material, primitives, neural, kinds, qa, export, render, cli). Publishing them as separate packages means versioning them in lockstep, one npm OIDC trusted publisher per package, and a bootstrap publish for every new package (a package added after a release run stays unpublished until someone does it by hand). The sibling `ultimate` repo pays that tax across 31 packages.

## Decision
Publish one package, `@developerz-ai/ts23d`. Modules are subpaths: `@developerz-ai/ts23d/core`, `/grammar`, `/render`, and so on, via an `exports` wildcard. The root re-exports everything. Module boundaries are enforced inside the repo by `scripts/boundaries.ts`, not by package boundaries.

## Alternatives considered
- **A package per module (`@ts23d/core`, …)** — why not: N trusted publishers, N bootstraps, lockstep versioning machinery, for no user benefit at this size.
- **One package, root export only** — why not: no way to import one layer (e.g. `/render` in a tool) without the rest in view; worse tree-shaking story.

## Consequences
- Easier: one version, one tag, one trusted publisher, one bootstrap ([PUBLISHING.md](../../PUBLISHING.md)).
- Harder: boundaries are a repo lint, not a package graph; a consumer can import any subpath.
- Revisit when: a module needs its own release cadence or its own heavy optional dependency (e.g. a neural adapter with a native runtime).
