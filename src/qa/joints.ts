// Gate: declared joints fit (QA `joints`). The measuring lives in core (`jointFit`, so the
// blueprint can colour joints too); this gate reports its issues at every LOD:
//   T3D_JOINT_MISMATCH · T3D_JOINT_GAP · T3D_JOINT_OFFSET · T3D_JOINT_BURIED (docs/architecture/errors.md)

import { jointFit } from '../core/index.ts';
import { codeOf, type Finding, type Gate } from './types.ts';

/** Every declared joint fits: matched sections, in contact, centred, not driven through. */
export const joints: Gate = (asset): Finding[] =>
  (asset.joints ?? []).flatMap((j) =>
    jointFit(asset, j).findings.map((f) => ({ ...f, code: codeOf(f.gate, f.message) })),
  );
