# Forklift playbook (counterbalance)

A sit-down counterbalance lift truck: load on forks in front of the front (drive) axle, balanced
by a cast counterweight behind the rear (steer) axle. Covers 1.5–5 t IC (diesel / LPG) and electric
trucks; reach trucks and pallet jacks differ (outriggers, no counterweight) and are noted at the
end. **Scale from the fork length and the 500 mm load centre**: they are what every spec sheet
states and every viewer has seen next to a pallet.

## Research
Fetch one manufacturer **VDI 2198 spec sheet** for your capacity class (every European and most
Asian sheets follow its numbered rows: 1.x identification, 2.x weights, 3.x tyres, 4.x dimensions,
5.x performance). Rows to copy into the dossier: 4.2 mast lowered height, 4.3 free lift, 4.4 lift
height, 4.5 mast extended height, 4.7 overhead-guard height, 4.8 seat height, 4.19 overall length,
4.20 length to fork face, 4.21 overall width, 4.22 fork section and length, 4.23 carriage class
(ISO 2328), 4.24 carriage width, 1.8 load distance (fork face to front axle), 1.9 wheelbase,
3.5 wheels, 3.6/3.7 track widths, 4.33/4.34 aisle width, 4.35 turning radius, tilt angles 4.2.

Photos: side elevation (mast lowered), front (mast channels, chains, carriage), rear 3/4
(counterweight, lamps, tow pin), overhead guard from above, close-up of fork heel and hooks.

| Dimension (2.5 t IC, typical, verify) | Range | Notes |
|---|---|---|
| overall length to fork face | 2.5–2.7 m | add fork length (1.07–1.22 m) for overall |
| overall width | 1.1–1.25 m | over drive tyres |
| overhead-guard height | 2.05–2.2 m | under 2.2 m so it fits containers |
| mast lowered height | 1.95–2.3 m | 3.0 m lift duplex |
| lift height | 3.0–6.0 m | duplex / triplex masts |
| free lift | 0.1–0.15 m (simplex/duplex), ~1.5 m (full free-lift triplex) | |
| wheelbase | 1.6–1.75 m | |
| load centre | 500 mm (to 2.5 t), 600 mm (3–5 t) | ISO 22915 / ANSI B56.1 rating basis |
| fork section × length | 40 × 100–122 mm × 1070–1220 mm | ISO 2330 forks; class 2 carriage 1.0–2.5 t, class 3 2.5–5 t (ISO 2328) |
| tilt forward / back | 5–6° / 8–12° | |
| front tyre (pneumatic) | 7.00-12 (Ø ≈ 0.70 m) | solid-press / superelastic same size |
| rear tyre | 6.00-9 (Ø ≈ 0.58 m) | |
| service mass | 3.5–4.5 t | counterweight ≈ 1.2–1.6 t of it |

## Part tree
```
chassis (static: frame, hood, counterweight, steps, dash)
├── axle_drive (spin Y) → axle_drive_wheel_l / _r   (front, under the mast)
├── steer_axle (group, rear, centre pivot oscillates ±5° about X)
│   ├── steer_knuckle_l (sway Z) → wheel_steer_l (spin Y)
│   └── steer_knuckle_r (sway Z) → wheel_steer_r (spin Y)
├── overhead_guard (static, 4 legs or 2 front + rear posts on counterweight)
├── seat, steering_wheel (spin about column axis), levers_*
└── mast_tilt (pivot at the mast foot on the drive axle housing; sway Y)
    ├── mast_outer (fixed channels, chain anchors, tilt cylinders attach here)
    ├── mast_inner (slide +Z)            ← duplex; triplex adds mast_middle
    │   └── lift_cylinder_rod (slide +Z, half the carriage travel)
    └── carriage (slide +Z, 2× inner stage via chains)
        ├── load_backrest
        ├── fork_l, fork_r (static on the carriage bar; hooks on the top rail)
        └── socket 'attach' at the fork heel centre
```
Tilt cylinders are separate parts `tilt_cyl_l/_r` from chassis to mast with `clearOf: ['mast_*']`.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| `mast_tilt` | sway | Y at mast foot | +6° forward, −10° back (`oneWay` per clip) |
| `mast_inner` | slide | +Z | lift height − free lift, halved per stage |
| `carriage` | slide | +Z | full lift height (chains double the inner travel) |
| `steer_knuckle_*` | sway | Z | ±80° (inner wheel); ~90° on electric 4-wheel steer |
| `axle_drive`, `wheel_steer_*` | spin | Y | |
| `steer_axle` | sway | X | ±4–6° oscillation |
| `steering_wheel` | spin | column axis | |
| forks | none; side-shift (if fitted) is slide ±0.1 m on Y | | |

