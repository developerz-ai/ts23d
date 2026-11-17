# SPDX-License-Identifier: GPL-2.0-or-later
# In and out of a step program: `load` imports the request's mesh GLB as one object (world
# transforms kept, then applied; empties dropped; a rig the meshes are skinned to is kept with
# its clips, see rig_source.py), `export` writes output-0.glb — nodes
# lod0 / lod1 / lod2, PNG images, a skin when bound (and every clip of a kept source rig), no
# tangents (ts23d computes MikkTSpace) —
# and reads the file back to report what it holds (nodes, image mimes, joints) and to refuse a
# material that is not opaque or a base colour image that is not an RGB PNG.

import json
import os
import struct

import bpy

from tasks import common
from tasks.steps import rig_source
from tasks.steps import state as st


def load(state):
    """Import request.mesh, join its meshes into the working object."""
    path = common.input_file(state.request, "mesh", state.inputs)
    fps = rig_source.clip_fps(path)
    if fps is not None:
        bpy.context.scene.render.fps = fps
    imported = common.import_glb(path)
    imported = rig_source.without_bone_shapes(imported)
    meshes = common.meshes(imported)
    if not meshes:
        raise ValueError("request.mesh has no mesh")
    for o in meshes:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
    armature = rig_source.armature_of(meshes)
    kept = rig_source.ancestors(armature)
    others = [o.name for o in imported if o.type != "MESH" and o.name not in kept]
    st.activate(meshes[0], *meshes[1:])
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    rig = rig_source.keep(state, obj, armature) if armature is not None else None
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    obj.vertex_groups.clear()
    for name in others:
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    obj.name = obj.data.name = "lod0"
    state.mesh = obj
    textures = sum(
        1
        for m in obj.data.materials
        if m and m.node_tree
        for n in m.node_tree.nodes
        if n.type == "TEX_IMAGE" and n.image
    )
    return {
        **({"rig": {**rig, "fps": bpy.context.scene.render.fps}} if rig else {}),
        "triangles": st.triangles(obj),
        "materials": len(obj.data.materials),
        "textures": textures,
        "uvLayers": len(obj.data.uv_layers),
        "vertexColours": len(obj.data.color_attributes),
    }


def run(state, step):
    """`export`: one GLB with every LOD."""
    state.drop_sources()
    lods = [state.mesh, *state.lods]
    for i, o in enumerate(lods):
        o.name = o.data.name = f"lod{i}"
    for kind in ("albedo", "normal", "orm"):
        img, want = state.images.get(kind), step.get(f"{kind}Size")
        if img is not None and want and want != img.size[0]:
            img.scale(want, want)
        if img is not None:
            img.filepath_raw = os.path.join(state.work, f"tex-{kind}.png")
            img.file_format = "PNG"
            img.save()
    bound = state.armature is not None
    animated = bound and state.armature is state.source_rig
    st.activate(lods[0], *lods[1:], *([state.armature] if bound else []))
    path = os.path.join(state.work, "output-0.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_animations=animated,
        export_morph=False,
        export_skins=bound,
        export_all_influences=bool(bound and (state.max_influences or 4) > 4),
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_vertex_color="NONE" if state.images else "MATERIAL",
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )
    facts = read_back(path)
    if animated:
        want = sorted(c["name"] for c in state.report["source"]["rig"]["clips"])
        if sorted(a["name"] for a in facts["animations"]) != want:
            raise ValueError(
                f"the GLB holds animations {[a['name'] for a in facts['animations']]}, the source had {want}. "
                "fix: keep the source armature's actions (a script step must not remove or rename them)"
            )
        frame = 1.5 / bpy.context.scene.render.fps
        source = {c["name"]: c["seconds"] for c in state.report["source"]["rig"]["clips"]}
        off = [a for a in facts["animations"] if abs(a["seconds"] - source[a["name"]]) > frame]
        if off:
            raise ValueError(
                f"clip {off[0]['name']!r} is {off[0]['seconds']} s in the GLB, {source[off[0]['name']]} s in the source. "
                "fix: report it (the scene frame rate must match the clips': source.rig.fps)"
            )
    lo, hi, _ = st.bounds(state.mesh)
    lo, hi = st.to_gltf(lo), st.to_gltf(hi)
    state.report["bbox"] = {
        "frame": "gltf",
        "min": [min(lo[i], hi[i]) for i in range(3)],
        "max": [max(lo[i], hi[i]) for i in range(3)],
    }
    state.report["lods"] = [st.triangles(o) for o in lods]
    state.report["glb"] = facts
    return {"bytes": os.path.getsize(path), "images": {k: i.size[0] for k, i in state.images.items()}}


def read_back(path):
    """What the written GLB holds, from its JSON chunk: the layout the importer relies on."""
    with open(path, "rb") as f:
        magic, _version, _length = struct.unpack("<4sII", f.read(12))
        size, kind = struct.unpack("<I4s", f.read(8))
        if magic != b"glTF" or kind != b"JSON":
            raise ValueError("the exporter wrote no glTF binary")
        doc = json.loads(f.read(size).decode("utf-8"))
        f.read(8)
        blob = f.read()
    nodes = doc.get("nodes", [])
    for m in doc.get("materials", []):
        if m.get("alphaMode", "OPAQUE") != "OPAQUE":
            raise ValueError(
                f"material {m.get('name')!r} was exported with alphaMode {m['alphaMode']}: a game mesh is an "
                "opaque coat. fix: unlink Alpha in the material (a script step that set it), or bake again"
            )
    images = []
    for i in doc.get("images", []):
        view = doc["bufferViews"][i["bufferView"]]
        head = blob[view.get("byteOffset", 0) :][:26]
        png = head[:8] == b"\x89PNG\r\n\x1a\n"
        if not png:
            raise ValueError(f"image {i.get('name')!r} is {i.get('mimeType')}, not PNG. fix: report this exporter setting")
        images.append({"name": i.get("name", ""), "mime": i.get("mimeType", ""), "channels": {0: 1, 2: 3, 4: 2, 6: 4}.get(head[25], 0)})
    for m in doc.get("materials", []):
        base = m.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if base is not None and images[doc["textures"][base["index"]]["source"]]["channels"] != 3:
            raise ValueError(f"the base colour image of {m.get('name')!r} is not RGB: it carries alpha. fix: bake the albedo again")
    mesh_nodes = sorted(n.get("name", "") for n in nodes if "mesh" in n)
    if "lod0" not in mesh_nodes:
        raise ValueError(f"the GLB has mesh nodes {mesh_nodes}, no 'lod0'")
    skins = doc.get("skins", [])
    return {
        "meshNodes": mesh_nodes,
        "images": images,
        "materials": [
            {
                "name": m.get("name", ""),
                "textures": sorted(
                    k for k in (*m, *m.get("pbrMetallicRoughness", {})) if k.endswith("Texture")
                ),
            }
            for m in doc.get("materials", [])
        ],
        "skins": len(skins),
        "joints": [nodes[j].get("name", "") for j in skins[0].get("joints", [])] if skins else [],
        "animations": [
            {
                "name": a.get("name", ""),
                "channels": len(a.get("channels", [])),
                "seconds": round(max((doc["accessors"][s["input"]].get("max") or [0])[0] for s in a["samplers"]), 4),
            }
            for a in doc.get("animations", [])
        ],
        "uvOrigin": "top-left (glTF)",
    }
