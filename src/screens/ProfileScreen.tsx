import { TelegramIdentityCard } from '../profile/TelegramIdentityCard';
import { DailyBonus } from '../community/DailyBonus';
import { Achievements } from '../community/Achievements';
import type { Snapshot, SocialSummary } from '../types';
import { duration, ru } from '../i18n';
import { Icon, rewardReadyAt } from './Elements';

export function Profile({ state, now, onSettings, onSocial, social, onCodex, onDailyClaim, onDailyRefresh, onClaimAchievement, busy = false }: { state: Snapshot; now: number; onSettings: () => void; onSocial: () => void; social?: SocialSummary | null; onCodex?: () => void; onDailyClaim?: () => void; onDailyRefresh?: () => void; onClaimAchievement?: (achievementId: string) => void; busy?: boolean }) {
  const flaps = state.player.flaps;
  const readyIn = rewardReadyAt(state.player.miniGameRewardAt) - now;
  return <section className="profile-screen">
    <p className="eyebrow">Ваш маленький мир</p><h1>Профиль</h1>
    <TelegramIdentityCard identity={state.player.telegramIdentity} />
    <article className="quiet-card"><p className="eyebrow">Имя в Chipper</p><h2>{social?.profile.displayName ?? 'Моё гнездо'}</h2><p>Можно изменить в разделе «Друзья и видимость».</p></article>
    <p className="intro">Каждый цыплёнок — отдельная история. Здесь собраны ваши маленькие успехи.</p>
    <div className="profile-stats">
      <article className="profile-stat"><Icon name="collection" /><strong>{state.chicks.length}</strong><span>Цыплят в коллекции</span></article>
      <article className="profile-stat"><Icon name="feather" /><strong>{state.player.feathers}</strong><span>Пёрышек в копилке</span></article>
      <button className="profile-stat" onClick={onCodex}><Icon name="collection" /><strong>{state.codex?.found ?? 0}<small> / {state.codex?.total ?? 51}</small></strong><span>Признаков в Кодексе</span></button>
      <article className="profile-stat"><Icon name="collection" /><strong>{social?.friends.length ?? '—'}</strong><span>Друзей</span></article>
    </div>
    {state.dailyBonus && onDailyClaim && <DailyBonus bonus={state.dailyBonus} serverNow={now} busy={busy} onClaim={onDailyClaim} onRefresh={onDailyRefresh} />}
    <button className="button secondary" onClick={onSettings}><Icon name="settings" />{ru.settings}</button>
    <button className="button primary" onClick={onSocial}>Друзья и видимость</button>
    {onClaimAchievement && <Achievements status={state.achievements} busy={busy} onClaim={onClaimAchievement} />}
    <article className="quiet-card profile-flaps"><p className="eyebrow">Chippster Flaps</p><h2>Ваш лучший полёт</h2><strong className="profile-best" style={{ fontSize: 48, display: 'block', margin: '8px 0', lineHeight: 1 }}>{flaps.bestScore}</strong><p>{flaps.completedRuns} завершённых полётов</p><span className="mini-label">{readyIn > 0 ? `Следующее пёрышко через ${duration(readyIn)}` : 'Пёрышко за следующий полёт от 2 секунд'}</span></article>
    <article className="quiet-card profile-tower"><p className="eyebrow">Защита гнезда</p><h2>Личный рекорд</h2><strong className="profile-best">{state.player.games?.['nest-defense']?.bestScore ?? 0} волн</strong><p>{state.player.games?.['nest-defense']?.completedRuns ?? 0} завершённых защит. Награда зависит от подтверждённых волн, до 4 пёрышек раз в 20 часов.</p></article>
    <article className="about-copy"><h2>Забота без спешки</h2><p>Питомцы не умирают. Пока вас нет, они ждут возвращения, а остальные цыплята отдыхают в коллекции.</p><p>Кормление и игра доступны раз в 4 часа, сон длится 45 минут. Два добрых дела за полчаса дают пёрышко раз в 20 часов. Обычное яйцо стоит 6 пёрышек и вылупляется через 3 часа.</p><h2>Ваш выбор</h2><p>Профиль закрыт по умолчанию. В разделе друзей можно разрешить визиты и отдельно открыть коллекцию.</p><p>{ru.privacy}</p><p className="screen-footnote">Chipper 0.5 · Personality & Visual Overhaul<br />Рекорд Flaps — личная казуальная статистика.</p></article>
  </section>;
}
