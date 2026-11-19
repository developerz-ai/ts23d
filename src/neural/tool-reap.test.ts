// Ctrl-C on t3d also ends the tools it started (tool-reap.ts): nodeExec spawns each tool in its own
// process group, so without the handler a SIGINT/SIGTERM left them running. A child Bun process
// starts a harmless `sleep` through nodeExec; we signal it and check both are gone.

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const spawnLib = join(import.meta.dir, 'tool-spawn.ts');
const SCRIPT = `import { nodeExec } from ${JSON.stringify(spawnLib)};
void nodeExec('sleep', ['30'], { timeoutMs: 60_000, maxBytes: 1024 });
setTimeout(() => {
  const { execSync } = require('node:child_process');
  console.log(execSync('pgrep -P ' + process.pid + ' -x sleep').toString().trim());
}, 200);
setInterval(() => {}, 1000);
`;

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 40 && alive(pid); i++) await Bun.sleep(50);
  return !alive(pid);
}

describe.skipIf(process.platform === 'win32')('nodeExec children and signals', () => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    it(`${signal} kills the running tool's process group, then t3d dies of ${signal}`, async () => {
      const proc = Bun.spawn([process.execPath, '-e', SCRIPT], {
        stdout: 'pipe',
        stderr: 'inherit',
      });
      const reader = proc.stdout.getReader();
      const first = await reader.read();
      const pid = Number(new TextDecoder().decode(first.value).trim());
      expect(Number.isInteger(pid) && pid > 0).toBe(true);
      try {
        expect(alive(pid)).toBe(true);
        proc.kill(signal);
        await proc.exited;
        expect(proc.signalCode).toBe(signal);
        expect(await gone(pid)).toBe(true);
      } finally {
        if (alive(pid)) process.kill(pid, 'SIGKILL');
        proc.kill('SIGKILL');
      }
    });
});
