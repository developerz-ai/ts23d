// Lamps, both sides: headlamp pockets (dark chrome reflector bowl, twin projector modules with
// glass lenses and chrome bezels, an LED daytime-running strip, an amber indicator) under a clear
// cover that follows the body surface; tail lamps (black pocket, red LED bars, reverse segment)
// under a ruby lens. Emissive parts are named for the asset's `glow` rules; light sockets carry
// KHR_lights_punctual spots/points for engines.

import type { BuildContext, Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge } from '@developerz.ai/ts23d';
import { cover, holeCentre, inward, pocket } from '../body/openings.ts';
import { HEADLAMP, type Hole, holeG, holeUc, TAILLAMP } from '../body/panels.ts';

const shrink = (h: Hole, k: number): Hole => ({ ...h, hs: h.hs * k, hu: h.hu * k });

import { C } from '../lib/colors.ts';
import { add, along, bothSides, mirrorY, mul, rod, sub, tube } from '../lib/geo.ts';
import { normalAt, type Surface } from '../lib/grid.ts';

const dim = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

/** One projector module: black can, chrome bezel, glass lens dome, aimed along +X. */
function projector(lod: Lod, r: number): Mesh {
  const segs = lod === 0 ? 14 : 8;
  return merge([
    lathe({
      profile: [
        [0, -0.08],
        [r * 0.9, -0.08],
        [r, -0.02],
        [r, 0],
      ],
      segments: segs,
      axis: 'x',
      color: C.black,
      strip: 'plastic',
      caps: false,
    }),
    lathe({
      profile: [
        [r * 1.05, -0.004],
        [r * 1.25, 0.0],
        [r * 1.2, 0.004],
        [r * 0.98, 0.004],
      ],
      segments: segs,
      axis: 'x',
      color: C.natural,
      strip: 'chrome',
      caps: false,
    }),
    lathe({
      profile: [
        [r * 0.98, 0.0],
        [r * 0.85, 0.012],
        [r * 0.45, 0.02],
        [0, 0.022],
      ],
      segments: segs,
      axis: 'x',
      color: C.lensClear,
      strip: 'glass',
      caps: false,
    }),
  ]);
}

export interface LampMeshes {
  readonly headBody: Mesh;
  readonly headDrl: Mesh;
  readonly headLens: Mesh;
  readonly tailBody: Mesh;
  readonly tailLed: Mesh;
  readonly tailLens: Mesh;
  readonly reverse: Mesh;
}

