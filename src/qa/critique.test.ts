import { describe, expect, it } from 'bun:test';
import { CRITERIA, type Criterion, critiqueFindings, parseCritique } from './critique.ts';
import type { ArtMetrics } from './critique-metrics.ts';
import {
  critiqueTemplate,
  referenceLinks,
  refsMarkdown,
  rubricMarkdown,
} from './critique-rubric.ts';

const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const committed = { 'hero.png': H, 'sheet.png': H };

interface Doc {
  asset: string;
  reviewer: string;
  overall: number;
  scores: Record<Criterion, unknown>;
  renders: Record<string, string>;
}

function critique(score = 9, renders: Record<string, string> = committed): Doc {
  return {
    asset: 'crate',
    reviewer: 'agent',
    overall: score,
    scores: Object.fromEntries(
      CRITERIA.map((c) => [c, { score, reason: 'because', fixes: score < 10 ? ['more'] : [] }]),
    ) as Record<Criterion, unknown>,
    renders,
  };
}

describe('critiqueFindings', () => {
  it('fails a missing critique', () => {
    const f = critiqueFindings('crate', undefined, committed);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('no critique.json');
  });

  it('fails a stale critique: hero changed since it was judged, sheet never judged', () => {
    const f = critiqueFindings('crate', critique(9, { 'hero.png': H2 }), committed);
    expect(f.map((x) => x.message)).toEqual([
      'crate: critique is stale — hero.png changed since it was judged (bbbbbbbb → aaaaaaaa)',
      'crate: critique is stale — sheet.png was not judged',
    ]);
  });

  it('fails every criterion below the minimum, with its reason and fixes', () => {
    const f = critiqueFindings('crate', critique(6), committed);
    expect(f.map((x) => x.part)).toEqual([...CRITERIA]);
    expect(f[0]?.fix).toBe('more');
    expect(critiqueFindings('crate', critique(6), committed, 5)).toEqual([]);
  });

  it('fails a malformed critique with every problem named', () => {
    const bad = critique(7);
    bad.scores.wear = { score: 11, reason: '', fixes: [] };
    bad.reviewer = '';
    const f = critiqueFindings('crate', bad, committed).map((x) => x.message);
    expect(f).toContain("crate: critique.json reviewer: missing ('agent' or 'human')");
    expect(f).toContain('crate: critique.json scores.wear.score: not a number 0–10');
    expect(f).toContain('crate: critique.json scores.wear.reason: empty');
    expect(parseCritique([]).errors).toEqual(['not a JSON object']);
  });

  it('refuses a score below 10 without fixes, and a critique for another asset', () => {
    const c = critique(9);
    c.scores.lod = { score: 9, reason: 'ok', fixes: [] };
    expect(parseCritique(c).errors).toEqual([
      'scores.lod.fixes: empty below 10 — name what would raise it',
    ]);
    expect(critiqueFindings('barrel', critique(9), committed)[0]?.message).toContain("'crate'");
  });

  it('passes a fresh critique scored at or above the minimum', () => {
    expect(critiqueFindings('crate', critique(8), committed)).toEqual([]);
    expect(critiqueFindings('crate', critique(10), committed)).toEqual([]);
  });
});

describe('rubric', () => {
  it('extracts dossier links once, in order, and files photos apart from specs', () => {
    const md =
      '| a | https://en.wikipedia.org/wiki/X · https://commons.wikimedia.org/wiki/File:Y.jpg |\n' +
      'see (https://en.wikipedia.org/wiki/X). and <https://e.com/p.png>';
    const links = referenceLinks(md);
    expect(links).toEqual([
      'https://en.wikipedia.org/wiki/X',
      'https://commons.wikimedia.org/wiki/File:Y.jpg',
      'https://e.com/p.png',
    ]);
    const refs = refsMarkdown('x', links, 'recipes/x/README.md');
    expect(refs.indexOf('File:Y.jpg')).toBeLessThan(refs.indexOf('## Specs'));
    expect(refs.indexOf('wiki/X')).toBeGreaterThan(refs.indexOf('## Specs'));
  });

  it('names every criterion and image, warns on drift, and templates an unscored critique', () => {
    const md = rubricMarkdown({
      asset: 'crate',
      renders: { 'hero.png': H },
      refs: [],
      triangles: [12, 12, 12],
      qa: [],
      drift: ['hero.png'],
    });
    for (const c of CRITERIA) expect(md).toContain(`**${c}**`);
    expect(md).toContain('WARNING: hero.png');
    const t = JSON.parse(critiqueTemplate('crate', { 'hero.png': H }));
    expect(parseCritique(t).errors.length).toBeGreaterThan(0); // unscored: must be filled
    expect(t.renders['hero.png']).toBe(H);
  });
});

const metrics: ArtMetrics = {
  silhouette: [
    { view: 'front', iou: 0.7 },
    { view: 'side', iou: 0.95 },
    { view: '3/4', iou: 0.93 },
  ],
  focal: {
    peakPart: 'hull',
    peak: [10, 10],
    focalShare: 0.1,
    focalArea: 0.2,
    top: [{ part: 'hull', share: 0.6 }],
    declared: ['turret'],
  },
  rest: { share: 0.4, spread: 0.6, min: 0.25 },
  shape: { acuteShare: 0.1, straightShare: 0.7, taper: 0.2, shape: 'stable', declared: 'stable' },
};

describe('measured metrics in the critique', () => {
  it('rejects a metrics field that is not an object', () => {
    const doc = { ...critique(9), metrics: 'great' };
    expect(parseCritique(doc).errors).toContain(
      'metrics: not an object (copy it from critique.template.json, or drop it)',
    );
  });
  it('stays backward compatible: no metrics is still a valid critique', () => {
    expect(parseCritique(critique(9)).errors).toEqual([]);
    expect(parseCritique({ ...critique(9), metrics }).errors).toEqual([]);
  });
  it('rubric shows each metric with its verdict; the template carries the numbers', () => {
    const md = rubricMarkdown({
      asset: 'tank',
      renders: { 'hero.png': H },
      refs: [],
      triangles: [1, 1, 1],
      qa: [],
      metrics,
    });
    expect(md).toContain('## Measured (not scored');
    expect(md).toMatch(/Silhouette reads .*front 0\.7 .*\*\*MISS\*\*/);
    expect(md).toMatch(/Focal point .*on turret .*\*\*MISS\*\*/);
    expect(md).toMatch(/Rest areas .*\| PASS \|/);
    expect(md).toMatch(/Grounded \| not applicable/);
    const t = JSON.parse(critiqueTemplate('tank', { 'hero.png': H }, metrics));
    expect(t.metrics.silhouette[0].iou).toBe(0.7);
  });
});
