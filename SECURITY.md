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
| `importGlb` (planned) | Will parse untrusted GLB. Must bound sizes and counts; parser bugs are in scope |
| `/neural` adapters (planned) | Talk HTTP to an endpoint you configure. Cached outputs are content-hashed. Secrets (e.g. a kubeez.com API key) are passed by the caller, never read from ambient env |
| Supply chain | Zero runtime dependencies ([ADR 005](docs/decisions/005-zero-runtime-deps.md)). Releases publish from GitHub Actions via npm OIDC trusted publishing with provenance; no long-lived npm token exists ([PUBLISHING.md](PUBLISHING.md)) |

## Verifying a release

```sh
npm view @developerz-ai/ts23d@<version> dist.attestations _npmUser
npm audit signatures
```

A provenance attestation from `developerz-ai/ts23d`'s `release.yml` means the tarball was built by CI from the tagged commit. A version without one was published by hand (only the one-time bootstrap should be).
