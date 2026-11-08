# PBR showcase — the glTF material extensions on a test board

## Identity
Not a real-world object: a labelled board with one exhibit per glTF PBR extension ts23d writes,
so the beauty render, the gallery viewer and any engine can be checked against each other. Every
value below is a physical reference, not a measured part.

## Specs
| Exhibit | Extension(s) | Value | Source |
|---|---|---|---|
| red / blue flake, white gloss balls | `KHR_materials_clearcoat` (paint slot `{ colour, clearcoat, metallicFlake }`) | clearcoat 1, lacquer roughness 0.02–0.05 | [KHR_materials_clearcoat](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_clearcoat) |
| glass ball (Ø 0.32 m) | `KHR_materials_transmission` + `_ior` + `_volume` | IOR 1.5, thickness 0.32 m | [KHR_materials_volume](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_volume) |
| ice cube (0.22 m) | same, surface `ice` | IOR 1.31, blue absorption | [Refractive index of ice](https://en.wikipedia.org/wiki/Ice#Optical_properties) |
| water in a bowl | same, surface `liquid` | IOR 1.33, faint cyan depth | [KHR_materials_ior](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_ior) |
| jelly dome | same, surface `jelly` | IOR 1.35, roughness 0.25, pink absorption over 0.5 m | — |
| velvet pouf | `KHR_materials_sheen` (finish) | sheen `#f0b8e0`, roughness 0.45 | [KHR_materials_sheen](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_sheen) |
| brushed aluminium can | `KHR_materials_anisotropy` (finish) | strength 0.85 along +U (around the can) | [KHR_materials_anisotropy](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_anisotropy) |
| heat-tinted titanium exhaust | `KHR_materials_iridescence` (finish) | film IOR 2.2, 80–130 nm (TiO₂ oxide: straw → purple → blue) | [KHR_materials_iridescence](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_iridescence) |

## Parts
One static board (`plinth`), a dark pedestal per exhibit, flat block-letter labels at LOD0.
No moving parts.

## Open questions
- The beauty render approximates transmission in screen space (opaque-only buffer + refraction
  offset over the volume thickness); engines ray-march or use a transmission pass, so thick
  glass reads differently there.
- glTF iridescence without a thickness texture uses the maximum thickness, so the tube shows one
  tint shifting with angle, not the gradient of a real exhaust.
