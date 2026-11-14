// `t3d` help text: the command list, one block per command (`t3d <cmd> --help`), the flags, and
// the closest-name suggestion for a typo. The CLI requires Bun (`bunx t3d …`); the library runs
// under Node too.

import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';

const USAGE = 'usage: t3d <command> <recipe.ts…> [flags]   (requires Bun: bunx t3d …)';

/** Every command, with its help block (first line = the summary). */
export const COMMAND_HELP: Readonly<Record<string, string>> = {
  build: `build   GLB × 3 LODs + hero + contact sheet + manifest.json per asset; exit 1 on any QA
          finding (per LOD, across the LOD chain, and over budget.draws)`,
  shot: 'shot    contact sheet + manifest.json only (fast look)',
  hero: 'hero    beauty render only → <out>/<asset>/hero.png (3/4 product shot, textured, shadowed)',
  review:
    'review  AI review pack → <out>/<asset>/review/: hero, sheet, close-ups, LOD strip, review.md',
  critique: `critique  scored-review pack → <out>/<asset>/critique/: hero + sheet (= committed out/),
          raking light, LOD0|LOD2, refs.md, rubric.md, critique.template.json → commit
          out/<asset>/critique.json (checklist prompt for a vision agent) and review.json (image
          metrics + warnings)`,
  blueprint: `blueprint  measured drawing → <out>/<asset>/blueprint.png: side/front/top on a metre grid at one
          scale, L×W×H dimensions, every real.measures entry (green in tolerance, red out), joints
          (green fit, red not) and a 1.8 m figure for scale`,
  gaps: 'gaps    slit QA made visible → <out>/<asset>/gaps/{overlay.png, zoom_<i>.png, gaps.json}: undeclared slits red, declared blue',
  icon: `icon    UI art → <out>/<asset>/icon.png (256², unit icon) · portrait.png (512², close-up on art.focal
          or the top) · rts.png (64², 58° strategy camera); one fixed 3/4 high camera and studio
          light for every asset; warns when a 'team' paint slot covers < 8% of the RTS view`,
  tune: `tune    fit the asset's tune.params to its objectives (docs/idea/20-tuning.md) → tune.json,
          tune-report.md, tune-strip.png beside the recipe; --evals N (120) --seed s (1)
          --method cmaes|coordinate; same seed + evals = same tune.json`,
  finish: `finish  AI finish layer → <out>/<asset>/finish/: control maps (depth, normals, part ids, UVs,
          albedo, beauty per view), the model's images, the atlas textures, compare.png (before |
          after), <asset>_finish.glb (LOD0 on its own finish material, LOD1/2 on the trim sheet),
          finish.json (provenance + QA). --model mock|http --endpoint URL --prompt "…"
          --negative "…" --views 8 --atlas 1024 --timeout <s> (http, default 300) --seed s
          --force; results cached in .ts23d/finish/`,
  list: 'list    the assets each module exports',
};

export const COMMANDS: readonly string[] = Object.keys(COMMAND_HELP);

const FLAGS = `flags:
  --out <dir>     output root (default: out) → <dir>/<asset>/{lod0,lod1,lod2}.glb hero.png sheet.png manifest.json
  --animations    bake the 'run' clip (default) · --no-animations skips it
  --no-shot       build without rendering hero.png and the contact sheet
  --size WxH      beauty render size (default 1600x900) · --az <deg> camera azimuth from the
                  front, default -35 (front-left 3/4) · --el <deg> elevation, default 18 · --fov <deg> 30
  --sheet <mode>  external (default): one shared trim_sheet_{albedo,normal,orm}.png in <out>/,
                  referenced by every GLB · embed: self-contained GLBs · none: vertex colour only
  --sheet-size n  512 | 1024 | 2048 (default, ~3 s) | 4096 (final exports, ~18 s)
  --lods <list>   which detail levels to build: 0,1,2 (default) · 0 = hero only · 0,2 = near + far
  --lods <mode>   how they are written: both (default) = lod0/1/2.glb + <asset>.glb · split = lodN.glb
                  only · single = <asset>.glb only (LOD0 in the scene, LOD1/2 as MSFT_lod alternates
                  with screen-coverage switch hints; viewers without MSFT_lod show LOD0 only)
  --variant <name> render that livery (an asset's \`variants\`) → hero_<name>.png, sheet_<name>.png;
                  GLBs are unchanged (they carry every variant). Assets without it render as usual
  --profile <p>   engine defaults: unreal | unity | godot (split LODs, 4096 sheet; unreal/godot
                  name colliders UCX_ / -convcolonly with --physics) · rt (no baked AO texture) ·
                  web (one MSFT_lod file, 2048 sheet). Explicit --lods/--sheet-size win
  --physics       rigid body + fitted colliders + mass (KHR_physics_rigid_bodies / KHR_implicit_shapes, Khronos drafts)
  --no-sounds     skip <clip>.wav files and KHR_audio_emitter for assets with sounds (default: written beside the GLB)
  --json          one JSON envelope on stdout: { ok, data } or { ok: false, error: { code, message, fix } };
                  human text goes to stderr
  --help, -h      this text · t3d <command> --help: that command only · --version: the package version
exit: 0 ok · 1 QA findings or a coded error (T3D_*, with fix:) · 2 usage error (T3D_CLI_USAGE)`;

/** The whole help, or one command's block plus the flags. */
export function helpText(topic?: string): string {
  const one = topic === undefined ? undefined : COMMAND_HELP[topic];
  if (one !== undefined)
    return `usage: t3d ${topic} <recipe.ts…> [flags]   (requires Bun)\n  ${one}\n${FLAGS}`;
  const cmds = Object.values(COMMAND_HELP).map((h) => `  ${h}`);
  return [USAGE, ...cmds, FLAGS].join('\n');
}

/** Edit distance, for "did you mean". */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next.push(
        Math.min(
          (row[j] ?? 0) + 1,
          (next[j - 1] ?? 0) + 1,
          (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    row = next;
  }
  return row[b.length] ?? 0;
}

/** The candidate nearest to `word` (ties: first listed). */
export function closest(word: string, candidates: readonly string[]): string {
  let best = candidates[0] ?? '';
  for (const c of candidates) if (distance(word, c) < distance(word, best)) best = c;
  return best;
}

/** The package version (`t3d --version`): package.json two folders up from src/cli or dist/cli. */
export async function versionOf(): Promise<string> {
  const pkg: unknown = await Bun.file(join(import.meta.dir, '..', '..', 'package.json')).json();
  const v = (pkg as { version?: unknown }).version;
  if (typeof v !== 'string')
    throw new Ts23dError('T3D_CLI_USAGE', {
      cause: 'package.json next to the t3d binary has no version',
      fix: 'reinstall the package: bun add @developerz.ai/ts23d',
    });
  return v;
}
