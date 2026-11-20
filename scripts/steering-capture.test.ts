// Tests the steering-capture guard. Cause (census L1 = bot code merges that also wrote
// CLAUDE.md/AGENTS.md in 7d, regressed 12 → 7.7): bot merges #57 (D255–D277), #53 and #51 shipped
// code and expanded the defect catalogue but wrote no same-PR CLAUDE.md/AGENTS.md, so their
// learnings merged without steering capture. A docs-landing prompt without the rule reproduces
// that cause; the real docs-author prompt must carry it.

import { describe, expect, it } from 'bun:test';
import type { Source } from './conventions.ts';
import type { Violation } from './lib/files.ts';
import { steeringCaptureRule } from './steering-capture.ts';

const src = (file: string, text: string): Source => ({ file, text });

const WITHOUT_RULE = `---
name: docs-author
---

Docs follow code, never the reverse. Fix every doc that now lies:
\`README.md\`, \`docs/**\`, \`CHANGELOG.md\` (\`## [Unreleased]\`), \`llms.txt\`, \`CLAUDE.md\` if a rule changed.
`;

const WITH_RULE = `${WITHOUT_RULE}
When a code change surfaces a gotcha, learning, defect, gate finding or convention, write the
capture to \`CLAUDE.md\`, \`AGENTS.md\` or a workspace \`CLAUDE.md\` in that SAME PR, not a later one.
`;

describe('steeringCaptureRule', () => {
  it('fails a docs-author prompt lacking the same-PR steering clause, with an actionable fix', () => {
    const v: Violation[] = steeringCaptureRule(src('.claude/agents/docs-author.md', WITHOUT_RULE));
    expect(v).toHaveLength(1);
    expect(v[0]?.file).toBe('.claude/agents/docs-author.md');
    expect(v[0]?.message).toContain('same-PR steering capture');
    expect(v[0]?.fix).toContain('CLAUDE.md, AGENTS.md or a workspace CLAUDE.md');
    expect(v[0]?.fix).toContain('SAME PR');
  });

  it('passes a prompt that requires the steering write in the same PR', () => {
    expect(steeringCaptureRule(src('.claude/agents/docs-author.md', WITH_RULE))).toEqual([]);
  });

  it('fails when the steering file and SAME PR are only mentioned in separate sentences', () => {
    const decoy = `${WITHOUT_RULE}
Gotchas are captured in docs. Use \`CLAUDE.md\` for rules. Ship it in that SAME PR.
`;
    expect(steeringCaptureRule(src('.claude/agents/docs-author.md', decoy))).toHaveLength(1);
  });

  it('passes the real docs-author role prompt (fails if its rule is removed)', async () => {
    const text = await Bun.file('.claude/agents/docs-author.md').text();
    expect(steeringCaptureRule(src('.claude/agents/docs-author.md', text))).toEqual([]);
  });

  it('ignores a rule doc with no docs-landing instructions', () => {
    expect(steeringCaptureRule(src('docs/playbooks/prop.md', 'Build props in code.'))).toEqual([]);
  });
});
