# Face base mesh — licence

`hm08-bust.ts` is derived from the **MakeHuman hm08 base mesh** (`makehuman/data/3dobjs/base.obj`):
the `body` group's quads above the chest (head, neck, shoulders, arm stubs), converted to metres,
Z up, +X front, and quantised. Nothing else from MakeHuman (no targets, textures, proxies, eyes,
teeth) is included.

- Source: <https://github.com/makehumancommunity/makehuman/blob/3c701a8e52f09e69922e8b598d23be2d7dfc49e3/makehuman/data/3dobjs/base.obj>
- sha256 of the source file: `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`
- Licence: **CC0 1.0 Universal** (public domain dedication). The file's own header: "This asset was
  explicitly released as CC0 in september 2020." The repository's `LICENSE.md`, section C
  (Assets): "The base mesh and proxies … These assets have been released under CC0 1.0 Universal."
- Copyright holders at the time of the CC0 release (from the file header, credited out of
  courtesy, not required): Data Collection AB, Joel Palmius, Jonas Hauquier.

The MakeHuman *code* is AGPL; none of it is used here — only the mesh data. Regenerate with
`bun recipes/_lib/face/base/extract.ts [path/to/base.obj]` (downloads the pinned URL and checks the
sha256 when no path is given).
