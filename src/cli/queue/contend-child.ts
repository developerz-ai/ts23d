// Test fixture: one real process that takes the blender class (capacity 1) from the queue in
// <home>. `work <log> <id>` appends `start <id>`, works a moment, appends `end <id>` and exits;
// `hold` prints `held` and keeps the class until it is killed. contend.test.ts runs several.

import { appendFileSync } from 'node:fs';
import { acquire, withQueue } from './acquire.ts';

const [home = '', mode = '', log = '', id = ''] = process.argv.slice(2);
const options = { env: { TS23D_HOME: home, T3D_QUEUE: 'wait' }, log: () => {} };

if (mode === 'hold') {
  await acquire('blender', 1, options);
  console.log('held');
  setInterval(() => {}, 1000);
} else
  await withQueue(
    'blender',
    1,
    async () => {
      appendFileSync(log, `start ${id}\n`);
      await Bun.sleep(15);
      appendFileSync(log, `end ${id}\n`);
    },
    options,
  );
