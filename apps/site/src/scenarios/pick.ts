// Choose a scenario from what the asset exposes: its kind and its named nodes, never its name.

import type { Hooks } from './hooks.ts';
import { landmark } from './landmark.ts';
import { locomotive } from './locomotive.ts';
import { tracked } from './tracked.ts';
import { tree } from './tree.ts';
import { turntable } from './turntable.ts';
import type { ScenarioDef } from './types.ts';

/** Most specific first; the turntable always matches. */
const SCENARIOS: readonly ScenarioDef[] = [tracked, locomotive, tree, landmark, turntable];

export const pickScenario = (h: Hooks): ScenarioDef =>
  SCENARIOS.find((s) => s.matches(h)) ?? turntable;
