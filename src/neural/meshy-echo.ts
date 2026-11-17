// Telling whether a listed Meshy task is the task of a request whose create got no reply
// (meshy-task.ts): a task is adopted only when what it echoes names this request and nothing it
// echoes disagrees. Uploads are echoed as stored URLs, never as the data URI that was sent.

export type MeshyTask = Readonly<Record<string, unknown>>;

/**
 * Why `task` cannot be the task of `body`: the first request field the task echoes with another
 * value (Meshy echoes some: prompt, ai_model, pose_mode, height_meters…), or undefined when
 * nothing it echoes disagrees.
 */
export function echoMismatch(task: MeshyTask | undefined, body: object): string | undefined {
  if (!task) return undefined;
  for (const [k, want] of Object.entries(body)) {
    const got = task[k];
    if (got === undefined || got === null || typeof got === 'object') continue;
    if (typeof want === 'object' || want === undefined) continue;
    // Uploads are echoed as stored URLs, never as the data URI that was sent.
    if (typeof want === 'string' && want.startsWith('data:')) continue;
    if (String(got) !== String(want)) return `${k} is ${String(got).slice(0, 40)}`;
  }
  return undefined;
}

/** Request fields that name one request, when a task echoes them. */
const IDENTITY = [
  'prompt',
  'text_style_prompt',
  'input_task_id',
  'preview_task_id',
  'rig_task_id',
  'model_url',
  'image_url',
] as const;

/** `task` echoes at least one identity field of `body` with the same value (never an upload). */
export function echoIdentity(task: MeshyTask | undefined, body: object): boolean {
  const b = body as Readonly<Record<string, unknown>>;
  return IDENTITY.some((k) => {
    const want = b[k];
    if (typeof want !== 'string' || want === '' || want.startsWith('data:')) return false;
    return task?.[k] === want;
  });
}
