// Particle system for recipe emitters. Recipes declare sources with `ctx.emitter(...)`; they land
// as empty GLB nodes with `userData.ts23d.emitter`. This finds them, follows each node's world
// transform and velocity, and simulates pooled billboard particles with seeded randomness.

import type { Emitter } from '@developerz-ai/ts23d';
import { Group, MathUtils, type Object3D, Vector3 } from 'three';
import { prng } from './noise.ts';
import { capFor, KINDS, type KindStyle } from './particle-kinds.ts';
import { ParticleLayer } from './particle-layer.ts';

/** How strongly a source emits right now, 0..1. Called per frame for 'moving' sources. */
export type Intensity = (e: Emitter, node: Object3D) => number;

interface Source {
  readonly id: number;
  readonly node: Object3D;
  readonly spec: Emitter;
  readonly style: KindStyle;
  readonly cap: number;
  readonly intensity: Intensity;
  readonly owner: Object3D;
  readonly prev: Vector3;
  readonly vel: Vector3;
  primed: boolean;
  carry: number;
  live: number;
}

const FLOATS = 17; // px py pz vx vy vz age life s0 s1 alpha r g b source drag buoyancy

class Pool {
  readonly layer: ParticleLayer;
  readonly data: Float32Array;
  count = 0;
  constructor(capacity: number, additive: boolean) {
    this.layer = new ParticleLayer(capacity, additive);
    this.data = new Float32Array(capacity * FLOATS);
  }
}

const tmpDir = new Vector3();
const tmpPos = new Vector3();
const basisA = new Vector3();
const basisB = new Vector3();

/** Read a node's emitter declaration, if it has one. */
export function emitterOf(node: Object3D): Emitter | null {
  const ext = node.userData['ts23d'] as { emitter?: Emitter } | undefined;
  return ext?.emitter ?? null;
}

export class Particles {
  readonly object = new Group();
  private readonly pools: { normal: Pool; additive: Pool };
  private readonly sources = new Map<number, Source>();
  private readonly random: () => number;
  private nextId = 1;

  constructor(seed = 23, capacity = 4000) {
    this.random = prng(seed);
    this.pools = { normal: new Pool(capacity, false), additive: new Pool(capacity / 2, true) };
    this.object.add(this.pools.normal.layer.mesh, this.pools.additive.layer.mesh);
  }

  /** Live particle count, for the HUD. */
  get count(): number {
    return this.pools.normal.count + this.pools.additive.count;
  }

  get emitters(): number {
    return this.sources.size;
  }

  /** Bind every emitter node under `root`. Returns the emitter node names found. */
  attach(root: Object3D, intensity: Intensity): string[] {
    const found: string[] = [];
    root.traverse((node) => {
      const spec = emitterOf(node);
      if (!spec) return;
      const id = this.nextId++;
      this.sources.set(id, {
        id,
        node,
        spec,
        style: KINDS[spec.kind] ?? KINDS.smoke,
        cap: capFor(spec),
        intensity,
        owner: root,
        prev: new Vector3(),
        vel: new Vector3(),
        primed: false,
        carry: 0,
        live: 0,
      });
      found.push(node.name);
    });
    return found;
  }

  /** Stop emitting from everything under `root`; its live particles finish their lives. */
  detach(root: Object3D): void {
    for (const [id, s] of this.sources) if (s.owner === root) this.sources.delete(id);
  }

  /** Fire every 'event' source under `root` (muzzle flash, gun smoke). Returns how many fired. */
  trigger(root: Object3D): number {
    let n = 0;
    for (const s of this.sources.values()) {
      if (s.owner !== root || (s.spec.when ?? 'always') !== 'event') continue;
      this.burst(s);
      n++;
    }
    return n;
  }

  /** One-off burst from a node with an ad-hoc spec (used when a recipe declares none). */
  puff(node: Object3D, spec: Emitter, velocity?: Vector3): void {
    node.updateWorldMatrix(true, false);
    const s: Source = {
      id: 0,
      node,
      spec,
      style: KINDS[spec.kind],
      cap: capFor(spec),
      intensity: () => 1,
      owner: node,
      prev: node.getWorldPosition(new Vector3()),
      vel: velocity?.clone() ?? new Vector3(),
      primed: true,
      carry: 0,
      live: 0,
    };
    this.burst(s);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (const s of this.sources.values()) this.emit(s, dt);
    this.step(this.pools.normal, dt);
    this.step(this.pools.additive, dt);
  }

  private burst(s: Source): void {
    s.node.updateWorldMatrix(true, false);
    const n = MathUtils.clamp(Math.round(s.spec.rate * Math.min(s.spec.life, 0.15)), 6, s.cap);
    const at = s.node.getWorldPosition(tmpPos);
    for (let i = 0; i < n; i++) this.spawn(s, at, 1);
  }

