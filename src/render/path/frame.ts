// Small vector helpers for the path tracer: dot product and one shared orthonormal frame about a
// normal (Duff et al. 2017, branchless) to move sample directions between local (z = normal) and
// world space. Allocation-free; single-threaded use (one frame at a time).

const T = new Float64Array(3);
const B = new Float64Array(3);
const N = new Float64Array(3);

export const dot3 = (a: ArrayLike<number>, b: ArrayLike<number>): number =>
  (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);

/** Set the shared frame to the one about unit `n`. */
export function basis(n: ArrayLike<number>): void {
  const x = n[0] ?? 0;
  const y = n[1] ?? 0;
  const z = n[2] ?? 1;
  const sign = z >= 0 ? 1 : -1;
  const a = -1 / (sign + z);
  const b = x * y * a;
  T[0] = 1 + sign * x * x * a;
  T[1] = sign * b;
  T[2] = -sign * x;
  B[0] = b;
  B[1] = sign + y * y * a;
  B[2] = -y;
  N[0] = x;
  N[1] = y;
  N[2] = z;
}

export function toLocal(v: ArrayLike<number>, out: Float64Array): void {
  out[0] = dot3(v, T);
  out[1] = dot3(v, B);
  out[2] = dot3(v, N);
}

export function fromLocal(v: ArrayLike<number>, out: Float64Array): void {
  const x = v[0] ?? 0;
  const y = v[1] ?? 0;
  const z = v[2] ?? 0;
  out[0] = (T[0] ?? 0) * x + (B[0] ?? 0) * y + (N[0] ?? 0) * z;
  out[1] = (T[1] ?? 0) * x + (B[1] ?? 0) * y + (N[1] ?? 0) * z;
  out[2] = (T[2] ?? 0) * x + (B[2] ?? 0) * y + (N[2] ?? 0) * z;
}

/** Unit tangent-plane axes of the current frame (for disk probes). */
export function axes(t: Float64Array, b: Float64Array): void {
  t.set(T);
  b.set(B);
}
