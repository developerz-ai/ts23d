# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `review`: what an artist looks at before the next adjustment, as PNG sheets written
# beside the GLB (review-<step>-<view>.png; outputs after the report). Views: 'clay' (Workbench
# matcap + cavity, four sides), 'wire' (the same with the edges drawn), 'weights' (one tile per
# bone, weight as a blue → red heat map), 'poses' (one tile per pose of the step, the rest pose
# first), 'turnaround' (the baked base colour, studio light, four sides). The step changes
# nothing: helpers, pose and render settings are put back. Orthographic camera on LOD0's bounds;
# a sheet is about 2 × `size` px wide (four tiles of size / 2; weights: eight of size / 4).
# Tile names are in the report (`review[].tiles`, reading order). Workbench needs a GPU context:
# it renders with -b on a machine with a GPU (verified on 5.3 + RTX 3090; not without one).

import math
import os

import bpy
import numpy as np
from mathutils import Vector

from tasks.steps import review_sheet as sheet
from tasks.steps import state as st

SIDES = (("front", 0), ("three-quarter", 40), ("side", 90), ("back", 180))
HEAT = "t3d_heat"
MATCAPS = {"clay": ("clay_brown.exr", "clay_studio.exr"), "flat": ("basic_grey.exr", "basic_bright.exr", "basic_1.exr")}


def frame(obj, cam, azimuth, lo, hi):
    """Aim the orthographic camera at the bounds from `azimuth` degrees off the front (asset +X)."""
    centre = (lo + hi) / 2
    a = math.radians(azimuth)
    forward = Vector((math.sin(a), math.cos(a), -0.25)).normalized()  # the front is Blender −Y
    cam.location = centre - forward * (hi - lo).length * 2
    cam.rotation_euler = forward.to_track_quat("-Z", "Y").to_euler()
    size = hi - lo
    cam.data.ortho_scale = max(math.hypot(size.x, size.y), size.z) * 1.08


def heat_colours(obj, group):
    """Vertex colours: the weight of `group` as blue (0) → green → red (1)."""
    w = np.zeros(len(obj.data.vertices), dtype=np.float32)
    for v in obj.data.vertices:
        for g in v.groups:
            if g.group == group.index:
                w[v.index] = g.weight
    rgba = np.ones((len(w), 4), dtype=np.float32)
    rgba[:, 0] = np.clip(2 * w - 1, 0, 1) + 0.08
    rgba[:, 1] = 1 - np.abs(2 * w - 1)
    rgba[:, 2] = np.clip(1 - 2 * w, 0, 1) * 0.9 + 0.08
    rgba[w <= 0, :3] = 0.16
    layer = obj.data.color_attributes.get(HEAT) or obj.data.color_attributes.new(HEAT, "FLOAT_COLOR", "POINT")
    layer.data.foreach_set("color", rgba.ravel())
    obj.data.color_attributes.active_color = layer
    obj.data.color_attributes.render_color_index = list(obj.data.color_attributes).index(layer)
    return int((w > 0).sum())


SHADING = ("light", "studio_light", "color_type", "single_color", "show_cavity", "cavity_type", "show_object_outline")


class Studio:
    """Workbench set up for one look; `shot` renders the mesh from one side into a tile."""

    def __init__(self, state, tile):
        self.scene = bpy.context.scene
        self.obj = state.mesh
        self.tile = tile
        self.dir = state.work
        self.lo, self.hi, _ = st.bounds(self.obj)
        self.cam = st.link(bpy.data.objects.new("t3d_review_cam", bpy.data.cameras.new("t3d_review_cam")))
        self.cam.data.type = "ORTHO"
        self.keep = (self.scene.render.engine, self.scene.camera, self.scene.render.resolution_x,
                     self.scene.render.resolution_y, self.scene.render.filepath)
        r, sh = self.scene.render, self.scene.display.shading
        # Every render and shading setting the looks below touch, put back by close().
        self.render = {k: getattr(r, k) for k in ("resolution_percentage", "film_transparent")}
        self.format = r.image_settings.file_format
        self.shading = {k: (tuple(getattr(sh, k)) if k == "single_color" else getattr(sh, k)) for k in SHADING}
        self.hidden = {o.name: o.hide_render for o in self.scene.objects}
        for o in self.scene.objects:
            o.hide_render = o is not self.obj
        self.scene.camera = self.cam
        self.scene.render.engine = "BLENDER_WORKBENCH"
        self.scene.render.resolution_x = self.scene.render.resolution_y = tile
        self.scene.render.resolution_percentage = 100
        self.scene.render.image_settings.file_format = "PNG"
        self.scene.render.film_transparent = False
        self.count = 0

    def look(self, kind):
        shading = self.scene.display.shading
        shading.light = "STUDIO" if kind == "texture" else "MATCAP"
        for name in () if kind == "texture" else MATCAPS["clay" if kind == "clay" else "flat"]:
            try:  # the bundled matcaps differ between Blender lines: the first one present
                shading.studio_light = name
                break
            except TypeError:
                continue
        shading.color_type = {"clay": "SINGLE", "heat": "VERTEX", "texture": "TEXTURE", "wire": "OBJECT"}[kind]
        shading.single_color = (0.8, 0.8, 0.8)
        shading.show_cavity = kind in ("clay", "wire")
        shading.cavity_type = "BOTH"
        shading.show_object_outline = False
        if kind == "texture":  # Workbench shows the active image node: make it the base colour
            for mat in (m for m in self.obj.data.materials if m and m.node_tree):
                bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                links = bsdf.inputs["Base Color"].links if bsdf else ()
                if links and links[0].from_node.type == "TEX_IMAGE":
                    mat.node_tree.nodes.active = links[0].from_node

    def resize(self, tile):
        self.tile = tile
        self.scene.render.resolution_x = self.scene.render.resolution_y = tile

    def shot(self, azimuth, lo=None, hi=None):
        frame(self.obj, self.cam, azimuth, lo or self.lo, hi or self.hi)
        path = os.path.join(self.dir, f"review-tile-{self.count}.png")
        self.count += 1
        self.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        return sheet.read(path, self.tile)

    def close(self):
        s = self.scene
        s.render.engine, s.camera, s.render.resolution_x, s.render.resolution_y, s.render.filepath = self.keep
        for k, v in self.render.items():
            setattr(s.render, k, v)
        s.render.image_settings.file_format = self.format
        for k, v in self.shading.items():
            try:
                setattr(s.display.shading, k, v)
            except TypeError:  # a studio light name of another look's type: nothing to restore to
                pass
        bpy.data.objects.remove(self.cam, do_unlink=True)
        for name, hidden in self.hidden.items():
            if name in bpy.data.objects:
                bpy.data.objects[name].hide_render = hidden
        layer = self.obj.data.color_attributes.get(HEAT)
        if layer is not None:
            self.obj.data.color_attributes.remove(layer)


