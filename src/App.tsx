import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { TowerCheckpointInput, TowerFinishInput, TowerGameResult, TowerRunDTO } from './games/tower/types';
import { FriendOnWorldPicker } from './community/FriendOnWorldPicker';
import { call, getAuthKey, isDevMock, playFeedback } from './api/client';
import type { ApiError, ApiResult, CareAction, Chick, Exchange, Gift, GuestChickDTO, Method, PublicChick, PublicProfile, Snapshot, SocialLink, SocialSummary } from './types';
import { ru } from './i18n';
import { HatchResult, Onboarding } from './screens/EggScreens';
import { Activities, GameResultScreen, FlapsGame, type GameAttempt, type GameResult } from './screens/GameScreens';
import { ChickCard, Home, Settings } from './screens/PetScreens';
import { CollectionHub, Shop, type CollectionSection } from './screens/CollectionHub';
import { SocialScreen, VisitorScreen } from './screens/SocialScreens';
import { Icon, type PetMotion, type Preferences } from './screens/Elements';
import { Profile } from './screens/ProfileScreen';
import { BottomDock, type Tab } from './navigation/BottomDock';
import { ScreenTransition } from './navigation/ScreenTransition';
import { setSceneGestures } from './api/telegram';
import { NativeHud } from './design/NativeHud';
import { launchIntent } from './social/share';
import './app.css';
import './social/features.css';

const TowerDefense = lazy(() => import('./games/tower/TowerDefense').then(module => ({ default: module.TowerDefense })));

type Screen = Tab | 'incubator' | 'settings' | 'chick' | 'hatchResult' | 'game' | 'gameResult' | 'social' | 'visit' | 'tower';
type Success = Extract<ApiResult, { ok: true }>;
interface Operation { method: Method; params: Record<string, unknown>; errorEventId: string; onSuccess?: (response: Success) => void }
const mutations = new Set<Method>(['hatchEgg', 'completeOnboarding', 'careAction', 'activateChick', 'renameChick', 'buyEgg', 'startFlapsRun', 'finishFlapsRun', 'logEvent', 'updatePrivacy', 'createSocialLink', 'sendFriendRequest', 'respondFriendRequest', 'removeFriend', 'blockUser', 'offerGift', 'respondGift', 'cancelGift', 'claimDailyBonus', 'startTowerRun', 'checkpointTowerRun', 'finishTowerRun', 'claimAchievement', 'offerExchange', 'respondExchange', 'cancelExchange']);
const legacyIncubator = () => location.hash === '#incubator' || ['incubator'].includes(new URLSearchParams(location.search).get('tab') ?? '');

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem('chipper:preferences') ?? '{}') as Partial<Preferences>;
    return { sound: saved.sound === true, animation: saved.animation !== false, haptics: saved.haptics !== false };
  } catch { return { sound: false, animation: true, haptics: true }; }
}

