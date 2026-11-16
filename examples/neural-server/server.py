"""Reference t3d-neural/1 server (FastAPI). Speaks exactly what src/neural/http-adapter.ts sends:

    GET  /v1/models    -> [{ id, task, licence, weightsSha256?, vramGb? }]
    POST /v1/jobs      <- { contract: "t3d-neural/1", task, model, request, inputs: { <sha256>: base64 } }
                       -> { id }
    GET  /v1/jobs/{id} -> { status: queued|running|done|failed, error?, server,
                            position?, waiting?, outputs?: [{ mime, data: base64 }], score? }
                            (queued: `position` in line, 0 = next; `waiting`: why, e.g. "gpu busy: …")

Every input is checked against its sha256 and every input the request names must be sent. Models
are plug-ins (plugins/, registry.py); jobs run one at a time (jobs.py).

    uv run server.py --profile profiles/dummy.toml            # no GPU
    source <model venv>; python server.py --profile profiles/rtx3090.toml
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from jobs import GpuPolicy, JobQueue
from plugins.base import CONTRACT, INPUT_FIELDS, Plugin
from registry import HERE, RegistryError, discover, enable, load_profile

VERSION = "ts23d-neural-server/0.1.0"
SHA = re.compile(r"^[0-9a-f]{64}$")


def _refs(request: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for k in INPUT_FIELDS:
        v = request.get(k)
        for ref in v if isinstance(v, list) else [v] if isinstance(v, dict) else []:
            if not (isinstance(ref, dict) and isinstance(ref.get("sha256"), str) and SHA.match(ref["sha256"])):
                raise HTTPException(400, f"request.{k}: each input is {{ sha256: <64 hex>, mime }}")
            out.append(ref)
    return out


def _inputs(body: dict[str, Any], request: dict[str, Any], max_bytes: int) -> dict[str, bytes]:
    sent = body.get("inputs") or {}
    if not isinstance(sent, dict):
        raise HTTPException(400, "inputs must be { <sha256>: base64 }")
    out: dict[str, bytes] = {}
    total = 0
    for sha, b64 in sent.items():
        try:
            data = base64.b64decode(str(b64), validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(400, f"input {sha[:12]}… is not base64") from None
        if hashlib.sha256(data).hexdigest() != sha:
            raise HTTPException(400, f"input {sha[:12]}… does not match its sha256")
        total += len(data)
        if total > max_bytes:
            raise HTTPException(413, f"inputs exceed {max_bytes} bytes")
        out[sha] = data
    for ref in _refs(request):
        if ref["sha256"] not in out:
            raise HTTPException(400, f"request names input {ref['sha256'][:12]}… but inputs lacks it")
    return out


def create_app(
    plugins: dict[str, Plugin], keep: int = 32, max_input_bytes: int = 64 << 20, gpu: GpuPolicy | None = None
) -> FastAPI:
    q = JobQueue(plugins, keep=keep, gpu=gpu)
    weights = {name: p.weights_sha256() for name, p in plugins.items()}

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        q.close()

    app = FastAPI(title="t3d-neural/1 reference server", version=VERSION, lifespan=lifespan)
    app.state.queue = q

    @app.middleware("http")
    async def server_header(req: Request, call_next: Any) -> Any:
        res = await call_next(req)
        res.headers["x-t3d-server"] = VERSION
        return res

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, e: HTTPException) -> JSONResponse:
        return JSONResponse({"error": e.detail}, status_code=e.status_code)

    @app.get("/v1/models")
    def models() -> list[dict[str, Any]]:
        out = []
        for name, p in plugins.items():
            m: dict[str, Any] = {"id": name, "task": p.task, "licence": p.licence}
            if weights[name]:
                m["weightsSha256"] = weights[name]
            if p.vram_gb is not None:
                m["vramGb"] = p.vram_gb
            out.append(m)
        return out

    @app.post("/v1/jobs")
    async def submit(req: Request) -> dict[str, str]:
        raw = await req.body()
        if len(raw) > max_input_bytes * 4 // 3 + (1 << 20):
            raise HTTPException(413, f"job body exceeds the {max_input_bytes}-byte input cap")
        try:
            body = await req.json()
        except ValueError:
            raise HTTPException(400, "body is not JSON") from None
        if not isinstance(body, dict):
            raise HTTPException(400, "body must be a JSON object")
        if body.get("contract") != CONTRACT:
            raise HTTPException(400, f"contract '{body.get('contract')}' is not {CONTRACT}")
        model, task, request = body.get("model"), body.get("task"), body.get("request")
        p = plugins.get(model) if isinstance(model, str) else None
        if p is None:
            raise HTTPException(404, f"no model '{model}'; GET /v1/models lists {sorted(plugins)}")
        if task != p.task:
            raise HTTPException(400, f"model '{model}' runs '{p.task}', not '{task}'")
        if not isinstance(request, dict) or not isinstance(request.get("seed"), int):
            raise HTTPException(400, "request must be an object with an integer seed")
        inputs = _inputs(body, request, max_input_bytes)
        return {"id": q.submit(task, model, request, inputs)}

    @app.get("/v1/jobs/{jid}")
    def poll(jid: str) -> dict[str, Any]:
        s = q.get(jid)
        if s is None:
            raise HTTPException(404, f"no job '{jid}' (finished jobs are kept for the last {keep})")
        out: dict[str, Any] = {"status": s.status, "server": VERSION}
        if s.status == "queued":
            out["position"] = q.position(jid)
            if s.waiting:
                out["waiting"] = s.waiting
        if s.error:
            out["error"] = s.error
        if s.status == "done" and s.result:
            out["outputs"] = [{"mime": o.mime, "data": base64.b64encode(o.data).decode()} for o in s.result.outputs]
            if s.result.score is not None:
                out["score"] = s.result.score
        return out

    return app


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--profile", type=Path, default=HERE / "profiles" / "dummy.toml")
    ap.add_argument("--host", default=None, help="default: [server] host or 127.0.0.1")
    ap.add_argument("--port", type=int, default=None, help="default: [server] port or 8190")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        profile = load_profile(a.profile)
        plugins = enable(profile, discover())
    except RegistryError as e:
        raise SystemExit(f"t3d-neural-server: {e}") from None
    srv = profile.get("server", {})
    gpu = GpuPolicy(
        wait_s=float(srv.get("gpu_wait_s", 1800)),
        idle_release_s=float(srv.get("idle_release_s", 120)),
        margin_gb=float(srv.get("vram_margin_gb", 1.0)),
        ram_margin_gb=float(srv.get("ram_margin_gb", 4.0)),
    )
    keep, cap = int(srv.get("keep_jobs", 32)), int(srv.get("max_input_mb", 64)) << 20
    app = create_app(plugins, keep=keep, max_input_bytes=cap, gpu=gpu)
    import uvicorn

    # No access log: clients poll every second; job starts, ends and failures are logged by jobs.py.
    host, port = a.host or srv.get("host", "127.0.0.1"), a.port or int(srv.get("port", 8190))
    uvicorn.run(app, host=host, port=port, access_log=False)


if __name__ == "__main__":
    main()