def wire_copy(obj, lo, hi):
    """The mesh's edges as thin black tubes (a Wireframe modifier on a copy, posed like it)."""
    copy = st.duplicate(obj, "t3d_review_wire")
    mod = copy.modifiers.new("t3d_wire", "WIREFRAME")
    mod.thickness = (hi - lo).length * 0.0012
    mod.use_replace = True
    copy.color = (0.02, 0.02, 0.02, 1)
    obj.color = (0.78, 0.78, 0.78, 1)
    return copy


def posed(state, studio, poses):
    """Rest pose, then each pose applied alone; the bounds follow the posed mesh."""
    arm = state.armature
    # The "rest" tile is the REST pose: a source rig's active clip (bind from 'source') and any
    # pose left on the bones are taken off for the tiles and put back after.
    data = arm.animation_data
    action = data.action if data else None
    if data:
        data.action = None
    was = [(b, b.location.copy(), b.rotation_mode, b.rotation_quaternion.copy(), b.rotation_euler.copy(), b.scale.copy())
           for b in arm.pose.bones]
    for b in arm.pose.bones:
        b.location, b.scale = (0, 0, 0), (1, 1, 1)
        b.rotation_quaternion, b.rotation_euler = (1, 0, 0, 0), (0, 0, 0)
    bpy.context.view_layer.update()
    tiles = [(studio.shot(40), "rest")]
    for p in poses:
        bone = arm.pose.bones.get(p["bone"])
        if bone is None:
            raise ValueError(f"review pose names bone {p['bone']!r}. fix: use one of {[b.name for b in arm.pose.bones]}")
        mode, euler = bone.rotation_mode, bone.rotation_euler.copy()
        bone.rotation_mode = "XYZ"
        setattr(bone.rotation_euler, p["axis"], math.radians(p["degrees"]))
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        co = np.array([v.co[:] for v in state.mesh.evaluated_get(dg).data.vertices], dtype=np.float32)
        lo = Vector(np.minimum(co.min(axis=0), np.array(studio.lo)).tolist())
        hi = Vector(np.maximum(co.max(axis=0), np.array(studio.hi)).tolist())
        tiles.append((studio.shot(40, lo, hi), f"{p['bone']} {p['axis']} {p['degrees']:g}°"))
        bone.rotation_euler, bone.rotation_mode = euler, mode
    for b, loc, mode, quat, eul, scale in was:
        b.location, b.rotation_mode, b.rotation_quaternion, b.rotation_euler, b.scale = loc, mode, quat, eul, scale
    if data:
        data.action = action
    bpy.context.view_layer.update()
    return tiles


def run(state, step):
    views, tile = step["views"], step["size"] // 2
    index = len(state.report["steps"])
    studio = Studio(state, tile)
    written = []
    try:
        for view in views:
            if view in ("weights", "poses") and state.armature is None:
                raise ValueError(f"review view {view!r} needs a bind step before it")
            if view in ("clay", "turnaround"):
                studio.look("clay" if view == "clay" else "texture")
                tiles = [(studio.shot(az), name) for name, az in SIDES]
            elif view == "wire":
                studio.look("wire")
                wire = wire_copy(state.mesh, studio.lo, studio.hi)
                wire.hide_render = False
                try:
                    tiles = [(studio.shot(az), name) for name, az in SIDES]
                finally:
                    bpy.data.objects.remove(wire, do_unlink=True)
            elif view == "weights":
                studio.look("heat")
                studio.resize(tile // 2)
                tiles = []
                for bone in state.armature.data.bones:
                    group = state.mesh.vertex_groups.get(bone.name)
                    if group is not None:
                        count = heat_colours(state.mesh, group)
                        tiles.append((studio.shot(60), f"{bone.name} ({count})"))
            else:
                studio.look("clay")
                tiles = posed(state, studio, step.get("poses") or [])
            name = f"review-{index}-{view}.png"
            size = sheet.write(os.path.join(state.work, name), tiles, studio.tile, 8 if view == "weights" else 4)
            studio.resize(tile)
            written.append({"step": index, "view": view, "file": name, "size": size, "tiles": [t[1] for t in tiles]})
    finally:
        studio.close()
    for i in range(studio.count):
        os.remove(os.path.join(state.work, f"review-tile-{i}.png"))
    state.report.setdefault("review", []).extend(written)
    return {"views": [w["view"] for w in written], "files": [w["file"] for w in written]}
