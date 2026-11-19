// Saltmarch Warden Hall — the Accord's barracks (ORIGINAL design, see README.md and
// ../rts_faction/README.md), as ONE family exported in nine states: 3 build stages (foundation,
// scaffold, complete) × 3 damage states (intact, damaged, rubble). A bone-block hall on a slate
// plinth, team-colour gable roof and drum-tower cones (the RTS camera's read), a chevron porch,
// amber window slits and oculus. Damage is the same plan with holes, scorch, smoke and fire;
// rubble keeps wall stubs, heaps, charred beams and fallen team slabs, so ownership still reads.

import {
  defineFamily,
  type GrimeZone,
  type Lod,
  type Mesh,
  merge,
  place,
  type Rng,
  type Vec3,
} from '@developerz.ai/ts23d';
import {
  band,
  DUST,
  GRIME,
  Kit,
  MOSS,
  MUD,
  type Rule,
  restrip,
  role,
  soot,
  wearOf,
} from '../_lib/rts/finish.ts';
import {
  BONE,
  BONE_DARK,
  BRASS,
  GLOW,
  IRON,
  TEAM,
  TEAM_PAINT,
  TEAM_VARIANTS,
  teamShade,
} from '../_lib/rts/style.ts';
import {
  type Bay,
  COLS,
  COURSE,
  type Damage,
  DOOR_ROWS,
  EAVES,
  HALF_X,
  HALF_Y,
  HOLES,
  PLINTH,
  ROWS,
  type Stage,
  TOWER,
  WALL_T,
  wallCells,
} from './plan.ts';
import {
  CHARRED_SLATE,
  DOOR,
  gables,
  gate,
  lamp,
  OVERHANG,
  PLASTER,
  porch,
  porchRoof,
  RIDGE,
  rafters,
  ridgeRoll,
  roofSlopes,
  TIMBER,
  tower,
  WOOD,
} from './roof.ts';
import {
  ASH,
  ASH_GREY,
  BARROW,
  banner,
  bar,
  CHAR_SLATE,
  charredFrame,
  FACE,
  fallenSlabs,
  GRIT,
  MORTAR,
  materials,
  PLANK,
  POLE,
  ROPE,
  rubble,
  scaffold,
  scaffoldWreck,
} from './site.ts';
import { emblem, FLOOR, floor, STAIN, type Stain } from './surface.ts';
import { plinth, walls } from './walls.ts';
import { groundStains, hod, sheerLegs, slabChunks } from './yard.ts';

/** Materials: dressed stone, lime plaster, oak timber, tarred gate planks, weathered scaffold
 *  poles and pine planks, hemp rope, lime mortar, cast iron, brass; the team floor inlay is
 *  glazed ceramic. */
const RULES: readonly Rule[] = [
  role(BONE, 'concrete'),
  role(BONE_DARK, 'stone'),
  role(PLASTER, 'concrete'),
  role(TIMBER, 'oak'),
  role(WOOD, 'oak'),
  role(DOOR, 'oak'),
  role(ASH, 'oak'),
  role(POLE, 'wood_weathered'),
  role(PLANK, 'pine'),
  role(ROPE, 'canvas'),
  role(BARROW, 'steel_painted'),
  role(MORTAR, 'concrete'),
  role(GRIT, 'concrete'),
  role(ASH_GREY, 'concrete'),
  role(CHAR_SLATE, 'slate'),
  role(CHARRED_SLATE, 'slate'),
  role(IRON, 'iron_cast'),
  role(BRASS, 'brass'),
  role(TEAM, 'plastic'),
  role(teamShade(0.8), 'slate'),
];

/** Rising damp and lichen at a wall foot: dark olive-grey. */
const DAMP: Vec3 = [0.24, 0.25, 0.19];

/** The right slope's shell hole (strips 1–2 of 5), as world x. */
const ROOF_HOLE: readonly [number, number] = [
  -HALF_X - OVERHANG + ((HALF_X + OVERHANG) * 2 * 1) / 5,
  -HALF_X - OVERHANG + ((HALF_X + OVERHANG) * 2 * 3) / 5,
];

