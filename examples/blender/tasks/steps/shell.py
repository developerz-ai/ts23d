# SPDX-License-Identifier: GPL-2.0-or-later
# The solid shell retopo reduces: ONE closed, filled surface of a source that may leak. An
# image-to-3D mesh is often a thin crust (two walls ~1.5 mm apart) with tunnels through it; a
# voxel remesh finer than a tunnel floods the inside and returns confetti (thousands of closed
# specks: measured 4,026 on a Pixal3D wolf at 5.4 mm, one solid at 12 mm). `solid` therefore
# tries the plain remesh, measures it, and escalates to a morphological closing in SDF grids
# (Geometry Nodes, Blender >= 5.0): dilate by k voxels (both walls fuse, tunnels under 2 k voxels
# shut), voxel-fill (an enclosed cavity is inside), erode by k voxels less `skin`. A candidate is
# accepted when its largest component holds >= 90 % of the faces, its volume is >= 70 % of a coarse
# closed reference, no side of its bounding box moved more than 2 voxels + skin and at most 1 % of
# the source surface lies outside it (gates.lost). An erosion turns a sheet thinner than a voxel
# into lace (many tunnels): then, or when parts are lost, the closing is redone 0.75 voxel fat.

import math

import bmesh
import bpy
import numpy as np

from tasks.steps import gates
from tasks.steps import state as st
from tasks.steps.remesh import voxel_shell

CLOSE_STEPS = (0, 1, 2, 4)  # voxels of closing radius tried in order when the step names none
MIN_LARGEST = 0.9
MIN_VOLUME = 0.7
MAX_LOST = 0.01  # share of the source surface farther than (1.5 + skin) voxels from the shell
AUTO_SKIN = 0.75  # voxels: a sheet of no thickness comes out 1.5 voxels thick
MAX_HANDLES = 16  # tunnels through an eroded shell: more is lace (a sheet thinner than a voxel)
EMPTY = {"handles": 0, "components": 0, "largestShare": 0.0, "volume": 0.0, "bboxDrift": 0.0, "bboxSide": "", "lost": {"share": 1.0}}
REFERENCE_DIVISIONS = 110  # the reference solid: voxel = diagonal / this, closed by 2 voxels


def has_grids():
    return hasattr(bpy.types, "GeometryNodeMeshToSDFGrid") and hasattr(bpy.types, "GeometryNodeGridToMesh")


def sdf_iso(obj, voxel, band, threshold):
    """Replace the mesh by the `threshold` iso-surface of its distance grid (positive: outside)."""
    group = bpy.data.node_groups.new("t3d_iso", "GeometryNodeTree")
    group.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    group.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nodes, links = group.nodes, group.links
    grid = nodes.new("GeometryNodeMeshToSDFGrid")
    grid.inputs["Voxel Size"].default_value = voxel
    grid.inputs["Band Width"].default_value = band
    mesh = nodes.new("GeometryNodeGridToMesh")
    mesh.inputs["Threshold"].default_value = threshold
    links.new(nodes.new("NodeGroupInput").outputs[0], grid.inputs["Mesh"])
    links.new(grid.outputs[0], mesh.inputs["Grid"])
    links.new(mesh.outputs[0], nodes.new("NodeGroupOutput").inputs[0])
    mod = obj.modifiers.new("t3d_iso", "NODES")
    mod.node_group = group
    st.apply_modifier(obj, mod)
    bpy.data.node_groups.remove(group)
    if not obj.data.polygons:
        raise ValueError(f"the distance grid at {voxel:.5f} m has no surface at {threshold:.5f} m")


def close(obj, voxel, k, skin):
    """Closing by k voxels: dilate, fill, erode by (k − skin) voxels. k = 0: the plain remesh."""
    if k > 0:
        band = int(math.ceil(k)) + 2
        sdf_iso(obj, voxel, band, k * voxel)
        voxel_shell(obj, voxel)
        sdf_iso(obj, voxel, band, -(k - skin) * voxel)
        obj.data.materials.clear()
        st.smooth_shade(obj)
    else:
        voxel_shell(obj, voxel)


