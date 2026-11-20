# Sound demo — four things that make a noise, on one display deck

## Identity
A teaching asset for `/audio` and `KHR_audio_emitter`, not a scene: each exhibit carries a sound
synthesised from what it is made of and how big it is, written as `<clip>.wav` beside the GLB.
- **Door in its frame** — a small painted-pine panel door (`exhibits.ts`: four raised, bevelled
  fields a face, a shade lighter than the stiles, each in a dark sunk margin; LOD2 keeps them as
  shadowed quads; a brass lever, butt-hinge knuckles, bare wood where hands wear through the paint
  around the lever and along the lock edge, boot scuffs on the bottom rail) in a stained oak frame; its leaf creaks while it swings
  (`sound: { onMotion }` on the moving part, `sound.mechanism({ kind: 'creak' })`).
- **Bronze bell on a yoke** — a 300 mm bronze bell (`bronze.ts`: brown-gold metal under matte
  verdigris blotches) hung from an oak headstock with canon straps and iron gudgeons, turning on an
  axle in plummer blocks between two painted-steel posts with a cross-tie; its clapper ball hangs
  just below the lip. It swings and rings (`sound.impact({ material: 'brass', shape: 'hollow',
  size: 0.3 })`, modal synthesis; brass is the table's nearest copper alloy). Verdigris runs wash
  down from the crown and bloom along the lip.
- **Wooden crate** — a battened pine crate (`exhibits.ts`: plank faces over a dark core, lid boards,
  edge battens, nail heads, mud splashed up the lower boards; LOD2 keeps the corner battens and
  the top and bottom battens as darker quads), with a positional knock for game
  code to fire (`ctx.emitter('crate_knock', { kind: 'sound', when: 'event' })`, pine plate modes).
- **V10 engine block** — a 90° V10 long block on timber bearers with exhaust stubs and collectors,
  intake runners and plug leads, an oil pool spreading from under it across the weathered deck
  boards toward the front edge, idling in a seamless loop
  (`sound.engine({ cylinders: 10, rpm: 800, firingOrder })`, `when: 'always'` → autoPlay).

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| door clear opening (w × h) | 0.60 × 1.60 | small cupboard / shed door; the kit `panel_door` minimums |
| bell mouth diameter | 0.30 | chosen; a ship's / school bell size |
| bell lip (sound-bow) thickness | ≈ D/13 = 0.023 | Rossing, *The Science of Sound*, ch. 13 (bell profiles); https://en.wikipedia.org/wiki/Strike_tone |
| crate (L × W × H) | 0.80 × 0.60 × 0.60 | a Euro-pallet-width crate (the kit `crate` defaults) |
| V10 bore / cylinder spacing | 0.1016 / ≈ 0.114 | production 8.0 L 90° V10 (published engine data), https://en.wikipedia.org/wiki/Chrysler_LA_engine#Viper_V10 |
| V10 block length (estimate) | ≈ 0.70 | 5 × 0.114 m bore spacing + end walls; estimate, not a drawing |

## Sound specs
| Clip | Physics | Source |
|---|---|---|
| bell_strike | bell partials hum 0.5 · prime 1 · tierce 1.2 · quint 1.5 · nominal 2 …; brass E = 100 GPa, ρ = 8500 kg/m³ (bell bronze ≈ 105 GPa, 8700 kg/m³) | Rossing, *The Science of Sound*; https://www.engineeringtoolbox.com/young-modulus-d_417.html |
| crate_knock | free square plate modes (Leissa λ = 13.47, 19.6, 24.3 …), pine E ≈ 9 GPa, ρ ≈ 500 kg/m³, η ≈ 0.016 | Leissa, *Vibration of Plates* (NASA SP-160); https://www.engineeringtoolbox.com/wood-density-d_40.html |
| door_creak | stick-slip: slip rate follows the swing, each slip rings the leaf's plate modes | Akay, "Acoustics of friction", JASA 111 (2002) |
| engine_v10_idle | firing frequency rpm/60 × 10/2 = 66.7 Hz at 800 rpm; firing order 1-10-9-4-3-6-5-8-7-2; quarter-wave exhaust | https://en.wikipedia.org/wiki/Firing_order ; production V10 service data (secondary sources) |

## Parts the engine needs
`door_leaf` (sway, creak), `bell` (sway, strike), `crate` + `crate_knock` (sound emitter),
`engine` + `engine_idle` (looping sound emitter, autoplay), `oil_stain` (flat decal under the
engine).

## Budget
Budget why: a display deck of four sound exhibits (door, bell, crate, engine), not one game prop; ≈ 5.1k / 2.45k / 546 (was 5.3k / 2.9k / 1.1k).

## Open questions
- Production 8 L V10 idle speed: sources quote 650–900 rpm; 800 chosen.
- The acoustic table has no bell bronze; brass (√(E/ρ) ≈ 3430 m/s) stands in for it (≈ 3470 m/s).
