# 21 — Import: licensed meshes in, game-ready assets out

**Status: shipped (M5 slice), 2026-11-07.** `importGlb`, `cleanMesh`, `simplify`, `bakeNormals`, `withOwnTextures`, `refine` (adapter + cache, no model) and the `import_demo` recipe. Source: `src/neural/import-*.ts`, `src/neural/glb-*.ts`, `src/passes/simplify*.ts`, `src/passes/bake-*.ts`, `src/export/own-textures.ts`, `scripts/import*.ts`. Decision: [ADR 011](../decisions/011-imported-meshes-may-be-decimated.md).

## Why

Code builds structure well and faces badly. A photogrammetry head, a CC0 MakeHuman / MPFB base mesh or a local generator's output already has the face; it lacks everything a game needs — real units and axes, clean topology, LOD budgets, the house material, named parts, joints, QA, renders. The hybrid: **import the mesh, let ts23d do the rest**. ts23d stays the free, code-based option; it does not compete with scanners or generators, it finishes what they produce.

## Pipeline

```
file.glb ─► importGlb(source, opts)                         src/neural
   licence gate (CC0 / CC-BY / MIT / own; NC refused) ─► credit line
   bytes by sha256 (inline + hash-checked, or provideImports cache)
   readGlb: header, JSON, BIN, accessors (all component types), images
   scene walk: node TRS / matrix baked, mirrored transforms re-wound
   frame: glTF Y-up +Z-front ─► Z-up +X-front, × scale, fit (height | box), place
   cleanMesh: weld → degenerate/duplicate faces → consistent winding → outward shells
              → small holes filled → specks dropped → shell report
   PNG baseColor ─► vertex colour (pure-TS inflate: same in Bun and the browser)
─► simplify(mesh, { targetTris })  ×3 LODs                 src/passes
─► 'sheet' (default): onSheet(mesh, strip) — one material, one draw call
   'own' (opt-in):    bakeNormals(high, low) ─► withOwnTextures(glb, [{ part, albedo, normal }])
─► ctx.part('head', …) + ctx.joint(…) on a code-built body ─► QA ─► shots
```

## API

```ts
importGlb(source: ImportSource, o?: ImportOptions): ImportedMesh
//   source: { path, sha256, license, author, url, bytes?, allowNonCommercial? }
//   o: { up?: '+y', front?: '+z', scale?: 1, height?, fit?: Vec3, place?: 'ground'|'centre'|'origin', clean?: CleanOptions|false }
//   → { mesh, albedo?, report, credit, warnings, sha256, scale }
cleanMesh(mesh, { weld?, maxHoleEdges?: 8, minShellTris?: 0 }): { mesh, report }
simplify(mesh, { targetTris, preserveBorders?: true, preserveUVSeams?: true, attributeWeight?: 1 }): { mesh, error }
bakeNormals(high, low, { size, cage?, albedo?, padding?: 4 }): { normal, albedo, tangents, hitRate }
withOwnTextures(glb, [{ part, albedo, normal, roughness? }]): Uint8Array
onSheet(mesh, strip?): Mesh          projectAlbedo(mesh, rgba): Mesh
provideImports(cache) · importBytes(source) · readGlb · readAccessor · readImage · scenePrimitives
writeMeshGlb(nodes) · packGlb · sha256Hex · checkLicence
refine({ mesh, prompt, seed?, image? }, { endpoint, model, cache?, offline?, fetch? }): Promise<Refined>
```

CLI-side: `bun scripts/import.ts hash|cache <file>` (sha256; content-addressed cache in `node_modules/.cache/ts23d/imports/`), `fixture` (the demo's stand-in scan), `textured` (the demo's own-texture GLB). `loadImportCache()` (`src/cli/import-cache.ts`, re-exported by `scripts/import.ts`) feeds `provideImports`; `t3d build` calls it before compiling.

## importModel: a textured, skinned, animated GLB kept whole

