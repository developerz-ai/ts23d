// record.json beside every cached model output (ADR 014): which model (id, licence, weights hash,
// server), the request, and each output's file, mime and sha256. Written once with the outputs,
// re-checked on every read. The licence is reported (credits), never gated for users' builds; this
// repository refuses committed outputs whose licence does not allow publishing (`publishable`).
// No timestamps: the record is a function of the job, so re-running it changes no bytes.

import {
  isNeuralTask,
  NEURAL_MIMES,
  type NeuralRequest,
  type NeuralTask,
  Ts23dError,
} from '../core/index.ts';
import { canonicalJson, NEURAL_CONTRACT, type NeuralModelInfo, type NeuralRun } from './adapter.ts';
import { sha256Hex } from './sha256.ts';

export interface NeuralRecordOutput {
  /** File name inside the key directory: `output-<i>.<png|glb|json|ktx2>`. */
  readonly file: string;
  readonly mime: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface NeuralRecord {
  readonly contract: string;
  readonly key: string;
  /** The request alone (no model): how an offline build finds this entry. */
  readonly requestKey: string;
  readonly task: NeuralTask;
  readonly adapter: string;
  readonly model: NeuralModelInfo;
  readonly server?: string;
  readonly request: NeuralRequest;
  readonly outputs: readonly NeuralRecordOutput[];
  readonly score?: number;
  /** Checks overridden to make this output (`--allow-bad-input`: the input-image findings). */
  readonly overrides?: readonly string[];
}

const EXT: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'model/gltf-binary': 'glb',
  'application/json': 'json',
  'image/ktx2': 'ktx2',
};

/** Prices change; a record is a function of the job, so the cost stays out of it. */
const withoutCost = ({ cost: _cost, ...m }: NeuralModelInfo): NeuralModelInfo => m;

export const outputFile = (i: number, mime: string): string => `output-${i}.${EXT[mime] ?? 'bin'}`;

export function makeRecord<T extends NeuralTask>(o: {
  readonly key: string;
  readonly requestKey: string;
  readonly task: T;
  readonly adapter: string;
  readonly request: NeuralRequest<T>;
  readonly run: NeuralRun<T>;
}): NeuralRecord {
  const r = o.run.result;
  return {
    contract: NEURAL_CONTRACT,
    key: o.key,
    requestKey: o.requestKey,
    task: o.task,
    adapter: o.adapter,
    model: withoutCost(o.run.model),
    ...(o.run.server !== undefined ? { server: o.run.server } : {}),
    request: o.request,
    outputs: r.outputs.map((x, i) => ({
      file: outputFile(i, x.mime),
      mime: x.mime,
      sha256: sha256Hex(x.bytes),
      bytes: x.bytes.length,
    })),
    ...('score' in r ? { score: r.score } : {}),
  };
}

/** Stable bytes: canonical key order, one trailing newline. */
export const recordJson = (r: NeuralRecord): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(r)), null, 2)}\n`;

const SHA = /^[0-9a-f]{64}$/;

/** Parse and check a record.json; `where` names the file in the error. */
export function parseRecord(text: string, where: string): NeuralRecord {
  const bad = (cause: string): never => {
    throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
      cause: `${where}: ${cause}`,
      fix: 'delete that key directory and run `t3d neural run <recipe>` again',
    });
  };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return bad(`not JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  const r = (v ?? {}) as Partial<Record<keyof NeuralRecord, unknown>>;
  if (r.contract !== NEURAL_CONTRACT)
    bad(`contract is ${String(r.contract)}, want ${NEURAL_CONTRACT}`);
  if (typeof r.key !== 'string' || !SHA.test(r.key)) bad('key is not a sha256');
  if (typeof r.requestKey !== 'string' || !SHA.test(r.requestKey))
    bad('requestKey is not a sha256');
  if (!isNeuralTask(r.task)) bad(`task '${String(r.task)}' is unknown`);
  const m = r.model as Partial<NeuralModelInfo> | undefined;
  if (typeof m?.id !== 'string' || typeof m.licence !== 'string') bad('model needs id and licence');
  if (!Array.isArray(r.outputs) || r.outputs.length === 0) bad('outputs is empty');
  const task = r.task as NeuralTask;
  for (const o of r.outputs as Partial<NeuralRecordOutput>[])
    if (
      typeof o.file !== 'string' ||
      !/^output-\d+\.(png|glb|json|ktx2)$/.test(o.file) ||
      typeof o.sha256 !== 'string' ||
      !SHA.test(o.sha256) ||
      !NEURAL_MIMES[task].includes(String(o.mime))
    )
      bad(`output ${JSON.stringify(o)} is malformed`);
  return v as NeuralRecord;
}

/** Output licences this repository may commit (ADR 015 §3); users' own builds are never gated. */
const PUBLISHABLE =
  /^(CC0-1\.0|MIT-0|MIT|Apache-2\.0|BSD-[23]-Clause|CC-BY-(3|4)\.0|CC-BY-SA-4\.0|own)\b/;

/** Whether this repository may commit outputs made under `licence` (SPDX-style id). */
export const publishableLicence = (licence: string): boolean => PUBLISHABLE.test(licence.trim());

export const publishable = (r: NeuralRecord): boolean => publishableLicence(r.model.licence);
