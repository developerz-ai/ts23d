# SPDX-License-Identifier: GPL-2.0-or-later
# `groom`: guide curves on a scalp → dense child hair curves styled by strand ops → lock cards.
# ts23d owns the scalp, hairline, partings and flow: it sends the scalp GLB (hair region only) and
# `t3d-groom/1` JSON (guides already combed/puffed/cut/slid in TS, plus the strand ops with a
# per-guide mask). Here: children are interpolated from the 3 nearest guides on the scalp (numpy
# PCG64, fixed seed), the strand ops run as Blender's bundled Essentials hair node groups (CC0,
# datafiles/assets/nodes/procedural_hair_node_assets.blend): clump/pinch → "Clump Hair Curves",
# curl → "Curl Hair Curves", frizz → "Frizz Hair Curves", cut → "Trim Hair Curves", each op's
# mask a Named Attribute on its Factor/Mask. Children are grouped into `cards` locks (k-means of
# roots), each lock's mean strand becomes a card made by Geometry Nodes (Set Curve Normal 'Free'
# to the lock's width axis, Curve to Mesh with a 3-point V profile scaled by the lock's spread,
# UV.u across from the profile's spline factor, UV.v root → tip from the curve's). Output 0: cards
# GLB (node `groom_hair`); output 1: stats JSON. Deterministic: seeded draws, poly curves, one
# evaluation, sorted locks.

import json
import os

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

from tasks import common

ASSETS = "procedural_hair_node_assets.blend"
ASSETS_LICENCE = "CC0-1.0 (Blender bundled assets, datafiles/assets/LICENSE)"
NODE_GROUP = {
    "clump": "Clump Hair Curves",
    "pinch": "Clump Hair Curves",
    "curl": "Curl Hair Curves",
    "frizz": "Frizz Hair Curves",
    "cut": "Trim Hair Curves",
}
STRAND_POINTS = 16


def to_blender(a):
    """ts23d (x, y, z) → Blender (y, -x, z): ts23d → glTF (y, z, x) → Blender's glTF import."""
    a = np.asarray(a, dtype=np.float64)
    return np.stack([a[..., 1], -a[..., 0], a[..., 2]], axis=-1)


def resample(p, n):
    """n points evenly spaced by arc length along polyline p (k, 3)."""
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    t = np.linspace(0.0, s[-1], n)
    return np.stack([np.interp(t, s, p[:, k]) for k in range(3)], axis=1)


def kmeans(x, k, iters=6):
    """Deterministic k-means: farthest-point seeds from index 0, Lloyd steps; labels sorted."""
    k = min(k, len(x))
    c = [x[0]]
    d = np.linalg.norm(x - x[0], axis=1)
    for _ in range(1, k):
        i = int(np.argmax(d))
        c.append(x[i])
        d = np.minimum(d, np.linalg.norm(x - x[i], axis=1))
    c = np.array(c)
    lab = np.zeros(len(x), dtype=np.int64)
    for _ in range(iters):
        lab = np.argmin(((x[:, None, :] - c[None, :, :]) ** 2).sum(-1), axis=1)
        for j in range(k):
            m = x[lab == j]
            if len(m):
                c[j] = m.mean(0)
    return lab, c


def children(guides, normals, scalp, per, seed):
    """Child strands: roots scattered round each guide root and snapped to the scalp, shapes the
    inverse-distance blend of the 3 nearest guides' shapes; returns (strands, weights, ids)."""
    rng = np.random.default_rng(seed)
    roots = guides[:, 0, :]
    shape = guides - roots[:, None, :]
    dist = np.linalg.norm(roots[:, None, :] - roots[None, :, :], axis=2) + np.eye(len(roots)) * 1e9
    spacing = np.minimum(dist.min(1), 0.01)
    out, wts, ids = [], [], []
    for g in range(len(guides)):
        n = normals[g]
        a = np.cross(n, [1.0, 0.0, 0.0] if abs(n[0]) < 0.9 else [0.0, 1.0, 0.0])
        a /= np.linalg.norm(a)
        b = np.cross(n, a)
        for _ in range(per):
            r = spacing[g] * 0.6 * np.sqrt(rng.random())
            th = rng.random() * 2 * np.pi
            p = roots[g] + a * r * np.cos(th) + b * r * np.sin(th)
            hit, nrm, _, _ = scalp.find_nearest(p.tolist())
            root = np.array(hit) - np.array(nrm) * 0.002 if hit is not None else p
            d = np.linalg.norm(roots - root, axis=1)
            near = np.argsort(d, kind="stable")[:3]
            w = 1.0 / (d[near] ** 2 + 1e-8)
            w /= w.sum()
            out.append(root + np.tensordot(w, shape[near], axes=1))
            wts.append((near, w))
            ids.append(int(near[0]))
    return np.array(out), wts, ids


