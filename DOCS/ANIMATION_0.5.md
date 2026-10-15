# Chipper 0.5 — animation and world implementation

The animation layer is entirely presentation-only. Existing authoritative server sleep, care cooldowns, Touchy Feel and read-only guests retain priority: sleep → carry → care/growth → locomotion → ambient. No decorative action writes progress, currency, receipts or API calls.

## Stable character behaviour

`visualDetailsFor(chick)` derives an unchanged fingerprint from saved ID and genes. `personalityForSeed` maps the five visible personality labels to a favourite comic action: dreamer/stretch, nosy/startle, wiggler/shake, dandy/sneeze, clumsy/stumble. Ambient selection weights the favourite, while every bird can perform all five. Age, device and owner do not change the fingerprint. No new persisted field or migration is required.

Autonomous walks remain inside the existing projected ellipse; favoured clumsy birds may recover with a short stationary catch step after an ambient walk. Player walk targets remain responsive. The guest uses a separate lane, greeting/look/together/apart cycle, reciprocal owner gaze and a local greeting response when the owner is free. Neither actor changes the other player's state.

## Motion matrix

| Action | Implemented movement |
| --- | --- |
| Idle | Small torso breath, head sway, delayed wing/tail follow-through, deterministic single/double blink timing and gentle lid expression |
| Walk/turn/stop | Existing 60% planted-foot gait, anatomical articulated legs, delayed head bob and tail counter-motion; frontal turning anatomy with narrowed torso; exact bounded arrival |
| Look/tap | Pointer-directed gaze, head tilt, three nonrepeating tap reactions, brow expression, small compression and wing response |
| Pet/hold/drag/release | Eyes close when stroked, contented sway, dangling asymmetric feet, spring-following carry, inertia-driven head/wing/tail counter-motion, eased descent and landing squash |
| Feed | Walk to ground grain, articulated anatomical beak reaches y279, planted feet and constrained crouch |
| Play/hop | Anticipation crouch → airborne arc and wing spread → landing compression; separate foot lift and head/tail follow-through |
| Sleep/wake | Server-only sleep pose, tucked body and closed eyes; eased rise, opening eyes and wing stretch only after server sleep ends |
| Hatch/grow | Shell/arrival anticipation, overshoot and settle, asymmetric head/wing response; growth compresses then stretches and settles without changing saved genes |
| Sneeze | Slow inhale/head-back anticipation, rapid forward sneeze, closed eyes/open mouth, wing flick and tail recovery |
| Startle | Crouch then short hop, wide wing response and open mouth; relaxed recovery |
| Stretch | Long torso extension, head-back reach, large wing stretch, closed eyes and yawn |
| Feather shake | Bounded oscillation with delayed head/tail counter-motion and slightly puffed torso |
| Stumble | Body tips, wing catch, delayed second-foot recovery and suspicious eye/brow response |

`poseFrame` retains the 320×320 coordinate contract and original ground y282. New body scale/angle and expression fields are additive; renderer visual version3 leaves appearanceVersion2 and geneSchemaVersion1 intact.

## Home garden

A compact layered garden replaces the unbroken empty background: sky glow, sun/moon, distant rolling banks, subdued grass, raised meadow rim, central pool of light, two small sprigs, a pair of flowers, pebbles and three tiny drifting pollen/firefly points. Light theme uses warm meadow greens; night uses lilac sky, blue-lit ground and a pale moon so dark birds remain readable. Decorations ignore pointer events and do not obscure controls. The central bird scales with both scene height and width, up to430px rather than the old300px cap; a pair uses separate lanes and smaller sprites.

Five short captions accompany comic events. They are positive flavour text only, contain no rewards and impose no absence/streak penalty. Motes use three compositor-friendly CSS transforms/opacity animations, with no moving blur, filter or shader.

## Rendering and lifecycle

`ChickArt` memoizes generated SVG markup by identity, stage, pose, direction, reaction and shadow. Phase, carry velocity, blink and gaze update a fixed set of cached SVG rig nodes directly; geometry, pattern paths, colour details, clips and DOM identity are retained across frames. `HomeWorld` and the guest move their wrappers imperatively; joint updates are bounded at30Hz. React updates only semantic pose/direction/reaction changes, rather than rebuilding the SVG tree30 times per second. Portraits use CSS breathing/blinking without a JavaScript clock.

Document hidden and Telegram deactivated stop Home RAF, cancel capture/hold, release lift and pause CSS effects. Unmount cancels RAF, timers, event handlers and ResizeObserver. Deltas cap at50ms, preventing catch-up after background. Reduced motion has no perpetual Home clock, disables environmental and portrait animations, preserves semantic sleep/care poses and retains pointer/keyboard touching, carry and release with brief bounded completion clocks.

## Verification

- `tests/animation-v05.test.ts`: finite distinct comic trajectories across ages/leg shapes, recovery, hop anticipation/flight/landing, canonical personality agreement, care/sleep precedence and all comics exercised over deterministic bounded simulated play.
- `tests/ui/v05-world.spec.ts`: actual idle SVG nodes stay connected and identical while transforms change; no child-list replacement; reduced-motion world remains still and touchable.
- Existing `world`, `touch`, `guest-world`, geometry, growth, native background and browser performance suites remain required regressions.

Actual command results are recorded by the integrator in `ACCEPTANCE_RESULT_0.5.md`. Physical Android/iOS Telegram animation quality, GPU cost and native gesture behaviour remain owner checks; Chromium emulation is not a physical-device PASS.
