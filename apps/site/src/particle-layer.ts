// GPU side of the particle system: one instanced quad per particle, billboarded in the vertex
// shader, soft round sprite from a canvas texture. One draw call per blend mode.

import {
  AdditiveBlending,
  CanvasTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
  UniformsLib,
  UniformsUtils,
} from 'three';

const VERTEX = /* glsl */ `
attribute vec3 offset;
attribute vec4 tint;
attribute float size;
varying vec2 vUv;
varying vec4 vTint;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4(offset, 1.0);
  mvPosition.xy += position.xy * size;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vTint;
#include <common>
#include <fog_pars_fragment>
void main() {
  float a = vTint.a * texture2D(map, vUv).a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vTint.rgb, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

let sprite: Texture | null = null;

/** A soft radial falloff, drawn once. */
function spriteTexture(): Texture {
  if (sprite) return sprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  sprite = new CanvasTexture(c);
  return sprite;
}

export class ParticleLayer {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly offset: Float32Array;
  readonly tint: Float32Array;
  readonly size: Float32Array;

  constructor(
    readonly capacity: number,
    additive: boolean,
  ) {
    const quad = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.offset = new Float32Array(capacity * 3);
    this.tint = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    for (const [name, array, n] of [
      ['offset', this.offset, 3],
      ['tint', this.tint, 4],
      ['size', this.size, 1],
    ] as const) {
      geometry.setAttribute(
        name,
        new InstancedBufferAttribute(array, n).setUsage(DynamicDrawUsage),
      );
    }
    geometry.instanceCount = 0;
    const uniforms = UniformsUtils.merge([UniformsLib.fog, { map: { value: null } }]);
    const material = new ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    material.uniforms['map'] = { value: spriteTexture() };
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
  }

  /** Upload the first `count` particles. */
  commit(count: number): void {
    const g = this.mesh.geometry;
    g.instanceCount = count;
    this.mesh.visible = count > 0;
    for (const name of ['offset', 'tint', 'size']) {
      const attr = g.getAttribute(name) as InstancedBufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
}
