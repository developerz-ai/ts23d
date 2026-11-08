// Saltmarch Warden Hall — the Accord's barracks (ORIGINAL design, see README.md and
// ../rts_faction/README.md), as ONE family exported in nine states: 3 build stages (foundation,
// scaffold, complete) × 3 damage states (intact, damaged, rubble). A bone-block hall on a slate
// plinth, team-colour gable roof and drum-tower cones (the RTS camera's read), a chevron porch,
// amber window slits and oculus. Damage is the same plan with holes, scorch, smoke and fire;
// rubble keeps wall stubs, heaps, charred beams and fallen team slabs, so ownership still reads.

import { defineFamily, type GrimeZone, type Vec3 } from '@developerz.ai/ts23d';
import { DUST, GRIME, Kit, type Rule, restrip, role, wearOf } from '../_lib/rts/finish.ts';
import {
  BONE,
  BONE_DARK,
  BRASS,
  chevronPlan,
  GLOW,
  IRON,
  TEAM,
  TEAM_PAINT,
  TEAM_VARIANTS,
  teamShade,
} from '../_lib/rts/style.ts';
import {
  type Damage,
  EAVES,
  HALF_X,
  HALF_Y,
  HOLES,
  PLINTH,
  type Stage,
  WALL_T,
  wallCells,
} from './plan.ts';
import {
  DOOR,
  gables,
  gate,
  PLASTER,
  porch,
  rafters,
  roofSlopes,
  TIMBER,
  tower,
  WOOD,
} from './roof.ts';
import { banner, FACE, fallenSlabs, materials, PLANK, POLE, rubble, scaffold } from './site.ts';
import { plinth, walls } from './walls.ts';

/** Materials: dressed stone, lime plaster, oak timber, tarred gate planks, weathered scaffold
 *  poles and pine planks, cast iron, brass; the team floor inlay is glazed ceramic. */
const RULES: readonly Rule[] = [
  role(BONE, 'concrete'),
  role(BONE_DARK, 'stone'),
  role(PLASTER, 'concrete'),
  role(TIMBER, 'oak'),
  role(WOOD, 'oak'),
  role(DOOR, 'oak'),
  role(POLE, 'wood_weathered'),
  role(PLANK, 'pine'),
  role(IRON, 'iron_cast'),
  role(BRASS, 'brass'),
  role(TEAM, 'plastic'),
  role(teamShade(0.8), 'slate'),
];

/** Rain drips: off the eaves along both long walls (complete hall), and below each sill. */
function dripSpots(sills: readonly Vec3[], roofed: boolean): { at: Vec3; radius: number }[] {
  const eaves: Vec3[] = [];
  if (roofed)
    for (const s of [1, -1])
      for (let x = -HALF_X + 0.75; x < HALF_X; x += 1.5)
        eaves.push([x, s * (HALF_Y + WALL_T / 2), EAVES - 0.06]);
  return [...eaves, ...sills].map((at) => ({ at, radius: 0.18 }));
}

/** Where each shell hole's scorch centres (outer wall face, ~row 4). */
function scorchZones(stage: Stage, damage: Damage): GrimeZone[] {
  if (damage !== 'damaged') return [];
  // A raided building site: blast marks on the plinth by the material piles.
  if (stage === 'foundation')
    return [
      { at: [HALF_X - 1, -HALF_Y + 2.5, PLINTH], radius: 2.2, strength: 0.8 },
      { at: [-1.5, 2, PLINTH], radius: 1.8, strength: 0.7 },
    ];
  const at: Record<(typeof HOLES)[number], Vec3> = {
    front_1: [FACE.x, -HALF_Y + 3, PLINTH + 2.2],
    right_1: [HALF_X - 2.9, -FACE.y, PLINTH + 2.2],
    right_3: [HALF_X - 6.7, -FACE.y, PLINTH + 2.2],
  };
  return HOLES.map((h) => ({ at: at[h], radius: 1.7, strength: 0.75 }));
}

