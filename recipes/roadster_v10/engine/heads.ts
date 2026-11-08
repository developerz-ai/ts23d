// Top end, per bank: aluminium cylinder heads with exhaust and intake port bosses, wrinkle-red
// valve covers (cast fins, perimeter bolts, raised "V10 8.4" lettering, oil filler on the left),
// coil-on-plug packs with connectors, a corrugated loom feeding them, and the fuel rails with
// injectors and the pressure regulator on the valley side.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge, text } from '@developerz.ai/ts23d';
import { C } from '../lib/colors.ts';
import { bx, rod, shift, tube } from '../lib/geo.ts';
import { BANKS, type Bank, bp, cylX, H_COVER, H_DECK, H_HEAD, inBank } from './frame.ts';

const HEAD_W = 0.105;

/** Head + cover extents along x for a bank. */
export const headSpan = (b: Bank): [number, number] => [cylX(b, 4) - 0.075, cylX(b, 0) + 0.075];

function head(lod: Lod, b: Bank): Mesh {
  const [x0, x1] = headSpan(b);
  const parts: Mesh[] = [
    inBank(
      b,
      bx(
        [x0, -HEAD_W, H_DECK],
        [x1, HEAD_W, H_DECK + H_HEAD],
        C.alloyCast,
        'aluminium',
        lod === 0 ? 0.006 : 0,
      ),
    ),
  ];
  if (lod === 0) {
    // Head gasket line (dark) and port bosses on both faces.
    parts.push(
      inBank(
        b,
        bx(
          [x0 + 0.002, -HEAD_W - 0.002, H_DECK - 0.003],
          [x1 - 0.002, HEAD_W + 0.002, H_DECK + 0.002],
          C.ironDark,
          'iron_cast',
        ),
      ),
    );
    for (let i = 0; i < 5; i++) {
      const x = cylX(b, i);
      parts.push(
        inBank(
          b,
          bx(
            [x - 0.032, HEAD_W - 0.002, H_DECK + 0.025],
            [x + 0.032, HEAD_W + 0.012, H_DECK + 0.085],
            C.alloyCast,
            'aluminium',
            0.004,
          ),
        ),
      );
      parts.push(
        inBank(
          b,
          bx(
            [x - 0.03, -HEAD_W - 0.012, H_DECK + 0.03],
            [x + 0.03, -HEAD_W + 0.002, H_DECK + 0.095],
            C.alloyCast,
            'aluminium',
            0.004,
          ),
        ),
      );
    }
  }
  return merge(parts);
}

function cover(lod: Lod, b: Bank): Mesh {
  const [x0, x1] = headSpan(b);
  const h0 = H_DECK + H_HEAD;
  const parts: Mesh[] = [
    inBank(
      b,
      bx(
        [x0 + 0.008, -0.094, h0],
        [x1 - 0.008, 0.094, h0 + 0.012],
        C.valveRed,
        'plastic',
        lod === 0 ? 0.003 : 0,
      ),
    ),
    inBank(
      b,
      bx(
        [x0 + 0.02, -0.082, h0 + 0.012],
        [x1 - 0.02, 0.082, h0 + H_COVER],
        C.valveRed,
        'plastic',
        lod === 0 ? 0.012 : 0,
      ),
    ),
  ];
  if (lod === 0) {
    // Cast fins across the cover between the coils; perimeter bolts.
    for (let i = 0; i < 4; i++) {
      const x = (cylX(b, i) + cylX(b, i + 1)) / 2;
      parts.push(
        inBank(
          b,
          bx(
            [x - 0.005, -0.075, h0 + H_COVER - 0.004],
            [x + 0.005, 0.02, h0 + H_COVER + 0.006],
            C.valveRed,
            'plastic',
            0.002,
          ),
        ),
      );
    }
    const bolt = lathe({
      profile: [
        [0, h0 + 0.022],
        [0.006, h0 + 0.022],
        [0.007, h0 + 0.012],
      ],
      segments: 6,
      faceted: true,
      axis: 'z',
      color: C.natural,
      strip: 'chrome',
      caps: false,
    });
    for (let k = 0; k <= 6; k++) {
      const x = x0 + 0.03 + ((x1 - x0 - 0.06) * k) / 6;
      for (const wy of [-0.088, 0.088]) parts.push(inBank(b, shift(bolt, [x, wy, 0])));
    }
  }
  return merge(parts);
}

/** "V10 8.4" raised on the cover top, readable from that side of the car. */
function lettering(b: Bank): Mesh {
  const [x0, x1] = headSpan(b);
  const xc = (x0 + x1) / 2;
  const o = bp(b, xc, H_DECK + H_HEAD + H_COVER + 0.0005, -0.035);
  const up: Vec3 = [0, -b.out[1], -b.out[2]];
  return text('V10  8.4', {
    origin: o,
    along: [-b.s, 0, 0],
    up,
    height: 0.034,
    color: [0.88, 0.88, 0.86],
    depth: 0.003,
    align: 'centre',
    font: 'block',
    strip: 'aluminium',
  });
}

