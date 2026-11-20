// RELIEF's `emboss` in Blender's own Python (numpy ships with it; skipped where Blender is not
// installed): a height field becomes slopes per texel, so a constant height must leave the normal
// map flat, at the edge of a UV island too (D427: texels off the islands were read as height 0,
// so every island's rim got a false slope), and across a seam where two islands touch in UV but
// lie far apart on the body. A ramp still embosses as its slope.

import { describe, expect, it } from 'bun:test';
import { RELIEF } from './texture-paint.ts';

const blender = Bun.which('blender');

/** RELIEF from its first helper of `emboss` up to `plane`: the part under test. */
function embossSource(): string {
  const from = RELIEF.indexOf('def _on(');
  const start = from >= 0 ? from : RELIEF.indexOf('def emboss(');
  return RELIEF.slice(start, RELIEF.indexOf('def plane('));
}

/** A 16² map: island A (columns 2–6) and island B (7–9) touch in UV but lie 1 m apart on the body;
 *  island C (12–14) stands alone. Texels are 1 cm. */
const HARNESS = (height: string): string => `
import json, numpy as np
S = 16
OK = np.zeros((S, S), bool); OK[2:14, 2:10] = True; OK[2:14, 12:15] = True
J, I = np.meshgrid(np.arange(S), np.arange(S))
X = J * 0.01 + np.where(J >= 7, 1.0, 0.0); Y = I * 0.01; Z = np.zeros((S, S))
MU = np.full((S, S), 0.01); MV = np.full((S, S), 0.01)
SU = np.zeros((S, S)); SV = np.zeros((S, S))
exec(${JSON.stringify(embossSource())})
emboss(${height})
print('RESULT ' + json.dumps({'su': float(np.abs(SU).max()), 'sv': float(np.abs(SV).max()), 'mid': float(SU[6, 4])}))
`;

async function run(height: string): Promise<{ su: number; sv: number; mid: number }> {
  const p = Bun.spawn(
    [blender ?? 'blender', '-b', '--factory-startup', '--python-expr', HARNESS(height)],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const out = await new Response(p.stdout).text();
  await p.exited;
  const line = out.split('\n').find((l) => l.startsWith('RESULT '));
  if (!line) throw new Error(`no result from Blender:\n${out}`);
  return JSON.parse(line.slice(7));
}

describe.skipIf(blender === null)('RELIEF emboss (Blender)', () => {
  it('leaves a constant height flat, at island rims and across a seam', async () => {
    const r = await run('np.full((S, S), 0.002)');
    expect(r.su).toBeLessThan(1e-9);
    expect(r.sv).toBeLessThan(1e-9);
  }, 60_000);

  it('still embosses a ramp as its slope (+U: 0.5 m per m)', async () => {
    const r = await run('0.5 * X');
    expect(r.mid).toBeCloseTo(0.5, 6);
  }, 60_000);
});
