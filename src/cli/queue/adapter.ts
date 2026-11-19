// A neural adapter whose jobs take their queue class while they run: a Blender tool adapter takes
// `blender`, a model served from this machine (http, ComfyUI, OpenAI-compatible images on a
// loopback URL) takes `gpu`; hosted services, mocks and other tools take nothing. Only `run` is
// wrapped, so a cached job never waits.

import type { NeuralAdapter } from '../../neural/index.ts';
import { type QueueOptions, withQueue } from './acquire.ts';
import { classOfAdapter } from './needs.ts';

export function queuedAdapter(adapter: NeuralAdapter, o: QueueOptions = {}): NeuralAdapter {
  const cls = classOfAdapter(adapter.id);
  if (cls === undefined) return adapter;
  return { ...adapter, run: (job) => withQueue(cls, 1, () => adapter.run(job), o) };
}
