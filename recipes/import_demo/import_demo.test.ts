import { describe, expect, it } from 'bun:test';
import { compile, importGlb, jointFit, Ts23dError, triangleCount } from '@developerz.ai/ts23d';
import { import_demo } from './import_demo.ts';
import { scanGlb } from './scan.ts';
import { HEAD_TRIS, headLod, SCAN, scan } from './source.ts';

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : String(e);
  }
  return 'no error';
};

describe('import_demo', () => {
  it('refuses a changed file and a non-commercial licence', () => {
    const tampered = new Uint8Array(scanGlb());
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(code(() => importGlb({ ...SCAN, bytes: tampered }))).toBe('T3D_IMPORT_HASH');
    expect(code(() => importGlb({ ...SCAN, bytes: scanGlb(), license: 'CC-BY-NC-4.0' }))).toBe(
      'T3D_IMPORT_LICENSE',
    );
  });

  it('cleans the scan: defects fixed, specks dropped, neck cut left open', () => {
    const r = scan().report;
    expect(r).toMatchObject({
      flipped: 9,
      duplicate: 7,
      holesFilled: 1,
      holesOpen: 1,
      droppedShells: 5,
    });
    expect(r?.shells.length).toBe(1);
  });

  it('simplifies the head to each LOD budget within 5%', () => {
    for (const lod of [0, 1, 2] as const) {
      const n = triangleCount(headLod(lod));
      expect(n).toBeLessThanOrEqual(HEAD_TRIS[lod]);
      expect(n).toBeGreaterThanOrEqual(HEAD_TRIS[lod] * 0.95);
    }
  });

  it('seats the scan in the collar (joint fits)', () => {
    const c = compile(import_demo, { lod: 1 });
    expect((c.joints ?? []).flatMap((j) => jointFit(c, j).findings)).toEqual([]);
  });
});
