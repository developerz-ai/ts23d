# Reading list: free and legal

Sources agents and contributors study to raise quality. Only legally free or public-domain material;
learn methods, never copy designs. Verify each edition's licence before quoting images.

## Anatomy and form (public domain)
| Source | Teaches | Where |
|---|---|---|
| Bridgman, *Constructive Anatomy* (1920) | the figure built from blocky masses: our "separate masses first" | Project Gutenberg, archive.org |
| *Gray's Anatomy* (1918 ed.) | skeleton and muscles under faces, hands, limbs | Wikisource, Bartleby |
| Muybridge, *Animals in Motion*, *The Human Figure in Motion* | gaits, poses, wing beats from photo sequences | archive.org, Wikimedia Commons |
| Ellenberger, *An Atlas of Animal Anatomy for Artists* (original plates) | horse, dog, lion, cow skeleton and muscle | archive.org (check the edition) |

## Game art craft (free from studios and communities)
| Source | Teaches |
|---|---|
| Valve, *Dota 2 Character Art Guide* | readability: value over colour, contrast where the eye should go, silhouette, painted gradients |
| Valve, "Illustrative Rendering in Team Fortress 2" (NPAR 2007) | designing a stylised look so characters read instantly |
| Polycount wiki | topology, baking, texel density, hand-painting, trim sheets |
| 80.lv and ArtStation breakdowns | step-by-step pro workflows per asset type |

## Rendering, maths, code (free online)
| Source | Teaches |
|---|---|
| *Physically Based Rendering* (pbr-book.org) | how light and materials really work |
| *GPU Gems* 1–3 (NVIDIA developer site) | real-time tricks: hair, skin, water, grass |
| Inigo Quilez's articles (iquilezles.org) | signed-distance modelling and noise (our sculpt engine) |
| *The Book of Shaders*, LearnOpenGL | procedural patterns, noise, lighting basics |
| Khronos glTF spec and tutorials | what each glTF extension carries |

## Rules top artists repeat (sourced 2026-11)
1. Silhouette first: block big shapes zoomed out; test as a solid black shape at thumbnail size. If it only reads in colour, the shapes are weak. ([80.lv](https://80.lv/articles/character-design-shape-language-and-readability/), [Rocketbrush](https://rocketbrush.com/blog/shape-language-in-game-character-design-how-to-make-characters-readable-and-consistent))
2. Detail only where it helps reading; cluster detail, leave rest areas; too much detail is noise in a fast game.
3. Value before colour: check in greyscale; highest contrast at head and upper torso. ([Dota 2 guide, third-party copy](https://www.scribd.com/doc/298310210/Dot-a-2-Character-Art-Guide), [80.lv Stinger](https://80.lv/articles/modeling-and-texturing-an-interesting-hand-painted-game-ready-3d-character/))
4. Shadows cooler, lights warmer; a dark-feet-to-light-top gradient grounds a character. ([Polycount](https://polycount.com/discussion/comment/2396659))
5. Hard surface: controlled bevels and clean, lump-free surfaces beat added greebles. ([80.lv](https://80.lv/articles/hard-surface-modeling-tips-and-tricks), [80.lv bevel weights](https://80.lv/articles/hard-surface-modeling-tips-tricks-for-creating-a-vintage-quirky-looking-gun))

## Checks these become (roadmap: Autonomy)
- Thumbnail silhouette test: LOD2 32×32 black shape vs LOD0 (IoU), from front, side, 3/4.
- Greyscale value check: highest local contrast on head / upper body (characters) or focal part (props).
- Detail-density map: rest areas exist; no uniform noise.
