"""The job queue: FIFO, one worker thread, one plug-in resident at a time (a 24 GB card holds one
big model). Before a job runs on a plug-in that is not resident, the resident one is unloaded and
CUDA memory returned. A plug-in that raises fails its job (message in `error`, traceback in the
log) and is unloaded, so an out-of-memory job does not poison the next one. Outputs are checked
against the task's mimes before the job is marked done. Finished jobs are kept for `keep` jobs,
then dropped oldest first.

GPU plug-ins (`gpu = True`) also take the machine-wide lease (gpu.py: one model process per machine)
before loading and wait for their `vram_gb` (+1 GB) and `ram_gb` (+4 GB) to be free, so two servers
or a lab script never load models at once (D54). While a job waits it stays `queued` with `waiting` saying why. A resident GPU plug-in is
unloaded and the lease released after `idle_release_s` without jobs, so other processes get a turn.
"""

from __future__ import annotations

import logging
import queue
import shutil
import tempfile
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from gpu import GpuBusy, GpuLease, wait_for_ram, wait_for_vram
from plugins.base import MIMES, Job, Plugin, Result, free_cuda

log = logging.getLogger("t3d-neural")


@dataclass
class JobState:
    job: Job
    status: str = "queued"
    error: str | None = None
    result: Result | None = None
    timings: dict[str, float] = field(default_factory=dict)
    waiting: str | None = None


def check_result(task: str, model: str, r: Any) -> Result:
    if not isinstance(r, Result):
        raise TypeError(f"{model}.run returned {type(r).__name__}, not Result")
    if task != "score" and not r.outputs:
        raise ValueError(f"{model} returned no outputs")
    for i, o in enumerate(r.outputs):
        if o.mime not in MIMES[task]:
            raise ValueError(f"{model} output {i} is '{o.mime}', {task} allows {MIMES[task]}")
        if not o.data:
            raise ValueError(f"{model} output {i} is empty")
    if task == "score" and not (r.score is not None and 0 <= r.score <= 10):
        raise ValueError(f"{model} score {r.score} is outside 0..10")
    return r


@dataclass(frozen=True)
class GpuPolicy:
    """How long to wait for the GPU lease / free VRAM, and when an idle model gives the card back."""

    wait_s: float = 1800
    idle_release_s: float = 120
    margin_gb: float = 1.0
    ram_margin_gb: float = 4.0


class JobQueue:
    def __init__(
        self,
        plugins: dict[str, Plugin],
        keep: int = 32,
        workroot: Path | None = None,
        gpu: GpuPolicy | None = None,
    ):
        self.plugins = plugins
        self.keep = keep
        self.gpu = gpu or GpuPolicy()
        self.lease: GpuLease | None = None
        self.workroot = workroot or Path(tempfile.mkdtemp(prefix="t3d-neural-"))
        self.jobs: OrderedDict[str, JobState] = OrderedDict()
        self.lock = threading.Lock()
        self.todo: queue.Queue[str | None] = queue.Queue()
        self.resident: Plugin | None = None
        self.worker = threading.Thread(target=self._loop, name="t3d-neural-worker", daemon=True)
        self.worker.start()

    def submit(self, task: str, model: str, request: dict[str, Any], inputs: dict[str, bytes]) -> str:
        jid = uuid.uuid4().hex
        workdir = self.workroot / jid
        workdir.mkdir(parents=True)
        state = JobState(Job(jid, task, model, request, inputs, workdir))
        state.timings["submitted"] = time.time()
        with self.lock:
            self.jobs[jid] = state
        self.todo.put(jid)
        return jid

    def get(self, jid: str) -> JobState | None:
        with self.lock:
            return self.jobs.get(jid)

    def position(self, jid: str) -> int | None:
        """Place in line among queued jobs (0 = next), or None when not queued."""
        with self.lock:
            line = [k for k, s in self.jobs.items() if s.status == "queued"]
        return line.index(jid) if jid in line else None

    def close(self) -> None:
        self.todo.put(None)
        self.worker.join(timeout=30)
        self._unload()

    def _unload(self) -> None:
        if self.resident is not None:
            log.info("unload %s", self.resident.name)
            self.resident.unload()
            self.resident = None
            free_cuda()
        if self.lease is not None:
            self.lease.release()
            self.lease = None

    def _make_resident(self, p: Plugin, state: JobState) -> None:
        if self.resident is p and p.resident:
            return
        self._unload()
        if p.gpu:

            def wait(msg: str) -> None:
                state.waiting = msg

            lease = GpuLease(f"{p.name} (t3d-neural-server)")
            lease.acquire(self.gpu.wait_s, wait)
            self.lease = lease
            wait_for_vram(p.vram_gb, self.gpu.wait_s, self.gpu.margin_gb, wait)
            wait_for_ram(p.ram_gb, self.gpu.wait_s, self.gpu.ram_margin_gb, wait)
            state.waiting = None
        log.info("load %s", p.name)
        p.load()
        self.resident = p

    def _loop(self) -> None:
        while True:
            try:
                jid = self.todo.get(timeout=self.gpu.idle_release_s)
            except queue.Empty:
                if self.lease is not None:  # idle: give the card to other processes
                    self._unload()
                continue
            if jid is None:
                return
            state = self.get(jid)
            if state is None:
                continue
            self._run(state)
            self._evict()

    def _run(self, state: JobState) -> None:
        job = state.job
        plugin = self.plugins[job.model]
        log.info("job %s %s started", job.id, job.model)
        t0 = time.time()
        try:
            self._make_resident(plugin, state)  # stays `queued` while it waits for the GPU
            state.status = "running"
            t1 = time.time()
            result = check_result(job.task, job.model, plugin.run(job))
            state.timings.update(load_s=t1 - t0, run_s=time.time() - t1)
            state.result = result
            state.status = "done"
            log.info("job %s %s done in %.1f s (load %.1f s)", job.id, job.model, time.time() - t0, t1 - t0)
        except GpuBusy as e:
            log.warning("job %s %s: %s", job.id, job.model, e)
            state.error = f"{e}; raise [server] gpu_wait_s or free the GPU"
            state.status = "failed"
            self._unload()
        except Exception as e:  # a model's failure is the job's failure, never the server's
            log.exception("job %s %s failed", job.id, job.model)
            state.error = f"{type(e).__name__}: {e}"
            state.status = "failed"
            self._unload()
        finally:
            state.waiting = None
            shutil.rmtree(job.workdir, ignore_errors=True)

    def _evict(self) -> None:
        with self.lock:
            done = [k for k, s in self.jobs.items() if s.status in ("done", "failed")]
            for k in done[: max(0, len(done) - self.keep)]:
                del self.jobs[k]
