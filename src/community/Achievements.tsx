import { useId } from 'react';
import type { AchievementEntry, AchievementStatus } from '../types';
import { Icon, type IconName } from '../screens/Elements';
import './achievements.css';

export interface AchievementsProps {
  status?: AchievementStatus;
  busy: boolean;
  onClaim: (id: string) => void;
}

const categories: Record<string, { label: string; icon: IconName }> = {
  care: { label: 'Забота', icon: 'feed' },
  collection: { label: 'Коллекция', icon: 'collection' },
  games: { label: 'Игры', icon: 'game' },
  social: { label: 'Дружба', icon: 'play' },
};

function AchievementCard({ entry, busy, onClaim }: { entry: AchievementEntry; busy: boolean; onClaim: (id: string) => void }) {
  const labelId = useId();
  const category = categories[entry.category] ?? { label: 'Приключения', icon: 'play' as const };
  const state = entry.claimed ? 'claimed' : entry.unlocked ? 'unlocked' : 'locked';
  const progress = Math.max(0, Math.min(entry.target, entry.progress));
  return <li className={`achievement-card achievement-card--${state}`} data-achievement-id={entry.id} data-achievement-state={state}>
    <div className="achievement-card-heading">
      <span className="achievement-medal" aria-hidden="true"><Icon name={entry.claimed ? 'check' : category.icon} size={22} /></span>
      <span className="achievement-category">{category.label}</span>
      <span className="achievement-reward" aria-label={`Награда: ${entry.rewardAmount} пёрышко`}><Icon name="feather" size={14} />+{entry.rewardAmount}</span>
    </div>
    <h3 id={labelId}>{entry.title}</h3>
    <p className="achievement-description">{entry.description}</p>
    <div className="achievement-progress-copy"><span>{entry.claimed ? 'Готово' : entry.unlocked ? 'Получилось!' : 'В процессе'}</span><span>{progress} / {entry.target}</span></div>
    <div className="achievement-progress" role="progressbar" aria-labelledby={labelId} aria-valuemin={0} aria-valuemax={entry.target} aria-valuenow={progress}>
      <i style={{ width: `${entry.target > 0 ? progress / entry.target * 100 : 0}%` }} />
    </div>
    {entry.claimed ? <span className="achievement-result"><Icon name="check" size={16} />Награда получена</span>
      : entry.unlocked ? <button type="button" className="achievement-claim" disabled={busy} onClick={() => onClaim(entry.id)} aria-label={`Забрать награду за «${entry.title}»: ${entry.rewardAmount} пёрышко`}>{busy ? 'Сохраняем…' : <>Забрать +{entry.rewardAmount}<Icon name="feather" size={16} /></>}</button>
        : <span className="achievement-locked">Всё получится в своём темпе</span>}
  </li>;
}

/** Progress and claim state are server snapshots. A tap never credits locally. */
export function Achievements({ status, busy, onClaim }: AchievementsProps) {
  const headingId = useId();
  if (!status) return <section className="achievements" aria-labelledby={headingId}>
    <h2 id={headingId}>Достижения</h2><p className="achievements-intro">Достижения появятся после синхронизации с сервером.</p>
  </section>;
  const available = status.achievements.filter(entry => entry.unlocked && !entry.claimed).length;
  return <section className="achievements" aria-labelledby={headingId} aria-busy={busy} data-achievements-version={status.version}>
    <header className="achievements-heading"><div><p className="achievement-eyebrow">Маленькие большие дела</p><h2 id={headingId}>Достижения</h2></div><span className="achievements-count" aria-label={`Открыто достижений: ${status.found} из ${status.total}`}>{status.found}<span>/{status.total}</span></span></header>
    <p className="achievements-intro">Забота, открытия и нелепые приключения. Без серий, спешки и пропущенных дней.</p>
    <p className="achievements-summary" aria-live="polite">{available > 0 ? `Можно забрать награды: ${available}` : `Наград получено: ${status.claimed} из ${status.total}`}</p>
    <ul className="achievement-grid">
      {status.achievements.map(entry => <AchievementCard key={entry.id} entry={entry} busy={busy} onClaim={onClaim} />)}
    </ul>
    <p className="achievements-note">За каждое достижение — одно пёрышко. Награду можно забрать один раз.</p>
  </section>;
}
