// A path-tracer worker thread: receives one TileJob (shared world + film), claims tiles until the
// shared counter runs out, then reports 'done' (or the error text). See parallel.ts.

import { runJob, type TileJob } from './parallel.ts';

interface Port {
  onmessage: ((e: MessageEvent<TileJob>) => void) | null;
  postMessage(m: string): void;
}

const port = globalThis as unknown as Port;

port.onmessage = (e: MessageEvent<TileJob>) => {
  try {
    runJob(e.data);
    port.postMessage('done');
  } catch (err) {
    port.postMessage(err instanceof Error ? err.message : String(err));
  }
};
