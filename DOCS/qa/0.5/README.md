# Chipper 0.5 — actual evidence

Runtime source: [c3b07c8](https://github.com/tracerxbrhd/chipper-hatchery/commit/c3b07c8c8a4ce4ded3361d86c982fa9d7c560b92). [CI38695995822](https://github.com/tracerxbrhd/chipper-hatchery/actions/runs/38695995822): npm ci,543 unit tests,103 UI tests PASS. Full [QA captures](https://github.com/tracerxbrhd/chipper-hatchery/actions/runs/38695995822/artifacts/11954415464) and [Playwright report](https://github.com/tracerxbrhd/chipper-hatchery/actions/runs/38695995822/artifacts/11954525382). These artifact links expire after90days; the selected PNGs and JSON here remain versioned. [Manifest](evidence-manifest.json) records SHA256 and byte sizes.

All UI PNGs are real Chromium156.0.8078.4 captures of built frontend + production services/local SQLite, with synthetic Telegram Android host/transport. They are not physical Android/iOS or signed-live acceptance. No production write created this evidence. Original screenshots were copied byte-for-byte from the artifacts; no screenshot was repainted or synthesized.

## Before / after and characters

- [Owner's original Android0.4 screenshot](owner-android-before.jpg), supplied with the task, unchanged. It is source evidence, not a new successful device check.
- [Actual0.5 dark Home390](home-one-native-dark-390.png) and [light Home390](home-one-native-light-390.png): after captures use QA fixture accounts and a different viewport, not the owner's live save.
- [Exact main vs Visual3 renderer](chicks-before-after.png), also [SVG](chicks-before-after.svg):12 pairs with identical fixture ID/genes/palettes/ages. Old renderer comes from main3764261.
- [Gallery30 birds](chick-gallery-v3.png), also [SVG](chick-gallery-v3.svg):12 saved palettes, all3 ages. DEV ?art=1 additionally shows90 age variants.
- The character figures are actual SVG rasterizations via librsvg/Cairo. Regenerate with node scripts/qa-v05-chicks.mjs on Node24 with librsvg/Cairo/Python; they are separate from browser captures.

## Responsive Home matrix

| Width | Light | Dark |
| --- | --- | --- |
|320 | [PNG](home-one-native-light-320.png) | [PNG](home-one-native-dark-320.png) |
|360 | [PNG](home-one-native-light-360.png) | [PNG](home-one-native-dark-360.png) |
|390 | [PNG](home-one-native-light-390.png) | [PNG](home-one-native-dark-390.png) |
|430 | [PNG](home-one-native-light-430.png) | [PNG](home-one-native-dark-430.png) |

Matching visual-native-{light,dark}-{320,360,390,430}.json record native geometry, glass/fallback computed styles, sampled contrast and pageErrors. Full artifact also contains all screen variants at all eight configurations.

## Screen gallery

| Area | Actual captures |
| --- | --- |
| Guest pair | [Dark390](home-two-native-dark-390.png), [light430](home-two-native-light-430.png) |
| Collection | [Compact dark320](collection-native-dark-320.png), [light390](collection-native-light-390.png) |
| Compare | [Dark320](comparison-native-dark-320.png), [light430](comparison-native-light-430.png) |
| Codex | [Dark390](codex-native-dark-390.png) |
| Profile / achievements | [Dark390](profile-native-dark-390.png), [light390](profile-native-light-390.png) |
| Activities | [Dark390](activities-native-dark-390.png) |
| Flaps | [Dark390](flaps-ready-native-dark-390.png), [light390](flaps-ready-native-light-390.png) |
| Nest Defense | [Dark390](tower-build-native-dark-390.png), [light390](tower-build-native-light-390.png) |
| Friends / social | [Light390](social-native-light-390.png) |
| Exchange | [Pair confirmation dark320](exchange-pair-confirm-dark-320.png), [accepted light390](exchange-accepted-light-390.png) |
| Incubator | [Light390](incubator-native-light-390.png) |
| Shop, unavailable checkout | [Light390](shop-native-light-390.png) |
| Settings | [Dark390](settings-native-dark-390.png) |
| Daily | [Dark390](daily-native-dark-390.png) |
| Opaque fallback | [Dark320](glass-fallback-native-dark-320.png) |
| Reduced motion / low memory | [Dark320](reduced-motion-low-memory-native-dark-320.png) |

## Machine evidence

- [CI excerpts](ci-summary.txt): actual npm/check/UI output, production bundle sizes, isolation and secrets gates.
- [Browser performance](browser-perf.json): actual2.5s pair/tower samples attached to final Playwright run; p95 intervals16.8/16.7ms,0 long tasks,0 scheduled background RAF. Short CI sample, not physical FPS or a long-term leak proof.
- [Contrast tokens](contrast-ui-tokens.json):36 measured text/token/base-glass pairs, minimum4.57:1. This does not prove every gradient/reflection pixel has the same contrast.
- [Native regressions](native-regressions.txt), [exchange proof](exchange-proof.txt), [world proof](world-proof.txt), [adapter proof](adapter-proof.txt): supplementary Node/SQLite/rig/synthetic-host output, not substitutes for full suites or physical Telegram.

[Complete acceptance result](../../ACCEPTANCE_RESULT_0.5.md) records compatibility, economy, manual limitations and production stop conditions.