**Status: shipped 2026-11-16** ([plan 101](../plans/2026/11/16/101-organic-model-first/overview.md) slice 03; [ADR 016](../decisions/016-textured-parts.md), [ADR 013](../decisions/013-skinned-meshes.md)). Source: `src/neural/import-model.ts` (+ `import-frame`, `import-textures`, `import-skin`, `import-rig`, `import-clips`, `import-weld`). `importGlb` finishes a scan onto the trim sheet; `importModel` is for a body that already has its look and rig (an image-to-3D mesh after the Blender steps, a Meshy rig): nothing is dropped at the door.

```ts
importModel(source: ImportSource | { bytes, license, author, url?, allowNonCommercial? },
            o?: { up?, front?, scale?, height?, fit?, place?,            // as importGlb
                  lodNodes?: [string, string, string],                    // default lod0 / lod1 / lod2
                  textureName?: string, ormWithoutOcclusion?: 'keep' | 'drop',
                  closeLoops?: boolean }): ImportedModel                  // closeLoops: default true
// → { lods: Mesh[] (1 or 3), textures?: TextureSet, armature?: Armature, boneNames, clips: Clip[],
//     credit, warnings, sha256, scale }
```

| What | Rule |
|---|---|
| LODs | Nodes named `lod0` / `lod1` / `lod2` (any case, or `<name>_lod0`…) give three LODs from the meshes at or below them. None found, or only `lod0`: the whole default scene is the single LOD 0. `lod0` with one of `lod1` / `lod2` missing: `T3D_IMPORT_UNSUPPORTED` listing the mesh nodes found. |
| Mesh | UVs exactly as stored (glTF: 0..1, V down); vertex colour white when textured; no `cleanMesh`, only bit-identical vertices are welded. Fit and placement are measured on LOD 0 and applied to every LOD, bone and clip key. |
| Textures | One `TextureSet` of the file's PNG bytes (never decoded): baseColor, normal, and the metallicRoughness image as `orm` when the occlusion slot points at the same image. No shared occlusion: the image is dropped with a warning (its red channel is undefined) unless `ormWithoutOcclusion: 'keep'`. Roughness / metallic factors are taken from the material when it has no metallicRoughness image. Several different textured materials, JPEG / WebP, or a second UV set: `T3D_IMPORT_UNSUPPORTED` naming the Blender `bake` / `export` step. Materials are compared by image content, not index. |
| Skin | The 4 heaviest influences per vertex (JOINTS_0..n), renormalised to 1; more than 4 is a warning. Vertices are baked to the file's **rest pose** (Σ w · jointWorld · inverseBind), so armature transforms, bind spaces and inverse binds are gone; a rest pose that is not the bind pose is a warning. |
| Armature | One bone per joint node, parents first, `head` = the joint's rest world position in the asset frame, names in snake_case (`boneNames`: file name → bone name). `tail`: the child's head for a single child; a leaf points through the centre of the vertices it moves (twice that far); otherwise along the parent's direction. Unweighted joints with no weighted joint below are dropped (warned). |
| Clips | Keys are re-expressed against the ts23d rest pose (no rest rotation, asset axes): rotation = A·P·(r ⊗ r₀⁻¹)·P⁻¹·A⁻¹, translation = A·P·(t − t₀), with P the rest world rotation and scale of the joint's parent node and A the import frame. Times start at 0; STEP gets hold keys; CUBICSPLINE keeps values and drops tangents (warned); tracks that never leave rest are dropped; a channel on a non-joint node is ignored with a warning; uniform scale only; `run` is reserved and becomes `run_anim`; `loop` = `extras.loop`, else first key = last key. |

