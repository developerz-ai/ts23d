// Licence gate for imported meshes. A generated asset must never inherit a duty its user cannot
// meet, so only licences that allow commercial use pass by default: public domain (CC0), your own
// work, permissive (MIT, CC-BY with credit). Non-commercial / no-derivatives terms are refused
// unless the caller opts in with `allowNonCommercial`, which returns a loud warning to print.
// Unknown strings are refused: "free" is not a licence.

import { Ts23dError } from '../core/index.ts';

export interface ImportCredit {
  /** SPDX id ('CC0-1.0', 'CC-BY-4.0', 'MIT', 'CC-BY-NC-4.0'…) or 'own' (you made or scanned it). */
  readonly license: string;
  readonly author: string;
  /** Where it came from: a page URL, or a note for your own scan. */
  readonly url: string;
}

/** Licences that allow commercial use; `attribution` ones need the credit line shipped. */
const OK: Readonly<Record<string, { readonly attribution: boolean }>> = {
  own: { attribution: false },
  'CC0-1.0': { attribution: false },
  'MIT-0': { attribution: false },
  'CC-BY-3.0': { attribution: true },
  'CC-BY-4.0': { attribution: true },
  'CC-BY-SA-4.0': { attribution: true },
  MIT: { attribution: true },
  'Apache-2.0': { attribution: true },
};

const NON_COMMERCIAL = /^CC-BY(-SA)?-NC|^CC-BY-NC|-ND-|^CC-BY-ND/;

export interface LicenceVerdict {
  readonly attribution: boolean;
  /** Printed by the caller (CLI, script) — set only for non-commercial opt-ins. */
  readonly warning?: string;
  /** The credit line for the GLB's XMP `dc:contributor` / the manifest. */
  readonly credit: string;
}

export function checkLicence(c: ImportCredit, allowNonCommercial = false): LicenceVerdict {
  if (!c.author.trim() || !c.url.trim())
    throw new Ts23dError('T3D_IMPORT_LICENSE', {
      cause: `import declares licence '${c.license}' without an author or a source url`,
      fix: "give `author` and `url` (for your own scan: author = you, url = a note like 'own scan 2026-11')",
    });
  const credit = `${c.author} — ${c.license} — ${c.url}`;
  const ok = OK[c.license];
  if (ok) return { attribution: ok.attribution, credit };
  if (NON_COMMERCIAL.test(c.license)) {
    if (!allowNonCommercial)
      throw new Ts23dError('T3D_IMPORT_LICENSE', {
        cause: `'${c.license}' forbids commercial use or derivatives; a generated asset would inherit that`,
        fix: 'use a CC0 / CC-BY / own source (MakeHuman/MPFB assets are CC0), or pass `allowNonCommercial: true` for a private test only',
      });
    return {
      attribution: true,
      credit: `${credit} — NON-COMMERCIAL`,
      warning: `WARNING: '${c.license}' import (${c.url}): this asset may NOT be sold or shipped in a commercial product`,
    };
  }
  throw new Ts23dError('T3D_IMPORT_LICENSE', {
    cause: `unknown licence '${c.license}'`,
    fix: `declare an SPDX id: one of ${Object.keys(OK).join(', ')} (or a CC-BY-NC-* id with allowNonCommercial)`,
  });
}
