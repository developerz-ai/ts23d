"""Machine-wide model coordination (D54: two model processes on one machine -> out of memory).

Owner rule: one model loaded at a time per machine. A lease is an exclusive flock on
`$TS23D_HOME/gpu/machine.lock` (TS23D_HOME default ~/.ts23d), held while a model is resident. Every reference server and any script using `gpu_lease()` waits
in line for it, so two processes never load big models onto one card at once. The lock file holds
the holder's `pid model` so a waiter can say who it waits for. flock is released by the kernel when
the holder dies, so a crashed process never leaves the card locked.

Inside the lease, `wait_for_vram()` waits until nvidia-smi reports the plug-in's `vram_gb` + a margin
free, and `wait_for_ram()` until /proc/meminfo MemAvailable covers its `ram_gb` + 4 GB (other apps,
a desktop, game engines share the card and the RAM), instead of loading and running out of memory.
Set T3D_NVIDIA_SMI / T3D_MEMINFO to stand-ins (tests use fakes). No nvidia-smi = the VRAM check is
skipped; the lease still serialises.

Lab scripts:
    from gpu import gpu_lease
    with gpu_lease("trellis2 lab run", need_gb=23, ram_gb=20):
        run_the_model()
"""

from __future__ import annotations

import contextlib
import fcntl
import os
import shutil
import subprocess
import time
from collections.abc import Callable, Iterator
from pathlib import Path


class GpuBusy(Exception):
    """The lease or the VRAM did not come free within the timeout."""


def _smi(query: str) -> str | None:
    exe = os.environ.get("T3D_NVIDIA_SMI") or shutil.which("nvidia-smi")
    if not exe:
        return None
    r = subprocess.run(
        [exe, f"--query-gpu={query}", "--format=csv,noheader,nounits"],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if r.returncode != 0:
        raise GpuBusy(f"{exe} failed ({r.returncode}): {r.stderr.strip()[:200]}")
    return r.stdout.splitlines()[0].strip() if r.stdout.strip() else None


def free_mib() -> int | None:
    v = _smi("memory.free")
    return int(float(v)) if v else None


def lease_path() -> Path:
    home = Path(os.environ.get("TS23D_HOME", Path.home() / ".ts23d"))
    d = home / "gpu"
    d.mkdir(parents=True, exist_ok=True)
    return d / "machine.lock"


class GpuLease:
    """An exclusive, machine-wide hold: one model process loaded at a time (see module doc)."""

    def __init__(self, holder: str, path: Path | None = None) -> None:
        self.holder = holder
        self.path = path or lease_path()
        self.fd: int | None = None

    def holder_of(self) -> str:
        try:
            return self.path.read_text().strip() or "unknown"
        except OSError:
            return "unknown"

    def acquire(self, timeout_s: float, on_wait: Callable[[str], None] = lambda _: None, poll_s: float = 1.0) -> None:
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o644)
        deadline = time.monotonic() + timeout_s
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                who = self.holder_of()
                if time.monotonic() >= deadline:
                    os.close(fd)
                    raise GpuBusy(f"gpu busy for {timeout_s:g} s: held by {who}") from None
                on_wait(f"gpu busy: {who}")
                time.sleep(poll_s)
        os.ftruncate(fd, 0)
        os.pwrite(fd, f"pid {os.getpid()} {self.holder}\n".encode(), 0)
        self.fd = fd

    def release(self) -> None:
        if self.fd is None:
            return
        os.ftruncate(self.fd, 0)
        fcntl.flock(self.fd, fcntl.LOCK_UN)
        os.close(self.fd)
        self.fd = None


def wait_for_vram(
    need_gb: float | None,
    timeout_s: float,
    margin_gb: float = 1.0,
    on_wait: Callable[[str], None] = lambda _: None,
    poll_s: float = 2.0,
) -> None:
    """Return once `need_gb + margin_gb` is free on the card; GpuBusy after `timeout_s`."""
    if not need_gb:
        return
    want = int((need_gb + margin_gb) * 1024)
    deadline = time.monotonic() + timeout_s
    while (free := free_mib()) is not None and free < want:
        msg = f"gpu memory: {free} MiB free, {want} MiB needed ({need_gb} GB + {margin_gb} GB margin)"
        if time.monotonic() >= deadline:
            raise GpuBusy(f"{msg} after {timeout_s:g} s: close other GPU apps or lower the plug-in's load")
        on_wait(msg)
        time.sleep(poll_s)


def available_ram_mib() -> int | None:
    path = os.environ.get("T3D_MEMINFO", "/proc/meminfo")
    try:
        for line in Path(path).read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    except OSError:
        return None
    return None


def wait_for_ram(
    need_gb: float | None,
    timeout_s: float,
    margin_gb: float = 4.0,
    on_wait: Callable[[str], None] = lambda _: None,
    poll_s: float = 2.0,
) -> None:
    """Return once MemAvailable covers `need_gb + margin_gb`; GpuBusy after `timeout_s`."""
    if not need_gb:
        return
    want = int((need_gb + margin_gb) * 1024)
    deadline = time.monotonic() + timeout_s
    while (free := available_ram_mib()) is not None and free < want:
        msg = f"system memory: {free} MiB available, {want} MiB needed ({need_gb} GB + {margin_gb} GB margin)"
        if time.monotonic() >= deadline:
            raise GpuBusy(f"{msg} after {timeout_s:g} s: close other apps or lower the plug-in's load")
        on_wait(msg)
        time.sleep(poll_s)


@contextlib.contextmanager
def gpu_lease(
    holder: str,
    need_gb: float | None = None,
    timeout_s: float = 1800,
    on_wait: Callable[[str], None] = print,
    ram_gb: float | None = None,
) -> Iterator[GpuLease]:
    """Hold the machine lease (and wait for `need_gb` VRAM, `ram_gb` RAM free) for the block."""
    lease = GpuLease(holder)
    lease.acquire(timeout_s, on_wait)
    try:
        wait_for_vram(need_gb, timeout_s, on_wait=on_wait)
        wait_for_ram(ram_gb, timeout_s, on_wait=on_wait)
        yield lease
    finally:
        lease.release()
