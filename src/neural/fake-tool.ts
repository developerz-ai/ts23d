// Test fixture for the tool adapters (not exported): a fake executable — a POSIX sh script in a
// temp dir that logs its arguments to calls.log and then runs `body` — so adapter tests spawn a
// real process without Blender, Godot, basisu or gltfpack installed.

import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FakeTool {
  readonly dir: string;
  readonly exe: string;
  /** One line of arguments per invocation. */
  calls(): string[];
  /** Replace the script body (same exe path). */
  rewrite(body: string): void;
  dispose(): void;
}

export function fakeTool(name: string, body: string): FakeTool {
  const dir = mkdtempSync(join(tmpdir(), `t3d-fake-${name}-`));
  const exe = join(dir, name);
  const log = join(dir, 'calls.log');
  const rewrite = (b: string): void => {
    writeFileSync(exe, `#!/bin/sh\necho "$*" >> '${log}'\nfor a; do last="$a"; done\n${b}\n`);
    chmodSync(exe, 0o755);
  };
  rewrite(body);
  return {
    dir,
    exe,
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []),
    rewrite,
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  };
}
