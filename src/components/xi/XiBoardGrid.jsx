import { useRef, useState, useLayoutEffect } from 'react';
import { boardDeck } from '../../xi/decks';
import { gridFromPlaced, BR, BC, cellKind } from '../../xi/versusModel';
import './XiVersus.css';

const artOf = (d, i) => ((d === 'be' ? boardDeck.events : boardDeck.twists)[i] || null);

// The shared XI board: a centered checkerboard grid that renders placed cards
// (full art on cream/white cells), an optional placer dot, accrued story tokens,
// and one merged rectangle around a chosen pairing. Used by both Versus and
// Board of the Day so there's a single board to maintain.
//
//   placed        flat [{ r, c, d, i, color? }]
//   tokensByCard  { cardId: [colour, …] }  (a token per story written on a card)
//   selectedCells [{ r, c }, { r, c }]      (draws the merged frame)
//   onCellClick   (r, c, cell|null) => void
export default function XiBoardGrid({ placed, tokensByCard = {}, selectedCells = [], onCellClick }) {
  const grid = gridFromPlaced(placed);
  const boardRef = useRef(null);
  const [frame, setFrame] = useState(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board || selectedCells.length !== 2) { setFrame(null); return; }
    const els = selectedCells.map((s) => board.querySelector(`[data-cell="${s.r}-${s.c}"]`));
    if (els.some((e) => !e)) { setFrame(null); return; }
    const left = Math.min(...els.map((e) => e.offsetLeft));
    const top = Math.min(...els.map((e) => e.offsetTop));
    const right = Math.max(...els.map((e) => e.offsetLeft + e.offsetWidth));
    const bottom = Math.max(...els.map((e) => e.offsetTop + e.offsetHeight));
    setFrame({ left, top, width: right - left, height: bottom - top });
  }, [selectedCells, placed]);

  return (
    <div className="xiv-board" ref={boardRef} style={{ gridTemplateColumns: `repeat(${BC}, 1fr)` }}>
      {Array.from({ length: BR * BC }).map((_, idx) => {
        const r = Math.floor(idx / BC);
        const c = idx % BC;
        const cell = grid[r][c];
        const kind = cellKind(r, c);
        if (!cell) {
          return (
            <div key={idx} data-cell={r + '-' + c} className={'xiv-cell empty ' + kind}
              onClick={onCellClick ? () => onCellClick(r, c, null) : undefined} />
          );
        }
        const art = artOf(cell.d, cell.i);
        const tokens = tokensByCard[art?.id] || [];
        return (
          <div key={idx} data-cell={r + '-' + c} className={'xiv-cell ' + kind}
            onClick={onCellClick ? () => onCellClick(r, c, cell) : undefined}>
            {art && <img src={art.img} alt={art.cap || ''} loading="lazy" />}
            {cell.color && <span className="xiv-dot" style={{ background: cell.color }} />}
            {tokens.length > 0 && (
              <span className="xiv-tokens">
                {tokens.slice(0, 8).map((col, i) => <i key={i} style={{ background: col }} />)}
              </span>
            )}
          </div>
        );
      })}
      {frame && (
        <div className="xiv-pairframe"
          style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }} />
      )}
    </div>
  );
}
