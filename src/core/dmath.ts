// Deterministic maths (`dmath`): sin, cos, exp, pow, hypot and friends that give the same bits on
// every CPU, C library and JS engine. `Math.sin` and its siblings come from the platform's libm,
// which differs in the last bit between CPUs (glibc picks an FMA or an SSE2 routine at load time)
// and between libm versions; one last bit moves a normal, flips a weld test that sits on a
// threshold, and a path tracer turns it into a different pixel. These are built only from + - * /,
// Math.sqrt and typed-array word access, which IEEE-754 and ECMAScript define exactly. Every
// module, recipe and render uses them; `bun run determinism` refuses Math.sin and `**` (D403).

export { exp, log, log2, log10 } from './dmath-exp.ts';
export { cosh, expm1, log1p, sinh, tanh } from './dmath-hyper.ts';
export { acos, asin, atan, atan2 } from './dmath-inverse.ts';
export { cbrt, hypot, norm, pow } from './dmath-pow.ts';
export { cos, sin, tan } from './dmath-trig.ts';
