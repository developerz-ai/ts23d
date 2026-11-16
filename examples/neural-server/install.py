"""The installer `t3d setup <profile>` calls: runs one install profile (profiles/install-*.toml)
into $TS23D_HOME. Standard library only, Python >= 3.11 (tomllib); no sudo, nothing outside the
home folder except the uv cache and $HF_HOME when the user set one.

    python install.py --profile profiles/install-tools.toml --home ~/.ts23d --uv ~/.local/bin/uv [--dry-run]

Every step has a check that looks at the real state (a file, an import, a git HEAD, a cached
snapshot): a step whose check passes is skipped, so a re-run is a no-op and an interrupted run
resumes where it stopped. Machine-readable progress on stdout, one JSON object per line:

    @t3d {"event": "plan", "profile": ..., "steps": [{id, kind, title, done, optional, cmds}], "gated": [...]}
    @t3d {"event": "step", "id": ..., "status": "start" | "done" | "skip" | "fail" | "warn", "detail"?, "fix"?}
    @t3d {"event": "end", "ok": bool, "done": n, "skipped": n, "failed": [ids]}

Tool output goes to <home>/logs/setup-<profile>.log. HF_TOKEN is read by huggingface_hub from the
environment of the child process; this script never reads, prints or stores it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
import tarfile
import tomllib
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

PREFIX = "@t3d "


def emit(event: str, **kw: Any) -> None:
    print(PREFIX + json.dumps({"event": event, **kw}), flush=True)


class StepError(Exception):
    def __init__(self, detail: str, fix: str) -> None:
        super().__init__(detail)
        self.detail, self.fix = detail, fix


class Ctx:
    def __init__(self, home: Path, uv: str, profile: dict[str, Any], log: Path) -> None:
        self.home, self.uv, self.profile, self.log = home, uv, profile, log
        self.vars = {"home": str(home), "jobs": str(max(1, (os.cpu_count() or 2) - 1)), "arch": gpu_arch()}

    def x(self, s: str) -> str:
        """Expand {home} {jobs} {arch}."""
        return s.format(**self.vars)

    def path(self, s: str) -> Path:
        p = Path(self.x(s)).expanduser()
        return p if p.is_absolute() else self.home / p

    def py(self, venv: str) -> Path:
        return self.path(venv) / "bin" / "python"

    def env(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        e = dict(os.environ)
        e.setdefault("HF_HOME", str(self.home / "hf"))
        table = {**self.profile.get("env", {}), **(extra or {})}
        prepend = [self.x(p) for p in table.pop("path_prepend", [])]
        if prepend:
            e["PATH"] = os.pathsep.join([*prepend, e.get("PATH", "")])
        for k, v in table.items():
            e[k] = self.x(str(v))
        return e

    def run(self, argv: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
        with self.log.open("a") as f:
            f.write(f"\n$ {shlex.join(argv)}\n")
            f.flush()
            p = subprocess.run(
                argv,
                check=False,
                cwd=cwd,
                env=env or self.env(),
                stdout=f,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
            )
        if p.returncode != 0:
            raise StepError(
                f"`{shlex.join(argv)}` exited {p.returncode}:\n{tail(self.log)}",
                f"read {self.log}, fix the cause, rerun `t3d setup` (it resumes)",
            )


def tail(log: Path, n: int = 20) -> str:
    return "\n".join(log.read_text(errors="replace").rstrip().splitlines()[-n:])


def gpu_arch() -> str:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=compute_cap", "--format=csv,noheader"],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
        return out.stdout.split()[0] if out.returncode == 0 and out.stdout.strip() else "8.6"
    except (OSError, subprocess.TimeoutExpired):
        return "8.6"


def ok(argv: list[str], env: dict[str, str] | None = None, cwd: Path | None = None) -> str | None:
    """stdout of a command that exited 0, else None."""
    try:
        p = subprocess.run(argv, check=False, capture_output=True, text=True, env=env, cwd=cwd, timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return p.stdout if p.returncode == 0 else None


def hf_hub(env: dict[str, str]) -> Path:
    if env.get("HF_HUB_CACHE"):
        return Path(env["HF_HUB_CACHE"]).expanduser()
    return Path(env["HF_HOME"]).expanduser() / "hub"


# ---- step kinds: (cmds for the plan, done?, do) ------------------------------------------------


def cmake(c: Ctx) -> list[str]:
    return ["cmake"] if shutil.which("cmake") else [c.uv, "tool", "run", "--from", "cmake==3.31.6", "cmake"]


def argv_of(c: Ctx, a: list[str]) -> list[str]:
    out: list[str] = []
    for t in a:
        out += cmake(c) if t == "{cmake}" else [c.x(t)]
    return out


def cmds(c: Ctx, s: dict[str, Any]) -> list[list[str]]:
    k = s["kind"]
    if k == "venv":
        return [[c.uv, "venv", "--python", s["python"], str(c.path(s["path"]))]]
    if k == "pip":
        a = [c.uv, "pip", "install", "--python", str(c.py(s["venv"]))]
        a += ["--index-url", s["index_url"]] if "index_url" in s else []
        a += ["--no-build-isolation"] if s.get("no_build_isolation") else []
        a += (
            ["-r", str(c.path(s["requirements"]) if "relax" not in s else c.home / "state" / f"{s['id']}.txt")]
            if "requirements" in s
            else []
        )
        return [a + [c.x(p) for p in s.get("packages", [])]]
    if k == "download":
        return [["download", s["url"], "sha256:" + s.get("sha256", "unpinned"), "->", str(c.path(s["dest"]))]]
    if k == "git":
        d = str(c.path(s["dest"]))
        out = [["git", "clone", s["url"], d], ["git", "-C", d, "checkout", s["ref"]]]
        return out + ([["git", "-C", d, "submodule", "update", "--init", "--recursive"]] if s.get("submodules") else [])
    if k == "run":
        return [argv_of(c, a) for a in s["run"]] + (
            [["copy", s["copy"][0], str(c.path(s["copy"][1]))]] if "copy" in s else []
        )
    if k == "toolchain":
        return [["ln", "-s", f"<gcc <= {s['max_gcc']}>", str(c.path(s["dest"]) / "gcc")]]
    if k == "hf":
        code = f"from huggingface_hub import snapshot_download; snapshot_download({s['repo']!r})"
        return [[str(c.py(s["venv"])), "-c", code]]
    if k == "write":
        return [["write", str(c.path(s["dest"]))]]
    raise StepError(f"step {s['id']}: unknown kind {k!r}", "kinds: venv pip download git run toolchain hf write")


def done(c: Ctx, s: dict[str, Any]) -> bool:
    k = s["kind"]
    if "creates" in s and not c.path(s["creates"]).exists():
        return False
    if k == "venv":
        py = c.py(s["path"])
        v = ok([str(py), "-c", "import sys; print('%d.%d' % sys.version_info[:2])"]) if py.exists() else None
        return v is not None and v.strip() == s["python"]
    if k == "pip":
        py = c.py(s["venv"])
        return py.exists() and ok([str(py), "-c", s["check"]], env=c.env(s.get("env"))) is not None
    if k == "download":
        return c.path(s["dest"]).exists()
    if k == "git":
        d = c.path(s["dest"])
        head = ok(["git", "-C", str(d), "rev-parse", "HEAD"]) if (d / ".git").exists() else None
        want = ok(["git", "-C", str(d), "rev-parse", s["ref"] + "^{commit}"]) if head else None
        return head is not None and head == want
    if k == "run":
        return "creates" in s
    if k == "toolchain":
        return (c.path(s["dest"]) / "gcc").exists()
    if k == "hf":
        snaps = hf_hub(c.env()) / f"models--{s['repo'].replace('/', '--')}" / "snapshots"
        return snaps.is_dir() and any(any(p.iterdir()) for p in snaps.iterdir())
    if k == "write":
        d = c.path(s["dest"])
        return d.exists() and d.read_text() == c.x(s["text"])
    return False


def download(c: Ctx, s: dict[str, Any]) -> None:
    dest = c.path(s["dest"])
    dl = c.home / "dl" / s["id"]
    dl.mkdir(parents=True, exist_ok=True)
    part, full = dl / "file.part", dl / "file"
    if not full.exists():
        have = part.stat().st_size if part.exists() else 0
        req = urllib.request.Request(
            s["url"], headers={"User-Agent": "ts23d-setup", **({"Range": f"bytes={have}-"} if have else {})}
        )
        try:
            with (
                urllib.request.urlopen(req, timeout=60) as r,
                part.open("ab" if have and r.status == 206 else "wb") as f,
            ):
                shutil.copyfileobj(r, f, 1 << 20)
        except OSError as e:
            raise StepError(
                f"download {s['url']} failed: {e}", "check the network and rerun (the download resumes)"
            ) from e
        if "sha256" in s:
            got = hashlib.sha256(part.read_bytes()).hexdigest()
            if got != s["sha256"]:
                part.unlink()
                raise StepError(
                    f"{s['url']}: sha256 {got} != pinned {s['sha256']}",
                    "the upstream file changed: open an issue so the pin is reviewed",
                )
        part.rename(full)
    dest.parent.mkdir(parents=True, exist_ok=True)
    arch = s.get("archive", "none")
    if arch == "none":
        shutil.copyfile(full, dest)
    elif arch == "zip" and "member" in s:
        with zipfile.ZipFile(full) as z, z.open(s["member"]) as m, dest.open("wb") as f:
            shutil.copyfileobj(m, f)
    else:
        tmp = dest.with_name(dest.name + ".tmp")
        shutil.rmtree(tmp, ignore_errors=True)
        if arch == "zip":
            with zipfile.ZipFile(full) as z:
                z.extractall(tmp)
        else:
            with tarfile.open(full) as t:
                t.extractall(tmp, filter="data")
        inner = [p for p in tmp.iterdir()]
        shutil.move(str(inner[0] if len(inner) == 1 and inner[0].is_dir() else tmp), str(dest))
        shutil.rmtree(tmp, ignore_errors=True)
    if s.get("executable"):
        dest.chmod(0o755)
    shutil.rmtree(dl, ignore_errors=True)


def toolchain(c: Ctx, s: dict[str, Any]) -> None:
    dest, top = c.path(s["dest"]), int(s["max_gcc"])
    sys_major = (ok(["gcc", "-dumpversion"]) or "99").strip().split(".")[0]
    pairs = [("gcc", "g++")] if int(sys_major) <= top else [(f"gcc-{v}", f"g++-{v}") for v in range(top, 10, -1)]
    for gcc, gxx in pairs:
        a, b = shutil.which(gcc), shutil.which(gxx)
        if a and b:
            dest.mkdir(parents=True, exist_ok=True)
            for name, target in (("gcc", a), ("cc", a), ("g++", b), ("c++", b)):
                (dest / name).unlink(missing_ok=True)
                (dest / name).symlink_to(target)
            return
    raise StepError(
        f"no gcc <= {top} with g++ found (system gcc is {sys_major}); CUDA's nvcc refuses newer compilers",
        f"install gcc-{top} and g++-{top} with your package manager (the one step that needs it), then rerun",
    )


def do(c: Ctx, s: dict[str, Any]) -> None:
    k, env = s["kind"], c.env(s.get("env"))
    if k == "pip" and "relax" in s:
        req = c.path(s["requirements"]).read_text().splitlines()
        relax = s["relax"]
        out = [relax.get(line.split("=")[0].split(">")[0].split("<")[0].strip(), line) for line in req]
        (c.home / "state").mkdir(exist_ok=True)
        (c.home / "state" / f"{s['id']}.txt").write_text("\n".join(out) + "\n")
    if k == "download":
        return download(c, s)
    if k == "toolchain":
        return toolchain(c, s)
    if k == "write":
        d = c.path(s["dest"])
        d.parent.mkdir(parents=True, exist_ok=True)
        d.write_text(c.x(s["text"]))
        return None
    if k == "git":
        d = c.path(s["dest"])
        if not (d / ".git").exists():
            shutil.rmtree(d, ignore_errors=True)
            d.parent.mkdir(parents=True, exist_ok=True)
            c.run(["git", "clone", s["url"], str(d)], env=env)
        if ok(["git", "-C", str(d), "rev-parse", s["ref"] + "^{commit}"]) is None:
            c.run(["git", "-C", str(d), "fetch", "--tags", "origin"], env=env)
        c.run(["git", "-C", str(d), "-c", "advice.detachedHead=false", "checkout", s["ref"]], env=env)
        if s.get("submodules"):
            c.run(["git", "-C", str(d), "submodule", "update", "--init", "--recursive"], env=env)
        return None
    cwd = c.path(s["cwd"]) if "cwd" in s else None
    for a in cmds(c, s):
        if a[0] == "copy":
            src = (cwd or c.home) / a[1]
            Path(a[2]).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, a[2])
        else:
            c.run(a, cwd=cwd, env=env)
    if k == "hf" and not done(c, s):
        raise StepError(f"{s['repo']} downloaded nothing", "check HF_TOKEN and the licence page")
    return None


def fix_of(s: dict[str, Any], e: StepError) -> str:
    if s["kind"] == "hf" and s.get("gated") and ("401" in e.detail or "403" in e.detail or "gated" in e.detail.lower()):
        return f"accept the licence at {s['licence_url']} (logged in), then `export HF_TOKEN=…` in this shell and rerun (the token is never stored)"
    return s.get("fix", e.fix)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--profile", type=Path, required=True)
    ap.add_argument("--home", type=Path, required=True)
    ap.add_argument("--uv", default=shutil.which("uv") or "uv")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    prof = tomllib.loads(a.profile.read_text())
    name = prof["profile"]["name"]
    home = a.home.expanduser().resolve()
    log = home / "logs" / f"setup-{name}.log"
    if not a.dry_run:
        log.parent.mkdir(parents=True, exist_ok=True)
    c = Ctx(home, a.uv, prof, log)
    steps: list[dict[str, Any]] = prof["step"]
    state = {s["id"]: done(c, s) for s in steps}
    emit(
        "plan",
        profile=name,
        home=str(home),
        log=str(log),
        dry_run=a.dry_run,
        notes=prof["profile"].get("notes", []),
        steps=[
            {
                "id": s["id"],
                "kind": s["kind"],
                "title": s.get("title", s["id"]),
                "done": state[s["id"]],
                "optional": bool(s.get("optional")),
                "licence": s.get("licence"),
                "cmds": [shlex.join(x) for x in cmds(c, s)],
            }
            for s in steps
        ],
        gated=[
            *prof.get("gated", []),
            *({"repo": s["repo"], "url": s["licence_url"], "why": s.get("why", "")} for s in steps if s.get("gated")),
        ],
    )
    if a.dry_run:
        return 0
    n_done = n_skip = 0
    failed: list[str] = []
    for s in steps:
        if state[s["id"]]:
            n_skip += 1
            emit("step", id=s["id"], status="skip")
            continue
        emit("step", id=s["id"], status="start", title=s.get("title", s["id"]))
        try:
            do(c, s)
            if s["kind"] in ("pip", "venv", "run") and not done(c, s):
                raise StepError(f"{s['id']}: ran but its check still fails", f"read {log}")
        except StepError as e:
            emit("step", id=s["id"], status="warn" if s.get("optional") else "fail", detail=e.detail, fix=fix_of(s, e))
            if not s.get("optional"):
                failed.append(s["id"])
                break
            continue
        n_done += 1
        emit("step", id=s["id"], status="done")
    emit("end", ok=not failed, done=n_done, skipped=n_skip, failed=failed)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
