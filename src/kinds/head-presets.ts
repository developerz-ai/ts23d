// Race presets for the head kind: plain `HeadParams` data in head units (1 = chin to crown) —
// spread one and override (`{ ...orc, tusks: null }` is a tuskless orc). Original stylised designs
// in the chunky hand-painted fantasy idiom, not copies of any game's characters. Proportions and
// palettes are documented per recipe in recipes/<race>_head/README.md.

import { hex } from '../material/index.ts';
import type { HeadParams } from './head-params.ts';

/** Classical proportions, slightly heroic: eye line at half height, thirds brow/nose/chin. */
export const human: HeadParams = {
  height: 0.23,
  cranium: { width: 0.66, depth: 0.86, height: 0.5 },
  brow: { ridge: 0.035, overhang: 0.03, scowl: 0.012, hair: 0.018 },
  cheeks: { size: 1, width: 1 },
  jaw: { muzzle: 0, width: 0.22, chin: 1.05, underbite: 0, drop: 0 },
  nose: { length: 0.18, width: 0.06, tip: 0.036, hook: 0, bridge: 0 },
  ears: { shape: 'round', length: 0.27, width: 0.15, sweep: 12, lift: 0 },
  eyes: { radius: 0.052, spacing: 0.135, line: 0.5, lid: 20, lowerLid: 30 },
  mouth: { width: 0.1, lips: 0.018, grin: 0 },
  tusks: null,
  neck: { radius: 0.27 },
  bust: { shoulders: 0.95, style: 'tunic' },
  hair: 'swept',
  beard: 'short',
  warts: 0,
  colors: {
    skin: hex('#d9a07a'),
    shade: hex('#a8644a'),
    lips: hex('#b86b5c'),
    sclera: hex('#ece6dc'),
    iris: hex('#3d6e9e'),
    pupil: hex('#141414'),
    teeth: hex('#ece2c8'),
    mouth: hex('#4a1a18'),
    hair: hex('#5a3a22'),
    cloth: hex('#2e4f8a'),
    cape: hex('#7a2420'),
    leather: hex('#6b4428'),
    metal: hex('#c9a24a'),
  },
};

/** Massive underbitten jaw, tusks, heavy brow over small deep eyes, flat broad nose, thick neck. */
export const orc: HeadParams = {
  height: 0.3,
  cranium: { width: 0.7, depth: 0.8, height: 0.34 },
  brow: { ridge: 0.065, overhang: 0.075, scowl: 0.035 },
  cheeks: { size: 1.35, width: 1.15 },
  jaw: { muzzle: 0.1, width: 0.37, chin: 1.6, underbite: 0.07, drop: 0.1 },
  nose: { length: 0.15, width: 0.09, tip: 0.04, hook: -0.01, bridge: -0.045 },
  ears: { shape: 'pointed', length: 0.3, width: 0.17, sweep: 25, lift: 8 },
  eyes: { radius: 0.05, spacing: 0.155, line: 0.56, lid: 16, lowerLid: 26 },
  mouth: { width: 0.17, lips: 0.03, grin: 0 },
  tusks: { length: 0.27, radius: 0.05, spread: 0.14, flare: 0.35 },
  neck: { radius: 0.32 },
  bust: { shoulders: 1.05, style: 'pauldrons' },
  hair: 'topknot',
  beard: 'none',
  warts: 6,
  colors: {
    skin: hex('#5f8b3a'),
    shade: hex('#3c5c24'),
    lips: hex('#4f6f30'),
    sclera: hex('#8a5a1a'),
    iris: hex('#ffb030'),
    pupil: hex('#140a06'),
    teeth: hex('#e2d6b0'),
    mouth: hex('#2a0e0c'),
    hair: hex('#1c1714'),
    cloth: hex('#6b2a20'),
    leather: hex('#5a3a22'),
    metal: hex('#6e6a62'),
    fur: hex('#5e4a34'),
    paint: hex('#8a1c12'),
  },
};

