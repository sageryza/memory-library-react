import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { boardDeck } from '../../xi/decks';
import { dailyBoard, dayNumber, dayLabel } from '../../xi/boardOfDayModel';
import { pairKey, timesSentence, isXiMemory, buildXiMemoryDoc } from '../../xi/xiMemory';
import XiBoardGrid from './XiBoardGrid';
import XiNavBar from './XiNavBar';
import KeyboardSheet from './KeyboardSheet';
import XiInfo from './XiInfo';

const BOARD_HELP = (
  <>
    <p>Each day everyone gets the <b>same</b> board — a little crossword of memory cards.</p>
    <p>Tap <b>two touching cards</b> to write a memory that's both of them (“times i…”). Every neighbouring pair makes a prompt.</p>
    <p>You can write as many memories on a pairing as you like — they're saved to your library.</p>
    <p>Use the <b>‹ ›</b> arrows up top to revisit past days' boards.</p>
  </>
);
import './XiVersus.css';
import './BoardOfDay.css';

const POOLS = { events: boardDeck.events.map((c) => c.cap), twists: boardDeck.twists.map((c) => c.cap) };
const artOf = (d, i) => ((d === 'be' ? boardDeck.events : boardDeck.twists)[i] || null);
const TOKEN = '#800020';

// Board of the Day — a daily crossword-style board everyone shares, where you
// write memories on touching card pairings. Past days are revisitable via the
// top-corner day stepper. Reuses the shared XiBoardGrid.
export default function BoardOfDay({ memories = [], addMemory }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const useRandom = params.get('gen') === 'random'; // ?gen=random → old baseline, for comparison
  const today = dayNumber();
  const [viewDay, setViewDay] = useState(today);
  const [storyCells, setStoryCells] = useState([]);
  const [storyText, setStoryText] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const placed = dailyBoard(viewDay, POOLS, { random: useRandom });

  // Your XI memories grouped by pairing, for the per-pairing list + tokens.
  const myXi = (memories || []).filter(isXiMemory);
  const byPair = {};
  const tokensByCard = {};
  for (const m of myXi) {
    if (!m.pairKey) continue;
    (byPair[m.pairKey] = byPair[m.pairKey] || []).push(m);
    for (const id of m.pairKey.split('__')) {
      if (id) (tokensByCard[id] = tokensByCard[id] || []).push(TOKEN);
    }
  }

  const storyReady = storyCells.length === 2;
  const ev = storyCells.find((s) => s.d === 'be');
  const tw = storyCells.find((s) => s.d === 'bw');
  const evCard = ev ? artOf('be', ev.i) : null;
  const twCard = tw ? artOf('bw', tw.i) : null;
  const pk = (storyReady && evCard && twCard) ? pairKey({ id: evCard.id }, { id: twCard.id }) : null;
  const existing = pk ? (byPair[pk] || []) : [];
  const label = (storyReady && evCard && twCard) ? timesSentence(evCard, twCard) : '';

  const tapCell = (r, c, cell) => {
    if (!cell) return;
    setJustSaved(false);
    setStoryCells((prev) => {
      if (prev.length !== 1) return [{ r, c, d: cell.d, i: cell.i }];
      const a = prev[0];
      if (a.r === r && a.c === c) return [];
      const adjacent = Math.abs(a.r - r) + Math.abs(a.c - c) === 1;
      const opposite = a.d !== cell.d;
      return (adjacent && opposite) ? [a, { r, c, d: cell.d, i: cell.i }] : [{ r, c, d: cell.d, i: cell.i }];
    });
  };

  const save = async () => {
    const text = storyText.trim();
    if (!text || saving || !evCard || !twCard) return;
    setSaving(true);
    try {
      await addMemory({
        ...buildXiMemoryDoc({
          text,
          event: { id: evCard.id, cap: evCard.cap },
          twist: { id: twCard.id, cap: twCard.cap },
          mode: 'board',
        }),
        title: timesSentence(evCard, twCard),
        boardDay: viewDay,
      });
      // Keep the composer open on the same pairing so you can add another memory
      // if you want — just clear the text. Cancel (or tapping away) dismisses it.
      setStoryText('');
      setJustSaved(true);
    } catch (e) { alert(e.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const goDay = (delta) => { setStoryCells([]); setStoryText(''); setViewDay((d) => Math.min(today, d + delta)); };

  return (
    <div className="xiv">
      <div className="xiv-top">
        <button className="xiv-logo-btn" onClick={() => navigate('/xi')}>XI · Board of the Day</button>
        <div className="xiv-top-right">
          <XiInfo title="How to play Board of the Day">{BOARD_HELP}</XiInfo>
          <div className="xiv-daynav">
            <button onClick={() => goDay(-1)} aria-label="Previous day">‹</button>
            <span className="xiv-dayname">{dayLabel(viewDay, today)}</span>
            <button disabled={viewDay >= today} onClick={() => goDay(1)} aria-label="Next day">›</button>
          </div>
        </div>
      </div>

      {viewDay !== today && (
        <div className="xiv-pastnote">{dayLabel(viewDay, today)}'s board — tap ‹ › to travel, or jump back to Today.</div>
      )}

      <XiBoardGrid placed={placed} tokensByCard={tokensByCard} selectedCells={storyCells} onCellClick={tapCell} />

      {storyReady ? (
        <KeyboardSheet>
          <div className="xiv-composer">
            <div className="xiv-pairlabel">{label}</div>
            {existing.length > 0 && (
              <div className="xiv-pairstories">
                {existing.map((m) => (
                  <div key={m.id || m.timestamp} className="xiv-pairstory"><i style={{ background: TOKEN }} /> {m.content}</div>
                ))}
              </div>
            )}
            <textarea className="xiv-ta" placeholder="A memory that's both of these…" value={storyText} maxLength={500}
              onChange={(e) => { setStoryText(e.target.value); if (justSaved) setJustSaved(false); }} />
            <div className="xiv-composer-row">
              {justSaved && <span className="xiv-saved">Saved ✓</span>}
              <button className="xiv-ghost" onClick={() => { setStoryCells([]); setStoryText(''); setJustSaved(false); }}>
                {justSaved ? 'Done' : 'Cancel'}
              </button>
              <button className="xiv-btn-sm" disabled={saving || !storyText.trim()} onClick={save}>
                {justSaved ? 'Add another' : 'Save memory'}
              </button>
            </div>
          </div>
        </KeyboardSheet>
      ) : (
        <div className="xiv-hint">
          {storyCells.length === 1
            ? 'Now tap a touching card of the other colour to make a pair.'
            : 'Tap two touching cards to write a memory that\'s both of them.'}
        </div>
      )}
      <XiNavBar />
    </div>
  );
}
