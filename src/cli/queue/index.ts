// The machine-wide resource queue (ADR 017): several coding agents on one machine take turns at
// the CPU (weighted tokens), Blender (one at a time) and the GPU (one at a time). Ticket files
// under $TS23D_HOME/queue/<class>/, strict FIFO, no daemon. This barrel is what the rest of the
// CLI and the repo's scripts import.

export { acquire, type Grant, type QueueOptions, withQueue } from './acquire.ts';
export { queuedAdapter } from './adapter.ts';
export { queueMain } from './cmd.ts';
export {
  CLASSES,
  loadConfig,
  type QueueClass,
  type QueueConfig,
  type QueueMode,
} from './config.ts';
export { queueChecks } from './doctor.ts';
export { grantedCpu } from './held.ts';
export { classOfAdapter, needOf } from './needs.ts';
export { type QueueStatus, queueStatus } from './status.ts';
export { queued } from './wrap.ts';
