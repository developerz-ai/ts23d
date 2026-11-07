// The headless-Chrome side of the site screenshots: launch Chrome (software GL, so it runs on CI
// runners without a GPU) and a minimal DevTools-protocol client over its WebSocket.

import { join } from 'node:path';

export type Json = Record<string, unknown>;

export class Cdp {
  private id = 0;
  private readonly waiting = new Map<number, (r: Json) => void>();
  constructor(
    private readonly ws: WebSocket,
    readonly logs: string[],
  ) {
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(String(e.data)) as Json;
      const done = typeof msg['id'] === 'number' ? this.waiting.get(msg['id']) : undefined;
      if (done) done(msg);
      if (msg['method'] === 'Runtime.consoleAPICalled') {
        const p = msg['params'] as {
          type: string;
          args: { value?: unknown; description?: string }[];
        };
        logs.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
      }
    });
  }

  static async open(url: string, logs: string[]): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise((ok, fail) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', fail, { once: true });
    });
    return new Cdp(ws, logs);
  }

  send(method: string, params: Json = {}, sessionId?: string): Promise<Json> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) =>
      this.waiting.set(id, (r) => {
        this.waiting.delete(id);
        if (r['error']) reject(new Error(`${method}: ${JSON.stringify(r['error'])}`));
        else resolve((r['result'] as Json) ?? {});
      }),
    );
  }

  close(): void {
    this.ws.close();
  }
}

export async function chrome(): Promise<{ proc: ReturnType<typeof Bun.spawn>; ws: string }> {
  const bin = ['google-chrome', 'chromium', 'chromium-browser'].find((b) => Bun.which(b));
  if (!bin) throw new Error('no Chrome/Chromium on PATH');
  const proc = Bun.spawn(
    [
      bin,
      '--headless=new',
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      `--user-data-dir=${join(process.env['TMPDIR'] ?? '/tmp', `ts23d-shots-${process.pid}`)}`,
      'about:blank',
    ],
    { stderr: 'pipe', stdout: 'ignore' },
  );
  const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`chrome exited before DevTools came up:\n${text}`);
    text += new TextDecoder().decode(value);
    const ws = /DevTools listening on (ws:\/\/\S+)/.exec(text)?.[1];
    if (ws) return { proc, ws };
  }
}
