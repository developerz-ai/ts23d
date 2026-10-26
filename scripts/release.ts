// Stamp a release: `bun run release <x.y.z>` sets package.json's version and turns CHANGELOG's
// `## [Unreleased]` into `## [x.y.z] - <date>`. Then open a PR titled `chore: release x.y.z`;
// merging it is the release (.github/workflows/release-tag.yml → release.yml → npm via OIDC).
//   bun run release --check <x.y.z>   exit 1 unless the tree is stamped at that version
//   bun run release --notes <x.y.z>   print that version's CHANGELOG section (release notes)

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const args = process.argv.slice(2);
const mode = args[0]?.startsWith('--') ? args[0] : '--stamp';
const version = (mode === '--stamp' ? args[0] : args[1])?.replace(/^v/, '') ?? '';

function fail(msg: string, fix: string): never {
  console.error(`T3D_RELEASE: ${msg}\n  fix: ${fix}`);
  process.exit(1);
}

if (!SEMVER.test(version)) fail(`'${version}' is not semver`, 'bun run release 0.1.0');
const pkgFile = Bun.file('package.json');
const pkg = (await pkgFile.json()) as { version: string };
const changelog = await Bun.file('CHANGELOG.md').text();
const section = (v: string): string | null => {
  const m = new RegExp(
    `^## \\[${v.replaceAll('.', '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|$(?![\\s\\S]))`,
    'm',
  ).exec(changelog);
  return m?.[1]?.trim() ?? null;
};

if (mode === '--check') {
  if (pkg.version !== version)
    fail(`package.json is ${pkg.version}, not ${version}`, `bun run release ${version}`);
  if (!section(version))
    fail(`CHANGELOG.md has no [${version}] section`, `bun run release ${version}`);
  console.log(`✔ stamped at ${version}`);
} else if (mode === '--notes') {
  const notes = section(version);
  if (!notes) fail(`CHANGELOG.md has no [${version}] section`, 'stamp the release first');
  console.log(notes);
} else {
  if (!/^## \[Unreleased\]/m.test(changelog))
    fail('CHANGELOG.md has no ## [Unreleased] section', 'add one at the top');
  const date = process.env['RELEASE_DATE'] ?? new Date().toISOString().slice(0, 10);
  await Bun.write(
    'CHANGELOG.md',
    changelog.replace(/^## \[Unreleased\]/m, `## [Unreleased]\n\n## [${version}] - ${date}`),
  );
  await Bun.write(pkgFile, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
  console.log(
    `✔ stamped ${version}. Next: git switch -c release/${version} && git commit -am 'chore: release ${version}' && gh pr create --fill`,
  );
}

export {};
