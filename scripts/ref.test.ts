import { describe, expect, it } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from '../src/core/index.ts';
import { checkRefFile } from '../src/qa/index.ts';
import { photoLinks, refCommand } from './ref.ts';

const README = `# Thing
| View | Photo |
|---|---|
| Category | [Category:X](https://commons.wikimedia.org/wiki/Category:X) |
| 3/4 front, standing | [A.jpg](https://commons.wikimedia.org/wiki/File:A_(b).jpg) (credit) |
| Side, standing | [B.png](https://commons.wikimedia.org/wiki/File:B.png) |
| Front / face | [C.jpg](https://commons.wikimedia.org/wiki/File:C.jpg) |
| Side, second | [D.jpg](https://commons.wikimedia.org/wiki/File:D.jpg) |
`;

/** A 60×40 PNG: a dark ellipse on a pale opaque background. */
function photo(): Uint8Array {
  const px = new Uint8Array(60 * 40 * 4);
  for (let i = 0; i < 2400; i++) {
    const [x, y] = [i % 60, Math.floor(i / 60)];
    const inside = ((x - 30) / 22) ** 2 + ((y - 22) / 11) ** 2 <= 1;
    px.set(inside ? [70, 60, 50, 255] : [225, 230, 240, 255], i * 4);
  }
  return encodePng(60, 40, px);
}

function fakeCommons(licences: Record<string, string>) {
  const calls: string[] = [];
  const get = async (url: string): Promise<Response> => {
    calls.push(url);
    if (url.startsWith('https://commons.wikimedia.org/w/api.php')) {
      const title = decodeURIComponent(/titles=([^&]+)/.exec(url)?.[1] ?? '');
      const name = title.replace('File:', '');
      return Response.json({
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  thumburl: `https://upload.wikimedia.org/thumb/${name}.png`,
                  extmetadata: {
                    LicenseShortName: { value: licences[name] ?? 'CC BY-SA 4.0' },
                    Artist: { value: '<a href="x">Ann</a>' },
                  },
                },
              ],
            },
          },
        },
      });
    }
    return new Response(photo().buffer as ArrayBuffer);
  };
  return { get, calls };
}

describe('photoLinks', () => {
  it('ignores rows without a File: link and keeps the first link per view', () => {
    expect(photoLinks(README).map((l) => [l.view, l.file])).toEqual([
      ['threeQuarter', 'File:A_(b).jpg'],
      ['side', 'File:B.png'],
      ['front', 'File:C.jpg'],
    ]);
    expect(photoLinks('# nothing here')).toEqual([]);
  });
});

describe('refCommand', () => {
  it('refuses a recipe without a dossier', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ref-'));
    await expect(refCommand('missing', { root })).rejects.toThrow(/no .*README\.md/);
  });

  it('writes derived numbers only, skips a non-free licence and fetches each photo once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ref-'));
    await Bun.write(join(root, 'thing', 'README.md'), README);
    const cache = join(root, 'cache');
    const { get, calls } = fakeCommons({ 'C.jpg': 'All rights reserved' });
    const lines = await refCommand('thing', { root, get, cache, width: 60 });
    expect(lines.some((l) => l.includes('skipped File:C.jpg'))).toBe(true);
    const ref = checkRefFile(await Bun.file(join(root, 'thing', 'ref.json')).json());
    expect(Object.keys(ref.views).sort()).toEqual(['side', 'threeQuarter']);
    const side = ref.views.side;
    expect(side?.source).toMatchObject({
      url: 'https://commons.wikimedia.org/wiki/File:B.png',
      licence: 'CC BY-SA 4.0',
      artist: 'Ann',
    });
    expect(side?.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(side?.camera).toBeNull();
    expect(side?.lab.slice(0, 16).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 3);
    const downloads = calls.filter((u) => u.startsWith('https://upload')).length;
    await refCommand('thing', { root, get, cache, width: 60 });
    expect(calls.filter((u) => u.startsWith('https://upload')).length).toBe(downloads);
  });

  it('refuses to write a ref.json with no views when every photo is skipped for its licence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ref-'));
    await Bun.write(join(root, 'thing', 'README.md'), README);
    const shut = 'All rights reserved';
    const { get } = fakeCommons({ 'A_(b).jpg': shut, 'B.png': shut, 'C.jpg': shut });
    const err = await refCommand('thing', {
      root,
      get,
      cache: join(root, 'cache'),
      width: 60,
    }).then(
      () => null,
      (e: unknown) => e as { code?: string; message?: string; fix?: string },
    );
    expect(err?.code).toBe('T3D_RECIPE_INVALID');
    expect(err?.message).toContain("File:B.png (licence 'All rights reserved')");
    expect(err?.fix).toContain('CC BY');
    expect(await Bun.file(join(root, 'thing', 'ref.json')).exists()).toBe(false);
  });
});
