import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { boardDeck, CURATOR_EMAILS, applyDeckExtras } from '../../xi/decks';
import { fetchDeckExtras, addSharedCard, removeSharedCard, restoreSharedCard } from '../../xi/deckExtras';
import './XiDeckManager.css';

const baseIdOf = (card) => card.id.replace(/^board-event-/, '');

// Curator-only manager for the SHARED midjourney deck: add a card (art +
// caption) or remove/restore one FOR EVERYONE — website immediately, phones
// once the app reads remote extras (1.2+). Removals are hides, so nobody's
// old memories lose their art, and any removal can be undone here.
export default function XiDeckManager() {
  const { user, loading } = useAuth();
  const [extras, setExtras] = useState(null);
  const [cap, setCap] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDeckExtras().then((x) => { applyDeckExtras(x); setExtras(x); }).catch(() => setExtras({ added: [], removed: [] }));
  }, []);

  if (loading) return null;
  if (!user?.email || !CURATOR_EMAILS.includes(user.email)) return <Navigate to="/xi" replace />;

  const cards = boardDeck.events.filter((c) => c.deck === 'midjourney');
  const removed = new Set(extras?.removed || []);

  const refresh = async () => {
    const x = await fetchDeckExtras();
    applyDeckExtras(x);
    setExtras(x);
  };

  const onAdd = async (e) => {
    e.preventDefault();
    if (!cap.trim() || !file) return;
    setBusy(true); setError(null);
    try {
      await addSharedCard({ cap: cap.trim().toUpperCase(), file });
      setCap(''); setFile(null);
      e.target.reset();
      await refresh();
    } catch (err) { setError(String(err?.message || err)); }
    setBusy(false);
  };

  const toggleRemoved = async (card) => {
    const base = baseIdOf(card);
    setBusy(true); setError(null);
    try {
      if (removed.has(base)) await restoreSharedCard(base);
      else await removeSharedCard(base);
      await refresh();
    } catch (err) { setError(String(err?.message || err)); }
    setBusy(false);
  };

  return (
    <div className="xdm">
      <h1 className="xdm-title">midjourney deck</h1>
      <p className="xdm-sub">
        Changes here are for <b>everyone</b> — the website updates immediately.
        Removing hides a card from play (old memories keep their art) and can be undone.
      </p>

      <form className="xdm-add" onSubmit={onAdd}>
        <input className="xdm-cap" type="text" placeholder="CAPTION FOR THE NEW CARD"
          value={cap} maxLength={80} onChange={(e) => setCap(e.target.value)} />
        <input className="xdm-file" type="file" accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="xdm-btn" type="submit" disabled={busy || !cap.trim() || !file}>
          {busy ? 'working…' : 'add card for everyone'}
        </button>
      </form>
      {error && <p className="xdm-error">{error}</p>}

      {extras === null ? <p className="xdm-sub">loading…</p> : (
        <div className="xdm-grid">
          {cards.map((c) => {
            const off = removed.has(baseIdOf(c));
            return (
              <div key={c.id} className={'xdm-card' + (off ? ' off' : '')}>
                {c.img && <img src={c.img} alt={c.cap} loading="lazy" decoding="async" />}
                <div className="xdm-cap-label">{c.cap}</div>
                <button className="xdm-btn xdm-toggle" disabled={busy} onClick={() => toggleRemoved(c)}>
                  {off ? 'restore' : 'remove for everyone'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
