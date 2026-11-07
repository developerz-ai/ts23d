// Real screenshots of the gallery site for the README (docs/media/*.png): serves the built site
// with `vite preview`, drives headless Chrome over the DevTools protocol, waits until each page
// shows its live render (not a fixed sleep), and saves a PNG. Run `bun run site:build` first.
//
//   bun run site:shots [--base http://localhost:4173/ts23d/] [--out docs/media] [--only site,site-asset]
//                      [--height 3000]   (taller viewport, to review a whole page)
//                      [--assets tiger_1,dropship]   (ad-hoc asset-page shots, named asset-<name>)

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Cdp, chrome, type Json } from './site-shots-cdp.ts';

export interface Shot {
  readonly name: string;
  /** Path + hash under the site base, e.g. `#tiger_1`. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
  /** CSS selector that exists once the page is worth photographing. */
  readonly ready: string;
  /** Extra settle time after `ready`, for orbit and fades (ms). */
  readonly settle: number;
  /** Scroll the page to this element before the shot. */
  readonly scrollTo?: string;
  /** Click this element once ready, then wait for `after` (e.g. switch the viewer to Scene). */
  readonly click?: { readonly selector: string; readonly after: string };
}

export const SHOTS: readonly Shot[] = [
  {
    name: 'site',
    path: '',
    width: 1600,
    height: 1000,
    ready: '.showcase-stage.live',
    settle: 2500,
  },
  {
    name: 'site-gallery',
    path: '',
    width: 1600,
    height: 1000,
    ready: '.grid .card img[src]',
    settle: 1500,
    scrollTo: '#gallery',
  },
  {
    name: 'site-asset',
    path: '#tiger_1',
    width: 1600,
    height: 1000,
    ready: '[data-viewer-poster][hidden]',
    settle: 3000,
  },
  {
    name: 'site-scene',
    path: '#loco_440',
    width: 1600,
    height: 1000,
    ready: '[data-viewer-poster][hidden]',
    settle: 6000,
    click: {
      selector: 'input[name="mode"][value="scene"]',
      after: '[data-scenario]:not([hidden])',
    },
  },
  {
    name: 'site-mobile',
    path: '',
    width: 390,
    height: 844,
    ready: '.showcase-stage.live',
    settle: 2500,
  },
];

export interface Options {
  readonly base: string | null;
  readonly out: string;
  readonly only: readonly string[] | null;
  /** Override every shot's viewport height (px). */
  readonly height: number | null;
  /** Ad-hoc asset pages to shoot instead of the named shots (lighting reviews). */
  readonly assets: readonly string[] | null;
}

/** A studio-viewer shot of any asset page, for reviewing the presentation across categories. */
export const assetShot = (name: string): Shot => ({
  name: `asset-${name}`,
  path: `#${name}`,
  width: 1600,
  height: 1000,
  ready: '[data-viewer-poster][hidden]',
  settle: 3000,
});

export function parseArgs(argv: readonly string[]): Options {
  const value = (flag: string): string | null => {
    const at = argv.indexOf(flag);
    if (at < 0) return null;
    const v = argv[at + 1];
    if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  const only = value('--only');
  const known = new Set(SHOTS.map((s) => s.name));
  const picked = only ? only.split(',').map((s) => s.trim()) : null;
  for (const p of picked ?? [])
    if (!known.has(p)) throw new Error(`unknown shot '${p}' (known: ${[...known].join(', ')})`);
  const height = value('--height');
  if (height !== null && !(Number(height) > 0))
    throw new Error(`--height must be a positive number`);
  const assets = value('--assets');
  const named = assets ? assets.split(',').map((s) => s.trim()) : null;
  for (const a of named ?? [])
    if (!/^[a-z0-9_]+$/.test(a)) throw new Error(`--assets: '${a}' is not an asset name`);
  return {
    base: value('--base'),
    out: value('--out') ?? 'docs/media',
    only: picked,
    height: height === null ? null : Number(height),
    assets: named,
  };
}

/** The site URL for a shot: base always ends in `/`, the path is appended as is. */
export const urlOf = (base: string, shot: Shot): string =>
  `${base.endsWith('/') ? base : `${base}/`}${shot.path}`;

async function serve(): Promise<{ base: string; stop(): void }> {
  const port = 4179;
  const proc = Bun.spawn(['bunx', 'vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: 'apps/site',
    stdout: 'ignore',
    stderr: 'inherit',
  });
  const base = `http://localhost:${port}/ts23d/`;
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base).then(
        (r) => r.ok,
        () => false,
      )
    )
      return { base, stop: () => proc.kill() };
    await Bun.sleep(100);
  }
  proc.kill();
  throw new Error('vite preview did not come up (run `bun run site:build` first)');
}

