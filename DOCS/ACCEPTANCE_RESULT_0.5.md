# Chipper 0.5 — acceptance result

Integration in progress. Do not deploy or call beta-ready until required full checks and visual review are recorded.

| Gate | Observed result |
| --- | --- |
| Exact main baseline + Git object verification | PASS3764261; every restored blob and signed commit/tree hash checked |
| Local npm ci | FAIL environment EPERM to configured sidecar; no dependency substitution |
| Local npm run check / test:ui | BLOCKED missing project dependencies; not counted as PASS |
| Serverless syntax/runtime imports | PASS |
| Native Node/SQLite original0.4 regression |12 groups PASS, repeat after integration |
| Native exchange/achievement concurrency |6 groups PASS including10 independent SQLite writers and second-row rollback |
| Pure world/rig proof |36,900 anatomical frames,108,000 bounded steps,all5comic actions PASS |
| Design token/base glass contrast |36/36 AA pairs PASS, minimum4.57:1 |
| GitHub Actions npm ci + npm run check | PASS at d478ae0;543 unit tests, full TypeScript/lint/build/dev isolation/secrets/contrast gates |
| GitHub Actions npm run test:ui | RUNNING; no browser PASS claimed yet |
| Browser320/360/390/430 light/dark screenshots | PENDING |
| Physical Android/iOS Telegram | MANUAL PENDING |
| Production identity/revision/preflight | NOT RUN, no authorized credentials bound |
| Production writes / migrations / merge | NONE |

Native checks are complementary evidence, not substitutes for Vitest/Playwright. Local originals and failures: ENVIRONMENT_0.5.md. Final run links, counts, artifact evidence and outstanding issues will replace pending entries after CI.

The local environment blocker was resolved for full execution by using existing repository GitHub Actions, without bypassing the sandbox. [Run38694427971](https://github.com/tracerxbrhd/chipper-hatchery/actions/runs/38694427971) proves actual npm installation and full check. Earlier CI lint/eye-contour issues were fixed; a brittle global SVG substring assertion was replaced with explicit authoritative Codex counters. Gallery and exact-main before/after renderer evidence are saved in qa/0.5. Physical-device checks remain separate.
