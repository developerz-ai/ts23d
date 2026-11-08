import { describe, expect, test } from 'bun:test';
import { assetShot, parseArgs, SHOTS, urlOf } from './site-shots.ts';

describe('site-shots args', () => {
  test('rejects an unknown shot name', () => {
    expect(() => parseArgs(['--only', 'site,nope'])).toThrow(/unknown shot 'nope'/);
  });

  test('rejects a flag with no value and a bad height', () => {
    expect(() => parseArgs(['--out'])).toThrow(/--out needs a value/);
    expect(() => parseArgs(['--height', '-3'])).toThrow(/positive/);
  });

  test('rejects an asset name that is not a recipe identifier', () => {
    expect(() => parseArgs(['--assets', 'tiger_1,../x'])).toThrow(/not an asset name/);
  });

  test('defaults: own server, docs/media, every shot', () => {
    expect(parseArgs([])).toEqual({
      base: null,
      out: 'docs/media',
      only: null,
      height: null,
      assets: null,
      measure: false,
    });
  });

  test('--measure shoots asset pages with the measure overlays on', () => {
    expect(parseArgs(['--assets', 'boxcar']).measure).toBe(false);
    const shot = assetShot('boxcar', parseArgs(['--assets', 'boxcar', '--measure']).measure);
    expect(shot.name).toBe('asset-boxcar-measure');
    expect(shot.script).toContain('data-measure');
  });

  test('ad-hoc asset shots point at the asset route', () => {
    expect(parseArgs(['--assets', 'tiger_1, dropship']).assets).toEqual(['tiger_1', 'dropship']);
    expect(urlOf('http://x/ts23d', assetShot('dropship'))).toBe('http://x/ts23d/#dropship');
  });

  test('picks shots and overrides', () => {
    const o = parseArgs([
      '--only',
      'site, site-asset',
      '--base',
      'http://x/ts23d',
      '--height',
      '3000',
    ]);
    expect(o).toEqual({
      base: 'http://x/ts23d',
      out: 'docs/media',
      only: ['site', 'site-asset'],
      height: 3000,
      assets: null,
      measure: false,
    });
  });

  test('--measure shoots asset pages with the measure overlays on', () => {
    expect(parseArgs(['--assets', 'boxcar']).measure).toBe(false);
    const shot = assetShot('boxcar', parseArgs(['--assets', 'boxcar', '--measure']).measure);
    expect(shot.name).toBe('asset-boxcar-measure');
    expect(shot.script).toContain('data-measure');
  });
});

describe('site-shots urls', () => {
  test('joins base and hash with exactly one slash', () => {
    const asset = SHOTS.find((s) => s.name === 'site-asset');
    if (!asset) throw new Error('site-asset shot missing');
    expect(urlOf('http://x/ts23d', asset)).toBe('http://x/ts23d/#tiger_1');
    expect(urlOf('http://x/ts23d/', asset)).toBe('http://x/ts23d/#tiger_1');
  });

  test('every shot waits on something and names a unique file', () => {
    expect(new Set(SHOTS.map((s) => s.name)).size).toBe(SHOTS.length);
    for (const s of SHOTS) expect(s.ready.length).toBeGreaterThan(0);
  });
});