// App is mounted with an authentication key by main.tsx. No player snapshot is
// persisted in browser storage, and responses are also checked against that key.
export default function App() {
  const [authKey] = useState(getAuthKey);
  const [state, setState] = useState<Snapshot | null>(null);
  const stateRef = useRef<Snapshot | null>(null);
  const [screen, setScreen] = useState<Screen>(() => legacyIncubator() ? 'collection' : 'home');
  const [collectionSection, setCollectionSection] = useState<CollectionSection>(() => legacyIncubator() ? 'eggs' : 'chicks');
  const [social, setSocial] = useState<SocialSummary | null>(null);
  const [guest, setGuest] = useState<GuestChickDTO | null>(null);
  const [guestSelection, setGuestSelection] = useState<string | null>(null);
  const guestSelectionRef = useRef<string | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const guestSequence = useRef(0);
  const guestRestored = useRef(false);
  const refreshGuestRef = useRef<() => void>(() => {});
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [link, setLink] = useState<SocialLink | null>(null);
  const [shareChick, setShareChick] = useState<PublicChick | undefined>();
  const [giftChickId, setGiftChickId] = useState<string | null>(null);
  const [intent] = useState(launchIntent);
  const intentResolved = useRef(false);
  const screenRef = useRef<Screen>('home');
  screenRef.current = screen;
  const [appOpenedEventId] = useState(() => crypto.randomUUID());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hatchId, setHatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<ApiError | null>(null);
  const operationRef = useRef<Operation | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const [preferences, setPreferences] = useState(readPreferences);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [motion, setMotion] = useState<PetMotion>('idle');
  const motionTimer = useRef<number | undefined>(undefined);
  const [clock, setClock] = useState({ server: 0, receivedAt: 0 });
  const [tick, setTick] = useState(() => performance.now());
  const [attempt, setAttempt] = useState<GameAttempt | null>(null);
  const [towerRun, setTowerRun] = useState<TowerRunDTO | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [backTo, setBackTo] = useState<Tab>('home');
  const alive = useRef(true);
  const reducedMotion = !preferences.animation || systemReducedMotion;
  const now = clock.server ? clock.server + Math.max(0, tick - clock.receivedAt) : 0;
  const outside = !isDevMock && authKey === 'outside';

  const telemetry = useCallback((event: 'app_opened' | 'app_error', operationId: string, code?: string) => {
    if (getAuthKey() !== authKey) return;
    const safeCode = code && /^[a-zA-Z0-9_:-]{1,48}$/.test(code) ? code : 'UNKNOWN';
    void call('logEvent', { event, operationId, ...(event === 'app_error' ? { details: { code: safeCode, screen: screenRef.current } } : {}) }).catch(() => { /* Optional first-party telemetry cannot block gameplay. */ });
  }, [authKey]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4500);
  }, []);

  const feedback = useCallback((kind: string) => {
    playFeedback(kind, preferencesRef.current.sound, preferencesRef.current.haptics);
  }, []);

  const animate = useCallback((next: PetMotion) => {
    window.clearTimeout(motionTimer.current);
    setMotion(next);
    motionTimer.current = window.setTimeout(() => setMotion('idle'), 2600);
  }, []);

  const acceptState = useCallback((snapshot: Snapshot) => {
    const previous = stateRef.current;
    if (previous && snapshot.revision < previous.revision) return;
    if (previous && snapshot.revision === previous.revision && snapshot.serverNow < previous.serverNow) return;
    const before = previous?.chicks.find(chick => chick.id === snapshot.player.activeChickId);
    const after = snapshot.chicks.find(chick => chick.id === snapshot.player.activeChickId);
    if (before && after && before.stage !== after.stage) animate('grow');
    stateRef.current = snapshot;
    setState(snapshot);
    const receivedAt = performance.now();
    setClock({ server: snapshot.serverNow, receivedAt });
    setTick(receivedAt);
  }, [animate]);

  const execute = useCallback(async (operation: Operation) => {
    if (busyRef.current || getAuthKey() !== authKey) return;
    operationRef.current = operation;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await call(operation.method, operation.params);
      if (!alive.current || getAuthKey() !== authKey) return;
      if (!response.ok) {
        setError(response.error);
        telemetry('app_error', operation.errorEventId, response.error.code);
        feedback('error');
      } else {
        acceptState(response.state);
        if (response.result?.social) setSocial(response.result.social as SocialSummary);
        if (response.result?.profile) setPublicProfile(response.result.profile as PublicProfile);
        if (response.result?.gifts) setGifts(response.result.gifts as Gift[]);
        if (response.result?.exchanges) setExchanges(response.result.exchanges as Exchange[]);
        if (response.result && 'link' in response.result) setLink(response.result.link as SocialLink | null);
        operationRef.current = null;
        // Release the lock before a successful operation starts its next step.
        busyRef.current = false;
        setBusy(false);
        operation.onSuccess?.(response);
      }
    } catch {
      if (alive.current && getAuthKey() === authKey) { setError({ code: 'NETWORK_ERROR', message: ru.errorBody, retryable: true }); telemetry('app_error', operation.errorEventId, 'NETWORK_ERROR'); }
    } finally {
      // A chained operation owns the lock after onSuccess; don't release it here.
      if (alive.current && operationRef.current === operation) { busyRef.current = false; setBusy(false); }
    }
  }, [acceptState, authKey, feedback, telemetry]);

  const perform = useCallback((method: Method, params: Record<string, unknown> = {}, onSuccess?: (response: Success) => void) => {
    if (busyRef.current) return;
    const operation: Operation = { method, params: mutations.has(method) ? { ...params, operationId: crypto.randomUUID() } : params, errorEventId: crypto.randomUUID(), onSuccess };
    void execute(operation);
  }, [execute]);

  const refresh = useCallback(() => {
    if (document.hidden || window.Telegram?.WebApp?.isActive === false || busyRef.current || operationRef.current || (screenRef.current === 'game' || screenRef.current === 'tower')) return;
    perform('getHome');
    refreshGuestRef.current();
  }, [perform]);

  useEffect(() => {
    alive.current = true;
    if (!outside) perform('bootstrap', {}, () => telemetry('app_opened', appOpenedEventId));
    const timer = window.setInterval(() => { if (!document.hidden && window.Telegram?.WebApp?.isActive !== false) setTick(performance.now()); }, 1000);
    const onOnline = () => { setOnline(true); refresh(); };
    const onOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.Telegram?.WebApp?.onEvent?.('activated', refresh);
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChange = () => setSystemReducedMotion(query.matches);
    query.addEventListener('change', motionChange);
    return () => {
      alive.current = false;
      guestSequence.current += 1;
      window.clearInterval(timer);
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(motionTimer.current);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.Telegram?.WebApp?.offEvent?.('activated', refresh);
      query.removeEventListener('change', motionChange);
    };
    // Bootstrapping is scoped to one mounted account. Preference changes should
    // never re-run it or replace listeners with an outstanding mutation.
  }, [authKey, outside]);

  // Periodic reads reconcile other sessions, age stages and server timer results.
  // Only displayed countdowns advance locally; game values are never inferred.
  useEffect(() => {
    if (!state || outside || screen === 'game' || screen === 'tower') return;
    const timers = [state.egg?.readyAt, ...state.chicks.map(chick => chick.sleepUntil)].filter((value): value is number => value !== null && value !== undefined && value > state.serverNow);
    const untilNext = Math.min(30_000, ...timers.map(value => Math.max(1000, value - state.serverNow + 500)));
    const timeout = window.setTimeout(refresh, untilNext);
    return () => window.clearTimeout(timeout);
  }, [state, outside, screen, refresh]);

  const go = useCallback((next: Screen) => {
    if (next === 'incubator') { setCollectionSection('eggs'); setBackTo('collection'); setScreen('collection'); return; }
    if (next === 'home' || next === 'shop' || next === 'collection' || next === 'activities' || next === 'profile') setBackTo(next);
    setScreen(next);
  }, []);

  const back = useCallback(() => {
    if (screen === 'game') { window.dispatchEvent(new CustomEvent('chipper:flaps-back')); return; }
    if (screen === 'tower') { window.dispatchEvent(new CustomEvent('chipper:tower-back')); return; }
    go(screen === 'visit' ? 'social' : screen === 'gameResult' ? 'activities' : screen === 'hatchResult' ? 'incubator' : backTo);
  }, [screen, backTo, go]);
  const secondaryScreen = ['settings', 'chick', 'hatchResult', 'game', 'gameResult', 'social', 'visit', 'tower'].includes(screen);
  useEffect(() => {
    const button = window.Telegram?.WebApp?.BackButton;
    if (!button || !state || state.player.onboarding !== 'done') return;
    if (secondaryScreen) button.show(); else button.hide();
    button.onClick(back);
    return () => { button.offClick(back); button.hide(); };
  }, [back, secondaryScreen, state?.player.onboarding]);

  const updatePreference = (key: keyof Preferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try { localStorage.setItem('chipper:preferences', JSON.stringify(next)); } catch { /* optional browser setting */ }
  };

  const completeOnboarding = (name?: string) => {
    const finish = () => perform('completeOnboarding', {}, () => { animate('happy'); feedback('success'); go('home'); });
    if (name && state?.player.activeChickId) perform('renameChick', { chickId: state.player.activeChickId, name }, finish);
    else finish();
  };
  const care = (action: CareAction) => {
    if (!state?.player.activeChickId) return;
    perform('careAction', { chickId: state.player.activeChickId, action }, response => {
      animate(action === 'sleep' ? 'sleep' : action);
      feedback(action === 'sleep' ? 'soft' : 'success');
      notify(response.result?.rewarded ? ru.rewardCare : action === 'feed' ? ru.fed : action === 'play' ? ru.played : ru.sleepStarted);
    });
  };
  const activate = (chickId: string) => perform('activateChick', { chickId }, () => { go('home'); animate('happy'); feedback('success'); notify(ru.activated); });
  const hatch = () => {
    if (!state?.egg) return;
    perform('hatchEgg', { eggId: state.egg.id }, response => {
      feedback('success');
      if (response.state.player.onboarding === 'name') return;
      const id = response.result?.chickId;
      if (typeof id === 'string') { setHatchId(id); go('hatchResult'); }
    });
  };
  const startGame = () => perform('startFlapsRun', {}, response => {
    const result = response.result;
    const captured = result?.chick;
    const bird = captured && typeof captured === 'object' && 'id' in captured && captured.id === result?.chickId ? captured as Chick : response.state.chicks.find(chick => chick.id === result?.chickId);
    if (!result || !bird || typeof result.runId !== 'string' || typeof result.startedAt !== 'number' || typeof result.expiresAt !== 'number' || typeof result.configVersion !== 'string') {
      setError({ code: 'INVALID_RESPONSE', message: ru.errorBody, retryable: false });
      return;
    }
    setAttempt({ runId: result.runId, chickId: bird.id, chick: structuredClone(bird), startedAt: result.startedAt, expiresAt: result.expiresAt, configVersion: result.configVersion });
    setGameResult(null);
    feedback('soft');
    go('game');
  });
  const finishGame = (score: number, endReason: 'crash' | 'bounds') => {
    if (!attempt) return;
    perform('finishFlapsRun', { runId: attempt.runId, score, endReason }, response => {
      const result = response.result;
      if (!result || typeof result.score !== 'number' || typeof result.bestScore !== 'number' || typeof result.previousBest !== 'number') {
        setError({ code: 'INVALID_RESPONSE', message: ru.errorBody, retryable: false }); return;
      }
      setGameResult({ score: result.score, bestScore: result.bestScore, previousBest: result.previousBest, newBest: result.newBest === true, rewarded: result.rewarded === true, rewardNextAt: typeof result.rewardNextAt === 'number' ? result.rewardNextAt : null, reason: result.reason === 'rewarded' || result.reason === 'cooldown' ? result.reason : 'too_short' });
      feedback('success'); go('gameResult');
    });
  };

  const towerRequest = useCallback(async (method: 'startTowerRun' | 'getTowerRun' | 'checkpointTowerRun' | 'finishTowerRun', params: Record<string, unknown> = {}) => {
    const response = await call(method, params);
    if (!alive.current || getAuthKey() !== authKey) throw Object.assign(new Error('Аккаунт изменился. Переоткройте игру.'), { code: 'AUTH_CHANGED', retryable: false });
    if (!response.ok) throw Object.assign(new Error(response.error.message), response.error);
    acceptState(response.state);
    return response.result ?? {};
  }, [acceptState, authKey]);
  const startTower = () => perform('startTowerRun', {}, response => {
    const run = response.result?.run as TowerRunDTO | undefined;
    if (!run || run.status !== 'active' || !run.checkpoint) { setError({ code: 'INVALID_RESPONSE', message: ru.errorBody, retryable: true }); return; }
    setTowerRun(run); feedback('soft'); go('tower');
  });
  const checkpointTower = useCallback(async (input: TowerCheckpointInput) => {
    const result = await towerRequest('checkpointTowerRun', { ...input });
    return result.run as TowerRunDTO;
  }, [towerRequest]);
  const finishTower = useCallback(async (input: TowerFinishInput) => {
    const result = await towerRequest('finishTowerRun', { ...input });
    feedback('success');
    return result as unknown as TowerGameResult;
  }, [towerRequest, feedback]);
  const restartTower = useCallback(async () => {
    const result = await towerRequest('startTowerRun', { operationId: crypto.randomUUID() });
    const run = result.run as TowerRunDTO; setTowerRun(run); return run;
  }, [towerRequest]);
  const restoreTower = useCallback(async () => {
    const result = await towerRequest('getTowerRun', towerRun ? { runId: towerRun.runId } : {});
    return (result.run ?? null) as TowerRunDTO | null;
  }, [towerRequest, towerRun]);

  const clearGuest = useCallback(() => {
    guestSequence.current += 1;
    guestSelectionRef.current = null;
    setGuestSelection(null); setGuest(null); setGuestBusy(false); setGuestError(null);
    const owner = stateRef.current?.player.telegramId;
    if (owner) { try { localStorage.removeItem(`chipper:guest:${owner}`); } catch { /* optional selection */ } }
  }, []);

  const refreshGuest = useCallback(async (selected: string | null = guestSelectionRef.current, includeFriends = false) => {
    if (getAuthKey() !== authKey || !stateRef.current || stateRef.current.player.onboarding !== 'done') return;
    const sequence = ++guestSequence.current;
    setGuestBusy(true); setGuestError(null);
    // Hide cached foreign visuals while current permissions are revalidated.
    setGuest(null);
    try {
      if (includeFriends) {
        const summary = await call('getSocial');
        if (!alive.current || sequence !== guestSequence.current || getAuthKey() !== authKey) return;
        if (!summary.ok) { setGuestError(summary.error.message); return; }
        acceptState(summary.state);
        if (summary.result?.social) setSocial(summary.result.social as SocialSummary);
      }
      if (!selected) return;
      const response = await call('getGuestChick', { profileId: selected });
      if (!alive.current || sequence !== guestSequence.current || getAuthKey() !== authKey) return;
      if (!response.ok) {
        if (!response.error.retryable) {
          guestSelectionRef.current = null; setGuestSelection(null);
          try { localStorage.removeItem(`chipper:guest:${stateRef.current?.player.telegramId}`); } catch { /* optional selection */ }
        }
        setGuestError(response.error.message); return;
      }
      acceptState(response.state);
      const current = response.result?.guest as GuestChickDTO | undefined;
      if (current?.profileId === selected) {
        setGuest(current); guestSelectionRef.current = selected; setGuestSelection(selected);
        try { localStorage.setItem(`chipper:guest:${response.state.player.telegramId}`, selected); } catch { /* optional selection */ }
      }
    } finally {
      if (alive.current && sequence === guestSequence.current) setGuestBusy(false);
    }
  }, [authKey, acceptState]);
  refreshGuestRef.current = () => { if (screenRef.current === 'home' && guestSelectionRef.current) void refreshGuest(); };
  useEffect(() => {
    if (!state || state.player.onboarding !== 'done' || guestRestored.current) return;
    guestRestored.current = true;
    let selected: string | null = null;
    try { const value = localStorage.getItem(`chipper:guest:${state.player.telegramId}`); if (value && /^[a-f0-9]{64}$/.test(value)) selected = value; } catch { /* optional selection */ }
    if (selected) { guestSelectionRef.current = selected; setGuestSelection(selected); }
  }, [state]);
  useEffect(() => {
    if (screen !== 'home' || !guestSelection) { setGuest(null); return; }
    void refreshGuest(guestSelection);
    const active = () => { if (window.Telegram?.WebApp?.isActive !== false && !document.hidden) void refreshGuest(); };
    window.Telegram?.WebApp?.onEvent?.('activated', active);
    return () => { guestSequence.current += 1; window.Telegram?.WebApp?.offEvent?.('activated', active); };
  }, [screen, guestSelection, refreshGuest]);
  useEffect(() => { if (screen === 'profile' && !isDevMock && stateRef.current?.player.onboarding === 'done') perform('getSocial'); }, [screen, perform]);

  const openSocial = (chickId: string | null = null) => {
    setGiftChickId(chickId); setShareChick(undefined); setLink(null); go('social');
    perform('getSocial', {}, () => perform('listGifts', {}, () => perform('listExchanges')));
  };
  const openProfile = (profileId: string) => {
    setPublicProfile(null); go('visit'); perform('visitProfile', { profileId });
  };
  const socialAction = (method: Method, params: Record<string, unknown> = {}) => {
    if (method === 'createSocialLink' && params.kind !== 'chick') setShareChick(undefined);
    perform(method, params, response => {
      if (method === 'getSocial' || ['offerGift', 'respondGift', 'cancelGift', 'offerExchange', 'respondExchange', 'cancelExchange', 'removeFriend', 'blockUser', 'respondFriendRequest'].includes(method)) perform('listGifts', {}, () => perform('listExchanges'));
      if (method === 'sendFriendRequest') {
        const summary = response.result?.social as SocialSummary | undefined;
        setPublicProfile(previous => {
          if (!previous || previous.profileId !== params.profileId || !summary) return previous;
          const relationship = summary.friends.some(peer => peer.profileId === previous.profileId) ? 'friend'
            : summary.incoming.some(request => request.from.profileId === previous.profileId) ? 'incoming'
            : summary.outgoing.some(request => request.to.profileId === previous.profileId) ? 'outgoing' : 'none';
          return { ...previous, relationship };
        });
      }
      if (method === 'removeFriend' || method === 'blockUser') { if (params.profileId === guestSelectionRef.current) clearGuest(); }
      if (method === 'updatePrivacy') { setLink(null); notify('Видимость сохранена'); }
      if (response.result?.gift) notify(method === 'offerGift' ? 'Подарок предложен' : 'Ответ на подарок сохранён');
      if (response.result?.exchange) notify(method === 'offerExchange' ? 'Обмен предложен — ждём согласия друга' : 'Ответ на обмен сохранён');
    });
  };
  const shareBird = (chick: Chick) => {
    setGiftChickId(null); setShareChick(chick); setLink(null); go('social');
    perform('getSocial', {}, response => {
      const own = response.result?.social as SocialSummary | undefined;
      if (own?.profile.visibility === 'private') { notify('Сначала разрешите просмотр профиля. Ваше согласие нужно для публикации карточки.'); return; }
      perform('createSocialLink', { kind: 'chick', chickId: chick.id });
    });
  };
  useEffect(() => {
    if (!intent || intentResolved.current || !state || state.player.onboarding !== 'done' || busy || operationRef.current) return;
    intentResolved.current = true;
    go('visit');
    perform('resolveSocialLink', intent, () => { /* Verified backend authorizes the navigation hint. */ });
  }, [intent, state, busy, go, perform]);

  const active = state?.chicks.find(chick => chick.id === state.player.activeChickId);
  const selected = state?.chicks.find(chick => chick.id === selectedId);
  const hatched = state?.chicks.find(chick => chick.id === hatchId);
  const onboarding = state !== null && state.player.onboarding !== 'done';
  useEffect(() => { setSceneGestures(!onboarding && (screen === 'home' || screen === 'game' || screen === 'tower')); }, [screen, onboarding]);
  const view = { busy: busy || Boolean(error?.retryable), now, reducedMotion };
  const retry = () => { if (operationRef.current) void execute(operationRef.current); else perform(state ? 'getHome' : 'bootstrap'); };
  const recover = () => {
    const abandonedRound = screenRef.current === 'game' && !error?.retryable;
    operationRef.current = null;
    setError(null);
    if (abandonedRound) { setAttempt(null); go('activities'); }
    perform(state ? 'getHome' : 'bootstrap');
  };

  if (outside) return <div className="app outside-app"><main><div className="outside-symbol"><Icon name="egg" size={64} /></div><p className="eyebrow">{ru.app}</p><h1>{ru.outsideTitle}</h1><p className="intro">{ru.outsideBody}</p><a className="button primary" href="https://t.me/chipperhatcherybot" target="_blank" rel="noreferrer">{ru.openBot}</a></main></div>;
  const dockActive = screen === 'tower' ? 'activities' : screen === 'gameResult' ? 'activities' : screen === 'hatchResult' || screen === 'incubator' ? 'collection' : secondaryScreen ? backTo : screen as Tab;
  return <div className={`app ${screen === 'tower' ? 'tower-app' : screen === 'game' ? 'flaps-app' : ''} ${reducedMotion ? 'reduce-motion' : ''}`} data-motion={reducedMotion ? 'off' : 'on'}>
    {isDevMock && <div className="dev-banner">{ru.devMock}</div>}
    {screen !== 'game' && screen !== 'tower' && <NativeHud feathers={state && !onboarding ? state.player.feathers : null} onBack={secondaryScreen ? back : undefined} />}
    <main className={`app-main ${screen === 'game' || screen === 'tower' ? 'game-main' : screen === 'home' && !onboarding ? 'scene-main' : ''}`}>
      {!online && <div className="offline-banner" role="status">{ru.offline}</div>}
      {error && <div className="error-banner" role="alert"><div><strong>{ru.errorTitle}</strong><p>{error.message || ru.errorBody}</p></div><button className="button small-button" onClick={error.retryable ? retry : recover} disabled={busy}>{busy ? ru.waiting : error.retryable ? ru.retry : ru.refresh}</button></div>}
      <ScreenTransition route={onboarding ? `onboarding-${state?.player.onboarding}` : screen} fixed={!onboarding && (screen === 'home' || screen === 'game' || screen === 'tower')}>
      {!state ? !error && <div className="loading-state" role="status"><span className="spinner" /><p>{ru.loading}</p></div> : onboarding ? <Onboarding key={state.player.onboarding} state={state} busy={view.busy} reducedMotion={reducedMotion} onHatch={hatch} onComplete={completeOnboarding} /> : <>
        {screen === 'home' && <Home state={state} {...view} motion={motion} onCare={care} onTouchFeedback={feedback} guest={guest} guestControls={<FriendOnWorldPicker friends={social?.friends ?? []} guest={guest} busy={guestBusy} error={guestError} onSelect={profileId => { if (guestSelectionRef.current !== profileId) { guestSelectionRef.current = profileId; setGuestSelection(profileId); } else void refreshGuest(profileId); }} onClear={clearGuest} onRefresh={() => void refreshGuest(guestSelectionRef.current, true)} />} onDailyClaim={() => perform('claimDailyBonus', {}, () => { feedback('success'); notify('+1 пёрышко — ежедневный подарок'); })} onDailyRefresh={() => perform('getDailyBonus')} onCard={id => { setSelectedId(id); go('chick'); }} />}
        {screen === 'shop' && <Shop />}
        {screen === 'collection' && <CollectionHub section={collectionSection} onSection={setCollectionSection} state={state} {...view} onCard={id => { setSelectedId(id); go('chick'); }} onBuy={() => perform('buyEgg', {}, () => { feedback('success'); notify(ru.eggBought); })} onHatch={hatch} />}
        {screen === 'chick' && selected && <ChickCard key={selected.id} chick={selected} state={state} {...view} onActivate={() => activate(selected.id)} onRename={name => perform('renameChick', { chickId: selected.id, name }, () => { feedback('success'); notify(ru.renamed); })} onShare={() => shareBird(selected)} onGift={() => openSocial(selected.id)} />}
        {screen === 'activities' && <Activities state={state} {...view} onStart={startGame} onTowerStart={startTower} />}
        {screen === 'settings' && <Settings preferences={preferences} onChange={updatePreference} onRefresh={() => perform('getHome', {}, () => notify(ru.refreshed))} busy={view.busy} />}
        {screen === 'profile' && <Profile state={state} now={now} social={social} busy={view.busy} onCodex={() => { setCollectionSection('codex'); go('collection'); }} onClaimAchievement={achievementId => perform('claimAchievement', { achievementId }, () => { feedback('success'); notify('+1 пёрышко — достижение в вашей истории'); })} onDailyClaim={() => perform('claimDailyBonus', {}, () => { feedback('success'); notify('+1 пёрышко — ежедневный подарок'); })} onDailyRefresh={() => perform('getDailyBonus')} onSettings={() => go('settings')} onSocial={() => openSocial()} />}
        {screen === 'social' && <SocialScreen key={giftChickId ?? 'social'} social={social} gifts={gifts} exchanges={exchanges} state={state} busy={view.busy} now={now} onAction={socialAction} onOpen={openProfile} giftChickId={giftChickId} link={link} shareChick={shareChick} onCloseLink={() => setLink(null)} />}
        {screen === 'visit' && <VisitorScreen profile={publicProfile} {...view} inviteToken={intent?.kind === 'invite' ? intent.token : undefined} onAction={socialAction} onBack={() => openSocial()} />}
        {screen === 'hatchResult' && hatched && <HatchResult chick={hatched} busy={view.busy} reducedMotion={reducedMotion} onActivate={() => activate(hatched.id)} onCollection={() => { setCollectionSection('chicks'); go('collection'); }} />}
        {screen === 'game' && attempt && <FlapsGame key={attempt.runId} attempt={attempt} {...view} sound={preferences.sound} haptics={preferences.haptics} onComplete={finishGame} onLeave={() => { setAttempt(null); go('activities'); }} />}
        {screen === 'tower' && towerRun && <Suspense fallback={<div className="loading-state" role="status"><span className="spinner" /><p>Готовим защиту гнезда…</p></div>}><TowerDefense run={towerRun} onCheckpoint={checkpointTower} onFinish={finishTower} onRestart={restartTower} onRestore={restoreTower} onExit={() => { setTowerRun(null); go('activities'); }} preferences={{ sound: preferences.sound, haptics: preferences.haptics, reducedMotion }} /></Suspense>}
        {screen === 'gameResult'  && gameResult && <GameResultScreen result={gameResult} chick={attempt?.chick ?? active} {...view} onAgain={startGame} onHome={() => go('home')} />}
      </>}
      </ScreenTransition>
    </main>
    {state && !onboarding && screen !== 'game' && screen !== 'tower' && <BottomDock active={dockActive} onNavigate={go} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
