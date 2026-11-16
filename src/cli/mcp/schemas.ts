// The MCP tool list (`tools/list`): names, one-line purpose and JSON Schema inputs. Handlers live
// in tools.ts; each tool is one `t3d` command (CLI equivalent in its description), so the docs in
// `t3d --help` and docs/idea/05-agent-loop.md stay the reference.

export interface ToolDef {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
    readonly additionalProperties: false;
  };
  readonly annotations: { readonly readOnlyHint: boolean; readonly openWorldHint: false };
}

const recipe = {
  type: 'string',
  description: 'recipe module, relative to the project root, e.g. recipes/wolf/wolf.ts',
};
const out = {
  type: 'string',
  description: 'output root inside the project (default: the server --out, usually out/)',
};

function tool(
  name: string,
  title: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: readonly string[] = ['recipe'],
  readOnly = false,
): ToolDef {
  return {
    name,
    title,
    description,
    inputSchema: {
      type: 'object',
      properties: required.includes('recipe') ? { recipe, out, ...properties } : properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    },
    annotations: { readOnlyHint: readOnly, openWorldHint: false },
  };
}

export const TOOLS: readonly ToolDef[] = [
  tool(
    'build',
    'Build + QA',
    'Compile a recipe to GLB × 3 LODs, run every QA gate, write hero.png, sheet.png and manifest.json per asset. Returns the QA verdict, findings (each with code + fix), triangles and draw calls per LOD and file paths. Fix every finding, then call shot. CLI: t3d build <recipe> --out <dir>',
    {
      sheetSize: {
        type: 'integer',
        enum: [512, 1024, 2048, 4096],
        description: 'trim-sheet size (default 2048; 512 is fastest while iterating)',
      },
      lods: { type: 'string', description: 'LODs to build, e.g. "0,1,2" (default) or "0"' },
    },
  ),
  tool(
    'shot',
    'Contact sheet',
    'Six orthographic views on a metre grid (3/4 front, front, side, top, 3/4 rear, far LOD2) returned as an image you can see, plus manifest paths. Read it: name the single worst error, fix it, rebuild. CLI: t3d shot <recipe>',
  ),
  tool(
    'hero',
    'Beauty render',
    'Textured, shadowed 3/4 product render returned as an image. CLI: t3d hero <recipe> [--az --el --size --variant --quality]',
    {
      az: { type: 'number', description: 'camera azimuth from the front, degrees (default -35)' },
      el: { type: 'number', description: 'camera elevation, degrees (default 18)' },
      size: { type: 'string', description: 'render size WxH (default 1600x900)' },
      variant: { type: 'string', description: "a paint variant from the asset's `variants`" },
      quality: {
        type: 'string',
        enum: ['raster', 'path'],
        description: 'raster (default, seconds) or path traced (slower, physically based)',
      },
    },
  ),
  tool(
    'blueprint',
    'Measured blueprint',
    'Side/front/top on one metre grid with L×W×H, every real.measures entry (green in tolerance, red out), joints and a 1.8 m figure, returned as an image. CLI: t3d blueprint <recipe>',
  ),
  tool(
    'review',
    'AI review pack',
    'Hero, contact sheet, close-ups and LOD strip (images, downscaled; extra images listed by path) plus review.md, the checklist to follow. CLI: t3d review <recipe>',
  ),
  tool(
    'critique',
    'Scored critique pack',
    'Writes the calibrated critique pack (raking light, LOD0|LOD2, refs.md, rubric.md, critique.template.json, calibrated metrics) and returns paths + warnings (drift from committed renders, inflated scores). CLI: t3d critique <recipe>',
  ),
  tool(
    'list_recipes',
    'List recipes',
    'Recipe files in the project and the assets each exports. Default patterns: recipes/*/*.ts and assets/**/*.ts (folders starting with _ are shared libraries, skipped). CLI: t3d list <files…>',
    {
      glob: {
        type: 'string',
        description: 'a glob relative to the project root, e.g. assets/*.ts',
      },
    },
    [],
    true,
  ),
  tool(
    'explain_error',
    'Explain an error code',
    'A T3D_* code → where it is thrown, its cause and its fix, from docs/architecture/errors.md.',
    { code: { type: 'string', description: 'e.g. T3D_PART_UNKNOWN' } },
    ['code'],
    true,
  ),
];
