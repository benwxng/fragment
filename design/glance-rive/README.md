# Glace eye

The original geometry comes from the `USE` group (3:24) in the Swat Figma file Glance/Fragment. `glace-eye.svg` is the standalone, transparent logo.

The six-second Rive loop glances left and right, blinks twice, and turns the star 45 degrees after each blink finishes opening. The star's symmetry makes the loop seam continuous. Shapes, masks, and keyframes remain editable.

- `rive design/glance-rive --verify`
- `rive inspect design/glance-rive --summary`
- `rive design/glance-rive` opens the live preview.
- `rive design/glance-rive --once` builds the runtime asset.
- Copy `build/glance-rive.riv` to `apps/web/public/brand/glace-eye.riv` only when adopting a new animation on the site.
- `rive push design/glance-rive` saves to the linked editor file, 2608610.

The web login page loads the local Rive file and self-hosted WASM runtime. Its predev/prebuild scripts copy WASM from the installed package. Reduced-motion visitors and load failures get the static eye; other visitors can pause the animation.

## Directional explorations

Three additional six-second loops live on separate artboards in the same Rive file:

- `Glace — Diagonal glances`: looks toward all four diagonal directions.
- `Glace — Look up and down`: pronounced vertical looks followed by softer diagonal glances.
- `Glace — Curious orbit`: looks around the perimeter in an inquisitive sweep.

Each artboard has its own named animation and default loop state machine. All retain two blinks and a 45-degree star turn after each blink. The original `Glace` artboard and `Glace and blink` timeline remain preserved, and the site's existing runtime asset is unchanged.

Preview a variation with `rive design/glance-rive --artboard="Glace — Diagonal glances"`.
