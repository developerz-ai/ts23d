// review.md: the checklist prompt a vision-capable agent follows over the review pack. Mined from
// years of rejected assets (railroads procgen AGENT_BRIEF "review checklist"), plus the metrics
// and warnings this pack computed, so the reviewer starts from evidence, not from scratch.

import type { ReviewMetrics } from './review-warnings.ts';

const CHECKLIST = [
  '**Floating bits** — every bar, bracket, lamp, rod, handle touches what holds it. Look at the close-ups and the TOP view.',
  '**Clipping** — wheels through frames or fenders, rods through guides, brackets through roofs, branches through trunks.',
  '**Proportions vs reality** — compare overall length/width/height ratios and signature features with the reference dossier and its photos.',
  '**Open stacks and throats** — chimneys, funnels, exhausts, muzzles and pipes are OPEN (rim + dark inner throat), never capped.',
  '**Hidden detail** — detail buried inside another mass (a clock behind a roof, a hatch under a turret) is wasted triangles.',
  '**Silhouette at LOD2** — in lods.png, LOD2 keeps the outline and the big colour blocks; nothing pops, vanishes or shifts colour.',
  '**Texture stretching** — trim-sheet strips run along faces at a sensible scale: no smeared bricks, giant planks or streaked rivets.',
  '**Colour / value contrast** — materials separate (paint vs rubber vs metal vs glass); not one flat tone; no pure black or white.',
  '**Lettering and decals** — numbers and signs are legible in the close-ups and read the right way round.',
  '**Organic forms** — foliage, snow and terrain read as volume from the 3/4 hero, not as blotches, slabs or cards edge-on.',
  '**Grounding** — the asset stands on the floor (contact shadow under every wheel, foot or base), not sunk or hovering.',
];

export function reviewPrompt(m: ReviewMetrics, files: readonly string[], refs?: string): string {
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const views = m.views
    .map(
      (v) =>
        `| ${v.view} | ${pct(v.lod0.coverage)} | ${pct(v.lod0.bboxFill)} | ${v.lodIoU.toFixed(3)} | ${v.lodIoUExact.toFixed(3)} |`,
    )
    .join('\n');
  const warnings = m.warnings.length
    ? m.warnings.map((w) => `- **${w.code}**: ${w.message}\n  fix: ${w.fix}`).join('\n')
    : '- none — the metrics are proxies, so still run the checklist.';
  return `# Visual review: ${m.asset}

You are reviewing a game asset generated from code. READ every image in this folder before
answering: ${files.filter((f) => f.endsWith('.png')).join(', ')}.
${refs ? `Reference dossier (specs, measures, photo links): \`${refs}\` — read it first.\n` : 'No reference dossier was found (expected recipes/<name>/README.md): judge against well-known photos of the real thing.\n'}
- \`hero.png\` — 3/4 product shot, LOD0. · \`sheet.png\` — six orthographic views on a metre grid.
- \`detail_*.png\` — 3× close-ups where the triangles are. · \`lods.png\` — LOD0 · LOD1 · LOD2, same camera.

Triangles per LOD: ${m.triangles.join(' / ')}.

## Checklist — answer each with PASS or FAIL + where + the fix
${CHECKLIST.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Automatic metrics (review.json)
Hero: coverage ${pct(m.hero.coverage)}, span ${pct(m.hero.span)}, mean luminance ${m.hero.mean.toFixed(3)}, contrast ${m.hero.contrast.toFixed(3)}, near-black ${pct(m.hero.nearBlack)}, near-white ${pct(m.hero.nearWhite)}.

| view | LOD0 coverage | bbox fill | LOD0↔LOD2 IoU (far) | IoU (exact) |
|---|---|---|---|---|
${views}

## Warnings
${warnings}

## Output
A list of findings, worst first: \`[FAIL] <check> — <where, which view/image> — <fix in the recipe>\`,
then one line: \`VERDICT: SHIP\` or \`VERDICT: ITERATE\`.
`;
}