def clear(points, tree, gap, skip):
    """Points (n, 3) pushed `gap` out of the surface wherever they lie behind or on it, past
    the first `skip` share of the strand (roots stay buried)."""
    out = np.array(points, dtype=np.float64)
    for k in range(len(out)):
        if k < skip * (len(out) - 1):
            continue
        # A push out of one face can land behind another (a concave corner): up to 4 passes.
        for _ in range(4):
            hit, nrm, _, d = tree.find_nearest(out[k].tolist())
            if hit is None or d > 0.08:
                break
            hit, nrm = np.array(hit), np.array(nrm)
            h = np.dot(out[k] - hit, nrm)
            if h >= gap:
                break
            out[k] = out[k] + nrm * (gap - h)
    return out


def append_groups(names):
    path = os.path.join(bpy.utils.system_resource("DATAFILES"), "assets", "nodes", ASSETS)
    want = sorted(set(names) - set(bpy.data.node_groups.keys()))
    if want:
        with bpy.data.libraries.load(path, link=False) as (_src, dst):
            dst.node_groups = want
    return path


def new_tree(name):
    t = bpy.data.node_groups.new(name, "GeometryNodeTree")
    t.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    t.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    return t, t.nodes.new("NodeGroupInput"), t.nodes.new("NodeGroupOutput")


def named(t, name, kind="FLOAT"):
    n = t.nodes.new("GeometryNodeInputNamedAttribute")
    n.data_type = kind
    n.inputs["Name"].default_value = name
    return n.outputs["Attribute"]


def strand_ops(obj, ops):
    """One GN modifier: the strand ops in list order, each mask a Named Attribute."""
    append_groups([NODE_GROUP[o["op"]] for o in ops])
    t, gi, go = new_tree("ts23d_groom_ops")
    geo = gi.outputs[0]
    for i, o in enumerate(ops):
        node = t.nodes.new("GeometryNodeGroup")
        node.node_tree = bpy.data.node_groups[NODE_GROUP[o["op"]]]
        t.links.new(geo, node.inputs["Geometry"])
        mask = named(t, f"mask_{i}")
        seed = int(o.get("seed", 0))
        if o["op"] in ("clump", "pinch"):
            mul = t.nodes.new("ShaderNodeMath")
            mul.operation = "MULTIPLY"
            t.links.new(mask, mul.inputs[0])
            mul.inputs[1].default_value = float(o["strength"])
            t.links.new(mul.outputs[0], node.inputs["Factor"])
            # Pinch: tips gather hardest (pointed locks); clump: the whole length.
            node.inputs["Shape"].default_value = 0.85 if o["op"] == "pinch" else 0.3
            node.inputs["Tip Spread"].default_value = 0.0
            node.inputs["Seed"].default_value = seed
            node.inputs["Preserve Length"].default_value = True
            t.links.new(named(t, f"leader_{i}", "INT"), node.inputs["Guide Index"])
        elif o["op"] == "curl":
            t.links.new(mask, node.inputs["Factor"])
            node.inputs["Radius"].default_value = float(o["radius"])
            node.inputs["Frequency"].default_value = float(o["turns"])
            node.inputs["Curl Start"].default_value = 0.15
            node.inputs["Seed"].default_value = seed
            t.links.new(named(t, f"leader_{i}", "INT"), node.inputs["Guide Index"])
        elif o["op"] == "frizz":
            t.links.new(mask, node.inputs["Factor"])
            node.inputs["Distance"].default_value = float(o["amount"])
            node.inputs["Seed"].default_value = seed
            node.inputs["Preserve Length"].default_value = True
        elif o["op"] == "cut":
            t.links.new(mask, node.inputs["Mask"])
            node.inputs["Replace Length"].default_value = True
            node.inputs["Length"].default_value = float(o["length"])
        geo = node.outputs["Geometry"]
    t.links.new(geo, go.inputs[0])
    obj.modifiers.new("ts23d_groom_ops", "NODES").node_group = t


