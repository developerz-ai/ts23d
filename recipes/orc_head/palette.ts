// Orc bust palette (linear RGB from sRGB hex): skin with its warm/cool/flush variations, bone,
// eyes, war paint, iron, leather, fur, plinth. One table so the dossier and the code agree.

import { hex } from '@developerz.ai/ts23d';

export const C = {
  skin: hex('#62803a'),
  /** Warm, sunlit tops (crown, brow, cheekbone, shoulders). */
  skinWarm: hex('#80913f'),
  /** Cool undersides (under the jaw, chest shadow). */
  skinCool: hex('#3f5c3a'),
  /** Flush: blood near the surface (ears, nose, lips, knuckles of the face). */
  flush: hex('#7a7038'),
  lips: hex('#5a5a30'),
  /** Thin ear cartilage: warmer, lighter (light through it). */
  earGlow: hex('#8c8c40'),
  /** Crevice colour: deep, saturated olive. */
  cavity: hex('#24341a'),
  scar: hex('#a08a64'),
  scarDeep: hex('#6e5a40'),
  vein: hex('#4b6a44'),
  bone: hex('#e4d8b4'),
  boneDark: hex('#b8a06a'),
  gum: hex('#5a3a2a'),
  sclera: hex('#6a3a12'),
  iris: hex('#ffb428'),
  pupil: hex('#1a0c04'),
  wet: hex('#a8b070'),
  caruncle: hex('#8a5038'),
  mouth: hex('#2a1210'),
  paint: hex('#7d1a12'),
  hair: hex('#1e1712'),
  hairRoot: hex('#2a2018'),
  hairTip: hex('#6e5842'),
  hairBand: hex('#5b3a22'),
  /** Plate paint over the iron strip (dark, sooty), and the bare worn rims. */
  plate: hex('#4a4842'),
  plateRim: hex('#6a665e'),
  rivet: hex('#b0a898'),
  bareIron: hex('#d8d4cc'),
  rust: hex('#7a4422'),
  leather: hex('#8a6448'),
  /** Over the leather strip (which carries its own brown): a light tint. */
  strap: hex('#e6d2b8'),
  cord: hex('#3a2618'),
  thread: hex('#c8b48a'),
  cordBead: hex('#6a4a2a'),
  fur: hex('#5c4632'),
  furTip: hex('#8c7556'),
  plinth: hex('#3a3634'),
  plinthTop: hex('#55504b'),
};
