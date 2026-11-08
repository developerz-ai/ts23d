// Assertions that stuff is nicely connected (the `connections` gate, LOD0), for recipe tests:
//   it('every piece is attached', () => assertConnected(dragon));
//   it('horns grow from the skull', () => assertGrown(dragon, 'horn_*'));

import type { Asset } from '../core/index.ts';
import { connectionFindings, connectionReport, type Finding, glob } from '../qa/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';

/** Codes that mean a grown part is not growing from its parent. */
const GROWN_CODES = [
  'T3D_CONNECT_GLUED',
  'T3D_CONNECT_CREASE',
  'T3D_CONNECT_POKE',
  'T3D_CONNECT_ISLAND',
  'T3D_CONNECT_POINT',
];

/** No connection error anywhere (islands, point contacts, glued roots, eyes, seams). LOD0. */
export function assertConnected(asset: Asset, o: Pick<LodOptions, 'seed'> = {}): void {
  failOn(
    `${asset.name} connections`,
    compileLods(asset, { ...o, lods: [0] }).flatMap((c) =>
      connectionFindings(connectionReport(c)).map((finding) => ({ finding, lod: c.lod })),
    ),
  );
}

/** Parts matching `part` (name or glob) exist, touch their parent and grow from it: root buried
 *  all round, blended, not poking through. Works for any kind (it checks as if `grown`). */
export function assertGrown(asset: Asset, part: string, o: Pick<LodOptions, 'seed'> = {}): void {
  const match = glob(part);
  const found: { finding: Finding }[] = [];
  for (const c of compileLods(asset, { ...o, lods: [0] })) {
    const grown = {
      ...c,
      parts: c.parts.map((p) =>
        match.test(p.name) && !p.connect ? { ...p, connect: { as: 'grown' as const } } : p,
      ),
    };
    if (!grown.parts.some((p) => match.test(p.name) && p.mesh))
      found.push({
        finding: {
          gate: 'grown',
          message: `no part with geometry matches '${part}'`,
          fix: 'check the part name (globs allowed: horn_*)',
        },
      });
    for (const i of connectionReport(grown).issues)
      if (match.test(i.part) && i.severity === 'error' && GROWN_CODES.includes(i.code))
        found.push({
          finding: { gate: 'grown', part: i.part, message: `${i.code}: ${i.message}`, fix: i.fix },
        });
  }
  failOn(`${asset.name} grown '${part}'`, found);
}