def curves_object(name, strands, curve_attrs=None, point_attrs=None):
    c = bpy.data.hair_curves.new(name)
    c.add_curves([len(s) for s in strands])
    c.set_types(type="POLY")
    c.position_data.foreach_set("vector", np.concatenate(strands).astype(np.float32).ravel())
    for key, (kind, values) in (curve_attrs or {}).items():
        a = c.attributes.new(key, kind, "CURVE")
        a.data.foreach_set("value", list(values))
    for key, values in (point_attrs or {}).items():
        a = c.attributes.new(key, "FLOAT_VECTOR" if values.ndim == 2 else "FLOAT", "POINT")
        a.data.foreach_set("vector" if values.ndim == 2 else "value", values.astype(np.float32).ravel())
    obj = bpy.data.objects.new(name, c)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def evaluated_strands(obj):
    e = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    pos = np.zeros(len(e.points) * 3, dtype=np.float32)
    e.position_data.foreach_get("vector", pos)
    off = np.zeros(len(e.curves) + 1, dtype=np.int32)
    e.curve_offset_data.foreach_get("value", off)
    pos = pos.reshape(-1, 3).astype(np.float64)
    return [pos[off[i] : off[i + 1]] for i in range(len(e.curves))]


def card_tree(source, fold):
    """Lock curves → V-section cards: width along the curve normal (the lock's side axis),
    uv_u across (profile factor), uv_v root → tip (curve factor), radius = half-width."""
    t, _gi, go = new_tree("ts23d_groom_cards")
    oi = t.nodes.new("GeometryNodeObjectInfo")
    oi.transform_space = "ORIGINAL"
    oi.inputs["Object"].default_value = source
    sn = t.nodes.new("GeometryNodeSetCurveNormal")
    sn.inputs["Mode"].default_value = "Free"
    t.links.new(oi.outputs["Geometry"], sn.inputs["Curve"])
    t.links.new(named(t, "card_side", "FLOAT_VECTOR"), sn.inputs["Normal"])
    sv = t.nodes.new("GeometryNodeStoreNamedAttribute")
    sv.data_type, sv.domain = "FLOAT", "POINT"
    sv.inputs["Name"].default_value = "uv_v"
    t.links.new(sn.outputs[0], sv.inputs["Geometry"])
    t.links.new(t.nodes.new("GeometryNodeSplineParameter").outputs["Factor"], sv.inputs["Value"])
    line = t.nodes.new("GeometryNodeCurvePrimitiveLine")
    line.inputs["Start"].default_value = (-1.0, 0.0, 0.0)
    line.inputs["End"].default_value = (1.0, 0.0, 0.0)
    rs = t.nodes.new("GeometryNodeResampleCurve")
    rs.inputs["Count"].default_value = 3 if fold > 0 else 2
    t.links.new(line.outputs[0], rs.inputs["Curve"])
    # The V: the profile's middle point raised along its Y (the card's outward side).
    sp = t.nodes.new("GeometryNodeSetPosition")
    t.links.new(rs.outputs[0], sp.inputs["Geometry"])
    idx = t.nodes.new("GeometryNodeInputIndex")
    eq = t.nodes.new("FunctionNodeCompare")
    eq.data_type, eq.operation = "INT", "EQUAL"
    t.links.new(idx.outputs[0], eq.inputs["A"])
    eq.inputs["B"].default_value = 1
    t.links.new(eq.outputs[0], sp.inputs["Selection"])
    sp.inputs["Offset"].default_value = (0.0, float(fold), 0.0)
    su = t.nodes.new("GeometryNodeStoreNamedAttribute")
    su.data_type, su.domain = "FLOAT", "POINT"
    su.inputs["Name"].default_value = "uv_u"
    t.links.new(sp.outputs[0], su.inputs["Geometry"])
    t.links.new(t.nodes.new("GeometryNodeSplineParameter").outputs["Factor"], su.inputs["Value"])
    cm = t.nodes.new("GeometryNodeCurveToMesh")
    t.links.new(sv.outputs[0], cm.inputs["Curve"])
    t.links.new(su.outputs[0], cm.inputs["Profile Curve"])
    t.links.new(named(t, "half_width"), cm.inputs["Scale"])
    t.links.new(cm.outputs[0], go.inputs[0])
    return t


