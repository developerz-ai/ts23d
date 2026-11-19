// Orc bust palette (linear RGB from sRGB hex): green-grey skin with its warm/cool/flush zones,
// tusk ivory and root stain, scars, warts, eyes, iron, leather, fur, plinth. One table so the
// dossier and the code agree.

import { hex } from '@developerz.ai/ts23d';

export const C = {
  // Weathered olive-grey hide (a saturated mid-green read as a toy, a painted human).
  skin: hex('#5a6c44'),
  /** Warm, sunlit tops (crown, brow, cheekbone, shoulders). */
  skinWarm: hex('#7a8049'),
  /** Cool undersides (under the jaw, chest shadow). */
  skinCool: hex('#3f4b40'),
  /** Flush: blood near the surface (ears, nose, lips, knuckles of the face). */
  flush: hex('#86784a'),
  lips: hex('#5a4e36'),
  /** Thin ear cartilage: warmer, lighter (light through it). */
  earGlow: hex('#8a8650'),
  /** Crevice colour: deep, saturated olive. */
  cavity: hex('#222a1a'),
  scar: hex('#b49e80'),
  vein: hex('#4b6a44'),
  bone: hex('#e4d8b4'),
  /** Tusk root stain where it leaves the gum. */
  tuskRoot: hex('#7a5a2e'),
  wart: hex('#5e6a40'),
  /** Eye sockets: cooler, darker round the lids. */
  socket: hex('#4a5038'),
  /** The brow band over the shelf: darker, browner. */
  brow: hex('#3e4630'),
  sclera: hex('#6a3a12'),
  iris: hex('#ffb428'),
  pupil: hex('#1a0c04'),
  wet: hex('#a8b070'),
  caruncle: hex('#8a5038'),
  mouth: hex('#2a1210'),
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
  /** The strap's grime: the same tint darkened (sweat, grease, soot). */
  strapGrime: hex('#6e5a48'),
  cord: hex('#3a2618'),
  thread: hex('#c8b48a'),
  cordBead: hex('#6a4a2a'),
  fur: hex('#5c4632'),
  furTip: hex('#8c7556'),
  plinth: hex('#3a3634'),
  plinthTop: hex('#55504b'),
};
