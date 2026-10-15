# Chipper 0.5 — visual system

Implemented UI direction: a warm illustrated hatchery by day, a midnight plum garden by night. Apricot marks care and rewards, lilac marks navigation and progress, mint marks play and friendship. Original character language is defined by the shared Visual System 3 renderer; no saved genetic palette is recolored by the UI. User references inspected: the supplied Android screenshot shows low scene/bird separation and a large empty upper field; the dock reference supplies translucent capsule, moving lens and bright rim direction, not copied assets.

## Tokens and surface hierarchy

The source of truth is `src/app.css`; all existing screens inherit the same tokens. System rounded fonts avoid font downloads and loading shifts.

| Role | Day | Night |
| --- | --- | --- |
| Canvas | `#fff7e9` cream | `#17152b` midnight indigo |
| Solid card | `#fffdf8` warm white | `#28233f` elevated plum |
| Inset/control | `#f1e9f3` pale lilac | `#352d4b` berry |
| Main text | `#352c46` blackberry | `#fff5e9` warm white |
| Secondary text | `#706078` plum gray | `#c7bbd7` pale lavender |
| Lilac text | `#6b4ba8` | `#c6b0ff` |
| Apricot text | `#a94527` | `#ffb886` |
| Mint text | `#28674f` | `#a7dfcc` |
| Primary action | `#624294` | `#d0b8ff` |

Four surface levels: atmospheric canvas; solid paper cards with a soft contact shadow; accent tinted interactive regions; selectively translucent floating UI. Collection portraits alternate lilac, apricot and mint lighting. Active collection cards use a double border and a mint status badge. Bird details have a portrait halo and a clear growth timeline. Codex discoveries use mint, missing entries use inset surfaces. Telegram identity, statistics, settings, incubation, shop continuation, social profiles and dialogs use the same hierarchy. Flaps and Nest Defense HUD, controls, invitations, pause/results and errors use these tokens. Inactive actions retain readable text, a changed fill/border and no glow rather than fading the whole control.

## Liquid Glass implementation

`src/navigation/BottomDock.tsx` retains the five existing tabs, accessible labels and `aria-current`. A single `dock-lens` receives a bounded active index; CSS translates that lens across the capsule with a 360ms easing curve. No JS animation loop or per-frame layout/blur is involved. Selected items have stronger text/icon weight, an independent lens and the same safe hit area as other tabs. The centered Home tab remains centered.

The dock is positioned inside the app above its bottom safe area. Content scrolls behind the capsule while main bottom padding keeps the final action reachable. Fixed Home reserves the equivalent dock space; Canvas games keep their full game area and hide the dock as before. Native header layout, Telegram button hit zones, keyboard hiding, stable viewport height and lateral safe insets are preserved. The native title remains solid to avoid mixing native chrome with blurred content.

Supported WebViews apply actual `backdrop-filter: blur(20px) saturate(1.45)` (including the WebKit prefix) to one dock surface. The dock base retains approximately 32% background transmission. Static diagonal reflections, a bright outer rim, a fine upper glint, inner edge shadows and a separate active lens provide depth. App canvas gradients continue beneath the dock, and scrolling content changes the real sampled backdrop. Popovers and intentional `GlassSurface` cards use a denser translucent base for reading. Ordinary cards stay solid. There are no imported glass images, shaders or animated filter radii.

Unsupported browsers receive an opaque base because translucency is only enabled inside `@supports`. `prefers-reduced-transparency: reduce`, `prefers-contrast: more` and `html[data-glass='off']` disable blur, use solid surfaces and remove reflection layers. The fallback lens becomes a solid accent inset. The Telegram adapter sets `data-glass='off'` when save-data is enabled or a positive `deviceMemory` hint is at most 2 GB. It responds to connection changes and removes its listener at cleanup. These hints remain local capability preferences, never game state. Owner forced fallback and automatic detection must be checked in browser QA.

## Readability and accessibility evidence

Run `node scripts/check-visual-contrast.mjs --write`. The script reads the actual CSS token blocks, computes WCAG sRGB relative luminance and fails below 4.5:1 for normal text. Actual result: **36/36 pairs pass**, minimum **4.57:1**. [Machine-readable evidence](qa/0.5/contrast-ui-tokens.json).

| Text pair | Day | Night |
| --- | --- | --- |
| Main / canvas | 12.33:1 | 16.54:1 |
| Main / solid card | 12.91:1 | 13.90:1 |
| Secondary / canvas | 5.43:1 | 9.77:1 |
| Secondary / solid card | 5.69:1 | 8.21:1 |
| Secondary / disabled surface | 4.87:1 | 7.07:1 |
| Lilac / lilac surface | 5.37:1 | 6.11:1 |
| Apricot / apricot surface | 4.90:1 | 6.41:1 |
| Mint / mint surface | 5.68:1 | 7.03:1 |
| Primary action label | 7.42:1 | 9.83:1 |

The script also composites the base dock over opaque black and white. These checks prove the token pairs and base glass layer; they do not assert every pixel of layered reflections or every composed scene. Screenshots and real WebView checks remain required. Focus rings, semantic controls, reduced-motion rules, a 44px minimum for popover close/refresh and all dock controls are retained. Reduced motion disables lens/screen transitions. Background/deactivation pauses CSS animation through the existing `data-active` contract.

## Visual acceptance captures

Root integration/QA owns the final capture results. Required evidence: 320/360/390/430 widths, day/night, native Android-like safe areas, Home one/two birds, care disabled/available, daily popover, Collection portrait/detail/comparison, Codex, Profile, settings, shop continuation, social/gift/exchange confirmation, Flaps and Nest Defense active/pause/result. Capture supported glass and explicit opaque fallback, then reduced motion. At 320px verify that care/summary stay above the dock and that all last-row actions remain scrollable into view. Compare the actual supplied Android before image with the same own-bird Home after capture; the reference dock is a design source, not before evidence.

`tests/ui/v05-visual.spec.ts` adds eleven real-App browser scenarios: the eight-size/theme matrix, one reduced-motion/automatic low-memory scenario and two Canvas game palette scenarios. Capture command: `CHIPPER_CAPTURE_QA=1 npx playwright test tests/ui/v05-visual.spec.ts --workers=2`. The matrix records screenshots and JSON with actual browser version, control geometry, supported/fallback glass computed styles, page errors and five computed opaque text-color samples. Capability hints are controlled in the supported-glass cases and set to 2 GB in the fallback case. Routine runs write `test-results/qa/0.5`; capture runs write `DOCS/qa/0.5`. Test authoring and syntax parsing do not establish a passing browser run; the integration report records the actual CI result.

Browser emulation is not physical Android/iOS or signed Telegram acceptance. If a browser or dependency install cannot run, mark captures **BLOCKED**, record the failing command and leave device checks **PENDING owner**. Do not substitute an invented screenshot or a static mock for an app capture.
