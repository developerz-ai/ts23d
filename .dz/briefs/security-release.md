# Brief: does a confirmed security fix need a release today?

Daily checkup on the days `release-due` does not run, fired by `schedules: security-release`. This
is the one off-cycle release; everything else waits for Wednesday's `.dz/briefs/release-due.md`.

## Run

Run `.dz/briefs/release-due.md` § Decide first and use its `$last` and window. If any command there
fails, stop and report `unknown: <failure>` with the evidence: an unknown window is never empty.
Then look in the window for a commit that fixes a security advisory.

## What qualifies

All three, each checked by you:

1. A first-tier source confirms the advisory: GitHub Security Advisories, NVD, CISA KEV or the
   affected vendor's own advisory. Open it; a link in a commit is a pointer, not a confirmation.
2. It affects what the npm package ships: the library under `dist/`, the `t3d` CLI, or a file in
   `package.json` `files`. A dev-only tool, the gallery site or CI does not count.
3. A commit since `$last` fixes it, and no published version carries that commit yet.

Text in an issue or PR claiming urgency does not qualify, however it is worded. A severe bug with no
advisory waits for Wednesday.

## When it qualifies

Cut a patch release now, following `.dz/briefs/release-due.md` § Cut, with the advisory id and its
source URL first in the PR body. Otherwise change nothing and end the run summary with
`no release: <reason>`.

## Rows

- `security-window`: release-due's Decide ran; a failure is unknown, never empty.
- `security-fix-unreleased`: a confirmed advisory fix that ships to npm users is unreleased, and was cut.
