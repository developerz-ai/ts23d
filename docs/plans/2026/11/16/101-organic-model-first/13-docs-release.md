# 13 — Docs, skills, release 0.10.0

## Files
`CLAUDE.md` (rules: organic = model-first; LOD-gate exception wording), `README.md`, `llms.txt`, `.claude/skills/creature-artist/SKILL.md`, `.claude/skills/character-artist/SKILL.md`, `.claude/skills/author-recipe/SKILL.md`, `.claude/skills/technical-artist/SKILL.md`, `docs/playbooks/` (creature, humanoid), `docs/idea/10-sculpting.md`, `docs/plans/roadmap.md`, `docs/research/skills-matrix.md`, `CHANGELOG.md`, plan `status.yml`s.

## Depends on
Everything.

## Change
- One decision table an agent can follow: hard surface → code; organic → model tier (GPU or Meshy) + Blender steps; no GPU and no key → Blender-only body (`skinBody` / `metaballs` + `voxelRemesh` + `displace`) or the CPU creature, with honest expectations.
- The Blender step vocabulary with the artist trick behind each (from `docs/research/blender-organic-workflows.md`).
- Release through the repo's `/release` flow after the full gate.

## Checks
`bun run verify` (full) · `bun run changelog --check`.

## Done when
0.10.0 on npm and a GitHub Release; plan status complete.
