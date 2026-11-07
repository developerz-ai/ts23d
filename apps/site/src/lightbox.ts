// Procedural image-based light: a small HDR scene (soft boxes, strip lights, a sky dome) that
// PMREM prefilters into `scene.environment`. Built in code instead of shipping an .hdr file: zero
// payload, deterministic, and each preset is a lighting setup, not a photo of someone's room.

import {
  BackSide,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three';

export type EnvPreset = 'studio' | 'portrait' | 'outdoor';

type Rgb = readonly [number, number, number];

/** An emissive card: HDR colour (values above 1 are brighter than white), size, place, aim. */
interface Panel {
  readonly rgb: Rgb;
  readonly power: number;
  readonly size: readonly [number, number];
  readonly at: readonly [number, number, number];
}

/** A dome shaded from zenith through horizon to ground (linear HDR colours). */
interface Dome {
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  readonly ground: Rgb;
}

interface Setup {
  readonly dome: Dome;
  readonly panels: readonly Panel[];
}

const WARM: Rgb = [1, 0.93, 0.84];
const COOL: Rgb = [0.84, 0.9, 1];
const WHITE: Rgb = [1, 1, 1];

// Camera sits at +X/+Z looking at the origin; key comes from its left (-X, +Z), rim from behind.
const SETUPS: Record<EnvPreset, Setup> = {
  // Product studio: big overhead soft box, a tall key strip, a rim strip behind, a dim fill card,
  // in a mid-grey cyclorama so reflections show shape, not a white void.
  studio: {
    dome: { zenith: [0.32, 0.33, 0.35], horizon: [0.22, 0.22, 0.23], ground: [0.1, 0.1, 0.1] },
    panels: [
      { rgb: WHITE, power: 5, size: [9, 9], at: [0, 9, 0] },
      { rgb: WARM, power: 9, size: [3, 8], at: [-8, 3, 5] },
      { rgb: COOL, power: 7, size: [2, 8], at: [6, 3, -8] },
      { rgb: WHITE, power: 1.6, size: [6, 5], at: [9, 2, 4] },
    ],
  },
  // Portrait: one large warm key high front-left, a cool kicker behind-right, a dark room for
  // contrast so skin and cloth read by form.
  portrait: {
    dome: { zenith: [0.12, 0.12, 0.13], horizon: [0.09, 0.085, 0.08], ground: [0.05, 0.045, 0.04] },
    panels: [
      { rgb: WARM, power: 11, size: [6, 6], at: [-7, 5, 6] },
      { rgb: COOL, power: 9, size: [2, 7], at: [5, 3, -8] },
      { rgb: [0.95, 0.9, 0.85], power: 1.2, size: [6, 4], at: [8, 1, 5] },
    ],
  },
  // Overcast-to-clear sky: blue zenith, bright hazy horizon, warm earth bounce. The sun itself is
  // the stage's directional light, so its shadow and its light agree.
  outdoor: {
    dome: { zenith: [0.55, 0.68, 0.95], horizon: [1.1, 1.1, 1.08], ground: [0.42, 0.38, 0.32] },
    panels: [],
  },
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function dome(d: Dome): Mesh {
  const geo = new SphereGeometry(20, 48, 24);
  const pos = geo.getAttribute('position');
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 20;
    const c =
      y >= 0
        ? mix(d.horizon, d.zenith, Math.sqrt(y))
        : mix(d.horizon, d.ground, Math.min(1, -y * 4));
    colors.push(...c);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide }));
}

function panel(p: Panel): Mesh {
  const color = new Color(p.rgb[0], p.rgb[1], p.rgb[2]).multiplyScalar(p.power);
  const m = new Mesh(new PlaneGeometry(p.size[0], p.size[1]), new MeshBasicMaterial({ color }));
  m.position.set(p.at[0], p.at[1], p.at[2]);
  m.lookAt(0, 0, 0);
  return m;
}

function build(preset: EnvPreset): Scene {
  const setup = SETUPS[preset];
  const scene = new Scene();
  scene.add(dome(setup.dome));
  for (const p of setup.panels) scene.add(panel(p));
  // A low plinth so the lower hemisphere carries a floor bounce, as a real cyclorama does.
  const floor = new Mesh(
    new BoxGeometry(30, 0.2, 30),
    new MeshBasicMaterial({ color: new Color(...mix(setup.dome.ground, setup.dome.horizon, 0.5)) }),
  );
  floor.position.y = -2;
  scene.add(floor);
  return scene;
}

function dispose(scene: Scene): void {
  scene.traverse((n) => {
    if (n instanceof Mesh) {
      n.geometry.dispose();
      for (const m of [n.material].flat()) m.dispose();
    }
  });
}

const cache = new WeakMap<WebGLRenderer, Map<EnvPreset, Texture>>();

/** The prefiltered environment for `preset`, built once per renderer. */
export function environmentFor(renderer: WebGLRenderer, preset: EnvPreset): Texture {
  let byPreset = cache.get(renderer);
  if (!byPreset) {
    byPreset = new Map();
    cache.set(renderer, byPreset);
  }
  const hit = byPreset.get(preset);
  if (hit) return hit;
  const pmrem = new PMREMGenerator(renderer);
  const scene = build(preset);
  const tex = pmrem.fromScene(scene, 0.035).texture;
  dispose(scene);
  pmrem.dispose();
  byPreset.set(preset, tex);
  return tex;
}
