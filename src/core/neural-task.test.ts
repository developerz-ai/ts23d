import { describe, expect, it } from 'bun:test';
import {
  checkNeuralInput,
  checkNeuralResult,
  isNeuralTask,
  NEURAL_MIMES,
  NEURAL_TASKS,
} from './neural-task.ts';

const png = { bytes: new Uint8Array([137, 80, 78, 71]), mime: 'image/png' };

describe('checkNeuralResult', () => {
  it('refuses a mime the task does not allow', () => {
    expect(() => checkNeuralResult('mesh', { outputs: [png] })).toThrow(
      /T3D_NEURAL_OUTPUT_INVALID: mesh: output 0 is 'image\/png'/,
    );
  });

  it('refuses no outputs and empty bytes', () => {
    expect(() => checkNeuralResult('image', { outputs: [] })).toThrow('T3D_NEURAL_OUTPUT_INVALID');
    const empty = { bytes: new Uint8Array(0), mime: 'image/png' };
    expect(() => checkNeuralResult('image', { outputs: [empty] })).toThrow(/is empty/);
  });

  it('refuses a score outside 0..10', () => {
    expect(() => checkNeuralResult('score', { outputs: [], score: 11 })).toThrow(/outside 0..10/);
  });

  it('accepts a valid result', () => {
    const r = { outputs: [png] };
    expect(checkNeuralResult('texture', r)).toBe(r);
    expect(checkNeuralResult('score', { outputs: [], score: 7.5 }).score).toBe(7.5);
  });
});

describe('checkNeuralInput', () => {
  it('refuses an input not named by sha256', () => {
    expect(() => checkNeuralInput('mesh', { sha256: 'abc', mime: 'image/png' })).toThrow(
      'T3D_RECIPE_INVALID',
    );
  });

  it('accepts a lowercase hex sha256', () => {
    const input = { sha256: 'a'.repeat(64), mime: 'image/png' };
    expect(checkNeuralInput('mesh', input)).toBe(input);
  });
});

describe('tasks', () => {
  it('names every task once, each with allowed mimes', () => {
    expect(new Set(NEURAL_TASKS).size).toBe(NEURAL_TASKS.length);
    for (const t of NEURAL_TASKS) expect(NEURAL_MIMES[t].length).toBeGreaterThan(0);
    expect(isNeuralTask('rig')).toBe(true);
    expect(isNeuralTask('video')).toBe(false);
  });

  it('tool tasks: a drape is a GLB, a KTX2 is image/ktx2, an engine check is JSON', () => {
    const json = { bytes: new Uint8Array([123, 125]), mime: 'application/json' };
    const ktx2 = { bytes: new Uint8Array([171]), mime: 'image/ktx2' };
    expect(() => checkNeuralResult('cloth', { outputs: [json] })).toThrow(/'application\/json'/);
    expect(() => checkNeuralResult('ktx2', { outputs: [png] })).toThrow(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
    expect(checkNeuralResult('ktx2', { outputs: [ktx2] }).outputs).toHaveLength(1);
    expect(checkNeuralResult('engine-check', { outputs: [json] }).outputs).toHaveLength(1);
    for (const t of ['cloth', 'fracture', 'engine-check', 'ktx2', 'meshopt', 'groom'])
      expect(isNeuralTask(t)).toBe(true);
    // A groom returns cards (GLB) and may add a stats JSON; never a picture.
    expect(() => checkNeuralResult('groom', { outputs: [png] })).toThrow(/'image\/png'/);
    expect(checkNeuralResult('groom', { outputs: [json] }).outputs).toHaveLength(1);
  });
});
