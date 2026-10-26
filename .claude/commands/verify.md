---
description: Run the gate and fix what it reports
---

Run `bun run verify` (add `--json` if you want machine-readable output; `--only <step>` to re-run one).

Fix every failure at its root, then re-run until green. Never narrow the gate, loosen a Biome rule,
drop a strict tsconfig flag, raise a budget without a measured reason, or widen a QA tolerance to get
green. Every `T3D_*` error prints a `fix:` — do that first.
