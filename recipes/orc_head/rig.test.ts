import { describe, expect, it } from 'bun:test';
import { compile } from '@developerz.ai/ts23d';
import { orc_head } from './orc_head.ts';

describe('orc face rig', () => {
  const c = compile(orc_head, { lod: 1 });
  it('head and bust hang under one `face` node carrying blink / talk / breathe morphs', () => {
    const head = c.parts.find((p) => p.name === 'head');
    expect(head?.parent).toBe('face');
    expect(c.parts.find((p) => p.name === 'bust')?.parent).toBe('face');
    expect((head?.mesh?.morphs ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it('declares the head clips on that node', () => {
    expect((c.clips ?? []).length).toBeGreaterThan(0);
  });
  it('grows a beard and brows as cards in the one `hair` part', () => {
    expect(c.parts.find((p) => p.name === 'hair')?.mesh?.indices.length ?? 0).toBeGreaterThan(0);
  });
});
