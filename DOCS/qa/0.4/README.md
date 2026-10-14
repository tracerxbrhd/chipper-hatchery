# Chipper 0.4 — фактические локальные QA-материалы

14 октября 2026. Здесь **98 настоящих браузерных PNG**. Production Vite build, Chromium `153.0.8010.0`, synthetic Telegram Android/native chrome, реальные production services на локальной SQLite. Это **PASS automated**, а не `PASS live`: подпись транспорта синтетическая, устройства владельца A/B/C и физический Android ещё не проверены.

Финальный направленный прогон — **22 / 22 PASS**, приблизительно 1,2 минуты:

```bash
CHIPPER_CHROMIUM_PATH=/workspace/scratch/d0f1040c67ed/browser-temp/chromium \
CHIPPER_CAPTURE_QA=1 npx playwright test \
  tests/ui/v04-community.spec.ts tests/ui/v04-tower.spec.ts \
  tests/ui/v04-performance.spec.ts --workers=2
```

Путь Chromium — конкретный путь использованной рабочей среды. На обычной машине достаточно штатного установленного Playwright Chromium. Без `CHIPPER_CAPTURE_QA=1` повторные проверки пишут в `test-results/qa/0.4` и не перезаписывают эти материалы.

## Что действительно проверено

Матрица **320×568 / 360×640 / 390×844 / 430×932**, светлая и тёмная темы:

| Файлы | Сценарий |
|---|---|
| `home-one-daily-native-*` | Одна собственная птица; ежедневный подарок в кнопке заголовка, summary доступен над dock |
| `home-two-native-*` | Собственная птица + ровно один read-only гость |
| `daily-available-native-*`, `daily-claimed-native-*` | Реальный серверный claim +1, доступная и полученная карточки; popup полностью помещается в viewport |
| `codex-native-*`, `codex-traits-native-*` | Прогресс 10/51 и реальные найденные/неизвестные признаки, 10 категорий, 51 запись |
| `profile-photo-native-*`, `profile-fallback-native-*` | Только собственная verified identity; контролируемое изображение и fallback без фото/username |
| `tower-build-native-*`, `tower-wave-native-*` | Запрещённая дорожка, покупка башни, начало настоящей детерминированной волны |
| `tower-paused-native-*`, `tower-result-native-*` | Пауза без движения ticks; корректный retire с нулевой наградой за незавершённые волны |
| `tower-recovered-wave-one-dark-390.png`, `tower-recovered-reward-three-dark-390.png` | После pause/save/exit/reload восстановлена та же карта; пройдены 3 настоящие волны с улучшениями, выдано +1 за серверно verified wave |

Отдельные браузерные проверки: tap/hold/drag своего питомца при госте и reduced motion; чужая запись не меняется; замена Б→В оставляет одного гостя; приватность Б после refresh удаляет гостя. Broken avatar и смена Telegram account очищают прежние собственные metadata, `initDataUnsafe.user` не имеет authority. Lost **committed** checkpoint/finish responses повторяются с исходным UUID и идентичным payload, башни/coins/completedRuns не дублируются. TD сохраняет работающую симуляцию при выключенных sound/haptics и reduced motion.

QA посмотрел реальные PNG, обнаружил и проверил исправления: ежедневная inline-карточка первоначально обрезала summary на 320px; начальный popup уходил за левый край; TD title обрезался многоточием и некоторые кнопки были меньше 44px. Финальные захваты содержат исправления и соответствующие assertions. Дополнительно проверены крупный Profile430, found/locked Codex320, пара птиц320/430, TD build/wave/pause/results320 и фактический результат третьей волны390.

## Измерения и пределы доказательств

`browser-perf.json`: два образца по 2500ms. Пара — 150 кадров, p95 интервала **16,8ms**, DOM 210→213; TD — 150 кадров, p95 **16,7ms**, DOM 57→57. Long tasks в этих образцах не зарегистрированы. После Telegram deactivated оба сценария за 350ms запланировали **0 RAF**, TD ticks/HP неподвижны. Это локальный headless smoke; значения heap — грубое значение браузерного API, не точный анализ памяти. FPS физического Android не утверждается.

`backend-perf.json` воспроизводится:

```bash
CHIPPER_CAPTURE_QA=1 node scripts/qa-v04-performance.mjs
```

Реальные 100 завершённых Flaps оставили aggregate **152117 bytes**, **202 постоянных operation receipts** и 10 недавних attempts. Повтор первых start/finish не добавил награду или попытку. Постоянные receipts всё ещё растут; первая start receipt хранит старый bird snapshot для точного replay. Это известное ограничение, не заявленная безграничная оптимизация.

На 101 синтетической player row входящий gift JSON lookup имеет p95 **0,457ms** в 50 samples. `EXPLAIN QUERY PLAN` прямо показывает `SCAN p` и correlated `json_each`; большой production-scale не проверен. Gift authority/двухстрочный CAS не менялся ради этого измерения.

25 легальных headless waves, 6752 ticks: повтор production rules с commands имел p95 **1,771ms**, max **1,927ms**, самый большой сохранённый checkpoint **5637 bytes**, максимум 16 commands в измеренном batch. Серверный предел — 64 команды/1200 ticks/32KiB. Измерена одна легальная стратегия, а не весь худший предел V8; настоящий cloud CPU и SDK совместимость остаются частью авторизованного live preflight. TD transcript не сохраняется в player JSON; постоянные compact payment/start fences сохраняются и растут.

`check-working.txt` и `storage-perf.json` принадлежат отдельной общей проверке оркестратора. Итоговые полные gate, source SHA, cloud blocker и сценарии владельца — в `DOCS/ACCEPTANCE_RESULT_0.4.md` и `DOCS/DEPLOYMENT_0.4.md`.
