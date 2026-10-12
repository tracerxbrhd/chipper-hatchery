import { useId } from 'react';
import '../art.css';

export interface EggArtProps {
  cracks?: number;
  hatching?: boolean;
  size?: number;
  reducedMotion?: boolean;
  className?: string;
}

/** A soft, asymmetric speckled shell on a little hand-drawn nest. */
export function EggArt({ cracks = 0, hatching = false, size = 280, reducedMotion = false, className = '' }: EggArtProps) {
  const id = useId();
  const crackCount = Math.min(3, Math.max(0, Math.floor(cracks)));
  return (
    <svg
      className={`egg-art ${crackCount ? 'egg-art--cracked' : ''} ${hatching ? 'egg-art--hatching' : ''} ${className}`.trim()}
      width={size} height={size} viewBox="0 0 320 320" fill="none" role="img"
      aria-labelledby={`${id}-title`} data-cracks={crackCount}
      data-reduced-motion={reducedMotion ? 'true' : undefined}
    >
      <title id={`${id}-title`}>{hatching ? 'Яйцо вылупляется' : crackCount ? 'На скорлупе появились трещинки' : 'Яйцо Chipper в уютном гнезде'}</title>
      <ellipse className="art-halo" cx="160" cy="178" rx="102" ry="100" />
      <ellipse className="egg-shadow" cx="159" cy="260" rx="67" ry="9" />
      <g className="egg-nest" stroke="var(--art-nest, #b7ad98)" strokeLinecap="round">
        <path d="M83 241Q157 281 238 242M95 249Q159 280 224 252" strokeWidth="5" />
        <path d="M92 238l21 11m104 -12l-22 13M113 258l-5 8m92 -10l8 7" strokeWidth="3" />
      </g>
      <g className="egg-shell">
        <path d="M160 77C190 78 223 124 230 167C240 222 210 254 161 255C111 255 82 226 91 173C99 126 129 77 160 77Z" fill="var(--art-shell, #eee9db)" stroke="var(--art-shell-outline, #5e655a)" strokeWidth="2.5" />
        <path d="M127 111C112 131 107 149 107 164" stroke="#fffef5" strokeWidth="7" strokeLinecap="round" opacity="0.76" />
        <g fill="#b8ae91" opacity="0.65"><ellipse cx="172" cy="109" rx="3" ry="2" transform="rotate(30 172 109)" /><ellipse cx="193" cy="151" rx="3.5" ry="2.5" transform="rotate(-25 193 151)" /><circle cx="128" cy="176" r="2.8" /><circle cx="183" cy="209" r="2" /><ellipse cx="148" cy="232" rx="4" ry="2.4" /><circle cx="211" cy="190" r="2.6" /><circle cx="142" cy="131" r="1.8" /></g>
        {crackCount >= 1 && <path className="egg-crack" d="M154 82L165 109L152 118L166 133L158 149" />}
        {crackCount >= 2 && <path className="egg-crack" d="M228 167L210 162L197 174L184 166L173 177L161 169" />}
        {crackCount >= 3 && <path className="egg-crack" d="M93 184L110 178L120 192L136 188L148 201L164 194L180 204L192 191L209 198L232 187" />}
      </g>
      {hatching && <g className="egg-sparkles" stroke="var(--art-mark, #b2a77f)" strokeWidth="2.5" strokeLinecap="round"><path d="M71 134l-9 -6M245 113l10 -9M162 57v-11M249 222l10 4" /></g>}
    </svg>
  );
}
