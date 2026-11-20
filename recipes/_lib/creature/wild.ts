// `defineWildCreature`: a creature-kind animal that has lived outdoors. It wraps `defineCreature`
// and holds every part the kind emits until the animal is finished, then: repaints the coat in
// world space (the recipe's `base` colour blocks, then wear: mud, damp, settled dust or snow,
// matted streaks, scars — wild-paint.ts), darkens toward the ground with `grime`, grows a second
// dense layer of short coat cards into the kind's `fur` part, pinches a nick into one ear and adds
// whiskers (wild-parts.ts). With `cardWear` the cards carry the wear too: each painted from the
// skin under its root and shortened where mud cakes, matting clumps or a scar parts the coat
// (wild-marks.ts). Wolf, fox and bear share it; each recipe passes its own story.

import {
  type Asset,
  type BuildContext,
  bindRigid,
  type CreatureDefinition,
  type CreatureInfo,
  cardWear,
  chainSeed,
  defineCreature,
  furChains,
  grime,
  hairFlow,
  type Mesh,
  type PartOptions,
  type Vec3,
} from '@developerz.ai/ts23d';
import { wearKeep } from './wild-marks.ts';
import { lockPaint, mix, wearPaint } from './wild-paint.ts';
import {
  coatCards,
  earNick,
  type GroomLayer,
  groom,
  joinSkinned,
  pitched,
  unpitched,
  whiskers,
  withinBox,
} from './wild-parts.ts';
import type { Wild } from './wild-spec.ts';

export type { BasePoint, Wild } from './wild-spec.ts';

interface Held {
  readonly name: string;
  readonly mesh: Mesh | null;
  readonly options: PartOptions;
}

interface Run {
  readonly real: BuildContext;
  readonly held: Held[];
  readonly bones: string[];
}

/** Cards weigh as a thin keratin sheet and never collide (the kind's own hair physics). */
const HAIR = { shell: 0.0002, density: 1300, collider: 'none' } as const;
const runs = new WeakMap<BuildContext, Run>();

/** Every vertex colour × `k`, clamped to linear 1 (`Wild.cardLift`); `k` 1 returns the mesh. */
export function lifted(mesh: Mesh, k: number): Mesh {
  if (k === 1) return mesh;
  return { ...mesh, colors: mesh.colors.map((c) => Math.min(1, c * k)) };
}

/** Card vertices under z = 0 pressed onto it (asset-frame meshes: the body's fur). */
function onGround(mesh: Mesh): Mesh {
  const positions = new Float32Array(mesh.positions);
  for (let i = 2; i < positions.length; i += 3) positions[i] = Math.max(0, positions[i] ?? 0);
  return { ...mesh, positions };
}

/** Every vertex colour through `f(world point, normal, colour)`; `at` = the part's world offset. */
export function recolour(mesh: Mesh, at: Vec3, f: (p: Vec3, n: Vec3, c: Vec3) => Vec3): Mesh {
  const colors = new Float32Array(mesh.colors.length);
  const P = mesh.positions;
  const N = mesh.normals;
  const C = mesh.colors;
  for (let i = 0; i < P.length; i += 3) {
    const c = f(
      [(P[i] ?? 0) + at[0], (P[i + 1] ?? 0) + at[1], (P[i + 2] ?? 0) + at[2]],
      [N[i] ?? 0, N[i + 1] ?? 0, N[i + 2] ?? 1],
      [C[i] ?? 1, C[i + 1] ?? 1, C[i + 2] ?? 1],
    );
    // Wear darkens and tints; the range stays linear 0..1 whatever the layers multiply to.
    for (let k = 0; k < 3; k++) colors[i + k] = Math.min(1, Math.max(0, c[k] ?? 0));
  }
  return { ...mesh, colors };
}

