// Fresh clone → working tree, idempotent: check Bun, install, hooks, first gate run.

const want = (await Bun.file('.bun-version').text()).trim();
if (Bun.version !== want)
  console.warn(`! bun ${Bun.version} ≠ .bun-version ${want} — CI uses ${want} (bun upgrade)`);
for (const cmd of [
  ['bun', 'install'],
  ['bunx', 'lefthook', 'install'],
  ['bun', 'run', 'verify', '--only', 'lint,typecheck,test'],
]) {
  console.log(`▸ ${cmd.join(' ')}`);
  const p = Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) process.exit(p.exitCode ?? 1);
}
console.log(
  '✔ setup done. The gate: bun run verify · try: bun run t3d shot recipes/t34.ts --out renders',
);

export {};
