"""Shared by plug-ins that drive a model through its own documented CLI in its own environment
(UniRig, UniMate, HairDeck pin conflicting stacks: bpy, spconv, old numpy). Each such plug-in names
`repo` (the checkout) and `python` (that env's interpreter) in its profile table; the env's bin dir
goes first on PATH so the repo's shell scripts find the same `python`. Output of a failed command
is kept (last 40 lines) in the job error: the model's own words are the best fix hint.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from plugins.base import Job, Plugin, PluginError


def missing(p: Plugin, marker: str) -> str | None:
    repo, py = p.option_path("repo"), p.option_path("python")
    if repo is None or not (repo / marker).exists():
        return f"repo not found ({repo}/{marker}); set `repo` in the profile"
    if py is None or not os.access(py, os.X_OK):
        return f"python '{py}' is not an executable; set `python` to the model env's interpreter"
    return None


def run(p: Plugin, job: Job, args: list[str], timeout_s: float = 3600, env: dict[str, str] | None = None) -> str:
    repo, py = p.option_path("repo"), p.option_path("python")
    assert repo is not None and py is not None
    e = dict(os.environ, **(env or {}))
    e["PATH"] = f"{py.parent}{os.pathsep}{e.get('PATH', '')}"
    cmd = [str(py) if a == "{python}" else a for a in args]
    job.log.append(" ".join(cmd))
    try:
        r = subprocess.run(cmd, cwd=repo, env=e, capture_output=True, text=True, timeout=timeout_s, check=False)
    except subprocess.TimeoutExpired as x:
        raise PluginError(f"{p.name}: {cmd[0]} ran over {timeout_s:.0f} s") from x
    if r.returncode != 0:
        tail = "\n".join((r.stdout + r.stderr).splitlines()[-40:])
        raise PluginError(f"{p.name}: `{' '.join(cmd[:3])} …` exited {r.returncode}:\n{tail}")
    return r.stdout


def newest(d: Path, pattern: str) -> Path:
    found = sorted(d.rglob(pattern), key=lambda f: f.stat().st_mtime)
    if not found:
        raise PluginError(f"no {pattern} under {d} after the run")
    return found[-1]
