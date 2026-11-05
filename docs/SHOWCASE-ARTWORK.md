# Showcase artwork and generation prompts

All final artwork below was generated or edited with the **built-in imagegen**
tool. No CLI/API fallback or API key was used. They are project-bound transparent
PNG files copied into the repository; original generated outputs and superseded
variants are retained separately. These are original illustrative device bezels,
not official Apple product artwork. The live screen opening remains transparent.
`showcase/public/artwork-provenance.json` records exact final hashes and dimensions;
`showcase/public/devices/frames.json` records measured alpha-opening geometry.

Final assets:
- `showcase/public/brand/enui-logo-n-v3.png`
- `showcase/public/devices/phone-silver-v2.png`
- `showcase/public/devices/tablet-silver-v2.png`

## ENUI final prompt sequence

Initial brand specification: horizontal ENUI wordmark and original blue glass
monogram, Sierra blue #9DB7C8, deeper blue #365A73 and navy #17354A, transparent
alpha, premium optical spacing, no card, mockup, tagline or watermark. The owner
subsequently corrected both typography and symbol; the initial UI-bold design is
superseded and is not used by the website.

Typography edit prompt:

> Revise this ENUI logo wordmark's typography. Exact text remains ENUI, four capital letters in that order. ONLY the N must be bold/heavy: N represents Nami, the author's initial. E, U and I must all be distinctly THIN/light, with the same slender stroke weight as one another, around one quarter of the N's stroke weight. This is crucial: U and I must no longer be bold. The N should be the unmistakable visual anchor. Preserve the small blue translucent monogram on the left, Sierra blue and dark navy palette, horizontal layout, clean premium spacing, and transparent alpha background. No extra text, no mockup or card, no watermark. Return the complete updated logo with clearly thin E, bold N, thin U, thin I.

Final symbol edit prompt:

> Change ONLY the logo SYMBOL to the left of this ENUI wordmark. The symbol must now read unmistakably as ONE bold capital N, representing Nami. Remove the foreground E form entirely: no E, no horizontal E bars, no two-letter EN monogram. Build a distinctive, simple N from two strong rounded vertical glass stems joined by a substantial diagonal folded ribbon, with clean N-shaped negative spaces. The N is the dominant silhouette and must remain legible as N at small icon sizes. Preserve the Sierra blue / dark navy translucent glass palette and restrained white edge highlights. Preserve the wordmark on the right EXACTLY: thin E, bold N, thin U, thin I, same spacing and proportions. Actual transparent alpha background, complete horizontal logo, no card, no extra text, no watermark.

## Phone bezel prompt sequence

Initial specification: one original, orthographic front-facing portrait silver /
natural-titanium large Pro-style smartphone bezel, black inner edge, tiny speaker,
antenna seams and side buttons, 440:956 screen-opening target, actual transparent
alpha inside and outside, no logo, lettering, scene or external shadow. The first
camera rendering was removed so the web replica can place its camera island at
the registered native coordinates.

Final edit prompt:

> Edit this device-frame PNG only: remove the black camera pill/island and its camera lens from the interior of the screen opening, making those pixels fully transparent alpha like the rest of the screen opening. The live web screen will draw its own accurately positioned camera island. Preserve the outer silver metal device bezel, exact front view, original device proportions, all buttons, full dimensions and every outer edge unchanged. Both the interior screen opening and exterior background remain actual transparent alpha. Do not add any new details, text, scene, reflection or shadow. Return the clean bezel overlay.

## Tablet bezel prompt sequence

Initial specification: one original, orthographic portrait 13-inch Pro-style
silver tablet bezel, thin black edge, 1032:1376 opening target, soft corners,
transparent alpha inside and outside, no home button, island, logo or lettering.

Final edit prompt:

> Refine this existing portrait tablet bezel overlay only. Keep the exact straight-on front view, 1086 by1448 canvas size, outer silver metal rim, outer silhouette and transparent exterior. Make the black bezel much thinner, as on a modern very thin-bezel Pro tablet: expand the genuinely transparent screen opening outward to approximately x=42 through1044 and y=52 through1396, with soft 25-pixel opening corners. The new black bezel is only about18 pixels thick inside the silver rim, not the current wide band. Remove the tiny camera lens on the right if it would overlap the enlarged transparent screen, rather than leave it in the live screen opening. No text, no screen fill, no external shadow. Preserve actual transparent alpha throughout the enlarged screen opening.

The generated asset's measured dimensions and alpha opening, rather than prompt
coordinates, govern the web placement. Logical live viewports stay 440×956 and
1032×1376. Original device proportions and native pixel parity remain separate
review criteria; illustrative PNG artwork does not establish either on its own.
