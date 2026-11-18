# SPDX-License-Identifier: GPL-2.0-or-later
# Checkpoints of a Blender session (session.py): `save` writes the scene as an uncompressed .blend
# plus a JSON map from the State's fields to object and image names; `restore` opens the .blend
# (every Python reference to Blender data dies there) and rebuilds the State from that map. Baked
# images are packed so their pixels travel in the file. Measured on a 906,084-triangle source:
# about 0.03 s to save (100 MB), 0.07 s to load, so every batch that changes the mesh gets one.

import json
import os

import bpy

OBJECTS = ("mesh", "colour_src", "shape_src", "armature", "source_rig", "rig_src")


def name_of(obj):
    return None if obj is None else obj.name


def save(state, blend, extra):
    """Write `blend` and `blend`.json; `extra` is kept beside the State's own fields."""
    if bpy.context.view_layer.objects.active and bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for img in state.images.values():
        img.use_fake_user = True  # an image only the State holds would not be written
        if not img.packed_file:
            img.pack()
    for action in bpy.data.actions:
        action.use_fake_user = True  # a source rig's clips, whether or not a track holds them
    meta = {
        **{f: name_of(getattr(state, f)) for f in OBJECTS},
        "lods": [o.name for o in state.lods],
        "images": {kind: img.name for kind, img in state.images.items()},
        "maxInfluences": state.max_influences,
        "skeleton": state.skeleton,
        "report": state.report,
        "extra": extra,
    }
    bpy.ops.wm.save_as_mainfile(filepath=blend, copy=True, compress=False, check_existing=False)
    with open(f"{blend}.json", "w", encoding="utf-8") as f:
        json.dump(meta, f)
    return os.path.getsize(blend)


def restore(state, blend):
    """Back to the checkpoint: the scene and every State field. Returns its `extra`."""
    with open(f"{blend}.json", encoding="utf-8") as f:
        meta = json.load(f)
    bpy.ops.wm.open_mainfile(filepath=blend, load_ui=False, use_scripts=False)
    for field in OBJECTS:
        setattr(state, field, bpy.data.objects[meta[field]] if meta[field] else None)
    state.lods = [bpy.data.objects[name] for name in meta["lods"]]
    state.images = {kind: bpy.data.images[name] for kind, name in meta["images"].items()}
    state.max_influences = meta["maxInfluences"]
    state.skeleton = meta["skeleton"]
    state.report = meta["report"]
    return meta["extra"]


def drop(blend):
    for path in (blend, f"{blend}1", f"{blend}.json"):
        if os.path.exists(path):
            os.remove(path)
