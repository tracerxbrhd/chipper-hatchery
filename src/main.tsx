import { Component, StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from './App';
import { ru } from './i18n';
import { call, getAuthKey, initTelegram, subscribeAuthChange } from './api/client';
import './app.css';
import './art.css';

const initialApp = window.Telegram?.WebApp;
document.documentElement.dataset.theme = (initialApp?.initData ? initialApp.colorScheme : undefined) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function IdentityBoundary() {
  const [identity, setIdentity] = useState(getAuthKey);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const cleanTelegram = initTelegram();
    const cleanAuth = subscribeAuthChange(() => flushSync(() => setIdentity(getAuthKey())));
    const visibility = () => flushSync(() => { setVisible(!document.hidden); setIdentity(getAuthKey()); });
    document.addEventListener('visibilitychange', visibility);
    return () => { cleanTelegram(); cleanAuth(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  // Keep an in-progress round and pending receipt while hidden. The identity
  // key is checked synchronously before revealing the view on resume.
  return <div hidden={!visible}><App key={identity} /></div>;
}
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { void call('logEvent', { operationId: crypto.randomUUID(), event: 'app_error', details: { code: 'RENDER_ERROR', screen: 'app' } }); }
  render() {
    if (this.state.failed) return <main className="app app-main"><h1>{ru.renderErrorTitle}</h1><p>{ru.renderErrorBody}</p><button className="button primary" onClick={() => location.reload()}>{ru.reload}</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><IdentityBoundary /></ErrorBoundary></StrictMode>);