  private emit(s: Source, dt: number): void {
    const when = s.spec.when ?? 'always';
    const pos = s.node.getWorldPosition(new Vector3());
    if (!s.primed) {
      s.prev.copy(pos);
      s.primed = true;
    }
    s.vel.copy(pos).sub(s.prev).divideScalar(dt);
    if (when !== 'event') {
      const k = when === 'moving' ? MathUtils.clamp(s.intensity(s.spec, s.node), 0, 1) : 1;
      s.carry += s.spec.rate * k * dt;
      const n = Math.floor(s.carry);
      s.carry -= n;
      // Spread spawns along the path travelled this frame, so fast emitters leave a trail.
      for (let i = 0; i < n && s.live < s.cap; i++) {
        tmpPos.copy(s.prev).lerp(pos, (i + 1) / n);
        this.spawn(s, tmpPos, k);
      }
    }
    s.prev.copy(pos);
  }

  private spawn(s: Source, at: Vector3, strength: number): void {
    const pool = s.style.additive ? this.pools.additive : this.pools.normal;
    if (pool.count >= pool.layer.capacity || s.live >= s.cap) return;
    const r = this.random;
    const [dx, dy, dz] = s.spec.dir ?? [0, 0, 1];
    tmpDir.set(dx, dy, dz).transformDirection(s.node.matrixWorld);
    // Random direction inside the spread cone around tmpDir.
    const spread = MathUtils.degToRad(s.spec.spreadDeg ?? 15) * Math.sqrt(r());
    const phi = r() * Math.PI * 2;
    basisA.set(1, 0, 0);
    if (Math.abs(tmpDir.x) > 0.9) basisA.set(0, 1, 0);
    basisA.cross(tmpDir).normalize();
    basisB.crossVectors(tmpDir, basisA);
    const sinS = Math.sin(spread);
    const dir = tmpDir
      .multiplyScalar(Math.cos(spread))
      .addScaledVector(basisA, sinS * Math.cos(phi))
      .addScaledVector(basisB, sinS * Math.sin(phi));
    const speed = (s.spec.speed ?? 0.8) * (0.75 + 0.5 * r());
    const color = s.spec.color ?? s.style.color;
    const i = pool.count++ * FLOATS;
    const d = pool.data;
    d[i] = at.x;
    d[i + 1] = at.y;
    d[i + 2] = at.z;
    // Inherit the emitter's own motion: exhaust leaves a moving tank at the tank's speed.
    d[i + 3] = dir.x * speed + s.vel.x;
    d[i + 4] = dir.y * speed + s.vel.y;
    d[i + 5] = dir.z * speed + s.vel.z;
    d[i + 6] = 0;
    d[i + 7] = s.spec.life * (0.8 + 0.4 * r());
    d[i + 8] = s.spec.size[0] * (0.85 + 0.3 * r());
    d[i + 9] = s.spec.size[1] * (0.85 + 0.3 * r());
    d[i + 10] = s.style.alpha * (0.6 + 0.4 * strength);
    d[i + 11] = color[0];
    d[i + 12] = color[1];
    d[i + 13] = color[2];
    d[i + 14] = s.id;
    d[i + 15] = s.style.drag;
    d[i + 16] = s.style.buoyancy;
    s.live++;
  }

  private step(pool: Pool, dt: number): void {
    const d = pool.data;
    const { offset, tint, size } = pool.layer;
    let n = 0;
    for (let p = 0; p < pool.count; p++) {
      const i = p * FLOATS;
      const age = (d[i + 6] ?? 0) + dt;
      const life = d[i + 7] ?? 1;
      if (age >= life) {
        const owner = this.sources.get(d[i + 14] ?? 0);
        if (owner) owner.live--;
        continue;
      }
      const drag = Math.exp(-(d[i + 15] ?? 1) * dt);
      const buoyancy = d[i + 16] ?? 0;
      const j = n * FLOATS;
      // Compact in place: survivors move down over the dead.
      if (j !== i) d.copyWithin(j, i, i + FLOATS);
      d[j + 3] = (d[j + 3] ?? 0) * drag;
      d[j + 4] = (d[j + 4] ?? 0) * drag + buoyancy * dt;
      d[j + 5] = (d[j + 5] ?? 0) * drag;
      d[j] = (d[j] ?? 0) + (d[j + 3] ?? 0) * dt;
      d[j + 1] = (d[j + 1] ?? 0) + (d[j + 4] ?? 0) * dt;
      d[j + 2] = (d[j + 2] ?? 0) + (d[j + 5] ?? 0) * dt;
      d[j + 6] = age;
      const t = age / life;
      const fadeIn = Math.min(1, t / 0.08);
      const s0 = d[j + 8] ?? 1;
      const s1 = d[j + 9] ?? 1;
      offset[n * 3] = d[j] ?? 0;
      offset[n * 3 + 1] = d[j + 1] ?? 0;
      offset[n * 3 + 2] = d[j + 2] ?? 0;
      size[n] = s0 + (s1 - s0) * Math.sqrt(t);
      tint[n * 4] = d[j + 11] ?? 1;
      tint[n * 4 + 1] = d[j + 12] ?? 1;
      tint[n * 4 + 2] = d[j + 13] ?? 1;
      tint[n * 4 + 3] = (d[j + 10] ?? 1) * fadeIn * (1 - t) ** 1.5;
      n++;
    }
    pool.count = n;
    pool.layer.commit(n);
  }
}
