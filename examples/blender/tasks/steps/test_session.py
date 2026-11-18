# SPDX-License-Identifier: GPL-2.0-or-later
# Self-test cases for the Blender session (run by test_steps.py's `selftest`): a batch behaves like
# the same steps in a program, a failed batch and `undo` put the scene, the baked pixels and the
# State back, the socket speaks framed JSON, an idle session ends itself, and the kept steps replay
# as a normal program to the same result.

import hashlib
import json
import os
import shutil
import socket
import struct
import tempfile
import threading

import bpy
import numpy as np

from tasks import blender, common, session
from tasks.steps import state as st
from tasks.steps.test_steps import (
    EXPORT,
    ROOT,
    SKELETON,
    UV,
    bake,
    blob,
    expect,
    retopo,
    run,
)

BIND = {"op": "bind", "from": "skeleton", "maxInfluences": 4}
BREAK = {"op": "script", "python": "for v in obj.data.vertices:\n    v.co.z += 0.5\nraise RuntimeError('on purpose')", "why": "fail"}
LIFT = {"op": "script", "python": "for v in obj.data.vertices:\n    v.co.z += 0.001", "why": "lift"}
OPTIONS = {"idleSeconds": 60, "undoDepth": 3}


def opened(mesh, skeleton=None, options=OPTIONS):
    """A session's request, with its files in a new work directory."""
    work = tempfile.mkdtemp(prefix="session-", dir=ROOT)
    path = os.path.join(work, "src.glb")
    with open(path, "wb") as f:
        f.write(mesh)
    request = {"mesh": {"sha256": "mesh", "mime": "x"}, "session": options}
    inputs = {"mesh": path}
    if skeleton is not None:
        inputs["skeleton"] = os.path.join(work, "skeleton.json")
        with open(inputs["skeleton"], "w", encoding="utf-8") as f:
            json.dump(skeleton, f)
        request["skeleton"] = {"sha256": "skeleton", "mime": "x"}
    return request, inputs, work


def started(mesh, skeleton=None):
    common.reset_scene()
    request, inputs, work = opened(mesh, skeleton)
    return session.Session(blender.open_state(request, inputs, work, builds=False), work, OPTIONS)


def batch(s, steps):
    return s.run({"revision": s.revision, "steps": steps})


def pixels_hash(img):
    px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return hashlib.sha256((px * 255).round().astype(np.uint8).tobytes()).hexdigest()


def same_facts(a, b, skip=("seconds",)):
    return {k: v for k, v in a.items() if k not in skip} == {k: v for k, v in b.items() if k not in skip}


def case_session_batches():
    s = started(blob("texture"), SKELETON)
    source = len(s.state.mesh.data.vertices)
    r = batch(s, [retopo(3000), UV])
    expect(r["ok"] and r["kept"] == ["retopo", "uv"] and r["checkpoint"]["taken"] and r["triangles"] <= 3000, f"a batch runs: {r['kept']}, {r['triangles']} triangles, checkpoint {r['checkpoint']['seconds']} s")
    baked = batch(s, [bake("albedo", "normal")])
    expect(baked["ok"] and baked["baked"] == ["albedo", "normal"], "a second batch continues from the first")
    before = {k: pixels_hash(i) for k, i in s.state.images.items()}
    verts = st.coords(s.state.mesh).copy()
    stale = s.run({"revision": s.revision - 1, "steps": [LIFT]})
    expect(not stale["ok"] and stale["code"] == "stale", "a batch checked against an old revision is refused")
    failed = batch(s, [LIFT, BREAK])
    expect(not failed["ok"] and failed["step"] == 1 and failed["op"] == "script" and failed["restored"] and "on purpose" in failed["error"], f"a failed batch names its step: {failed['error'][:60]}")
    expect(np.array_equal(verts, st.coords(s.state.mesh)), "the failed batch's vertex moves are gone")
    expect({k: pixels_hash(i) for k, i in s.state.images.items()} == before, "the baked pixels survived the restore")
    expect(s.facts()["kept"] == ["retopo", "uv", "bake"] and len(s.state.report["steps"]) == 3, "kept steps and report are back")
    again = batch(s, [BIND])
    expect(again["ok"] and again["bound"], "work continues after a failure")
    undone = s.undo()
    expect(undone["ok"] and undone["kept"] == ["retopo", "uv", "bake"] and not undone["bound"], "undo takes the bind back")
    expect(s.state.armature is None and {k: pixels_hash(i) for k, i in s.state.images.items()} == before, "undo restores the State")
    s.undo()
    s.undo()
    expect(s.facts()["kept"] == [] and len(s.state.mesh.data.vertices) == source, "undo reaches the loaded source")
    empty = s.undo()
    expect(not empty["ok"] and empty["code"] == "empty", "nothing left to undo is an error")
    first = baked["steps"][0]
    redo = batch(s, [retopo(3000), UV])
    rebake = batch(s, [bake("albedo", "normal")])
    expect(redo["ok"] and same_facts(rebake["steps"][0], first), f"after undo the same steps give the same facts (hit rate {first['hitRate']})")


