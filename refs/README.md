# refs/ — reference dossiers

One file per asset: `refs/<asset_name>.md`. The agent writes it BEFORE the recipe; the recipe's
`sources` and `real.measures` are copied from it, and the `measures` gate proves the model matches.
Photos are linked, never committed (licences); downloads go to `tmp/refs/<name>/` (gitignored).

## Template

```md
# <Name> — <variant / year>

## Identity
Variant chosen and why (one line). What makes it THIS object: the 3–5 signature features.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| overall length | 6.316 | <url> |
| width | 3.56 | <url> |
| height | 3.00 | <url> |
| road wheel diameter | 0.80 | <url> |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| side elevation | <url> | scale reference: wheel diameter |
| front 3/4 | <url> | |
| top | <url> | |
| detail: <thing> | <url> | |

## Parts the engine needs
`turret` (yaw), `gun` (pitch), `road_wheel_*` (spin) …

## Open questions
What the sources disagree on, and which value was chosen.
```
