// Isolated wrapper fixtures with acknowledged descendants and bounded forced teardown.
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ts23d-wrappers-'));
  await mkdir(join(root, 'bin'));
  await mkdir(join(root, 'tools'));
  for (const name of ['setup', 'check', 'dev', 'stop']) {
    await writeFile(join(root, 'bin', name), await Bun.file(`bin/${name}`).text());
  }
  await writeFile(join(root, '.bun-version'), '9.8.7\n');
  const fake = join(root, 'tools', 'mise');
  await writeFile(
    fake,
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls', JSON.stringify(args) + '\\n');
if (args[0] === 'install') process.exit(Number(process.env.INSTALL_EXIT || 0));
if (args.at(-1) !== 'site:dev') process.exit(Number(process.env.RUN_EXIT || 0));
if (process.env.FAIL_START) process.exit(23);
const child = Bun.spawn([process.execPath, '-e',
  "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"],
  { stdout: 'pipe', stderr: 'ignore' });
fs.writeFileSync('spawned-pids', process.pid + ' ' + child.pid);
(async () => {
  for await (const chunk of child.stdout) {
    if (new TextDecoder().decode(chunk).includes('ready')) {
      fs.writeFileSync('server-pids', process.pid + ' ' + child.pid);
      break;
    }
  }
})();
setInterval(() => {}, 1000);
`,
  );
  await chmod(fake, 0o755);
  const processes: ReturnType<typeof Bun.spawn>[] = [];
  const run = (name: string, env: Record<string, string> = {}) => {
    const child = Bun.spawn(['bash', `bin/${name}`], {
      cwd: root,
      env: { ...process.env, PATH: `${join(root, 'tools')}:${process.env['PATH'] ?? ''}`, ...env },
      stdout: 'ignore',
      stderr: 'pipe',
    });
    processes.push(child);
    return child;
  };
  const pids = async () =>
    (await readFile(join(root, 'server-pids'), 'utf8')).split(' ').map(Number);
  return {
    root,
    run,
    pids,
    async dispose() {
      try {
        await finished(run('stop'));
      } finally {
        // Capture the group before killing its owner; never depend on stop succeeding.
        const owner = await Bun.file(join(root, 'tmp/dev-session/owner'))
          .text()
          .catch(() => '');
        const group = Number(owner.split(' ')[2]);
        if (group > 0) signal(-group);
        const spawned = await Bun.file(join(root, 'spawned-pids'))
          .text()
          .catch(() => '');
        for (const pid of spawned.split(' ').map(Number)) if (pid > 0) signal(pid);
        for (const child of processes) if (child.exitCode === null) child.kill('SIGKILL');
        try {
          await Promise.all(processes.map(finished));
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    },
  };
}

function signal(pid: number) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

export async function eventually(check: () => Promise<boolean>) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(20);
  }
  throw new Error('wrapper fixture timed out');
}

export async function finished(child: ReturnType<typeof Bun.spawn>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('wrapper did not exit')), 4500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function alive(pid: number) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z';
  } catch {
    return false;
  }
}

export async function ready(f: Awaited<ReturnType<typeof fixture>>) {
  await eventually(async () => Bun.file(join(f.root, 'server-pids')).exists());
  return f.pids();
}
