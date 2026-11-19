import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { godotShaderSource, threeMaterialSource } from './shader.ts';
import { cellRect } from './trim-sheet.ts';

const hints = {
  wind: { strength: 0.5, height: 6 },
  windowGlow: { color: '#ffcc88', ratio: 0.4 },
  wear: { amount: 0.3 },
} as const;

/** Typecheck one emitted module, strict, against the three (and @types/three) the gallery pins. */
function typecheck(file: string): { code: number; out: string } {
  const proc = Bun.spawnSync(
    [
      'node_modules/.bin/tsc',
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--target',
      'es2023',
      '--skipLibCheck',
      file,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  return { code: proc.exitCode, out: proc.stdout.toString() + proc.stderr.toString() };
}

describe('shader hints: bad input', () => {
  it('rejects a glow ratio outside 0..1 and a non-hex colour, with a fix', () => {
    for (const src of [threeMaterialSource, godotShaderSource]) {
      expect(() => src({ windowGlow: { color: '#fff', ratio: 0.5 } })).toThrow(Ts23dError);
      let fix = '';
      try {
        src({ windowGlow: { color: '#ffffff', ratio: 2 } });
      } catch (e) {
        if (e instanceof Ts23dError) fix = e.fix;
      }
      expect(fix).toContain('0..1');
    }
    expect(() => threeMaterialSource({ wind: { strength: -1 } })).toThrow('wind.strength');
  });
});

describe('threeMaterialSource', () => {
  const src = threeMaterialSource(hints);
  it('is a self-contained TSL module for three r18x', () => {
    expect(src).toContain("from 'three/webgpu'");
    expect(src).toContain("from 'three/tsl'");
    expect(src).toContain('export function createTrimMaterial');
    expect(src).toContain('export function upgradeTrimMaterials');
    expect(src).toContain('MeshStandardNodeMaterial');
    expect(src).not.toContain("@developerz.ai/ts23d'");
  });
  it('typechecks against the site-pinned three, and the check can fail', async () => {
    // Under apps/site/ so `three` resolves to the gallery's pinned copy and its types.
    const dir = await mkdtemp(join('apps/site', '.ts23d-shader-'));
    const file = join(dir, 'trim-material.ts');
    try {
      await writeFile(file, src.replace("from 'three/webgpu'", "from 'three/not-a-real-import'"));
      const broken = typecheck(file);
      expect(broken.code).not.toBe(0);
      expect(broken.out).toContain('three/not-a-real-import');

      await writeFile(file, src);
      const emitted = typecheck(file);
      expect(emitted.code, emitted.out).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('tints by vertex colour and binds the ORM channels', () => {
    expect(src).toContain('vertexColor()');
    expect(src).toMatch(/aoNode = orm\.x/);
    expect(src).toMatch(/roughnessNode = orm\.y/);
    expect(src).toMatch(/metalnessNode = orm\.z/);
  });
  it('bakes the hint values into the shared uniforms', () => {
    expect(src).toContain('windStrength: uniform(0.5)');
    expect(src).toContain('windHeight: uniform(6.0)');
    expect(src).toContain('glowRatio: uniform(0.4)');
    expect(src).toContain('wear: uniform(0.3)');
    expect(src).toContain('night: uniform(0)');
  });
  it('passes the glow colour as sRGB hex (three converts it; color(r, g, b) would read as linear)', () => {
    expect(src).toContain('glowColor: uniform(color(0xffcc88))');
    expect(src).not.toMatch(/color\(\d[\d.]*, /);
    expect(threeMaterialSource()).toContain('glowColor: uniform(color(0xffbf66))');
  });
  it('keys window glow on the window_sash cell rect', () => {
    const r = cellRect('window_sash');
    expect(src).toContain(`inRect(${r.u0}.0, ${r.v0}, ${r.u1}, ${r.v1})`);
    expect(src).toContain('emissiveNode');
  });
  it('switches the wind weight between the height heuristic and the _wind attribute', () => {
    expect(src).toContain('smoothstep(float(0), uWindHeight, positionLocal.z)');
    const attr = threeMaterialSource({ wind: { strength: 1, source: 'attribute' } });
    expect(attr).toContain("attribute('_wind', 'float')");
  });
  it('defaults cutout on only for cutout surfaces', () => {
    expect(src).toContain('cutout = false');
    expect(threeMaterialSource({ surface: 'cutout' })).toContain('cutout = true');
  });
});

describe('godotShaderSource', () => {
  const src = godotShaderSource(hints);
  it('is a Godot 4 spatial shader with the shared uniforms', () => {
    expect(src).toContain('shader_type spatial;');
    expect(src).toContain('uniform sampler2D albedo_tex : source_color');
    expect(src).toContain('uniform sampler2D normal_tex : hint_normal');
    expect(src).toContain('uniform float wind_strength = 0.5;');
    expect(src).toContain('uniform float glow_ratio : hint_range(0.0, 1.0) = 0.4;');
    expect(src).toContain('uniform float wear : hint_range(0.0, 1.0) = 0.3;');
  });
  it('has vertex sway, vertex-colour tint, ORM and night glow', () => {
    expect(src).toContain('void vertex()');
    expect(src).toContain('ALBEDO = base.rgb * COLOR.rgb');
    expect(src).toContain('AO = orm.r;');
    expect(src).toContain('EMISSION = glow_color * mask * lit * night');
  });
  it('alpha-scissors and disables culling for cutout foliage only', () => {
    expect(src).not.toContain('ALPHA_SCISSOR_THRESHOLD');
    const cut = godotShaderSource({ surface: 'cutout' });
    expect(cut).toContain('ALPHA_SCISSOR_THRESHOLD = 0.5;');
    expect(cut).toContain('cull_disabled');
  });
});
