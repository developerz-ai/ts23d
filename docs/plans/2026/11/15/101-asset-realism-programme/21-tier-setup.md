# 21 — One-command setup for the optional tier: `t3d setup` + `t3d doctor` (cli tier 5, example server)

Rule: the GPU/tool tier installs with one command and diagnoses itself; nothing is required for the CPU tier, and nothing is installed system-wide or with sudo.

## Files
| Path | State | Why |
|---|---|---|
| `src/cli/doctor-cmd.ts` + `.test.ts` | new | `t3d doctor [--json]`: Bun version, CPU tier OK; optional tier: `uv` present, NVIDIA driver + GPU name + VRAM (`nvidia-smi`), CUDA toolkit match, disk free, server venv present, server reachable (`GET /v1/models`), per model: weights cached, gated licence accepted (HF API with `HF_TOKEN`), VRAM fits; Blender: `bpy` importable in the venv or a `blender` executable; Material Maker CLI. Each missing item prints the exact `fix:` command |
| `src/cli/setup-cmd.ts` + `.test.ts` | new | `t3d setup <profile>` with profiles `tools` (bpy, Godot headless, basisu, meshoptimizer, Material Maker; no GPU), `gpu-min` (≥ 8 GB: TRELLIS.2 low-VRAM via ComfyUI workflow, image model), `gpu-full` (≥ 24 GB: Pixal3D, TRELLIS.2, UniMate, UniRig, HairDeck, DINOv2, video-motion); creates `~/.ts23d/neural/.venv` with `uv` (pinned Python), installs pinned wheels (torch + CUDA wheels, flash-attn/nvdiffrast prebuilt where available, local CUDA toolkit via `nvidia-cuda-nvcc` pip when extensions must compile), downloads weights with `HF_TOKEN` (never stored), lists gated licences to accept with their URLs, writes `t3d.config.ts` pointing at the local server; idempotent, resumable, `--dry-run` prints the plan |
| `src/cli/server-cmd.ts` + `.test.ts` | new | `t3d server start|stop|status` runs the example server from the setup venv on `localhost:8765`, one model resident at a time |
| `examples/neural-server/profiles/*.toml` | new | pinned versions per profile (from `~/workspace/lab/neural-models/SETUP.md`, which proved the RTX 3090 path on 2026-11-15: torch 2.6.0+cu124, CUDA 12.4.1 local toolkit, gcc-13 toolchain shim, natten 0.21 sm_86) |
| `examples/neural-server/install.py` | new | the installer the CLI calls (Python side: venv, wheels, builds, weights) with machine-readable progress lines |
| `README.md` section "Optional tier" | changed | three commands: `t3d doctor`, `t3d setup gpu-full`, `t3d server start` |

## Depends on
13, 14, 20.

## Change
- Everything under `~/.ts23d/` (or `$TS23D_HOME`); uninstall = delete the folder.
- Windows: same commands with WSL2 or native CUDA wheels; macOS: `tools` profile only (bpy, Material Maker), GPU profiles refuse with a clear `fix:`.
- No GPU: `t3d doctor` recommends kubeez.com (partner, disclosed in docs) for the `image` task via `kubeezAdapter` (`KUBEEZ_API_KEY`); mesh/rig/motion tasks stay on the CPU tier or a user's own server.
- The CLI never installs during `build`; a missing optional tool is a notice + CPU fallback (ADR 014).

## Tests
Failure first: `doctor` on a machine with no `uv` / no GPU reports each item with a fix and exits 0 for CPU tier; `setup --dry-run` prints the exact plan per profile; a fake `nvidia-smi` reporting 6 GB refuses `gpu-full` with the reason; installer progress parsing; idempotent re-run is a no-op.

## Checks
`bun test src/cli/{doctor,setup,server}-cmd.test.ts` · `--only lint,typecheck,boundaries,pack` · manual on the RTX 3090 box: fresh `~/.ts23d` → `t3d setup gpu-full` → `t3d doctor` all green → `t3d neural run recipes/wolf/wolf.ts`.

## Done when
A new user goes from `bunx t3d doctor` to a cached GPU variant of the wolf with three commands, and `t3d doctor` explains every missing piece.
