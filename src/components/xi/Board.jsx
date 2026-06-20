import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { boardDeck, getCardById } from '../../xi/decks';
import { shuffle, playable } from '../../xi/deckHelpers';
import XiCard from './XiCard';
import XiWritingPanel from './XiWritingPanel';

const ROWS = 8;
const COLS = 5; // 40 cells: checkerboard => 20 event tiles + 20 twist tiles

// A cell holds an event when (row + col) is even, a twist otherwise — so every
// orthogonal adjacency is an event × twist crossing.
const isEventCell = (index) => {
  const r = Math.floor(index / COLS);
  const c = index % COLS;
  return (r + c) % 2 === 0;
};

const areAdjacent = (a, b) => {
  const ra = Math.floor(a / COLS);
  const ca = a % COLS;
  const rb = Math.floor(b / COLS);
  const cb = b % COLS;
  return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
};

// Build { eventIds, twistIds } for a fresh board, respecting excluded cards.
function generateLayout(excluded) {
  const events = shuffle(playable(boardDeck.events, excluded)).slice(0, 20);
  const twists = shuffle(playable(boardDeck.twists, excluded)).slice(0, 20);
  return { eventIds: events.map((c) => c.id), twistIds: twists.map((c) => c.id) };
}

export default function Board({ memories, settings, onSaveMemory, onUpdateSettings }) {
  const excluded = settings.excludedCards || [];
  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(null); // { a, b }

  // Ensure a board layout exists.
  useEffect(() => {
    if (!settings.boardLayout || !settings.boardLayout.eventIds) {
      onUpdateSettings.setBoardLayout(generateLayout(excluded));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.boardLayout]);

  // Map each grid cell to a resolved card.
  const cells = useMemo(() => {
    const layout = settings.boardLayout;
    if (!layout || !layout.eventIds) return [];
    let ei = 0;
    let ti = 0;
    const out = [];
    for (let i = 0; i < ROWS * COLS; i++) {
      const id = isEventCell(i) ? layout.eventIds[ei++] : layout.twistIds[ti++];
      out.push(getCardById(id) || null);
    }
    return out;
  }, [settings.boardLayout]);

  const handleNewBoard = () => {
    setSelected(null);
    setLocked(null);
    onUpdateSettings.setBoardLayout(generateLayout(excluded));
  };

  const handleTap = useCallback(
    (index) => {
      // Tapping while a pair is locked starts a new selection.
      if (locked) {
        setLocked(null);
        setSelected(index);
        return;
      }
      if (selected === null) {
        setSelected(index);
        return;
      }
      if (selected === index) {
        setSelected(null);
        return;
      }
      if (areAdjacent(selected, index)) {
        setLocked({ a: selected, b: index });
        setSelected(null);
      } else {
        // Non-adjacent: reselect.
        setSelected(index);
      }
    },
    [locked, selected]
  );

  // Resolve the locked pair into event / twist refs.
  const lockedPair = useMemo(() => {
    if (!locked) return null;
    const cardA = cells[locked.a];
    const cardB = cells[locked.b];
    if (!cardA || !cardB) return null;
    const event = isEventCell(locked.a) ? cardA : cardB;
    const twist = isEventCell(locked.a) ? cardB : cardA;
    return { event, twist };
  }, [locked, cells]);

  const inLockedPair = (index) => locked && (locked.a === index || locked.b === index);

  return (
    <div className="xi-screen xi-board">
      <div className="xi-screen-head">
        <h2 className="xi-screen-title">Board</h2>
        <button type="button" className="xi-icon-btn" onClick={handleNewBoard} title="New board">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="xi-board-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {cells.map((card, i) => (
          <XiCard
            key={i}
            card={card}
            size="sm"
            selected={selected === i}
            locked={inLockedPair(i)}
            dimmed={!!locked && !inLockedPair(i)}
            onClick={() => handleTap(i)}
          />
        ))}
      </div>

      {lockedPair && (
        <XiWritingPanel
          event={{ id: lockedPair.event.id, cap: lockedPair.event.cap }}
          twist={{ id: lockedPair.twist.id, cap: lockedPair.twist.cap }}
          memories={memories}
          onSave={(text) =>
            onSaveMemory({
              text,
              event: { id: lockedPair.event.id, cap: lockedPair.event.cap },
              twist: { id: lockedPair.twist.id, cap: lockedPair.twist.cap },
              mode: 'board',
            })
          }
        />
      )}
      {!lockedPair && (
        <p className="xi-board-hint">
          Tap a card, then tap an adjacent card to lock the pair and write a memory.
        </p>
      )}
    </div>
  );
}
