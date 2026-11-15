// The blind agent panel for one recipe (the flagship floor's deciding score). `brief` renders the
// critique pack (`t3d critique`: hero, sheet, raking, lods, art-metric images, all deterministic)
// and writes a self-contained brief.md per asset: rules, image paths, the rubric, the QA summary
// and the review JSON shape. Three independent agents each write review-<k>.json; `attest` takes
// the median per criterion and writes critique.json as reviewer 'agent-panel', bound to the
// render hashes (stale the moment hero.png or sheet.png change). No network; the calibrated score
// is never shown to the reviewers.

import { readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { BOUND_RENDERS, CRITERIA, type Criterion, parseCritique } from '../src/qa/critique.ts';
import { RUBRIC } from '../src/qa/critique-rubric.ts';

export const PANEL_PACKS = '.ts23d/panel';
export const REVIEWERS = 3;
/** Pack images the reviewers read (calibrated.json and critique.template.json stay hidden). */
const IMAGES = /\.png$/;

export interface Review {
  readonly reviewer: string;
  readonly overall: number;
  readonly scores: Readonly<
    Record<Criterion, { score: number; reason: string; fixes: readonly string[] }>
  >;
}

const isScore = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10;

/** A parsed review-<k>.json, checked at the boundary; throws naming the first problem. */
export function checkReview(raw: unknown, where: string): Review {
  const r = raw as Partial<Review> | null;
  const bad = (what: string): never => {
    throw new Error(`golden: ${where}: ${what}`);
  };
  if (!r || typeof r.reviewer !== 'string' || !r.reviewer) bad('reviewer: missing');
  if (!isScore(r?.overall)) bad('overall: not a score 0–10');
  for (const c of CRITERIA) {
    const s = r?.scores?.[c];
    if (!s || !isScore(s.score)) bad(`scores.${c}.score: not a score 0–10`);
    if (typeof s?.reason !== 'string' || !s.reason.trim()) bad(`scores.${c}.reason: empty`);
    if (!Array.isArray(s?.fixes) || !s.fixes.every((f) => typeof f === 'string'))
      bad(`scores.${c}.fixes: not a string array`);
  }
  return raw as Review;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

/** critique.json from independent reviews: medians, every reason, the fixes de-duplicated. */
export function mergeReviews(
  asset: string,
  reviews: readonly Review[],
  renders: Readonly<Record<string, string>>,
  metrics?: unknown,
): Record<string, unknown> {
  if (reviews.length !== REVIEWERS)
    throw new Error(`golden: ${asset}: ${reviews.length} reviews, the panel needs ${REVIEWERS}`);
  const scores = Object.fromEntries(
    CRITERIA.map((c) => {
      const each = reviews.map((r) => r.scores[c]);
      return [
        c,
        {
          score: median(each.map((s) => s.score)),
          reason: reviews.map((r, k) => `${r.reviewer}: ${each[k]?.reason.trim()}`).join(' | '),
          fixes: [...new Set(each.flatMap((s) => s.fixes.map((f) => f.trim())))].filter(Boolean),
        },
      ];
    }),
  );
  const doc = {
    asset,
    reviewer: 'agent-panel',
    overall: median(reviews.map((r) => r.overall)),
    scores,
    renders,
    ...(metrics === undefined ? {} : { metrics }),
    panel: {
      reviews: reviews.map((r) => ({
        reviewer: r.reviewer,
        overall: r.overall,
        scores: Object.fromEntries(CRITERIA.map((c) => [c, r.scores[c].score])),
      })),
    },
  };
  const { errors } = parseCritique(doc);
  if (errors.length) throw new Error(`golden: ${asset}: merged critique invalid: ${errors[0]}`);
  return doc;
}

/** The reviewer's brief: everything needed, nothing that leaks the expected answer. */
export function briefMarkdown(asset: string, images: readonly string[], qa: string): string {
  const shape = Object.fromEntries(
    CRITERIA.map((c) => [c, { score: 0, reason: '…', fixes: ['…'] }]),
  );
  return `# Blind panel brief: ${asset}

You are ONE of ${REVIEWERS} independent senior game-art leads. Work alone: open only the images below
and this file. Do not open the repository, other reviews, calibrated scores or the network.

## Rules
- READ every image before scoring. Judge what you see against your knowledge of the real thing.
- Score 0–10, one decimal. 8 = ships in a commercial game AS-IS; 10 = indistinguishable from the
  best; 5 = obviously amateur; 2–3 = broken or crude. Be harsh and consistent.
- Anatomy and proportion errors (neck length, eye position in the orbits, skull shape, limb
  lengths) weigh heavily on proportions and overall.

## Images
${images.map((i) => `- ${i}`).join('\n')}

## Criteria
${CRITERIA.map((c, i) => `${i + 1}. **${c}** — ${RUBRIC[c]}`).join('\n')}

${qa}
## Output
Write \`review-<k>.json\` (k = the reviewer number you were given) beside this brief:
\`\`\`json
${JSON.stringify({ reviewer: 'panel-<k>', overall: 0, scores: shape }, null, 2)}
\`\`\`
Every criterion needs a reason; fixes name concrete recipe changes (empty only at 10).
`;
}

/** The QA section of the pack's rubric.md (triangles + findings), or a note when absent. */
const qaOf = (rubric: string): string => {
  const at = rubric.indexOf('## QA summary');
  const end = rubric.indexOf('## Output', at);
  return at < 0 ? '## QA summary\n- not available\n' : rubric.slice(at, end < 0 ? undefined : end);
};

/** Asset packs under one recipe's panel folder: `<root>/<asset>/critique/`. */
async function packs(root: string): Promise<string[]> {
  const names = await readdir(root).catch(() => [] as string[]);
  return names.sort().map((a) => join(root, a, 'critique'));
}

export async function brief(recipe: string): Promise<number> {
  const root = join(PANEL_PACKS, basename(dirname(resolve(recipe))));
  const run = Bun.spawnSync(['bun', 'run', 'src/cli/bin.ts', 'critique', recipe, '--out', root], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (run.exitCode !== 0) return run.exitCode ?? 1;
  for (const dir of await packs(root)) {
    const asset = basename(dirname(dir));
    const files = (await readdir(dir)).filter((f) => IMAGES.test(f)).sort();
    const rubric = await Bun.file(join(dir, 'rubric.md')).text();
    const md = briefMarkdown(
      asset,
      files.map((f) => resolve(dir, f)),
      qaOf(rubric),
    );
    await Bun.write(join(dir, 'brief.md'), md);
    console.log(`${asset}: ${resolve(dir, 'brief.md')}`);
    console.log(`  give it to ${REVIEWERS} independent agents (reviewer 1..${REVIEWERS}), then:`);
    console.log(`  bun run golden attest ${recipe}`);
  }
  return 0;
}

export async function attest(recipe: string): Promise<number> {
  const recipeDir = dirname(resolve(recipe));
  for (const dir of await packs(join(PANEL_PACKS, basename(recipeDir)))) {
    const asset = basename(dirname(dir));
    const template = (await Bun.file(join(dir, 'critique.template.json')).json()) as {
      renders: Record<string, string>;
      metrics?: unknown;
    };
    const out = join(recipeDir, 'out', asset);
    for (const f of BOUND_RENDERS) {
      const b = Bun.file(join(out, f));
      const now = (await b.exists())
        ? new Bun.CryptoHasher('sha256').update(new Uint8Array(await b.arrayBuffer())).digest('hex')
        : 'missing';
      if (now !== template.renders[f])
        throw new Error(
          `golden: ${asset}: committed ${f} differs from the one the panel judged; run bun run shots, then brief again`,
        );
    }
    const reviews: Review[] = [];
    for (let k = 1; k <= REVIEWERS; k++) {
      const f = join(dir, `review-${k}.json`);
      reviews.push(checkReview(await Bun.file(f).json(), f));
    }
    const doc = mergeReviews(asset, reviews, template.renders, template.metrics);
    await Bun.write(join(out, 'critique.json'), `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`${asset}: agent-panel ${doc['overall']} → ${join(out, 'critique.json')}`);
  }
  return 0;
}
