import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useVersusGame, createVersusGame, joinVersusGame } from '../../hooks/useVersusGame';
import { boardDeck } from '../../xi/decks';
import { gridFromPlaced, BR, BC, cellKind } from '../../xi/versusModel';
import './XiVersus.css';

const cardArt = (cell) => {
  const pool = cell.d === 'be' ? boardDeck.events : boardDeck.twists;
  return pool[cell.i] || null;
};

export default function XiVersus() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile } = useUserProfile(user);
  const { game, loading, error } = useVersusGame(gameId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-join when you open a game link you're not part of.
  useEffect(() => {
    if (!game || !user || authLoading) return;
    const inGame = (game.players || []).some((p) => p.uid === user.uid);
    if (!inGame) joinVersusGame(gameId, user, profile).catch(() => {});
  }, [game, user, authLoading, gameId, profile]);

  // ---- Create / lobby (no game id) ----
  if (!gameId) {
    return (
      <div className="xiv">
        <div className="xiv-top"><span className="xiv-logo">XI · Versus</span></div>
        <div className="xiv-center">
          <p className="xiv-lead">Build a memory board together — one card, one story at a time.</p>
          {user ? (
            <button
              className="xiv-btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const id = await createVersusGame(user, profile);
                  navigate('/xi/versus/' + id);
                } catch (e) { alert(e.message); setBusy(false); }
              }}
            >
              {busy ? 'Starting…' : 'Start a new game'}
            </button>
          ) : (
            <p className="xiv-lead">Please <a href="/login">sign in</a> to start a game.</p>
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
  const myTurn = turnPlayer && user && turnPlayer.uid === user.uid;
  const link = `${window.location.origin}/xi/versus/${gameId}`;

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

      <div className="xiv-players">
        {players.map((p) => (
          <span key={p.uid} className={'xiv-pill' + (turnPlayer && turnPlayer.uid === p.uid ? ' on' : '')}>
            <i style={{ background: p.color }} />
            {p.name}{p.uid === user?.uid ? ' (you)' : ''}
          </span>
        ))}
      </div>

      <div className="xiv-turn">{myTurn ? 'Your turn' : (turnPlayer ? `${turnPlayer.name}'s turn` : '—')}</div>

      <div className="xiv-board">
        {Array.from({ length: BR * BC }).map((_, idx) => {
          const r = Math.floor(idx / BC);
          const c = idx % BC;
          const cell = grid[r][c];
          const kind = cellKind(r, c);
          if (!cell) return <div key={idx} className={'xiv-cell empty ' + kind} />;
          const art = cardArt(cell);
          return (
            <div key={idx} className={'xiv-cell ' + kind}>
              {art && <img src={art.img} alt={art.cap || ''} loading="lazy" />}
              {cell.color && <span className="xiv-dot" style={{ background: cell.color }} />}
            </div>
          );
        })}
      </div>

      <p className="xiv-note">
        Placing cards &amp; writing stories land next. For now: share the invite link — the board syncs live for everyone.
      </p>
    </div>
  );
}
