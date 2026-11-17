# SPDX-License-Identifier: GPL-2.0-or-later
# The source side of a bake: `emit(obj, channel)` rewires every material of the source so its
# surface EMITS one channel of the Principled BSDF (Base Color, Roughness, Metallic) or plain
# white — an EMIT bake then reads that channel whatever the lighting, where a DIFFUSE bake of a
# metallic material comes out black. The channel comes from, in order: what is linked to the
# socket (an image texture, a vertex colour node), the mesh's colour attribute (base colour
# only), the socket's own value, a default Principled BSDF when the mesh has no material at all.
# A base colour whose material has a linked Alpha is mixed with a transparent shader, so a bake
# ray passes a cut-out texel and reads the surface beneath. `restore(undo)` puts every material back.

import bpy

FLAT = {"Base Color": (0.8, 0.8, 0.8, 1.0), "Roughness": 0.8, "Metallic": 0.0}
WHITE = (1.0, 1.0, 1.0, 1.0)


def upstream_kinds(socket, seen=None):
    """Node types feeding a socket."""
    seen = set() if seen is None else seen
    for link in socket.links:
        node = link.from_node
        if node.name in seen:
            continue
        seen.add(node.name)
        yield node.type
        for inp in node.inputs:
            yield from upstream_kinds(inp, seen)


def origin_of(socket):
    kinds = set(upstream_kinds(socket))
    if "TEX_IMAGE" in kinds:
        return "texture"
    if kinds & {"VERTEX_COLOR", "ATTRIBUTE"}:
        return "vertex-colour"
    return "nodes"


def constant(tree, value, made):
    """A node holding a colour or a number, as an emission colour source."""
    if isinstance(value, (int, float)):
        node = tree.nodes.new("ShaderNodeValue")
        node.outputs[0].default_value = float(value)
    else:
        node = tree.nodes.new("ShaderNodeRGB")
        node.outputs[0].default_value = tuple(value)
    made.append(node)
    return node.outputs[0]


def route(mat, channel, colour_attribute, undo):
    """Make one material emit `channel`; returns where the value came from."""
    if not mat.use_nodes or mat.node_tree is None:
        colour = tuple(mat.diffuse_color)
        mat.use_nodes = True  # a node-less material becomes a Principled BSDF of its colour
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                n.inputs["Base Color"].default_value = colour
    tree = mat.node_tree
    out = tree.get_output_node("CYCLES") or tree.nodes.new("ShaderNodeOutputMaterial")
    surface = out.inputs["Surface"]
    before = surface.links[0].from_socket if surface.links else None
    made = []

    def back():
        for n in made:
            tree.nodes.remove(n)
        if before is not None:
            tree.links.new(before, surface)

    undo.append(back)
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if channel == "white":
        source, origin = constant(tree, WHITE, made), "flat"
    elif bsdf is not None and bsdf.inputs[channel].links:
        source, origin = bsdf.inputs[channel].links[0].from_socket, origin_of(bsdf.inputs[channel])
    elif channel == "Base Color" and colour_attribute:
        node = tree.nodes.new("ShaderNodeVertexColor")
        node.layer_name = colour_attribute
        made.append(node)
        source, origin = node.outputs["Color"], "vertex-colour"
    else:
        value = bsdf.inputs[channel].default_value if bsdf is not None else FLAT[channel]
        value = value if isinstance(value, (int, float)) else tuple(value)
        source, origin = constant(tree, value, made), "flat"
    if channel == "Base Color" and bsdf is not None and bsdf.inputs["Alpha"].links:
        # a cut-out source: rays go through its transparent texels to the surface beneath
        emission, clear, mix = (tree.nodes.new(t) for t in ("ShaderNodeEmission", "ShaderNodeBsdfTransparent", "ShaderNodeMixShader"))
        made.extend((emission, clear, mix))
        tree.links.new(source, emission.inputs["Color"])
        tree.links.new(bsdf.inputs["Alpha"].links[0].from_socket, mix.inputs["Fac"])
        tree.links.new(clear.outputs[0], mix.inputs[1])
        tree.links.new(emission.outputs[0], mix.inputs[2])
        source = mix.outputs[0]
    tree.links.new(source, surface)
    return origin


def emit(obj, channel):
    """Every material of `obj` emits `channel`. Returns (undo list, origins found)."""
    me = obj.data
    undo, origins = [], set()
    attribute = me.color_attributes.active_color.name if me.color_attributes.active_color else None
    if not [m for m in me.materials if m is not None]:
        mat = bpy.data.materials.new("t3d_bake_source")
        mat.use_nodes = True
        me.materials.clear()
        me.materials.append(mat)

        def drop():
            me.materials.clear()
            bpy.data.materials.remove(mat)

        undo.append(drop)
    for mat in {m for m in me.materials if m is not None}:
        origins.add(route(mat, channel, attribute, undo))
    return undo, sorted(origins)


def restore(undo):
    for fn in reversed(undo):
        fn()