def lock_cards(strands, roots_n, k, points, width, fold):
    """Children → `k` lock centre lines (mean of members), half-widths from member spread
    (clamped to the requested root → tip widths) and the width axis per point."""
    lab, _ = kmeans(np.array([s[0] for s in strands]), k)
    order = sorted(
        set(lab.tolist()), key=lambda j: tuple(np.round(np.mean([strands[i][0] for i in np.where(lab == j)[0]], 0), 6))
    )
    lines, half, side = [], [], []
    w0, w1 = width
    for j in order:
        mem = np.where(lab == j)[0]
        rs = np.stack([resample(strands[i], points) for i in mem])
        c = rs.mean(0)
        sd = lock_side(c, roots_n[mem].mean(0))
        across = np.abs(((rs - c[None]) * sd[None]).sum(-1))
        f = np.linspace(0.0, 1.0, points)
        lo = (w0 + (w1 - w0) * f) * 0.5
        h = np.clip(across.mean(0) * 1.6, lo, lo * 2.2) if len(mem) > 1 else lo
        lines.append(c)
        half.append(h)
        side.append(sd)
    return lines, np.concatenate(half), np.concatenate(side)


def lock_side(c, up):
    """Width axis per point of centre line c: across the strand and the scalp normal `up`,
    carried along so the card does not twist."""
    t = np.gradient(c, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-12
    sd = []
    for q in range(len(c)):
        s = np.cross(t[q], up)
        if np.linalg.norm(s) < 1e-6:
            s = sd[-1] if sd else np.cross(t[q], [0.0, 0.0, 1.0])
        s = s / (np.linalg.norm(s) + 1e-12)
        sd.append(s)
        up = np.cross(s, t[q])
    return np.array(sd)


def make_cards(name, lines, half, side, fold, solid):
    """Centre lines → one card mesh object `name` (GN), edges clear of `solid`, UVs written."""
    src = curves_object(f"{name}_lines", lines, None, {"half_width": half, "card_side": side})
    host = bpy.data.objects.new(f"{name}_host", bpy.data.meshes.new(f"{name}_host"))
    bpy.context.scene.collection.objects.link(host)
    host.modifiers.new("cards", "NODES").node_group = card_tree(src, fold)
    cards = common.evaluated_copy(host, name)
    me = cards.data
    uu = np.zeros(len(me.vertices), dtype=np.float32)
    vv = np.zeros(len(me.vertices), dtype=np.float32)
    me.attributes["uv_u"].data.foreach_get("value", uu)
    me.attributes["uv_v"].data.foreach_get("value", vv)
    co = np.zeros(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    # Card edges clear the head too (a wide card over a curved skull would dip into it).
    for i in np.where(vv > 0.08)[0]:
        co[i] = clear(co[i : i + 1], solid, 0.003, 0.0)[0]
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    loops = np.zeros(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", loops)
    uv = me.uv_layers.new(name="UVMap")
    # glTF export flips V (v_gltf = 1 - v): store 1 - v so the GLB holds root 0 → tip 1.
    uv.data.foreach_set("uv", np.stack([uu[loops], 1.0 - vv[loops]], axis=1).ravel())
    for key in ("uv_u", "uv_v"):
        me.attributes.remove(me.attributes[key])
    return cards


def run(request, inputs, work):
    with open(common.input_file(request, "guides", inputs), encoding="utf-8") as f:
        doc = json.load(f)
    if doc.get("contract") != "t3d-groom/1":
        raise ValueError(f"guides contract {doc.get('contract')!r} is not t3d-groom/1")
    per = int(request["children"])
    k = int(request["cards"])
    points = int(request["points"])
    seed = int(request.get("seed", 0))
    if not (1 <= per <= 256 and 1 <= k <= 20000 and 2 <= points <= 32):
        raise ValueError(f"children {per}, cards {k}, points {points} out of range")
    scalp = common.join(common.import_glb(common.input_file(request, "mesh", inputs)), "scalp")
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(scalp, dg)
    # The solid to clear: the body when sent (head + torso: long hair falls onto it), else the scalp.
    solid = tree
    if isinstance(request.get("body"), dict):
        body = common.join(common.import_glb(common.input_file(request, "body", inputs)), "body")
        solid = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    guides = np.stack([resample(to_blender(g["points"]), STRAND_POINTS) for g in doc["guides"]])
    normals = to_blender([g["normal"] for g in doc["guides"]])
    if len(guides) < 3:
        raise ValueError(f"{len(guides)} guides: need at least 3")
    strands, wts, ids = children(guides, normals, tree, per, seed)
    ops = doc.get("ops", [])
    curve_attrs = {}
    for i, o in enumerate(ops):
        if o["op"] not in NODE_GROUP:
            raise ValueError(f"op {i} '{o['op']}' is not a strand op ({sorted(NODE_GROUP)})")
        mask = np.asarray(o["mask"], dtype=np.float64)
        curve_attrs[f"mask_{i}"] = ("FLOAT", [float((w * mask[near]).sum()) for near, w in wts])
        if o["op"] in ("clump", "pinch", "curl"):
            lab, _ = kmeans(strands[:, 0, :], int(o.get("locks", k)))
            lead = {}
            for c, j in enumerate(lab.tolist()):
                lead.setdefault(j, c)
            curve_attrs[f"leader_{i}"] = ("INT", [lead[j] for j in lab.tolist()])
    hair = curves_object("hair", list(strands), curve_attrs)
    if ops:
        strand_ops(hair, ops)
    # Strands clear the head (the groom ops know no collision): 3 mm past the first 10 % (the
    # body is meshed at a few mm, so its surface can sit that far off the true one).
    styled = [clear(s, solid, 0.003, 0.1) for s in evaluated_strands(hair)]
    lines, half, side = lock_cards(styled, normals[ids], k, points, doc["card"]["width"], float(doc["card"]["fold"]))
    cards = [make_cards("groom_hair", lines, half, side, float(doc["card"]["fold"]), solid)]
    wisps = int(doc["card"].get("wisps", 0))
    if wisps > 0:
        # Flyaways: single child strands as thin flat cards that break the outline.
        pick = np.sort(np.random.default_rng(seed + 1).choice(len(styled), min(wisps, len(styled)), replace=False))
        # A flyaway is the first 60 % of a strand: it breaks the outline near the head, never
        # trails past the hair mass.
        wl = [resample(resample(styled[i], 64)[:39], points) for i in pick]
        wn = np.concatenate([np.full(points, float(doc["card"].get("wispWidth", 0.004)) * 0.5) for _ in pick])
        ws = np.concatenate([lock_side(c, normals[ids[i]]) for c, i in zip(wl, pick, strict=True)])
        cards.append(make_cards("groom_wisp", wl, wn, ws, 0.0, solid))
    out = os.path.join(work, "output-0.glb")
    common.export_glb(out, cards)
    stats = {
        "blender": bpy.app.version_string,
        "assets": ASSETS,
        "assetsLicence": ASSETS_LICENCE,
        "nodeGroups": sorted({NODE_GROUP[o["op"]] for o in ops}),
        "guides": len(guides),
        "children": len(strands),
        "cards": len(lines),
        "wisps": wisps,
        "triangles": sum(len(p.vertices) - 2 for c in cards for p in c.data.polygons),
    }
    with open(os.path.join(work, "output-1.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, sort_keys=True)
    return {
        "outputs": [
            {"file": "output-0.glb", "mime": "model/gltf-binary"},
            {"file": "output-1.json", "mime": "application/json"},
        ],
        "stats": stats,
    }
