# Landscape: AI 3D generators

**A neutral survey, as of Oct 2026. ts23d isn't a competitor to these tools; it's a different approach (code recipes, free, no GPU, no service) with different strengths.** Many teams will use both. Prices and features change monthly, so check the linked source before relying on a row.

Rows marked **(3rd-party)** come from aggregators or press, not the vendor's own page. Treat them as indicative.

## Hosted / commercial

| Tool | Inputs | Outputs | Rig / anim | Pricing (as of Oct 2026) | Open? | Source |
|---|---|---|---|---|---|---|
| Meshy (Meshy 7.1 / 6) | Text, image, multi-view | GLB / glTF / FBX / OBJ / USDZ / STL / 3MF; PBR (albedo / normal / metal / rough); quad/tri remesh, Low Poly mode, Smart Topology | Auto-rig humanoid + quadruped, 500–600+ motion presets | Free 100 credits/mo, outputs CC BY 4.0. Pro $20 (1,000 cr), Premium $40 (3,000), Ultra $100 (8,000), Studio $70/team. ~20–25 credits per generation | No (paid = private + commercial) | [pricing](https://www.meshy.ai/pricing) · [docs](https://docs.meshy.ai/en/webapp/pricing) · [animate](https://docs.meshy.ai/en/webapp/guides/animate) |
| Tripo (Tripo 3.x) | Text, image, multi-view | GLB / FBX / OBJ / USD / STL; PBR, smart low-poly, quad topology **(3rd-party)** | Auto-rig + animation | Free ~200–300 cr/mo (public, non-commercial); Pro ~$20/mo (3,000 cr); Max ~$90 (25,000); API per task **(3rd-party)** | No | [docs](https://platform.tripo3d.ai/docs/introduction) · [CostBench](https://www.costbench.com/software/ai-3d-generation/tripo-ai/) |
| Rodin / Hyper3D (Gen-2.5) | Text, image, multi-view, sketch, 3D ControlNet (bbox / voxel / point cloud), mesh edit | GLB / glTF / FBX / OBJ / USDZ / STL; PBR + UVs; quad/tri, polycount presets (~4K–50K quads) | Not mentioned on official page | Free pay-per-result ($1.50/credit); Creator $30/mo (~60 models); Business $120/mo (~416, API) | No | [pricing](https://hyper3d.ai/pricing) · [site](https://hyper3d.ai/) |
| Luma Genie | Text (originally) | GLB / OBJ / USDZ (2024 coverage) | No | Free research preview at 2024 launch; current status unclear **(3rd-party)** | No | [The Decoder](https://the-decoder.com/genie-by-luma-ai-is-a-free-text-to-3d-generator-for-discord/) |
| CSM (Cube) | Image, text | Part-based meshes, AI retopology **(3rd-party)** | Not confirmed | Free tier, then ~$20 / $60 / $499+/mo (May 2026); reported acquired by Google Jan 2026, unconfirmed **(3rd-party)** | No | [CostBench](https://costbench.com/software/ai-3d-generation/csm/) |
| Kaedim | Concept art, sketches, photos, briefs | Production 3D with review / markup / revision loop | Not stated | No public pricing; $50 trial to $400–$1,200/mo **(3rd-party)** | No (customer owns outputs) | [site](https://www.kaedim3d.com/) |
| Sloyd | Text, image, multi-image, parametric templates | GLB / OBJ / FBX / STL; polycount + tri/quad control; Unity / Unreal / Blender / Godot / Roblox plugins | AI rig + anim | Guest 1 gen/day personal; Plus $15/mo (50 cr); Pro $50/mo (350 cr) | No | [pricing](https://www.sloyd.ai/pricing) |
| Autodesk Wonder 3D (Mar 2026) | Text, image | OBJ / STL for Maya / 3ds Max / Flow Studio | Not stated | Free 300 cr/mo at 20/gen; Pro ~$64/mo | No | [Autodesk news](https://adsknews.autodesk.com/en/news/autodesk-flow-studio-launches-wonder-3d-gen-ai-model-to-help-creators-make-3d-characters-and-objects-faster-and-easier/) |

## Open weights / self-hosted

| Tool | Inputs | Outputs | Rig / anim | Cost / hardware | Licence | Source |
|---|---|---|---|---|---|---|
| Hunyuan3D (Tencent) | Open 2.x: image, multi-view. Hosted 3.x: text / image / sketch, up to 4–8 views | Mesh + PBR texture pipeline (Paint 2.1) | No | Open 2.1 free, ~29 GB VRAM shape + texture; hosted ~20 free gens/day then ~$0.02/credit | 2.0 / 2.1 open weights, Tencent community licence (excludes EU / UK / South Korea, terms above 1M MAU, no training other models on outputs); 2.5 / 3.x hosted only | [GitHub](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) |
| TRELLIS.2 (Microsoft) | Single image; can texture an existing mesh | GLB with PBR incl. opacity, 4K textures | No | Free self-hosted; ≥ 24 GB GPU, tested Linux A100 / H100 | MIT | [Hugging Face](https://huggingface.co/microsoft/TRELLIS.2-4B) |
| Stable Fast 3D / SPAR3D (Stability) | Single image 512² | UV-unwrapped textured mesh, delighted textures, rough/metal; SPAR3D point-cloud editing | No | Free self-host; hosted API credit-based | Stability Community Licence (free under $1M revenue) | [Hugging Face](https://huggingface.co/stabilityai/stable-point-aware-3d) |
| SAM 3D Objects (Meta, Nov 2025) | Real photos; an object from a cluttered scene | Textured object + pose / layout | No | Free self-hosted | Open weights, custom SAM licence **(3rd-party)** | [Roboflow](https://roboflow.com/model/sam-3d-objects) |

## Caveats on the data

- The Tripo site returned 403 to our research run; its pricing comes from CostBench.
- csm.ai did not resolve; the CSM row is entirely third-party.
- The Luma Genie page now redirects; current status unknown.
- Gallery themes as shown by vendors: Meshy, riggable characters and stylised props. Rodin, a robot, a sci-fi weapon, a motorcycle, architecture. Sloyd, creatures, avatars, furniture, vehicles, weapons, trees, buildings. Kaedim, products, game props, characters.

## Where each approach fits

| Strength | Image/text-to-3D generators | Code recipes (ts23d) |
|---|---|---|
| Organic and sculpted forms | Strong | Weak ([what fits](idea/07-what-fits.md)) |
| Concept art → textured mesh in seconds | Strong | No |
| Auto-rigging | Several tools have it; meshes and rigs usually still need cleanup | Rigid part hierarchy only |
| Parts that line up, repeat or match real dimensions | Weaker | Strong |
| Named, animatable nodes | Usually one fused mesh | Built in |
| Determinism, diffable git history | No | Yes |
| Shared materials, consistent texel density | Per-asset textures | One trim sheet |
| Cost, licence conditions on outputs | Credits; terms vary by tier | Free; none |

The open-weight rows are what the planned [`/neural` adapter](idea/08-neural-adapters.md) wraps for the organic cases, on your own GPU, cached by content hash.
