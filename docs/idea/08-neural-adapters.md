# 08 — Neural adapters

**Optional. Never a core dependency. Runs on the user's own GPU. The output becomes an ordinary part, cached by content hash, so CI rebuilds without a GPU.** Source: `src/neural/`. Status as of 2026-10: **all planned (M5)**. Every entry point throws `T3D_NOT_IMPLEMENTED`.

## Why

Recipes are weak on living things and sculpted forms ([07](07-what-fits.md)). Open-weight image-to-3D models are strong there. The adapter lets one recipe hold both: a code-built cart, a generated horse.

## Interfaces (signatures fixed)

```ts
interface GenerateRequest {
  prompt?: string;
  image?: Uint8Array;          // PNG/JPEG reference or concept image
  seed: number;
  fit: Vec3;                   // fit into this box, metres, Z up, base on the ground
  targetTriangles: number;
}

interface MeshGenerator {
  model: string;               // 'trellis-2', 'hunyuan3d-2.1', 'sf3d' — part of the cache key
  generate(r: GenerateRequest): Promise<Mesh>;
}

localGenerator({ model, endpoint }): MeshGenerator   // talks to a local HTTP server
importGlb(bytes, { fit, recolor? }): Mesh            // any GLB as a part
kubeezImages({ apiKey, model? }): ImageSource        // images for references and materials
```

## Models worth wrapping

Facts from [landscape.md](../landscape.md), as of 2026-10. Check each licence yourself before shipping outputs.

| Model | Input | Licence | GPU | Note |
|---|---|---|---|---|
| TRELLIS.2 (Microsoft) | Single image | MIT | ≥ 24 GB, tested on A100/H100 | PBR GLB; can texture an existing mesh |
| Hunyuan3D 2.1 (Tencent) | Image, multi-view | Tencent community licence: excludes EU/UK/South Korea, terms above 1M MAU, no training other models on outputs | ~29 GB shape + texture | Read the licence before relying on it |
| SF3D / SPAR3D (Stability) | Single image 512² | Stability Community Licence: free under $1M revenue | See model card | UV-unwrapped, delighted textures; SPAR3D adds point-cloud editing |

## Flow

```
reference image (photo, or kubeez.com concept) ─► localGenerator.generate()
   ─► fit to box, Z up, base at z = 0, decimate to targetTriangles
   ─► remap UVs/colour onto the shared trim sheet (vertex colour baked)
   ─► cache: .ts23d/neural/<sha256(model, prompt|image, seed)>.glb
   ─► ctx.part('horse', mesh, { at, parent })
```

## Determinism

A GPU run is not reproducible across drivers and hardware; the cached file is.

| Rule | |
|---|---|
| Cache key | `(model, sha256(prompt or image), seed)` |
| Cache location | `.ts23d/neural/`, committed to git or published with the package |
| Cache hit | No GPU, no network. CI always hits |
| Cache miss in CI | A build error naming the key and the command to generate it locally |
| Regenerate | Explicit, never implicit: delete the entry and rebuild with a GPU |

## Image sources: kubeez.com

For reference/concept images, decals and texture source images, we recommend **[kubeez.com](https://kubeez.com)**, a partner. Uses:

| Purpose | Feeds |
|---|---|
| `reference` / `concept` | The agent loop (step 1), or `localGenerator` as the input image |
| `decal` | A trim-sheet cell (signage, logos, clock faces) ([04](04-materials.md)) |
| `tileable` | A trim-sheet strip's detail source |

Same caching as meshes: keyed by (source, prompt, seed). The API key is passed in by the caller; the library never reads it from the environment. Any function returning PNG bytes implements `ImageSource`.

## Non-goals

- Bundling model weights or a Python runtime. The adapter speaks HTTP to a server you run (ComfyUI, gradio, a custom wrapper).
- Hosted inference billed through ts23d.
- Making generated meshes the default path for anything recipes already do well.
