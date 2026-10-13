import { useEffect, useState } from 'react';
import { ChickArt } from '../components/ChickArt';
import { getAppearanceLabel, type ChickDirection, type ChickPose, STAGE_LABELS } from './models';
import { PREVIEW_CHICKS } from './previewFixtures';
import type { Stage } from '../types';
import './gallery.css';

const STAGES: Stage[] = ['baby', 'teen', 'adult'];
const POSES: ChickPose[] = ['idle', 'walk', 'turn', 'look', 'preen', 'feed', 'play', 'sleep', 'wake', 'flap', 'hit', 'hatch', 'grow'];

/** Loaded by the DEV route only, entirely absent from the production bundle. */
export default function ChickGallery() {
  const [theme, setTheme] = useState('light');
  const [selected, setSelected] = useState(0);
  const [pose, setPose] = useState<ChickPose>('walk');
  const [direction, setDirection] = useState<ChickDirection>('right');
  const [animate, setAnimate] = useState(true);
  const [phase, setPhase] = useState(0);
  const [stage, setStage] = useState<Stage>('adult');
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!animate) return;
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
  }, [animate, pose]);
  const chick = { ...PREVIEW_CHICKS[selected]!, stage };
  return <main className={`chick-gallery ${narrow ? 'chick-gallery--narrow' : ''}`} data-theme={theme}>
    <header><p>Chipper 0.2 · каталог разработчика</p><h1>Chick System 2.0</h1><p>30 оригинальных персонажей × 3 возраста. Один renderer для Дома и Chippster Flaps.</p></header>
    <section className="gallery-tools">
      <label>Тема<select aria-label="Тема" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label>
      <label>Поза<select aria-label="Поза" value={pose} onChange={(event) => setPose(event.target.value as ChickPose)}>{POSES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Направление<select aria-label="Направление" value={direction} onChange={(event) => setDirection(event.target.value as ChickDirection)}><option>right</option><option>left</option><option>front</option></select></label>
      <label>Возраст<select aria-label="Возраст" value={stage} onChange={(event) => setStage(event.target.value as Stage)}>{STAGES.map((value) => <option key={value} value={value}>{STAGE_LABELS[value]}</option>)}</select></label>
      <label><input type="checkbox" checked={animate} onChange={(event) => setAnimate(event.target.checked)} />Анимация</label>
      <label><input type="checkbox" checked={narrow} onChange={(event) => setNarrow(event.target.checked)} />Ширина 320px</label>
      <label className="gallery-phase">Фаза<input type="range" min="0" max="1" step=".01" value={phase} onChange={(event) => { setAnimate(false); setPhase(Number(event.target.value)); }} /></label>
    </section>
    <section className="gallery-hero"><ChickArt chick={chick} pose={pose} direction={direction} phase={phase} animate={animate} size={300} /><div><h2>{getAppearanceLabel(chick)}</h2><p>{chick.genes.headShape} / {chick.genes.bodyShape} / {chick.genes.legShape} / {chick.genes.tailShape}</p><p>Лапы закреплены на y=282. Нажмите карточку для проверки поз.</p></div></section>
    <section className="gallery-grid" aria-label="90 возрастных вариантов">
      {PREVIEW_CHICKS.map((bird, index) => <article className={`gallery-family ${index === selected ? 'gallery-family--selected' : ''}`} key={bird.id}>
        <button type="button" className="gallery-select" onClick={() => setSelected(index)}><strong>{index + 1}. {getAppearanceLabel(bird)}</strong><span>{bird.appearanceId}</span></button>
        <div className="gallery-age-row">{STAGES.map((age) => <div key={age}><ChickArt chick={{ ...bird, stage: age }} animate={false} size={130} /><span>{STAGE_LABELS[age]}</span></div>)}</div>
        <p className="gallery-traits">{bird.genes.headShape} · {bird.genes.bodyShape} · {bird.genes.beakShape} · {bird.genes.legShape} · {bird.genes.wingShape} · {bird.genes.tailShape} · {bird.genes.crestShape}</p>
      </article>)}
    </section>
  </main>;
}