def case_session_replay():
    s = started(blob("texture"), SKELETON)
    stroke = {"op": "stroke", "brush": "inflate", "path": [[0.0, 0.3, 0.5]], "radius": 0.2, "strength": 0.01, "spacing": 0.2}
    for steps in ([stroke, retopo(2500)], [UV], [bake("albedo")], [BIND], [{"op": "lods", "triangles": [900, 300]}]):
        r = batch(s, steps)
        expect(r["ok"], f"batch {[x['op'] for x in steps]}")
    held = s.state.report["steps"]
    with open(s.path("kept.json"), encoding="utf-8") as f:
        kept = json.load(f)
    expect(kept["revision"] == 5 and [x["op"] for x in kept["steps"]] == [x["op"] for x in held], "kept.json holds the program")
    replayed, _ = run([*kept["steps"], EXPORT], blob("texture"), SKELETON)
    for a, b in zip(held, replayed["steps"]):
        expect(a["op"] == b["op"] and a["triangles"] == b["triangles"] and same_facts(a, b), f"replay of {a['op']}: {a['triangles']} triangles, facts equal")


def request_of(path, value):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as c:
        c.settimeout(20)
        c.connect(path)
        data = json.dumps(value).encode()
        c.sendall(struct.pack(">I", len(data)) + data)
        size = struct.unpack(">I", session.read_exact(c, 4))[0]
        return json.loads(session.read_exact(c, size))


def case_session_socket():
    common.reset_scene()
    request, inputs, work = opened(blob("none"))
    # A short path: the temp root can exceed what a Unix socket address may hold.
    short = tempfile.mkdtemp(prefix="t3d-s-")
    moved = os.path.join(short, "w")
    shutil.move(work, moved)
    inputs["mesh"] = os.path.join(moved, "src.glb")
    answers = {}

    def client():
        sock = os.path.join(moved, "sock")
        for _ in range(600):
            if os.path.exists(os.path.join(moved, "ready.json")):
                break
            threading.Event().wait(0.05)
        answers["mode"] = os.stat(sock).st_mode & 0o777
        answers["status"] = request_of(sock, {"cmd": "status"})
        answers["bad"] = request_of(sock, {"cmd": "nope"})
        answers["stop"] = request_of(sock, {"cmd": "stop"})

    thread = threading.Thread(target=client)
    thread.start()
    try:
        result = session.run(request, inputs, moved)
    finally:
        thread.join(30)
    expect(answers["mode"] == 0o600 and answers["status"]["ok"] and answers["status"]["kept"] == [], f"framed status over the socket, socket mode {oct(answers['mode'])}")
    expect(not answers["bad"]["ok"] and "unknown command" in answers["bad"]["error"], "an unknown command is answered, not fatal")
    expect(answers["stop"]["stopped"] and result["stats"]["ended"] == "stopped" and not os.path.exists(os.path.join(moved, "sock")), "stop ends the loop and removes the socket")
    shutil.rmtree(short, ignore_errors=True)


def case_session_idle():
    common.reset_scene()
    request, inputs, work = opened(blob("none"), options={"idleSeconds": 0.2, "undoDepth": 1})
    short = tempfile.mkdtemp(prefix="t3d-s-")
    moved = os.path.join(short, "w")
    shutil.move(work, moved)
    inputs["mesh"] = os.path.join(moved, "src.glb")
    result = session.run(request, inputs, moved)
    with open(os.path.join(moved, "ended.json"), encoding="utf-8") as f:
        ended = json.load(f)
    expect(result["stats"]["ended"] == "idle" and ended["reason"] == "idle" and not os.path.exists(os.path.join(moved, "sock")), "an idle session ends itself and leaves no socket")
    shutil.rmtree(short, ignore_errors=True)
    expect(bool(bpy.data.objects), "the scene is still there for whatever runs next")


CASES = (case_session_batches, case_session_replay, case_session_socket, case_session_idle)
