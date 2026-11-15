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
});
