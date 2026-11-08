// The "Measured" section of rubric.md: each art metric with its value, bound, verdict and the
// rubric criterion it anchors — so the vision agent's scores start from numbers, not taste.

import { ART_THRESHOLDS, type ArtMetrics, artFindings } from './critique-metrics.ts';

const ok = (pass: boolean): string => (pass ? 'PASS' : '**MISS**');

export function metricsMarkdown(asset: string, m: ArtMetrics): string {
  const T = ART_THRESHOLDS;
  const worst = Math.min(...m.silhouette.map((s) => s.iou));
  const f = m.focal;
  const focalPass =
    f.declared.length === 0
      ? undefined
      : artFindings(asset, m).every((x) => x.code !== 'T3D_ART_FOCAL');
  const rows: string[][] = [
    [
      'Silhouette reads (LOD2 vs LOD0, 32 px)',
      m.silhouette.map((s) => `${s.view} ${s.iou}`).join(' · '),
      `IoU ≥ ${T.silhouetteIoU}`,
      ok(worst >= T.silhouetteIoU),
      'lod, silhouette',
    ],
    [
      'Focal point (top-5 % value contrast)',
      `peak on \`${f.peakPart}\`; top: ${f.top.map((t) => `${t.part} ${Math.round(t.share * 100)}%`).join(', ')}`,
      f.declared.length
        ? `on ${f.declared.join('/')} (or share ≥ ${T.focalShare})`
        : 'no `art.focal` declared',
      focalPass === undefined ? 'n/a' : ok(focalPass),
      'detail, materials',
    ],
    [
      'Rest areas (calm surface share)',
      `${m.rest.share} (spread ${m.rest.spread})`,
      `≥ ${m.rest.min}, spread ≥ ${T.restSpread}`,
      ok(m.rest.share >= m.rest.min && m.rest.spread >= T.restSpread),
      'detail',
    ],
    m.grounded
      ? [
          'Grounded (luminance rise base → top)',
          `${m.grounded.rise} (bands ${m.grounded.bands.map((b) => b ?? '–').join(' → ')})`,
          `≥ ${T.groundedRise}`,
          ok(m.grounded.rise >= T.groundedRise),
          'materials',
        ]
      : ['Grounded', 'not applicable to this kind', '—', 'n/a', 'materials'],
    [
      'Shape language',
      `${m.shape.shape} (acute ${m.shape.acuteShare}, straight ${m.shape.straightShare}, taper ${m.shape.taper})`,
      m.shape.declared ? `= ${m.shape.declared}` : 'no `art.shape` declared',
      m.shape.declared ? ok(m.shape.declared === m.shape.shape) : 'n/a',
      'silhouette',
    ],
  ];
  return `## Measured (not scored — anchor your scores to these)
Computed by the pack, deterministic; copied into \`critique.json\` as \`metrics\`. A criterion whose
metric reads **MISS** cannot score ≥ 8 unless its \`reason\` names the metric and why the eye
disagrees. Images: \`silhouette.png\` (dark = both LODs, red = lost at LOD2, blue = added),
\`value.png\` (greyscale; orange = hottest contrast; green = declared focal outline; red box = peak),
\`detail.png\` (teal = calm, orange → red = busy).

| Metric | Measured | Bound | Verdict | Anchors |
|---|---|---|---|---|
${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}
`;
}
