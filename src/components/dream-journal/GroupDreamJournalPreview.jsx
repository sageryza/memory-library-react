// GroupDreamJournalPreview — a no-auth, no-Firebase visual preview of the group
// dream journal, rendered with mock data. Purpose: see the design without
// signing in or deploying rules (open /dream-journal-preview on any device).
//
// It reuses the real DreamCard and the shared .gdj-* styles, so the cards here
// look exactly like the live feed. The compose form and tabs are static (this
// is a visual harness, not a functional one).

import { useState } from 'react';
import { DREAM_EMOTIONS } from '../../utils/dreamSchema';
import DreamCard from './DreamCard';
import './GroupDreamJournal.css';

const MOCK_GROUPS = [
  { id: 'g1', name: 'Lucid Circle', memberIds: ['a', 'b', 'c', 'd'] },
  { id: 'g2', name: 'Family Dreams', memberIds: ['a', 'b'] },
  { id: 'g3', name: 'Night Shift', memberIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
];

const MOCK_DREAMS = [
  {
    id: 'd1',
    authorName: 'Maya',
    title: 'The flooded library',
    content:
      'I was wading through the old archive and the shelves had turned to water. Every book I touched dissolved into a school of silver fish that swam off between the stacks.',
    dream: { lucid: true, symbols: ['water', 'books', 'fish'], emotions: ['wonder', 'peace'] },
  },
  {
    id: 'd2',
    authorName: 'Theo',
    title: '',
    content:
      'Flying again, low over the rooftops of a city I half-recognized. Someone called my name from below but every time I looked down I drifted higher.',
    dream: { lucid: false, symbols: ['flying', 'city'], emotions: ['fear', 'nostalgia'] },
  },
  {
    id: 'd3',
    authorName: 'Priya',
    title: 'Grandmother’s kitchen',
    content:
      'The whole family was there, but the room kept getting longer. We passed plates down a table that never ended and nobody seemed to mind.',
    dream: { lucid: false, symbols: ['family', 'home', 'food'], emotions: ['love', 'grief'] },
  },
];

const GroupDreamJournalPreview = () => {
  const [activeGroupId, setActiveGroupId] = useState('g1');

  return (
    <div className="gdj-root">
      <header className="gdj-header">
        <h1 className="gdj-title">Group Dream Journal</h1>
        <p className="gdj-muted">Preview with mock data — no sign-in required.</p>
      </header>

      <section className="gdj-groups">
        <div className="gdj-group-tabs">
          {MOCK_GROUPS.map((g) => (
            <button
              key={g.id}
              className={`gdj-group-tab${g.id === activeGroupId ? ' is-active' : ''}`}
              onClick={() => setActiveGroupId(g.id)}
            >
              {g.name}
              <span className="gdj-group-count">{g.memberIds.length}</span>
            </button>
          ))}
        </div>
        <form className="gdj-create" onSubmit={(e) => e.preventDefault()}>
          <input className="gdj-input" placeholder="New group name…" />
          <button className="gdj-btn" type="submit">
            Create group
          </button>
        </form>
      </section>

      <section className="gdj-compose">
        <form onSubmit={(e) => e.preventDefault()}>
          <input className="gdj-input" placeholder="Dream title (optional)" defaultValue="" />
          <textarea
            className="gdj-textarea"
            placeholder="Describe your dream…"
            rows={4}
            defaultValue=""
          />
          <input
            className="gdj-input"
            placeholder="Symbols, comma separated (e.g. water, flying)"
            defaultValue=""
          />
          <div className="gdj-emotions">
            {DREAM_EMOTIONS.map((emotion, i) => (
              <button
                type="button"
                key={emotion}
                className={`gdj-chip${i < 2 ? ' is-on' : ''}`}
              >
                {emotion}
              </button>
            ))}
          </div>
          <label className="gdj-lucid">
            <input type="checkbox" defaultChecked /> Lucid dream
          </label>
          <button className="gdj-btn gdj-btn-primary" type="submit">
            Post dream
          </button>
        </form>
      </section>

      <section className="gdj-feed">
        {MOCK_DREAMS.map((d) => (
          <DreamCard key={d.id} dream={d} />
        ))}
      </section>
    </div>
  );
};

export default GroupDreamJournalPreview;
