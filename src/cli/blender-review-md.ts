// review.md of `t3d blender review`: the legend an agent reads beside the PNG sheets. The sheets
// carry no drawn labels, so this names every tile in reading order (left to right, top to
// bottom), says what to look for in each view, and lists what every step of the program measured.

/** One sheet as the Blender report names it (`report.review[]`). */
export interface ReviewedSheet {
  readonly step: number;
  readonly view: string;
  readonly file: string;
  readonly size: readonly number[];
  readonly tiles: readonly string[];
}

const LOOK: Readonly<Record<string, string>> = {
  clay: 'form without colour: lumps, dents, fused limbs, lost thin parts (ears, fingers, wing tips)',
  wire: 'topology: even triangles, density where the silhouette turns, no shards or pinches',
  weights:
    'one tile per bone, blue (0) → green → red (1), grey = no weight: a bone must own its limb and nothing across a gap',
  poses:
    'rest pose first, then each pose alone: no stretched webbing, no part left behind, joints bend where the anatomy does',
  turnaround: 'the baked base colour under flat light: seams, smears, black or missing texels',
};

const brief = (v: unknown): string => {
  const text = JSON.stringify(v);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
};

export function reviewMarkdown(
  sheets: readonly ReviewedSheet[],
  steps: readonly Readonly<Record<string, unknown>>[],
): string {
  const lines = [
    '# Blender review',
    '',
    'READ every PNG. Tiles are unlabelled; their order is listed here.',
    '',
  ];
  for (const s of sheets) {
    lines.push(`## ${s.file} (${s.view}, after step ${s.step - 1}, ${s.size.join('×')} px)`);
    lines.push(`Look for: ${LOOK[s.view] ?? 'what changed since the last review'}.`);
    lines.push(...s.tiles.map((t, i) => `${i + 1}. ${t}`), '');
  }
  lines.push('## Steps', '', '| # | op | s | triangles | facts |', '|---|---|---|---|---|');
  steps.forEach((step, i) => {
    const { op, seconds, triangles, ...facts } = step;
    lines.push(
      `| ${i} | ${String(op)} | ${String(seconds)} | ${String(triangles)} | ${brief(facts).replaceAll('|', '\\|')} |`,
    );
  });
  lines.push(
    '',
    '## Adjust, then look again',
    "- form: `{ op: 'script', python, why }`, `inflate`, `smooth`, `displace` before `retopo`; `retopo.skin` for thin parts",
    "- rig: `{ op: 'joint', bone, head?, tail? }` before `bind`",
    "- skin: `{ op: 'weights', kind: 'assign' | 'smooth' | 'scale', bone, mask, value? }` after `bind`",
    '',
  );
  return lines.join('\n');
}
