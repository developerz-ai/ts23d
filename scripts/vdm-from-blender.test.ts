import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from '../src/core/index.ts';
import { type FakeTool, fakeTool } from '../src/neural/fake-tool.ts';
import { creditOf, main, spdxOf, type VdmBrush } from './vdm-from-blender.ts';
import { decodeVdmBin } from './vdm-import.ts';

/** A 16² map: a dome in blue (normal), mid-grey elsewhere. */
function dome(): Uint8Array {
  const w = 16;
  const px = new Uint8Array(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 7.5, y - 7.5) / 6;
      px.set(
        [128, 128, Math.round(127.5 + 127 * (r < 1 ? (1 - r * r) ** 2 : 0)), 255],
        (y * w + x) * 4,
      );
    }
  return encodePng(w, w, px);
}

const brush = (license: string, author = 'a'): VdmBrush => ({
  brush: 'Dome',
  png: 'dome.png',
  amp: 0.3,
  license,
  author,
});

let dirs: string[] = [];
let fakes: FakeTool[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  for (const f of fakes) f.dispose();
  dirs = [];
  fakes = [];
});

/** A fake Blender that "extracts" one dome brush under `license`. */
function fakeBlender(license: string): FakeTool {
  const f = fakeTool(
    'blender',
    `d=$(dirname "$last")\ncp "$(dirname "$0")/dome.png" "$d/dome.png"\nprintf '%s' '{"brushes":[{"brush":"Dome","png":"dome.png","amp":0.3,"license":"${license}","author":"test"}]}' > "$d/vdm.json"\nprintf '{"ok":true}' > "$d/report.json"`,
  );
  writeFileSync(join(f.dir, 'dome.png'), dome());
  fakes.push(f);
  return f;
}

function library(): { lib: string; out: string } {
  const d = mkdtempSync(join(tmpdir(), 'vdmb-'));
  dirs.push(d);
  const lib = join(d, 'brushes.blend');
  writeFileSync(lib, 'BLENDER-v405');
  return { lib, out: join(d, 'out') };
}

describe('vdm-from-blender: refusals first', () => {
  it('no Blender → T3D_NEURAL_FAILED naming t3d setup tools; usage → 1', async () => {
    const { lib, out } = library();
    const e = await main([lib, out, '--blender', '/no/blender']).catch((x: unknown) => x);
    expect(String(e)).toContain('T3D_NEURAL_FAILED');
    expect((e as { fix?: string }).fix).toContain('t3d setup tools');
    expect(await main([lib])).toBe(1);
  });

  it('refuses unknown, author-less and non-commercial licences; --commit refuses unpublishable', () => {
    expect(creditOf(brush('free'), 'l.blend', false, false)).toHaveProperty('refused');
    expect(creditOf(brush('CC0', ''), 'l.blend', false, false)).toHaveProperty('refused');
    expect(creditOf(brush('CC-BY-NC-4.0'), 'l.blend', false, false)).toHaveProperty('refused');
    expect(creditOf(brush('CC-BY-NC-4.0'), 'l.blend', false, true)).toHaveProperty('credit');
    const nc = creditOf(brush('CC-BY-NC-4.0'), 'l.blend', true, true);
    expect('refused' in nc && nc.refused).toContain('may not be redistributed');
  });

  it('a refused brush writes nothing and exits 1', async () => {
    const { lib, out } = library();
    expect(await main([lib, out, '--blender', fakeBlender('CC-BY-NC-4.0').exe])).toBe(1);
  });
});

describe('vdm-from-blender: extract', () => {
  it('spdxOf normalises the unambiguous spellings only', () => {
    expect(['CC0', 'cc-0', 'CC0 1.0', 'Public Domain'].map(spdxOf)).toEqual(
      Array(4).fill('CC0-1.0'),
    );
    expect(spdxOf(' MIT ')).toBe('MIT');
  });

  it('brush PNG → .vdm.bin with the asset licence and source recorded', async () => {
    const { lib, out } = library();
    const f = fakeBlender('CC0');
    expect(await main([lib, out, '--blender', f.exe, '--commit', '--res', '17'])).toBe(0);
    const { stamp, meta } = decodeVdmBin(new Uint8Array(readFileSync(join(out, 'dome.vdm.bin'))));
    expect(stamp.size).toBe(17);
    expect(stamp.grid[(8 * 17 + 8) * 3 + 2] ?? 0).toBeGreaterThan(0.25);
    expect(meta.source).toEqual({
      license: 'CC0-1.0',
      author: 'test',
      url: 'blender-asset:brushes.blend#Dome',
    });
    expect(f.calls()[0]).toMatch(/--python-exit-code 3 --python \S+ts23d_job\.py -- \S+job\.json$/);
  });
});
