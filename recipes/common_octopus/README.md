# common_octopus: common octopus (*Octopus vulgaris* Cuvier, 1797)

## Identity
A large adult female, settled and alert over the seabed: mantle raised behind the head, eight arms
spread and curling, each differently. Female because the male's right arm III is shortened and
hectocotylized, which would break the "arms of about equal length" read. Signature features: bulbous
soft mantle, turreted eyes with a horizontal slit pupil, funnel (siphon) under the mantle opening,
web between the arm bases, two rows of suckers per arm, warty mottled skin.

Tier: code, not the model tier. The point of this asset is the body-plan kind: a radial body the
quadruped kind cannot describe, with every arm a real bone chain and suckers that follow it.

## Specs
| Dimension | Value | Status | Source |
|---|---|---|---|
| Maximum total length, female | 1.2 m | **used: model total length** | [FAO species catalogue, Roper et al. 1984](https://www.fao.org/4/ac479e/ac479e34.pdf) |
| Maximum total length, male | 1.3 m | not used (female chosen) | FAO, same |
| Mantle length, maximum | 0.25 m | **used** | [Wikipedia: Common octopus](https://en.wikipedia.org/wiki/Common_octopus) |
| Arms | "up to 1 m" | upper bound of the 0.90 m used | Wikipedia, same |
| Arm length | 70 to 85 % of total length | **used: 0.90 / 1.2 = 75 %** | [Naturalis, Zooplankton of the North Sea](https://ns-zooplankton.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/taxon.php?id=132450) |
| Arm form | stout, about equal in length and thickness, dorsal pair slightly shorter | **used** (the 0.86 m dorsal length is design: "slightly" has no number) | FAO |
| Suckers | two longitudinal rows | **used** | Naturalis |
| Skin | "distinctly warty" | **used** | Naturalis |
| Maximum mass | 10 kg (FAO); 9 kg (Wikipedia) | not modelled | FAO, Wikipedia |
| Maximum arm spread | 3 m, at a stated 1 m total length | not used: this pose is curled | Naturalis |
| Eye diameter | about 20 mm in a 205 g animal | not used: that animal is far smaller | [Frontiers in Physiology 2019 review](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2019.01637/full) (search-result excerpt only) |

Head plus neck between mantle and arm crown: 1.2 − 0.25 − 0.90 = **0.05 m**, derived, not measured.

### Design values (no source found; do not cite them as biology)
Mantle width and profile, arm radius (4.3 cm at the base), web depth (a quarter of the arm along each arm, about a sixth
at the middle of each sector), sucker size and spacing, sucker count (about 75 per arm over both rows at this spacing, fewer than a real arm carries;
the 200 to 250 per arm that appears in search results was never opened, so it is not claimed), eye radius, funnel size, pose box. A
morphometric table lists a "web depth index" near 20 and sucker indices, but its denominator could
not be read ([PMC6286802 table 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC6286802/table/table-2)).

## Motion
Clips come from the kind (`octopusClips`, numbers and their evidence in
`docs/research/swim-and-tentacle-animation.md` section 2): `idle`, `reach_<k>`, `fetch`, `crawl`,
`mantle_pulse`. Reach timing (2.4 s) and strain (0.57) are sourced there. **Curvature and twist
magnitudes are design values: no opened source measured them.** The mantle's breathing depth and
rate are design values too: the kind's squid numbers describe jetting squid, not a resting octopus.

## Photos (linked, never committed)
| View | Link |
|---|---|
| Whole animal, category | <https://commons.wikimedia.org/wiki/Category:Octopus_vulgaris> |
| Whole animal | <https://commons.wikimedia.org/wiki/File:Common_octopus.jpg> |
| Close-up, body | <https://commons.wikimedia.org/wiki/File:Octopus_vulgaris_close_up.jpg> |
| Head | <https://commons.wikimedia.org/wiki/File:Octopus_Head.jpg> |
| Eye detail | <https://commons.wikimedia.org/wiki/File:Dettaglio_dell'occhio_di_un_polpo.jpg> |
| Aquarium, 3/4 | <https://commons.wikimedia.org/wiki/File:Octopus_vulgaris_Acquario_dell'Elba.jpg> |

File titles were read from the Commons category listing; the images themselves were not opened by
the agent, so which file best shows which feature is unverified.

## Parts the engine needs
`body` (mantle, head, funnel, arms: one surface, so no seam collar between mantle and head), `web`, `suckers`, `papillae`, `eyes`. Bones: `mantle_*`,
`rib_<i>_0` (leaf joints inside the mantle: `mantle_pulse` scales them across world Z, the coordinate
axis nearest the mantle axis, which is 34 degrees off it; an approximation, because scale keys only
act along X, Y and Z), `head_0`,
`arm_<k>_<i>`, `funnel_*`.

## Open questions
- FAO gives 1.2 m (female) and 1.3 m (male); SeaLifeBase lists 1.8 m for males and 1.2 m for females.
  The FAO female value is used; the female figure agrees across both.
- Which side the mantle leans on when settled was reasoned from orientation (funnel ventral, so
  below and behind the head here), not measured from a photograph.

## Surface, wear and LOD (2026-11 quality pass)
| Feature | How | Why |
|---|---|---|
| wet skin | body on the built-in satin `plastic` strip (roughness 0.35) | matte |
| arms | taper linearly from the web to the tip; suckers shrink with them; transverse skin folds and papillae along the aboral face, clear of the crown fillets | uniformly thick, smooth tubes |
| tips | pale, rosy, translucent-looking over the last 28 % of every arm | |
| poses | arms 2 and 4 coil their tips flat on the seabed, arm 3 reaches out nearly straight | the TOP view was a symmetric star |
| regenerating arm | arm 6 is 0.74 m (design value): its old taper to a dark healed ring at 80 %, then a thinner, pale regrowth bud; the recipe's arc check holds it to its own length | octopuses regrow lost arm tips (widely reported; no paper opened for this recipe, so the lengths are design values) |
| scars | two healed slashes on the mantle's camera-side flank, pale bands across arms 1 and 4, all wider than before | pristine |
| head and mantle | the mantle is in the `body` part with the head, and its base tapers (6.8 to 4.6 cm) into the head instead of overhanging it | a cylindrical neck collar with a seam |
| papillae | each takes the skin colour under it, a shade lighter; sizes 0.4 to 1.9 × with a few big cirri; mantle warts tint only slightly | pale uniform dots read as studs |
| folds | aboral arm folds twice as deep; concentric folds round each eye turret | smooth arm tops |
| far colour | LOD2 takes only the broad mottle | blocky patches far away |
| LOD | LOD2 3.6 k: two rings a link on the arms, rounder mantle and head; LOD0 sucker cups 8 segments (they face the seabed), the mantle got the rings | blocky mantle, segmented tips far away |
| box | the settled pose's box is 1.43 × 1.28 × 0.46 m (design value; the sourced lengths are held along the bones) | the new poses |
