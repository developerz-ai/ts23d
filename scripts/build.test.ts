// The .d.ts specifier rewrite: every relative `.ts` the published types name must become `.js`.

import { expect, it } from 'bun:test';
import { rewriteDtsSpecifiers } from './build.ts';

it('rewrites an inline import("../index.ts") type, which the static-only rewrite missed', () => {
  const dts =
    'export declare function massProperties(phys?: import("../index.ts").AssetPhysics): void;';
  expect(rewriteDtsSpecifiers(dts)).toBe(
    'export declare function massProperties(phys?: import("../index.js").AssetPhysics): void;',
  );
});

it('rewrites static from specifiers in either quote style', () => {
  expect(rewriteDtsSpecifiers("export * from './box.ts';")).toBe("export * from './box.js';");
  expect(rewriteDtsSpecifiers('import type { A } from "../core/index.ts";')).toBe(
    'import type { A } from "../core/index.js";',
  );
});

it('leaves bare package specifiers and non-.ts paths alone', () => {
  const dts = `import type { X } from 'gltf-validator';\nexport * from './a.js';\ntype T = import("node:fs").Stats;`;
  expect(rewriteDtsSpecifiers(dts)).toBe(dts);
});
