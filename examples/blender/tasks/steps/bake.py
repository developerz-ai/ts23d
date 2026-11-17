# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `bake`: Cycles selected-to-active from the sources onto the UV'd shell. Albedo (and
# roughness / metallic) are EMIT bakes of one material channel of the colour source
# (bake_source.py); normal (tangent space) and AO come from the shape source with its own
# materials. The ORM map packs R = AO, G = roughness, B = metallic (unbaked channels: 1, 0.8, 0).
# Rays start `cage` outside the shell (2 % of the bbox diagonal) and reach `maxRay` (2 × cage).
# Two 1-sample probe bakes at <= 512 px measure the hit rate: texels the source covered / texels
# the UV islands cover (the colour source when a colour map is asked, else the shape source). The
# albedo is a solid coat: texels the source did not reach take the nearest colour (fill.py), the
# share of them is reported and gated, the image is RGB. GPU when Cycles finds one (OptiX, CUDA,
# HIP, Metal, oneAPI), CPU else.

import bpy
import numpy as np

from tasks.steps import bake_source, fill
from tasks.steps import state as st

GPUS = ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI")
MAX_UNFILLED = 0.02  # share of island texels the colour source did not reach, before the fill


def pick_device(scene):
    """The Cycles device for this bake: the first GPU backend with a device, else the CPU."""
    scene.render.engine = "CYCLES"
    addon = bpy.context.preferences.addons.get("cycles")
    for kind in GPUS if addon else ():
        prefs = addon.preferences
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        found = [d for d in prefs.devices if d.type == kind]
        if found:
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = "GPU"
            return f"{kind}: {found[0].name}"
    scene.cycles.device = "CPU"
    return "CPU"


def pixels(img):
    px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(-1, 4)


class Target:
    """The shell's material while baking: one unlinked image node per map, the active one is baked."""

    def __init__(self, low):
        self.mat = bpy.data.materials.new("body")
        self.mat.use_nodes = True
        self.tree = self.mat.node_tree
        self.bsdf = next(n for n in self.tree.nodes if n.type == "BSDF_PRINCIPLED")
        low.data.materials.clear()
        low.data.materials.append(self.mat)

    def image(self, name, size, srgb=False, alpha=False):
        img = bpy.data.images.new(f"t3d_{name}", size, size, alpha=alpha)
        img.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
        node = self.tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        for n in self.tree.nodes:
            n.select = False
        node.select = True
        self.tree.nodes.active = node
        return img

    def node_of(self, img):
        return next(n for n in self.tree.nodes if n.type == "TEX_IMAGE" and n.image == img)

    def wire(self, images):
        """Link the baked maps into the Principled BSDF the glTF exporter reads."""
        links, nodes = self.tree.links, self.tree.nodes
        for n in [n for n in nodes if n.type == "TEX_IMAGE" and n.image not in images.values()]:
            bpy.data.images.remove(n.image)
            nodes.remove(n)
        if "albedo" in images:
            links.new(self.node_of(images["albedo"]).outputs["Color"], self.bsdf.inputs["Base Color"])
        if "normal" in images:
            nm = nodes.new("ShaderNodeNormalMap")
            links.new(self.node_of(images["normal"]).outputs["Color"], nm.inputs["Color"])
            links.new(nm.outputs["Normal"], self.bsdf.inputs["Normal"])
        self.bsdf.inputs["Roughness"].default_value = bake_source.FLAT["Roughness"]
        self.bsdf.inputs["Metallic"].default_value = 0.0
        if "orm" in images:
            split = nodes.new("ShaderNodeSeparateColor")
            links.new(self.node_of(images["orm"]).outputs["Color"], split.inputs["Color"])
            links.new(split.outputs["Green"], self.bsdf.inputs["Roughness"])
            links.new(split.outputs["Blue"], self.bsdf.inputs["Metallic"])
            group = bpy.data.node_groups.get("glTF Material Output")
            if group is None:  # the exporter reads occlusion from a group of this name
                group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
                group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
            occlusion = nodes.new("ShaderNodeGroup")
            occlusion.node_tree = group
            links.new(split.outputs["Red"], occlusion.inputs["Occlusion"])


