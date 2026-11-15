import { describe, expect, it } from 'bun:test';
import { CRITERIA, parseCritique } from '../src/qa/critique.ts';
import { briefMarkdown, checkReview, mergeReviews, type Review } from './golden-brief.ts';

const review = (name: string, s: number, fix = 'longer neck'): Review => ({
  reviewer: name,
  overall: s,
  scores: Object.fromEntries(
    CRITERIA.map((c) => [c, { score: s, reason: `${c} reads ${s}`, fixes: [fix] }]),
  ) as unknown as Review['scores'],
});
const H = { 'hero.png': 'a'.repeat(64), 'sheet.png': 'b'.repeat(64) };

describe('checkReview', () => {
  it('refuses a review missing a criterion or a reason, or out of range', () => {
    const r = review('p1', 5);
    expect(() => checkReview({ ...r, overall: 11 }, 'r.json')).toThrow('overall');
    const noReason = { ...r, scores: { ...r.scores, wear: { score: 5, reason: ' ', fixes: [] } } };
    expect(() => checkReview(noReason, 'r.json')).toThrow('scores.wear.reason');
    const { lod: _lod, ...rest } = r.scores;
    expect(() => checkReview({ ...r, scores: rest }, 'r.json')).toThrow('scores.lod');
    expect(checkReview(r, 'r.json')).toEqual(r);
  });
});

describe('mergeReviews', () => {
  it('needs exactly three reviews', () => {
    expect(() => mergeReviews('wolf', [review('a', 5)], H)).toThrow('needs 3');
  });

  it('takes the median per criterion, keeps every reason and the 3 scores, binds the renders', () => {
    const doc = mergeReviews(
      'wolf',
      [review('a', 4), review('b', 9, 'fur cards'), review('c', 5)],
      H,
    );
    expect(doc['reviewer']).toBe('agent-panel');
    expect(doc['overall']).toBe(5);
    const { critique, errors } = parseCritique(doc);
    expect(errors).toEqual([]);
    expect(critique?.scores.proportions.score).toBe(5);
    expect(critique?.scores.proportions.reason).toContain('b: proportions reads 9');
    expect(critique?.scores.wear.fixes).toEqual(['longer neck', 'fur cards']);
    expect(critique?.renders).toEqual(H);
    const panel = doc['panel'] as { reviews: { overall: number }[] };
    expect(panel.reviews.map((r) => r.overall)).toEqual([4, 9, 5]);
  });

  it('refuses a merge that would not be a valid critique (no fixes below 10)', () => {
    const bare = [review('a', 5, ''), review('b', 5, ''), review('c', 5, '')];
    expect(() => mergeReviews('wolf', bare, H)).toThrow('merged critique invalid');
  });
});

describe('briefMarkdown', () => {
  it('lists every image, every criterion and the output shape; never a calibrated score', () => {
    const md = briefMarkdown('wolf', ['/p/hero.png', '/p/sheet.png'], '## QA summary\n- clean\n');
    expect(md).toContain('- /p/hero.png');
    for (const c of CRITERIA) expect(md).toContain(`**${c}**`);
    expect(md).toContain('review-<k>.json');
    expect(md).toContain('## QA summary');
    expect(md.toLowerCase()).not.toContain('calibrated 6');
    expect(briefMarkdown('wolf', ['/p/hero.png'], '')).toBe(
      briefMarkdown('wolf', ['/p/hero.png'], ''),
    );
  });
});
