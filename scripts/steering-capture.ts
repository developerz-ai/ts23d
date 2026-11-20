// Guard for the fleet's steering-capture rule: a role prompt or rule doc that tells agents where
// docs land must also require a gotcha/learning/defect/convention found in a code change to be
// written to CLAUDE.md, AGENTS.md or a workspace CLAUDE.md in that SAME PR — not a later one.
// One check, one violation with a fix; the caller picks the prompt sources. This is the
// test-only reproducer for the rule, not a whole-tree gate check: scanning every prompt and rule
// file would flag 13 files, including the out-of-scope root CLAUDE.md/AGENTS.md, so wiring it into
// conventions.ts is a separate change with a narrowed PROMPT_PATH.

import type { Source } from './conventions.ts';
import type { Violation } from './lib/files.ts';

/** A fleet role prompt / command prompt, or any doc with docs-landing instructions. */
const PROMPT_PATH = /\/(?:agents|commands)\/[^/]+\.md$|(?:^|\/)CLAUDE\.md$/;
const DOCS_LANDING = /\b(?:README\.md|CHANGELOG\.md|llms\.txt|docs\/\*\*|docs\/|the docs)\b/i;

/** The rule's parts: all four must hold in ONE clause, so a stray mention cannot excuse it. */
const CAPTURE =
  /\b(?:gotchas?|learnings?|lessons?|pitfalls?|defects?|conventions?|gate findings?|gate failures?)\b/i;
const STEERING = /\b(?:CLAUDE|AGENTS)\.md\b/i;
const SAME_PR = /\bsame[-\s]+(?:PR|pull request)\b|\b(?:in|within)\s+that\s+(?:same\s+)?PR\b/i;
const ACTION = /\b(?:write|land|capture|record|add|put|carry)\b/i;

/** Split on sentence boundaries; protect the `.` in CLAUDE.md / AGENTS.md first. */
const FILE_ALIAS = /\b(CLAUDE|AGENTS)\.md\b/gi;
const ruleClause = (text: string): boolean =>
  text
    .replace(FILE_ALIAS, '$1MD')
    .split(/(?<=\.)[ \t]*\n|(?<=[.!?])\s+/)
    .some(
      (clause) =>
        CAPTURE.test(clause) &&
        STEERING.test(clause.replace(/\b(CLAUDE|AGENTS)MD\b/gi, '$1.md')) &&
        SAME_PR.test(clause) &&
        ACTION.test(clause),
    );

const FIX =
  'add the rule: "When a code change surfaces a gotcha/learning/defect/gate/convention, ' +
  'write the capture to CLAUDE.md, AGENTS.md or a workspace CLAUDE.md in that SAME PR — ' +
  'not a later one."';

/**
 * Flags a prompt whose docs-landing instructions omit same-PR steering capture.
 * Sources without docs instructions are not rule docs and are left alone.
 */
export function steeringCaptureRule(prompt: Source): Violation[] {
  if (!PROMPT_PATH.test(prompt.file) && !DOCS_LANDING.test(prompt.text)) return [];

  if (ruleClause(prompt.text)) return [];

  const lines = prompt.text.split('\n');
  const at = lines.findIndex((line) => DOCS_LANDING.test(line));
  return [
    {
      file: prompt.file,
      line: at === -1 ? 1 : at + 1,
      message:
        'docs-landing instructions omit same-PR steering capture: a code-change gotcha must land in a steering file in that PR',
      fix: FIX,
    },
  ];
}