def run(state, step):
    low, colour = state.mesh, state.colour_src
    shape = state.shape_src or colour
    if colour is None or not low.data.uv_layers:
        raise ValueError("bake needs a uv step before it")
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("t3d_world")
    device = pick_device(scene)
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    _, _, diag = st.bounds(low)
    cage = step.get("cage") or 0.02 * diag
    bake = scene.render.bake
    bake.use_selected_to_active = True
    bake.cage_extrusion = cage
    bake.max_ray_distance = step.get("maxRay") or 2 * cage
    bake.margin_type = "ADJACENT_FACES"
    bake.use_clear = True
    bake.normal_space = "TANGENT"
    size, maps = step["size"], step["maps"]
    target = Target(low)

    def shoot(source, kind, name, samples=1, margin=step["margin"], px=size, srgb=False, channel=None, alpha=False):
        img = target.image(name, px, srgb, alpha)
        undo, origins = bake_source.emit(source, channel) if channel else ([], [])
        scene.cycles.samples = samples
        bake.margin = margin
        bake.use_selected_to_active = source is not low
        for o in scene.objects:  # nothing but the pair may occlude or be hit
            o.hide_render = o not in (low, source)
        st.activate(low, source)
        try:
            bpy.ops.object.bake(type=kind)
        finally:
            bake_source.restore(undo)
        return img, origins

    facts = {"device": device, "size": size, "maps": list(maps), "cage": round(cage, 6)}
    probe = min(size, 512)
    probed = colour if {"albedo", "roughness"} & set(maps) else shape
    hit, _ = shoot(probed, "EMIT", "hit", margin=0, px=probe, channel="white")
    cover, _ = shoot(low, "EMIT", "cover", margin=0, px=probe, channel="white")
    covered = pixels(cover)[:, 0] > 0.5
    struck = (pixels(hit)[:, 0] > 0.5) & covered
    if not covered.any() or not struck.any():
        raise ValueError("the bake hit nothing: check the shell overlaps its source, or raise cage")
    facts["hitRate"] = round(float(struck.sum()) / float(covered.sum()), 4)
    facts["uvCoverage"] = round(float(covered.mean()), 4)

    images = {}
    if "albedo" in maps:
        raw, origins = shoot(colour, "EMIT", "albedo_raw", srgb=True, channel="Base Color", alpha=True)
        facts["albedoFrom"] = origins[0] if len(origins) == 1 else "mixed"
        rgba = pixels(raw).reshape(size, size, 4)
        inside = np.kron(covered.reshape(probe, probe), np.ones((size // probe, size // probe), dtype=bool))
        facts["albedoUnfilled"] = fill.solid_coat(rgba, inside)
        if facts["albedoUnfilled"] > MAX_UNFILLED:
            raise ValueError(
                f"{facts['albedoUnfilled']:.1%} of the albedo texels inside the UV islands got no colour "
                f"(limit {MAX_UNFILLED:.0%}; hit rate {facts['hitRate']}): the coat would have holes. fix: raise "
                "bake cage / maxRay so rays reach the source, or check the shell follows its source (retopo facts)"
            )
        rgb = rgba.reshape(-1, 4)[:, :3]
        lit = rgb.max(axis=1) > 1 / 255
        if not lit.any():
            raise ValueError("the albedo bake is black: the colour source emitted nothing")
        facts["albedoMean"] = round(float(rgb[lit].mean()), 4)  # over the texels that got colour
        images["albedo"] = target.image("albedo", size, srgb=True)
        images["albedo"].pixels.foreach_set(rgba.ravel())
    if "normal" in maps:
        images["normal"], _ = shoot(shape, "NORMAL", "normal", samples=step["samples"])
    if "ao" in maps or "roughness" in maps:
        n = size * size
        orm = np.empty((n, 4), dtype=np.float32)
        orm[:] = (1.0, bake_source.FLAT["Roughness"], bake_source.FLAT["Metallic"], 1.0)
        if "ao" in maps:
            orm[:, 0] = pixels(shoot(shape, "AO", "ao", samples=step["aoSamples"])[0])[:, 0]
        if "roughness" in maps:
            orm[:, 1] = pixels(shoot(colour, "EMIT", "rough", channel="Roughness")[0])[:, 0]
            orm[:, 2] = pixels(shoot(colour, "EMIT", "metal", channel="Metallic")[0])[:, 0]
        images["orm"] = target.image("orm", size)
        images["orm"].pixels.foreach_set(orm.ravel())
    target.wire(images)
    for o in scene.objects:
        o.hide_render = False
    state.images = images
    return facts
