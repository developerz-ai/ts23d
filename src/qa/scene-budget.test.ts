import { describe, expect, it } from 'bun:test';
import {
  cameraLoad,
  referenceCameras,
  type SceneAssetStats,
  type ScenePlacement,
  sceneBudgetFindings,
} from './scene-budget.ts';

const TREE: SceneAssetStats = {
  name: 'tree',
  triangles: [20000, 4000, 300],
  draws: [2, 2, 1],
  radius: 4,
  texture: { key: 'trim', bytes: 4096 * 4096 * 4 },
};
const HOUSE: SceneAssetStats = {
  name: 'house',
  triangles: [30000, 8000, 600],
  draws: [3, 2, 1],
  radius: 8,
  texture: { key: 'trim', bytes: 4096 * 4096 * 4 },
};
const forest = (instanced: boolean): ScenePlacement[] =>
  Array.from({ length: 400 }, (_, i) => ({
    asset: 'tree',
    at: [(i % 20) * 10, Math.floor(i / 20) * 10, 0],
    instanced,
  }));

describe('sceneBudgetFindings', () => {
  it('fails an over-budget scene on draws and triangles, naming the camera and the culprit', () => {
    const f = sceneBudgetFindings([TREE, HOUSE], forest(false), { draws: 200, triangles: 500000 });
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.code === 'T3D_SCENE_BUDGET')).toBe(true);
    expect(f.some((x) => x.part === 'draws' && /camera '\w+'/.test(x.message))).toBe(true);
    expect(f.some((x) => x.message.includes("most from 'tree'"))).toBe(true);
  });

  it('instancing collapses the draws of one asset to one set per LOD', () => {
    expect(sceneBudgetFindings([TREE], forest(true), { draws: 10 })).toEqual([]);
  });

  it('counts the shared trim sheet once, unique meshes and instances against their lines', () => {
    const p: ScenePlacement[] = [...forest(true), { asset: 'house', at: [0, 0, 0] }];
    expect(
      sceneBudgetFindings([TREE, HOUSE], p, { textureBytes: 64 * 1048576 /* 2^20 */ }),
    ).toEqual([]);
    const f = sceneBudgetFindings([TREE, HOUSE], p, { uniqueMeshes: 1, instances: 100 });
    expect(f.map((x) => x.part).sort()).toEqual(['instances', 'uniqueMeshes']);
    expect(
      sceneBudgetFindings([TREE], [{ asset: 'ghost', at: [0, 0, 0] }], {})[0]?.message,
    ).toContain("'ghost' has no stats");
  });

  it('picks LOD by projected size and culls what is behind the camera', () => {
    const stats = new Map([[TREE.name, TREE]]);
    const cam = {
      name: 'c',
      at: [0, 0, 2] as const,
      look: [10, 0, 2] as const,
      fov: 60,
      aspect: 1,
    };
    const near = cameraLoad(stats, [{ asset: 'tree', at: [8, 0, 0] }], {
      ...cam,
      at: [0, 0, 2],
      look: [10, 0, 2],
    });
    const far = cameraLoad(stats, [{ asset: 'tree', at: [400, 0, 0] }], {
      ...cam,
      at: [0, 0, 2],
      look: [10, 0, 2],
    });
    const behind = cameraLoad(stats, [{ asset: 'tree', at: [-50, 0, 0] }], {
      ...cam,
      at: [0, 0, 2],
      look: [10, 0, 2],
    });
    expect([near.triangles, far.triangles, behind.visible]).toEqual([20000, 300, 0]);
    expect(referenceCameras(forest(true)).map((c) => c.name)).toEqual([
      'street',
      'aerial',
      'overview',
    ]);
  });
});
