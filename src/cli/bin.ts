#!/usr/bin/env bun
// `t3d` — compile TypeScript recipes to GLB, gate them, and shoot contact sheets.
//   t3d build <recipe.ts…> [--out dir] [--json]   GLB × 3 LODs + QA (exit 1 on a finding)
//   t3d shot  <recipe.ts…> [--out dir] [--json]   one PNG, six views, metre grid
//   t3d list  <recipe.ts…> [--json]               the assets each module exports
// Every error prints its code + fix; --json prints machine-readable results.

import { run } from './run.ts';

process.exitCode = await run(process.argv.slice(2));
