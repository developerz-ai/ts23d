# SPDX-License-Identifier: GPL-2.0-or-later
# Step ops that tidy a mesh in place: `transform` (a matrix in the asset frame, applied to the
# mesh and its bake sources), `clean` (merge by distance, drop small shells and loose geometry,
# fill holes, consistent normals) and `symmetrize` (mirror one half across an asset-frame plane).

import bmesh
import bpy
from mathutils import Matrix

from tasks.steps import state as st


def transform(state, step):
    m = step["matrix"]
    asset = Matrix([m[0:4], m[4:8], m[8:12], m[12:16]])
    mat = st.ASSET @ asset @ st.ASSET.inverted()
    if abs(mat.determinant()) < 1e-12:
        raise ValueError("the matrix is singular")
    if state.source_rig is not None:
        raise ValueError(
            "transform on a source that came rigged would leave its armature and clips behind. "
            "fix: drop the transform; scale and turn the result in ts23d at import"
        )
    for o in state.objects():
        o.data.transform(mat)
        if mat.determinant() < 0:
            o.data.flip_normals()
        o.data.update()
    return {"determinant": round(mat.determinant(), 6)}


def shells(bm):
    """Connected face sets (by shared edges), largest first."""
    bm.faces.index_update()
    seen = bytearray(len(bm.faces))
    out = []
    for f in bm.faces:
        if seen[f.index]:
            continue
        seen[f.index] = 1
        stack, shell = [f], []
        while stack:
            g = stack.pop()
            shell.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if not seen[h.index]:
                        seen[h.index] = 1
                        stack.append(h)
        out.append(shell)
    out.sort(key=len, reverse=True)
    return out


def clean(state, step):
    me = state.mesh.data
    bm = bmesh.new()
    bm.from_mesh(me)
    facts = {"vertices": len(bm.verts)}
    if step["weld"] > 0:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=step["weld"])
    facts["welded"] = facts.pop("vertices") - len(bm.verts)
    dropped = 0
    if step["minShell"] > 0 and bm.faces:
        found = shells(bm)
        floor = step["minShell"] * len(bm.faces)
        small = [f for shell in found[1:] if len(shell) < floor for f in shell]
        dropped = sum(1 for shell in found[1:] if len(shell) < floor)
        facts["shells"] = len(found)
        if small:
            bmesh.ops.delete(bm, geom=small, context="FACES")
    facts["shellsDropped"] = dropped
    if step["manifold"]:
        bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
    if step["fillHoles"] > 0:
        before = len(bm.faces)
        filled = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=step["fillHoles"])
        bmesh.ops.triangulate(bm, faces=[f for f in filled["faces"] if len(f.verts) > 3])
        facts["holeFaces"] = len(bm.faces) - before
    if step["manifold"]:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    facts["nonManifoldEdges"] = sum(1 for e in bm.edges if not e.is_manifold)
    if not bm.faces:
        raise ValueError("clean left no faces")
    bm.to_mesh(me)
    bm.free()
    me.update()
    return facts


def symmetrize(state, step):
    axis, sign = st.AXES[step["axis"]]
    keep_positive = (sign > 0) == (step["side"] == "+")
    direction = f"{'POSITIVE' if keep_positive else 'NEGATIVE'}_{axis}"
    with st.edit(state.mesh):
        bpy.ops.mesh.symmetrize(direction=direction, threshold=1e-4)
    return {"direction": direction}
