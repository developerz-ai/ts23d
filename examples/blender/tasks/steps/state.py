# SPDX-License-Identifier: GPL-2.0-or-later
# What the step ops of the `blender` task share: the State one program runs on (the working mesh
# that becomes lod0, the bake sources, LOD copies, armature, baked images, the report), the frame
# turns (ts23d asset frame and glTF frame → Blender), and small object helpers (activate,
# duplicate, apply a modifier, triangle count, bounds). Ops are functions `run(state, step)` that
# return a dict of facts for the report.

import bpy
import numpy as np
from mathutils import Matrix, Vector

# ts23d asset frame (Z up, +X front, +Y left) → Blender (Z up, −Y front, +X left).
ASSET = Matrix(((0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
# Asset axis → (Blender axis, sign): asset +x is Blender −y, asset +y is Blender +x.
AXES = {"x": ("Y", -1), "y": ("X", 1), "z": ("Z", 1)}


def from_asset(p):
    return Vector((p[1], -p[0], p[2]))


def from_gltf(p):
    """glTF (Y up, +Z front) → Blender, the turn the bundled importer makes."""
    return Vector((p[0], -p[2], p[1]))


def to_gltf(p):
    return [round(p[0], 6), round(p[2], 6), round(-p[1], 6)]


class State:
    def __init__(self, request, inputs, work):
        self.request = request
        self.inputs = inputs
        self.work = work
        self.mesh = None  # the working object; exported as lod0
        self.colour_src = None  # the mesh before its UVs / materials were replaced
        self.shape_src = None  # the mesh before retopo: normals and AO bake from it
        self.lods = []
        self.armature = None
        self.source_rig = None  # the input GLB's own armature, when it came rigged
        self.rig_src = None  # that GLB's skinned mesh as loaded: where a bind from 'source' reads weights
        self.skeleton = None  # parsed t3d-skeleton/1, when the request sent one
        self.max_influences = None
        self.images = {}  # 'albedo' | 'normal' | 'orm' → bpy image
        self.report = {"contract": "t3d-blender-report/1", "steps": []}

    def objects(self):
        """Every mesh the program holds: the working mesh, its sources, its LODs."""
        seen = []
        for o in (self.mesh, self.colour_src, self.shape_src, self.rig_src, *self.lods):
            if o is not None and o not in seen:
                seen.append(o)
        return seen

    def keep_colour_source(self):
        """Before an op replaces UVs or materials: keep the mesh as it is. True when kept now."""
        if self.colour_src is not None:
            return False
        self.colour_src = duplicate(self.mesh, "colour_source")
        return True

    def drop_sources(self):
        for o in {self.colour_src, self.shape_src, self.rig_src} - {None}:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data.users == 0:  # or its name ('lod0') stays taken
                bpy.data.meshes.remove(data)
        self.colour_src = self.shape_src = self.rig_src = None


def activate(obj, *more):
    """Select `obj` (and `more`), make it active, in object mode."""
    if bpy.context.view_layer.objects.active and bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for o in (obj, *more):
        o.select_set(True)
    bpy.context.view_layer.objects.active = obj


class edit:
    """`with edit(obj):` edit mode on `obj` with everything selected."""

    def __init__(self, obj):
        self.obj = obj

    def __enter__(self):
        activate(self.obj)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_mode(type="VERT")
        bpy.ops.mesh.select_all(action="SELECT")
        return self.obj

    def __exit__(self, *exc):
        bpy.ops.object.mode_set(mode="OBJECT")
        return False


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def duplicate(obj, name):
    """A copy with its own mesh data (modifiers, vertex groups, UVs and materials kept)."""
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    copy.data.name = name
    return link(copy)


def apply_modifier(obj, mod):
    """Apply `mod` as the first in the stack, so an Armature modifier below it is untouched."""
    activate(obj)
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def coords(obj):
    """Vertex positions as an (n, 3) float32 array (object space = world: transforms are applied)."""
    co = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def bounds(obj):
    """(min, max, diagonal) of a mesh object's vertices."""
    co = coords(obj)
    if len(co) == 0:
        raise ValueError("the mesh has no vertices")
    lo, hi = co.min(axis=0), co.max(axis=0)
    return Vector(lo.tolist()), Vector(hi.tolist()), float(np.linalg.norm(hi - lo))


def boundary_edges(obj):
    """Edges with one face: 0 on a closed mesh."""
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    count = sum(1 for e in bm.edges if e.is_boundary)
    bm.free()
    return count


def smooth_shade(obj):
    """Smooth normals from the geometry: imported split normals do not survive a new topology."""
    activate(obj)
    if any(a.name == "custom_normal" for a in obj.data.attributes):
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    obj.data.shade_smooth()


def triangulate(obj):
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