function finish(run: Run, info: CreatureInfo, prefix: string, wild: Wild): void {
  const ctx = run.real;
  const lod = ctx.lod;
  const spec = typeof wild.wear === 'function' ? wild.wear(info) : wild.wear;
  const wear = wearPaint(spec, lod === 2);
  const keepAt = wild.cardWear ? wearKeep(spec, wild.cardWear) : null;
  const keep = keepAt ? (p: Vec3): number => keepAt(p) : undefined;
  const base = wild.base?.(info);
  const lie = chainSeed(furChains(info.bones), { gravity: 0.35, blend: 0.1 });
  const lock = wild.locks && lod < 2 ? lockPaint((p) => lie(p, [0, 0, 1]), wild.locks) : null;
  // Coat colour, then the locks in it, then what the season left on top.
  const coatAt = (p: Vec3, n: Vec3, c: Vec3, part: string): Vec3 => {
    const coat = base ? base({ p, n, c, lod, part }) : c;
    return lock && part !== 'claws' ? lock(p, coat) : coat;
  };
  const paint = (p: Vec3, n: Vec3, c: Vec3, part: string): Vec3 => {
    const coat = coatAt(p, n, c, part);
    // Claws stay keratin under a film of dirt: caked whole they vanish into the paw.
    if (part === 'claws') return mix(coat, wear(p, n, coat), 0.3);
    return wear(p, n, coat);
  };
  const band = info.bones.height * (wild.ground?.band ?? 0.3);
  const groundStrength = wild.ground?.strength ?? 0.25;
  const offsets = new Map<string, Vec3>();
  const eyes = new Set([info.parts.eyeL, info.parts.eyeR]);
  const plan = wild.groom?.(info, lod);
  const frame = info.bones.head;
  // The far locks are seen in raster panels only, where a card shades like the skin.
  const lift = lod < 2 ? (wild.cardLift ?? 1) : 1;
  let coat: Mesh | null = null;
  let headFur: Mesh | null = null;
  // The groom's head layers join the kind's own head cards when it grew them (one part, one draw).
  const kindHeadFur = run.held.some((h) => h.name === `${prefix}head_fur`);
  for (const h of run.held) {
    const up = h.options.parent ? (offsets.get(h.options.parent) ?? [0, 0, 0]) : [0, 0, 0];
    const own = h.options.at ?? [0, 0, 0];
    const at: Vec3 = [up[0] + own[0], up[1] + own[1], up[2] + own[2]];
    offsets.set(h.name, at);
    let mesh = h.mesh;
    const part = h.name.slice(prefix.length);
    if (mesh && !eyes.has(h.name)) {
      if (h.name === info.parts.head && wild.nick && lod < 2)
        mesh = earNick(mesh, info.head, info.bones.head, wild.nick, wild.nickDepth);
      // With `cardWear` a card takes its coat colour and locks where each vertex lies (the
      // coat's own tone along it) and the wear from under its root; else every vertex all of it.
      const cards = keep && (part === 'fur' || part === 'head_fur');
      mesh = cards
        ? cardWear(
            recolour(mesh, at, (p, n, c) => coatAt(p, n, c, part)),
            { paint: wear, keep },
            at,
          )
        : recolour(mesh, at, (p, n, c) => paint(p, n, c, part));
      // Parts in the asset frame take the ground grade; the head and its children sit above it.
      if (at[0] === 0 && at[1] === 0 && at[2] === 0)
        mesh = grime(mesh, { ground: band, groundStrength });
      if (h.name === info.parts.body && wild.coat)
        coat = coatCards(mesh, info, lod, ctx.rng.fork('wild-coat'), wild.coat(info));
      if (h.name === info.parts.body && plan?.body) {
        const flow = hairFlow(mesh, chainSeed(furChains(info.bones), { gravity: 0.35 }));
        coat = groom(mesh, flow, plan.body, ctx.rng.fork('groom'), plan.box, (m) =>
          info.rig.pieces(m, 'body', at),
        );
      }
      if (h.name === info.parts.head && plan?.head) {
        // The head part is pitched about the atlas: layers and comb speak head-local.
        const comb = plan.comb ?? ((): Vec3 => [-1, 0, -0.15]);
        const local = plan.head.map(
          (z): GroomLayer => ({
            ...z,
            density: (p, n) => z.density(unpitched(frame, p), unpitched(frame, n)),
            length:
              typeof z.length === 'number'
                ? z.length
                : (
                    (f) =>
                    (p: Vec3, n: Vec3): number =>
                      f(unpitched(frame, p), unpitched(frame, n))
                  )(z.length),
          }),
        );
        const flow = hairFlow(mesh, (p) => pitched(frame, comb(unpitched(frame, p))));
        headFur = groom(mesh, flow, local, ctx.rng.fork('groom-head'), undefined, (m) =>
          info.rig.pieces(m, 'head', at),
        );
      }
      // Grown off the painted skin, the coat layer's and the groom's cards carry its colour
      // already (sampled under each root): `cardWear` only shortens them.
      if (keep && coat && h.name === info.parts.body) coat = cardWear(coat, { keep }, at);
      if (keep && headFur && h.name === info.parts.head) headFur = cardWear(headFur, { keep }, at);
      if (part === 'fur' && coat) {
        mesh = joinSkinned(mesh, coat);
        coat = null;
      }
      // A lock hanging off a pastern lies on the ground; it does not pass through it.
      if (part === 'fur') mesh = onGround(wild.box ? withinBox(mesh, wild.box) : mesh);
      // The head's own cards sit in its frame, on the midline: the width holds there too.
      if (part === 'head_fur' && wild.box?.y !== undefined)
        mesh = withinBox(mesh, { y: wild.box.y });
      // Painted already (grown off the painted head): joined after this part's own paint.
      if (part === 'head_fur' && headFur) {
        mesh = joinSkinned(mesh, headFur);
        headFur = null;
      }
    }
    // Roughness split: wet corneas under a clear coat; the coat's sheen on the furred skin.
    const skin =
      h.name === info.parts.body || h.name === info.parts.head || h.name === info.parts.jaw;
    const finish = eyes.has(h.name) ? 'cornea' : skin && wild.sheen ? 'coat' : undefined;
    if (mesh && (part === 'fur' || part === 'head_fur')) mesh = lifted(mesh, lift);
    ctx.part(h.name, mesh, finish && mesh ? { ...h.options, finish } : h.options);
    if (h.name === info.parts.head && headFur && !kindHeadFur)
      ctx.part(`${prefix}head_fur`, lifted(headFur, lift), {
        parent: info.parts.head,
        surface: 'cutout',
        ...HAIR,
      });
  }
  // `cards: false` on the spec, or the far LOD's locks: the layer is the animal's only fur part.
  if (coat)
    ctx.part(`${prefix}fur`, lifted(onGround(wild.box ? withinBox(coat, wild.box) : coat), lift), {
      surface: 'cutout',
      ...HAIR,
    });
  if (wild.whiskers) {
    const mesh = whiskers(info.head, info.bones.head, lod, ctx.rng.fork('whiskers'), wild.whiskers);
    const bone = run.bones.indexOf(`${prefix}head`);
    if (mesh)
      ctx.part(`${prefix}whiskers`, bindRigid(mesh, Math.max(0, bone)), {
        parent: info.parts.head,
        // A hair in its follicle: a point contact, as the kind's own cards rest on the skin.
        connect: { as: 'rest', to: info.parts.head },
        ...HAIR,
      });
  }
}

/** `defineCreature` plus the wild finish. The recipe's own `extra` still runs last. */
export function defineWildCreature(d: CreatureDefinition, wild: Wild): Asset {
  const prefix = d.options?.prefix ?? '';
  const base = defineCreature({
    ...d,
    finishes: {
      ...d.finishes,
      cornea: { clearcoat: 1, clearcoatRoughness: 0.04 },
      ...(wild.sheen ? { coat: { sheen: { colour: wild.sheen, roughness: 0.4 } } } : {}),
    },
    extra(ctx, info) {
      const run = runs.get(ctx);
      if (run) finish(run, info, prefix, wild);
      d.extra?.(run?.real ?? ctx, info);
    },
  });
  return {
    ...base,
    build(ctx) {
      const run: Run = { real: ctx, held: [], bones: [] };
      const held: BuildContext = {
        ...ctx,
        part: (name, mesh, options = {}) => void run.held.push({ name, mesh, options }),
        bone: (name, options) => {
          run.bones.push(name);
          return ctx.bone(name, options);
        },
      };
      runs.set(held, run);
      base.build(held);
    },
  };
}
