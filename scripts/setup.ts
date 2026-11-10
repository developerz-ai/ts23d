// Fresh clone → working tree, idempotent: check Bun, install, hooks. It does not run the gate:
// setup runs before every agent task, so a red gate here would hold the very task that fixes it.
// The gate is `bun run verify`, run on its own.

const want = (await Bun.file('.bun-version').text()).trim();
if (Bun.version !== want)
  console.warn(`! bun ${Bun.version} ≠ .bun-version ${want} — CI uses ${want} (bun upgrade)`);
for (const cmd of [
  ['bun', 'install'],
  ['bunx', 'lefthook', 'install'],
]) {
  console.log(`▸ ${cmd.join(' ')}`);
  const p = Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) process.exit(p.exitCode ?? 1);
}
console.log(
  '✔ setup done. The gate: bun run verify · try: bun run t3d shot recipes/t34/t34.ts --out renders',
);

export {};
