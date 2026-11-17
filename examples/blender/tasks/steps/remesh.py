# SPDX-License-Identifier: GPL-2.0-or-later
# Step op `voxelRemesh`: one watertight surface at a voxel size (fuses shells, closes fur spikes
# and internal junk). UVs and materials are gone, so the mesh before it is kept as the colour
# source. `voxel_shell` is the same remesh for retopo's shell strategy and bind's proxy.

import bpy

from tasks.steps import state as st

# A voxel grid finer than this along the longest side is refused: it would take the RAM of the box.
MAX_VOXELS_PER_SIDE = 1500


def voxel_remesh(state, step):
    obj = state.mesh
    lo, hi, _ = st.bounds(obj)
    side = max(hi - lo)
    if side / step["voxel"] > MAX_VOXELS_PER_SIDE:
        raise ValueError(
            f"voxel {step['voxel']} m on a {side:.3f} m mesh is over {MAX_VOXELS_PER_SIDE} voxels per side; "
            f"use voxel >= {side / MAX_VOXELS_PER_SIDE:.5f}"
        )
    state.keep_colour_source()
    voxel_shell(obj, step["voxel"], step["adaptivity"])
    return {}


def voxel_shell(obj, voxel, adaptivity=0.0):
    """Replace `obj`'s mesh by its voxel remesh: watertight, no UVs, no materials."""
    mod = obj.modifiers.new("t3d_voxel", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel
    mod.adaptivity = adaptivity
    mod.use_smooth_shade = True
    st.apply_modifier(obj, mod)
    if not obj.data.polygons:
        raise ValueError(f"the voxel remesh at {voxel:.5f} m left no faces: the voxel is larger than the mesh")
    obj.data.materials.clear()
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    st.smooth_shade(obj)
