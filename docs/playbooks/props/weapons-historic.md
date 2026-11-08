# Historic and fantasy weapons playbook

Museum-piece and fantasy arms as props: swords, daggers, axes, maces, spears and polearms, bows
and crossbows, shields, helmets, and **historic** firearms (matchlock to 19th-century muskets and
revolvers, as museum pieces). **Scope limit:** no modern real-firearm replication — no current
production guns, no functional internals, no part-level accuracy for anything post-1900 beyond
silhouette; for modern-looking guns, design an original, game-style prop. Fantasy weapons:
original designs, never a named weapon from a game, film or book. **Scale from the hand**: grips
are 90–110 mm per hand, and real blades are lighter and thinner than games suggest.

## Research
Museum collection records (Royal Armouries, Metropolitan Museum Arms and Armor, Wallace
Collection — dimensions and mass are listed per object), typologies (Oakeshott for medieval
swords, Petersen for Viking swords), archery references (draw length, bow length). Photos: full
profile, both faces, hilt close-up, cross-section at the base of the blade, edge-on view.

| Item | Typical dimensions | Notes / source |
|---|---|---|
| arming sword (1100–1400) | overall 0.9–1.0 m, blade 0.75–0.8 × 45–55 mm at base, 1.0–1.3 kg | Oakeshott X–XIV |
| longsword | 1.1–1.3 m, blade 0.85–1.0 m, grip 0.2–0.28 (two hands), 1.2–1.8 kg | |
| blade thickness | 5–7 mm at base tapering to 2 mm; fuller 1/3 of width | |
| point of balance | 0.1–0.15 m in front of the guard | |
| dagger | 0.3–0.45 m | |
| bearded / Dane axe | haft 0.7–1.7 m, head 0.15–0.3 m, 0.5–1.5 kg | |
| spear | 2.0–3.0 m, head 0.2–0.5 m | |
| longbow | 1.7–2.0 m, draw 0.71–0.76 m (28–30 in), limb 30–35 mm at grip | |
| recurve (horse) bow | 1.1–1.5 m | |
| crossbow (medieval) | stock 0.7–0.9 m, prod 0.7–0.9 m | |
| round shield (Viking) | Ø 0.8–0.9 m, 6–10 mm planks, central boss Ø 0.15 | |
| heater shield | 0.6–0.8 × 0.75–0.9 m | |
| flintlock musket (18th c.) | 1.5–1.6 m, barrel 1.0–1.17 m, calibre 17–19 mm | museum records |
| 19th-c. percussion revolver | 0.3–0.35 m overall | |

## Part tree
```
sword: blade (fuller as geometry), guard (cross), grip (wrapped), pommel, peen; scabbard (separate asset)
       sockets: attach 'grip' (hand), attach 'belt' (scabbard)
axe: haft, head (eye wraps the haft), wedge; mace: shaft, head (flanges)
bow: riser, limb_upper / limb_lower (sway Y draw ±15°), string (static or two segments to the nock point)
crossbow: stock, prod, string, trigger (sway), stirrup
shield: board, boss, rim (rawhide / iron), handle (back), straps
musket (museum): stock, barrel, lock (cock sway Y `oneWay` 45°, frizzen sway), ramrod (slide), sling
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| bow limbs (draw) | sway | Y at riser ends | 10–20° toward the archer |
| crossbow trigger | sway | Y | 10° |
| flintlock cock / frizzen | sway `oneWay` | Y | 45° / 60° |
| sword in hand | none; engine animates via the grip socket | | |

## Signature details
1. Distal and profile taper: blades get thinner and narrower toward the point; edge bevels visible.
2. Fullers (grooves), ricasso on some types, a real cross-section (lenticular / diamond / hexagonal).
3. Hilt: grip wrapped in leather or wire with a spiral, risers, pommel peened over the tang.
4. Axe heads: eye wrapping the haft, beard sweeping down, thin edge.
5. Shields: planks visible on the back, boss rivets, rim binding, battle damage.
6. Wear: polished edges, nicks, pitting; leather darkened by hands; patina on bronze.
7. Fantasy: exaggerate silhouette, keep a believable grip and balance point.

## Materials
`steel_galvanised` / `chrome` (polished steel — `chrome` only for mirror-polish blades),
`iron_cast` / `iron_rust` (pitted, excavated), `brass` / `copper` (bronze age, fittings),
`oak` / `pine` / `wood_weathered` (hafts, stocks, shields), `leather` (grips, scabbards, straps),
`canvas` / `wood_painted` (shield faces). Grime: dark crevices at the guard, wear highlights on edges.

## LOD policy
- LOD0: blade bevels and fuller, grip wrap as a swept helix, rivets, engraving via `extrudeSvg`.
  Sword 1.5–5k, shield 1–4k, bow 0.8–2k.
- LOD1: flat blade with bevels, smooth grip. 200–600.
- LOD2: 20–80 triangles — the outline only.

## QA
```ts
real: { length: 0.97, width: 0.2, height: 0.05, measures: [
  { label: 'blade length', axis: 'x', value: 0.78, parts: ['blade'], source: 'museum record' },
  { label: 'blade width at base', axis: 'y', value: 0.05, parts: ['blade_base'] },
]},
checks: [touches('guard', 'blade'), touches('grip', 'guard'), touches('pommel', 'grip'),
         symmetric('_l', '_r', 'y')],
```

## Common mistakes
- Blades 15 mm thick and 10 cm wide (a slab, not a sword); grips too short for the hand.
- Swords 1.5 m long for one hand; axes with hammer-thick edges.
- Bowstring floating off the nocks; limbs without taper.
- Replicating a modern firearm, or a named weapon from fiction.

## Reuse
`extrudeSvg` (blade and guard profiles from a drawing; `bevel` for edges), `latheSvg` (pommels),
`sweep` (grip wrap, bowstring), `rivet_row`, `sculpt` (fantasy ornament). Characters holding them:
`ctx.use` into a hand socket ([characters](../characters/characters-creatures.md)). Shared weapon
modules go in `recipes/_lib/weapons/`.

## Sources
- Royal Armouries collections: https://collections.royalarmouries.org/
- The Met, Arms and Armor: https://www.metmuseum.org/departments/arms-and-armor
- Oakeshott typology: https://en.wikipedia.org/wiki/Oakeshott_typology
- English longbow: https://en.wikipedia.org/wiki/English_longbow