function coils(lod: Lod, b: Bank): Mesh {
  const h0 = H_DECK + H_HEAD + H_COVER;
  const parts: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const x = cylX(b, i);
    parts.push(
      inBank(
        b,
        bx(
          [x - 0.026, 0.025, h0 - 0.004],
          [x + 0.026, 0.07, h0 + 0.028],
          C.black,
          'plastic',
          lod === 0 ? 0.004 : 0,
        ),
      ),
    );
    if (lod === 0) {
      // Connector and its clip.
      parts.push(
        inBank(
          b,
          bx(
            [x - 0.012, 0.07, h0 + 0.006],
            [x + 0.012, 0.086, h0 + 0.022],
            C.ironDark,
            'plastic',
            0.002,
          ),
        ),
      );
      parts.push(
        inBank(
          b,
          bx([x + 0.012, 0.03, h0 + 0.028], [x + 0.02, 0.065, h0 + 0.031], C.ironDark, 'plastic'),
        ),
      );
    }
  }
  if (lod < 2) {
    // Loom: corrugated tube along the outboard edge, a drop to each coil.
    const run: Vec3[] = [];
    const [x0, x1] = headSpan(b);
    for (let k = 0; k <= 8; k++) {
      const x = x1 - 0.01 - ((x1 - x0 + 0.08) * k) / 8;
      run.push(bp(b, x, h0 + 0.015, 0.1 + 0.004 * Math.sin(k * 1.7)));
    }
    parts.push(tube(run, 0.018, C.wireBlack, 'rubber', lod === 0 ? 8 : 5, 3));
    if (lod === 0)
      for (let i = 0; i < 5; i++) {
        const x = cylX(b, i);
        parts.push(
          tube(
            [bp(b, x, h0 + 0.015, 0.098), bp(b, x, h0 + 0.02, 0.09), bp(b, x, h0 + 0.014, 0.084)],
            0.008,
            C.wireBlack,
            'rubber',
            6,
            2,
          ),
        );
      }
  }
  return merge(parts);
}

/** Fuel rail along the valley side with five injectors; feed line and regulator at the front. */
function fuelRail(lod: Lod, b: Bank): Mesh {
  const [x0, x1] = headSpan(b);
  const h = H_DECK + 0.11;
  const ww = -HEAD_W - 0.03;
  const parts: Mesh[] = [
    rod(
      bp(b, x1 + 0.02, h, ww),
      bp(b, x0 + 0.01, h, ww),
      0.022,
      C.natural,
      'aluminium',
      lod === 0 ? 10 : 6,
    ),
  ];
  if (lod === 0) {
    for (let i = 0; i < 5; i++) {
      const x = cylX(b, i) + 0.02;
      parts.push(
        rod(bp(b, x, h, ww), bp(b, x, H_DECK + 0.07, ww + 0.015), 0.016, C.black, 'plastic', 8),
      );
      parts.push(
        rod(
          bp(b, x, H_DECK + 0.095, ww + 0.008),
          bp(b, x, H_DECK + 0.085, ww + 0.01),
          0.022,
          C.capBlue,
          'plastic',
          8,
        ),
      );
    }
    // Feed hose round the front.
    parts.push(
      tube(
        [bp(b, x1 + 0.02, h, ww), bp(b, x1 + 0.06, h - 0.02, ww - 0.02), [x1 + 0.1, 0, 0.6]],
        0.011,
        C.hoseBlack,
        'rubber',
        6,
        3,
      ),
    );
  }
  return merge(parts);
}

export function topEnd(lod: Lod): Mesh {
  const parts: Mesh[] = [];
  for (const b of BANKS) {
    parts.push(head(lod, b), cover(lod, b));
    if (lod < 2) parts.push(coils(lod, b));
    if (lod === 0) parts.push(lettering(b), fuelRail(lod, b));
  }
  if (lod === 0) {
    // Oil filler cap on the left cover's front, dipstick tube by the right head.
    const lb = BANKS[0];
    if (lb) {
      const p = bp(lb, cylX(lb, 0) + 0.02, H_DECK + H_HEAD + H_COVER, -0.05);
      parts.push(rod(p, [p[0], p[1] + 0.012, p[2] + 0.025], 0.05, C.black, 'plastic', 16));
      parts.push(
        rod(
          [p[0], p[1] + 0.012, p[2] + 0.025],
          [p[0], p[1] + 0.014, p[2] + 0.03],
          0.056,
          C.capYellow,
          'plastic',
          16,
        ),
      );
    }
    const rb = BANKS[1];
    if (rb) {
      const a = bp(rb, cylX(rb, 4) - 0.02, H_DECK - 0.05, 0.13);
      parts.push(
        tube(
          [a, [a[0], a[1] - 0.03, a[2] + 0.15], [a[0] + 0.02, a[1] - 0.04, a[2] + 0.24]],
          0.012,
          C.natural,
          'chrome',
          6,
          3,
        ),
      );
      parts.push(
        rod(
          [a[0] + 0.02, a[1] - 0.04, a[2] + 0.24],
          [a[0] + 0.02, a[1] - 0.04, a[2] + 0.255],
          0.03,
          C.capYellow,
          'plastic',
          10,
        ),
      );
    }
  }
  return merge(parts);
}
