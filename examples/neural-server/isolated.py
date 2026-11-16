"""Process isolation for plug-ins: `load()` starts a child process that imports and loads the
plug-in, `run()` sends it the job, `unload()` ends the process. Freeing a big PyTorch pipeline
in-process does not return all of its VRAM (module globals, autotune caches, CUDA context: on an
RTX 3090 ~6 GB stayed held after unloading Pixal3D and TRELLIS.2 then ran out of memory); ending
the process always does. On by default for plug-ins that set `isolate = True`; a profile can
override per plug-in with `isolate = false|true`.
"""

from __future__ import annotations

import multiprocessing as mp
import traceback
from multiprocessing.connection import Connection
from pathlib import Path
from typing import Any

from plugins.base import Job, Plugin, PluginError, Result


def _child(path: str, cls_name: str, options: dict[str, Any], conn: Connection) -> None:
    try:
        from registry import _import

        plugin: Plugin = getattr(_import(Path(path)), cls_name)(options)
        plugin.load()
        conn.send(("ready", None))
    except Exception:  # noqa: BLE001 - sent to the parent, which fails the load with it
        conn.send(("err", traceback.format_exc(limit=8)))
        return
    while (job := conn.recv()) is not None:
        try:
            conn.send(("ok", plugin.run(job)))
        except Exception as e:  # noqa: BLE001 - sent to the parent, which fails the job with it
            conn.send(("err", f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=8)}"))
    plugin.unload()


class Isolated(Plugin):
    """Wraps a plug-in instance; same interface, the model lives in a child process."""

    def __init__(self, inner: Plugin) -> None:
        super().__init__(inner.options)
        self.inner = inner
        self.name = inner.name  # type: ignore[misc]
        self.task = inner.task  # type: ignore[misc]
        self.licence = inner.licence  # type: ignore[misc]
        self.vram_gb = inner.vram_gb  # type: ignore[misc]
        self.gpu = inner.gpu  # type: ignore[misc]
        self.ram_gb = inner.ram_gb  # type: ignore[misc]
        self.proc: Any = None
        self.conn: Connection | None = None

    def available(self) -> str | None:
        return self.inner.available()

    def weights_sha256(self) -> str | None:
        return self.inner.weights_sha256()

    def load(self) -> None:
        ctx = mp.get_context("spawn")
        parent, child = ctx.Pipe()
        cls = type(self.inner)
        path = _file(cls)
        self.proc = ctx.Process(
            target=_child, args=(path, cls.__name__, self.inner.options, child), name=f"t3d-{self.name}", daemon=True
        )
        self.proc.start()
        child.close()
        self.conn = parent
        kind, err = self._recv()
        if kind != "ready":
            self.unload()
            raise PluginError(f"{self.name} failed to load in its process:\n{err}")
        super().load()

    def run(self, job: Job) -> Result:
        if self.conn is None:
            raise PluginError(f"{self.name} is not loaded")
        self.conn.send(job)
        kind, value = self._recv()
        if kind != "ok":
            raise PluginError(str(value))
        return value

    def unload(self) -> None:
        if self.conn is not None:
            try:
                self.conn.send(None)
            except (BrokenPipeError, OSError):
                pass  # the child is already gone; joining below reaps it
            self.conn.close()
            self.conn = None
        if self.proc is not None:
            self.proc.join(timeout=60)
            if self.proc.is_alive():
                self.proc.kill()
                self.proc.join()
            self.proc = None
        super().unload()

    def _recv(self) -> tuple[str, Any]:
        assert self.conn is not None
        try:
            return self.conn.recv()
        except EOFError:
            code = None
            if self.proc is not None:
                self.proc.join(timeout=10)
                code = self.proc.exitcode
            return "err", f"{self.name} process died (exit code {code}; killed by the OOM killer?)"


def _file(cls: type) -> str:
    import sys

    mod = sys.modules[cls.__module__]
    if mod.__file__ is None:
        raise PluginError(f"{cls.__name__}: module {cls.__module__} has no file to re-import")
    return mod.__file__
