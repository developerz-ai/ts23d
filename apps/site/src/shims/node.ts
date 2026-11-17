// Browser stand-in for node:fs, node:path and node:os. The library barrel reaches a few Node-only
// corners the site never calls (the engine-profile writer's `posix`, the hosted-service adapter's
// pending-task file, the fake-tool test helper). The dev server refuses a named import from an
// externalized node module at load time, so every name those modules import resolves here and
// fails loudly if it is ever called.

const unavailable =
  (fn: string) =>
  (..._args: unknown[]): never => {
    throw new Error(`${fn} is not available in the browser build of the ts23d site`);
  };

export const existsSync = unavailable('existsSync');
export const mkdirSync = unavailable('mkdirSync');
export const readFileSync = unavailable('readFileSync');
export const renameSync = unavailable('renameSync');
export const writeFileSync = unavailable('writeFileSync');
export const chmodSync = unavailable('chmodSync');
export const mkdtempSync = unavailable('mkdtempSync');
export const rmSync = unavailable('rmSync');
export const tmpdir = unavailable('tmpdir');
export const join = unavailable('join');
export const dirname = unavailable('dirname');
export const posix = {
  normalize: unavailable('posix.normalize'),
  join: unavailable('posix.join'),
  isAbsolute: unavailable('posix.isAbsolute'),
};
