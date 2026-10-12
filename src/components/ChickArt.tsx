import { useId } from 'react';
import '../art.css';

export const APPEARANCE_LABELS: Record<string, string> = {
  charcoal: 'Угольный', cloud: 'Облачный', fluffy: 'Пухляш', spot: 'Пятнышко',
  sleepy: 'Соня', tiny: 'Крошка', ash: 'Пепельный', ginger: 'Рыжий хохолок',
  midnight: 'Полуночный', snow: 'Снежный', star: 'Звёздный', gold: 'Золотистый',
};

export type ChickArtState = 'idle' | 'happy' | 'feed' | 'play' | 'sleepy' | 'sleep' | 'hatch' | 'grow';
export type ChickArtStage = 'baby' | 'teen' | 'adult';

export interface ChickArtProps {
  appearanceId: string;
  stage: ChickArtStage;
  state?: ChickArtState;
  size?: number;
  className?: string;
  reducedMotion?: boolean;
}

interface Palette { body: string; wing: string; accent: string; marking: string; }

const PALETTES: Record<string, Palette> = {
  charcoal: { body: '#292e2b', wing: '#454b44', accent: '#d4a65d', marking: '#c9cbbb' },
  cloud: { body: '#a2aba3', wing: '#798a81', accent: '#bba887', marking: '#e8e9df' },
  fluffy: { body: '#42463d', wing: '#636856', accent: '#bd9b61', marking: '#d4d5b7' },
  spot: { body: '#343c36', wing: '#515b4e', accent: '#d1a261', marking: '#eeeddd' },
  sleepy: { body: '#565c50', wing: '#737864', accent: '#bf9a82', marking: '#d5c3ba' },
  tiny: { body: '#2d3431', wing: '#4d5b51', accent: '#c69b65', marking: '#d7dac8' },
  ash: { body: '#858882', wing: '#666e69', accent: '#baa28b', marking: '#dadbd2' },
  ginger: { body: '#33372f', wing: '#59604a', accent: '#ce7b49', marking: '#cf9b71' },
  midnight: { body: '#293649', wing: '#445369', accent: '#a0a5c7', marking: '#ddd7bb' },
  snow: { body: '#ecefe7', wing: '#c5d4cf', accent: '#9fc4c7', marking: '#4d635a' },
  star: { body: '#36384b', wing: '#52546c', accent: '#c9b779', marking: '#e2cc8c' },
  gold: { body: '#d3b46d', wing: '#595543', accent: '#a78947', marking: '#f0dc9c' },
};

const GEOMETRY = {
  baby: {
    body: 'M94 211C80 194 80 165 96 146C98 116 116 99 142 102C164 85 197 94 210 118C232 130 239 153 227 173C235 207 215 234 178 239C145 244 111 235 94 211Z',
    wing: 'M107 176C126 157 151 171 154 190C156 208 135 224 112 214C129 210 135 201 132 195C122 207 110 207 103 201C113 194 116 186 107 176Z',
    tail: 'M98 186C79 172 75 178 79 188C61 181 63 195 80 204L98 211Z',
    eyeX: 168, eyeY: 143, eyeGap: 29, eyeRadius: 12,
    beakX: 211, beakY: 158, tuftX: 146, tuftY: 103,
    bellyX: 170, bellyY: 202, footY: 239, foot1: 129, foot2: 185, footLength: 18,
  },
  teen: {
    body: 'M91 216C77 195 86 168 108 155C102 136 104 108 124 94C145 81 169 85 177 86C198 76 223 95 224 117C243 132 240 157 220 171C218 187 228 209 211 229C186 251 116 250 91 216Z',
    wing: 'M106 179C133 161 166 177 164 198C162 219 135 232 109 218C133 212 141 202 138 197C124 208 111 209 102 201C116 193 119 187 106 179Z',
    tail: 'M101 183C79 161 65 173 77 189C56 177 52 193 77 206C62 207 75 221 98 218Z',
    eyeX: 178, eyeY: 126, eyeGap: 27, eyeRadius: 11,
    beakX: 222, beakY: 143, tuftX: 157, tuftY: 88,
    bellyX: 176, bellyY: 204, footY: 243, foot1: 125, foot2: 179, footLength: 23,
  },
  adult: {
    body: 'M79 221C60 193 79 163 114 160C141 159 151 143 151 117C151 87 170 69 194 72C219 70 239 91 235 116C252 131 240 155 220 168C202 180 198 193 199 211C201 237 178 253 144 253C112 255 89 246 79 221Z',
    wing: 'M98 184C131 163 171 183 169 205C167 228 133 242 102 223C129 223 142 212 140 205C125 216 111 216 99 208C113 201 117 192 98 184Z',
    tail: 'M90 187C71 150 42 160 60 187C35 173 31 195 66 207C41 208 48 228 88 222Z',
    eyeX: 189, eyeY: 111, eyeGap: 26, eyeRadius: 10,
    beakX: 236, beakY: 129, tuftX: 180, tuftY: 76,
    bellyX: 166, bellyY: 211, footY: 253, foot1: 115, foot2: 169, footLength: 26,
  },
} as const;

