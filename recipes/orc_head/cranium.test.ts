import { describe, expect, it } from 'bun:test';
import { type Field, sculptField } from '@developerz.ai/ts23d';
import { bustEdits } from '../_lib/bust/bust.ts';
import { bodySurface, ORC_BUST } from './build.ts';
import { NUCHAL } from './cranium.ts';
import { SK, SPEC } from './spec.ts';

/** The base skull with its torso (stage 2: no cranium structure) and the finished head. */
const base = bodySurface(1).field;
const head = sculptField(bustEdits(ORC_BUST, 4, 1).edits, { color: SPEC.skin, mirror: 'y' }).field;

/** The surface's half-width (largest y inside) at (x, z). */
function halfWidth(f: Field, x: number, z: number): number {
  for (let y = 0.2; y > 0; y -= 0.0005) if (f([x, y, z]) < 0) return y;
  return 0;
}

/** The back of the head (smallest x inside) on the midline at height z. */
function backX(f: Field, z: number): number {
  for (let x = -0.25; x < 0; x += 0.0005) if (f([x, 0, z]) < 0) return x;
  return 0;
}

/** D545: a heavy skull has temporal planes. The vault at the temple (behind the brow's outer
 *  end, over the zygomatic arch) must be clearly narrower than the cheekbones. */
function temporalFindings(f: Field): string[] {
  const temple = halfWidth(f, 0.06, 0.53);
  const cheek = Math.abs(SK.zygion[1]);
  return temple / cheek > 0.72
    ? [`temple ${(temple / cheek).toFixed(2)} of the cheekbone width (want ≤ 0.72): a smooth dome`]
    : [];
}

/** D546: the skull must end before the neck begins. The nape's line under the occipital crest
 *  must sit in front of the straight line from the crest to the trapezius. */
function napeFindings(f: Field): string[] {
  const zNotch = NUCHAL[0]?.[2] ?? 0.432;
  const [z0, z1] = [zNotch + 0.04, zNotch - 0.045];
  const chord = backX(f, z0) + ((backX(f, z1) - backX(f, z0)) * (z0 - zNotch)) / (z0 - z1);
  const notch = backX(f, zNotch) - chord;
  return notch < 0.005
    ? [`nape ${(notch * 1000).toFixed(1)} mm inside the occiput-to-trapezius line (want ≥ 5)`]
    : [];
}

describe('orc cranium (D545)', () => {
  it('the base vault, a dome as wide at the temple as the cheekbones, is caught', () => {
    expect(temporalFindings(base).length).toBeGreaterThan(0);
  });
  it('the finished head has temporal planes: the temple is narrower than the cheekbones', () => {
    expect(temporalFindings(head)).toEqual([]);
  });
  it('the crown and the ears keep their size (the planes cut the vault sides only)', () => {
    expect(head([SK.crown[0], 0, SK.crown[2] - 0.004])).toBeLessThan(0);
    expect(head([SK.earTip[0], SK.earTip[1] - 0.004, SK.earTip[2] - 0.008])).toBeLessThan(0.002);
  });
});

describe('orc nape (D546)', () => {
  it('the base back line, straight from the occiput into the trapezius, is caught', () => {
    expect(napeFindings(base).length).toBeGreaterThan(0);
  });
  it('the finished head breaks under the occipital crest', () => {
    expect(napeFindings(head)).toEqual([]);
  });
});
