# Use ts23d to build a game: the agent's playbook

ts23d is the asset department of a game project. It ships assets only (GLB + textures +
`manifest.json`); the game code is yours, in your engine. This page is the loop a coding agent
follows when a person says "use ts23d and let's build a game".

## 1. Set up (one command)

```sh
bun add -d @developerz.ai/ts23d
bunx -p @developerz.ai/ts23d t3d init --engine godot --brief "a lone wolf hunts foxes in a winter forest"
```

`--engine` is `godot`, `unity`, `unreal`, `three` or `babylon`; left out, it is guessed from
`project.godot`, `*.uproject`, `ProjectSettings/` + `Assets/`, or a `three` / `@babylonjs/core`
dependency. `init` writes plain files and never overwrites one (a second run lists every file as
skipped; `package.json` and `.mcp.json` only gain missing keys):

| File | What it is |
|---|---|
| `assets/PLAN.md` | the asset plan (step 2) |
| `assets/style.ts` | the style bible: palette roles, bevels, wear (`defineStyle`) |
| `t3d.config.ts` | optional model adapters (`t3d neural`); none = CPU only |
| `.mcp.json` | a `ts23d` MCP server entry (`t3d mcp`), optional |
| `package.json` | `assets` (build once), `assets:watch` (rebuild on save), `assets:plan` (check the plan) |
| engine ignore files | Godot: `.ts23d/.gdignore`, `node_modules/.gdignore` so the editor does not import tool folders |

Unity keeps recipes in `ts23d/`, not `assets/`: on case-insensitive disks `assets/` is Unity's
`Assets/`, which imports every file.

## 2. Plan from the brief

Fill `assets/PLAN.md`: one row per asset under its set (characters, creatures, buildings, props,
vehicles, terrain, fx sockets).

```md
## creatures
| asset | kind | refs | tris | clips | hooks |
|---|---|---|---|---|---|
| wolf | creature | Canis lupus lupus, 0.80 m shoulder | 150k | idle, walk, trot, gallop, bite | head hitbox |
```

`asset` is the recipe name (`assets/wolf/wolf.ts`) and the output folder; `tris` is the LOD0 cap for
the plan's `Platform:`; `clips` are the animations the game code will play; `hooks` the sockets,
hitboxes and pivots it binds to. `bun run assets:plan` (`t3d plan check`) reports, each with a code
and a fix: a planned asset with no recipe, a recipe nobody planned, a build over its `tris`, a
planned clip the build does not have. Exit 0 means plan, recipes and builds agree.

## 3. Build, look, critique

Write each recipe with the recipe loop (`.claude/skills/author-recipe/SKILL.md` in the package):
real references, `real` + `sources` + `measures`, block-out, QA PASS, then look.

```sh
bun run assets:watch     # t3d build --watch assets --out <import folder> --profile <engine>
```

Watch builds every recipe, then rebuilds on save only the recipes whose import graph holds the
saved file: editing `assets/wolf/wolf.ts` rebuilds the wolf and every recipe that imports it (the
fox built on the wolf's numbers), editing `assets/_lib/rivets.ts` rebuilds its users. Each rebuild
is a normal `t3d build` (same bytes); a failing recipe prints its findings and the watch goes on.
Read `<out>/<asset>/sheet.png` and `hero.png` after each build; `t3d review` / `t3d critique` for the
deeper look.

## 4. Integrate: the manifest is the contract

Each `<out>/<asset>/manifest.json` lists what game code needs without opening the GLB: `files`
(GLB paths), `triangles` per LOD, `pivots` (moving parts by name), `sockets`, `emitters`, and for
skinned assets `skeleton`, `clips` (`name`, `seconds`, `loop`, `speed` = root ground speed in m/s)
and, with `--physics`, per-bone `hitboxes`. `<out>/index.json` lists every built asset. Move a
walking character at its clip's `speed` and the feet do not slide. `examples/game-starter/` in the
repository is a three.js page written from this contract alone (`bun serve.ts`).

## Engine notes

Every profile writes standard glTF 2.0; the profile only picks defaults. The layout table is
`engineLayout()` in `src/export/profile.ts`.

| Engine | Import folder (`--out`) | Profile | Colliders (`--physics`) | LODs | Docs |
|---|---|---|---|---|---|
| Godot 4 | `models/` | `godot` | `<pivot>-convcolonly` (convex), `<pivot>-colonly` (trimesh) → CollisionShape3D | instance `lod0.glb` (Godot generates mesh LODs) or lod0/1/2 under VisibilityRange | [import hints](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html) |
| Unity | `Assets/Models/ts23d/` | `unity` | KHR_physics_rigid_bodies; no Unity name convention | lod0/1/2.glb into a LOD Group | [glTFast](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@latest) |
| Unreal | `SourceArt/ts23d/` (import with Interchange) | `unreal` | `UCX_<pivot>_NN` convex hulls | lod0 as the mesh, lod1/2 into LOD slots | [collision naming](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine) |
| three.js | `public/models/` | `web` | helper nodes carry `extras.ts23d.collider`: hide them | GLTFLoader draws LOD0 of the MSFT_lod file | [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) |
| Babylon.js | `public/models/` | `web` | as three.js | the glTF loader reads MSFT_lod | [glTF loader](https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF) |

**Godot.** `res://models/<asset>/lod0.glb` is the scene to instance; every clip is in its
AnimationPlayer under the manifest's name. glTF has no loop flag, so set the loop from the
manifest in code:

```gdscript
var wolf = preload("res://models/wolf/lod0.glb").instantiate()
add_child(wolf)
var player: AnimationPlayer = wolf.find_child("AnimationPlayer")
player.get_animation("walk").loop_mode = Animation.LOOP_LINEAR  # manifest clips[].loop
player.play("walk")
```

The textures: GLBs reference one shared `models/trim_sheet_{albedo,normal,orm}.png` as
`../trim_sheet_*.png`. Keep the GLBs in `<out>/<asset>/` with `<out>` inside the project; a GLB
moved out of its folder (or `--out` outside the project) points at `res://../…`, which Godot cannot
open (defect D53). Need one self-contained file? Build with `--sheet embed`: Godot then extracts
the sheet once per GLB (nine PNGs per asset for three LODs), so the shared sheet is the default.

**three.js.**

```js
const m = await (await fetch('/models/wolf/manifest.json')).json();
const gltf = await new GLTFLoader().loadAsync(`/models/wolf/${m.files.single ?? m.files.lods[0]}`);
const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(gltf.animations.find((a) => a.name === 'walk')).play();
```

**Unity / Unreal / Babylon.** Import as in the table; clip names, sockets (empty nodes) and pivots
keep their manifest names in every engine.
