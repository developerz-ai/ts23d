# Security

**Report privately. Don't open a public issue for a vulnerability.**

## Reporting

Use GitHub's private vulnerability reporting: **[Report a vulnerability](https://github.com/developerz-ai/ts23d/security/advisories/new)**. Include affected version, a minimal recipe or input that reproduces it, and impact.

| Expect | Within |
|---|---|
| Acknowledgement | 3 business days |
| Assessment + plan | 10 business days |
| Fix released | Severity-dependent; critical issues first |

## Supported versions

0.x: only the latest published version gets fixes. No backports before 1.0.

## Threat model

| Surface | Position |
|---|---|
| **Recipes are code** | `t3d build`, `t3d shot` and `t3d list` `import()` the recipe module and run it with your user's permissions. Treat a recipe from a stranger like any script from a stranger: read it, or run it in a sandbox / container. There is no recipe sandbox ([ADR 002](docs/decisions/002-typescript-not-json.md)) |
| Generated outputs (GLB, PNG) | Written by our own zero-dependency writers. A malformed output that crashes a consumer is a bug worth reporting |
| `importGlb` (shipped) | Parses untrusted GLB. The reader bounds accessor sizes and counts (empty accessors capped at 2^24 elements), the PNG/zip inflate is capped, and import scale is checked. Parser bugs are in scope |
| `refine`, `t3d finish --model http` (shipped) | Talk HTTP to an endpoint you configure, with a timeout (`timeoutMs`: 600 s refine, 300 s finish). Replies are read through the bounded GLB reader. Cached outputs are content-hashed. Secrets are passed by the caller, never read from ambient env |
| Neural adapters (`httpAdapter`, `comfyAdapter`, `openaiImageAdapter`, `kubeezAdapter`, `localGenerator`, `t3d neural run`) | Talk HTTP only to endpoints you configure in `t3d.config.ts` (which is code, like a recipe). Every request has a deadline (60 s default; whole job 30 min) and a reply cap (64 MB, checked on `content-length` and on the body); replies must be JSON. Model outputs are untrusted: PNGs and GLBs go through the bounded readers and task validation before use (`T3D_NEURAL_OUTPUT_INVALID`). Committed outputs under `recipes/<name>/neural/` are capped at 8 MB per recipe and re-hashed on every load. Builds never touch the network: only `t3d neural run` does. Secrets go in `headers` / `apiKey`, never read from ambient env by the library, and never written to records, caches or errors; `kubeezAdapter` does not send its key to the download CDN ([ADR 014](docs/decisions/014-neural-outputs-are-cached-inputs.md), [015](docs/decisions/015-models-by-adapter.md)) |
| Network scripts (`bun run textures`, `bun run data`) | Fetch with a 60 s timeout and a capped zip inflate; downloads are sha256-pinned. As of 2026-11 |
| Supply chain | Zero runtime dependencies ([ADR 005](docs/decisions/005-zero-runtime-deps.md)). Releases publish from GitHub Actions via npm OIDC trusted publishing with provenance; no long-lived npm token exists ([PUBLISHING.md](PUBLISHING.md)) |

## Verifying a release

```sh
npm view @developerz.ai/ts23d@<version> dist.attestations _npmUser
npm audit signatures
```

A provenance attestation from `developerz-ai/ts23d`'s `release.yml` means the tarball was built by CI from the tagged commit. A version without one was published by hand (only the one-time bootstrap should be).
