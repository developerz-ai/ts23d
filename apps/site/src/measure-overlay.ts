// Measuring overlays for the viewer, as three.js objects: L × W × H dimension lines with arrow
// heads and metre labels (anchors the tools pin HTML tags to) round the model's box, and a 1.8 m
// figure for scale. The ruler reuses `measureLine`. Builders only: the tools module decides
// when they show.

import {
  type Box3,
  BufferGeometry,
  CapsuleGeometry,
  type Color,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';

export const metres = (m: number): string =>
  m >= 10 ? `${m.toFixed(1)} m` : m >= 1 ? `${m.toFixed(2)} m` : `${(m * 100).toFixed(1)} cm`;

/** A label anchor: an empty node the tools pin an HTML tag to (crisp text, never post-processed). */
export function tagAt(text: string, color: Color): Object3D {
  const o = new Object3D();
  o.userData = { measureTag: text, color: `#${color.getHexString()}` };
  return o;
}

/** A measured segment a → b: the line, an arrow head at each end and the label at its middle. */
export function measureLine(
  a: Vector3,
  b: Vector3,
  text: string,
  color: Color,
  size: number,
): Group {
  const g = new Group();
  const mat = new LineBasicMaterial({ color, depthTest: false, depthWrite: false });
  const line = new Line(new BufferGeometry().setFromPoints([a, b]), mat);
  line.renderOrder = 9;
  g.add(line);
  const dir = b.clone().sub(a).normalize();
  const cone = new ConeGeometry(size * 0.25, size, 10);
  const coneMat = new MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
  for (const [at, d] of [
    [a, dir.clone().negate()],
    [b, dir],
  ] as const) {
    const head = new Mesh(cone, coneMat);
    head.position.copy(at).addScaledVector(d, -size / 2);
    head.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d);
    head.renderOrder = 9;
    g.add(head);
  }
  const label = tagAt(text, color);
  label.position.copy(a).add(b).multiplyScalar(0.5);
  g.add(label);
  return g;
}

/** Overall dimensions round `box` (glTF frame: z = length, x = width, y = height). */
export function dimensions(box: Box3, color: Color): Group {
  const size = box.getSize(new Vector3());
  const diag = size.length();
  const off = diag * 0.06;
  const arrow = Math.max(diag * 0.025, 0.01);
  const { min, max } = box;
  const y = min.y + 0.002;
  const g = new Group();
  g.name = 'dimensions';
  g.add(
    measureLine(
      new Vector3(max.x + off, y, min.z),
      new Vector3(max.x + off, y, max.z),
      `L ${metres(size.z)}`,
      color,
      arrow,
    ),
    measureLine(
      new Vector3(min.x, y, max.z + off),
      new Vector3(max.x, y, max.z + off),
      `W ${metres(size.x)}`,
      color,
      arrow,
    ),
    measureLine(
      new Vector3(max.x + off, min.y, max.z + off),
      new Vector3(max.x + off, max.y, max.z + off),
      `H ${metres(size.y)}`,
      color,
      arrow,
    ),
  );
  return g;
}

/** A neutral 1.8 m figure on the floor beside the box's front-left corner. */
export function humanFigure(box: Box3): Group {
  const mat = new MeshStandardMaterial({ color: 0x8c96a6, roughness: 0.85 });
  const g = new Group();
  g.name = 'human_1_8m';
  const part = (geo: BufferGeometry, x: number, y: number): void => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    g.add(m);
  };
  part(new SphereGeometry(0.105, 16, 12), 0, 1.69);
  part(new CapsuleGeometry(0.17, 0.4, 4, 12), 0, 1.2);
  for (const s of [-1, 1]) {
    part(new CapsuleGeometry(0.07, 0.78, 4, 10), 0.1 * s, 0.46);
    part(new CapsuleGeometry(0.045, 0.58, 4, 8), 0.235 * s, 1.12);
  }
  // Off the front-left corner: in view from the opening 3/4 camera, clear of the dimensions.
  g.position.set(box.min.x - 0.45, box.min.y, box.max.z + 0.35);
  return g;
}
