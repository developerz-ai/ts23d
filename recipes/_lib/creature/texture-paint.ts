// Texture finishing for a model-built body, as one Blender `script` step after the bake (and after
// `repose`, so every coordinate is the asset's rest pose): de-lighting, repainting, roughness and
// wear written into the baked albedo and ORM maps. A textured part takes no `paint`, `finish` or
// grime pass (ADR 016: its colour IS the albedo map), so wear on a model body has to be in the
// maps, and every LOD samples the same maps: what is painted here reads the same at LOD 2.
//
// How: the shell's triangles are rasterised in UV space, so each texel knows where it lies on the
// body (asset frame: metres, Z up, +X front, +Y left). Masks are then functions of position
// (a height band, a ball round a bone, a thin slab cutting the surface, seeded value noise), not
// of UV islands, and never cross a seam. No randomness outside the seeded hash: same program,
// same bytes. Shared by bear_hybrid, dragon_hybrid and ranger (each writes its own body below
// KIT); positions come from the fitted rig, numbers are in the cache key like any step.

import type { BlenderStep, Vec3 } from '@developerz.ai/ts23d';

/** A Python tuple literal of a point or colour. */
export const py = (v: readonly number[]): string =>
  `(${v.map((n) => Number(n.toFixed(5))).join(', ')})`;

/** '#rrggbb' → a Python tuple, sRGB 0..1 (the kit works in linear light and converts). */
export const rgb = (hex: string): string =>
  py([1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255));

/** The kit: loaded maps, per-texel positions and the brushes. Globals, because a `script` step is
 *  one `exec`. Linear light inside; `save()` writes sRGB albedo and the ORM back. */
