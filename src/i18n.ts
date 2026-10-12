import type { Rarity, Stage } from './types';

// All player-facing copy lives here; new languages can reuse the same shape.
export const ru = {
  app: 'Chipper', version: 'Маленькая жизнь, большое любопытство',
  home: 'Дом', incubator: 'Инкубатор', collection: 'Коллекция', activities: 'Активности',
  settings: 'Настройки', back: 'Назад', close: 'Закрыть', retry: 'Повторить',
  loading: 'Знакомимся с вашим гнёздышком…', saving: 'Сохраняем…', waiting: 'Подождите…',
  renderErrorTitle: 'Гнёздышку нужна перезагрузка', renderErrorBody: 'Ваш прогресс сохранён. Попробуйте открыть игру заново.', reload: 'Перезагрузить',
  outsideTitle: 'Ваш цыплёнок ждёт в Telegram', outsideBody: 'Откройте Chipper из нашего бота: там прогресс привязан к вашему аккаунту и бережно сохраняется.', openBot: 'Открыть в Telegram',
  devMock: 'Локальная песочница · данные этого браузера',
  offline: 'Сеть потерялась. Прогресс остаётся на сервере.', errorTitle: 'Не удалось связаться с гнёздышком',
  errorBody: 'Повторите действие, когда появится соединение.', refreshed: 'Состояние обновлено',
  welcomeTitle: 'Кто-то ждёт встречи', welcomeBody: 'В этом яйце — ваш первый цыплёнок. Он будет расти рядом с вами, в своём темпе.', start: 'Начать',
  tapEgg: 'Коснитесь яйца', tapEggBody: 'Три лёгких касания — и новая история начнётся.', tapProgress: (n: number) => `Касание ${n} из 3`, hatching: 'Скорлупа раскрывается…',
  firstHatch: 'Привет, маленький!', firstHatchBody: 'У каждого цыплёнка свой характер. Как назовём вашего?',
  nameLabel: 'Имя цыплёнка', namePlaceholder: 'Например, Пип', nameHint: 'От 1 до 20 символов. Имя можно изменить позже.', nameInvalid: 'Введите от 1 до 20 символов без управляющих знаков.', nameSave: 'Сохранить имя', skipName: 'Оставить это имя', complete: 'Пойдём домой',
  homeEyebrow: 'Хорошо, что вы здесь', homeGreeting: 'Кажется, кто-то соскучился', sleeping: 'Тихий час', sleepRemaining: 'Проснётся через', sleepSync: 'Пора просыпаться. Проверяем…',
  sleepy: 'Пора немного отдохнуть', hungry: 'Немного зёрнышек не помешает', happy: 'Хорошо быть вместе', fed: 'Хрум-хрум!', played: 'Вот это прыжок!', sleepStarted: 'Уютных снов', rewardCare: '+1 пёрышко за заботу',
  hunger: 'Сытость', mood: 'Настроение', energy: 'Бодрость', needs: 'Потребности цыплёнка', feed: 'Покормить', play: 'Поиграть', sleep: 'Спать',
  actionAvailable: 'Можно сейчас', actionAfter: 'Через', sleepDuration: '45 минут', sleepLocked: 'Пока спит',
  careTitle: 'Два маленьких добрых дела', careBody: 'Покормите и поиграйте с одним цыплёнком за 30 минут. Это помогает ему расти.', careRewardAvailable: 'Пёрышко за заботу доступно', careRewardAfter: 'Следующее пёрышко через',
  careStartedFeed: 'Кормление засчитано. Осталось поиграть', careStartedPlay: 'Игра засчитана. Осталось покормить',
  growthTitle: 'Растём понемногу', growthBaby: 'Подросток: возраст от 20 часов и 1 цикл заботы.', growthTeen: 'Взрослая птица: возраст от 72 часов и 3 цикла заботы с интервалом 20 часов.', growthAdult: 'Уже взрослая птица. Забота всё так же радует!', careCycles: (n: number) => `Циклов заботы: ${n}`,
  restHint: 'Остальные цыплята отдыхают в коллекции. Их показатели не снижаются.',
  emptyCollection: 'Здесь скоро станет уютнее', emptyCollectionBody: 'Первый цыплёнок появится после вылупления.',
  collectionTitle: 'Ваше маленькое семейство', collectionBody: (n: number) => `${n} ${plural(n, 'цыплёнок', 'цыплёнка', 'цыплят')} · каждый со своей историей`,
  sortLabel: 'Порядок коллекции', newest: 'Сначала новые', rarest: 'Сначала редкие', active: 'Дома', resting: 'На отдыхе',
  birdCard: 'Карточка цыплёнка', activate: 'Позвать домой', alreadyActive: 'Этот цыплёнок уже дома', rename: 'Изменить имя', born: 'Вылупился', age: 'Возраст', appearance: 'Облик', rarity: 'Редкость', birdId: 'ID цыплёнка', activated: 'Новый друг уже дома', renamed: 'Имя сохранено',
  emptyNestTitle: 'Место для новой истории', emptyNestBody: 'В гнезде помещается одно яйцо. Когда накопите пёрышки, здесь появится новый друг.', eggCost: 'Обычное яйцо · 6 пёрышек', buyEgg: 'Поселить яйцо', needFeathers: (n: number) => `Ещё ${n} ${plural(n, 'пёрышко', 'пёрышка', 'пёрышек')}`,
  eggTitle: 'Под скорлупой что-то происходит', eggBody: 'Яйцу нужно 3 часа тепла. Можно закрыть игру — время продолжит идти.', eggReadyTitle: 'Кажется, уже пора!', eggReadyBody: 'Ваш новый цыплёнок готов знакомиться.', hatchEgg: 'Вылупить', eggReadyIn: 'До встречи осталось', eggBought: 'Яйцо в тепле',
  odds: '12 оригинальных обликов', oddsBody: 'Обычный — 70% · необычный — 25% · редкий — 5%. Редкость влияет только на внешность.',
  newChickTitle: 'В семье пополнение!', newChickBody: 'Новый цыплёнок уже в коллекции. Можно позвать его домой или оставить пока отдыхать.', goCollection: 'В коллекцию',
  activitiesTitle: 'Немного веселья', gameTitle: 'Собери зёрнышки', gameBody: 'Ловите появляющиеся зёрнышки. Всего 25 секунд — сколько успеете собрать?', gameStart: 'Играть', gameRewardAvailable: '+1 пёрышко за завершённый раунд', gameRewardAfter: 'Новое пёрышко через', gameRepeatHint: 'Играть можно сколько угодно. Награда доступна раз в 20 часов.', gameSleepHint: 'Тихая игра: сон вашего питомца продолжается.',
  score: 'Зёрнышки', seconds: 'сек', grain: 'Собрать зёрнышко', gameLeave: 'Закончить без результата', gameResultTitle: 'Отличная прогулка!', gameResultBody: (n: number) => `Собрано ${n} ${plural(n, 'зёрнышко', 'зёрнышка', 'зёрнышек')}.`, gameRewarded: '+1 пёрышко в копилку', gameNotRewarded: 'Играли ради удовольствия. Следующая награда ещё отдыхает.', playAgain: 'Ещё раунд', goHome: 'Домой', gameFinishing: 'Сохраняем результат…',
  settingsTitle: 'Как вам уютнее', sound: 'Звуки', soundHint: 'Короткие тихие сигналы после действий', animation: 'Анимации', animationHint: 'Дыхание, прыжки и движение скорлупы', haptics: 'Вибрация', hapticsHint: 'Лёгкий отклик на устройствах Telegram', preferenceHint: 'Эти настройки сохраняются только на этом устройстве.', about: 'Chipper 0.1 · закрытая альфа', privacy: 'Игра использует ваш Telegram ID для сохранения прогресса. Телефон и контакты не нужны.',
  refresh: 'Обновить состояние', footer: 'Тут можно просто быть рядом.', feathers: (n: number) => `${n} ${plural(n, 'пёрышко', 'пёрышка', 'пёрышек')}`,
  stage: { baby: 'Птенец', teen: 'Подросток', adult: 'Взрослая птица' } satisfies Record<Stage, string>,
  rarities: { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий' } satisfies Record<Rarity, string>,
};

export function plural(n: number, one: string, few: string, many: string): string {
  const value = Math.abs(n) % 100;
  return value > 10 && value < 20 ? many : value % 10 === 1 ? one : value % 10 >= 2 && value % 10 <= 4 ? few : many;
}

export function duration(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h} ч ${String(m).padStart(2, '0')} мин`;
  return `${String(m).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ageText(ms: number): string {
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')}`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

export const birthText = (timestamp: number): string => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(timestamp));

export const normalizeName = (name: string): string => name.normalize('NFC').trim().replace(/\s+/gu, ' ');
export const validName = (name: string): boolean => {
  const invalidFormat = Array.from(name).some(character => /\p{Cf}/u.test(character) && character !== '\u200d');
  if (/\p{Cc}/u.test(name) || invalidFormat) return false;
  const value = normalizeName(name);
  const length = Array.from(value).length;
  return length >= 1 && length <= 20 && value.split('\u200d').join('').trim().length > 0;
};
