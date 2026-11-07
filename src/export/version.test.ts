import { describe, expect, it } from 'bun:test';
import pkg from '../../package.json' with { type: 'json' };
import { GENERATOR, VERSION } from './version.ts';

describe('VERSION', () => {
  it('matches package.json (release stamps both)', () => {
    expect(VERSION).toBe(pkg.version);
    expect(GENERATOR).toBe(`@developerz.ai/ts23d ${pkg.version}`);
  });
});
