// What the site's GLB is: the options every viewer build and download is written with, and the
// parts list read back from the bytes. Compile parts are not GLB nodes: static parts merge into
// their pivot (t34's `hull` and `fittings` become `body`), so the list names the nodes the file
// actually has, and hovering a row always has something to outline. Pure: no DOM, no three.js.

import type { GlbOptions } from '@developerz.ai/ts23d';
import { readGlbChunks } from '@developerz.ai/ts23d/export';
import type { BuildRequest, PartInfo } from './compile-protocol.ts';

/**
 * `toGlb` options for a request. Sound emitters are left out: KHR_audio_emitter references
 * `<clip>.wav` files beside the GLB, and a download is one file, so those references would dangle
 * (the exporter cannot embed clips). The page plays the committed WAVs itself (sound-panel.ts).
 */
export const exportOptions = (request: Pick<BuildRequest, 'animations' | 'keepParts'>) =>
  ({
    animations: request.animations ?? true,
    keepParts: request.keepParts ?? false,
    sounds: false,
  }) satisfies GlbOptions;

type Json = Readonly<Record<string, unknown>>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const list = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);
const ints = (v: unknown): number[] => list(v).filter((n) => typeof n === 'number');

/** What the list says about a part beyond its node: read from the compile part of the same name. */
type Role = Pick<PartInfo, 'name' | 'motion' | 'emitter'>;

/**
 * The named nodes of `glb` as the parts list, parents before children. Left out: the scene root
 * (the asset wrapper) and a skin's joints (bones; the viewer draws the skeleton itself).
 */
export function nodeParts(glb: Uint8Array, roles: readonly Role[]): PartInfo[] {
  const json = obj(readGlbChunks(glb).json);
  const nodes = list(json['nodes']).map(obj);
  const meshes = list(json['meshes']).map(obj);
  const accessors = list(json['accessors']).map(obj);
  const count = (accessor: unknown): number =>
    typeof accessor === 'number' ? Number(accessors[accessor]?.['count'] ?? 0) : 0;
  const trianglesOf = (node: Json): number => {
    const mesh = node['mesh'];
    if (typeof mesh !== 'number') return 0;
    return list(meshes[mesh]?.['primitives'])
      .map(obj)
      .filter((p) => (p['mode'] ?? 4) === 4)
      .reduce((n, p) => {
        const indexed = p['indices'] !== undefined;
        return n + count(indexed ? p['indices'] : obj(p['attributes'])['POSITION']) / 3;
      }, 0);
  };
  const joints = new Set(list(json['skins']).flatMap((s) => ints(obj(s)['joints'])));
  const roots = list(json['scenes']).flatMap((s) => ints(obj(s)['nodes']));
  const byName = new Map(roles.map((r) => [r.name, r]));
  const parts: PartInfo[] = [];
  const walk = (index: number, parent: string | null, root: boolean): void => {
    const node = nodes[index];
    if (!node) return;
    const name = typeof node['name'] === 'string' ? node['name'] : '';
    const listed = !root && name !== '' && !(joints.has(index) && node['mesh'] === undefined);
    if (listed) {
      const role = byName.get(name);
      parts.push({
        name,
        parent,
        triangles: trianglesOf(node),
        motion: role?.motion ?? null,
        emitter: role?.emitter ?? null,
      });
    }
    for (const child of ints(node['children'])) walk(child, listed ? name : parent, false);
  };
  for (const root of roots) walk(root, null, true);
  return parts;
}
