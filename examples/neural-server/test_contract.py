"""Contract test of the reference server against the dummy plug-ins (no GPU). Mirrors what
src/neural/http-adapter.ts sends and expects; failure cases first."""

from __future__ import annotations

import base64
import hashlib
import json
import re
import struct
import textwrap
import time
import tomllib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from plugins.base import Plugin
from registry import RegistryError, discover, enable, load_profile
from server import VERSION, create_app

HERE = Path(__file__).resolve().parent


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def job(task: str, model: str, request: dict, inputs: dict | None = None, contract: str = "t3d-neural/1") -> dict:
    return {"contract": contract, "task": task, "model": model, "request": request, "inputs": inputs or {}}


def wait(client: TestClient, jid: str, tries: int = 200) -> dict:
    for _ in range(tries):
        s = client.get(f"/v1/jobs/{jid}").json()
        if s["status"] in ("done", "failed"):
            return s
        time.sleep(0.02)
    raise AssertionError(f"job {jid} never finished")


EXTRA = """
from plugins.base import Plugin, PluginError, Result, Output

class Boom(Plugin):
    name = "boom"
    task = "mesh"
    licence = "MIT (test)"
    def run(self, job):
        raise PluginError("out of memory (test)")

class WrongMime(Plugin):
    name = "wrong-mime"
    task = "mesh"
    licence = "MIT (test)"
    def run(self, job):
        return Result([Output("image/png", b"x")])

class Dies(Plugin):
    name = "dies"
    task = "mesh"
    licence = "MIT (test)"
    isolate = True
    def run(self, job):
        import os
        os._exit(3)

class Counted(Plugin):
    name = "counted"
    task = "image"
    licence = "MIT (test)"
    loads = 0
    unloads = 0
    def load(self):
        type(self).loads += 1
        super().load()
    def unload(self):
        type(self).unloads += 1
        super().unload()
    def run(self, job):
        from plugins.dummy import solid_png
        return Result([Output("image/png", solid_png(2, 2, (0, 0, 0)))])
"""


@pytest.fixture()
def extra_dir(tmp_path: Path) -> Path:
    """A second plug-in directory: proves plug-ins are discovered by dropping a file in."""
    d = tmp_path / "more_plugins"
    d.mkdir()
    (d / "extra.py").write_text(textwrap.dedent(EXTRA))
    return d


@pytest.fixture()
def classes(extra_dir: Path) -> dict[str, type[Plugin]]:
    return discover([HERE / "plugins", extra_dir])


@pytest.fixture()
def client(classes: dict[str, type[Plugin]]):
    names = ["dummy-mesh", "dummy-image", "dummy-score", "boom", "wrong-mime", "counted", "dies"]
    profile = {n: {} for n in names} | {"dummy-score": {"isolate": True}}
    plugins = enable({"plugins": profile}, classes)
    with TestClient(create_app(plugins, keep=4, max_input_bytes=1 << 20)) as c:
        yield c


# --- refusals -------------------------------------------------------------------------------------


def test_wrong_contract_is_refused(client: TestClient) -> None:
    r = client.post("/v1/jobs", json=job("mesh", "dummy-mesh", {"seed": 1}, contract="t3d-neural/0"))
    assert r.status_code == 400 and "contract" in r.json()["error"]


def test_unknown_model_and_wrong_task_are_refused(client: TestClient) -> None:
    assert client.post("/v1/jobs", json=job("mesh", "nope", {"seed": 1})).status_code == 404
    r = client.post("/v1/jobs", json=job("image", "dummy-mesh", {"seed": 1}))
    assert r.status_code == 400 and "runs 'mesh'" in r.json()["error"]


def test_request_needs_an_integer_seed(client: TestClient) -> None:
    assert client.post("/v1/jobs", json=job("mesh", "dummy-mesh", {})).status_code == 400


def test_input_bytes_must_match_their_sha256(client: TestClient) -> None:
    data = b"photo"
    req = {"seed": 1, "image": {"sha256": sha(data), "mime": "image/png"}}
    r = client.post("/v1/jobs", json=job("mesh", "dummy-mesh", req, {sha(data): b64(b"other")}))
    assert r.status_code == 400 and "sha256" in r.json()["error"]


def test_named_inputs_must_be_sent(client: TestClient) -> None:
    req = {"seed": 1, "image": {"sha256": sha(b"photo"), "mime": "image/png"}}
    r = client.post("/v1/jobs", json=job("mesh", "dummy-mesh", req))
    assert r.status_code == 400 and "lacks" in r.json()["error"]


