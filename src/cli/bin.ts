#!/usr/bin/env bun
// `t3d` — compile TypeScript recipes to GLB, gate them, and shoot contact sheets. `t3d help`
// prints the commands; src/cli/args.ts holds the flags, src/cli/run.ts the output layout.

import { run } from './run.ts';

process.exitCode = await run(process.argv.slice(2));
