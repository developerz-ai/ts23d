# SPDX-License-Identifier: GPL-2.0-or-later
# Shared helpers for ts23d Blender tasks: an empty factory scene pinned to one thread, GLB import
# and export through the bundled Khronos glTF add-on, joining meshes, and the input lookup by the
# request's sha256 fields. Deterministic settings live here so every task gets them.

import bpy


def reset_scene():
    """Factory settings, empty scene, one render thread, 24 fps."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 1
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_current = 1


def input_file(request, field, inputs):
    """The path of the input the request names in `field` ({ sha256, mime })."""
    ref = request.get(field)
    if not isinstance(ref, dict) or ref.get("sha256") not in inputs:
        raise ValueError(f"request.{field} names no input that was sent")
    return inputs[ref["sha256"]]


def import_glb(path):
    """Import a GLB; returns the new objects (glTF Y-up becomes Blender Z-up)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def meshes(objects):
    return [o for o in objects if o.type == "MESH"]


def join(objects, name):
    """Join mesh objects into one with transforms applied; returns it."""
    objs = meshes(objects)
    if not objs:
        raise ValueError(f"{name}: the GLB has no mesh")
    for o in objs:
        o.parent = None
    select_only(objs)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = name
    obj.data.name = name
    return obj


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)


def export_glb(path, objects, animations=False, skins=False):
    """Export exactly `objects` to a GLB (Y-up), modifiers applied."""
    select_only(objects)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=animations,
        export_skins=skins,
        export_def_bones=skins,
        export_materials="EXPORT",
        export_extras=False,
    )


def evaluated_copy(obj, name):
    """A new object holding `obj`'s evaluated mesh (modifiers / sim applied)."""
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)
    mesh.name = name
    out = bpy.data.objects.new(name, mesh)
    out.matrix_world = obj.matrix_world.copy()
    bpy.context.scene.collection.objects.link(out)
    return out


def bounds(obj):
    """World-space (min, max) of a mesh object's vertices."""
    mw = obj.matrix_world
    pts = [mw @ v.co for v in obj.data.vertices]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    return lo, hi
