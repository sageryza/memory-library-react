import React, { useMemo, useState } from 'react';
import { getCardById } from '../../xi/decks';
import XiCard from './XiCard';
import XiWritingPanel from './XiWritingPanel';

// Past — recent daily pairs; the user can remix any two recent cards into a
// new pairing and write a memory on it.
export default function Past({ memories, settings, onSaveMemory }) {
  const pastPairs = useMemo(() => settings.pastPairs || [], [settings.pastPairs]);
  const [selEvent, setSelEvent] = useState(null); // card id
  const [selTwist, setSelTwist] = useState(null); // card id

  // Unique events and twists seen across recent pairs.
  const { events, twists } = useMemo(() => {
    const evMap = new Map();
    const twMap = new Map();
    for (const p of pastPairs) {
      const ev = getCardById(p.eventId);
      const tw = getCardById(p.twistId);
      if (ev && !evMap.has(ev.id)) evMap.set(ev.id, ev);
      if (tw && !twMap.has(tw.id)) twMap.set(tw.id, tw);
    }
    return { events: [...evMap.values()], twists: [...twMap.values()] };
  }, [pastPairs]);

  const event = selEvent ? getCardById(selEvent) : null;
  const twist = selTwist ? getCardById(selTwist) : null;

  if (pastPairs.length === 0) {
    return (
      <div className="xi-screen xi-past">
        <h2 className="xi-screen-title">Past</h2>
        <p className="xi-empty">No past pairs yet. Visit Today to draw your first.</p>
      </div>
    );
  }

  return (
    <div className="xi-screen xi-past">
      <h2 className="xi-screen-title">Past</h2>

      <div className="xi-recent-pairs">
        {pastPairs.map((p, i) => {
          const ev = getCardById(p.eventId);
          const tw = getCardById(p.twistId);
          if (!ev || !tw) return null;
          return (
            <button
              key={`${p.eventId}-${p.twistId}-${i}`}
              type="button"
              className="xi-recent-pair"
              onClick={() => {
                setSelEvent(ev.id);
                setSelTwist(tw.id);
              }}
            >
              <span className="xi-recent-cap">{ev.cap}</span>
              <span className="xi-recent-x">×</span>
              <span className="xi-recent-cap">{tw.cap}</span>
            </button>
          );
        })}
      </div>

      <h3 className="xi-remix-title">Remix</h3>
      <div className="xi-remix-columns">
        <div className="xi-remix-col">
          <span className="xi-remix-label">events</span>
          {events.map((c) => (
            <XiCard
              key={c.id}
              card={c}
              size="sm"
              selected={selEvent === c.id}
              onClick={() => setSelEvent(c.id)}
            />
          ))}
        </div>
        <div className="xi-remix-col">
          <span className="xi-remix-label">twists</span>
          {twists.map((c) => (
            <XiCard
              key={c.id}
              card={c}
              size="sm"
              selected={selTwist === c.id}
              onClick={() => setSelTwist(c.id)}
            />
          ))}
        </div>
      </div>

      {event && twist && (
        <XiWritingPanel
          event={{ id: event.id, cap: event.cap }}
          twist={{ id: twist.id, cap: twist.cap }}
          memories={memories}
          onSave={(text) =>
            onSaveMemory({
              text,
              event: { id: event.id, cap: event.cap },
              twist: { id: twist.id, cap: twist.cap },
              mode: 'daily',
            })
          }
        />
      )}
    </div>
  );
}
