// Which command line takes which queue class, and the queue flags.

import { expect, test } from 'bun:test';
import { classOfAdapter, needOf, stripQueueFlags } from './needs.ts';

test('--max-wait without a number of seconds above 0 is a usage error', () => {
  for (const argv of [
    ['build', '--max-wait'],
    ['build', '--max-wait', 'x'],
    ['build', '--max-wait', '0'],
  ])
    expect(() => stripQueueFlags(argv)).toThrow('T3D_CLI_USAGE');
});

test('queue flags leave the line; what follows `--` belongs to the queued command', () => {
  expect(stripQueueFlags(['build', 'a.ts', '--no-wait', '--max-wait', '90', '--json'])).toEqual({
    rest: ['build', 'a.ts', '--json'],
    noWait: true,
    maxWaitSeconds: 90,
  });
  expect(stripQueueFlags(['queue', 'run', '--', 't3d', 'build', '--no-wait'])).toEqual({
    rest: ['queue', 'run', '--', 't3d', 'build', '--no-wait'],
    noWait: false,
  });
});

const CASES: readonly (readonly [string, string | undefined])[] = [
  ['build a.ts', 'cpu 1'],
  ['shot a.ts', 'cpu 1'],
  ['hero a.ts', 'cpu 1'],
  ['hero a.ts --quality raster', 'cpu 1'],
  ['hero a.ts --quality path --spp 16', 'cpu 8'],
  ['review a.ts', 'cpu 1'],
  ['critique a.ts', 'cpu 1'],
  ['blueprint a.ts', 'cpu 1'],
  ['icon a.ts', 'cpu 1'],
  ['gaps a.ts', 'cpu 1'],
  ['tune a.ts', 'cpu 1'],
  ['concept a.ts', 'cpu 1'],
  ['finish a.ts', 'cpu 1'],
  ['finish a.ts --model http --endpoint http://127.0.0.1:8188/x', 'gpu 1'],
  ['finish a.ts --model http --endpoint https://models.example.com/x', 'cpu 1'],
  ['neural run a.ts', 'cpu 1'],
  ['neural ls', undefined],
  ['blender review a.ts --out r', 'blender 1'],
  ['blender session start --mesh a.glb', 'blender 1'],
  ['blender session run batch.json', 'blender 1'],
  ['blender session finish --out p.json', 'blender 1'],
  ['blender session status', undefined],
  ['blender session undo', undefined],
  ['blender session stop', undefined],
  ['build a.ts --watch', undefined],
  ['build --help', undefined],
  ['list recipes', undefined],
  ['doctor', undefined],
  ['setup tools', undefined],
  ['init', undefined],
  ['plan check', undefined],
  ['server start', undefined],
  ['mcp', undefined],
  ['queue status', undefined],
  ['help', undefined],
  ['', undefined],
];

for (const [line, want] of CASES)
  test(`t3d ${line || '(nothing)'} takes ${want ?? 'nothing'}`, () => {
    const need = needOf(line === '' ? [] : line.split(' '), 8);
    expect(need && `${need.cls} ${need.weight}`).toBe(want);
  });

test('adapter jobs: Blender takes blender, a model on this machine takes gpu, the rest nothing', () => {
  expect(classOfAdapter('blender:bpy')).toBe('blender');
  expect(classOfAdapter('http:http://127.0.0.1:8190')).toBe('gpu');
  expect(classOfAdapter('comfy:http://localhost:8188')).toBe('gpu');
  expect(classOfAdapter('openai-image:http://[::1]:1234/v1')).toBe('gpu');
  expect(classOfAdapter('http:https://gpu.example.com')).toBeUndefined();
  for (const id of ['mock', 'mock-image', 'meshy', 'kubeez', 'godot'])
    expect(classOfAdapter(id)).toBeUndefined();
});
