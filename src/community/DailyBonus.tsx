import type { DailyBonusStatus } from '../types';
import { Icon } from '../screens/Elements';
import { duration } from '../i18n';
import './dailyBonus.css';

export interface DailyBonusProps {
  bonus: DailyBonusStatus;
  /** Parent supplies server snapshot time plus monotonic elapsed time. */
  serverNow: number;
  busy: boolean;
  onClaim: () => void;
  onRefresh?: () => void;
  compact?: boolean;
}

/** Countdown is presentation only: eligibility always comes from the server. */
export function DailyBonus({ bonus, serverNow, busy, onClaim, onRefresh, compact = false }: DailyBonusProps) {
  const remaining = Math.max(0, bonus.nextResetAt - serverNow);
  const needsRefresh = !bonus.available && remaining === 0;
  const caption = bonus.available ? `+${bonus.rewardAmount} пёрышко · без серии и спешки`
    : needsRefresh ? 'Новый день — проверьте подарок' : `Подарок получен · новый через ${duration(remaining)}`;
  return <article className={`daily-bonus${compact ? ' daily-bonus--compact' : ''}${bonus.available ? ' is-available' : ' is-claimed'}`} aria-label="Ежедневный подарок" data-day-utc={bonus.dayUTC}>
    <span className="daily-bonus-icon" aria-hidden="true"><Icon name={bonus.available ? 'feather' : 'check'} size={compact ? 20 : 24} /></span>
    <div className="daily-bonus-copy"><h2>Ежедневный подарок</h2><p>{caption}</p>{!compact && <small>Обновляется в 00:00 UTC. Пропущенные дни не копятся.</small>}</div>
    {bonus.available ? <button type="button" className="daily-bonus-claim" disabled={busy} onClick={onClaim} aria-label={`Забрать ежедневный подарок: ${bonus.rewardAmount} пёрышко`}>{busy ? 'Сохраняем…' : 'Забрать'}</button>
      : needsRefresh && onRefresh ? <button type="button" className="daily-bonus-claim daily-bonus-refresh" disabled={busy} onClick={onRefresh}>Проверить</button>
        : <span className="daily-bonus-done">У вас</span>}
  </article>;
}