const hall = defineFamily({
  kind: 'building',
  description:
    'Saltmarch Warden Hall: original RTS barracks, one family in 3 build stages × 3 damage states.',
  tags: ['rts', 'saltmarch', 'building', 'barracks', 'team-colour'],
  sources: [
    'recipes/rts_faction/README.md (original design brief)',
    'docs/playbooks/buildings/house.md (storey and door scale)',
  ],
  // LOD0/1 measured ≤ 49k / 8.6k: weather() tessellates the gables, towers and porch (60 cm /
  // 2 m) so moss, chips and streaks have vertices. LOD2 stays at the crowd budget.
  budget: { triangles: [52000, 9500, 1200] },
  paint: TEAM_PAINT,
  variants: TEAM_VARIANTS,
  glow: [{ parts: ['windows', 'oculus', 'beacon_*'], color: GLOW, strength: 3 }],
  defaults: { stage: 'complete' as Stage, damage: 'intact' as Damage },
  build(ctx, p) {
    const lod = ctx.lod;
    const { stage, damage } = p;
    const kit = new Kit();
    const add = (name: string, m: Parameters<Kit['add']>[1], o?: Parameters<Kit['add']>[2]) =>
      kit.add(name, m && restrip(m, RULES), o);
    const ruined = damage === 'rubble';
    add('plinth', plinth(lod, scorchZones(stage, damage)));
    const list = wallCells(stage, damage, ctx.rng.fork('walls'));
    const w = walls(lod, list, ctx.rng.fork('blocks'), scorchZones(stage, damage));
    if (w.walls) add('walls', w.walls);
    if (w.trim) add('pilasters', w.trim);
    if (w.windows) add('windows', w.windows);
    ctx.socket('rally', { kind: 'spawn', at: [HALF_X + 7, 0, 0], dir: [1, 0, 0] });
    ctx.socket('door', { kind: 'interact', at: [HALF_X + 0.4, 0, PLINTH] });

    // Towers: full with team cones when complete; one broken when damaged; stubs in rubble.
    for (const [s, side] of [
      [1, 'l'],
      [-1, 'r'],
    ] as const) {
      const full = stage === 'complete' ? 7.2 : stage === 'scaffold' ? 3.4 : 0.9;
      const broken = damage === 'damaged' && s === -1 && stage === 'complete';
      const h = ruined ? Math.min(full, s === 1 ? 1.8 : 1.2) : broken ? 5.2 : full;
      const t = tower(lod, s, h, stage === 'complete' && !ruined && !broken);
      add(`tower_${side}`, t.drum);
      if (t.cap) add(`tower_${side}_cap`, t.cap, { paint: 'team' });
      if (t.beacon) add(`beacon_${side}`, t.beacon);
      if (broken)
        ctx.emitter(`tower_${side}_smoke`, {
          kind: 'smoke',
          at: [-HALF_X, s * HALF_Y, h],
          rate: 10,
          life: 4,
          size: [0.8, 3.5],
          when: 'always',
        });
    }

    if (stage === 'complete' && !ruined) {
      const g = gables(lod);
      add('gables', g.walls);
      if (g.frame) add('gable_frame', g.frame);
      if (g.oculus) add('oculus', g.oculus);
      const missing = damage === 'damaged' ? [1, 2] : [];
      const left = roofSlopes(lod, 1, []);
      const right = roofSlopes(lod, -1, missing);
      if (left) add('roof_l', left, { paint: 'team' });
      if (right) add('roof_r', right, { paint: 'team' });
      const r = damage === 'damaged' ? rafters(lod) : null;
      if (r) add('rafters', r);
      add('porch', porch(lod, damage));
      const d = gate(lod, stage);
      if (d) add('gate', d);
    }

    // Banners: who owns this, in every state.
    const front = HALF_X + 3.4;
    if (stage === 'complete' && !ruined) {
      for (const [s, side] of [
        [1, 'l'],
        [-1, 'r'],
      ] as const) {
        const b = banner(lod, [front, s * 3.6, 0], 6.2, damage === 'damaged' && s === 1);
        add(`banner_pole_${side}`, b.pole);
        add(`banner_${side}`, b.cloth, { paint: 'team' });
      }
    } else if (!ruined) {
      const b = banner(lod, [front, -4.5, 0], stage === 'scaffold' ? 5.5 : 3.5);
      add('banner_pole_r', b.pole);
      add('banner_r', b.cloth, { paint: 'team' });
    }

    // No roof yet (or any more): the hall floor's team chevron inlay is what the RTS camera sees.
    if (stage !== 'complete' || ruined)
      add('floor_emblem', chevronPlan([0.6, 0, PLINTH - 0.02], 6.4, 9, 2.6, 0.04, TEAM), {
        paint: 'team',
      });
    if (stage === 'scaffold' && !ruined) {
      const sc = scaffold(lod, 4.6);
      add('scaffold', sc.frame);
      add('tarp', sc.tarp, { paint: 'team' });
      ctx.emitter('build_dust', {
        kind: 'dust',
        at: [HALF_X + 1, -HALF_Y + 1, PLINTH],
        rate: 6,
        life: 2.5,
        size: [0.4, 1.8],
        when: 'always',
      });
    }
    if (stage === 'foundation' && !ruined) {
      const m = materials(lod, ctx.rng.fork('materials'));
      add('materials', m.piles);
      add('tarps', m.tarps, { paint: 'team' });
    }

    if (damage === 'damaged') {
      const heap = ctx.rng.fork('debris');
      add(
        'debris',
        rubble(
          lod,
          heap,
          [HALF_X + 1.3, -HALF_Y + 3, 0],
          [0.6, 1.2, 0.5],
          lod === 0 ? 14 : lod === 1 ? 6 : 3,
          0,
        ),
      );
      for (const [i, z] of scorchZones(stage, damage).entries())
        ctx.emitter(`smoke_${i}`, {
          kind: 'smoke',
          at: z.at,
          dir: [0, 0, 1],
          rate: 12,
          life: 3.5,
          size: [0.6, 3],
          when: 'always',
        });
      const fireZ = stage === 'complete' ? EAVES : stage === 'scaffold' ? 3.2 : PLINTH;
      ctx.emitter('fire_0', {
        kind: 'fire',
        at: [0, -HALF_Y + 1, fireZ],
        rate: 30,
        life: 0.9,
        size: [0.5, 1.4],
        when: 'always',
      });
    }
    if (ruined) {
      const heap = ctx.rng.fork('rubble');
      const n = stage === 'complete' ? 1 : stage === 'scaffold' ? 0.6 : 0.25;
      add(
        'rubble',
        rubble(
          lod,
          heap,
          [0, 0, 0],
          [HALF_X - 1, HALF_Y - 1, 2.4 * n],
          Math.round((lod === 0 ? 70 : lod === 1 ? 30 : 9) * n) + 2,
          PLINTH,
        ),
      );
      add('fallen_roof', fallenSlabs(lod, heap, PLINTH), { paint: 'team' });
      for (const [i, at] of (
        [
          [1, -2, 1.5],
          [-2, 3, 1.2],
        ] as Vec3[]
      ).entries())
        ctx.emitter(`smoke_${i}`, {
          kind: 'smoke',
          at,
          dir: [0, 0, 1],
          rate: 6,
          life: 5,
          size: [0.5, 3.5],
          when: 'always',
        });
    }
    // Measured wear: chipped arrises, moss and damp up the plinth and wall foot, salt dust on
    // ledges, rain streaks off the eaves and under the sills; ruins and raids add rubble dust.
    const hurt = damage !== 'intact';
    const masonry = wearOf('masonry', 'hall_masonry', 71);
    const drips = dripSpots(w.sills, stage === 'complete' && !ruined);
    kit.commit(ctx, [
      {
        wear: {
          ...masonry,
          resolution: [0, 2.5, 0],
          ground: 0,
          ...(lod < 2 && drips.length ? { fasteners: drips } : {}),
          effects: {
            ...masonry.effects,
            ...(hurt
              ? { dust: { where: 'up-facing', amount: 0.5, color: DUST, strength: 0.55 } }
              : {}),
            ...(lod < 2 && drips.length
              ? {
                  rust: {
                    where: 'fasteners | below-fasteners',
                    amount: 0.55,
                    color: GRIME,
                    strength: 0.55,
                    streaks: true,
                    streakLength: 1.6,
                  },
                }
              : {}),
          },
        },
        // Blocks and plinth already carry vertices at every arris: no extra tessellation at LOD0.
        pick: (n) => /^(walls|pilasters|plinth)$/.test(n),
      },
      {
        wear: {
          ...masonry,
          name: 'hall_render',
          seed: 74,
          resolution: [0.6, 2.0, 0],
          ground: 0,
          effects: {
            ...masonry.effects,
            ...(hurt
              ? { dust: { where: 'up-facing', amount: 0.5, color: DUST, strength: 0.55 } }
              : {}),
          },
        },
        pick: (n) => /^(gables|tower_[lr]|porch)$/.test(n),
      },
      {
        wear: {
          name: 'hall_rubble',
          seed: 72,
          age: 0.8,
          resolution: [0, 0, 0],
          effects: {
            chips: { where: 'convex-edges', amount: 0.12, strength: 0.5 },
            dust: { where: 'up-facing', amount: 0.55, color: DUST, strength: 0.6 },
          },
        },
        pick: (n) => n === 'rubble' || n === 'debris',
      },
      {
        wear: { ...wearOf('cloth', 'hall_timber', 73), ground: 0, resolution: [0, 0, 0] },
        pick: (n) => /^(gable_frame|rafters|gate|scaffold|materials|banner_pole_[lr])$/.test(n),
      },
    ]);
  },
});