async function take(cdp: Cdp, base: string, shot: Shot, out: string): Promise<string> {
  const { targetId } = (await cdp.send('Target.createTarget', { url: 'about:blank' })) as {
    targetId: string;
  };
  const { sessionId } = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })) as {
    sessionId: string;
  };
  const s = (m: string, p: Json = {}): Promise<Json> => cdp.send(m, p, sessionId);
  await s('Runtime.enable');
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', {
    width: shot.width,
    height: shot.height,
    deviceScaleFactor: 1,
    mobile: shot.width < 600,
  });
  await s('Page.navigate', { url: urlOf(base, shot) });
  const waitFor = async (selector: string): Promise<void> => {
    const expression = `!!document.querySelector(${JSON.stringify(selector)})`;
    const until = Date.now() + 90_000;
    while (true) {
      const r = (await s('Runtime.evaluate', { expression, returnByValue: true })) as {
        result: { value?: boolean };
      };
      if (r.result.value) return;
      if (Date.now() > until) throw new Error(`${shot.name}: '${selector}' never appeared`);
      await Bun.sleep(250);
    }
  };
  await waitFor(shot.ready);
  if (shot.click) {
    const sel = JSON.stringify(shot.click.selector);
    await s('Runtime.evaluate', { expression: `document.querySelector(${sel})?.click()` });
    await waitFor(shot.click.after);
  }
  if (shot.scrollTo) {
    const sel = JSON.stringify(shot.scrollTo);
    await s('Runtime.evaluate', {
      expression: `document.documentElement.style.scrollBehavior='auto';document.querySelector(${sel})?.scrollIntoView()`,
    });
  }
  await Bun.sleep(shot.settle);
  const { data } = (await s('Page.captureScreenshot', { format: 'png' })) as { data: string };
  const file = join(out, `${shot.name}.png`);
  await Bun.write(file, Buffer.from(data, 'base64'));
  await cdp.send('Target.closeTarget', { targetId });
  return file;
}

if (import.meta.main) {
  const opts = parseArgs(process.argv.slice(2));
  const server = opts.base ? null : await serve();
  const base = opts.base ?? server?.base ?? '';
  const { proc, ws } = await chrome();
  const logs: string[] = [];
  const cdp = await Cdp.open(ws, logs);
  await mkdir(opts.out, { recursive: true });
  let failed = 0;
  try {
    const picks = opts.assets
      ? opts.assets.map(assetShot)
      : SHOTS.filter((s) => !opts.only || opts.only.includes(s.name));
    for (const pick of picks) {
      const shot = opts.height ? { ...pick, height: opts.height } : pick;
      try {
        console.log(`✔ ${await take(cdp, base, shot, opts.out)}`);
      } catch (error) {
        failed++;
        console.error(`✘ ${shot.name}: ${error instanceof Error ? error.message : String(error)}`);
        for (const l of logs.splice(0)) console.error(`  ${l}`);
      }
    }
  } finally {
    cdp.close();
    proc.kill();
    server?.stop();
  }
  process.exitCode = failed ? 1 : 0;
}
