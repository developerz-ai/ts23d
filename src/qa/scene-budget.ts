// Scene budgets: what a scene of placed assets costs an engine, measured from three reference
// cameras (street, aerial three-quarter, overview) the way an engine pays for it — each visible
// placement at the LOD its projected size picks (LOD_SWITCH), instanced placements of one asset
// sharing their draws, the trim sheets counted once — and held against declared lines: unique
// meshes, instances, draws, on-screen triangles and texture memory. Each line over budget is a
// T3D_SCENE_BUDGET finding naming the camera and the biggest contributor. Numbers in, so the
// committed manifests (triangles, drawCalls per LOD) are enough; nothing compiles here.

import type { Vec3 } from '../core/index.ts';
import type { Finding } from './types.ts';

export interface SceneAssetStats {
  readonly name: string;
  readonly triangles: readonly [number, number, number];
  readonly draws: readonly [number, number, number];
  /** Bounding-sphere radius, metres (half the asset's diagonal). */
  readonly radius: number;
  /** Texture set this asset samples (the shared trim sheet is one key) and its GPU bytes. */
  readonly texture?: { readonly key: string; readonly bytes: number };
}

export interface ScenePlacement {
  readonly asset: string;
  readonly at: Vec3;
  /** Drawn through EXT_mesh_gpu_instancing: one set of draws per (asset, LOD). */
  readonly instanced?: boolean;
}

export interface SceneCamera {
  readonly name: string;
  readonly at: Vec3;
  readonly look: Vec3;
  /** Vertical field of view, degrees. */
  readonly fov: number;
  readonly aspect: number;
}

export interface SceneBudget {
  readonly uniqueMeshes?: number;
  readonly instances?: number;
  readonly draws?: number;
  readonly triangles?: number;
  readonly textureBytes?: number;
}

/** Screen-height fraction above which LOD0 / LOD1 are drawn; below, LOD2. */
export const LOD_SWITCH: readonly [number, number] = [0.25, 0.06];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Street level, aerial three-quarter, overview: framed on the placements' bounds. */
export function referenceCameras(placements: readonly ScenePlacement[]): SceneCamera[] {
  const xs = placements.map((p) => p.at[0]);
  const ys = placements.map((p) => p.at[1]);
  const c: Vec3 = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
    0,
  ];
  const r = Math.max(
    10,
    Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2,
  );
  return [
    {
      name: 'street',
      at: [c[0] - r, c[1] - r * 0.1, 1.7],
      look: [c[0], c[1], 1.7],
      fov: 60,
      aspect: 16 / 9,
    },
    { name: 'aerial', at: [c[0] - r * 1.2, c[1] - r * 1.2, r], look: c, fov: 45, aspect: 16 / 9 },
    { name: 'overview', at: [c[0], c[1] - r * 0.01, r * 3], look: c, fov: 45, aspect: 16 / 9 },
  ];
}

export interface CameraLoad {
  readonly camera: string;
  readonly visible: number;
  readonly triangles: number;
  readonly draws: number;
  /** The asset contributing most triangles from this camera. */
  readonly top?: string;
}

