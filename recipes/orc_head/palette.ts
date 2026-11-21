// Orc bust palette (linear RGB from sRGB hex): green-grey skin with its warm/cool/flush zones,
// tusk ivory and root stain, scars, warts, eyes, iron, leather, fur, plinth. One table so the
// dossier and the code agree.

import { hex, type StripId } from '@developerz.ai/ts23d';

/** The plates' strip: dark pitted iron, a metal (paint over steel read as grey plastic, D547). */
export const PLATE_STRIP: StripId = 'aluminium';
/** Rivets, bosses and the buckle: brighter worn steel. */
export const FITTING_STRIP: StripId = 'aluminium';

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
  /** Tusk ivory: old, yellowed (not the spikes' bleached bone), paler at the worn tip. */
  tusk: hex('#c9ab6c'),
  tuskTip: hex('#ddc99a'),
  /** Tusk stain at the gum line: brown-black where it leaves the lip. */
  tuskRoot: hex('#3e2810'),
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
  /** Forged plate: a dark steel tint over the `aluminium` metal strip (`PLATE_STRIP`). */
  plate: hex('#5c5955'),
  /** The wire every plate edge is rolled over, on the fitting strip: rubbed, brighter steel. */
  plateRim: hex('#8a857c'),
  /** What wear shows: bright iron (the strip's albedo, untinted). */
  bareIron: hex('#b5b0a6'),
  /** Rivet heads, the boss and the buckle, on the fitting strip (worn bright steel). */
  rivet: hex('#7a756c'),
  boss: hex('#5e5a53'),
  /** A spike's iron collar (on the bone's plain strip: the dark iron itself). */
  collar: hex('#3d3b37'),
  /** Rust as a tint over the plate strip, and the soot and old grease in its hollows. */
  rust: hex('#573019'),
  soot: hex('#2b2927'),
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
