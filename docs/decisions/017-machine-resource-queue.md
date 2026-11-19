# 017 — Agents on one machine take turns through a ticket-file queue

Status: accepted
Date: 2026-11-19

## Context
Several coding agents work in this repository at once, on one machine. Each starts `t3d` builds,
path-traced heroes (8 threads each), Blender jobs and model jobs without knowing about the others.
Measured on 2026-11-18: load 31 on 16 cores, tests timing out, two Blender bakes fighting for the
same card. Agents answered with `sleep` and `pgrep` loops that matched their own command line. The
only coordination that existed was the reference model server's GPU lease
(`examples/neural-server/gpu.py`) and a per-name start/stop lock for Blender sessions; neither
limits how much computes at once.

## Decision
1. **Three classes**, machine-wide: `cpu` (weighted tokens; default capacity = cores minus a
   quarter, 12 of 16), `blender` (1) and `gpu` (1). Single-threaded commands take 1 CPU token,
   `hero --quality path` takes 8 and traces on the threads it was granted. Blender work and jobs
   sent to a model on a loopback URL take their class for as long as they compute.
2. **Ticket files, no daemon.** `$TS23D_HOME/queue/<class>/<12-digit number>.json`, claimed with
   `link(2)` (atomic, refuses an existing name). A file is deleted only while a higher number
   exists, so the top never goes down and a new ticket always sorts last. A finished ticket is
   overwritten with a released marker.
3. **Strict FIFO.** A ticket runs when the weights of the live tickets before it, plus its own, fit
   the capacity. Waiting tickets count, so a light job never jumps a waiting heavy one and an
   admitted ticket stays admitted. A request above the capacity is clamped to it and runs alone.
4. **Liveness, not cleanup.** A ticket names its host, its boot id and its processes by pid and
   kernel start time. A dead owner, a zombie, a reused pid, another boot or another host holds
   nothing; every poll re-reads that. There is no signal handler: Ctrl-C, SIGKILL and a crash all
   look the same to the next waiter. Tools a command starts are added to its ticket, so an
   orphaned Blender keeps the slot until it exits.
5. **Fail open.** Any fault in the queue itself (unwritable home, full disk) prints one warning and
   the command runs unqueued. Off entirely with `T3D_QUEUE=off` and whenever `CI` is set.
6. **Coded waits.** `T3D_QUEUE=fail` or `--no-wait` refuses a busy class with `T3D_QUEUE_BUSY`;
   a wait past `T3D_QUEUE_MAX_WAIT` (1800 s) is `T3D_QUEUE_TIMEOUT`. Both name the holder and say
   what to do. The wait line goes to stderr, so `--json` stdout stays one envelope.
7. **Grants are inherited.** An admitted grant is written to `T3D_QUEUE_TOKEN`; a child that finds
   a live ticket behind it passes through instead of queueing behind its own parent. A process
   never waits for a class below one it holds, which rules out wait cycles.
8. Capacities live in `$TS23D_HOME/queue.json`, not in `t3d.config.ts`: every checkout on the
   machine must agree.

## Alternatives considered
- **A daemon or a lock server** — why not: something else to install, start and keep alive on every
  agent's machine; the queue must work in a fresh clone with nothing running.
- **`flock` on one file per class** — why not: no order (the kernel picks the next holder), no
  weights, and nobody can see who holds it or how long the line is.
- **Backfill (let small jobs pass a waiting large one)** — why not: it starves path-traced heroes
  and the coordinator's whole-machine hold, which are the jobs that most need a turn.
- **Auto-expiring tickets** — why not: a long bake is indistinguishable from a stuck one by age;
  expiry would break exclusivity exactly for the long jobs. A stuck holder is named by the timeout
  and dropped by hand (`t3d queue clear --pid`).
- **A RAM gate** — why not: the model server already waits on VRAM and RAM inside its lease;
  `t3d queue status` reports available RAM and the lease holder instead.
- **Queue on in CI** — why not: a runner has one job, and the required check must not be able to
  fail because of the queue.

## Consequences
- One agent alone sees no change: an acquire and release costs under a millisecond when warm.
- Without `/proc` (macOS, Windows) a reused pid can hold a ticket until the timeout names it.
- Other users, containers and sandboxes have their own home or pid namespace: separate queues or
  unqueued runs, never a deadlock.
- Head-of-line blocking is accepted: a waiting 8-token hero holds back 1-token builds behind it.
- Code: `src/cli/queue/`. Commands: `t3d queue status | clear | run | hold`.

**Addendum (review of the first build).** Releasing a ticket also writes a `<seq>.released` file beside it, and readers treat a ticket with that file as released: a late write of a stale copy cannot bring a released ticket back. `t3d queue hold` takes every class whole (cpu, blender, gpu), not only the CPU tokens.
