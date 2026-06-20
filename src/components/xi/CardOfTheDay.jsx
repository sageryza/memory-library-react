import React, { useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { dailyDeck, getCardById } from '../../xi/decks';
import { pickRandom, todayStamp } from '../../xi/deckHelpers';
import { pairKey } from '../../xi/xiMemory';
import XiCard from './XiCard';
import XiWritingPanel from './XiWritingPanel';

// Card of the Day — one Event × one Twist; the user writes a memory that's both.
export default function CardOfTheDay({ memories, settings, onSaveMemory, onUpdateSettings, onMiss }) {
  const excluded = useMemo(() => settings.excludedCards || [], [settings.excludedCards]);

  const newPair = useCallback(() => {
    const event = pickRandom(dailyDeck.events, excluded);
    const twist = pickRandom(dailyDeck.twists, excluded);
    if (!event || !twist) return null;
    return { eventId: event.id, twistId: twist.id, date: todayStamp() };
  }, [excluded]);

  // Ensure there is a current daily pair; refresh it once per day.
  useEffect(() => {
    const current = settings.dailyPair;
    const stale = !current || current.date !== todayStamp();
    if (stale) {
      const pair = newPair();
      if (pair) {
        onUpdateSettings.setDailyPair(pair);
        onUpdateSettings.pushPastPair(pair);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dailyPair?.eventId, settings.dailyPair?.twistId, settings.dailyPair?.date]);

  const pair = settings.dailyPair;
  const event = pair ? getCardById(pair.eventId) : null;
  const twist = pair ? getCardById(pair.twistId) : null;

  const handleShuffle = () => {
    const next = newPair();
    if (next) {
      onUpdateSettings.setDailyPair(next);
      onUpdateSettings.pushPastPair(next);
    }
  };

  const handleNothing = () => {
    if (event && twist) onMiss(pairKey({ id: event.id }, { id: twist.id }));
    handleShuffle();
  };

  if (!event || !twist) {
    return (
      <div className="xi-screen xi-today">
        <p className="xi-empty">No cards available. Check your Curate settings.</p>
      </div>
    );
  }

  return (
    <div className="xi-screen xi-today">
      <div className="xi-screen-head">
        <h2 className="xi-screen-title">Card of the Day</h2>
        <button type="button" className="xi-icon-btn" onClick={handleShuffle} title="New pair">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="xi-pair-row">
        <XiCard card={event} size="lg" />
        <span className="xi-pair-x">×</span>
        <XiCard card={twist} size="lg" />
      </div>

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
        onNothing={handleNothing}
      />
    </div>
  );
}