/** Rain drips: off the eaves along both long walls (complete hall), and below each sill. */
function dripSpots(
  sills: readonly Vec3[],
  roofed: boolean,
  top: number | null,
): { at: Vec3; radius: number }[] {
  const eaves: Vec3[] = [];
  if (roofed)
    for (const s of [1, -1])
      for (let x = -HALF_X + 0.75; x < HALF_X; x += 1.0)
        eaves.push([x, s * (HALF_Y + WALL_T / 2), EAVES - 0.06]);
  // A wall going up: mortar slopped off the top course runs down the faces the scaffold hides.
  if (top !== null) {
    for (let x = -HALF_X + 0.6; x < HALF_X; x += 1.3) eaves.push([x, -(HALF_Y + WALL_T / 2), top]);
    for (let y = -HALF_Y + 0.6; y < HALF_Y; y += 1.3) eaves.push([HALF_X + WALL_T / 2, y, top]);
  }
  return [
    ...eaves.map((at) => ({ at, radius: 0.3 })),
    ...sills.map((at) => ({ at, radius: 0.24 })),
  ];
}

/** A soot fan over a burn: the scorch round the hole, then the smoke's stain widening up the
 *  wall above it. */
const streak = (at: Vec3, r: number, k: number): GrimeZone[] => [
  { at, radius: r, strength: k },
  { at: [at[0], at[1], at[2] + r * 0.8], radius: r * 1.05, strength: k * 0.7 },
  { at: [at[0], at[1], at[2] + r * 1.6], radius: r * 1.2, strength: k * 0.45 },
];

/**
 * Burnt tops: a tight, near-black soot patch over the broken top of every standing column (most
 * of them; the fire burnt out through the breaks) and round the rim of every shell hole, so the
 * soot sits on the breaks with clean stone between, not a grey cast over everything.
 */
function burntTops(list: readonly Bay[], rng: Rng, ruin: boolean): GrimeZone[] {
  const out: GrimeZone[] = [];
  for (const b of list) {
    // A damaged building burnt only where it was hit; a ruin burnt everywhere.
    const hit = ruin || (HOLES as readonly string[]).includes(b.id);
    const w = b.len / COLS;
    for (let c = 0; c < COLS; c++) {
      let top = 0;
      for (let r = 0; r < ROWS; r++) if (b.cells[r]?.[c]) top = r + 1;
      const t = (c + 0.5) * w;
      const p = (z: number, o = WALL_T / 2): Vec3 => [
        b.origin[0] + b.dir[0] * t + b.out[0] * o,
        b.origin[1] + b.dir[1] * t + b.out[1] * o,
        z,
      ];
      if (hit && top > 0 && top < ROWS && rng.next() < 0.75)
        out.push({
          at: p(PLINTH + top * COURSE),
          radius: rng.range(1.0, 1.5),
          strength: rng.range(0.95, 1),
        });
      // A hole: a missing cell with stone still standing above it.
      for (let r = 0; r < top - 1; r++)
        if (!b.cells[r]?.[c] && !(b.doorCols[c] && r < DOOR_ROWS))
          out.push({ at: p(PLINTH + (r + 0.5) * COURSE), radius: 1.0, strength: 0.85 });
    }
  }
  return out;
}

/** Soot zones (applied after weathering): fans over shell holes, blast marks on a raided site,
 *  burnt ruins (see `burntTops` for the walls' broken tops). */
