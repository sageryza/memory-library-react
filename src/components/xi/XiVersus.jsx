import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import {
  useVersusGame, createVersusGame, joinVersusGame, beginVersusGame,
  useHand, ensureHand, placeCard, writeStory, useStories,
  listVersusGames, fetchGamesSummary, undoLastMove,
  setLastVersusGame, clearLastVersusGame,
} from '../../hooks/useVersusGame';
import { boardDeck } from '../../xi/decks';
import { legalCells } from '../../xi/versusModel';
import { pairKey, timesSentence } from '../../xi/xiMemory';
import { enableTurnNotifications } from '../../xi/notify';
import XiBoardGrid from './XiBoardGrid';
import XiNavBar from './XiNavBar';
import KeyboardSheet from './KeyboardSheet';
import XiInfo from './XiInfo';
import './XiVersus.css';

const VERSUS_HELP = (
  <>
    <p>Build a shared memory board with friends — one card and one story at a time.</p>
    <p><b>Your move:</b> place a card from your hand onto an empty square of its colour, next to a card already on the board. Then <b>tell its story</b> — tap the touching card it pairs with and write a memory that's both of them.</p>
    <p>You can also just <b>write a story</b> on any two touching cards already on the board, without placing.</p>
    <p><b>Cards:</b> cream squares hold events (“times i…”), white squares hold twists (“…at the worst moment”). Every touching pair makes a prompt.</p>
    <p><b>Rounds:</b> everyone takes one move per round — you can't go again until the others have gone.</p>
    <p>Tap <b>undo</b> (top-left) to take back a card you just placed. Invite friends from the waiting room — once the game begins it's locked to its players.</p>
  </>
);

const artOf = (d, i) => ((d === 'be' ? boardDeck.events : boardDeck.twists)[i] || null);
const kindClass = (d) => (d === 'be' ? 'event' : 'twist');

