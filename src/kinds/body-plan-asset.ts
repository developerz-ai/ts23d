// `defineBodyPlan`: a body plan as a finished asset. One skinned `body` part (kind `creature`, so the
// gallery files it with the animals), `ctx.bone` for every plan bone, `budget.bones` from the plan,
// colours through one `skin` paint slot so variants can recolour it, then the recipe's `detail`,
// which gets a kit for seating and binding its pieces. `parts` splits named chains into their own
// skinned parts (a mantle a `measures` entry can read).
// `art.grounded` defaults to off: a countershaded body is dark on top, the reverse of that rule.

import {
  type Asset,
  type AssetDefinition,
  type Budget,
  type BuildContext,
  defineAsset,
  type Mesh,
  type PaintColor,
  srgbToLinear,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { bindRigid, skinPieces, skinWeights } from '../passes/index.ts';
import { bodyPlan } from './body-plan.ts';
import { type BodyPiece, bodyPlanPieces, chainSurface } from './body-plan-mesh.ts';
import { bodyPlanFlesh, bodyPlanSkin, chainBoneIndices } from './body-plan-skin.ts';
import type { BodyPlan, BodyPlanSpec, SurfacePoint } from './body-plan-types.ts';

export interface BodyPlanColours {
  readonly back: PaintColor;
  readonly belly: PaintColor;
  readonly tip?: PaintColor;
  /** Normal z of the back/belly boundary, -1..1 (-0.3). */
  readonly line?: number;
  /** Half-width of that boundary (0.25). */
  readonly soft?: number;
}

/** What a recipe's `detail` uses to put pieces on the body and make them follow its bones. */
export interface BodyPlanKit {
  /** Rest skin of a chain copy at arc fraction u and section angle, relief included. */
  surface(chain: string, u: number, angle: number): SurfacePoint;
  /** Each connected piece rigid, with the blended weights at its root (suckers, spikes). */
  bindPieces(mesh: Mesh, chains: readonly string[]): Mesh;
  /** Smooth weights over the named chains (a web between two arms). */
  bindSmooth(mesh: Mesh, chains: readonly string[], blend: number): Mesh;
  /** Every vertex on one bone (a skull, an eye, a jaw). */
  bindBone(mesh: Mesh, bone: string): Mesh;
}

export interface BodyPlanDefinition extends Omit<AssetDefinition, 'kind' | 'build' | 'budget'> {
  /** The body, as a spec or an already resolved `bodyPlan(spec)`. */
  readonly spec?: BodyPlanSpec;
  readonly plan?: BodyPlan;
  readonly budget?: Budget;
  readonly colours?: BodyPlanColours;
  readonly strip?: StripId;
  /** Part name → chain specs skinned into it instead of `body`. */
  readonly parts?: Readonly<Record<string, readonly string[]>>;
  /** Parts after the body: eyes, teeth, sockets. */
  readonly detail?: (ctx: BuildContext, plan: BodyPlan, kit: BodyPlanKit) => void;
}

const DEFAULT_COLOURS: BodyPlanColours = { back: '#59636b', belly: '#d9d8cf' };
const DEFAULT_TRIANGLES: readonly [number, number, number] = [80000, 24000, 4000];

const linear = (c: PaintColor): Vec3 => (typeof c === 'string' ? srgbToLinear(c) : c);

/** Per channel the brightest colour: painted vertices store colour ÷ slot, which must stay ≤ 1. */
const brightest = (cs: readonly Vec3[]): Vec3 => [
  Math.max(...cs.map((c) => c[0])),
  Math.max(...cs.map((c) => c[1])),
  Math.max(...cs.map((c) => c[2])),
];

function planOf(d: BodyPlanDefinition): BodyPlan {
  if (d.plan) return d.plan;
  if (d.spec) return bodyPlan(d.spec);
  throw new Ts23dError('T3D_RECIPE_INVALID', {
    cause: `body plan asset '${d.name}' has neither spec nor plan`,
    fix: 'pass spec: { name, length, chains }, or plan: bodyPlan(spec)',
  });
}

function kitOf(plan: BodyPlan, look: Parameters<typeof chainSurface>[2]): BodyPlanKit {
  const flesh = bodyPlanFlesh(plan);
  const blendOf = (ids: readonly string[]): number => {
    const c = plan.chains.find((x) => x.id === ids[0]);
    return ((c?.length ?? 1) / Math.max(1, c?.links.length ?? 1)) * 0.35;
  };
  const surfaces = new Map<string, ReturnType<typeof chainSurface>>();
  return {
    surface(chain, u, angle) {
      const f = surfaces.get(chain) ?? chainSurface(plan, chain, look);
      surfaces.set(chain, f);
      return f(u, angle);
    },
    bindPieces: (mesh, chains) =>
      skinPieces(mesh, flesh, { blend: blendOf(chains), only: chainBoneIndices(plan, chains) }),
    bindSmooth: (mesh, chains, blend) =>
      skinWeights(mesh, flesh, { blend, only: chainBoneIndices(plan, chains) }),
    bindBone(mesh, bone) {
      const i = plan.bones.findIndex((b) => b.name === bone);
      if (i < 0)
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `body plan '${plan.name}' has no bone '${bone}'`,
          fix: 'name a bone of the plan: <chain>_<link>',
        });
      return bindRigid(mesh, i);
    },
  };
}

