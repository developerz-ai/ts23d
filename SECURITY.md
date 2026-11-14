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
| `localGenerator`, `kubeezImages` (planned) | Not built: they throw `T3D_NOT_IMPLEMENTED`. Same rules when they land: caller-passed secrets, content-hashed cache |
| Network scripts (`bun run textures`, `bun run data`) | Fetch with a 60 s timeout and a capped zip inflate; downloads are sha256-pinned. As of 2026-11 |
| Supply chain | Zero runtime dependencies ([ADR 005](docs/decisions/005-zero-runtime-deps.md)). Releases publish from GitHub Actions via npm OIDC trusted publishing with provenance; no long-lived npm token exists ([PUBLISHING.md](PUBLISHING.md)) |

## Verifying a release

```sh
npm view @developerz.ai/ts23d@<version> dist.attestations _npmUser
npm audit signatures
```

A provenance attestation from `developerz-ai/ts23d`'s `release.yml` means the tarball was built by CI from the tagged commit. A version without one was published by hand (only the one-time bootstrap should be).
