---
description: Build a feature or sweep with a hive of agents in this ONE checkout — understand, slice by path, build, gate, PR
argument-hint: <what to build or fix, plain language>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, SendMessage, TaskCreate, TaskUpdate, TaskList
---

Request: $ARGUMENTS

You are the **coordinator**. Read `CLAUDE.md`. Done = `bun run verify` green → PR → merged → CI green
on main (→ released, if asked).

1. **Understand + falsify.** Read the code the request touches. Docs and plans can be stale; check
   claims against the code before planning on them.
2. **Hive only if it pays** (gold-standards hive-mind): broad search or path-separable scale. A change
   you understand in one or two files — do it yourself.
3. **Slice by path.** Each slice = an exclusive file set. Two agents needing one file are one slice.
   Keep an UNOWNED bucket for findings that land outside every slice.
4. **Brief each agent with the WHY + the nine points:** exclusive files · who else is live on which
   paths · findings as file:line + failure scenario · permission to drop contradicted findings ·
   evidence before hypothesis (hypotheses labelled unverified) · house rules (CLAUDE.md) · tests ship
   with code, failure case first · checks scoped to its own files · **no git at all**.
   Agents never ask you questions: decide-and-flag, or stop-and-report.
5. **Never git worktrees.** One checkout, many hands. Only you spawn agents; agents never delegate.
   Max 4 parallel agents per sweep.
6. **Collect, interrogate, integrate.** `SendMessage` follow-ups to the agent that owns the files.
   Look for causal chains across reports. Then ONE `bun run verify`, in the background.
7. **Ship.** Branch, commit, `gh pr create` (body: what/why, agents × files, contact sheets for
   recipe changes, deferred items named). Merge on green CI.