const STAGE_LABELS: Record<ChickArtStage, string> = { baby: 'Птенец', teen: 'Подросток', adult: 'Взрослая птица' };
const STATE_LABELS: Record<ChickArtState, string> = {
  idle: 'Спокойно покачивается', happy: 'Радуется', feed: 'Клюёт зёрнышки', play: 'Подпрыгивает',
  sleepy: 'Хочет отдохнуть', sleep: 'Спит', hatch: 'Только что вылупился', grow: 'Подрос',
};

function starPath(x: number, y: number, radius: number): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = (index * Math.PI / 5) - Math.PI / 2;
    const r = index % 2 === 0 ? radius : radius * 0.45;
    return `${x + Math.cos(angle) * r},${y + Math.sin(angle) * r}`;
  });
  return `M${points.join('L')}Z`;
}

/** Original, self-contained vector characters. No downloaded images or fonts. */
export function ChickArt({ appearanceId, stage, state = 'idle', size = 280, className = '', reducedMotion = false }: ChickArtProps) {
  const id = useId();
  const appearance = Object.hasOwn(PALETTES, appearanceId) ? appearanceId : 'charcoal';
  const palette = PALETTES[appearance]!;
  const shape = GEOMETRY[stage];
  const resting = state === 'sleep';
  const drowsy = state === 'sleepy' || appearance === 'sleepy';
  const compact = appearance === 'tiny' ? `translate(29 ${(shape.footY + shape.footLength) * .18}) scale(.82)` : undefined;
  const tuftScale = stage === 'adult' ? 1.25 : stage === 'baby' ? 0.85 : 1;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const clipId = `${id}-body`;

  return (
    <svg
      className={`chick-art chick-art--${state} chick-art--${stage} ${className}`.trim()}
      width={size} height={size} viewBox="0 0 320 320" fill="none"
      role="img" aria-labelledby={`${titleId} ${descriptionId}`}
      data-appearance={appearance} data-stage={stage} data-state={state}
      data-reduced-motion={reducedMotion ? 'true' : undefined}
    >
      <title id={titleId}>{`${APPEARANCE_LABELS[appearance]} — ${STAGE_LABELS[stage].toLowerCase()}`}</title>
      <desc id={descriptionId}>{`${STATE_LABELS[state]}. Оригинальный персонаж Chipper.`}</desc>
      <defs><clipPath id={clipId}><path d={shape.body} /></clipPath></defs>
      <ellipse className="art-halo" cx="160" cy="183" rx="103" ry="98" />
      <ellipse className="chick-shadow" cx="156" cy={shape.footY + shape.footLength + 7} rx="57" ry="8" />
      <g className="chick-float">
        <g className="chick-character" transform={compact}>
          <g className="chick-feet" stroke="var(--art-feet, #5b6155)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={`M${shape.foot1} ${shape.footY - 4}v${shape.footLength + 4}m0 -1l-9 4m9 -4l10 3`} />
            <path d={`M${shape.foot2} ${shape.footY - 5}v${shape.footLength + 5}m0 -1l-9 4m9 -4l10 2`} />
          </g>
          <g fill={palette.body} stroke={appearance === 'snow' ? 'var(--art-snow-outline, #a0b0a5)' : 'var(--art-outline, transparent)'} strokeWidth="1.5" strokeLinejoin="round">
            <path className="chick-tail" d={shape.tail} />
            {appearance === 'fluffy' && (
              <g className="chick-fluff">
                <circle cx="94" cy="177" r="13" /><circle cx="93" cy="205" r="13" />
                <circle cx="110" cy="226" r="12" /><circle cx={stage === 'adult' ? 192 : 206} cy="219" r="13" />
                <circle cx={stage === 'adult' ? 200 : 224} cy={stage === 'adult' ? 204 : 195} r="11" /><circle cx="222" cy="159" r="10" />
              </g>
            )}
            <path d={shape.body} />
          </g>

          <g clipPath={`url(#${clipId})`}>
            {appearance === 'cloud' && <path d={`M${shape.bellyX - 29} ${shape.bellyY - 19}c3 -16 20 -19 28 -9c10 -15 32 -8 28 8c21 6 12 30 -8 29c-16 16 -46 4 -48 -9c-17 -1 -18 -17 0 -19Z`} fill={palette.marking} />}
            {appearance === 'fluffy' && <path d={`M${shape.bellyX - 27} ${shape.bellyY - 12}l9 -7l5 9l10 -8l5 10l11 -8l5 11l10 -4l-4 21l-13 -5l-6 8l-11 -6l-9 6l-5 -10l-12 3Z`} fill={palette.marking} />}
            {appearance === 'spot' && <g fill={palette.marking}><ellipse cx={shape.bellyX + 9} cy={shape.bellyY - 4} rx="18" ry="22" transform={`rotate(-24 ${shape.bellyX + 9} ${shape.bellyY - 4})`} /><ellipse cx={shape.eyeX - 30} cy={shape.eyeY - 22} rx="12" ry="17" /><circle cx={shape.bellyX - 38} cy={shape.bellyY + 23} r="9" /></g>}
            {appearance === 'sleepy' && <path d={`M${shape.bellyX - 13} ${shape.bellyY - 13}q16 15 33 1q-2 28 -24 29q-17 -8 -9 -30Z`} fill={palette.marking} opacity="0.75" />}
            {appearance === 'tiny' && <path d={`M${shape.bellyX} ${shape.bellyY - 8}q23 5 10 28q-21 -5 -10 -28Z`} fill={palette.marking} />}
            {appearance === 'ash' && <g stroke={palette.marking} strokeWidth="6" strokeLinecap="round"><path d={`M${shape.bellyX - 19} ${shape.bellyY - 7}l29 -13M${shape.bellyX - 15} ${shape.bellyY + 8}l32 -13M${shape.bellyX - 6} ${shape.bellyY + 23}l26 -12`} /></g>}
            {appearance === 'ginger' && <path d={`M${shape.eyeX - 18} ${shape.eyeY + 18}q18 19 42 9l-9 24l-10 -6l-8 9l-9 -10l-10 5Z`} fill={palette.marking} />}
            {appearance === 'midnight' && <path d={`M${shape.bellyX + 18} ${shape.bellyY - 15}a22 22 0 1 0 4 36a22 22 0 0 1 -4 -36Z`} fill={palette.marking} />}
            {appearance === 'snow' && <g fill={palette.marking}><path d={`M${shape.eyeX - 36} ${shape.eyeY - 23}q16 -14 39 -7l30 7l-5 -23l-60 -2Z`} /><path d={`M${shape.bellyX - 2} ${shape.bellyY - 6}q-7 16 3 27q13 -15 -3 -27Z`} opacity="0.32" /></g>}
            {appearance === 'star' && <g fill={palette.marking}><path d={starPath(shape.bellyX, shape.bellyY - 2, 12)} /><path d={starPath(shape.bellyX + 27, shape.bellyY - 20, 6)} /><path d={starPath(shape.eyeX - 30, shape.eyeY - 21, 5)} /><circle cx={shape.bellyX + 26} cy={shape.bellyY + 14} r="3" /></g>}
            {appearance === 'gold' && <g fill={palette.marking}><ellipse cx={shape.bellyX + 6} cy={shape.bellyY + 4} rx="28" ry="23" /><path d={`M${shape.eyeX - 30} ${shape.eyeY - 21}q22 -18 57 0l0 -31l-64 0Z`} fill={palette.wing} /></g>}
          </g>

          <g className="chick-wing">
            <path d={shape.wing} fill={palette.wing} />
            <path d={stage === 'adult' ? 'M118 186q23 -3 34 13M113 196q18 1 26 9' : stage === 'teen' ? 'M123 178q20 2 27 16M119 188q14 3 18 10' : 'M120 179q15 3 20 14'} stroke={palette.marking} strokeWidth="2" strokeLinecap="round" opacity="0.38" />
          </g>

          <g className="chick-tuft" transform={`translate(${shape.tuftX} ${shape.tuftY}) scale(${tuftScale})`} fill={appearance === 'ginger' || appearance === 'gold' ? palette.accent : palette.body} stroke="var(--art-outline, transparent)" strokeWidth="1.3" strokeLinejoin="round">
            {appearance === 'cloud' ? <path d="M-9 5C-23 -3 -14 -20 -5 -15C-6 -28 10 -29 11 -16C26 -20 30 -3 13 4Z" />
              : appearance === 'fluffy' ? <path d="M-17 8L-24 -7L-10 -5L-12 -24L0 -15L7 -32L14 -11L25 -16L20 5Z" />
                : appearance === 'sleepy' ? <path d="M-8 5C-18 -19 6 -28 19 -14C24 -6 16 1 10 -2C15 -13 -3 -18 -1 5Z" />
                  : appearance === 'ginger' ? <path d="M-13 7C-25 -2 -21 -16 -11 -16C-14 -31 0 -35 5 -22C13 -39 26 -28 20 -15C33 -15 32 1 15 6Z" />
                    : appearance === 'midnight' ? <path d="M-12 6L-6 -23L5 -15L18 -34L20 -5L9 8Z" />
                      : appearance === 'snow' ? <path d="M-10 6Q-25 -10 -18 -24Q-5 -20 -2 -7Q1 -32 15 -33Q20 -17 8 6Z" />
                        : appearance === 'star' ? <path d={starPath(3, -7, 20)} />
                          : appearance === 'gold' ? <path d="M-16 7L-23 -16L-5 -8L3 -29L12 -9L27 -20L21 7Z" />
                            : appearance === 'ash' ? <path d="M-18 8Q-12 -16 19 -23Q15 -7 4 -2L22 -6L11 8Z" />
                              : appearance === 'tiny' ? <path d="M-5 5Q-19 -10 -9 -22Q4 -19 3 -6Q12 -18 23 -11Q19 3 6 6Z" />
                                : <path d="M-13 7Q-21 -9 -14 -20Q-2 -17 1 -3Q4 -22 19 -23Q21 -8 9 6Z" />}
          </g>

          <g className="chick-face">
            {[0, 1].map((eye) => {
              const x = shape.eyeX + eye * shape.eyeGap;
              const y = shape.eyeY + (eye === 1 ? 1 : 0);
              const r = shape.eyeRadius + (appearance === 'tiny' ? 2 : 0);
              return resting ? <path key={eye} className="chick-eye-closed" d={`M${x - r + 1} ${y}q${r} 9 ${2 * r - 2} 0`} stroke={palette.body === '#ecefe7' ? '#445348' : '#eeeee2'} strokeWidth="3.5" strokeLinecap="round" /> : (
                <g key={eye} className="chick-eye" style={{ transformOrigin: `${x}px ${y}px` }}>
                  <circle cx={x} cy={y} r={r} fill="#f6f6ea" stroke={palette.body} strokeWidth="2" />
                  <circle className="chick-pupil" cx={x + 2.5} cy={y + (state === 'feed' ? 3 : 0.5)} r={r * 0.48} fill="#252c29" />
                  <circle cx={x + 4.4} cy={y - 2} r="1.7" fill="#fffef8" />
                  {drowsy && <path d={`M${x - r} ${y - 2}q${r} -${r * 1.8} ${r * 2} 0Z`} fill={palette.body} />}
                </g>
              );
            })}
            <path className="chick-beak" d={`M${shape.beakX - 4} ${shape.beakY - 7}l17 6l-13 10l-8 -5Z`} fill={palette.accent} stroke="var(--art-beak-outline, transparent)" strokeWidth="1" strokeLinejoin="round" />
            <path d={`M${shape.beakX - 3} ${shape.beakY + 1}l10 -1`} stroke={palette.body} strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
            <ellipse className="chick-cheek" cx={shape.eyeX - 6} cy={shape.eyeY + 19} rx="6" ry="3" fill={palette.accent} opacity="0.28" />
            {state === 'sleepy' && <ellipse className="chick-yawn" cx={shape.beakX - 2} cy={shape.beakY + 7} rx="4" ry="5" fill={palette.wing} />}
          </g>
        </g>
      </g>

      {state === 'feed' && <g className="chick-grains" fill="#b58f52"><ellipse cx="215" cy="274" rx="4" ry="2.5" transform="rotate(-25 215 274)" /><ellipse cx="238" cy="273" rx="3.8" ry="2.5" transform="rotate(30 238 273)" /><ellipse cx="228" cy="282" rx="4" ry="2.3" /></g>}
      {resting && <g className="chick-sleep-marks" stroke="var(--art-mark, #949f94)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M249 109h12l-12 12h12" /><path d="M269 87h9l-9 9h9" /></g>}
      {(state === 'happy' || state === 'play' || state === 'hatch' || state === 'grow') && <g className="chick-sparkles" stroke={palette.accent} strokeWidth="2.4" strokeLinecap="round"><path d="M66 120v12m-6 -6h12" /><path d="M263 173v12m-6 -6h12" /><path d="M254 73v8m-4 -4h8" /></g>}
    </svg>
  );
}
