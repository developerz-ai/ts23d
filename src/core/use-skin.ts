// What `ctx.use` must rewrite when the instanced child is skinned: the child's bones are appended
// to the parent skeleton (as `<prefix>_<bone>`), so its meshes' joint indices move by the number
// of bones the parent already had, and a socket riding a bone rides the prefixed one.

import type { Mesh } from './mesh.ts';
import type { Socket } from './part.ts';

/** `mesh` with every joint index moved up by `base` (the parent's bone count before the use). */
export function rebaseJoints(mesh: Mesh | null, base: number): Mesh | null {
  if (!mesh?.joints || base === 0) return mesh;
  return { ...mesh, joints: mesh.joints.map((j) => j + base) };
}

/** A used socket: `data.bone` names the bone under its new, prefixed name. */
export function useSocket(socket: Socket, prefix: string): Socket {
  const bone = socket.data?.['bone'];
  return typeof bone === 'string'
    ? { ...socket, data: { ...socket.data, bone: `${prefix}_${bone}` } }
    : socket;
}
