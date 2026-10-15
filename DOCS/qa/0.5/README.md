# Chipper 0.5 — evidence provenance

- `owner-android-before.jpg`: owner's actual supplied Android/Telegram screenshot of0.4. It is a source image, not a browser capture or a successful device check.
- `chicks-before-after.svg/png`:12 pairs from the exact main3764261 renderer and new shared production renderer, with identical fixture IDs, genes, palettes and ages. These are real SVG rasterizations via system librsvg/Cairo, not UI screenshots or live player data.
- `chick-gallery-v3.svg/png`:30 deterministic QA birds,12 saved palettes and all3 ages. DEV `?art=1` also displays90 age variants. Regenerate both figures with `node scripts/qa-v05-chicks.mjs` on Node24 with librsvg/Cairo/Python installed.
- `contrast-ui-tokens.json`:36 measured text/token/base-glass pairs, minimum4.57:1. This does not prove every gradient/reflection pixel has the same contrast.
- `native-regressions.txt`, `exchange-proof.txt`, `world-proof.txt`, `adapter-proof.txt`: actual supplementary Node/SQLite/rig/synthetic-host output. They do not replace npm/Vitest/Playwright or physical Telegram acceptance.
- `home-*.png`, other screen PNGs and `visual-*.json`: only actual Chromium captures from GitHub Actions are accepted here. Android native chrome and identity transport are synthetic; database/services and frontend are real. Never label these physical Android/iOS or signed-live PASS.

Full command results, immutable commit/run links, browser counts and remaining owner checks are maintained in ../../ACCEPTANCE_RESULT_0.5.md. No production write is performed to create this evidence.
