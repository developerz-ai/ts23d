# 03 — Calibrated critique and ratchet (qa tier 3, scripts)

Rule: an asset's score is predicted from measurements calibrated against real game assets; the agent's own score can't exceed it by more than 1.5, and scores only go up.

## Files
| Path | State | Why |
|---|---|---|
| `src/qa/critique-calibrate.ts` + `.test.ts` | new | metric vector → 0–10 per criterion (isotonic per metric, ridge combine) |
| `src/qa/critique-vector.ts` + `.test.ts` | new | metric vector: ref fingerprint gaps (02), curvature histogram, texel density, albedo range, value key, rest share, silhouette roughness |
| `src/qa/critique-golden.json` | new | committed metric vectors + panel scores of the golden set (no meshes) |
| `scripts/golden.ts` + `.test.ts` | new | fetch 30–50 CC0 game assets (Poly Haven, Quaternius, Kenney) into gitignored `.ts23d/golden/`, render through our pipeline, write degraded copies (decimated, flat-shaded, desaturated, blurred texture), compute vectors |
| `scripts/lib/critique.ts` | changed | `:14` mode → enforce for `FLAGSHIPS`; ratchet vs `critique-baseline.json` |
| `recipes/critique-baseline.json` | new | per-asset calibrated scores today |
| `src/cli/critique-cmd.ts` | changed | print predicted beside claimed |

## Depends on
01, 02 (fingerprints feed the vector).

## Change
- `calibratedScore(vector) → { overall, scores: Record<Criterion, number> }`.
- `FLAGSHIPS = ['wolf','amur_tiger','dragon','human_head','elf_head','goblin_head','orc_head']`, floor 8.5 (rises only).
- Gate: `T3D_CRITIQUE_INFLATED` if claimed − predicted > 1.5; `T3D_CRITIQUE_REGRESSED` if predicted < baseline − 0.5 without `why` in the recipe README; `T3D_CRITIQUE_BELOW_FLOOR` for flagships under the floor. Floor enforcement switches on in slice 17 when flagships reach it; until then it reports.
- Panel scores for the golden set: three independent agent reviews (rubric in `critique-rubric.ts`) + median; stored with the vector.

## Tests
Failure first: a degraded golden asset must score lower than its original (monotone); leave-one-out Spearman ≥ 0.7; inflated self-score fires.

## Checks
`bun test src/qa/critique-*.test.ts scripts/golden.test.ts` · `--only recipes` (shard 1 locally)

## Docs
`docs/idea/16-art-as-text.md` (calibration section), art-director skill note.

## Done when
`t3d critique recipes/human_head/human_head.ts` predicts ≤ 5 for today's bust; baseline committed.