/** Pieces per part: `parts` first, every other chain in `body`. */
function piecesByPart(d: BodyPlanDefinition, pieces: readonly BodyPiece[]) {
  const groups = Object.entries(d.parts ?? {});
  for (const [part, specs] of groups)
    for (const s of specs)
      if (!pieces.some((p) => p.chain.spec === s))
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `part '${part}' of '${d.name}' names chain '${s}', which has no skin`,
          fix: 'name a chain of the spec that is not `skin: false`',
        });
  const claimed = new Set(groups.flatMap(([, specs]) => specs));
  const body = pieces.filter((p) => !claimed.has(p.chain.spec));
  return [
    ...(body.length > 0 ? ([['body', body]] as const) : []),
    ...groups.map(
      ([part, specs]) => [part, pieces.filter((p) => specs.includes(p.chain.spec))] as const,
    ),
  ];
}

export function defineBodyPlan(d: BodyPlanDefinition): Asset {
  const { spec: _spec, plan: _plan, colours, strip, detail, parts: _p, ...rest } = d;
  const plan = planOf(d);
  const c = colours ?? DEFAULT_COLOURS;
  const back = linear(c.back);
  const belly = linear(c.belly);
  const tip = c.tip === undefined ? undefined : linear(c.tip);
  const look = {
    back,
    belly,
    ...(tip ? { tip } : {}),
    ...(c.line !== undefined ? { line: c.line } : {}),
    ...(c.soft !== undefined ? { soft: c.soft } : {}),
    ...(strip ? { strip } : {}),
  };
  return defineAsset({
    ...rest,
    kind: 'creature',
    budget: {
      triangles: d.budget?.triangles ?? DEFAULT_TRIANGLES,
      ...d.budget,
      bones: d.budget?.bones ?? plan.bones.length,
    },
    paint: { skin: brightest(tip ? [back, belly, tip] : [back, belly]), ...d.paint },
    art: { grounded: false, ...d.art },
    build(ctx) {
      const pieces = bodyPlanPieces(plan, ctx.lod, look);
      for (const [part, own] of piecesByPart(d, pieces))
        ctx.part(part, bodyPlanSkin(plan, own), { paint: 'skin' });
      for (const b of plan.bones) {
        const { name, ...bone } = b;
        ctx.bone(name, bone);
      }
      detail?.(ctx, plan, kitOf(plan, look));
    },
  });
}
