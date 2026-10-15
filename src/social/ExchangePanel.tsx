import { useEffect, useId, useRef, useState } from 'react';
import type { Exchange, Method, PublicChick, PublicProfile, Snapshot, SocialSummary } from '../types';
import { call, getAuthKey } from '../api/client';
import { ChickArt } from '../components/ChickArt';
import { duration, ru } from '../i18n';
import './exchanges.css';

type Action = (method: Method, params?: Record<string, unknown>) => void;
interface Confirmation {
  method: 'offerExchange' | 'respondExchange'; params: Record<string, unknown>;
  outgoing: PublicChick; incoming: PublicChick; heading: string;
}
const statusNames: Record<Exchange['status'], string> = { pending: 'Ждёт ответа', accepted: 'Обмен состоялся', declined: 'Отклонён', cancelled: 'Отменён', expired: 'Срок истёк' };

function PairPreview({ outgoing, incoming, completed = false }: { outgoing: PublicChick; incoming: PublicChick; completed?: boolean }) {
  return <div className="exchange-pair" aria-label="Точная пара для обмена">
    <figure><figcaption>{completed ? 'Передан другу' : 'Вы отдаёте'}</figcaption><ChickArt chick={outgoing} size={116} animate={false} /><strong>{outgoing.name}</strong><small>{ru.stage[outgoing.stage]} · {ru.rarities[outgoing.rarity]}</small></figure>
    <span className="exchange-arrow" aria-hidden="true">↔</span>
    <figure><figcaption>{completed ? 'Получен вами' : 'К вам'}</figcaption><ChickArt chick={incoming} size={116} animate={false} /><strong>{incoming.name}</strong><small>{ru.stage[incoming.stage]} · {ru.rarities[incoming.rarity]}</small></figure>
  </div>;
}

