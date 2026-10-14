# Chipper 0.3 — визуальная и браузерная QA

Это фактические локальные снимки Chromium 153 и синтетического Telegram host. Они не являются приёмкой подписанных Telegram-аккаунтов или физического Android/iOS. Полный source SHA, итоговые unit/UI counts и статус облака фиксирует `DOCS/ACCEPTANCE_RESULT_0.3.md`.

Финальный целевой прогон: **24/24 PASS, 25,6 с**, после `npm run build`:

```bash
CHIPPER_CAPTURE_QA=1 CHIPPER_CHROMIUM_PATH=/tmp/chipper-browser/chromium \
  npx playwright test tests/ui/v03-layout.spec.ts tests/ui/v03-touch.spec.ts \
  tests/ui/v03-growth.spec.ts tests/ui/v03-social.spec.ts --workers=2
```

Отдельный повтор Collection/Shop: **1/1 PASS, 4,9 с**. Он обновил `shop-light.png` после окончания перехода экрана, чтобы снимок не показывал промежуточную прозрачность. Обычные проверки без `CHIPPER_CAPTURE_QA` пишут в игнорируемый `test-results/qa/0.3`, сохраняя эту evidence и историческую 0.2.

| Evidence | Что действительно проверено |
|---|---|
| `home-native-{light,dark}-{320,360,390,430}.png` | 8 сочетаний темы/viewport: центр HUD вне native Close/menu targets, care и summary ≥44 px, центральный Дом, отсутствие document overflow, нижний зазор dock ≥20 px с bottom safe16 |
| `growth-native-{light,dark}-{320,360,390,430}.png` | Карточка сохраняет защищённый собственный HUD/back на тех же 8 размерах |
| `flaps-native-dark-320.png` | Нативный protected center, полностью читаемое название, отдельные очки/контролы, работающий выход |
| `collection-eggs-light.png`, `shop-light.png` | Настоящее вылупление внутри Коллекции, возврат к птенцам, честный coming-soon Магазин без оплаты |
| `growth-{baby,teen,adult}-past-preview-light.png` | 1/2/3 открытые стадии; будущие disabled и `?`; просмотр прежнего возраста не меняет сохранённые genes, stage или уход |
| `touch-held-light.png`, `touch-drag-light.png` | Реальный pointer hold250ms/drag/land, отдельный stroke/tap, тень на земле, отмена/second-pointer/tab/background cleanup и reduced motion |
| `social-private-invite-dark.png`, `social-onboarding-return-dark.png` | Private по умолчанию, запрос дружбы по opaque invite, новый синтетический игрок проходит onboarding и возвращается к намерению |
| `social-read-only-visit-dark.png` | Принятая дружба, разрешённая active bird, приватная коллекция скрыта, read-only сцена не изменяет владельца |
| `gift-pending-dark.png`, `gift-accepted-dark.png` | Предложение/подтверждение и настоящее принятие через production browser adapter + реальные SQLite сервисы; ровно один получатель того же chick ID/genes/name/bornAt без валютной награды |
| `shared-chick-card.png` | Оригинальная выгрузка PNG720×900, полный URL помещается в две строки; backend whitelisted DTO и отозванная ссылка проверены |
| `theme-candidates.png`, `ui-*.png` | Дополнительные UI evidence агента: три палитры, защищённый HUD, Flaps pause; основными финальными снимками являются файлы выше |

В browser tests также реально выполнены 20 быстрых смен вкладок, keyboard-height rename, legacy `?tab=incubator`/`#incubator` redirect, malformed social intent и forced no-blur fallback. Социальные A/B/C здесь синтетические, локальные и не раскрывают реальные данные игроков.

## Визуальная проверка

Снимки Home light/dark320–430, Flaps320, рост, held/drag, private invite, visits, pending/accepted gifts и PNG открыты и визуально просмотрены. В ходе проверки исправлены возврат после hatch к секции птенцов, обрезание Flaps title320, длинный URL карточки и запрос недопустимого private profile после успешного consent-request. На320 птица компактнее из-за ограничения высоты; обязательные цели ухода и безопасная область остаются доступными.

## Измеренный локальный performance smoke

`perf-smoke.json`: 5 секунд, **160→160 DOM nodes**, **298 кадров**, P95 интервала **16,8 мс**, **0 long tasks**. После Telegram deactivation за300ms **0 новых requestAnimationFrame**. Это локальная проверка стабильности и lifecycle, а не гарантия FPS на устройстве пользователя.

Signed A/B/C, реальный native header drag/keyboard/swipe Android/iOS, screen reader, font scaling200% и orientation остаются приёмкой владельца, пока не исполнены на реальных устройствах. Наличие этих файлов не означает выполненный облачный deploy.
