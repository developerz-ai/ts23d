// The home showcase's retry rule after a compile that failed: try the next featured asset after a
// short pause, and stop once every one of them has failed in a row (never a spinning loop).

/** Pause before the next attempt, in milliseconds. */
export const RETRY_MS = 1500;

/**
 * Delay before the next attempt after `failures` failed compiles in a row among `total` featured
 * assets, or null when a whole cycle has failed and the showcase should give up.
 */
export const retryAfter = (failures: number, total: number): number | null =>
  total > 0 && failures < total ? RETRY_MS : null;
