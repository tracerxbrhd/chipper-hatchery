import { useMemo, useState } from 'react';
import { ChickArt } from '../components/ChickArt';
import { TRAIT_TAXONOMY, codexPreview, type TraitCodexProgress } from './registry';
import './codex.css';

type DiscoveryFilter = 'all' | 'found' | 'unknown';
export function TraitCodex({ codex, reducedMotion = false }: { codex?: TraitCodexProgress | null; reducedMotion?: boolean }) {
  const [categoryId, setCategoryId] = useState('all');
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const discovered = useMemo(() => new Set(codex?.version === 1 ? codex.discoveredIds : []), [codex]);
  const total = TRAIT_TAXONOMY.reduce((count, category) => count + category.traits.length, 0);
  const found = TRAIT_TAXONOMY.reduce((count, category) => count + category.traits.filter((trait) => discovered.has(trait.id)).length, 0);
  const categories = TRAIT_TAXONOMY.filter((category) => categoryId === 'all' || category.id === categoryId);
  const unavailable = !codex || codex.version !== 1;
  return <section className="trait-codex" aria-label="Кодекс признаков">
    <p className="eyebrow">Открытия вашей коллекции</p>
    <h1>Кодекс признаков</h1>
    <p className="intro">Птенцы и подарки открывают новые признаки.</p>
    <div className="quiet-card codex-progress">
      <div><span>Обнаружено признаков</span><strong data-testid="codex-total">{found}<small> / {total}</small></strong></div>
      <div className="codex-progress-track" role="progressbar" aria-label="Общий прогресс Кодекса" aria-valuenow={found} aria-valuemin={0} aria-valuemax={total}><i style={{ width: `${found / total * 100}%` }} /></div>
      <p>{unavailable ? 'Откройте игру заново, чтобы загрузить ваши открытия.' : found === total ? 'Все знакомые признаки найдены. Какая чудесная коллекция!' : 'Даже подарив птицу другу, вы сохраните её открытия.'}</p>
    </div>
    <div className="codex-filters">
      <label htmlFor="codex-category">Категория<select id="codex-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
        <option value="all">Все категории</option>{TRAIT_TAXONOMY.map((category) => <option key={category.id} value={category.id}>{category.label} · {category.traits.filter((trait) => discovered.has(trait.id)).length}/{category.traits.length}</option>)}
      </select></label>
      <div className="segmented codex-discovery-filter" role="group" aria-label="Показать признаки">{([['all', 'Все'], ['found', 'Найдены'], ['unknown', 'Неизвестны']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
    </div>
    <div className="codex-categories">{categories.map((category) => {
      const categoryFound = category.traits.filter((trait) => discovered.has(trait.id)).length;
      const visible = category.traits.filter((trait) => filter === 'all' || discovered.has(trait.id) === (filter === 'found'));
      return <section className="codex-category" key={category.id} aria-labelledby={`codex-${category.id}`}>
        <div className="codex-category-heading"><h2 id={`codex-${category.id}`}>{category.label}</h2><span aria-label={`Найдено ${categoryFound} из ${category.traits.length}`}>{categoryFound} / {category.traits.length}</span></div>
        {visible.length === 0 ? <p className="codex-empty">{filter === 'found' ? 'Пока нет открытий в этой категории.' : 'Все признаки этой категории уже найдены.'}</p> : <ul className="codex-traits">{visible.map((trait) => {
          const isFound = discovered.has(trait.id);
          return <li key={trait.id} className={`codex-trait${isFound ? ' found' : ' locked'}`} data-trait-id={trait.id} data-found={isFound}>
            <div className="codex-trait-preview" aria-hidden="true">{isFound ? <ChickArt chick={codexPreview(trait)} size={96} shadow={false} animate={false} reducedMotion={reducedMotion} /> : <span className="codex-unknown">?</span>}</div>
            <strong>{isFound ? trait.label : 'Неизвестный признак'}</strong>
            {isFound && 'swatch' in trait && <div className="codex-swatch" aria-hidden="true">{trait.swatch?.map((color, index) => <i key={`${color}-${index}`} style={{ backgroundColor: color }} />)}</div>}
            <small>{isFound ? 'Найден' : 'Ещё предстоит найти'}</small>
          </li>;
        })}</ul>}
      </section>;
    })}</div>
    <p className="screen-footnote">Здесь {total} признаков, которые могут встретиться у птенцов Chipper. Образцы показывают один признак и не предсказывают вашу следующую птицу.</p>
  </section>;
}
