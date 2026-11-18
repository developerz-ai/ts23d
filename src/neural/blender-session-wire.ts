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

/** Reassembles one frame from socket chunks: its body is one buffer, filled once. */
export class FrameReader {
  private readonly head = new Uint8Array(4);
  private body: Uint8Array | undefined;
  private filled = 0;

  /** The decoded frame once `chunk` completes it, else undefined. */
  push(chunk: Uint8Array): unknown {
    let at = 0;
    if (this.body === undefined) {
      at = Math.min(4 - this.filled, chunk.length);
      this.head.set(chunk.subarray(0, at), this.filled);
      this.filled += at;
      if (this.filled < 4) return undefined;
      const size = new DataView(this.head.buffer).getUint32(0);
      if (size > MAX_FRAME)
        failed(`a session frame of ${size} bytes is over the limit`, 'send a smaller batch');
      this.body = new Uint8Array(size);
      this.filled = 0;
    }
    const part = chunk.subarray(at, at + this.body.length - this.filled);
    this.body.set(part, this.filled);
    this.filled += part.length;
    if (this.filled < this.body.length) return undefined;
    try {
      return JSON.parse(new TextDecoder().decode(this.body));
    } catch {
      return failed('a session frame is not JSON', 'stop the session and start it again');
    }
  }
}

/** The frame at the start of `bytes`, or undefined while it is incomplete. */
export const decodeFrame = (bytes: Uint8Array): unknown => new FrameReader().push(bytes);

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
    const reader = new FrameReader();
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
      try {
        const reply = reader.push(chunk);
        if (reply !== undefined) finish(() => resolve(reply as SessionReply));
      } catch (e) {
        finish(() => reject(e)); // thrown here it would escape the request, uncaught
      }
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

/** Sessions root, absolute (Blender runs in another directory): on disk, per user. */
export async function sessionsRoot(root?: string): Promise<string> {
  const { resolve } = await import('node:path');
  if (root !== undefined) return resolve(root);
  const { homedir } = await import('node:os');
  const cache = process.env['XDG_CACHE_HOME'] || `${homedir()}/.cache`;
  return resolve(cache, 't3d/blender-sessions');
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