/** Small and sly: huge leaf ears, long hooked nose, wide toothy grin, big bright eyes. */
export const goblin: HeadParams = {
  height: 0.19,
  cranium: { width: 0.66, depth: 0.84, height: 0.5 },
  brow: { ridge: 0.03, overhang: 0.015, scowl: 0.025 },
  cheeks: { size: 1.15, width: 1.1 },
  jaw: { muzzle: 0.06, width: 0.2, chin: 0.85, underbite: 0, drop: 0 },
  nose: { length: 0.2, width: 0.07, tip: 0.05, hook: 0.07, bridge: 0.12 },
  ears: { shape: 'pointed', length: 0.62, width: 0.3, sweep: 22, lift: 18 },
  eyes: { radius: 0.072, spacing: 0.15, line: 0.5, lid: 16, lowerLid: 26 },
  mouth: { width: 0.2, lips: 0.016, grin: 0.75 },
  tusks: null,
  neck: { radius: 0.2 },
  bust: { shoulders: 0.75, style: 'hood' },
  hair: 'tufts',
  beard: 'none',
  warts: 4,
  colors: {
    skin: hex('#9cb84a'),
    shade: hex('#6a8a2c'),
    lips: hex('#7a8e36'),
    sclera: hex('#f0e6a0'),
    iris: hex('#e0a020'),
    pupil: hex('#120c04'),
    teeth: hex('#e8dcae'),
    mouth: hex('#3a1010'),
    hair: hex('#3a3024'),
    cloth: hex('#6a4a7a'),
    leather: hex('#5a3a22'),
    metal: hex('#a88a4a'),
  },
};

/** Broad and bearded: wide skull, big bulbous nose, braided beard, deep-set eyes. */
export const dwarf: HeadParams = {
  ...human,
  height: 0.24,
  cranium: { width: 0.74, depth: 0.86, height: 0.48 },
  brow: { ridge: 0.05, overhang: 0.05, scowl: 0.02, hair: 0.024 },
  cheeks: { size: 1.25, width: 1.1 },
  jaw: { muzzle: 0.02, width: 0.27, chin: 1.2, underbite: 0, drop: 0.02 },
  nose: { length: 0.2, width: 0.08, tip: 0.06, hook: 0.02, bridge: 0.02 },
  eyes: { radius: 0.045, spacing: 0.14, line: 0.52, lid: 10, lowerLid: 24 },
  neck: { radius: 0.34 },
  bust: { shoulders: 1.1, style: 'tunic' },
  hair: 'braids',
  beard: 'braided',
  colors: { ...human.colors, skin: hex('#d49470'), hair: hex('#8a3f1c'), cloth: hex('#4a5a2a') },
};

/** Slender and ageless: long swept-back ears, high cheekbones, fine nose, almond eyes. */
export const elf: HeadParams = {
  ...human,
  height: 0.235,
  cranium: { width: 0.62, depth: 0.86, height: 0.52 },
  brow: { ridge: 0.025, overhang: 0.02, scowl: -0.01, hair: 0.012 },
  cheeks: { size: 1.1, width: 1.05 },
  jaw: { muzzle: 0, width: 0.19, chin: 0.85, underbite: 0, drop: 0 },
  nose: { length: 0.18, width: 0.045, tip: 0.028, hook: 0, bridge: 0.01 },
  ears: { shape: 'pointed', length: 0.42, width: 0.16, sweep: 40, lift: 24 },
  eyes: { radius: 0.05, spacing: 0.13, line: 0.5, lid: 14, lowerLid: 22 },
  bust: { shoulders: 0.85, style: 'tunic' },
  hair: 'swept',
  beard: 'none',
  colors: {
    ...human.colors,
    skin: hex('#e8c0a0'),
    hair: hex('#e0d090'),
    iris: hex('#3a8a5a'),
    cloth: hex('#2a6a4a'),
  },
};

export const HEADS = { human, orc, goblin, dwarf, elf } as const;
export type HeadPreset = keyof typeof HEADS;
