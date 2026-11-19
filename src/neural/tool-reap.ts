// Tools die with t3d. nodeExec (tool-spawn.ts) starts every tool in its own process group, so a
// timeout can kill the tool's children too — which also means Ctrl-C on the terminal no longer
// reaches them. This file keeps the live tool pids; on the first one it installs (once) SIGINT and
// SIGTERM handlers that SIGKILL each tool's process group, then re-raise the signal so t3d exits
// with the conventional status (130 / 143). When the host has its own handler for that signal,
// the signal is left to it. Long-lived processes started on purpose (a Blender session, a model
// server) are not tracked: they are meant to outlive the command.

const live = new Set<number>();
let installed = false;

/** SIGKILL the process group of every tracked tool (the process alone on Windows). */
function reap(): void {
  for (const pid of live)
    try {
      process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL');
    } catch {
      // Already gone between its exit and its untrack: nothing left to kill.
    }
  live.clear();
}

function install(): void {
  if (installed) return;
  installed = true;
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      reap();
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
    });
}

/** Track a running tool; call the returned function when it has exited. */
export function trackChild(pid: number): () => void {
  install();
  live.add(pid);
  return () => {
    live.delete(pid);
  };
}
