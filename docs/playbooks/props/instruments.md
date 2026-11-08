# Musical instruments playbook

Guitars (acoustic, classical, electric, bass), violin family, upright and grand pianos, drum kits,
brass (trumpet, trombone, tuba), woodwind (flute, clarinet, saxophone), folk instruments. Original
headstock shapes and no maker logos — guitar body and headstock outlines are trademarked.
**Scale from the scale length and the keyboard**: string scale lengths and the piano octave
(≈ 164–165 mm for 7 white keys) are standardised and instantly readable.

## Research
Luthier references and plans (scale length, nut width, body dimensions), piano maker specs
(key dimensions, case sizes), drum size conventions (diameter × depth in inches), brass bore and
bell sizes. Photos: front, side (body depth, neck angle), back, headstock, bridge and tailpiece,
hardware close-ups (tuners, frets, valves, keys).

| Item | Key dimensions (typical) | Notes |
|---|---|---|
| steel-string acoustic | scale 0.645–0.65 m (25.4–25.6 in), body 0.5 × 0.4 × 0.1–0.125 m, overall 1.0–1.04 | |
| classical guitar | scale 0.65 m, nut 52 mm, body depth 0.09–0.1 | |
| solid-body electric | scale 0.628 or 0.648 m (24.75 / 25.5 in), body 0.33 × 0.45 × 0.045 m | |
| bass guitar | scale 0.864 m (34 in), overall ~1.17 m | |
| frets | 19–24; position n: d = L × (1 − 2^(−n/12)) | equal temperament |
| violin | body 0.356 m, overall 0.59–0.6, string length 0.328 | |
| cello | body 0.75–0.76 m, overall ~1.24 | |
| piano white key | 23.5 mm wide, ~150 mm visible length; black key 13–14 mm wide, 95 mm long, 12 mm proud | |
| 88-key keyboard width | ≈ 1.22 m (52 white keys) | |
| upright piano | 1.45–1.55 wide × 0.55–0.65 deep × 1.1–1.35 tall; keyboard top 0.72–0.74 m | |
| grand piano | 1.5 m wide; length 1.5 (baby) to 2.75 (concert) | |
| drum kit | kick 20–22 × 14–18 in; snare 14 × 5–6.5 in; toms 10–16 in; cymbals 14–22 in | |
| trumpet | 0.48 m long, bell Ø 120–125 mm, 3 piston valves | |
| saxophone (alto) | 0.6–0.7 m tall, bell Ø 120 mm | |

## Part tree
```
guitar: body (top, sides, back), neck, fretboard → fret_<i>, nut, headstock → tuner_<i> (spin), bridge,
        saddle, string_<i> (thin beams), pickup_* / soundhole, strap_button_* · socket attach (strap, hands)
violin: body, neck, scroll, fingerboard, bridge, tailpiece, peg_* (spin), f_holes (cut), bow (separate)
piano: case, lid (sway Y at the hinge, 0–45° grand / top lid upright), fallboard (sway Y),
       key_white_<i> / key_black_<i> (sway Y at the back pivot, 2–3°), pedal_<i> (sway Y), bench
drums: kick, snare, tom_<i>, floor_tom, hihat_top (slide Z), cymbal_<i> (sway: wobble), stand_*, throne
trumpet: leadpipe + bell (sweep), valve_<i> (slide −Z ~15 mm), slide_* (slide), mouthpiece
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| piano keys | sway | Y at the key pivot | 2–3° (≈ 10 mm at the front) |
| piano lid | sway `oneWay` | Y at hinge | 30–45° (grand) |
| pedals | sway | Y | 5–8° |
| hi-hat top | slide | Z | 0–25 mm |
| cymbals | sway | X / Y | ±5–10° after a hit |
| valves | slide | −Z | 12–18 mm |
| tuners / pegs | spin | own axis | |
| trombone slide | slide | X | 0–0.6 m (7 positions) |

## Signature details
1. Frets spaced by the equal-temperament rule — closer toward the body; fret markers at 3, 5, 7, 9, 12.
2. Strings: real gauges (0.25–1.3 mm) converging from bridge to nut to tuners; break angle at the nut.
3. Acoustic: soundhole rosette, binding around the body edges, bridge pins, bracing visible inside.
4. Violin: arched top, f-holes, scroll, purfling inset line, bridge standing (not glued).
5. Piano: key groups of 2 and 3 black keys; hammers and strings under a grand's lid; music desk.
6. Drums: lugs and tension rods, hoops, heads (white coated or clear), shells with wraps.
7. Brass: tubing wraps in correct order, water key, finger buttons, slightly tarnished lacquer.

## Materials
`oak` / `pine` / `wood_painted` (spruce tops: `pine`; mahogany/rosewood: `oak` tinted dark),
`wood_painted` gloss black (pianos: high gloss via a custom material), `brass` (horns, cymbals),
`chrome` / `steel_galvanised` (hardware, strings, frets), `plastic` (pickguards, keys, drum
heads), `leather` (straps), `canvas` (drum heads coated). Grime: wear through finish where the
arm rests, fingerboard darkening, tarnish on brass handling points.

## LOD policy
- LOD0: every fret, string, tuner, key, lug; soundhole rosette; violin purfling. Guitar 4–12k,
  piano 15–40k, drum kit 20–50k.
- LOD1: strings dropped or merged to a card, keys as groups, lugs simplified. 1–4k.
- LOD2: silhouette. 50–300.
Strings under 1 mm cannot be geometry beyond LOD0 — drop or card them.

## QA
```ts
real: { length: 1.03, width: 0.39, height: 0.12, measures: [
  { label: 'scale length', axis: 'x', value: 0.648, between: ['nut', 'saddle'], source: '25.5 in scale' },
  { label: 'body length', axis: 'x', value: 0.5, parts: ['body'] },
]},
checks: [touches('neck', 'body'), touches('bridge', 'body'), noOverlap('fret_*')],
```
For a piano: `{ label: 'octave span', value: 0.1645, between: ['key_white_0', 'key_white_7'] }`.

## Common mistakes
- Evenly spaced frets; strings parallel instead of converging.
- Piano black keys evenly spaced (they come in 2s and 3s) or keys too wide (> 25 mm).
- Copied headstock outline or brand logo.
- Drums as plain cylinders without hoops and lugs.

## Reuse
`sweep` (brass tubing, strings), `lathe` / `latheSvg` (drum shells, bells, pegs), `extrudeSvg`
(guitar body outlines from an original drawing; f-holes as holes), `hinge` (piano lid),
`hex_bolt` (tension rods, scaled), `text` (invented maker marks).

## Sources
- Scale length and fret placement: https://en.wikipedia.org/wiki/Scale_length_(string_instruments) · https://en.wikipedia.org/wiki/Fret
- Piano key dimensions: https://en.wikipedia.org/wiki/Musical_keyboard#Size_and_historical_variation
- Violin family sizes: https://en.wikipedia.org/wiki/Violin
- Drum kit sizes: https://en.wikipedia.org/wiki/Drum_kit
