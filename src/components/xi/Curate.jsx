import React, { useMemo } from 'react';
import { Heart, X } from 'lucide-react';
import { dailyDeck, boardDeck } from '../../xi/decks';

// Curate — view the whole deck; heart to include or ✕ to exclude cards from play.
// Excluded card ids are stored per-user and respected by Today and Board.
export default function Curate({ settings, onToggleExcluded }) {
  const excluded = new Set(settings.excludedCards || []);

  // Unique cards across both decks, split into events and twists.
  const { events, twists } = useMemo(() => {
    const evMap = new Map();
    const twMap = new Map();
    for (const deck of [dailyDeck, boardDeck]) {
      for (const c of deck.events) if (!evMap.has(c.id)) evMap.set(c.id, c);
      for (const c of deck.twists) if (!twMap.has(c.id)) twMap.set(c.id, c);
    }
    return { events: [...evMap.values()], twists: [...twMap.values()] };
  }, []);

  const renderCard = (card) => {
    const isExcluded = excluded.has(card.id);
    return (
      <div key={card.id} className={`xi-curate-card ${isExcluded ? 'is-excluded' : ''}`}>
        {card.img ? (
          <img className="xi-curate-art" src={card.img} alt="" draggable={false} />
        ) : (
          <div className="xi-curate-art xi-card-art-placeholder" />
        )}
        <span className="xi-curate-cap">{card.cap}</span>
        <button
          type="button"
          className="xi-curate-toggle"
          onClick={() => onToggleExcluded(card.id)}
          title={isExcluded ? 'Include in play' : 'Exclude from play'}
        >
          {isExcluded ? <X size={16} /> : <Heart size={16} />}
        </button>
      </div>
    );
  };

  return (
    <div className="xi-screen xi-curate">
      <h2 className="xi-screen-title">Curate</h2>
      <p className="xi-curate-sub">
        Heart to keep a card in play, ✕ to set it aside. Set-aside cards won't be
        drawn for Today or the Board.
      </p>

      <h3 className="xi-curate-section">Events</h3>
      <div className="xi-curate-grid">{events.map(renderCard)}</div>

      <h3 className="xi-curate-section">Twists</h3>
      <div className="xi-curate-grid">{twists.map(renderCard)}</div>
    </div>
  );
}