function scorchZones(stage: Stage, damage: Damage): GrimeZone[] {
  // Nothing burnt on an intact building (a site's mud and mortar are on its floor flags).
  if (damage === 'intact') return [];
  if (damage === 'rubble')
    return [
      // The heap's heart and the standing corner, where the fire burnt longest.
      { at: [FACE.x, -FACE.y, PLINTH + 3.6], radius: 1.4, strength: 0.9 },
      { at: [1, -2, PLINTH], radius: 2.6, strength: 0.8 },
      { at: [-2, 3, PLINTH], radius: 2.2, strength: 0.75 },
    ];
  // A raided building site: blast marks on the plinth by the material piles.
  if (stage === 'foundation')
    return [
      { at: [HALF_X - 1, -HALF_Y + 2.5, PLINTH], radius: 2.2, strength: 0.8 },
      { at: [-1.5, 2, PLINTH], radius: 1.8, strength: 0.7 },
      { at: [HALF_X, -HALF_Y, PLINTH], radius: 1.6, strength: 0.6 },
    ];
  const at: Record<(typeof HOLES)[number], Vec3> = {
    front_1: [FACE.x, -HALF_Y + 3, PLINTH + 2.2],
    right_1: [HALF_X - 2.9, -FACE.y, PLINTH + 2.2],
    right_3: [HALF_X - 6.7, -FACE.y, PLINTH + 2.2],
  };
  return HOLES.flatMap((h) => streak(at[h], 2.1, 0.92));
}

/** What the floor flags show per stage: trodden mud and mortar splash on a site, soot and ash
 *  in a ruin, a scorch round a raid's blast. Large discs: they read at hero distance. */
