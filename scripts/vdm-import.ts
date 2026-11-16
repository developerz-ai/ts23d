// Optional VDM brush import: a CC0 / permissive vector-displacement map (PNG, tangent space,
// RGB = right/up/normal centred on mid-grey) → a committed, quantised `.vdm.bin` that records its
// source url, licence and the source's sha256 (licence rules: src/neural/import-licence.ts).
//   bun scripts/vdm-import.ts <brush.png> <out.vdm.bin> --license CC0-1.0 --author A --url U
//                            [--amp 0.25] [--res 33] [--allow-nc]
// amp = displacement (footprint widths) at a full-scale channel; the map is resampled to res²,
// windowed to zero at its border, and its Lipschitz recomputed. EXR is not read: export 16-bit PNG.
// Format: "T3DVDM1\n" · u32 LE JSON length · JSON meta · pad to 4 · i16 LE (right, up, normal)
// per texel, each × range / 32767. `decodeVdmBin` gives back the stamp (deterministic bytes).

import { Ts23dError } from '../src/core/index.ts';
import { decodePng, type Rgba } from '../src/material/index.ts';
import { checkLicence, type ImportCredit } from '../src/neural/index.ts';
import { type VdmStamp, vdmStamp } from '../src/primitives/vdm.ts';
import { sha256 } from './import-cache.ts';

const MAGIC = 'T3DVDM1\n';

export interface VdmMeta {
  readonly source: ImportCredit;
  /** sha256 of the source image bytes. */
  readonly sha256: string;
  readonly credit: string;
  /** Largest |component|; i16 values are × range / 32767. */
  readonly range: number;
  readonly size: number;
}

const bad = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `vdm import: ${cause}`, fix });
};

/** RGBA8 vector map → stamp grid at `res`², windowed (edge ring 0), in footprint widths. */
export function mapToStamp(img: Rgba, amp: number, res: number): VdmStamp {
  if (!(amp > 0 && Number.isFinite(amp))) bad(`amp is ${amp}`, 'use --amp > 0 (e.g. 0.25)');
  if (!(Number.isInteger(res) && res >= 9)) bad(`res is ${res}`, 'use --res ≥ 9 (33 is typical)');
  const { width: w, height: h, data } = img;
  const texel = (x: number, y: number, c: number): number =>
    ((data[(y * w + x) * 4 + c] ?? 128) / 255 - 0.5) * 2 * amp;
  const g = new Float32Array(res * res * 3);
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++) {
      // Image rows run top → bottom; stamp +v is up.
      const fx = (i / (res - 1)) * (w - 1);
      const fy = (1 - j / (res - 1)) * (h - 1);
      const x0 = Math.min(Math.floor(fx), Math.max(0, w - 2));
      const y0 = Math.min(Math.floor(fy), Math.max(0, h - 2));
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const ax = fx - x0;
      const ay = fy - y0;
      const edge = Math.min(i, j, res - 1 - i, res - 1 - j);
      const win = Math.min(1, edge / 2) ** 2 * (3 - 2 * Math.min(1, edge / 2));
      for (let c = 0; c < 3; c++) {
        const top = texel(x0, y0, c) + (texel(x1, y0, c) - texel(x0, y0, c)) * ax;
        const bot = texel(x0, y1, c) + (texel(x1, y1, c) - texel(x0, y1, c)) * ax;
        g[(j * res + i) * 3 + c] = (top + (bot - top) * ay) * win + 0;
      }
    }
  return vdmStamp(res, g);
}

/** The stamp + its provenance as `.vdm.bin` bytes (`credit` from checkLicence). */
export function encodeVdmBin(
  s: VdmStamp,
  source: ImportCredit,
  srcSha: string,
  credit: string,
): Uint8Array {
  let range = 0;
  for (const x of s.grid) range = Math.max(range, Math.abs(x));
  const meta: VdmMeta = { source, sha256: srcSha, credit, range, size: s.size };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const head = 8 + 4 + json.length;
  const pad = (4 - (head % 4)) % 4;
  const out = new Uint8Array(head + pad + s.grid.length * 2);
  out.set(new TextEncoder().encode(MAGIC), 0);
  const dv = new DataView(out.buffer);
  dv.setUint32(8, json.length, true);
  out.set(json, 12);
  s.grid.forEach((x, k) => {
    dv.setInt16(head + pad + k * 2, Math.round((x / (range || 1)) * 32767), true);
  });
  return out;
}

/** `.vdm.bin` bytes → the stamp (re-checked) and its provenance; refuses a non-commercial one. */
export function decodeVdmBin(bytes: Uint8Array): { stamp: VdmStamp; meta: VdmMeta } {
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC)
    bad('not a .vdm.bin (bad magic)', 'make it with bun scripts/vdm-import.ts');
  if (bytes.length < 12) bad('truncated .vdm.bin', 're-run the import');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = dv.getUint32(8, true);
  if (12 + len > bytes.length) bad('truncated .vdm.bin', 're-run the import');
  let meta: VdmMeta;
  try {
    meta = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + len))) as VdmMeta;
  } catch (e) {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `vdm import: .vdm.bin meta is not JSON (${String(e)})`,
      fix: 're-run the import',
    });
  }
  checkLicence(meta.source);
  const head = 12 + len;
  const at = head + ((4 - (head % 4)) % 4);
  const n = meta.size * meta.size * 3;
  if (bytes.length !== at + n * 2) bad('truncated .vdm.bin', 're-run the import');
  const g = new Float32Array(n);
  for (let k = 0; k < n; k++) g[k] = (dv.getInt16(at + k * 2, true) * meta.range) / 32767 + 0;
  return { stamp: vdmStamp(meta.size, g), meta };
}

const flag = (argv: readonly string[], name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

export async function main(argv: readonly string[]): Promise<number> {
  const [src, out] = argv;
  const license = flag(argv, 'license');
  const author = flag(argv, 'author');
  const url = flag(argv, 'url');
  if (!src || !out || src.startsWith('--') || !license || !author || !url) {
    console.error(
      'usage: bun scripts/vdm-import.ts <brush.png> <out.vdm.bin> --license CC0-1.0 --author A --url U [--amp 0.25] [--res 33]',
    );
    return 1;
  }
  if (/\.exr$/i.test(src))
    bad('EXR is not read', 'export the brush as a 16-bit PNG (tangent space)');
  const bytes = new Uint8Array(await Bun.file(src).arrayBuffer());
  const credit: ImportCredit = { license, author, url };
  const verdict = checkLicence(credit, argv.includes('--allow-nc'));
  if (verdict.warning) console.error(verdict.warning);
  const img = decodePng(bytes, (cause) => bad(cause, 'pass a non-interlaced 8/16-bit RGB(A) PNG'));
  const stamp = mapToStamp(img, Number(flag(argv, 'amp') ?? 0.25), Number(flag(argv, 'res') ?? 33));
  const bin = encodeVdmBin(stamp, credit, sha256(bytes), verdict.credit);
  await Bun.write(out, bin);
  console.log(
    `${out}  ${stamp.size}² texels, Lipschitz ${stamp.lipschitz.toFixed(2)}  ${verdict.credit}`,
  );
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