export default function XiVersus() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAnonymous, } = useAuth();
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
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifOn, setNotifOn] = useState(() => { try { return localStorage.getItem('xiNotifDone') === '1'; } catch { return false; } });
  const [notifWanted, setNotifWanted] = useState(true);   // pre-checked opt-in
  const [notifDismissed, setNotifDismissed] = useState(false);
  const [phoneInput, setPhoneInput] = useState(() => {
    try { return localStorage.getItem('xiVersusPhone') || ''; } catch { return ''; }
  });
  const [joinError, setJoinError] = useState('');
  const [summaries, setSummaries] = useState(null); // lobby: fetched game summaries

  const amInGame = !!(game && user && (game.players || []).some((p) => p.uid === user.uid));

  // Auto-join when you open a game link you're not part of. The hook enforces
  // the door policy (only while waiting); a locked game surfaces its message.
  useEffect(() => {
    if (!game || !user || authLoading) return;
    const inGame = (game.players || []).some((p) => p.uid === user.uid);
    if (!inGame) joinVersusGame(gameId, user, profile).catch((e) => setJoinError(e.message || 'Could not join.'));
  }, [game, user, authLoading, gameId, profile]);

  // Lobby: fetch a one-shot summary of each remembered game so the list can be
  // sorted (your-turn games first, then most recently touched) and show names.
  useEffect(() => {
    if (gameId || !user) return;
    const ids = listVersusGames().map((g) => g.id);
    if (!ids.length) { setSummaries([]); return; }
    fetchGamesSummary(ids, user.uid).then(setSummaries).catch(() => setSummaries([]));
  }, [gameId, user]);

  // Deal the opening hand once you're confirmed in the game.
  const dealt = useRef('');
  useEffect(() => {
    if (!amInGame || !user) return;
    const key = gameId + ':' + user.uid;
    if (dealt.current === key) return;
    dealt.current = key;
    ensureHand(gameId, user.uid).catch(() => {});
  }, [amInGame, user, gameId]);

  // Other games this device is in (for resume / switcher), excluding the open one.
  const otherGames = listVersusGames().filter((g) => g.id !== gameId);

  // Remember the game you're viewing so the Versus nav icon can auto-resume it;
  // forget it if the link turns out to be dead so we don't bounce you to a 404.
  useEffect(() => {
    if (gameId && game) setLastVersusGame(gameId);
    else if (gameId && error === 'not-found') clearLastVersusGame();
  }, [gameId, game, error]);


  // Turn on "your turn" alerts for this user. Email + push are free; SMS only
  // fires if they gave a number. The number is remembered locally so it prefills
  // next time. Never throws — a notify hiccup must not block starting a game.
  const applyNotif = async (asUser) => {
    const usr = asUser || user;
    if (!usr || !notifWanted) { setNotifDismissed(true); return; }
    const phone = phoneInput.trim();
    try { if (phone) localStorage.setItem('xiVersusPhone', phone); } catch { /* ignore */ }
    setNotifBusy(true);
    try {
      await enableTurnNotifications(usr, { phone });
      setNotifOn(true);
      try { localStorage.setItem('xiNotifDone', '1'); } catch { /* ignore */ }
    } catch (e) { console.warn('[notify]', e?.message || e); }
    finally { setNotifBusy(false); }
  };

  const startGame = async (asUser) => {
    setBusy(true);
    try {
      const id = await createVersusGame(asUser || user, profile);
      await applyNotif(asUser || user);
      navigate('/xi/versus/' + id);
    } catch (e) { alert(e.message); setBusy(false); }
  };

  // The pre-checked "text me when it's my turn" opt-in. Used on the lobby (where
  // Start applies it) and as an in-game banner for players who joined via a link
  // (where its own Save applies it). Hidden once they've opted in.
  const notifOptInBlock = (inline) => {
    if (notifOn) return null;
    return (
      <div className={'xiv-notif' + (inline ? ' inline' : '')}>
        <div className="xiv-notif-hook">Don’t keep your friends waiting.</div>
        <label className="xiv-notif-row">
          <input type="checkbox" checked={notifWanted} onChange={(e) => setNotifWanted(e.target.checked)} />
          <span className="xiv-notif-label">Text me when it’s my turn</span>
        </label>
        {notifWanted && (
          <>
            <input className="xiv-notif-phone" type="tel" inputMode="tel" autoComplete="tel"
              placeholder="Mobile number" value={phoneInput} maxLength={20}
              onChange={(e) => setPhoneInput(e.target.value)} />
            <div className="xiv-notif-fine">We’ll never text you anything else. <a href="/sms" target="_blank" rel="noreferrer">SMS terms</a></div>
          </>
        )}
        {inline && (
          <div className="xiv-notif-actions">
            <button className="xiv-ghost" onClick={() => setNotifDismissed(true)}>Not now</button>
            <button className="xiv-btn-sm" disabled={notifBusy} onClick={() => applyNotif()}>
              {notifBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    );
  };


  // ---- Create / lobby (no game id) ----
  if (!gameId) {
    // Until the summaries land, show the remembered list as-is; once they do,
    // your-turn games float to the top and rows carry the other players' names.
    const lobbyGames = summaries === null
      ? otherGames.map((g) => ({ id: g.id, names: '', yourTurn: false }))
      : summaries
        .slice()
        .sort((a, b) => (b.yourTurn - a.yourTurn) || (b.updatedAtMillis - a.updatedAtMillis))
        .map((s) => ({ id: s.id, names: (s.players || []).join(', '), yourTurn: s.yourTurn }));
    return (
      <div className="xiv">
        <div className="xiv-top">
          <span className="xiv-logo">XI · Versus</span>
          <XiInfo title="How to play XI Versus">{VERSUS_HELP}</XiInfo>
        </div>
        <div className="xiv-center">
          <p className="xiv-lead">Build a memory board together — one card, one story at a time.</p>
          {lobbyGames.length > 0 && (
            <div className="xiv-resume">
              <div className="xiv-resume-title">Your games</div>
              {lobbyGames.map((g) => (
                <div key={g.id} className="xiv-resume-row">
                  <button className="xiv-resume-btn" onClick={() => navigate('/xi/versus/' + g.id)}>
                    Resume <span className="xiv-resume-id">{g.names || g.id}</span>
                    {g.yourTurn && <span className="xiv-resume-turn">your turn</span>}
                  </button>
                </div>
              ))}
            </div>
          )}
          {notifOptInBlock(false)}
          {user ? (
            <button className="xiv-btn" disabled={busy} onClick={() => startGame()}>
              {busy ? 'Starting…' : 'Start a new game'}
            </button>
          ) : (
            <div className="xiv-guest">
              {/* Playing needs an account (no guest mode) — Google is one tap,
                  and sign-in returns straight here. */}
              <button className="xiv-btn" onClick={() => navigate('/login?next=' + encodeURIComponent('/xi/versus'))}>
                Sign in to play
              </button>
              <p className="xiv-note">Takes a moment with Google — then you can start a game.</p>
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
  // Waiting room: the game isn't playable until the creator begins it. Older
  // docs have no status field — treat those as active.
  const waiting = (game.status || 'active') === 'waiting';
  const isCreator = user?.uid === game.createdBy;
  const creatorName = (players.find((p) => p.uid === game.createdBy) || {}).name || 'the host';
  const iActed = !!(user && acted.includes(user.uid));
  const iPlaced = !!(user && (game.placedBy || []).includes(user.uid)); // placed, owe a story
  // A move = place a card then tell its story, OR write a story on an existing
  // pairing. You can place only once per round; you can write until your move is done.
  const canPlace2 = amInGame && !waiting && !iActed && !iPlaced && !working;
  const canWrite = amInGame && !waiting && !iActed && !working;
  // The SHORT invite form — same link the iOS app shares. It's a universal
  // link, so friends with the app land in the app; others get this page.
  const link = `${window.location.origin}/versus/${gameId}`;

  // Legal target cells for the selected hand card — gates taps and shows a subtle
  // on-board hint so you can see where a card may go.
  const legalList = (canPlace2 && selected) ? legalCells(game.placed || [], selected) : [];
  const legalSet = new Set(legalList.map(([r, c]) => r + '-' + c));

  // You can undo your own placement while it's still the last card on the board.
  const lastPlaced = (game.placed || [])[(game.placed || []).length - 1];
  const canUndo = amInGame && !waiting && !working && lastPlaced && lastPlaced.by === user?.uid;

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
    const justPlaced = { r, c, d: selected.d, i: selected.i };
    try {
      await placeCard(gameId, user, selected, r, c);
      setSelected(null);
      // Auto-select the card you just placed — you'll write a story on it next,
      // so pre-pick it and prompt for its touching partner.
      setStoryCells([justPlaced]);
    } catch (e) { alert(e.message); }
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

  const doUndo = async () => {
    if (working) return;
    setWorking(true);
    try { await undoLastMove(gameId, user); setSelected(null); setStoryCells([]); }
    catch (e) { alert(e.message); }
    finally { setWorking(false); }
  };

  // Opt in to "it's your turn" alerts (text + web push + email).
  // The header bell just (re)opens the opt-in banner — to turn alerts on, or to
  // change the number later. No more window.prompt.
  const openNotifOptIn = () => {
    if (!user) { alert('Join or sign in first to get turn alerts.'); return; }
    setNotifWanted(true);
    setNotifDismissed(false);
    setNotifOn(false);
    try { localStorage.removeItem('xiNotifDone'); } catch { /* ignore */ }
  };

  // Open the OS share sheet (Messages, etc.) with the invite link; fall back to
  // copying the link if the device has no share support.
  const shareInvite = async () => {
    const data = { title: 'XI · Versus', text: 'Build a memory board with me in XI:', url: link };
    try {
      if (navigator.share) { await navigator.share(data); setCopied(true); setTimeout(() => setCopied(false), 1500); return; }
    } catch { return; /* user cancelled the share sheet */ }
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { window.prompt('Copy this invite link:', link); }
  };

  // Begin the game (creator only, from the waiting room): waiting -> active.
  const doBegin = async () => {
    if (working) return;
    setWorking(true);
    try { await beginVersusGame(gameId, user); }
    catch (e) { alert(e.message); }
    finally { setWorking(false); }
  };

  // Empty cell -> place the selected card if legal; placed cell -> pick for a story.
  // While the game is waiting, the seeded board is display-only.
  const handleCellClick = (r, c, cell) => {
    if (waiting) return;
    if (!cell) { if (legalSet.has(r + '-' + c)) handlePlace(r, c); return; }
    if (canWrite) tapPlaced(r, c, cell);
  };

  return (
    <div className="xiv">
      <div className="xiv-top">
        <button className="xiv-logo-btn" onClick={() => navigate('/xi/versus')} title="All your games">XI · Versus</button>
        <div className="xiv-top-right">
          <XiInfo title="How to play XI Versus">{VERSUS_HELP}</XiInfo>
          {otherGames.length > 0 && (
            <select className="xiv-switch" value={gameId}
              onChange={(e) => { const v = e.target.value; navigate(v === 'new' ? '/xi/versus' : '/xi/versus/' + v); }}>
              <option value={gameId}>This game</option>
              {otherGames.map((g) => <option key={g.id} value={g.id}>Game {g.id}</option>)}
              <option value="new">＋ New game</option>
            </select>
          )}
          <button className={'xiv-bell' + (notifOn ? ' on' : '')} disabled={notifBusy}
            onClick={openNotifOptIn} aria-label="Notify me when it's my turn"
            title="Notify me when it's my turn">
            <svg viewBox="0 0 24 24" fill={notifOn ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          </button>
          {/* No header Share button — a started game is locked to its players;
              inviting happens in the waiting room only. */}
        </div>
      </div>

      <div className="xiv-subbar">
        {canUndo ? (
          <button className="xiv-undo" disabled={working} onClick={doUndo} aria-label="Undo your last placement" title="Undo your last placement">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" />
            </svg>
          </button>
        ) : <span />}
        <XiInfo title="How to play XI Versus">{VERSUS_HELP}</XiInfo>
      </div>

      {!user && (
        <div className="xiv-join">
          <button className="xiv-btn-sm"
            onClick={() => navigate('/login?next=' + encodeURIComponent('/xi/versus/' + gameId))}>
            Sign in to join this game
          </button>
        </div>
      )}
      {isAnonymous && (
        <div className="xiv-nudge"><a href="/login">Sign in</a> to keep your stories &amp; stats.</div>
      )}

      {amInGame && !notifOn && !notifDismissed && notifOptInBlock(true)}

      <div className="xiv-players">
        {players.map((p) => (
          <span key={p.uid} className={'xiv-pill' + (acted.includes(p.uid) ? ' done' : '')}>
            <i style={{ background: p.color }} />
            {p.name}{p.uid === user?.uid ? ' (you)' : ''}{acted.includes(p.uid) ? ' ✓' : ''}
          </span>
        ))}
      </div>

      {!waiting && (
        <div className="xiv-turn">
          {amInGame
            ? (iPlaced
              ? 'Now tell its story — tap a touching card'
              : (canPlace2
                ? 'Your move — place a card or write a story'
                : (iActed ? `Played ✓ — waiting (${acted.length}/${players.length})` : 'Working…')))
            : (user ? (joinError || 'Joining…') : 'Sign in to join')}
        </div>
      )}

      <XiBoardGrid
        placed={game.placed}
        tokensByCard={tokensByCard}
        selectedCells={storyCells}
        onCellClick={handleCellClick}
      />

      {storyReady && (
        <KeyboardSheet>
          <div className="xiv-composer">
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
        </KeyboardSheet>
      )}

      {waiting ? (
        // Waiting room — the seeded board above is display-only until the
        // creator begins. Inviting lives here (and only here).
        <div className="xiv-waiting">
          <div className="xiv-turn">Waiting for friends to join…</div>
          <p className="xiv-waiting-names">
            Here so far: {players.map((p) => p.name + (p.uid === user?.uid ? ' (you)' : '')).join(', ')}
          </p>
          <button className="xiv-btn" onClick={shareInvite}>{copied ? 'Invite link shared ✓' : 'Invite friends'}</button>
          {isCreator ? (
            players.length >= 2
              ? (
                <button className="xiv-btn xiv-begin" disabled={working} onClick={doBegin}>
                  {working ? 'Beginning…' : 'Begin the game'}
                </button>
              )
              : <p className="xiv-note">You can begin once at least one friend joins.</p>
          ) : (
            amInGame && <p className="xiv-note">Waiting for {creatorName} to begin.</p>
          )}
          {!amInGame && (
            <p className="xiv-note">{user ? (joinError || 'Joining the game…') : 'Sign in above to join this game.'}</p>
          )}
        </div>
      ) : amInGame ? (
        <>
          <div className="xiv-hand">
            {hand.map((card, k) => {
              const art = artOf(card.d, card.i);
              const sel = selected && selected.d === card.d && selected.i === card.i;
              return (
                <button key={k}
                  className={'xiv-handcard ' + kindClass(card.d) + (sel ? ' sel' : '')}
                  disabled={!canPlace2}
                  onClick={() => { setStoryCells([]); setSelected(sel ? null : card); }}>
                  {art && <img src={art.img} alt={art.cap || ''} />}
                </button>
              );
            })}
            {hand.length === 0 && <span className="xiv-empty">No cards left — write a story.</span>}
          </div>
        </>
      ) : (
        <p className="xiv-note">{user ? (joinError || 'Joining the game…') : 'Sign in above to join this game.'}</p>
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