Checked by `src/neural/import-clips.test.ts`: the imported mesh posed by an imported key (the exporter / QA convention) lands within 1e-5 m of a direct glTF evaluation of the file. Loop closing (`closeLoops`, default on; `src/neural/import-clips-loop.ts`): a cycle whose last key sits one frame before its period (a rigging service's walk, 4.1667 s at 30 fps) gets key 0 appended one frame later, so it loops with no blend; one `warnings` line per closed clip; a clip that is not a cycle (one-shot, eased stop) is left open. Not imported yet: morph targets, sparse accessors, more than one texture set, cameras and lights.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Where bytes come from | Offline, by sha256: inline bytes (hash-checked) or a cache the caller provides | Same as CC0 textures; the library never reads disk or network, so recipes compile in the browser and CI |
| Licences | Allow `own`, `CC0-1.0`, `MIT-0`, `CC-BY-3.0/4.0`, `CC-BY-SA-4.0`, `MIT`, `Apache-2.0`; refuse unknown strings and NC/ND unless `allowNonCommercial` (returns a loud warning; credit marked NON-COMMERCIAL) | A generated asset must not inherit a duty its user cannot meet |
| Decimation | Allowed for imported meshes only ([ADR 011](../decisions/011-imported-meshes-may-be-decimated.md)) | A scan has no recipe to LOD-gate; code-built assets still choose detail per LOD |
| Simplifier | Garland–Heckbert quadrics, half-edge collapses (vertices keep exact attributes), area-weighted planes + heavy constraint planes on borders/seams, colour+normal cost term, link condition (closed stays closed), fold-over refusal, total-order heap | Deterministic and attribute-safe; same design family as meshoptimizer's simplifier |
| Material | Default **sheet**: albedo projected into vertex colour, triplanar UVs on one strip — one material, one draw call. Opt-in **own**: baked albedo + normal map as an extra material, flagged in `extras.ts23d.ownMaterials` | The trim sheet cannot hold a face's UV layout; the cost of breaking the rule is visible and opt-in |
| Normal-map convention | glTF green-up: bitangent = cross(N, T)·w toward decreasing v; tangents written as TANGENT; same handedness as `/export`'s `tangentsOf` (tested) | Viewers reconstruct the frame from TANGENT; the bake and the file must agree |
| LOD textures | One bake against LOD0, shared by LOD1/2 | One texture set per asset; LODs approximate the same surface with the same UV layout |

## Errors

`T3D_IMPORT_GLB` (malformed file), `T3D_IMPORT_UNSUPPORTED` (Draco/meshopt, sparse, external URIs, odd PNGs, bad axes), `T3D_IMPORT_EMPTY`, `T3D_IMPORT_LICENSE`, `T3D_IMPORT_HASH`, `T3D_IMPORT_MISSING` (names `bun scripts/import.ts cache …`), `T3D_SIMPLIFY_INVALID`, `T3D_BAKE_INVALID`, `T3D_REFINE_FAILED`.

## Refine adapter (protocol only)

`refine` POSTs `{ model, prompt, seed, mesh: base64 GLB (Y-up), image? }` to a server the user runs (a TRELLIS / Hunyuan3D-style "refine or retexture this mesh" wrapper) and expects `model/gltf-binary` back. Cache key = sha256(model, prompt, seed, input GLB, image); a hit needs no GPU or network; `offline: true` (CI) turns a miss into `T3D_REFINE_FAILED` naming the key. ts23d ships no model, no weights and no Python; the result goes through `importGlb` like any file, under the licence the caller declares for the model's outputs.

## Swap in a real CC0 head

See [recipes/import_demo/README.md](../../recipes/import_demo/README.md): export from MakeHuman 1.x / MPFB 2 (bundled assets CC0) as uncompressed `.glb`, `bun scripts/import.ts cache head.glb`, declare `{ path, sha256, license: 'CC0-1.0', author, url }`, `provideImports(await loadImportCache())`, fit with `height`, move the joint to the new neck.

## Gaps (honest)

- `localGenerator` ships as a wrapper over the `mesh` task of any `NeuralAdapter` (docs/idea/08-neural-adapters.md); `refine` shares the job key and recipe cache.
- The demo's stand-in scan is the CC0 MakeHuman hm08 base (data only), not a photogrammetry capture; its hair is paint.
- The post-process own-texture GLB (`withOwnTextures`) is validated (Khronos validator, 0 errors/warnings) but ts23d's CPU renderer draws only the trim-sheet path for it. A `TextureSet` on a part (`importModel`, ADR 016) is sampled by the raster, path-traced and contact-sheet renders.
- Hole filling is a fan over loops ≤ `maxHoleEdges`; large holes are reported, not patched.
