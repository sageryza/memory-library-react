import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import {
  useVersusGame, createVersusGame, joinVersusGame,
  useHand, ensureHand, placeCard, skipTurn, writeStory, useStories,
} from '../../hooks/useVersusGame';
import { boardDeck } from '../../xi/decks';
import { legalCells } from '../../xi/versusModel';
import { pairKey, timesSentence } from '../../xi/xiMemory';
import useKeyboardInset from '../../xi/useKeyboardInset';
import XiBoardGrid from './XiBoardGrid';
import XiNavBar from './XiNavBar';
import './XiVersus.css';

const artOf = (d, i) => ((d === 'be' ? boardDeck.events : boardDeck.twists)[i] || null);
const kindClass = (d) => (d === 'be' ? 'event' : 'twist');

export default function XiVersus() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAnonymous, signInAnonymously } = useAuth();
  const { profile } = useUserProfile(user);
  const { game, loading, error } = useVersusGame(gameId);
  const hand = useHand(gameId, user?.uid);
  const stories = useStories(gameId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState(null);   // hand card chosen to place
  const [storyCells, setStoryCells] = useState([]); // placed cells chosen to write on
  const [storyText, setStoryText] = useState('');
  const [working, setWorking] = useState(false);
  const [nameInput, setNameInput] = useState(() => {
    try { return localStorage.getItem('xiVersusName') || ''; } catch { return ''; }
  });

  const amInGame = !!(game && user && (game.players || []).some((p) => p.uid === user.uid));

  // Auto-join when you open a game link you're not part of (signed-in or guest).
  useEffect(() => {
    if (!game || !user || authLoading) return;
    const inGame = (game.players || []).some((p) => p.uid === user.uid);
    if (!inGame) joinVersusGame(gameId, user, profile).catch(() => {});
  }, [game, user, authLoading, gameId, profile]);

  // Deal the opening hand once you're confirmed in the game.
  const dealt = useRef('');
  useEffect(() => {
    if (!amInGame || !user) return;
    const key = gameId + ':' + user.uid;
    if (dealt.current === key) return;
    dealt.current = key;
    ensureHand(gameId, user.uid).catch(() => {});
  }, [amInGame, user, gameId]);

  // Keyboard height, to pin the story composer above the iOS keyboard.
  const kbInset = useKeyboardInset();

  // Sign in anonymously (guest), stashing the typed name for the join to use.
  const playAsGuest = async (after) => {
    const name = (nameInput.trim() || 'Guest');
    try { localStorage.setItem('xiVersusName', name); } catch { /* ignore */ }
    setBusy(true);
    try {
      await signInAnonymously();
      if (after) await after();
    } catch (e) {
      setBusy(false);
      if (e.code === 'auth/operation-not-allowed') {
        alert('Guest play isn’t enabled yet. Please sign in instead.');
      } else {
        alert('Could not join: ' + (e.message || e.code));
      }
    }
  };

  const startGame = async (asUser) => {
    setBusy(true);
    try {
      const id = await createVersusGame(asUser || user, profile);
      navigate('/xi/versus/' + id);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const NameField = (
    <input
      className="xiv-name"
      placeholder="Your name"
      value={nameInput}
      maxLength={24}
      onChange={(e) => setNameInput(e.target.value)}
    />
  );

  // ---- Create / lobby (no game id) ----
  if (!gameId) {
    return (
      <div className="xiv">
        <div className="xiv-top"><span className="xiv-logo">XI · Versus</span></div>
        <div className="xiv-center">
          <p className="xiv-lead">Build a memory board together — one card, one story at a time.</p>
          {user ? (
            <button className="xiv-btn" disabled={busy} onClick={() => startGame()}>
              {busy ? 'Starting…' : 'Start a new game'}
            </button>
          ) : (
            <div className="xiv-guest">
              {NameField}
              <button className="xiv-btn" disabled={busy} onClick={() => playAsGuest(startGame)}>
                {busy ? 'Starting…' : 'Start as guest'}
              </button>
              <a className="xiv-signin" href="/login">or sign in</a>
            </div>
          )}
          <button className="xiv-back" onClick={() => navigate('/xi')}>← Back to XI</button>
        </div>
        <XiNavBar />
      </div>
    );
  }

  if (loading || authLoading) {
    return <div className="xiv"><div className="xiv-center"><p className="xiv-lead">Loading…</p></div></div>;
  }
  if (error === 'not-found' || !game) {
    return (
      <div className="xiv"><div className="xiv-center">
        <p className="xiv-lead">This game wasn't found — it may have been removed.</p>
        <button className="xiv-btn" onClick={() => navigate('/xi/versus')}>Start a new one</button>
      </div></div>
    );
  }

  const players = game.players || [];
  const acted = game.acted || [];
  const iActed = !!(user && acted.includes(user.uid));
  const canAct = amInGame && !iActed && !working;
  const link = `${window.location.origin}/xi/versus/${gameId}`;

  // Legal target cells for the selected hand card — used only to gate taps; per
  // design there is no loud on-board indicator.
  const legalSet = (canAct && selected)
    ? new Set(legalCells(game.placed || [], selected).map(([r, c]) => r + '-' + c))
    : new Set();

  // Pairing currently chosen to write a story on (two adjacent placed cells).
  const storyReady = storyCells.length === 2;
  const storyEv = storyCells.find((s) => s.d === 'be');
  const storyTw = storyCells.find((s) => s.d === 'bw');
  const storyPairKey = (storyReady && storyEv && storyTw)
    ? pairKey({ id: artOf('be', storyEv.i)?.id }, { id: artOf('bw', storyTw.i)?.id })
    : null;
  const pairStories = storyPairKey ? stories.filter((s) => s.pairKey === storyPairKey) : [];
  const storyLabel = (storyReady && storyEv && storyTw)
    ? timesSentence(artOf('be', storyEv.i), artOf('bw', storyTw.i)) : '';

  // A token (the author's colour) lands on BOTH cards each time a story is
  // written on their pairing — so cards accrue multiple tokens. Map card id ->
  // list of author colours.
  const tokensByCard = {};
  for (const s of stories) {
    if (!s.pairKey) continue;
    for (const id of s.pairKey.split('__')) {
      if (!id) continue;
      (tokensByCard[id] = tokensByCard[id] || []).push(s.color || '#999');
    }
  }

  const handlePlace = async (r, c) => {
    if (!selected || working) return;
    setWorking(true);
    try { await placeCard(gameId, user, selected, r, c); setSelected(null); }
    catch (e) { alert(e.message); }
    finally { setWorking(false); }
  };

  // Tap placed cards to pick an event×twist pairing to write on.
  const tapPlaced = (r, c, cell) => {
    setSelected(null);
    setStoryCells((prev) => {
      if (prev.length !== 1) return [{ r, c, d: cell.d, i: cell.i }];
      const a = prev[0];
      if (a.r === r && a.c === c) return [];
      const adjacent = Math.abs(a.r - r) + Math.abs(a.c - c) === 1;
      const opposite = a.d !== cell.d;
      return (adjacent && opposite) ? [a, { r, c, d: cell.d, i: cell.i }] : [{ r, c, d: cell.d, i: cell.i }];
    });
  };

  const handleWrite = async () => {
    if (!storyText.trim() || working) return;
    setWorking(true);
    try { await writeStory(gameId, user, storyCells, storyText); setStoryCells([]); setStoryText(''); }
    catch (e) { alert(e.message); }
    finally { setWorking(false); }
  };

  const doSkip = async () => {
    if (working) return;
    setWorking(true);
    try { await skipTurn(gameId, user); setSelected(null); setStoryCells([]); }
    catch (e) { alert(e.message); }
    finally { setWorking(false); }
  };

  // Empty cell -> place the selected card if legal; placed cell -> pick for a story.
  const handleCellClick = (r, c, cell) => {
    if (!cell) { if (legalSet.has(r + '-' + c)) handlePlace(r, c); return; }
    if (canAct) tapPlaced(r, c, cell);
  };

  return (
    <div className="xiv">
      <div className="xiv-top">
        <button className="xiv-logo-btn" onClick={() => navigate('/xi')}>XI · Versus</button>
        <button className="xiv-link" onClick={async () => {
          try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
          catch { window.prompt('Copy this invite link:', link); }
        }}>{copied ? 'Link copied ✓' : 'Invite link'}</button>
      </div>

      {!user && (
        <div className="xiv-join">
          {NameField}
          <button className="xiv-btn-sm" disabled={busy} onClick={() => playAsGuest()}>Join as guest</button>
          <a className="xiv-signin" href="/login">or sign in</a>
        </div>
      )}
      {isAnonymous && (
        <div className="xiv-nudge"><a href="/login">Sign in</a> to keep your stories &amp; stats.</div>
      )}

      <div className="xiv-players">
        {players.map((p) => (
          <span key={p.uid} className={'xiv-pill' + (acted.includes(p.uid) ? ' done' : '')}>
            <i style={{ background: p.color }} />
            {p.name}{p.uid === user?.uid ? ' (you)' : ''}{acted.includes(p.uid) ? ' ✓' : ''}
          </span>
        ))}
      </div>

      <div className="xiv-turn">
        {amInGame
          ? (canAct
            ? 'Your move — place a card or write a story'
            : (iActed ? `Played ✓ — waiting (${acted.length}/${players.length})` : 'Working…'))
          : 'Watching live'}
      </div>

      <XiBoardGrid
        placed={game.placed}
        tokensByCard={tokensByCard}
        selectedCells={storyCells}
        onCellClick={handleCellClick}
      />

      {storyReady && (
        <div className="xiv-composer" style={{ bottom: kbInset || 60 }}>
          <div className="xiv-pairlabel">{storyLabel}</div>
          {pairStories.length > 0 && (
            <div className="xiv-pairstories">
              {pairStories.map((s) => (
                <div key={s.id} className="xiv-pairstory"><i style={{ background: s.color || '#999' }} /> {s.text}</div>
              ))}
            </div>
          )}
          <textarea className="xiv-ta" placeholder="A memory that's both of these…"
            value={storyText} maxLength={500} onChange={(e) => setStoryText(e.target.value)} />
          <div className="xiv-composer-row">
            <button className="xiv-ghost" onClick={() => { setStoryCells([]); setStoryText(''); }}>Cancel</button>
            <button className="xiv-btn-sm" disabled={working || !storyText.trim()} onClick={handleWrite}>Save story</button>
          </div>
        </div>
      )}

      {amInGame ? (
        <>
          {!storyReady && (
            <div className="xiv-hint">
              {canAct
                ? (selected
                  ? 'Tap an open cell (matching colour, next to a card) to lay it.'
                  : 'Place a card from your hand, or tap two touching cards to write a story.')
                : (iActed ? 'You’ve played this round.' : '')}
            </div>
          )}
          <div className="xiv-hand">
            {hand.map((card, k) => {
              const art = artOf(card.d, card.i);
              const sel = selected && selected.d === card.d && selected.i === card.i;
              return (
                <button key={k}
                  className={'xiv-handcard ' + kindClass(card.d) + (sel ? ' sel' : '')}
                  disabled={!canAct}
                  onClick={() => { setStoryCells([]); setSelected(sel ? null : card); }}>
                  {art && <img src={art.img} alt={art.cap || ''} />}
                </button>
              );
            })}
            {hand.length === 0 && <span className="xiv-empty">No cards left — write a story.</span>}
          </div>
          {canAct && <button className="xiv-pass" disabled={working} onClick={doSkip}>Skip my move</button>}
        </>
      ) : (
        <p className="xiv-note">Watching live. Join to play, or share the invite link.</p>
      )}

      {stories.length > 0 && (
        <div className="xiv-feed">
          <div className="xiv-feed-title">Stories</div>
          {stories.slice(0, 12).map((s) => (
            <div key={s.id} className="xiv-feeditem">
              <i style={{ background: s.color || '#999' }} />
              <span className="xiv-feedwho">{s.byName}</span> {s.text}
            </div>
          ))}
        </div>
      )}
      <XiNavBar />
    </div>
  );
}
