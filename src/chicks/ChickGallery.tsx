import { memo, useEffect, useState } from 'react';
import { ChickArt } from '../components/ChickArt';
import { getAppearanceLabel, type ChickDirection, type ChickPose, STAGE_LABELS, visualDetailsFor } from './models';
import { PREVIEW_CHICKS } from './previewFixtures';
import type { Stage } from '../types';
import './gallery.css';

const STAGES: Stage[] = ['baby', 'teen', 'adult'];
const POSES: ChickPose[] = ['idle', 'walk', 'turn', 'look', 'preen', 'peck', 'yawn', 'tap', 'stroke', 'held', 'land', 'feed', 'play', 'sleep', 'wake', 'flap', 'hit', 'hatch', 'grow', 'sneeze', 'startle', 'stretch', 'shake', 'stumble'];

// Hero playback must not regenerate 90 static SVGs on every phase tick.
const GalleryFamily = memo(function GalleryFamily({ index, selected, onSelect }: { index: number; selected: boolean; onSelect: (index: number) => void }) {
  const bird = PREVIEW_CHICKS[index]!;
  const visual = visualDetailsFor(bird);
  return <article className={`gallery-family ${selected ? 'gallery-family--selected' : ''}`}>
    <button type="button" className="gallery-select" aria-pressed={selected} onClick={() => onSelect(index)}><strong>{index + 1}. {visual.personalityLabel}</strong><span>{bird.appearanceId} · {getAppearanceLabel(bird)}</span></button>
    <div className="gallery-age-row">{STAGES.map((age) => <div key={age}><ChickArt chick={{ ...bird, stage: age }} animate={false} size={130} /><span>{STAGE_LABELS[age]}</span></div>)}</div>
    <p className="gallery-personality">{visual.personalityDescription}</p>
    <p className="gallery-traits">{bird.genes.headShape} · {bird.genes.bodyShape} · {bird.genes.eyeStyle} · {bird.genes.beakShape} · {bird.genes.legShape} · {bird.genes.wingShape} · {bird.genes.tailShape} · {bird.genes.crestShape}</p>
  </article>;
});

/** Loaded by the DEV route only, entirely absent from the production bundle. */
export default function ChickGallery() {
  const [theme, setTheme] = useState('light');
  const [selected, setSelected] = useState(0);
  const [pose, setPose] = useState<ChickPose>('walk');
  const [direction, setDirection] = useState<ChickDirection>('right');
  const [animate, setAnimate] = useState(false);
  const [phase, setPhase] = useState(0);
  const [stage, setStage] = useState<Stage>('adult');
  const [narrow, setNarrow] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!animate || reduced) return;
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      if (document.hidden) return;
      if (now - last >= 32) { setPhase((now / (pose === 'flap' ? 450 : pose === 'feed' ? 1100 : 900)) % 1); last = now; }
      raf = requestAnimationFrame(frame);
    };
    const visibility = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility); };
  }, [animate, pose, reduced]);
  const chick = { ...PREVIEW_CHICKS[selected]!, stage };
  const visual = visualDetailsFor(chick);
  return <main className={`chick-gallery ${narrow ? 'chick-gallery--narrow' : ''}`} data-theme={theme}>
    <header><p className="gallery-eyebrow">CHIPPER 0.5 · БЮРО СТРАННЫХ ПТИЦ</p><h1>Chick Visual System 3.0</h1><p>30 характеров × 3 возраста × 12 палитр. Нелепые, лохматые, свои.</p><p className="gallery-contract">Исторические гены V2 сохранены. Декоративный visualVersion 3 одинаков в Доме, коллекции, гостях и Flaps.</p></header>
    <section className="gallery-tools">
      <label>Тема<select aria-label="Тема" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>
      <label>Поза<select aria-label="Поза" value={pose} onChange={(event) => setPose(event.target.value as ChickPose)}>{POSES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Направление<select aria-label="Направление" value={direction} onChange={(event) => setDirection(event.target.value as ChickDirection)}><option>right</option><option>left</option><option>front</option></select></label>
      <label>Возраст<select aria-label="Возраст" value={stage} onChange={(event) => setStage(event.target.value as Stage)}>{STAGES.map((value) => <option key={value} value={value}>{STAGE_LABELS[value]}</option>)}</select></label>
      <label><input type="checkbox" checked={animate && !reduced} disabled={reduced} onChange={(event) => setAnimate(event.target.checked)} />Анимация{reduced ? ' · reduced motion' : ''}</label>
      <label><input type="checkbox" checked={narrow} onChange={(event) => setNarrow(event.target.checked)} />Ширина 320px</label>
      <label className="gallery-phase">Фаза<input type="range" min="0" max="1" step=".01" value={phase} onChange={(event) => { setAnimate(false); setPhase(Number(event.target.value)); }} /></label>
    </section>
    <section className="gallery-hero"><ChickArt chick={chick} pose={pose} direction={direction} phase={phase} animate={animate} size={300} /><div><p className="gallery-eyebrow">ЛИЧНОЕ ДЕЛО №{selected + 1}</p><h2>{visual.personalityLabel}</h2><p>{visual.personalityDescription}</p><p>{getAppearanceLabel(chick)}</p><p className="gallery-contract">{chick.genes.headShape} / {chick.genes.bodyShape} / {chick.genes.legShape} / {chick.genes.tailShape}<br />Лапы на y=282 · ID и гены задают неизменный характер</p></div></section>
    <section className="gallery-grid" aria-label="90 возрастных вариантов">
      {PREVIEW_CHICKS.map((bird, index) => <GalleryFamily index={index} selected={index === selected} onSelect={setSelected} key={bird.id} />)}
    </section>
  </main>;
}