export function ExchangePanel({ social, state, exchanges, busy, now, onAction }: {
  social: SocialSummary; state: Snapshot; exchanges: Exchange[]; busy: boolean; now: number; onAction: Action;
}) {
  const [authKey] = useState(getAuthKey);
  const [friendId, setFriendId] = useState('');
  const [ownChickId, setOwnChickId] = useState('');
  const [requestedId, setRequestedId] = useState('');
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [historyLimit, setHistoryLimit] = useState(20);
  const alive = useRef(true), sequence = useRef(0), selectedFriend = useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const ownProfileId = social.profile.profileId;
  const friends = social.friends;
  const eligibleOwn = state.chicks.filter(chick => chick.id !== state.player.activeChickId && !chick.reservedGiftId && !chick.reservedExchangeId);
  const offered = eligibleOwn.find(chick => chick.id === ownChickId);
  const authorizedProfile = profile?.profileId === friendId && friends.some(peer => peer.profileId === friendId)
    && profile.accessible && profile.relationship === 'friend' && profile.collectionVisible ? profile : null;
  const eligibleRequested = authorizedProfile?.chicks && authorizedProfile.chicks.length > 1
    ? authorizedProfile.chicks.filter(chick => chick.id !== authorizedProfile.activeChick?.id) : [];
  const requested = eligibleRequested.find(chick => chick.id === requestedId);

  async function inspectFriend(profileId: string) {
    const request = ++sequence.current;
    setProfile(null); setRequestedId(''); setReadError('');
    if (!profileId || getAuthKey() !== authKey) { setLoading(false); return; }
    setLoading(true);
    try {
      // This permitted foreign read returns an own snapshot too. Keep it out of
      // App state so an independent read cannot overwrite a newer revision.
      const response = await call('getPublicProfile', { profileId });
      if (!alive.current || request !== sequence.current || selectedFriend.current !== profileId || getAuthKey() !== authKey) return;
      if (!response.ok) { setReadError(response.error.message); return; }
      const next = response.result?.profile as PublicProfile | undefined;
      if (!next || next.profileId !== profileId || !next.accessible || next.relationship !== 'friend') {
        setReadError('Гнездо недоступно. Дружба и видимость проверяются заново.'); return;
      }
      setProfile(next);
    } catch {
      if (alive.current && request === sequence.current && getAuthKey() === authKey) setReadError('Не удалось загрузить коллекцию. Попробуйте ещё раз.');
    } finally {
      if (alive.current && request === sequence.current && getAuthKey() === authKey) setLoading(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    const clear = () => { sequence.current++; setProfile(null); setRequestedId(''); setConfirmation(null); setLoading(false); };
    const visibility = () => {
      // Stop displaying cached foreign birds in a backgrounded WebView. A new
      // explicit read on return rechecks privacy without any polling loop.
      clear();
      if (!document.hidden && selectedFriend.current && getAuthKey() === authKey) setReadError('Проверьте доступ к коллекции после возвращения.');
    };
    const app = window.Telegram?.WebApp;
    document.addEventListener('visibilitychange', visibility);
    app?.onEvent?.('deactivated', clear);
    return () => {
      alive.current = false; sequence.current++;
      document.removeEventListener('visibilitychange', visibility);
      app?.offEvent?.('deactivated', clear);
    };
  }, [authKey]);

  useEffect(() => {
    if (!confirmation || !dialog.current) return;
    const element = dialog.current;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    return () => { if (element.open && typeof element.close === 'function') element.close(); };
  }, [confirmation]);

  const confirmationValid = confirmation?.method === 'offerExchange'
    ? Boolean(offered && requested && friends.some(peer => peer.profileId === friendId))
    : confirmation ? exchanges.some(entry => entry.exchangeId === confirmation.params.exchangeId && entry.status === 'pending' && entry.expiresAt > now && entry.recipient.profileId === ownProfileId) : false;

  return <section className="social-group exchange-panel" aria-labelledby={`${titleId}-panel`}>
    <div className="exchange-heading"><div><p className="eyebrow">По согласию обоих</p><h2 id={`${titleId}-panel`}>Обменяться цыплятами</h2></div><span aria-hidden="true">↔</span></div>
    <p className="muted">Выберите точную пару. Друг решит, готов ли обменяться. Имена, внешность и история обеих птиц сохранятся. Пёрышки не нужны.</p>
    {friends.length === 0 ? <p className="quiet-card">Сначала подружитесь с другим гнёздышком.</p> : eligibleOwn.length === 0 ? <p className="quiet-card">Для обмена нужен свободный цыплёнок на отдыхе. Активного, последнего или уже обещанного другу передать нельзя.</p> : <div className="quiet-card exchange-composer">
      <label>Ваш цыплёнок<select aria-label="Ваш цыплёнок для обмена" value={ownChickId} disabled={busy} onChange={event => { setOwnChickId(event.target.value); setConfirmation(null); }}><option value="">Выберите цыплёнка</option>{eligibleOwn.map(chick => <option key={chick.id} value={chick.id}>{chick.name}</option>)}</select></label>
      <label>Друг<select aria-label="Друг для обмена" value={friendId} disabled={busy} onChange={event => { const value = event.target.value; selectedFriend.current = value; setFriendId(value); setConfirmation(null); void inspectFriend(value); }}><option value="">Выберите друга</option>{friends.map(peer => <option key={peer.profileId} value={peer.profileId}>{peer.displayName}</option>)}</select></label>
      {loading && <p role="status">Проверяем, кого друг разрешил показать…</p>}
      {readError && <div className="exchange-read-error" role="status"><p>{readError}</p><button className="button secondary" disabled={busy || loading || !friends.some(peer => peer.profileId === friendId)} onClick={() => { void inspectFriend(friendId); }}>Проверить коллекцию</button></div>}
      {friendId && !loading && !readError && !profile && <button className="button secondary" disabled={busy || !friends.some(peer => peer.profileId === friendId)} onClick={() => { void inspectFriend(friendId); }}>Проверить коллекцию друга</button>}
      {profile && !profile.collectionVisible && <p className="exchange-privacy-note" role="status">Коллекция друга закрыта. Для выбора птицы друг должен разрешить её просмотр в настройках видимости. Профиль и коллекция имеют отдельные настройки.</p>}
      {profile && <button className="button text-button" disabled={busy || loading || !friends.some(peer => peer.profileId === friendId)} onClick={() => { void inspectFriend(friendId); }}>Обновить коллекцию друга</button>}
      {authorizedProfile && eligibleRequested.length === 0 && <p className="muted">У друга пока нет неактивного цыплёнка для обмена.</p>}
      {eligibleRequested.length > 0 && <label>Цыплёнок друга<select aria-label="Цыплёнок друга для обмена" value={requestedId} disabled={busy || loading} onChange={event => { setRequestedId(event.target.value); setConfirmation(null); }}><option value="">Выберите цыплёнка</option>{eligibleRequested.map(chick => <option key={chick.id} value={chick.id}>{chick.name}</option>)}</select></label>}
      {offered && requested && <><PairPreview outgoing={offered} incoming={requested} /><p className="exchange-fine-print">Предложение действует 24 часа. Ваша птица ждёт решения; птица друга остаётся свободной до его согласия. Перед обменом ещё раз проверим, что обе птицы свободны.</p></>}
      <button className="button primary" disabled={busy || loading || !offered || !requested || getAuthKey() !== authKey} onClick={() => {
        if (offered && requested) setConfirmation({ method: 'offerExchange', params: { chickId: offered.id, recipientProfileId: friendId, requestedChickId: requested.id }, outgoing: offered, incoming: requested, heading: 'Предложить эту пару?' });
      }}>Предложить обмен</button>
    </div>}

    <div className="exchange-history-heading"><h3>Предложения и история · {exchanges.length}</h3><button className="button text-button" disabled={busy} onClick={() => onAction('listExchanges')}>Обновить обмены</button></div>
    {exchanges.length === 0 && <p className="muted">Здесь появятся входящие предложения и завершённые обмены.</p>}
    {exchanges.slice(0, historyLimit).map(entry => {
      const isSender = entry.sender.profileId === ownProfileId, outgoing = isSender ? entry.offeredChick : entry.requestedChick, incoming = isSender ? entry.requestedChick : entry.offeredChick;
      const status = entry.status === 'pending' && entry.expiresAt <= now ? 'expired' : entry.status;
      const friend = isSender ? entry.recipient : entry.sender;
      const stillFriends = friends.some(peer => peer.profileId === friend.profileId);
      return <article key={entry.exchangeId} className="quiet-card exchange-history-item" aria-label={`Обмен с ${friend.displayName}`}>
        <div className="exchange-history-title"><strong>{isSender ? `Предложение для ${friend.displayName}` : `Предложение от ${friend.displayName}`}</strong><span className={`mini-label exchange-status exchange-status-${status}`}>{statusNames[status]}{status === 'pending' ? ` · ${duration(entry.expiresAt - now)}` : ''}</span></div>
        <PairPreview outgoing={outgoing} incoming={incoming} completed={status === 'accepted'} />
        {status === 'pending' && isSender && <><p className="exchange-fine-print">Ваш цыплёнок ждёт ответа. После отмены его снова можно позвать домой или подарить.</p><button className="button secondary" disabled={busy} onClick={() => onAction('cancelExchange', { exchangeId: entry.exchangeId })}>Отменить обмен</button></>}
        {status === 'pending' && !isSender && <><p className="exchange-fine-print">Подтверждение одновременно передаст обеих птиц. Отказ сохранит ваши коллекции.</p>{!stillFriends && <p role="status" className="muted">Для принятия нужна действующая дружба.</p>}<div className="social-actions"><button className="button primary" disabled={busy || !stillFriends} onClick={() => setConfirmation({ method: 'respondExchange', params: { exchangeId: entry.exchangeId, accept: true }, outgoing, incoming, heading: 'Подтвердить обмен?' })}>Принять обмен</button><button className="button secondary" disabled={busy} onClick={() => onAction('respondExchange', { exchangeId: entry.exchangeId, accept: false })}>Отклонить обмен</button></div></>}
      </article>;
    })}
    {exchanges.length > historyLimit && <button className="button secondary" disabled={busy} onClick={() => setHistoryLimit(value => value + 20)}>Показать ещё обмены</button>}
    {confirmation && <dialog className="exchange-dialog" ref={dialog} aria-labelledby={`${titleId}-confirm`} onCancel={event => { event.preventDefault(); setConfirmation(null); }}>
      <h2 id={`${titleId}-confirm`}>{confirmation.heading}</h2><PairPreview outgoing={confirmation.outgoing} incoming={confirmation.incoming} /><p>{confirmation.method === 'offerExchange' ? 'Пока друг отвечает, вашего цыплёнка нельзя активировать, переименовать или предложить ещё раз.' : 'Эти две птицы одновременно сменят владельцев. Их имена, гены, возраст и история сохранятся.'}</p><p className="exchange-fine-print">Без пёрышек, новых яиц и случайных замен.</p>
      <button className="button primary" disabled={busy || !confirmationValid || getAuthKey() !== authKey} onClick={() => { onAction(confirmation.method, confirmation.params); setConfirmation(null); }}>{confirmation.method === 'offerExchange' ? 'Да, предложить эту пару' : 'Да, обменять этих цыплят'}</button><button className="button secondary" disabled={busy} onClick={() => setConfirmation(null)}>Вернуться</button>
    </dialog>}
  </section>;
}
