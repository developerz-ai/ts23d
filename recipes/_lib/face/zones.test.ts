import { describe, expect, it } from 'bun:test';
import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { H, SK } from '../bust/human/spec.ts';
import { type Zones, zoneEdits } from './zones.ts';

const Z: Zones = {
  lips: [0.6, 0.3, 0.27],
  flush: [0.74, 0.38, 0.31],
  socket: [0.52, 0.42, 0.42],
  shadow: [0.3, 0.28, 0.3],
  forehead: [0.7, 0.55, 0.4],
};

const same = (a: Vec3 | undefined, b: Vec3 | undefined): boolean =>
  !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

describe('skin tone zones', () => {
  it('fails on painted discs (D512): every broad tone zone fades over more than its own radius', () => {
    // A paint edit is full colour from blend/2 inside its shape to nothing blend/2 outside: a
    // socket or a cheek flush with a blend under its radius is a flat disc with a rim (the
    // elf's mauve goggles round the eyes, the round rouge on the cheek).
    const broad = [Z.socket, Z.flush, Z.forehead, Z.shadow];
    const soft = zoneEdits(SK, H, Z).filter(
      (e): e is SculptEdit & { size: Vec3; blend: number; color: Vec3 } =>
        'shape' in e && broad.some((c) => same(e.color, c)),
    );
    expect(soft.length).toBeGreaterThan(5);
    for (const e of soft) expect(e.blend).toBeGreaterThan(2 * Math.min(...e.size));
  });
});
