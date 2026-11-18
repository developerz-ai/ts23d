# SPDX-License-Identifier: GPL-2.0-or-later
# `session`: one long-lived Blender holding one working State, so chained work does not reload,
# clean, retopo and bake again for every look. A blocking loop on the main thread (bpy is not
# thread safe) serves a Unix socket inside the session's mode-0700 directory: one length-framed JSON
# request per connection (4-byte big-endian length), one reply. `run` executes a batch of steps with
# the same ops and gates as a program (blender.run_step); `undo` goes back one batch; a failed
# batch goes back by itself. Each batch that changes anything is preceded by a checkpoint
# (session_checkpoint.py). `kept.json` always holds the steps that produced the current state, so
# ts23d can write them as a program even after Blender has died; a committed asset comes from
# replaying that program, never from this process. After `idle` seconds without a request the
# session ends by itself: an unattended Blender must not keep gigabytes of RAM. It also ends when
# its job file disappears (another `start` took the name, or the directory was deleted), touching
# nothing there. `hello` answers the token this start was given: proof of which session is listening.

import json
import os
import resource
import socket
import struct
import time
import traceback

from tasks import blender
from tasks import session_checkpoint as checkpoint
from tasks.steps import state as st

CONTRACT = "t3d-blender-session/1"
MAX_FRAME = 64 * 1024 * 1024
PEER_SECONDS = 30.0
TICK = 5.0  # seconds between checks that this session still owns its directory


def write_json(path, value):
    """Atomically: a reader sees the old file or the whole new one."""
    with open(f"{path}.tmp", "w", encoding="utf-8") as f:
        json.dump(value, f)
    os.replace(f"{path}.tmp", path)


def read_exact(conn, size):
    data = bytearray()
    while len(data) < size:
        chunk = conn.recv(min(1 << 20, size - len(data)))
        if not chunk:
            raise ConnectionError("the client closed the connection")
        data += chunk
    return bytes(data)


def read_frame(conn):
    size = struct.unpack(">I", read_exact(conn, 4))[0]
    if size > MAX_FRAME:
        raise ValueError(f"a request of {size} bytes is over the {MAX_FRAME} limit")
    return json.loads(read_exact(conn, size).decode("utf-8"))


def send_frame(conn, value):
    data = json.dumps(value).encode("utf-8")
    conn.sendall(struct.pack(">I", len(data)) + data)


