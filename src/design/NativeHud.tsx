import { Icon } from '../screens/Elements';
import { ru } from '../i18n';

/** Native Telegram groups keep their own touch zones; only the center is used. */
export function NativeHud({ feathers, onBack }: { feathers: number | null; onBack?: () => void }) {
  return <header className="app-header native-hud">
    <div className="native-hud-primary">
      <div className="brand" aria-label="Chipper Hatchery">
        <span className="brand-mark" aria-hidden="true">c<span>✦</span></span>
        <span className="brand-title">{ru.app}</span>
      </div>
    </div>
    {(feathers !== null || onBack) && <div className={`native-hud-secondary ${onBack ? 'has-back' : ''}`}>
      {onBack && <button type="button" className="icon-button hud-back" aria-label={ru.back} onClick={onBack}><Icon name="back" /></button>}
      {feathers !== null && <span className="feather-balance" aria-label={ru.feathers(feathers)}><Icon name="feather" size={17} /><strong>{feathers}</strong></span>}
    </div>}
  </header>;
}