def test_inputs_over_the_cap_are_refused(client: TestClient) -> None:
    big = b"\0" * ((1 << 20) + 1)
    req = {"seed": 1, "image": {"sha256": sha(big), "mime": "image/png"}}
    assert client.post("/v1/jobs", json=job("mesh", "dummy-mesh", req, {sha(big): b64(big)})).status_code == 413


def test_unknown_job_is_404(client: TestClient) -> None:
    assert client.get("/v1/jobs/nope").status_code == 404


def test_a_plugin_that_raises_fails_its_job_not_the_server(client: TestClient) -> None:
    s = wait(client, client.post("/v1/jobs", json=job("mesh", "boom", {"seed": 1})).json()["id"])
    assert s["status"] == "failed" and "out of memory" in s["error"] and "outputs" not in s
    ok = wait(client, client.post("/v1/jobs", json=job("mesh", "dummy-mesh", {"seed": 1})).json()["id"])
    assert ok["status"] == "done"


def test_outputs_of_the_wrong_mime_fail_the_job(client: TestClient) -> None:
    s = wait(client, client.post("/v1/jobs", json=job("mesh", "wrong-mime", {"seed": 1})).json()["id"])
    assert s["status"] == "failed" and "image/png" in s["error"]


def test_an_isolated_plugin_whose_process_dies_fails_its_job(client: TestClient) -> None:
    s = wait(client, client.post("/v1/jobs", json=job("mesh", "dies", {"seed": 1})).json()["id"], 1000)
    assert s["status"] == "failed" and "process died (exit code 3" in s["error"]
    assert (
        wait(client, client.post("/v1/jobs", json=job("mesh", "dummy-mesh", {"seed": 1})).json()["id"])["status"]
        == "done"
    )


# --- the contract ---------------------------------------------------------------------------------


def test_models_lists_id_task_licence(client: TestClient) -> None:
    r = client.get("/v1/models")
    assert r.status_code == 200 and r.headers["x-t3d-server"] == VERSION
    by = {m["id"]: m for m in r.json()}
    assert by["dummy-mesh"]["task"] == "mesh"
    assert by["dummy-mesh"]["licence"].startswith("CC0-1.0")
    assert by["dummy-mesh"]["vramGb"] == 0
    assert "weightsSha256" not in by["dummy-mesh"]  # unknown weights are omitted, never faked


def test_mesh_job_round_trips_a_glb(client: TestClient) -> None:
    photo = b"\x89PNG fake photo bytes"
    req = {"seed": 7, "image": {"sha256": sha(photo), "mime": "image/png"}, "maxTriangles": 100}
    r = client.post("/v1/jobs", json=job("mesh", "dummy-mesh", req, {sha(photo): b64(photo)}))
    assert r.status_code == 200
    jid = r.json()["id"]
    assert all(c.isalnum() or c in "_.-" for c in jid)
    s = wait(client, jid)
    assert s["status"] == "done" and s["server"] == VERSION
    [out] = s["outputs"]
    assert out["mime"] == "model/gltf-binary"
    glb = base64.b64decode(out["data"])
    magic, version, length = struct.unpack_from("<4sII", glb)
    assert (magic, version, length) == (b"glTF", 2, len(glb))
    jlen, jtype = struct.unpack_from("<I4s", glb, 12)
    doc = json.loads(glb[20 : 20 + jlen])
    assert jtype == b"JSON" and doc["accessors"][1]["count"] == 12


def test_same_request_same_bytes(client: TestClient) -> None:
    outs = [
        wait(client, client.post("/v1/jobs", json=job("mesh", "dummy-mesh", {"seed": 3})).json()["id"])["outputs"]
        for _ in range(2)
    ]
    assert outs[0] == outs[1]


def test_image_job_returns_png_of_the_requested_size(client: TestClient) -> None:
    req = {"seed": 1, "prompt": "a wolf", "width": 64, "height": 32}
    s = wait(client, client.post("/v1/jobs", json=job("image", "dummy-image", req)).json()["id"])
    png = base64.b64decode(s["outputs"][0]["data"])
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", png[16:24]) == (64, 32)


