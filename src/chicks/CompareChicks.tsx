import { useState } from 'react';
import type { Chick, Stage } from '../types';
import { ChickArt } from '../components/ChickArt';
import { ageText, ru } from '../i18n';
import { getAppearanceLabel, visualDetailsFor } from './models';
import './comparison.css';

const STAGES: Stage[] = ['baby', 'teen', 'adult'];

/** Local presentation only. Never persists a preview age or changes historical genes. */
export function CompareChicks({ chicks, now, reducedMotion }: { chicks: readonly Chick[]; now: number; reducedMotion: boolean }) {
  const [selected, setSelected] = useState<[string, string]>(() => [chicks[0]?.id ?? '', chicks[1]?.id ?? '']);
  const [memories, setMemories] = useState<Record<string, Stage>>({});
  const first = chicks.find(chick => chick.id === selected[0]) ?? chicks[0];
  const second = chicks.find(chick => chick.id === selected[1] && chick.id !== first?.id) ?? chicks.find(chick => chick.id !== first?.id);
  if (!first || !second) return null;
  const pair = [first, second] as const;
  return <section className="chick-comparison quiet-card" id="chick-comparison" aria-label="Сравнение птиц">
    <div className="comparison-heading"><div><p className="eyebrow">Два разных чуда</p><h2>Похожи только перьями</h2></div><span aria-hidden="true">↔</span></div>
    <p className="comparison-intro">Рассмотрите характер и детали. В истории роста доступны только прожитые возрасты.</p>
    <div className="comparison-pair">
      {pair.map((chick, index) => {
        const details = visualDetailsFor(chick);
        const memory = memories[chick.id] ?? chick.stage;
        const stage = STAGES.indexOf(memory) <= STAGES.indexOf(chick.stage) ? memory : chick.stage;
        return <article className="comparison-bird" key={`${index}:${chick.id}`} data-chick-id={chick.id}>
          <label className="comparison-select"><span>{index === 0 ? 'Первая птица' : 'Вторая птица'}</span><select aria-label={index === 0 ? 'Первая птица' : 'Вторая птица'} value={chick.id} onChange={event => {
            const next = event.currentTarget.value;
            // Choosing the bird in the other slot swaps the pair atomically.
            // Both controls remain useful even with exactly two saved birds.
            setSelected(index === 0 ? [next, next === second.id ? first.id : second.id] : [next === first.id ? second.id : first.id, next]);
          }}>
            {chicks.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}
          </select></label>
          <div className="comparison-art"><ChickArt chick={{ ...chick, stage }} size={180} animate={false} reducedMotion={reducedMotion} pose={chick.sleepUntil !== null && chick.sleepUntil > now ? 'sleep' : 'idle'} /></div>
          <h3>{chick.name}</h3><span className={`rarity-tag ${chick.rarity}`}>{ru.rarities[chick.rarity]}</span>
          <p className="comparison-personality">{details.personalityLabel}</p>
          <p className="comparison-description">{details.personalityDescription}</p>
          <div className="comparison-growth" role="group" aria-label={`Возраст ${chick.name}`}>
            {STAGES.map((value, position) => {
              const unlocked = position <= STAGES.indexOf(chick.stage);
              return <button type="button" key={value} disabled={!unlocked} aria-pressed={stage === value} aria-label={unlocked ? ru.stage[value] : 'Возраст пока закрыт'} title={unlocked ? ru.stage[value] : 'Возраст пока закрыт'} onClick={() => setMemories(previous => ({ ...previous, [chick.id]: value }))}><span aria-hidden="true">{unlocked ? position + 1 : '?'}</span><small>{unlocked ? value === chick.stage ? 'Сейчас' : 'Был' : 'Позже'}</small></button>;
            })}
          </div>
          <p className="comparison-stage" role="status">{ru.stage[stage]}{stage !== chick.stage ? ' · воспоминание' : ''}</p>
          <dl className="comparison-facts"><div><dt>Наряд</dt><dd>{getAppearanceLabel(chick)}</dd></div><div><dt>Возраст</dt><dd>{ageText(Math.max(0, now - chick.bornAt))}</dd></div><div><dt>Забота</dt><dd>{ru.careCycles(chick.careMilestones.length)}</dd></div></dl>
        </article>;
      })}
    </div>
  </section>;
}