def keep_largest(obj):
    """Drop every connected component but the largest. Returns (components, largest face share)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.index_update()
    label = np.full(len(bm.faces), -1, dtype=np.int32)
    sizes = []
    for f in bm.faces:
        if label[f.index] >= 0:
            continue
        label[f.index] = len(sizes)
        stack, n = [f], 0
        while stack:
            g = stack.pop()
            n += 1
            for e in g.edges:
                for h in e.link_faces:
                    if label[h.index] < 0:
                        label[h.index] = len(sizes)
                        stack.append(h)
        sizes.append(n)
    best = int(np.argmax(sizes))
    if len(sizes) > 1:
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if label[f.index] != best], context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(obj.data)
        obj.data.update()
    bm.free()
    return len(sizes), sizes[best] / max(1, sum(sizes))


def volume(obj):
    """Signed volume of a closed mesh (m³)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    v = bm.calc_volume(signed=True)
    bm.free()
    return float(v)


def reference_volume(source, diag):
    """The volume of a coarse closed solid of the source: what a filled shell must come near."""
    ref = st.duplicate(source, "shell_reference")
    try:
        close(ref, diag / REFERENCE_DIVISIONS, 2 if has_grids() else 0, 0.0)
        keep_largest(ref)
        return abs(volume(ref))
    finally:
        bpy.data.objects.remove(ref, do_unlink=True)


def solid(obj, voxel, wanted=None, skin=None):
    """Make `obj` its solid shell at `voxel`. `wanted`: closing radius in voxels, or None to
    escalate; `skin`: voxels of fattening, or None to add AUTO_SKIN only when thin parts vanish.
    Returns facts; raises naming the measure when no radius gives one filled, complete surface."""
    lo, hi, diag = st.bounds(obj)
    ref = reference_volume(obj, diag)
    radii = CLOSE_STEPS if wanted is None else (wanted,)
    if not has_grids():
        if wanted or skin:
            raise ValueError(f"retopo close / skin need SDF grid nodes (Blender >= 5.0); this is {bpy.app.version_string}")
        radii = (0,)
    tries = [(k, skin or 0.0) for k in radii]
    seen = []
    while tries:
        k, fat = tries.pop(0)
        fat = fat if k > 0 else 0.0
        cand = st.duplicate(obj, "shell_candidate")
        try:
            close(cand, voxel, k, fat)
        except ValueError:  # no surface at all at this radius: a failed try, like confetti
            bpy.data.objects.remove(cand, do_unlink=True)
            seen.append({**EMPTY, "close": k, "skin": fat, "volumeRef": round(ref, 6)})
            continue
        count, share = keep_largest(cand)
        vol = abs(volume(cand))
        clo, chi, _ = st.bounds(cand)
        moved, side = gates.drift(clo, chi, lo, hi)
        thin = gates.lost(obj, cand, (1.5 + fat) * voxel)
        fact = {
            "close": k,
            "skin": fat,
            "components": count,
            "largestShare": round(share, 4),
            "volume": round(vol, 6),
            "volumeRef": round(ref, 6),
            "bboxDrift": round(moved, 5),
            "bboxSide": side,
            "lost": thin,
            "handles": gates.handles(cand),
        }
        seen.append(fact)
        filled = share >= MIN_LARGEST and vol >= MIN_VOLUME * ref
        lace = fact["handles"] > MAX_HANDLES and skin is None and fat == 0.0 and k > 0
        if filled and moved <= (2 + fat) * voxel and thin["share"] <= MAX_LOST and not lace:
            old = obj.data
            obj.data = cand.data
            bpy.data.objects.remove(cand, do_unlink=True)
            if old.users == 0:
                bpy.data.meshes.remove(old)
            return {**fact, "tried": [[s["close"], s["skin"], s["lost"]["share"], s["handles"]] for s in seen]}
        bpy.data.objects.remove(cand, do_unlink=True)
        if filled and skin is None and fat == 0.0 and has_grids():
            tries = [(max(k, 1), AUTO_SKIN)]  # filled, but thin parts are gone or lace: keep them fatter
    last = seen[-1]
    where = f" around {last['lost'].get('where', '?')} {last['lost'].get('centre', '')}" if last["lost"]["share"] > MAX_LOST else ""
    raise ValueError(
        f"the shell is not one filled, complete surface at voxel {voxel:.5f} m (close {last['close']}, skin "
        f"{last['skin']}: {last['components']} components, the largest {last['largestShare']:.0%} of the faces; "
        f"volume {last['volume']:.5f} of {last['volumeRef']:.5f} m³; bbox side {last['bboxSide']} moved "
        f"{last['bboxDrift']:.4f} m; {last['lost']['share']:.1%} of the source surface lost{where}). "
        "fix: lower retopo voxel or raise skin for thin parts, raise close for a source with wide openings, "
        "or use strategy 'decimate' on a source that is already one clean surface"
    )
