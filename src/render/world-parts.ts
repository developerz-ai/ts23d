// Every meshed part of a compiled asset in world space, as the CPU rasterisers read it: positions
// and normals transformed, attribute arrays length-checked (a coded error, never a RangeError),
// plus what the part is drawn with: its own texture set (ADR 016), a see-through opacity, or
// the trim sheet's alpha as a cutout mask.

import type { CompiledAsset, Mesh, TextureSet } from '../core/index.ts';
import { OPTICS, rotateZ, Ts23dError, toWorld, worldTransforms } from '../core/index.ts';

/** Attribute arrays the rasteriser reads must match the vertex count (QA: `mesh-arrays`). */
function checkArrays(m: Mesh, part: string): void {
  const n = m.positions.length;
  const wrong = [
    n % 3 === 0 ? '' : `positions ${n}`,
    m.normals.length === n ? '' : `normals ${m.normals.length}`,
    m.colors.length === n ? '' : `colors ${m.colors.length}`,
    m.uvs.length === (n / 3) * 2 ? '' : `uvs ${m.uvs.length}`,
    m.indices.length % 3 === 0 ? '' : `indices ${m.indices.length}`,
  ].filter((w) => w !== '');
  if (wrong.length)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `part '${part}' (${Math.floor(n / 3)} vertices) has attribute arrays of the wrong length: ${wrong.join(', ')}`,
      fix: 'run QA first (the mesh-arrays gate names it); a Mesh needs 3 normals, 2 uvs and 3 colours per vertex and 3 indices per triangle',
    });
}

export function worldParts(asset: CompiledAsset): {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array;
  /** The part's own texture set, its name (for errors) and whether it is alpha-tested. */
  textured?: { set: TextureSet; part: string; cutout: boolean };
  /** Set on a see-through part (glass, ice, liquid…): its alpha-blend opacity, 0–1. */
  opacity?: number;
  /** A cutout card on the trim sheet (leaves, needles, fur): alpha-tested against the sheet. */
  cutout?: true;
}[] {
  const xf = worldTransforms(asset.parts);
  const out = [];
  for (const p of asset.parts) {
    const t = xf.get(p.name);
    if (!p.mesh || !t) continue;
    checkArrays(p.mesh, p.name);
    const see = p.surface && p.surface !== 'opaque' && p.surface !== 'cutout' ? p.surface : null;
    const positions = new Float32Array(p.mesh.positions.length);
    const normals = new Float32Array(p.mesh.normals.length);
    for (let i = 0; i < positions.length; i += 3) {
      positions.set(
        toWorld(t, [
          p.mesh.positions[i] ?? 0,
          p.mesh.positions[i + 1] ?? 0,
          p.mesh.positions[i + 2] ?? 0,
        ]),
        i,
      );
      normals.set(
        rotateZ(
          [p.mesh.normals[i] ?? 0, p.mesh.normals[i + 1] ?? 0, p.mesh.normals[i + 2] ?? 0],
          t.yaw,
        ),
        i,
      );
    }
    out.push({
      positions,
      normals,
      colors: p.mesh.colors,
      indices: p.mesh.indices,
      uvs: p.mesh.uvs,
      ...(p.textures
        ? { textured: { set: p.textures, part: p.name, cutout: p.surface === 'cutout' } }
        : {}),
      ...(see ? { opacity: (asset.optics?.[see] ?? OPTICS[see]).alpha } : {}),
      ...(p.surface === 'cutout' && !p.textures ? { cutout: true as const } : {}),
    });
  }
  return out;
}