/** Visible placements, their LOD by projected height, and the triangles and draws they cost. */
export function cameraLoad(
  stats: ReadonlyMap<string, SceneAssetStats>,
  placements: readonly ScenePlacement[],
  cam: SceneCamera,
): CameraLoad {
  const fwd = sub(cam.look, cam.at);
  const f = len(fwd) || 1;
  const half = ((cam.fov / 2) * Math.PI) / 180;
  const cone = Math.atan(Math.tan(half) * Math.hypot(1, cam.aspect));
  let [triangles, draws, visible] = [0, 0, 0];
  const shared = new Set<string>();
  const per = new Map<string, number>();
  for (const p of placements) {
    const s = stats.get(p.asset);
    if (!s) continue;
    const d = sub(p.at, cam.at);
    const dist = Math.max(len(d), 1e-6);
    const cos = (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / (dist * f);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (dist > s.radius && ang - Math.asin(Math.min(1, s.radius / dist)) > cone) continue;
    visible++;
    const screen = s.radius / (dist * Math.tan(half));
    const lod = screen > LOD_SWITCH[0] ? 0 : screen > LOD_SWITCH[1] ? 1 : 2;
    triangles += s.triangles[lod];
    per.set(p.asset, (per.get(p.asset) ?? 0) + s.triangles[lod]);
    const key = `${p.asset}@${lod}`;
    if (!p.instanced) draws += s.draws[lod];
    else if (!shared.has(key)) {
      shared.add(key);
      draws += s.draws[lod];
    }
  }
  const top = [...per].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  return { camera: cam.name, visible, triangles, draws, ...(top ? { top } : {}) };
}

const finding = (line: string, message: string, fix: string): Finding => ({
  gate: 'scene-budget',
  code: 'T3D_SCENE_BUDGET',
  part: line,
  message: `T3D_SCENE_BUDGET ${message}`,
  fix,
});

/** Findings for every budget line a scene exceeds (empty = within budget). */
export function sceneBudgetFindings(
  assets: readonly SceneAssetStats[],
  placements: readonly ScenePlacement[],
  budget: SceneBudget,
  cameras: readonly SceneCamera[] = referenceCameras(placements),
): Finding[] {
  const stats = new Map(assets.map((a) => [a.name, a]));
  const out: Finding[] = [];
  const missing = [...new Set(placements.map((p) => p.asset))].filter((n) => !stats.has(n));
  for (const n of missing)
    out.push(
      finding(
        'assets',
        `placement of '${n}' has no stats`,
        'pass its manifest numbers in `assets`',
      ),
    );
  const used = [...new Set(placements.map((p) => p.asset))].filter((n) => stats.has(n));
  const unique = used.length;
  if (budget.uniqueMeshes !== undefined && unique > budget.uniqueMeshes)
    out.push(
      finding(
        'uniqueMeshes',
        `${unique} unique assets > ${budget.uniqueMeshes}`,
        'reuse one asset with seeds/variants instead of near-duplicates',
      ),
    );
  if (budget.instances !== undefined && placements.length > budget.instances)
    out.push(
      finding(
        'instances',
        `${placements.length} placements > ${budget.instances}`,
        'thin the scatter or merge small props into one asset',
      ),
    );
  const tex = new Map<string, number>();
  for (const n of used) {
    const t = stats.get(n)?.texture;
    if (t) tex.set(t.key, Math.max(tex.get(t.key) ?? 0, t.bytes));
  }
  const bytes = [...tex.values()].reduce((s, b) => s + b, 0);
  if (budget.textureBytes !== undefined && bytes > budget.textureBytes)
    out.push(
      finding(
        'textureBytes',
        `${(bytes / 2 ** 20).toFixed(1)} MiB of textures > ${(budget.textureBytes / 2 ** 20).toFixed(1)} MiB`,
        'share the trim sheet; drop per-asset texture sets',
      ),
    );
  for (const cam of cameras) {
    const l = cameraLoad(stats, placements, cam);
    if (budget.triangles !== undefined && l.triangles > budget.triangles)
      out.push(
        finding(
          'triangles',
          `camera '${cam.name}': ${l.triangles} on-screen triangles > ${budget.triangles} (most from '${l.top}')`,
          `LOD-gate '${l.top}' harder (lighter LOD1/LOD2) or raise the line with a measured reason`,
        ),
      );
    if (budget.draws !== undefined && l.draws > budget.draws)
      out.push(
        finding(
          'draws',
          `camera '${cam.name}': ${l.draws} draws > ${budget.draws}`,
          'instance repeated assets (instanced: true → EXT_mesh_gpu_instancing) or merge static parts',
        ),
      );
  }
  return out;
}
