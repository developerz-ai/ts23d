---
description: Research a real thing (specs + photos) and build it as a ts23d recipe at real-asset quality
argument-hint: <thing, e.g. "Tiger I mid-production 1943" or "Chrysler Building"> [reference URLs]
---

Thing: $ARGUMENTS

The human names it; you research it; the library builds it; the gates prove it.

1. **Research first — no code yet.** WebSearch for spec tables (manufacturer data, museum pages,
   rosters, drawings) and real photos per view (side elevation, front, top, 3/4, details). Pick ONE
   variant and stay consistent. Write `refs/<snake_name>.md` from the template in `refs/README.md`:
   every number with a URL, every photo by view, signature features, engine parts, open questions.
2. **Recipe.** `recipes/<snake_name>.ts`: copy `sources` and `real` (overall box + 4–8 `measures`)
   from the dossier. Then follow `.claude/skills/author-recipe/SKILL.md`: masses → QA PASS → shoot →
   READ the PNG against the dossier photos → LOD-gated detail → grime → iterate.
3. Big things (a city block, a ship) split into sub-recipes composed with `ctx.use`; one
   `recipe-author` agent per sub-recipe (disjoint files), then a `visual-reviewer`.
4. `bun run verify`. Summary: variant, dossier path, tris per LOD (`bun run bench`), contact sheet.
