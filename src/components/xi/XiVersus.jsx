import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import {
  useVersusGame, createVersusGame, joinVersusGame,
  useHand, ensureHand, placeCard, passTurn,
} from '../../hooks/useVersusGame';
import { boardDeck } from '../../xi/decks';
import { gridFromPlaced, BR, BC, cellKind, legalCells } from '../../xi/versusModel';
import './XiVersus.css';

const artOf = (d, i) => ((d === 'be' ? boardDeck.events : boardDeck.twists)[i] || null);

const cardArt = (cell) => {
  const pool = cell.d === 'be' ? boardDeck.events : boardDeck.twists;
  return pool[cell.i] || null;
};

export default function XiVersus() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAnonymous, signInAnonymously } = useAuth();
  const { profile } = useUserProfile(user);
  const { game, loading, error } = useVersusGame(gameId);
  const hand = useHand(gameId, user?.uid);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState(null);
  const [placing, setPlacing] = useState(false);
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

  const grid = gridFromPlaced(game.placed);
  const players = game.players || [];
  const turnPlayer = players[game.currentTurnIndex] || null;
  const myTurn = !!(turnPlayer && user && turnPlayer.uid === user.uid);
  const link = `${window.location.origin}/xi/versus/${gameId}`;

  // Cells where the selected card may legally go (only on your turn).
  const legalSet = (myTurn && selected)
    ? new Set(legalCells(game.placed || [], selected).map(([r, c]) => r + '-' + c))
    : new Set();

  const handlePlace = async (r, c) => {
    if (!selected || placing) return;
    setPlacing(true);
    try { await placeCard(gameId, user, selected, r, c); setSelected(null); }
    catch (e) { alert(e.message); }
    finally { setPlacing(false); }
  };

  const doPass = async () => {
    if (placing) return;
    setPlacing(true);
    try { await passTurn(gameId, user); setSelected(null); }
    catch (e) { alert(e.message); }
    finally { setPlacing(false); }
  };

  return (
    <div className="xiv">
      <div className="xiv-top">
        <button className="xiv-logo-btn" onClick={() => navigate('/xi')}>XI · Versus</button>
        <button
          className="xiv-link"
          onClick={async () => {
            try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
            catch { window.prompt('Copy this invite link:', link); }
          }}
        >
          {copied ? 'Link copied ✓' : 'Invite link'}
        </button>
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
          <span key={p.uid} className={'xiv-pill' + (turnPlayer && turnPlayer.uid === p.uid ? ' on' : '')}>
            <i style={{ background: p.color }} />
            {p.name}{p.uid === user?.uid ? ' (you)' : ''}
          </span>
        ))}
      </div>

      <div className="xiv-turn">{myTurn ? 'Your turn' : (turnPlayer ? `${turnPlayer.name}'s turn` : '—')}</div>

      <div className="xiv-board" style={{ gridTemplateColumns: `repeat(${BC}, 1fr)` }}>
        {Array.from({ length: BR * BC }).map((_, idx) => {
          const r = Math.floor(idx / BC);
          const c = idx % BC;
          const cell = grid[r][c];
          const kind = cellKind(r, c);
          const isLegal = legalSet.has(r + '-' + c);
          if (!cell) {
            return (
              <div
                key={idx}
                className={'xiv-cell empty ' + kind + (isLegal ? ' legal' : '')}
                onClick={isLegal ? () => handlePlace(r, c) : undefined}
              />
            );
          }
          const art = cardArt(cell);
          return (
            <div key={idx} className={'xiv-cell ' + kind}>
              {art && <img src={art.img} alt={art.cap || ''} loading="lazy" />}
              {cell.color && <span className="xiv-dot" style={{ background: cell.color }} />}
            </div>
          );
        })}
      </div>

      {amInGame ? (
        <>
          <div className="xiv-hint">
            {myTurn
              ? (selected ? 'Tap a glowing cell to lay it.' : 'Pick a card, then a glowing cell. (Event cards open the board.)')
              : `Waiting for ${turnPlayer ? turnPlayer.name : '…'}…`}
          </div>
          <div className="xiv-hand">
            {hand.map((card, k) => {
              const art = artOf(card.d, card.i);
              const sel = selected && selected.d === card.d && selected.i === card.i;
              return (
                <button
                  key={k}
                  className={'xiv-handcard' + (sel ? ' sel' : '')}
                  disabled={!myTurn || placing}
                  onClick={() => setSelected(sel ? null : card)}
                >
                  {art && <img src={art.img} alt={art.cap || ''} />}
                </button>
              );
            })}
            {hand.length === 0 && <span className="xiv-empty">No cards left</span>}
          </div>
          {myTurn && (
            <button className="xiv-pass" disabled={placing} onClick={doPass}>Pass</button>
          )}
        </>
      ) : (
        <p className="xiv-note">Watching live. Join to play, or share the invite link.</p>
      )}
    </div>
  );
}
