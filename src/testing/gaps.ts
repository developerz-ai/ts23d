// Assertions that "the stuff is there": no slits you can see light through, parts that really
// touch, panels that sit flush. For a recipe's own tests:
//   it('has no light leaks', () => assertNoGaps(container));
//   it('doors meet the header', () => assertTouches(container, 'door_*', 'frame'));
//   it('doors sit flush in the frame', () => assertFlush(container, 'door_l', 'frame', { view: '+X' }));

import type { Asset } from '../core/index.ts';
import {
  type FlushOptions,
  flushness,
  type GapOptions,
  gapFinding,
  inspect,
  scanGaps,
  worstPerPair,
} from '../qa/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';

const cm = (m: number): string => `${(m * 100).toFixed(1)} cm`;

/** No undeclared slit (the `gaps` gate). Default LOD0 only; pass `lods` for more. */
export function assertNoGaps(asset: Asset, o: LodOptions & GapOptions = {}): void {
  failOn(
    `${asset.name} gaps`,
    compileLods(asset, { lods: [0], ...o }).flatMap((a) =>
      worstPerPair(scanGaps(a, o).gaps).map((g) => ({ finding: gapFinding(g), lod: a.lod })),
    ),
  );
}

export interface TouchOptions extends LodOptions {
  /** Surfaces closer than this touch, metres. Default 2 mm (the build's `floating-parts` allows
   *  2 cm — enough to stay attached, not enough to look attached). */
  readonly eps?: number;
}

/** Parts matching `a` come within `eps` of parts matching `b` (names or globs), every LOD. */
export function assertTouches(asset: Asset, a: string, b: string, o: TouchOptions = {}): number {
  const eps = o.eps ?? 0.002;
  let worst = 0;
  failOn(
    `${asset.name} touches`,
    compileLods(asset, o).flatMap((c) => {
      const q = inspect(c);
      if (q.parts(a).length === 0 || q.parts(b).length === 0)
        return [
          {
            lod: c.lod,
            finding: {
              gate: 'touches',
              code: 'T3D_QA_TOUCHES',
              message: `no part matches '${q.parts(a).length ? b : a}'`,
              fix: 'check the part names (globs allowed: door_*)',
            },
          },
        ];
      const d = q.distance(a, b, 1);
      worst = Math.max(worst, d);
      return d <= eps
        ? []
        : [
            {
              lod: c.lod,
              finding: {
                gate: 'touches',
                code: 'T3D_QA_TOUCHES',
                part: a,
                message: `'${a}' is ${cm(d)} from '${b}', must be within ${cm(eps)}`,
                fix: `move or extend '${a}' onto '${b}' — a visible slot reads as a modelling error`,
              },
            },
          ];
    }),
  );
  return worst;
}

export interface FlushAssertOptions extends LodOptions, FlushOptions {
  /** Largest step allowed between the two faces, metres. Default 3 mm. */
  readonly tolerance?: number;
}

/** Where `a` meets `b` seen from one side, their faces are level (no panel standing proud). */
export function assertFlush(
  asset: Asset,
  a: string,
  b: string,
  o: FlushAssertOptions = {},
): number {
  const tol = o.tolerance ?? 0.003;
  let worst = 0;
  failOn(
    `${asset.name} flush`,
    compileLods(asset, { lods: [0], ...o }).flatMap((c) => {
      const f = flushness(c, a, b, o);
      worst = Math.max(worst, f.step);
      if (f.samples === 0)
        return [
          {
            lod: c.lod,
            finding: {
              gate: 'flush',
              code: 'T3D_QA_FLUSH',
              part: a,
              message: `'${a}' and '${b}' never meet${o.view ? ` seen from ${o.view}` : ''}`,
              fix: 'check the names and the side (view: "+X" …); flush needs a shared edge',
            },
          },
        ];
      return f.step <= tol
        ? []
        : [
            {
              lod: c.lod,
              finding: {
                gate: 'flush',
                code: 'T3D_QA_FLUSH',
                part: a,
                message: `'${a}' stands ${cm(Math.abs(f.proud))} ${f.proud >= 0 ? 'proud of' : 'behind'} '${b}' seen from ${f.view} (tolerance ${cm(tol)})`,
                fix: `move '${a}' along ${f.view.slice(1)} until its face is level with '${b}'`,
              },
            },
          ];
    }),
  );
  return worst;
}