export const KIT = `
_mat = obj.data.materials[0]
_bsdf = next(n for n in _mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
def _up(sock):
    todo = [sock]
    while todo:
        s = todo.pop()
        for l in s.links:
            n = l.from_node
            if n.type == 'TEX_IMAGE' and n.image:
                return n.image
            todo.extend(n.inputs)
    return None
_alb = _up(_bsdf.inputs['Base Color'])
_orm = _up(_bsdf.inputs['Roughness'])
S = _alb.size[0]
_a = np.empty(S * S * 4, np.float32); _alb.pixels.foreach_get(_a); _a = _a.reshape(S, S, 4)
RGB = np.power(np.clip(_a[..., :3].astype(np.float64), 0, 1), 2.2)
_so = _orm.size[0]; _f = S // _so
_o = np.empty(_so * _so * 4, np.float32); _orm.pixels.foreach_get(_o); _o = _o.reshape(_so, _so, 4)
_big = lambda c: np.kron(c, np.ones((_f, _f))) if _f > 1 else c.astype(np.float64)
AO, ROUGH, METAL = _big(_o[..., 0]), _big(_o[..., 1]), _big(_o[..., 2])

def _raster():
    me = obj.data
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    loops = np.empty(n * 3, np.int32); me.loop_triangles.foreach_get('loops', loops)
    verts = np.empty(n * 3, np.int32); me.loop_triangles.foreach_get('vertices', verts)
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uv)
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
    U = uv.reshape(-1, 2)[loops].reshape(n, 3, 2).astype(np.float64) * S - 0.5
    # World space: a rigged source keeps its armature's scale on the object (centimetres inside).
    world = np.array(obj.matrix_world)
    co = co.reshape(-1, 3).astype(np.float64) @ world[:3, :3].T + world[:3, 3]
    P = co[verts].reshape(n, 3, 3)
    pos = np.full((S, S, 3), np.nan)
    for t in range(n):
        (x0, y0), (x1, y1), (x2, y2) = U[t]
        d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(d) < 1e-9:
            continue
        xa, xb = max(int(min(x0, x1, x2)) - 1, 0), min(int(max(x0, x1, x2)) + 2, S - 1)
        ya, yb = max(int(min(y0, y1, y2)) - 1, 0), min(int(max(y0, y1, y2)) + 2, S - 1)
        if xb < xa or yb < ya:
            continue
        gx, gy = np.meshgrid(np.arange(xa, xb + 1), np.arange(ya, yb + 1))
        w0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / d
        w1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / d
        w2 = 1 - w0 - w1
        e = 0.75 / (abs(d) ** 0.5 + 1)
        m = (w0 >= -e) & (w1 >= -e) & (w2 >= -e)
        if m.any():
            pos[gy[m], gx[m]] = w0[m, None] * P[t, 0] + w1[m, None] * P[t, 1] + w2[m, None] * P[t, 2]
    # The islands' margins take the nearest position, so paint reaches under the bake's bleed.
    for _ in range(12):
        hole = np.isnan(pos[..., 0])
        if not hole.any():
            break
        for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            near = np.roll(pos, sh, ax)
            take = hole & ~np.isnan(near[..., 0])
            pos[take] = near[take]
            hole = hole & ~take
    return pos
_p = _raster()
OK = ~np.isnan(_p[..., 0])
_p[~OK] = 1e6
# Blender (x, y, z) = asset (y, -x, z).
X, Y, Z = -_p[..., 1], _p[..., 0], _p[..., 2]
del _p

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def lum(c=None):
    c = RGB if c is None else c
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]

def _hash(ix, iy, iz, seed):
    n = (ix * 374761393 + iy * 668265263 + iz * 2147483629 + seed * 1274126177) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n = ((n ^ (n >> 16)) * 2246822519) & 0xFFFFFFFF
    return ((n ^ (n >> 15)) & 0xFFFF) / 65535.0

def vnoise(scale, seed, stretch=(1, 1, 1)):
    """Seeded value noise in 0..1, feature size 'scale' metres ('stretch' times that per axis:
    (1, 1, 6) is strands hanging down), on the surface positions."""
    out = np.zeros((S, S))
    q = [np.where(OK, c, 0.0) / (scale * k) + 1000.0 for c, k in zip((X, Y, Z), stretch)]
    i = [np.floor(c).astype(np.int64) for c in q]
    f = [c - np.floor(c) for c in q]
    f = [t * t * (3 - 2 * t) for t in f]
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[0] if dx else 1 - f[0]) * (f[1] if dy else 1 - f[1]) * (f[2] if dz else 1 - f[2])
                out += w * _hash(i[0] + dx, i[1] + dy, i[2] + dz, seed)
    return out

def fbm(scale, seed, octaves=4):
    out, amp, total = np.zeros((S, S)), 1.0, 0.0
    for k in range(octaves):
        out += amp * vnoise(scale / 2 ** k, seed + 31 * k)
        total += amp
        amp *= 0.5
    return out / total

def ball(at, r, feather=0.0):
    d = np.sqrt((X - at[0]) ** 2 + (Y - at[1]) ** 2 + (Z - at[2]) ** 2)
    return (d <= r).astype(np.float64) if feather <= 0 else 1 - sstep(r, r + feather, d)

def capsule(a, b, r, feather=0.0):
    a, b = np.array(a, float), np.array(b, float)
    ab = b - a
    t = np.clip(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1] + (Z - a[2]) * ab[2]) / max(float(ab @ ab), 1e-12), 0, 1)
    d = np.sqrt((X - a[0] - t * ab[0]) ** 2 + (Y - a[1] - t * ab[1]) ** 2 + (Z - a[2] - t * ab[2]) ** 2)
    return (d <= r).astype(np.float64) if feather <= 0 else 1 - sstep(r, r + feather, d)

def slab(at, normal, half, reach, wobble=0.0, seed=0):
    """Where a thin plane through 'at' cuts the surface within 'reach': a scratch or a scar that
    follows the body's curve. It tapers to nothing at 'reach'; 'wobble' (metres) bends it."""
    n = np.array(normal, float); n = n / np.linalg.norm(n)
    off = (X - at[0]) * n[0] + (Y - at[1]) * n[1] + (Z - at[2]) * n[2]
    if wobble > 0:
        off = off + wobble * (vnoise(reach * 0.6, seed) - 0.5) * 2
    r = np.sqrt((X - at[0]) ** 2 + (Y - at[1]) ** 2 + (Z - at[2]) ** 2) / reach
    w = half * np.clip(1 - r * r, 0, 1)
    return np.where(w > 0, 1 - sstep(0.6, 1.0, np.abs(off) / np.maximum(w, 1e-9)), 0.0)

def lowpass(V, cell):
    """V averaged over the body in 3D cells of 'cell' metres (never across UV seams)."""
    q = [(c - c[OK].min()) / cell + 3.5 for c in (X, Y, Z)]
    dims = [int(c[OK].max()) + 5 for c in q]
    i = [np.clip(c.astype(np.int64), 0, d - 1) for c, d in zip(q, dims)]
    flat = ((i[0] * dims[1] + i[1]) * dims[2] + i[2])[OK]
    size = dims[0] * dims[1] * dims[2]
    s = np.bincount(flat, weights=V[OK], minlength=size).reshape(dims)
    n = np.bincount(flat, minlength=size).astype(np.float64).reshape(dims)
    for _ in range(2):
        for ax in range(3):
            s = s + 0.5 * (np.roll(s, 1, ax) + np.roll(s, -1, ax))
            n = n + 0.5 * (np.roll(n, 1, ax) + np.roll(n, -1, ax))
    g = np.where(n > 1e-6, s / np.maximum(n, 1e-6), float(V[OK].mean()))
    f = [np.clip(c - 0.5, 0, d - 1.001) for c, d in zip(q, dims)]
    i0 = [c.astype(np.int64) for c in f]
    t = [c - k for c, k in zip(f, i0)]
    out = np.zeros((S, S))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (t[0] if dx else 1 - t[0]) * (t[1] if dy else 1 - t[1]) * (t[2] if dz else 1 - t[2])
                out += w * g[i0[0] + dx, i0[1] + dy, i0[2] + dz]
    return out

def lin(c):
    return np.power(np.array(c, float), 2.2)

def delight(mid, big, bright, dark, lo=0.55, hi=1.8):
    """Take the generator's baked light out of the albedo: brightness that varies over 'mid'
    metres (a sunlit shoulder, a shaded flank) is pulled towards the body's own value over 'big'
    metres (the coat's real colour blocks stay). 'bright' / 'dark' are how much of a lit / shaded
    blotch is removed (0 none, 1 all)."""
    L = np.maximum(lum(), 1e-4)
    ratio = np.maximum(lowpass(L, big), 1e-4) / np.maximum(lowpass(L, mid), 1e-4)
    gain = np.clip(np.power(ratio, np.where(ratio < 1, bright, dark)), lo, hi)
    RGB[OK] = (RGB * gain[..., None])[OK]
    return float(np.abs(np.log(gain[OK])).mean())

DETAIL = None
def detail(cell):
    """Each texel's value over its neighbourhood's: the fur or scale grain a repaint keeps."""
    global DETAIL
    L = np.maximum(lum(), 1e-4)
    DETAIL = np.clip(L / np.maximum(lowpass(L, cell), 1e-4), 0.35, 2.2)

def paint(mask, colour, keep=1.0, value=None):
    """Mix towards 'colour' (sRGB) under 'mask', keeping 'keep' of the grain; 'value' also sets
    the roughness there."""
    m = np.clip(np.where(OK, mask, 0.0), 0, 1)
    grain = 1 + keep * (DETAIL - 1) if DETAIL is not None else 1.0
    c = lin(colour)
    for k in range(3):
        RGB[..., k] = RGB[..., k] * (1 - m) + c[k] * grain * m
    if value is not None:
        rough(m, value)
    return float(m[OK].mean())

def shade(mask, gain):
    m = np.clip(np.where(OK, mask, 0.0), 0, 1)
    RGB[:] = RGB * (1 + (gain - 1) * m)[..., None]

def rough(mask, value):
    m = np.clip(np.where(OK, mask, 0.0), 0, 1)
    ROUGH[:] = ROUGH * (1 - m) + value * m

def heal(dark, mask, cell):
    """Bake holes (texels the source left black) under 'mask' take their neighbourhood's colour."""
    L = lum()
    good = OK & (L > dark * 3)
    bad = np.where(OK, (1 - sstep(dark, 2.5 * dark, L)) * mask, 0.0)
    grain = 0.8 + 0.4 * vnoise(cell / 8, 7)
    for k in range(3):
        c = RGB[..., k]
        fill = lowpass(np.where(good, c, float(c[good].mean())), cell) * grain
        RGB[..., k] = c * (1 - bad) + fill * bad
    return float((bad > 0.5).sum()) / float(OK.sum())

def peak(where):
    """The highest surface point where 'where' holds (an ear tip, a horn tip)."""
    z = np.where(OK & where, Z, -1e9)
    k = np.unravel_index(int(np.argmax(z)), z.shape)
    return (float(X[k]), float(Y[k]), float(Z[k]))

def save():
    out = np.empty((S, S, 4), np.float32)
    out[..., :3] = np.power(np.clip(RGB, 0, 1), 1 / 2.2)
    out[..., 3] = 1.0
    _alb.pixels.foreach_set(out.ravel()); _alb.update()
    small = lambda c: c.reshape(_so, _f, _so, _f).mean(axis=(1, 3)) if _f > 1 else c
    o = _o.copy()
    o[..., 0], o[..., 1], o[..., 2] = small(AO), small(np.clip(ROUGH, 0.04, 1)), small(METAL)
    _orm.pixels.foreach_set(o.astype(np.float32).ravel()); _orm.update()
`;

/** The `script` step: the kit, the recipe's own painting, then the maps written back. */
export const paintStep = (body: string, why: string): BlenderStep => ({
  op: 'script',
  python: `${KIT}\n${body}\nsave()\n`,
  why,
});

/** A point moved by an offset: masks sit relative to a bone, not at numbers read off a render. */
export const offset = (p: Vec3, d: Vec3): Vec3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
