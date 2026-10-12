# Контракт реализации Chipper 0.1

Все времена — целые миллисекунды UTC. Сервер определяет игрока исключительно из проверенного `ctx.initData.user.id`. Клиентские ownerId/userId не используются.

## API

Методы: bootstrap, getHome, listChicks, getIncubator, hatchEgg, completeOnboarding, careAction, activateChick, renameChick, buyEgg, startMiniGame, finishMiniGame, logEvent.

Успех: `{ok:true,state:Snapshot,result?:object}`. Ошибка: `{ok:false,error:{code,message,retryable,retryAt?:number}}`. Все ответы успеха включают полный снимок без истории операций и аналитики.

Snapshot: `{revision,serverNow,balanceVersion,player:{telegramId,feathers,activeChickId,onboarding,careRewardAt,miniGameRewardAt},chicks:Chick[],egg:Egg|null}`. onboarding = egg | name | done.

Chick: `{id,appearanceId,rarity,name,bornAt,stage,hunger,mood,energy,lastFeedAt,lastPlayAt,sleepUntil,careMilestones:number[]}`. stage = baby | teen | adult; rarity = common | uncommon | rare. Отсутствующие таймеры — null.

Egg: `{id,kind,createdAt,readyAt}`; kind = starter | ordinary. Вылупленные яйца остаются в серверной истории для устойчивого повторного hatch, но не занимают слот снимка.

Все мутации получают `operationId` (UUID). При сетевой ошибке клиент повторяет точно те же параметры и ключ. careAction: `{chickId,action:'feed'|'play'|'sleep',operationId}`; activate/rename: `{chickId,name?,operationId}`; hatch: `{eggId,operationId}`; buy/complete/start: `{operationId}`; finish: `{attemptId,score,operationId}`. start возвращает result `{attemptId,startedAt,finishAfter,expiresAt}`; hatch — `{chickId}`; finish/care — `{rewarded:boolean}`.

## Атомарность

В SQLite один агрегат на игрока: primary-key Telegram ID, revision, JSON state. Инициализация — INSERT ON CONFLICT DO NOTHING. Каждая операция читает агрегат, вычисляет чистый переход, затем делает один UPDATE WHERE id AND revision = expected с RETURNING. При конфликте пересчитывает переход. Валюта, птицы, яйца, milestones, попытки, receipts и минимальная аналитика сохраняются одной атомарной записью. Нет неподтверждённых многооператорных транзакций. Внешние ключи не требуются.

Серверный service экспортирует `createGameService({store,now,random,id})`, его `call(method,params,ctx)` возвращает envelope. store: `read(telegramId) -> {revision,state}|null`, `create(telegramId,state)`, `compareAndSwap(telegramId,revision,state) -> boolean`. domain содержит централизованный BALANCE и APPEARANCES. Случайность и часы внедряются в тестах.

## Владение файлами

- Серверный агент: tgcloud/**; не правит src/tests/config.
- Агент графики: src/components/**, src/art.css; не правит App/API/types.
- Агент экранов: src/App.tsx, src/screens/**, src/app.css, src/i18n.ts; не правит tgcloud/компоненты/API.
- Оркестратор: src/api/**, src/types.ts, src/main.tsx, tests/**, scripts/**, конфигурация, CI, отчёт и интеграция.

Команды: npm run dev, npm run typecheck, npm run lint, npm test, npm run build, npm run test:ui. Production никогда не подключает dev mock; отдельная compile-time переменная VITE_DEV_MOCK=true допускается только в Vite DEV.
