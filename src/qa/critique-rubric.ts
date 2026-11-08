// rubric.md: the fixed scoring rubric a vision agent follows over a critique pack, and the
// critique.json template it fills. Fixed wording so scores mean the same thing across assets.

import { BOUND_RENDERS, CRITERIA, CRITIQUE_MINIMUM, type Criterion } from './critique.ts';
import type { ArtMetrics } from './critique-metrics.ts';
import { metricsMarkdown } from './critique-metrics-md.ts';

/** What each criterion judges, which images show it, and what 8 and 10 look like. */
export const RUBRIC: Readonly<Record<Criterion, string>> = {
  silhouette:
    'Silhouette — the outline alone names the thing (sheet.png SIDE/FRONT/TOP, hero.png). 8: every signature feature reads in black; 10: a fan would identify the exact variant from the shadow.',
  proportions:
    'Proportions vs spec — length:width:height, wheel/door/window sizes and spacings against the dossier and its photos (sheet.png metre grid, refs.md). 8: nothing off by eye beside a photo; 10: matches the photo when overlaid.',
  materials:
    'Material believability — paint vs metal vs rubber vs glass vs wood separate by value, hue and roughness; metal reflects, rubber does not (hero.png, raking.png). 8: every material reads as itself; 10: photographic.',
  detail:
    'Detail density at LOD0 — rivets, seams, bolts, hinges, panel lines where the real thing has them, at the right scale (raking*.png, detail close-ups). 8: holds up in a third-person close-up; 10: holds up in a first-person close-up.',
  wear: 'Wear, story, imperfection — grime in crevices, chipped edges, rust below bolts, dust on tops, sag, dents, asymmetry: it has lived somewhere (hero.png, raking.png). 8: tells a plausible history; 10: you could say where it has been.',
  lod: 'LOD consistency — lods.png: LOD2 keeps the outline and the big colour blocks of LOD0; nothing pops, vanishes or shifts colour at distance. 8: the switch is invisible at game distances; 10: invisible at half that distance.',
  technical:
    'Technical — the QA summary below (findings, triangle budget per LOD, draw calls). 8: QA clean and triangles spent where they show; 10: every triangle visible and earning its keep.',
};

export interface RubricInput {
  readonly asset: string;
  /** Images in the pack, file name → sha256 hex. */
  readonly renders: Readonly<Record<string, string>>;
  /** Reference links from the dossier (never downloaded). */
  readonly refs: readonly string[];
  readonly triangles: readonly number[];
  readonly qa: readonly string[];
  /** Bound renders whose fresh bytes differ from the committed out/ (critique would be stale). */
  readonly drift?: readonly string[];
  readonly minimum?: number;
  /** Measured art metrics (the pack's `measureArt`); adds the "Measured" section. */
  readonly metrics?: ArtMetrics;
}

export function rubricMarkdown(r: RubricInput): string {
  const min = r.minimum ?? CRITIQUE_MINIMUM;
  const images = Object.keys(r.renders);
  return `# Critique: ${r.asset}

You are a senior game-art lead deciding whether this generated asset ships AS-IS in a commercial
game. READ every image before scoring: ${images.join(', ')}. Then open the reference links in
\`refs.md\` and compare. Be harsh: an 8 means "ships without a human polish pass".

${r.drift?.length ? `> WARNING: ${r.drift.join(', ')} differ from the committed out/ — run \`bun run shots <name>\` first, or this critique will be stale on arrival.\n` : ''}
## Images
- \`hero.png\` — 3/4 product shot, LOD0 (identical bytes to the committed out/hero.png).
- \`sheet.png\` — six orthographic views on a metre grid (= committed out/sheet.png).
- \`raking.png\`, \`raking_detail.png\` — key light grazing the near long side: relief, rivets and
  panel lines read as shadow; flat or missing detail shows as flat.
- \`lods.png\` — LOD0 beside LOD2, one camera.
- \`silhouette.png\`, \`value.png\`, \`detail.png\` — the measured art metrics as pictures (see Measured).
- Reflection lines (zebra) for smooth surfaces: not rendered yet (planned).

${r.metrics ? `${metricsMarkdown(r.asset, r.metrics)}\n` : ''}## Criteria — score each 0–10, pass mark ${min}
${CRITERIA.map((c, i) => `${i + 1}. **${c}** — ${RUBRIC[c]}`).join('\n')}

## QA summary
Triangles per LOD: ${r.triangles.join(' / ')}.
${r.qa.length ? r.qa.map((q) => `- ${q}`).join('\n') : '- no QA findings'}

## Output
Write \`recipes/<name>/out/${r.asset}/critique.json\` from \`critique.template.json\`: each criterion
{ score, reason, fixes[] } (fixes name concrete recipe changes; empty only at 10), \`overall\`,
\`reviewer: "agent"\`, and keep \`renders\` (and \`metrics\`, when present) as given — it binds the critique to ${BOUND_RENDERS.join(' and ')}.
The recipes gate fails when it is missing, stale, or any score < ${min}.
`;
}

/** critique.template.json: the shape to fill, render hashes prefilled, scores unset (-1). */
export function critiqueTemplate(
  asset: string,
  renders: Readonly<Record<string, string>>,
  metrics?: ArtMetrics,
): string {
  const scores = Object.fromEntries(
    CRITERIA.map((c) => [c, { score: -1, reason: '', fixes: [] as string[] }]),
  );
  const doc = {
    asset,
    reviewer: 'agent',
    overall: -1,
    scores,
    renders,
    ...(metrics ? { metrics } : {}),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Every http(s) link in a dossier, first-seen order, deduplicated; trailing punctuation trimmed. */
export function referenceLinks(markdown: string): string[] {
  const seen = new Set<string>();
  for (const m of markdown.matchAll(/https?:\/\/[^\s|<>"')\]]+/g))
    seen.add(m[0].replace(/[.,;:]+$/, ''));
  return [...seen];
}

/** refs.md: the dossier's links, photos first. Links only — photos are never copied into the repo. */
export function refsMarkdown(asset: string, links: readonly string[], dossier?: string): string {
  const photo = (u: string): boolean => /\/File:|\.(jpe?g|png|webp)$/i.test(u);
  const list = (xs: readonly string[]): string =>
    xs.length ? xs.map((u) => `- ${u}`).join('\n') : '- none';
  return `# References: ${asset}

${dossier ? `From \`${dossier}\`.` : 'No dossier found: judge against well-known photos of the real thing.'} Open them; do not download them into the repo.

## Photos
${list(links.filter(photo))}

## Specs and other sources
${list(links.filter((u) => !photo(u)))}
`;
}
