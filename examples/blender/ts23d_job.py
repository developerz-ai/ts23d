# SPDX-License-Identifier: GPL-2.0-or-later
# ts23d tool-task dispatcher for Blender (t3d-blender/1). Runs inside Blender
# (`blender -b --factory-startup -noaudio -t 1 --python-exit-code 3 --python ts23d_job.py -- job.json`)
# or under a Python with `pip install bpy` (`python -I ts23d_job.py -- job.json`): reads job.json
# ({ contract, task, request, inputs: { sha256: file } }), runs tasks/<task>.py, and writes
# report.json LAST: { ok, blender, task, outputs: [{ file, mime }], stats } or { ok: false, error }.
# An exception is re-raised after the report so Blender's --python-exit-code fires.
# Published GPL-compatible because it calls bpy (Blender licence); ts23d never imports it.

import importlib
import json
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

TASKS = {"cloth", "rig", "fracture", "groom", "vdm_extract"}


def job_path(argv):
    if "--" not in argv:
        raise SystemExit("usage: ts23d_job.py -- job.json")
    rest = argv[argv.index("--") + 1 :]
    if not rest:
        raise SystemExit("usage: ts23d_job.py -- job.json")
    return os.path.abspath(rest[0])


def main():
    import bpy

    path = job_path(sys.argv)
    work = os.path.dirname(path)
    report = {"ok": False, "blender": bpy.app.version_string, "task": None}
    try:
        with open(path, encoding="utf-8") as f:
            job = json.load(f)
        if job.get("contract") != "t3d-blender/1":
            raise ValueError(f"contract {job.get('contract')!r} is not t3d-blender/1")
        task = job.get("task")
        report["task"] = task
        if task not in TASKS:
            raise ValueError(f"unknown task {task!r}; known: {sorted(TASKS)}")
        from tasks import common

        common.reset_scene()
        inputs = {sha: os.path.join(work, name) for sha, name in job.get("inputs", {}).items()}
        module = importlib.import_module(f"tasks.{task}")
        result = module.run(job.get("request", {}), inputs, work)
        report.update(ok=True, outputs=result["outputs"], stats=result.get("stats", {}))
    except Exception as e:  # report first, then fail the process
        report["error"] = f"{type(e).__name__}: {e}"
        report["trace"] = traceback.format_exc().splitlines()[-12:]
        write_report(work, report)
        raise
    write_report(work, report)


def write_report(work, report):
    with open(os.path.join(work, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, sort_keys=True)


if __name__ == "__main__":
    main()
