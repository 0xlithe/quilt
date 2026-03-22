# Quilt Branding Design

**Goal:** Turn the provided Quilt PNG into a clean extension brand system with a small-size icon set, a retained full logo asset, and more polished extension-facing metadata.

## Branding Direction

Use two related assets instead of forcing one image to do every job:

- **Small icons:** use the wave symbol only, centered on a dark background for clarity at `16x16`, `32x32`, `48x48`, and `128x128`.
- **Full branding surfaces:** keep the original full Quilt lockup for the popup and future documentation surfaces where the wordmark remains readable.

## Metadata Direction

Keep the product name as **Quilt**, but make the description and action title feel more intentional and product-like:

- short
- calm
- professional
- aligned with an automation workspace/tool rather than a rough prototype

## UI Direction

The popup should feel like a branded control surface:

- add the Quilt mark near the title
- keep the dark aesthetic that already matches x.com
- avoid over-design or a full UI rewrite

## Asset Plan

- create a dedicated `extension/assets/` folder
- copy the original provided PNG into the extension as the full logo source
- generate small icon PNGs from a symbol-focused crop/composition
- add a favicon-sized asset for HTML surfaces

## Success Criteria

- Chrome extension manifest has wired icons
- popup has a favicon/app icon hook and a more branded header
- metadata reads like a polished Quilt product
- small icons remain legible