/** Design envelopes (an invented building: the brief is the source) and the one human-scale spec:
 *  the gate clears 3.5 m, ×1.8 a 1.92 m Warden, so units walk in and out without clipping. */
const GATE = {
  label: 'gate height',
  value: 3.5,
  axis: 'z' as const,
  parts: ['gate'],
  source: 'recipes/rts_faction/README.md',
};

export const rts_barracks = hall.variant({
  name: 'rts_barracks',
  real: { length: 15.78, width: 18.5, height: 11.05, measures: [GATE] },
});
export const rts_barracks_damaged = hall.variant({
  name: 'rts_barracks_damaged',
  params: { damage: 'damaged' },
  real: { length: 15.78, width: 18.25, height: 11.05, measures: [GATE] },
});
export const rts_barracks_rubble = hall.variant({
  name: 'rts_barracks_rubble',
  params: { damage: 'rubble' },
  real: { length: 13.3, width: 18, height: 2.59 },
});
export const rts_barracks_scaffold = hall.variant({
  name: 'rts_barracks_scaffold',
  params: { stage: 'scaffold' },
  real: { length: 15.53, width: 18, height: 5.5 },
});
export const rts_barracks_scaffold_damaged = hall.variant({
  name: 'rts_barracks_scaffold_damaged',
  params: { stage: 'scaffold', damage: 'damaged' },
  real: { length: 15.53, width: 18, height: 5.5 },
});
export const rts_barracks_scaffold_rubble = hall.variant({
  name: 'rts_barracks_scaffold_rubble',
  params: { stage: 'scaffold', damage: 'rubble' },
  real: { length: 13.3, width: 18, height: 2.23 },
});
export const rts_barracks_foundation = hall.variant({
  name: 'rts_barracks_foundation',
  params: { stage: 'foundation' },
  real: { length: 17.93, width: 19.1, height: 3.5 },
});
export const rts_barracks_foundation_damaged = hall.variant({
  name: 'rts_barracks_foundation_damaged',
  params: { stage: 'foundation', damage: 'damaged' },
  real: { length: 17.93, width: 19.1, height: 3.5 },
});
export const rts_barracks_foundation_rubble = hall.variant({
  name: 'rts_barracks_foundation_rubble',
  params: { stage: 'foundation', damage: 'rubble' },
  real: { length: 13.3, width: 18, height: 1.68 },
});