function floorStains(stage: Stage, damage: Damage): Stain[] {
  const mud = (x: number, y: number, r: number, k = 0.55): Stain => ({
    at: [x, y],
    radius: r,
    color: STAIN.mud,
    k,
  });
  const mortar = (x: number, y: number, r: number): Stain => ({
    at: [x, y],
    radius: r,
    color: STAIN.mortar,
    k: 0.55,
  });
  const scorch = (x: number, y: number, r: number, k = 0.85): Stain => ({
    at: [x, y],
    radius: r,
    color: STAIN.scorch,
    k,
  });
  const ash = (x: number, y: number, r: number, k = 0.5): Stain => ({
    at: [x, y],
    radius: r,
    color: STAIN.ash,
    k,
  });
  if (damage === 'rubble')
    return [
      scorch(1, -2, 3.4, 0.95),
      scorch(-2, 3, 3.0, 0.9),
      scorch(3.2, 4, 2.2, 0.8),
      scorch(-3, -4.5, 2.4, 0.85),
      scorch(HALF_X - 0.5, -1, 2, 0.75),
      ash(0.2, 0.4, 2.2),
      ash(-1.4, -4.6, 1.6, 0.45),
      ash(2.6, 1.8, 1.4, 0.4),
    ];
  const site: Stain[] =
    stage === 'foundation'
      ? [
          mud(HALF_X + 0.2, 0, 2.4),
          mud(HALF_X - 0.3, 4.2, 1.6, 0.6),
          mud(HALF_X - 0.3, -4.5, 1.5, 0.6),
          mud(-1, -HALF_Y + 0.2, 1.8, 0.5),
          mortar(-HALF_X + 1.6, HALF_Y - 1.4, 1.2),
          mortar(-HALF_X + 1.6, -HALF_Y + 1.4, 1.1),
          mortar(1.5, HALF_Y - 0.4, 0.9),
        ]
      : stage === 'scaffold'
        ? [
            mud(HALF_X - 0.6, 0, 2.6),
            mortar(HALF_X - 1, -4, 1),
            mortar(HALF_X - 1, 3.5, 0.9),
            mortar(-1.5, -HALF_Y + 1, 1.1),
            mortar(2.5, -HALF_Y + 1, 0.9),
            mud(-2, 1, 2.2, 0.3),
          ]
        : [];
  if (damage === 'damaged')
    site.push(
      scorch(HALF_X - 0.6, -HALF_Y + 1.2, 3.6, 0.9),
      ash(HALF_X - 2.8, -HALF_Y + 3.4, 2.6),
      scorch(-1.5, 2, 1.8, 0.6),
    );
  return site;
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
  // Saltmarch lamps glow at 1.2 across the RTS set: lit amber, not blown to white.
  glow: [{ parts: ['windows', 'oculus', 'beacon_*', 'lamp_glow'], color: GLOW, strength: 1.2 }],
  defaults: { stage: 'complete' as Stage, damage: 'intact' as Damage },
  build(ctx, p) {
    const lod = ctx.lod;
    const { stage, damage } = p;
    const kit = new Kit();
    /** Restrip onto real materials, then scorch (so the scorch never hides a role colour). */
    const add = (
      name: string,
      m: Mesh | null,
      o?: Parameters<Kit['add']>[2],
      burn: readonly GrimeZone[] = [],
      after?: (m: Mesh) => Mesh,
    ) => {
      // Soot goes on after weathering: up-facing dust would otherwise paint over burnt tops.
      const post =
        burn.length || after
          ? (x: Mesh): Mesh => {
              const y = after ? after(x) : x;
              return burn.length ? soot(y, burn) : y;
            }
          : undefined;
      kit.add(name, m && restrip(m, RULES), o, post);
    };
    /** Loose wreckage lies where it fell: resting contact, not a seated joint. */
    const LOOSE = { connect: { as: 'rest', why: 'loose rubble lies where it fell' } } as const;
    const ruined = damage === 'rubble';
    const list = wallCells(stage, damage, ctx.rng.fork('walls'));
    const zones = [
      ...scorchZones(stage, damage),
      ...(damage === 'intact' ? [] : burntTops(list, ctx.rng.fork('soot'), ruined)),
    ];
    add('plinth', plinth(lod, stage === 'foundation' && damage === 'damaged'), {}, zones);
    // The roof stands on complete, unruined halls only (built below).
    const finished = stage === 'complete' && !ruined;
    const w = walls(
      lod,
      list,
      ctx.rng.fork('blocks'),
      finished,
      finished,
      stage === 'scaffold' && !ruined,
    );
    // Rising damp: a dark, green-tinged band up the wall foot, ragged at its top.
    const damp = (top: number) => (m: Mesh) =>
      band(m, { top, full: PLINTH + 0.05, color: DAMP, k: 0.5 }, 0.12);
    if (w.walls) add('walls', w.walls, {}, zones, damp(PLINTH + 1.0));
    if (w.stains) add('wall_stains', w.stains, {}, zones);
    if (w.trim) add('pilasters', w.trim, {}, zones, damp(PLINTH + 1.0));
    if (w.frames) add('window_frames', w.frames, {}, zones);
    if (w.windows) add('windows', w.windows);
    ctx.socket('rally', { kind: 'spawn', at: [HALF_X + 7, 0, 0], dir: [1, 0, 0] });
    ctx.socket('door', { kind: 'interact', at: [HALF_X + 0.4, 0, PLINTH] });

    // Towers: full with team cones when complete; one broken when damaged; stubs in rubble (the
    // camera-side one left standing ~4 m with its broken crown, the ruin's vertical).
    for (const [s, side] of [
      [1, 'l'],
      [-1, 'r'],
    ] as const) {
      const full = stage === 'complete' ? 7.2 : stage === 'scaffold' ? 3.4 : 0.9;
      const broken = damage === 'damaged' && s === -1 && stage === 'complete';
      const h = ruined ? Math.min(full, s === -1 ? 2.6 : 1.2) : broken ? 5.2 : full;
      const capped = stage === 'complete' && !ruined && !broken;
      const crown = ruined || broken ? 'broken' : 'laying';
      const t = tower(lod, s, h, capped, crown, ctx.rng.fork(`tower_${side}`));
      // Soot round the broken crown: patches on the ring top, most on the camera's side.
      const scorched: GrimeZone[] =
        ruined || broken
          ? [-1.2, -0.4, 0.4, 1.2, 2.4].map((a) => ({
              at: [
                TOWER.x + Math.cos(a) * TOWER.r,
                s * TOWER.y + Math.sin(a) * TOWER.r * -s,
                h + 0.4,
              ] as Vec3,
              radius: 1.1,
              strength: 0.95,
            }))
          : [];
      add(`tower_${side}`, t.drum, {}, scorched, (m) =>
        band(m, { top: 1.6, full: 0.15, color: DAMP, k: 0.55 }, 0.15),
      );
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
      const hit = damage === 'damaged';
      const left = roofSlopes(lod, 1, [], ctx.rng.fork('roof_l'));
      const charred: Mesh[] = [];
      const right = roofSlopes(lod, -1, hit ? [1, 2] : [], ctx.rng.fork('roof_r'), charred);
      // Scorch round the roof hole: the slates there are burnt dark.
      const burnt: GrimeZone[] = hit
        ? [
            {
              at: [(ROOF_HOLE[0] + ROOF_HOLE[1]) / 2, -4, (EAVES + RIDGE) / 2],
              radius: 4.4,
              strength: 0.92,
            },
          ]
        : [];
      if (left) add('roof_l', left, { paint: 'team' });
      if (right) add('roof_r', right, { paint: 'team' }, burnt);
      // Slates burnt black round the hole: their team paint is gone.
      if (charred.length) add('roof_burnt', merge(charred), {}, burnt);
      add('roof_ridge', ridgeRoll(lod), { paint: 'team' });
      const r = hit ? rafters(lod, ROOF_HOLE) : null;
      if (r) add('rafters', r, {}, burnt);
      add('porch', porch(lod));
      add('porch_roof', porchRoof(lod, hit, ctx.rng.fork('porch')), { paint: 'team' });
      const d = gate(lod);
      add('gate', d.leaves);
      if (d.surround) add('portal', d.surround);
      const l = lamp(lod);
      if (l) {
        add('lamp', l.iron);
        add('lamp_glow', l.glass);
      }
    }

    // Banners: who owns this, in every state.
    const front = HALF_X + 3.4;
    if (stage === 'complete' && !ruined) {
      for (const [s, side] of [
        [1, 'l'],
        [-1, 'r'],
      ] as const) {
        const b = banner(lod, [front + 0.4, s * 3.6, 0], 6.2, damage === 'damaged' && s === 1);
        add(`banner_pole_${side}`, b.pole);
        add(`banner_${side}`, b.cloth, { paint: 'team' });
      }
    } else if (!ruined) {
      const b = banner(lod, [front, -4.5, 0], stage === 'scaffold' ? 5.5 : 3.5);
      add('banner_pole_r', b.pole);
      add('banner_r', b.cloth, { paint: 'team' });
    } else if (stage === 'foundation') {
      // The survey banner survived the raid, knocked askew, its cloth torn: the ruin's vertical.
      const b = banner(lod, [0, 0, 0], 3.5, true);
      const lean = { at: [front, -4.5, 0] as Vec3, pitch: -0.2 };
      add('banner_pole_r', place(b.pole, lean));
      add('banner_r', place(b.cloth, lean), { paint: 'team' });
    }

    // No roof yet (or any more): flagstones, and the team chevron painted on them, are what the
    // RTS camera sees.
    const floored = stage !== 'complete' || ruined;
    if (floored) {
      const stains = floorStains(stage, damage);
      const f = floor(lod, ctx.rng.fork('floor'), stains);
      kit.add('floor', f.mesh);
      // Soot dims the paint where the floor burnt.
      const dim = (x: number, y: number): number =>
        stains
          .filter((st) => st.color === STAIN.scorch)
          .reduce((k, st) => {
            const d = Math.hypot(x - st.at[0], y - st.at[1]) / st.radius;
            return d < 1 ? k * (1 - st.k * 0.6 * (1 - d)) : k;
          }, 1);
      kit.add(
        'floor_emblem',
        emblem(
          lod,
          ctx.rng.fork('emblem'),
          f.cells,
          [0.4, 0],
          // Half the old 10 m decal on an open floor; larger inside a scaffold's walls, which
          // hide its arms' ends from the RTS camera.
          stage === 'scaffold' && !ruined
            ? { len: 5.6, span: 8, arm: 2.1 }
            : stage === 'foundation'
              ? { len: 4.8, span: 6.8, arm: 1.85 }
              : { len: 4.4, span: 6.2, arm: 1.7 },
          dim,
        ),
        { paint: 'team' },
      );
    }
    if (stage === 'scaffold' && !ruined) {
      const sc = scaffold(lod, 4.6, ctx.rng.fork('scaffold'), damage === 'damaged');
      // Brine mud splashed up the pole feet and the ladder's.
      add('scaffold', sc.frame, {}, [], (m) =>
        band(m, { top: 0.7, full: 0.05, color: MUD, k: 0.8 }, 0.08),
      );
      add('scaffold_decks', sc.decks);
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
      const raided = damage === 'damaged';
      const m = materials(lod, ctx.rng.fork('materials'), raided);
      add('materials', m.piles);
      add('tarps', m.tarps, { paint: 'team' });
      // The site's vertical: sheer-legs over the −Y footing (knocked over in a raid).
      add('sheer_legs', sheerLegs(lod, raided), raided ? LOOSE : {});
      add('hod', hod(lod, [-1, -(HALF_Y + 2.4), 0], 1.49));
      kit.add('ground_stains', groundStains(lod, ctx.rng.fork('stains'), raided));
      if (raided) add('slab_chunks', slabChunks(lod, ctx.rng.fork('chunks')), LOOSE);
    }

    if (damage === 'damaged') {
      const heap = ctx.rng.fork('debris');
      const n = lod === 0 ? 16 : lod === 1 ? 7 : 2;
      const debris = [rubble(lod, heap, [HALF_X + 1.3, -HALF_Y + 3, 0], [0.6, 1.2, 0.5], n, 0)];
      if (stage === 'foundation')
        // Blocks thrown across the yard between the pallets.
        debris.push(
          rubble(
            lod,
            heap.fork('scatter'),
            [HALF_X + 2.6, 0, 0],
            [0.8, 3, 0.3],
            Math.max(2, n - 4),
            0,
          ),
        );
      add('debris', merge(debris), LOOSE, zones);
      for (const [i, z] of zones.filter((_, k) => k % 3 === 0 || stage === 'foundation').entries())
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
          Math.round((lod === 0 ? 70 : lod === 1 ? 30 : 12) * n) + 2,
          FLOOR,
        ),
        LOOSE,
        zones,
      );
      const fallen = fallenSlabs(lod, heap, FLOOR, stage === 'foundation' ? 'tarp' : 'roof');
      add('fallen_roof', fallen.slabs, { paint: 'team' });
      if (fallen.grit) add('grit', fallen.grit, LOOSE);
      if (stage === 'scaffold')
        add('scaffold_wreck', scaffoldWreck(lod, heap.fork('wreck'), PLINTH + 5 * COURSE), LOOSE);
      if (stage === 'foundation') add('wreck', leaningPallet(lod), LOOSE);
      // A charred frame left standing: the gate's door frame, or a site shed's posts.
      if (stage !== 'scaffold')
        add('burnt_frame', charredFrame(lod, stage === 'complete' ? 'gate' : 'yard', FLOOR));
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
    // Measured wear: chipped arrises, damp and moss up the plinth and wall foot, salt dust on
    // ledges, rain streaks off the eaves and under the sills; ruins and raids add rubble dust; a
    // building site has mud and mortar slopped round its foot.
    const hurt = damage !== 'intact';
    const site = stage !== 'complete';
    const masonry = wearOf('masonry', 'hall_masonry', 71);
    const drips = dripSpots(
      w.sills,
      stage === 'complete' && !ruined,
      stage === 'scaffold' && !ruined ? PLINTH + 4 * COURSE - 0.1 : null,
    );
    const dust = {
      dust: {
        where: 'up-facing',
        amount: hurt || site ? 0.55 : 0.35,
        color: DUST,
        strength: hurt || site ? 0.6 : 0.45,
      },
    };
    kit.commit(ctx, [
      {
        wear: {
          ...masonry,
          resolution: [0, 2.5, 0],
          ground: 0,
          groundBand: 1.5,
          ...(lod < 2 && drips.length ? { fasteners: drips } : {}),
          effects: {
            ...masonry.effects,
            moss: {
              where: 'ground-near & !down-facing',
              amount: 0.45,
              color: MOSS,
              strength: 0.75,
            },
            mud: {
              where: 'ground-near & !up-facing',
              amount: site ? 0.55 : 0.3,
              color: MUD,
              strength: 0.6,
            },
            ...dust,
            ...(lod < 2 && drips.length
              ? {
                  rust: {
                    where: 'fasteners | below-fasteners',
                    amount: 0.7,
                    color: GRIME,
                    strength: 0.7,
                    streaks: true,
                    streakLength: 2.2,
                  },
                }
              : {}),
          },
        },
        // Blocks already carry vertices at every arris: no extra tessellation at LOD0.
        pick: (n) => /^(walls|pilasters|window_frames|portal)$/.test(n),
      },
      {
        // The plinth is one big slab: tessellate it so damp, mud and dust have vertices.
        wear: {
          ...masonry,
          name: 'hall_plinth',
          seed: 75,
          // Under a finished hall only the rim shows; elsewhere the flags cover the top: only the
          // rim's length needs splitting so damp and mud climb it in steps.
          resolution: stage === 'complete' && !ruined ? [0, 0, 0] : [2.0, 0, 0],
          ground: 0,
          groundBand: 0.9,
          effects: {
            chips: { where: 'convex-edges', amount: 0.12, strength: 0.5 },
            moss: { where: 'ground-near & side-facing', amount: 0.4, color: MOSS, strength: 0.7 },
            mud: { where: 'ground-near & side-facing', amount: 0.5, color: MUD, strength: 0.7 },
            dust: {
              where: 'up-facing',
              amount: site || hurt ? 0.5 : 0.3,
              color: DUST,
              strength: site || hurt ? 0.6 : 0.45,
            },
          },
        },
        pick: (n) => n === 'plinth',
      },
      {
        wear: {
          ...masonry,
          name: 'hall_render',
          seed: 74,
          resolution: [0.9, 2.0, 0],
          ground: 0,
          groundBand: 1.5,
          effects: {
            ...masonry.effects,
            moss: {
              where: 'ground-near & !down-facing',
              amount: 0.45,
              color: MOSS,
              strength: 0.75,
            },
            ...dust,
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
            chips: { where: 'convex-edges', amount: 0.16, strength: 0.6 },
            dust: { where: 'up-facing', amount: 0.45, color: DUST, strength: 0.55 },
          },
        },
        pick: (n) => /^(rubble|debris)$/.test(n),
      },
      {
        // Poles carry rings near their feet (site.ts pole()), so mud climbs them, not tints them whole.
        wear: {
          ...wearOf('cloth', 'hall_timber', 73),
          ground: 0,
          groundBand: 0.6,
          resolution: [0, 0, 0],
        },
        pick: (n) =>
          /^(gable_frame|rafters|gate|lamp|scaffold|scaffold_decks|scaffold_wreck|materials|wreck|banner_pole_[lr]|sheer_legs|hod)$/.test(
            n,
          ),
      },
    ]);
  },
});

/** Foundation ruin's vertical: a pallet stood on edge against the −Y tower footing, baulks
 *  leaning beside it. */
function leaningPallet(lod: Lod): Mesh {
  const x0 = TOWER.x + 2.0;
  const y = -TOWER.y;
  const parts: Mesh[] = [bar([x0 + 0.95, y, 0.07], [x0 + 0.05, y, 0.95], 1.1, 0.14, PLANK)];
  for (const dy of lod === 2 ? [0.9] : [0.8, 1.05, -0.85])
    parts.push(bar([x0 + 1.6, y + dy, 0.11], [x0 + 0.02, y + dy * 0.9, 0.82], 0.22, 0.22, WOOD));
  return merge(parts);
}

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
  // The ruin keeps a 4.1 m corner and the camera-side tower stub standing (its vertical).
  real: { length: 13.3, width: 18, height: 4.1 },
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
  // Standing corner and tower stub, the scaffold's fallen poles lying out round the walls.
  real: { length: 14.6, width: 19.03, height: 4.13 },
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
  // The survey banner still stands askew at the front (the ruin's vertical).
  real: { length: 15.47, width: 18, height: 3.46 },
});
