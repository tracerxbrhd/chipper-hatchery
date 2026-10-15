# Chipper 0.5 — execution environment evidence

Observed on 2026-10-15 in the managed `/workspace/chipper-hatchery` workspace.
These are environment failures, not successful release gates. No production
endpoint or deployment mutation was invoked.

## Network and installation

The runtime reports `running`, current observations, and an enforced unrestricted
HTTP policy. The executor policy preserves the supplied HTTP/HTTPS sidecar at
`http://proxy:8080`. No configured secret or outbound identity was reported.

`npm ci --fetch-retries=0 --fetch-timeout=15000 --no-audit --no-fund` was actually
run with a 45-second outer timeout. It failed immediately with exit code 1:

```text
request to https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz failed
connect EPERM 172.31.8.93:8080
```

The local npm cache is empty. The supplied Node runtime does not contain this
project's React, ReactDOM, TypeScript, Vite, ESLint, or Vitest dependencies.
No proxy bypass, policy edit, dependency substitution, or permission prompt was
used. The package manifests and lockfile were left unchanged by this audit.

## Actual gate attempts

| Command | Actual result |
| --- | --- |
| `npm ci` with bounded fetch options above | FAIL: sidecar connection rejected by executor (`EPERM`) |
| `npm run check` | BLOCKED / exit 127: `tsc: not found` |
| `npm run test:ui` | BLOCKED / exit 1: globally supplied Playwright lacks the project's test runner; `unknown command 'test'` |
| `node scripts/check-server.mjs` | PASS: Serverless syntax and runtime imports |
| `node /tmp/chipper-native-smoke.mjs` | PASS: twelve independent native Node assertions / real SQLite regression groups, listed below |

The original local logs are `/tmp/chipper-npm-ci.log`,
`/tmp/chipper-check-environment.log`, and
`/tmp/chipper-test-ui-environment.log`. They are temporary diagnostic files,
not versioned release artifacts.

The separate native smoke script uses the production services and existing real
SQLite fixtures, without replacing dependencies or pretending to run Vitest. Its
actual twelve passing groups cover concurrent hatch/purchase, daily claim CAS and
seven-day receipt replay, server sleep and care blocking, Flaps duplicate finish
and single credit, gift transfer with exact historical bird preservation, eight
gift accept/cancel schedules with one final owner, and Nest Defense start replay,
foreign owner rejection, forged wave/state rejection, and unrewarded retirement.
Additional groups cover care cooldown/30-day absence need floors; additive legacy
Codex backfill with preserved birds, receipts, balance and stable repeat revision;
social invitation and acceptance, private visibility, guest visual whitelist,
unchanged foreign snapshot and block revocation; 5,000 canonical V2 gene samples
covering every attainable gene option; and verified Telegram identity / unsafe
avatar rejection.
Its output is `/tmp/chipper-native-smoke.log`. This is useful narrow evidence,
not a replacement for the required full suites or visual acceptance.

## Browser capability probe

System Chromium 154.0.8037.57 and a preinstalled Playwright 1.62.1 library exist.
A real launch using `/usr/bin/chromium` and the project's no-sandbox,
disable-dev-shm-usage, disable-gpu flags failed before a page was created:

```text
crashpad/util/linux/socket.cc:45 setsockopt: Operation not permitted (1)
process did exit: exitCode=null, signal=SIGTRAP
```

No screenshot was produced by that probe. Browser rendering, viewport captures,
and physical Telegram Android/iOS acceptance must remain unverified until a
working supported runtime runs them. Browser emulation never establishes
physical-device Telegram acceptance.

## Reproduction after environment repair

```sh
npm ci
npm run check
CHIPPER_CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```

Use the lockfile's Playwright version and its supported browser where available.
Restoring supported sidecar connectivity and browser process permissions is an
environment prerequisite, not a reason to modify production or reset player data.