Bake the duplex ratio honestly: the carriage moves twice the inner channel and the chains stay taut.

## Signature details
1. Mast channels nested (I/J sections), lift chains over sheaves at the top of the inner channel.
2. Forks: L-shaped with a tapered tip, heel radius, two hooks over the carriage top bar.
3. Load backrest: a grid above the carriage, wider than the forks' spread.
4. Overhead guard: slatted roof (bars ≤ 150 mm apart), legs bolted to the cowl and counterweight.
5. Counterweight: one rounded cast block with a tow pin slot and recessed rear lamps.
6. Small rear steer wheels, larger front drive wheels close under the mast.
7. Tilt cylinders from frame to mast, low and in front of the driver's knees.
8. Hood over the engine/battery with a seat on it; steps and grab handle on the left A-leg.
9. Amber beacon / blue spot on the guard; mirror on a leg; LPG bottle on the counterweight for gas trucks.

## Materials
`steel_painted` (body colour: industry convention is yellow, orange, red, grey or white — pick an
original livery, no maker badges), `iron_cast` for the counterweight underside and fork heels,
`steel_painted` dark grey or black for mast and guard, `chrome` for cylinder rods, `rubber` tyres
and step treads, `plastic` black for dash and seat shell, `leather` or `canvas` for the seat,
`glass` lamp lenses with `glow`. Wear: fork tips worn bright (`steel_galvanised`), scuffed
counterweight corners, oil stain under the mast.

## LOD policy
- LOD0: chains as link rows, sheaves, hydraulic hoses (`pipe` hose mode), slatted guard, steps,
  lamp lenses, fork hooks and taper, bevelled body panels. 15–30k tris.
- LOD1: chains as flat strips, guard bars merged, cylinders 8 segments. 4–8k.
- LOD2: body, counterweight, 4 wheels, mast as two boxes, forks, guard as a frame. 400–800.

## QA
```ts
real: { length: 3.75, width: 1.17, height: 2.15, measures: [
  { label: 'fork length', axis: 'x', value: 1.07, parts: ['fork_l'], source: 'VDI 2198 row 4.22' },
  { label: 'wheelbase', axis: 'x', value: 1.65, between: ['axle_drive', 'steer_axle'] },
  { label: 'overhead guard height', axis: 'z', value: 2.12, parts: ['overhead_guard'] },
  { label: 'drive tyre diameter', axis: 'z', value: 0.70, parts: ['axle_drive_wheel_l'] },
]},
checks: [touches('fork_*', 'carriage'), clear('carriage', 'mast_*', 0.005),
         symmetric('_l', '_r', 'y'), touches('overhead_guard', 'chassis')],
gaps: [{ parts: ['mast_inner', 'mast_outer'], why: 'running clearance between mast channels' }],
```
`real.length` is overall including forks; the proportions gate uses the lowered mast.

## Common mistakes
- Forks floating in front of the carriage, or no hooks — they hang on the top bar.
- Steer wheels at the front, or both axles the same size (it reads as a cart).
- Mast pivot at mid-height; it tilts about its foot.
- Overhead guard too tall (> 2.3 m) or with a solid roof (it is slatted or meshed).
- Counterweight a plain box; it is a curved casting that wraps the rear.
- Carriage sliding but chains not; inner channel not moving at all.
- Toy look from a single yellow strip: mast, guard and forks are darker and worn.

## Reuse
`wheel` (solid tyres: `spokes: 0`, `tread: false`), `pipe` (hydraulic hoses), `hex_bolt`
(guard feet), `lamp` (bulkhead for work lights), `steel_beam` UPN for mast channels at LOD1/2,
`axle` for the drive axle. Planned: `seat`, `mirror`, `light_cluster`.

Reach trucks: outrigger legs with load wheels, mast moves forward on the legs (slide +X), no
counterweight, standing operator. Pallet jack: two forks 1150 × 540 mm overall, steer wheel under
a tiller (sway), load rollers in the fork tips.

## Sources
- VDI 2198 type sheet layout (VDI, *Type sheets for industrial trucks*); any current 2.5 t sheet.
- ISO 2328 (hook-on forks and carriage classes), ISO 2330 (fork arms), ISO 3691-1 (safety),
  ANSI/ITSDF B56.1 (US): https://www.iso.org/standard/51106.html · https://www.itsdf.org/
- Example sheet values (2.5 t, 500 mm LC, ~2.72 m to fork face, 1.26 m wide):
  https://www.exapro.com/linde-h-25-d600-evo-393-02-p260826095/ ·
  https://www.lectura-specs.com/en/model/forklifts/diesel-forklifts-hyster/h2-5ft-1030780
