# 14 — Reference model server (example, not in the npm package)

Rule: one small, swappable server shows how to serve `t3d-neural/1`; every model is a plug-in file.

## Files
| Path | State | Why |
|---|---|---|
| `examples/neural-server/README.md` | new | install (uv, CUDA), VRAM table, licences to read, `t3d.config.ts` snippet |
| `examples/neural-server/server.py` | new | FastAPI app implementing `t3d-neural/1`, job queue, one model resident at a time (24 GB card) |
| `examples/neural-server/plugins/pixal3d.py` | new | `mesh` (TencentARC/Pixal3D, `--low_vram`) |
| `examples/neural-server/plugins/trellis2.py` | new | `mesh` + `texture` an existing mesh (microsoft/TRELLIS.2-4B) |
| `examples/neural-server/plugins/qwen_image.py` | new | `image`: concept thumbnails + orthographic turnaround prompt templates |
| `examples/neural-server/plugins/unimate.py` | new | `motion` text → tracks for a given skeleton JSON |
| `examples/neural-server/plugins/video_motion.py` | new | `motion` from a video: open pose-from-video model (pick one whose licence allows publishing outputs; record it) → per-bone tracks retargeted by `neural-motion.ts` (15) |
| `examples/neural-server/plugins/unirig.py` | new | `rig` mesh → bones + weights |
| `examples/neural-server/plugins/hairdeck.py` | new | `hair` image → cards + spring chains |
| `examples/neural-server/plugins/dinov2.py` | new | `score`: embedding cosine render vs reference |
| `examples/neural-server/plugins/ultratex.py` | new | `texture`: PBR (albedo, metallic, roughness) for an existing mesh; licence read from its card before use in showcase |
| `examples/neural-server/plugins/qwen_edit_split.py` | new | `image`: concept → per-part crops/clean-ups (head, torso, limbs, clothing) with prompt templates; used by split-part mode (15) |
| `examples/comfy-workflows/trellis2-low-vram.json` | new | ComfyUI workflow for TRELLIS.2 with offloading/GGUF for small cards (4–8 GB) via `comfyAdapter` (13) |
| `examples/neural-server/pyproject.toml`, `uv.lock` | new | pinned deps |
| `examples/neural-server/test_contract.py` | new | contract test against a dummy plug-in (no GPU) |
| `t3d.config.example.ts` | new | maps tasks → `http('http://localhost:8765', model)` |

## Depends on
13 (contract).

## Change
- Not in `package.json` `files` (coordinator confirms `examples/` entry excludes `neural-server/`); not part of `bun run verify` except a lint that the folder has no TS imports into `src/`.
- Weights download on first run via `HF_TOKEN` env (never stored in the repo).
- Each plug-in reports its licence string verbatim from the model card.

## Tests
`test_contract.py` with the dummy plug-in; manual GPU smoke on an RTX 3090: each plug-in returns a valid result for the wolf reference.

## Checks
`uv run pytest examples/neural-server` (local) · `bun run verify --only pack` proves it is not shipped

## Docs
README section "Bring your own model"; this README.

## Done when
`t3d neural run recipes/wolf/wolf.ts` against the server fills `recipes/wolf/neural/`.
