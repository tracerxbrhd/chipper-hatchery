export type Tab = 'collection' | 'incubator' | 'home' | 'activities' | 'profile';

const items: { tab: Tab; label: string; path: string }[] = [
  { tab: 'collection', label: 'Коллекция', path: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { tab: 'incubator', label: 'Инкубатор', path: 'M19 14c0 4-3 7-7 7s-7-3-7-7c0-5 4-11 7-11s7 6 7 11ZM9 13l3 2 3-3' },
  { tab: 'home', label: 'Дом', path: 'm3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9' },
  { tab: 'activities', label: 'Активности', path: 'M9 5h6l2 3h2l3 9c1 4-3 5-5 2l-2-2H9l-2 2c-2 3-6 2-5-2l3-9h2ZM7 10v5M4.5 12.5h5M16 11h.01M19 14h.01' },
  { tab: 'profile', label: 'Профиль', path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2M8 21h8' },
];

export function BottomDock({ active, onNavigate }: { active: Tab; onNavigate: (tab: Tab) => void }) {
  return <nav className="bottom-dock" aria-label="Разделы Chipper">
    {items.map(({ tab, label, path }) => <button key={tab} className={`dock-item ${tab === 'home' ? 'dock-home' : ''} ${active === tab ? 'selected' : ''}`} aria-current={active === tab ? 'page' : undefined} onClick={() => onNavigate(tab)}>
      <span className="dock-icon"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg></span>
      <span className="dock-label">{label}</span>
    </button>)}
  </nav>;
}