export function lamps(S: Surface, lod: Lod): LampMeshes {
  const h = HEADLAMP;
  const t = TAILLAMP;
  const headBody: Mesh[] = [];
  const drl: Mesh[] = [];
  const tailBody: Mesh[] = [];
  const tailLed: Mesh[] = [];
  const rev: Mesh[] = [];
  if (lod < 2) {
    headBody.push(pocket(S, h, 0.06, dim(C.natural, 0.55), 'chrome', lod === 0 ? 20 : 4));
    // Twin projectors along the pocket, aimed forward and a touch down.
    for (const f of [-0.45, 0.35]) {
      const s = h.sc + h.hs * f;
      const c = holeUc(h, s);
      const p = inward(S, s, c, 0.035);
      headBody.push(along(projector(lod, 0.03), p, [1, 0, -0.04]));
    }
    // LED strip along the top edge of the pocket (separate emissive part).
    const top: Vec3[] = [];
    const bot: Vec3[] = [];
    for (let i = 0; i <= 14; i++) {
      const s = h.sc - h.hs * 0.88 + (h.hs * 1.76 * i) / 14;
      const g = holeG(h, s);
      const c = holeUc(h, s);
      // The daytime strip: a thin light guide a third of the way down the pocket, well inside the
      // lens. (A halo round the lip, and a strip hard under it, both drew a white rim round the
      // lamp in the beauty render.)
      top.push(inward(S, s, c - h.hu * g * 0.5, 0.02));
      bot.push(inward(S, s, c + h.hu * g * 0.78, 0.014));
    }
    // One lit line; two dark posts carry it off the pocket floor (plugged into the pocket's top
    // wall, its glowing ends drew a bracket shape).
    const guide = top.slice(3, 12);
    drl.push(tube(guide, 0.005, C.lampGlow, 'plastic', lod === 0 ? 6 : 4, 1));
    for (const i of [4, 10]) {
      const s = h.sc - h.hs * 0.88 + (h.hs * 1.76 * i) / 14;
      const u = holeUc(h, s) - h.hu * holeG(h, s) * 0.5;
      headBody.push(
        rod(inward(S, s, u, 0.02), inward(S, s, u, 0.09), 0.004, C.black, 'plastic', 4),
      );
    }
    // Amber indicator segment along the bottom edge.
    headBody.push(tube(bot.slice(2, 12), 0.012, C.lensAmber, 'plastic', lod === 0 ? 6 : 4, 1));
    // Tail: black pocket, three LED bars, reverse light inboard.
    const POCKET_T = 0.05;
    const tc = holeCentre(S, t);
    const BAR = lod === 0 ? 12 : 6;
    tailBody.push(pocket(S, t, POCKET_T, C.black, 'plastic', lod === 0 ? 10 : 4));
    for (const f of [-0.45, 0, 0.45]) {
      const bar: Vec3[] = [];
      for (let i = 0; i <= BAR; i++) {
        const s = t.sc - t.hs * 0.85 + (t.hs * 1.7 * i) / BAR;
        const g = holeG(t, s);
        if (g < 0.2) continue;
        if (s < t.sc - t.hs * 0.55 && f > 0.2) continue;
        bar.push(inward(S, s, holeUc(t, s) + t.hu * g * f, 0.016));
      }
      if (bar.length > 1) {
        tailLed.push(tube(bar, 0.016, C.tailGlow, 'plastic', lod === 0 ? 6 : 4, 1));
        // Each bar stands on two posts off the housing floor (it used to float in the pocket).
        for (const q of [bar[1], bar[bar.length - 2]])
          if (q)
            tailLed.push(rod(q, sub(q, mul(tc.n, POCKET_T + 0.004)), 0.008, C.black, 'plastic', 4));
      }
    }
    const rs = t.sc - t.hs * 0.7;
    rev.push(
      along(
        lathe({
          profile: [
            [0, 0],
            [0.022, 0],
            [0.022, 0.006],
          ],
          segments: 16,
          axis: 'x',
          color: C.lampGlow,
          strip: 'plastic',
          caps: false,
        }),
        inward(S, rs, holeUc(t, rs) + t.hu * 0.45, 0.02),
        [-1, 0, 0],
      ),
    );
  } else {
    // LOD2: lens decals lifted off the skin (no pockets): a smoked lens with the lit strip across
    // its upper third, so the lamp reads as a lamp and not as a cream blob.
    headBody.push(cover(S, h, -0.002, dim(C.lensClear, 0.22), 'plastic', 4));
    drl.push(
      cover(S, { ...h, hu: h.hu * 0.22, uc: h.uc - h.hu * 0.4 }, -0.004, C.lampGlow, 'plastic', 2),
    );
    tailLed.push(cover(S, t, -0.002, C.tailGlow, 'plastic', 4));
  }
  const headLens =
    lod < 2
      ? cover(S, shrink(h, 0.86), 0.003, C.lensClear, 'glass', lod === 0 ? 18 : 4)
      : merge([]);
  // The tail lens IS the lit surface (emissive red), sitting over the LED bars.
  const tailLens =
    lod < 2 ? cover(S, t, 0.004, C.lensRed, 'plastic', lod === 0 ? 10 : 4) : merge([]);
  return {
    headBody: bothSides(merge(headBody)),
    headDrl: merge(drl),
    headLens: bothSides(headLens),
    tailBody: bothSides(merge(lod < 2 ? [...tailBody, ...tailLed] : tailBody)),
    tailLed: lod < 2 ? tailLens : merge(tailLed),
    tailLens: merge([]),
    reverse: bothSides(merge(rev)),
  };
}

/** Add lamp parts + light sockets. Emissive parts: headlamp_l/r_drl, taillight_l/r_led, reverse_lights. */
export function addLamps(ctx: BuildContext, S: Surface): void {
  const m = lamps(S, ctx.lod);
  ctx.part('headlamps', m.headBody);
  ctx.part('headlamp_l_drl', m.headDrl);
  ctx.part('headlamp_r_drl', mirrorY(m.headDrl));
  if (ctx.lod < 2) ctx.part('headlamp_lenses', m.headLens, { surface: 'glass' });
  ctx.part('tail_lamps', m.tailBody);
  ctx.part('taillight_l_led', m.tailLed);
  ctx.part('taillight_r_led', mirrorY(m.tailLed));
  const hc = holeCentre(S, HEADLAMP);
  const tc = holeCentre(S, TAILLAMP);
  for (const s of [1, -1] as const) {
    const side = s > 0 ? 'l' : 'r';
    ctx.socket(`headlamp_${side}`, {
      kind: 'light',
      at: [hc.p[0], s * hc.p[1], hc.p[2] - 0.01],
      dir: [1, 0, -0.06],
      data: { light: 'spot', color: '#fff4e0', intensity: 900, range: 80, cone: 22, inner: 12 },
    });
    ctx.socket(`taillight_${side}`, {
      kind: 'light',
      at: add([tc.p[0], s * tc.p[1], tc.p[2]], mul([tc.n[0], s * tc.n[1], tc.n[2]], 0.05)),
      dir: [-1, 0, 0],
      data: { light: 'point', color: '#ff2a1a', intensity: 4, range: 4 },
    });
  }
  void normalAt;
}
