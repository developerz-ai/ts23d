// Real hinges, so every opening panel hangs off something: forged gooseneck arms under the hood's
// rear corners (riding on the hood) turning on pivot brackets bolted to the firewall under the cowl,
// two door hinges per side (leaf on the door, leaf and pin on the A-pillar jamb) and the trunk lid's
// goosenecks into brackets on the deck's front bulkhead. Arms are authored in the car frame
// (closed pose); body.ts moves them with their panel.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { merge } from '@developerz.ai/ts23d';
import { C } from '../lib/colors.ts';
import { bx, rod, tube } from '../lib/geo.ts';
import type { Surface } from '../lib/grid.ts';
import type { Hinges } from './body.ts';
import { inward } from './openings.ts';
import { X_HOOD_REAR, X_TRUNK_FRONT } from './panels.ts';
import { uAtY } from './regions.ts';

const HOOD_Y = 0.42;
const TRUNK_Y = 0.42;

/** Pivot pin + its bracket for one side (static). */
function pivot(lod: Lod, at: Vec3, y: number, drop: number): Mesh {
  const segs = lod === 0 ? 12 : 6;
  return merge([
    rod([at[0], y - 0.03, at[2]], [at[0], y + 0.03, at[2]], 0.018, C.natural, 'chrome', segs),
    bx(
      [at[0] - 0.03, y - 0.022, at[2] - drop],
      [at[0] + 0.03, y - 0.012, at[2] + 0.02],
      C.ironDark,
      'steel_painted',
    ),
    bx(
      [at[0] - 0.03, y + 0.012, at[2] - drop],
      [at[0] + 0.03, y + 0.022, at[2] + 0.02],
      C.ironDark,
      'steel_painted',
    ),
  ]);
}

export interface HingeMeshes {
  /** Static brackets on the body. */
  readonly brackets: Mesh;
  /** Door hinge knuckles + jamb leaves, left side (mirror for the right). */
  readonly doorBrackets: Mesh;
  /** Arms riding on the hood, the left door and the trunk lid (car frame, closed pose). */
  readonly hoodArms: Mesh;
  readonly doorLeaves: Mesh;
  readonly trunkArms: Mesh;
}

export function hingeParts(S: Surface, lod: Lod, h: Hinges): HingeMeshes {
  const segs = lod === 0 ? 10 : 6;
  const br: Mesh[] = [];
  const hood: Mesh[] = [];
  const trunk: Mesh[] = [];
  const door: Mesh[] = [];
  const db: Mesh[] = [];
  const sH = X_HOOD_REAR + 0.1;
  for (const s of [1, -1]) {
    const y = s * HOOD_Y;
    // Hood: gooseneck from the underside of the hood's rear, dipping under the cowl's front edge
    // and back up to the pin behind it.
    // At the far LOD the hood is a coarse sheet: start the arm a little proud so it still meets it.
    const top = inward(S, sH, uAtY(S, sH, HOOD_Y), lod === 2 ? -0.01 : 0.006);
    const p: Vec3 = [h.hood[0], y, h.hood[2]];
    hood.push(
      tube(
        [[top[0], y, top[2]], [top[0] - 0.02, y, top[2] - 0.05], [p[0] + 0.05, y, p[2] - 0.035], p],
        0.02,
        C.ironDark,
        'steel_painted',
        segs,
        3,
      ),
    );
    // The pivot's cheek plates run down onto the firewall's top edge (x 0.42–0.44, z 0.8).
    br.push(pivot(lod, p, y, 0.12));
    // Trunk: gooseneck from the lid's front underside to a pin on the deck bulkhead.
    const sT = X_TRUNK_FRONT - 0.04;
    const tt = inward(S, sT, uAtY(S, sT, TRUNK_Y), 0);
    const tp: Vec3 = [h.trunk[0], s * TRUNK_Y, h.trunk[2]]; // on the lid's motion axis
    trunk.push(
      tube(
        [[tt[0], s * TRUNK_Y, tt[2]], [tt[0] + 0.03, s * TRUNK_Y, tt[2] - 0.04], tp],
        0.016,
        C.ironDark,
        'steel_painted',
        segs,
        3,
      ),
    );
    br.push(pivot(lod, tp, s * TRUNK_Y, 0.06));
  }
  // Door hinges (left; mirrored by the caller): a leaf on the jamb and a leaf on the door's front
  // shut face, both wrapped round one pin that stands on the door's motion axis. The pin belongs
  // to the jamb; the door's leaf stays on it through the whole swing.
  for (const z of [0.42, 0.68]) {
    const k: Vec3 = [h.door[0], h.door[1], z];
    db.push(
      bx(
        [k[0] + 0.002, k[1] - 0.12, z - 0.03],
        [k[0] + 0.012, k[1], z + 0.03],
        C.ironDark,
        'steel_painted',
      ),
    );
    db.push(rod([k[0], k[1], z - 0.033], [k[0], k[1], z + 0.033], 0.01, C.natural, 'chrome', segs));
    door.push(
      bx(
        [k[0] - 0.012, k[1] - 0.12, z - 0.028],
        [k[0] - 0.002, k[1], z + 0.028],
        C.ironDark,
        'steel_painted',
      ),
    );
  }
  return {
    brackets: merge(br),
    doorBrackets: merge(db),
    hoodArms: merge(hood),
    doorLeaves: merge(door),
    trunkArms: merge(trunk),
  };
}
