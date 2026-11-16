"""D54: two model processes on one machine -> out of memory. Two servers in one test process share a
fake GPU (fake nvidia-smi, a temp TS23D_HOME): the second waits in line, then runs; low free VRAM
makes a job wait instead of loading; a lease that never frees fails the job with a clear message."""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from gpu import GpuBusy, GpuLease, gpu_lease, lease_path
from jobs import GpuPolicy
from plugins.base import Job, Output, Plugin, Result
from server import create_app


class FakeGpuModel(Plugin):
    name = "fake-gpu"
    task = "image"
    licence = "MIT (test)"
    vram_gb = 2.0
    ram_gb = 3.0
    gpu = True

    def run(self, job: Job) -> Result:
        from plugins.dummy import solid_png

        return Result([Output("image/png", solid_png(2, 2, (1, 2, 3)))])


@pytest.fixture()
def fake_gpu(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A fake nvidia-smi answering a fixed uuid and the free MiB written in `free.txt`."""
    free = tmp_path / "free.txt"
    free.write_text("20000")
    smi = tmp_path / "nvidia-smi"
    smi.write_text(f'#!/bin/sh\ncase "$1" in *uuid*) echo GPU-test-0000;; *memory.free*) cat {free};; esac\n')
    smi.chmod(0o755)
    meminfo = tmp_path / "meminfo"
    meminfo.write_text("MemTotal:       65000000 kB\nMemAvailable:   40000000 kB\n")
    monkeypatch.setenv("T3D_MEMINFO", str(meminfo))
    monkeypatch.setenv("T3D_NVIDIA_SMI", str(smi))
    monkeypatch.setenv("TS23D_HOME", str(tmp_path / "home"))
    return free


def submit(c: TestClient) -> str:
    req = {"seed": 1, "prompt": "x", "width": 2, "height": 2}
    body = {"contract": "t3d-neural/1", "task": "image", "model": "fake-gpu", "request": req, "inputs": {}}
    return c.post("/v1/jobs", json=body).json()["id"]


def poll_until(c: TestClient, jid: str, cond, tries: int = 300) -> dict:
    for _ in range(tries):
        s = c.get(f"/v1/jobs/{jid}").json()
        if cond(s):
            return s
        time.sleep(0.02)
    raise AssertionError(f"job {jid}: condition never met; last {s}")


def app(wait_s: float = 30, idle_s: float = 0.3) -> TestClient:
    plugins = {"fake-gpu": FakeGpuModel()}
    return TestClient(create_app(plugins, gpu=GpuPolicy(wait_s=wait_s, idle_release_s=idle_s, margin_gb=1.0)))


def test_second_server_waits_in_line_then_runs(fake_gpu: Path) -> None:
    with app(idle_s=0.5) as a, app() as b:
        assert poll_until(a, submit(a), lambda s: s["status"] == "done")["status"] == "done"
        # a keeps its model resident (and the lease) until idle; b must wait, not load beside it
        jb = submit(b)
        s = poll_until(b, jb, lambda s: "waiting" in s)
        assert s["status"] == "queued" and s["position"] == 0
        assert s["waiting"].startswith("gpu busy: pid ") and "fake-gpu" in s["waiting"]
        assert poll_until(b, jb, lambda s: s["status"] in ("done", "failed"))["status"] == "done"


def test_low_free_vram_waits_instead_of_loading(fake_gpu: Path) -> None:
    fake_gpu.write_text("1500")  # 2 GB model + 1 GB margin needs 3072 MiB
    with app() as c:
        jid = submit(c)
        s = poll_until(c, jid, lambda s: "waiting" in s)
        assert s["status"] == "queued" and "1500 MiB free, 3072 MiB needed" in s["waiting"]
        fake_gpu.write_text("8000")
        assert poll_until(c, jid, lambda s: s["status"] in ("done", "failed"))["status"] == "done"


def test_low_available_ram_waits_instead_of_loading(fake_gpu: Path) -> None:
    meminfo = fake_gpu.parent / "meminfo"
    meminfo.write_text("MemAvailable:    3000000 kB\n")  # 3 GB model + 4 GB margin needs 7168 MiB
    with app() as c:
        jid = submit(c)
        s = poll_until(c, jid, lambda s: "waiting" in s)
        assert s["status"] == "queued" and "2929 MiB available, 7168 MiB needed" in s["waiting"]
        meminfo.write_text("MemAvailable:   20000000 kB\n")
        assert poll_until(c, jid, lambda s: s["status"] in ("done", "failed"))["status"] == "done"


def test_gpu_that_never_frees_fails_the_job_with_the_holder(fake_gpu: Path) -> None:
    other = GpuLease("lab script trellis2")
    other.acquire(1)
    try:
        with app(wait_s=0.5) as c:
            s = poll_until(c, submit(c), lambda s: s["status"] in ("done", "failed"))
        assert s["status"] == "failed" and "gpu busy for 0.5 s: held by pid" in s["error"]
        assert "lab script trellis2" in s["error"] and "gpu_wait_s" in s["error"]
    finally:
        other.release()


def test_gpu_lease_helper_serialises_and_frees_on_exit(fake_gpu: Path) -> None:
    with gpu_lease("first", need_gb=1, on_wait=lambda _: None):
        with pytest.raises(GpuBusy, match="held by pid .* first"):
            GpuLease("second").acquire(0.2)
        assert "first" in lease_path().read_text()
    third = GpuLease("third")
    third.acquire(0.2)  # free again after the block
    third.release()