def same_user(conn):
    """The directory's mode already keeps others out; where the OS tells, the peer's uid too."""
    if not hasattr(socket, "SO_PEERCRED"):  # Linux only
        return True
    _pid, uid, _gid = struct.unpack("3i", conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
    return uid == os.getuid()


class Session:
    def __init__(self, state, work, options):
        self.state = state
        self.work = work
        self.idle = float(options["idleSeconds"])
        self.depth = int(options["undoDepth"])
        self.token = options["token"]
        self.diag = None
        self.kept = []
        self.revision = 0
        self.batch = 0
        self.saved = 0
        self.undo_stack = []  # blend paths, oldest first
        self.started = time.time()
        self.stop = False
        self.write_kept()

    def path(self, name):
        return os.path.join(self.work, name)

    def owns_directory(self):
        return os.path.exists(self.path(f"job-{self.token}.json"))

    def write_kept(self):
        write_json(self.path("kept.json"), {"contract": CONTRACT, "revision": self.revision, "steps": self.kept})

    def facts(self):
        state = self.state
        blends = [p for p in self.undo_stack if os.path.exists(p)]
        return {
            "pid": os.getpid(),
            "blender": state.report["blender"],
            "revision": self.revision,
            "batches": self.batch,
            "kept": [s["op"] for s in self.kept],
            "undo": len(self.undo_stack),
            "checkpointBytes": sum(os.path.getsize(p) for p in blends),
            "vertices": len(state.mesh.data.vertices),
            "triangles": st.triangles(state.mesh),
            "lods": len(state.lods),
            "bound": state.armature is not None,
            "baked": sorted(state.images),
            "peakMemoryMb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024,
            "idleLimitSeconds": self.idle,
            "upSeconds": round(time.time() - self.started, 1),
        }

    def take_checkpoint(self):
        self.saved += 1
        blend = self.path(f"checkpoint-{self.saved}.blend")
        t0 = time.time()
        size = checkpoint.save(self.state, blend, {"kept": self.kept, "diag": self.diag, "revision": self.revision})
        return blend, round(time.time() - t0, 3), size

    def go_back(self, blend):
        extra = checkpoint.restore(self.state, blend)
        checkpoint.drop(blend)
        self.kept, self.diag = extra["kept"], extra["diag"]

    def forget_old(self):
        while len(self.undo_stack) > self.depth:
            checkpoint.drop(self.undo_stack.pop(0))

    def run(self, request):
        if request.get("revision") != self.revision:
            return {
                "ok": False,
                "code": "stale",
                "error": f"the session is at revision {self.revision}, the batch was checked against {request.get('revision')}",
                "fix": "run it again: another client changed the session meanwhile",
            }
        steps = request["steps"]
        changes = any(s["op"] != "review" for s in steps)
        self.batch += 1
        folder = self.path(f"batch-{self.batch}")
        os.makedirs(folder, exist_ok=True)
        self.state.work = folder
        t0 = time.time()
        blend, save_seconds, size = self.take_checkpoint() if changes else (None, 0.0, 0)
        report_before = json.dumps(self.state.report)
        first = len(self.state.report["steps"])
        reviews = len(self.state.report.get("review", []))
        i = 0
        try:
            for i, step in enumerate(steps):
                write_json(self.path("activity.json"), {"batch": self.batch, "step": i, "op": step["op"]})
                self.diag = blender.run_step(self.state, i, step, self.diag)
        except (Exception, SystemExit) as e:  # noqa: BLE001 - whatever a step does, the batch rolls back
            trace = traceback.format_exc().splitlines()[-12:]
            if blend is not None:
                self.go_back(blend)
            else:
                self.state.report = json.loads(report_before)
            return {"ok": False, "code": "step", "error": str(e), "step": i, "op": steps[i]["op"], "restored": True, "trace": trace}
        finally:
            write_json(self.path("activity.json"), {"batch": None})
        if changes:
            self.kept = self.kept + [s for s in steps if s["op"] != "review"]
            self.revision += 1
            self.undo_stack.append(blend)
            self.forget_old()
            self.write_kept()
        sheets = [{**r, "file": os.path.join(folder, r["file"])} for r in self.state.report.get("review", [])[reviews:]]
        return {
            "ok": True,
            "batch": self.batch,
            "steps": self.state.report["steps"][first:],
            "reviews": sheets,
            "seconds": round(time.time() - t0, 2),
            "checkpoint": {"taken": changes, "seconds": save_seconds, "bytes": size},
            **self.facts(),
        }

    def undo(self):
        if not self.undo_stack:
            return {"ok": False, "code": "empty", "error": "there is no batch to undo", "fix": "run a batch first"}
        t0 = time.time()
        self.go_back(self.undo_stack.pop())
        self.revision += 1
        self.write_kept()
        return {"ok": True, "seconds": round(time.time() - t0, 3), **self.facts()}

    def handle(self, request):
        cmd = request.get("cmd")
        if cmd == "hello":
            return {"ok": True, "token": self.token, "pid": os.getpid()}
        if cmd == "status":
            return {"ok": True, **self.facts()}
        if cmd == "run":
            return self.run(request)
        if cmd == "undo":
            return self.undo()
        if cmd == "stop":
            self.stop = True
            return {"ok": True, "stopped": True}
        return {"ok": False, "code": "usage", "error": f"unknown command {cmd!r}", "fix": "use hello, status, run, undo or stop"}

    def answer(self, conn):
        conn.settimeout(PEER_SECONDS)
        if not same_user(conn):
            return
        try:
            request = read_frame(conn)
        except (OSError, ValueError, ConnectionError) as e:
            print(f"session: dropped a request: {e}", flush=True)
            return
        reply = self.handle(request)
        conn.settimeout(PEER_SECONDS)
        try:
            send_frame(conn, reply)
        except OSError as e:  # the client went away; the state it asked for stands
            print(f"session: could not answer: {e}", flush=True)

    def serve(self):
        path = self.path("sock")
        if os.path.exists(path):
            os.remove(path)
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        reason = "stopped"
        try:
            server.bind(path)
            os.chmod(path, 0o600)
            server.listen(8)
            write_json(self.path("ready.json"), {"contract": CONTRACT, "token": self.token, "source": self.state.report.get("source"), **self.facts()})
            last = time.monotonic()
            while not self.stop:
                if not self.owns_directory():
                    reason = "orphaned"
                    break
                left = self.idle - (time.monotonic() - last)
                if left <= 0:
                    reason = "idle"
                    break
                server.settimeout(min(left, TICK))
                try:
                    conn, _ = server.accept()
                except TimeoutError:
                    continue
                with conn:
                    self.answer(conn)
                last = time.monotonic()
        finally:
            server.close()
            if reason != "orphaned":  # an orphan's directory may already be another session's
                if os.path.exists(path):
                    os.remove(path)
                for blend in self.undo_stack:
                    checkpoint.drop(blend)
                write_json(self.path("ended.json"), {"reason": reason})
        return reason


def run(request, inputs, work):
    options = request.get("session")
    if not isinstance(options, dict):
        raise TypeError("request.session is missing: start a session with `t3d blender session start`")
    state = blender.open_state(request, inputs, work, builds=False)
    if not os.path.exists(os.path.join(work, f"job-{options['token']}.json")):  # replaced while loading
        return {"outputs": [], "stats": {"ended": "orphaned"}}
    reason = Session(state, work, options).serve()
    return {"outputs": [], "stats": {"ended": reason}}
