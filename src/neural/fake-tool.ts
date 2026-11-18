// Test fixture for the tool adapters (not exported): a fake executable — a POSIX sh script in a
// temp dir that logs its arguments to calls.log and then runs `body` — so adapter tests spawn a
// real process without Blender, Godot, basisu or gltfpack installed. `fakeBlenderSession` is such
// an executable answering a session's socket (blender-session-fake.ts runs behind it).

import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const SESSION_SERVER = fileURLToPath(new URL('./blender-session-fake.ts', import.meta.url));

/** A `blender` that reports a version and otherwise serves a session over its Unix socket. */
export const fakeBlenderSession = (): FakeTool =>
  fakeTool(
    'blender',
    `case "$*" in *--version*) echo "Blender 5.3.0"; exit 0;; esac\nexec '${process.execPath}' '${SESSION_SERVER}' "$last"`,
  );