def test_score_job_returns_a_score(client: TestClient) -> None:
    imgs = [b"render", b"reference"]
    req = {"seed": 1, "images": [{"sha256": sha(i), "mime": "image/png"} for i in imgs]}
    s = wait(
        client,
        client.post("/v1/jobs", json=job("score", "dummy-score", req, {sha(i): b64(i) for i in imgs})).json()["id"],
    )
    assert s["status"] == "done" and s["score"] == 7.0


def test_one_plugin_resident_at_a_time(client: TestClient, classes: dict[str, type[Plugin]]) -> None:
    counted = classes["counted"]
    img = {"seed": 1, "prompt": "x", "width": 2, "height": 2}
    for model, task, req in [("counted", "image", img), ("counted", "image", img), ("dummy-mesh", "mesh", {"seed": 1})]:
        assert wait(client, client.post("/v1/jobs", json=job(task, model, req)).json()["id"])["status"] == "done"
    assert counted.loads == 1 and counted.unloads == 1  # loaded once, unloaded when mesh came in


def test_finished_jobs_are_dropped_oldest_first(client: TestClient) -> None:
    ids = [client.post("/v1/jobs", json=job("mesh", "dummy-mesh", {"seed": i})).json()["id"] for i in range(6)]
    wait(client, ids[-1])
    assert client.get(f"/v1/jobs/{ids[0]}").status_code == 404
    assert client.get(f"/v1/jobs/{ids[-1]}").status_code == 200


# --- registry and profiles ------------------------------------------------------------------------


def test_profile_naming_an_unknown_plugin_is_an_error(classes: dict[str, type[Plugin]]) -> None:
    with pytest.raises(RegistryError, match="known plug-ins"):
        enable({"plugins": {"nope": {}}}, classes)


def test_unavailable_plugin_is_an_error_not_a_silent_skip(classes: dict[str, type[Plugin]]) -> None:
    with pytest.raises(RegistryError, match="cannot run here"):
        enable({"plugins": {"pixal3d": {"repo": "/nonexistent/Pixal3D"}}}, classes)


def test_duplicate_plugin_names_are_an_error(tmp_path: Path) -> None:
    (tmp_path / "dupe.py").write_text(
        "from plugins.base import Plugin\nclass D(Plugin):\n    name='dummy-mesh'\n    task='mesh'\n    licence='MIT'\n"
    )
    with pytest.raises(RegistryError, match="already taken"):
        discover([HERE / "plugins", tmp_path])


def test_every_shipped_plugin_declares_task_and_licence() -> None:
    found = discover()
    assert {"dummy-mesh", "pixal3d", "trellis2", "dinov2"} <= set(found)
    for cls in found.values():  # SPDX-style id first: the ts23d publish gate reads it
        assert re.match(r"^[A-Za-z0-9.+-]+\b", cls.licence), cls.name


def test_shipped_profiles_parse_and_name_known_plugins() -> None:
    known = discover()
    servers = [p for p in sorted((HERE / "profiles").glob("*.toml")) if "plugins" in tomllib.loads(p.read_text())]
    assert {"dummy.toml", "rtx3090.toml", "full.toml"} <= {p.name for p in servers}
    for p in servers:  # install-*.toml are `t3d setup` profiles (slice 21), not server profiles
        assert set(load_profile(p)["plugins"]) <= set(known), p.name


def test_task_table_matches_the_typescript_contract() -> None:
    """TASKS / MIMES / INPUT_FIELDS mirror src/core/neural-task.ts and inputsOf (src/neural/adapter.ts)."""
    from plugins.base import INPUT_FIELDS, MIMES, TASKS

    src = HERE.parents[1] / "src"
    if not (src / "core" / "neural-task.ts").is_file():
        pytest.skip("not inside the ts23d repo")
    ts = (src / "core" / "neural-task.ts").read_text()
    body = ts[ts.index("NEURAL_MIMES:") : ts.index("};", ts.index("NEURAL_MIMES:"))]
    rows = dict(re.findall(r"^\s*'?([\w-]+)'?: \[([^\]]*)\]", body, re.MULTILINE))
    want = {k: tuple(re.findall(r"'([^']+)'", v)) for k, v in rows.items()}
    assert MIMES == want and set(TASKS) == set(want)
    adapter = (src / "neural" / "adapter.ts").read_text()
    fields = re.search(r"for \(const k of \[([^\]]*)\]\)", adapter)
    assert fields and INPUT_FIELDS == tuple(re.findall(r"'([^']+)'", fields.group(1)))
