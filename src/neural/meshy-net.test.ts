// The default Meshy pending-task store on a temp $TS23D_HOME (meshyNet's 429 handling is covered
// through the adapter in meshy-adapter.test.ts).

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filePending } from './meshy-net.ts';

describe('filePending', () => {
  test('a corrupt pending file is refused, not silently emptied', () => {
    const home = mkdtempSync(join(tmpdir(), 't3d-meshy-'));
    const p = filePending({ TS23D_HOME: home });
    p.set('k', 'id-1');
    expect([p.get('k'), p.get('x')]).toEqual(['id-1', undefined]);
    p.delete('k');
    expect(p.get('k')).toBeUndefined();
    writeFileSync(join(home, 'meshy', 'pending.json'), '[oops');
    expect(() => p.get('k')).toThrow(/pending\.json/);
  });
});
