// The wire and the files of a Blender session (blender-session.ts, tasks/session.py): one
// length-framed JSON request per connection over a Unix socket (4-byte big-endian length), and the
// private directory the socket lives in. The directory is the access control: mode 0700, owned by
// this user, never a symlink, on disk (checkpoints are large; a tmpfs would hold them in RAM).

import { failed } from './wire.ts';

/** Largest frame either side accepts. */
export const MAX_FRAME = 64 * 1024 * 1024;
/** Linux keeps 108 bytes for a socket path, the last one a NUL. */
const MAX_SOCKET_PATH = 107;

export type SessionReply = Readonly<Record<string, unknown>> & { readonly ok: boolean };

export function encodeFrame(value: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(value));
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
}

/** The frame at the start of `bytes`, or undefined while it is incomplete. */
export function decodeFrame(bytes: Uint8Array): unknown {
  if (bytes.length < 4) return undefined;
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getUint32(0);
  if (size > MAX_FRAME)
    failed(`a session frame of ${size} bytes is over the limit`, 'send a smaller batch');
  if (bytes.length < 4 + size) return undefined;
  return JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + size)));
}

/** Why a request got no answer: nobody listens, the peer vanished, or it took too long. */
export type NoReply = 'refused' | 'closed' | 'timeout';

export class SessionUnreachable {
  constructor(readonly why: NoReply) {}
}

/** One request, one reply. Rejects with SessionUnreachable when there is no reply. */
export async function sessionRequest(
  socketPath: string,
  value: unknown,
  timeoutMs: number,
): Promise<SessionReply> {
  const { createConnection } = await import('node:net');
  return new Promise((resolve, reject) => {
    const c = createConnection({ path: socketPath });
    let got = new Uint8Array(0);
    let settled = false;
    const finish = (act: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      c.destroy();
      act();
    };
    const timer = setTimeout(
      () => finish(() => reject(new SessionUnreachable('timeout'))),
      timeoutMs,
    );
    c.on('connect', () => c.write(encodeFrame(value)));
    c.on('data', (chunk: Uint8Array) => {
      const next = new Uint8Array(got.length + chunk.length);
      next.set(got);
      next.set(chunk, got.length);
      got = next;
      const reply = decodeFrame(got);
      if (reply !== undefined) finish(() => resolve(reply as SessionReply));
    });
    c.on('error', (e: NodeJS.ErrnoException) =>
      finish(() =>
        reject(
          new SessionUnreachable(
            e.code === 'ENOENT' || e.code === 'ECONNREFUSED' ? 'refused' : 'closed',
          ),
        ),
      ),
    );
    c.on('close', () => finish(() => reject(new SessionUnreachable('closed'))));
  });
}

/** Sessions root: on disk, per user. */
export async function sessionsRoot(root?: string): Promise<string> {
  if (root !== undefined) return root;
  const { homedir } = await import('node:os');
  const cache = process.env['XDG_CACHE_HOME'] || `${homedir()}/.cache`;
  return `${cache}/t3d/blender-sessions`;
}

/** Create `dir` (mode 0700) or accept it if it is already private; anything else is refused. */
export async function privateDir(dir: string): Promise<void> {
  const { lstat, mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const s = await lstat(dir);
  const mine = process.getuid === undefined || s.uid === process.getuid();
  if (!s.isDirectory() || !mine || (s.mode & 0o077) !== 0)
    failed(
      `${dir} is not a private directory of this user (mode ${(s.mode & 0o777).toString(8)})`,
      `a session socket must not be reachable by others: chmod 700 ${dir}, or remove it`,
    );
}

/** The socket of a session directory; refuses a path too long for the kernel. */
export function socketPath(dir: string): string {
  const path = `${dir}/sock`;
  if (new TextEncoder().encode(path).length > MAX_SOCKET_PATH)
    failed(
      `the session socket path ${path} is over ${MAX_SOCKET_PATH} bytes`,
      'use a shorter --name, or set XDG_CACHE_HOME to a shorter directory',
    );
  return path;
}
