#!/usr/bin/env bun
// `t3d` — compile TypeScript recipes to GLB, gate them, and shoot contact sheets. Requires Bun (the
// library runs under Node; this binary does not). `t3d --help` prints the commands; args.ts holds
// the flags, run.ts the output layout. Exit 0 ok · 1 QA findings or a coded error · 2 usage.

import { run } from './run.ts';

process.exitCode = await run(process.argv.slice(2));
