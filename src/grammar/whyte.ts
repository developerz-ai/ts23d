// Whyte notation ("4-4-0", "2-6-2") → wheel groups. Domain-native params: the loco kind reads it.

import { Ts23dError } from '../core/index.ts';

export interface WheelGroup {
  readonly role: 'leading' | 'driving' | 'trailing';
  readonly count: number;
}

export function parseWhyte(arrangement: string): WheelGroup[] {
  const parts = arrangement.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n % 2 !== 0)) {
    throw new Ts23dError('T3D_GRAMMAR_SYNTAX', {
      cause: `'${arrangement}' is not a rigid-frame Whyte arrangement`,
      fix: "use three even numbers: leading-driving-trailing, e.g. '4-4-0' or '2-8-2'",
    });
  }
  const roles = ['leading', 'driving', 'trailing'] as const;
  return roles.map((role, i) => ({ role, count: parts[i] ?? 0 }));
}
