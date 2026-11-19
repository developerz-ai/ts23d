// `defineWildCreature`: a creature-kind animal that has lived outdoors. It wraps `defineCreature`
// and holds every part the kind emits until the animal is finished, then: repaints the coat in
// world space (the recipe's `base` colour blocks, then wear: mud, damp, settled dust or snow,
// matted streaks, scars — wild-paint.ts), darkens toward the ground with `grime`, grows a second
// dense layer of short coat cards into the kind's `fur` part, pinches a nick into one ear and adds
// whiskers (wild-parts.ts). Wolf, fox and bear share it; each recipe passes its own story.

import {
  type Asset,
  type BuildContext,
  bindRigid,
  type CreatureDefinition,
  type CreatureInfo,
  chainSeed,
  defineCreature,
  furChains,
  grime,
  hairFlow,
  type Lod,
  type Mesh,
  type PartOptions,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type Locks, lockShade, lockTone, mix, type WearSpec, wearPaint } from './wild-paint.ts';
import {
  type CoatOptions,
  coatCards,
  earNick,
  type GroomLayer,
  groom,
  joinSkinned,
  pitched,
  unpitched,
  type WhiskerOptions,
  whiskers,
  withinBox,
} from './wild-parts.ts';

export interface BasePoint {
  /** World point and normal of the vertex, its colour so far. */
  readonly p: Vec3;
  readonly n: Vec3;
  readonly c: Vec3;
  readonly lod: Lod;
  /** Part name without the prefix: body, fur, head, head_fur, jaw, claws. */
  readonly part: string;
}

export interface Wild {
  /** Wear layers; a function when they are placed from the skeleton (leg heights, flank zones). */
  readonly wear: WearSpec | ((info: CreatureInfo) => WearSpec);
  /** Coat colour corrections before wear (e.g. LOD2 colour blocks the coarse mesh loses). */
  readonly base?: (info: CreatureInfo) => (q: BasePoint) => Vec3;
  /** A dense short card layer over the body (LOD0/1), merged into the kind's `fur` part. */
  readonly coat?: (info: CreatureInfo) => CoatOptions;
  /**
   * The whole coat placed by the recipe (set `cards: false` on the spec): body layers in world
   * space, head layers and the head's `comb` in head-local space (+X to the nose, origin at the
   * atlas). Called per LOD: the recipe thins or swaps layers for the far meshes.
   */
  readonly groom?: (
    info: CreatureInfo,
    lod: Lod,
  ) => {
    readonly body?: readonly GroomLayer[];
    readonly head?: readonly GroomLayer[];
    readonly comb?: (p: Vec3) => Vec3;
    /** No body card may pass |y| ≤ `y`, z ≤ `z` (metres): the sourced width and height hold. */
    readonly box?: { readonly y?: number; readonly z?: number };
  };
  /**
   * Clumped locks painted on the skin and the cards along the coat's lie (LOD0/1; the far mesh's
   * cells are wider than a lock). Without it the coat between the cards is a smooth shell.
   */
  readonly locks?: Locks;
  /**
   * No fur card (the kind's own or the `coat` layer) may pass |y| ≤ `y`, z ≤ `z` (metres, asset
   * frame): a stray lock does not grow the animal past its sourced width or height.
   */
  readonly box?: { readonly y?: number; readonly z?: number };
  readonly whiskers?: WhiskerOptions;
  /** Nick one ear: 1 = left, −1 = right. */
  readonly nick?: 1 | -1;
  /**
   * Sheen of the coat (KHR_materials_sheen on body, head and jaw): the soft rim a fur coat shows
   * against the light, in the guard hairs' tip colour, linear and faint (≈ 0.1: a strong sheen
   * hazes the whole coat and flattens the wear). Omitted = the plain strip's response.
   */
  readonly sheen?: Vec3;
  /** Ground darkening band as a share of the shoulder height (default 0.3) and its strength. */
  readonly ground?: { readonly band?: number; readonly strength?: number };
}

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
  const wear = wearPaint(typeof wild.wear === 'function' ? wild.wear(info) : wild.wear, lod === 2);
  const base = wild.base?.(info);
  const lie = chainSeed(furChains(info.bones), { gravity: 0.35, blend: 0.1 });
  const lock = wild.locks && lod < 2 ? lockTone((p) => lie(p, [0, 0, 1]), wild.locks) : null;
  const strength = wild.locks?.strength ?? 0;
  // Coat colour, then the locks in it, then what the season left on top.
  const paint = (p: Vec3, n: Vec3, c: Vec3, part: string): Vec3 => {
    const coat = base ? base({ p, n, c, lod, part }) : c;
    // Claws stay keratin under a film of dirt: caked whole they vanish into the paw.
    if (part === 'claws') return mix(coat, wear(p, n, coat), 0.3);
    return wear(p, n, lock ? lockShade(coat, lock(p), strength) : coat);
  };
  const band = info.bones.height * (wild.ground?.band ?? 0.3);
  const groundStrength = wild.ground?.strength ?? 0.25;
  const offsets = new Map<string, Vec3>();
  const eyes = new Set([info.parts.eyeL, info.parts.eyeR]);
  const plan = wild.groom?.(info, lod);
  const frame = info.bones.head;
  let coat: Mesh | null = null;
  let headFur: Mesh | null = null;
  for (const h of run.held) {
    const up = h.options.parent ? (offsets.get(h.options.parent) ?? [0, 0, 0]) : [0, 0, 0];
    const own = h.options.at ?? [0, 0, 0];
    const at: Vec3 = [up[0] + own[0], up[1] + own[1], up[2] + own[2]];
    offsets.set(h.name, at);
    let mesh = h.mesh;
    const part = h.name.slice(prefix.length);
    if (mesh && !eyes.has(h.name)) {
      if (h.name === info.parts.head && wild.nick && lod < 2)
        mesh = earNick(mesh, info.head, info.bones.head, wild.nick);
      mesh = recolour(mesh, at, (p, n, c) => paint(p, n, c, part));
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
      if (part === 'fur' && coat) {
        mesh = joinSkinned(mesh, coat);
        coat = null;
      }
      // A lock hanging off a pastern lies on the ground; it does not pass through it.
      if (part === 'fur') mesh = onGround(wild.box ? withinBox(mesh, wild.box) : mesh);
      // The head's own cards sit in its frame, on the midline: the width holds there too.
      if (part === 'head_fur' && wild.box?.y !== undefined)
        mesh = withinBox(mesh, { y: wild.box.y });
    }
    // Roughness split: wet corneas under a clear coat; the coat's sheen on the furred skin.
    const skin =
      h.name === info.parts.body || h.name === info.parts.head || h.name === info.parts.jaw;
    const finish = eyes.has(h.name) ? 'cornea' : skin && wild.sheen ? 'coat' : undefined;
    ctx.part(h.name, mesh, finish && mesh ? { ...h.options, finish } : h.options);
    if (h.name === info.parts.head && headFur)
      ctx.part(`${prefix}head_fur`, headFur, {
        parent: info.parts.head,
        surface: 'cutout',
        ...HAIR,
      });
  }
  // `cards: false` on the spec, or the far LOD's locks: the layer is the animal's only fur part.
  if (coat)
    ctx.part(`${prefix}fur`, onGround(wild.box ? withinBox(coat, wild.box) : coat), {
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
