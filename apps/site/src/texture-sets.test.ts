import { afterAll, describe, expect, test } from 'bun:test';
import type { Texture } from 'three';

// three.js mints every object's UUID from Math.random, which the test preload seals (recipes must
// not use it). Nothing here depends on those ids: a fixed sequence stands in while this file runs,
// and three is imported only after it is in place.
const sealed = Math.random;
let tick = 0;
Math.random = () => (tick++ % 997) / 997;
afterAll(() => {
  Math.random = sealed;
});

const {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
} = await import('three');
const { bindTextureSets, describeSet, disposeTextureSet, setNameOf, usesTrimSheet } = await import(
  './texture-sets.ts'
);
const { applySheet } = await import('./textures.ts');

/** A texture as a careless loader would leave it: flipped, in the wrong colour space. */
const tex = (size: number, colorSpace: string = LinearSRGBColorSpace): Texture => {
  const t = new DataTexture(new Uint8Array(size * size * 4), size, size);
  t.flipY = true;
  t.colorSpace = colorSpace;
  return t;
};

const geometry = (tangents: boolean) => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  if (tangents) g.setAttribute('tangent', new BufferAttribute(new Float32Array(12), 4));
  return g;
};

/** The material the GLB writer's `ts23d_tex_<set>` becomes: albedo, normal, one packed ORM. */
const setMaterial = (name = 'ts23d_tex_body') => {
  const orm = tex(1024, SRGBColorSpace);
  const mat = new MeshStandardMaterial({
    name,
    map: tex(2048),
    normalMap: tex(1024, SRGBColorSpace),
    aoMap: orm,
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
  });
  return { mat, orm };
};

describe('setNameOf', () => {
  test('trim-sheet, paint and finish materials are not texture sets', () => {
    expect(setNameOf('ts23d_trim')).toBeNull();
    expect(setNameOf('ts23d_paint_hull')).toBeNull();
    expect(setNameOf('ts23d_tex_')).toBeNull();
    expect(setNameOf('')).toBeNull();
  });

  test('opaque and cutout materials name their set', () => {
    expect(setNameOf('ts23d_tex_body')).toBe('body');
    expect(setNameOf('ts23d_texcut_fur_lod1')).toBe('fur_lod1');
  });
});

describe('bindTextureSets', () => {
  test('a material that is not a texture set is left exactly as it was', () => {
    const map = tex(64);
    const mat = new MeshStandardMaterial({ name: 'ts23d_trim', map });
    const version = map.version;
    expect(bindTextureSets(new Mesh(geometry(true), mat))).toEqual([]);
    expect(map.flipY).toBe(true);
    expect(map.colorSpace).toBe(LinearSRGBColorSpace);
    expect(map.version).toBe(version);
  });

  test('albedo is sRGB, normal and ORM are linear, nothing is flipped (glTF UVs)', () => {
    const { mat, orm } = setMaterial();
    bindTextureSets(new Mesh(geometry(true), mat), 8);
    expect(mat.map?.colorSpace).toBe(SRGBColorSpace);
    expect(mat.normalMap?.colorSpace).toBe(NoColorSpace);
    expect(orm.colorSpace).toBe(NoColorSpace);
    for (const t of [mat.map, mat.normalMap, orm]) {
      expect(t?.flipY).toBe(false);
      expect(t?.anisotropy).toBe(8);
    }
  });

  test('one ORM texture feeds occlusion, roughness and metalness; the factors stay 1', () => {
    const { mat, orm } = setMaterial();
    const [info] = bindTextureSets(new Mesh(geometry(true), mat));
    expect(mat.aoMap).toBe(orm);
    expect(mat.roughnessMap).toBe(orm);
    expect(mat.metalnessMap).toBe(orm);
    expect([mat.roughness, mat.metalness]).toEqual([1, 1]);
    expect(info).toEqual({ name: 'body', albedo: 2048, normal: 1024, orm: 1024, cutout: false });
  });

  test('roughness and metalness from different textures are not reported as a packed ORM', () => {
    const { mat } = setMaterial();
    mat.metalnessMap = tex(512);
    expect(bindTextureSets(new Mesh(geometry(true), mat))[0]?.orm).toBeNull();
  });

  test('normal scale: +1 on the mesh’s own tangents, −1 on Y without a TANGENT attribute', () => {
    const own = setMaterial().mat;
    own.normalScale.set(1, -1);
    bindTextureSets(new Mesh(geometry(true), own));
    expect(own.normalScale.toArray()).toEqual([1, 1]);
    const derived = setMaterial().mat;
    bindTextureSets(new Mesh(geometry(false), derived));
    expect(derived.normalScale.toArray()).toEqual([1, -1]);
    // Binding twice (every LOD switch re-binds) does not flip it back.
    bindTextureSets(new Mesh(geometry(false), derived));
    expect(derived.normalScale.toArray()).toEqual([1, -1]);
  });

  test('sets are listed once by name; a cutout material says so', () => {
    const a = setMaterial('ts23d_tex_body').mat;
    const cut = setMaterial('ts23d_texcut_fur').mat;
    cut.alphaTest = 0.5;
    const root = new Group().add(
      new Mesh(geometry(true), a),
      new Mesh(geometry(true), a),
      new Mesh(geometry(true), cut),
    );
    const sets = bindTextureSets(root);
    expect(sets.map((s) => s.name)).toEqual(['body', 'fur']);
    expect(sets.map(describeSet)).toEqual([
      'body: albedo 2048² · normal 1024² · ORM 1024²',
      'fur: albedo 2048² · normal 1024² · ORM 1024² · cutout',
    ]);
  });
});

describe('the trim sheet and texture sets', () => {
  const sheet = {
    size: 2,
    albedo: new Uint8Array(16),
    normal: new Uint8Array(16),
    orm: new Uint8Array(16),
  };

  test('binding the trim sheet never replaces a texture set’s maps', () => {
    const { mat, orm } = setMaterial();
    const albedo = mat.map;
    const trim = new MeshStandardMaterial({ name: 'ts23d_trim' });
    const root = new Group().add(new Mesh(geometry(true), mat), new Mesh(geometry(true), trim));
    applySheet(root, sheet);
    expect(trim.map).not.toBeNull();
    expect(mat.map).toBe(albedo);
    expect(mat.roughnessMap).toBe(orm);
    applySheet(root, null);
    expect(trim.map).toBeNull();
    expect(mat.map).toBe(albedo);
    expect(mat.normalMap).not.toBeNull();
  });

  test('a model made only of texture sets has nothing for the trim sheet', () => {
    const body = new Mesh(geometry(true), setMaterial().mat);
    expect(usesTrimSheet(body)).toBe(false);
    const mixed = new Group().add(body, new Mesh(geometry(true), new MeshStandardMaterial()));
    expect(usesTrimSheet(mixed)).toBe(true);
  });

  test('disposing frees a set’s textures once each and leaves other materials’ maps alone', () => {
    const { mat, orm } = setMaterial();
    let freed = 0;
    orm.addEventListener('dispose', () => freed++);
    disposeTextureSet(mat);
    expect(freed).toBe(1);
    const shared = tex(64);
    let sharedFreed = 0;
    shared.addEventListener('dispose', () => sharedFreed++);
    disposeTextureSet(new MeshStandardMaterial({ name: 'ts23d_trim', map: shared }));
    expect(sharedFreed).toBe(0);
  });
});
