// Where the GPL Blender scripts live and how Blender is told to run them. `examples/blender` sits in
// the repository, not in the npm package, so an installed ts23d has no default to fall back on: a
// missing directory says so and names the ways to point at a checkout. Also the argument list that
// runs the dispatcher (ts23d_job.py). The library never imports the scripts: it spawns them.

import { failed } from './wire.ts';

/** How to get the scripts: they stay out of the npm package (GPL, separate from the MIT library). */
export const BLENDER_SCRIPTS_FIX =
  'the GPL Blender scripts are not in the npm package: clone https://github.com/developerz-ai/ts23d and pass --scripts <clone>/examples/blender or set T3D_BLENDER_SCRIPTS (CLI), or scriptsDir in blenderAdapter()';

/**
 * Arguments that run the dispatcher `entry` on `jobJson` (also used by scripts/vdm-from-blender).
 * `threads` is Blender's `-t` (0 = every core); the job repeats it for the bpy module.
 */
export function blenderJobArgs(
  mode: 'blender' | 'bpy',
  entry: string,
  jobJson: string,
  threads = 1,
): string[] {
  if (mode === 'bpy') return ['-I', entry, '--', jobJson];
  return [
    '-b',
    '--factory-startup',
    '-noaudio',
    '-t',
    String(threads),
    '--python-exit-code',
    '3',
    '--python',
    entry,
    '--',
    jobJson,
  ];
}

/** examples/blender of this package (ts23d_job.py + tasks/); absent in an npm install. */
export async function defaultScripts(): Promise<string> {
  const { fileURLToPath } = await import('node:url');
  return fileURLToPath(new URL('../../examples/blender/', import.meta.url));
}

/** The scripts directory to use, absolute (Blender runs elsewhere); refuses one without ts23d_job.py. */
export async function blenderScriptsDir(given?: string): Promise<string> {
  const { access } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const dir = resolve(given ?? (await defaultScripts()));
  const found = await access(`${dir}/ts23d_job.py`).then(
    () => true,
    () => false,
  );
  if (!found)
    failed(
      `the Blender scripts are not at ${dir} (no ts23d_job.py)`,
      given === undefined
        ? BLENDER_SCRIPTS_FIX
        : 'point it at a directory holding ts23d_job.py and tasks/: examples/blender of a ts23d checkout',
    );
  return dir;
}
