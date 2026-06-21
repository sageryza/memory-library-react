// GroupDreamJournalPreview — no-auth, no-Firebase preview of the dream journal.
// Open /dream-journal-preview on any device to see the design AND test the
// just-woke-up capture flow, including live voice-to-text (the mic is wired to
// the real useSpeechRecognition hook here, it just doesn't save anywhere).

import { useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import DreamCard from './DreamCard';
import './GroupDreamJournal.css';

const appendChunk = (prev, chunk) => {
  const clean = chunk.trim();
  if (!clean) return prev;
  if (!prev) return clean;
  return `${prev}${/\s$/.test(prev) ? '' : ' '}${clean}`;
};

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
];

const GroupDreamJournalPreview = () => {
  const [content, setContent] = useState('');
  const { supported, listening, interim, toggle } = useSpeechRecognition({
    onFinal: (text) => setContent((prev) => appendChunk(prev, text)),
  });

  const fieldValue = listening && interim ? appendChunk(content, interim) : content;

  return (
    <div className="gdj-root">
      <header className="gdj-header gdj-header-compact">
        <h1 className="gdj-title gdj-title-compact">Dream Journal</h1>
        <p className="gdj-muted">preview — try the mic; nothing is saved</p>
      </header>

      <section className="gdj-capture">
        <h2 className="gdj-prompt">What did you dream?</h2>

        <div className="gdj-field-wrap">
          <textarea
            className="gdj-capture-field"
            placeholder="Let it spill out…"
            value={fieldValue}
            onChange={(e) => {
              if (!listening) setContent(e.target.value);
            }}
            rows={5}
          />
          {supported && (
            <button
              type="button"
              className={`gdj-mic${listening ? ' is-listening' : ''}`}
              onClick={toggle}
              aria-label={listening ? 'Stop recording' : 'Speak your dream'}
            >
              {listening ? <Square size={20} /> : <Mic size={22} />}
            </button>
          )}
        </div>

        {listening && <div className="gdj-listening">listening…</div>}
        {!supported && (
          <div className="gdj-mic-note">
            Voice typing isn’t available in this browser — tap the field and use your
            keyboard’s mic key.
          </div>
        )}

        <button type="button" className="gdj-btn gdj-btn-primary gdj-save">
          save dream
        </button>

        <div className="gdj-sharing">
          <span className="gdj-sharing-label">sharing with</span>
          <span className="gdj-group-tabs gdj-group-tabs-inline">
            <button className="gdj-group-tab is-active">Lucid Circle</button>
            <button className="gdj-group-tab">Family Dreams</button>
          </span>
        </div>

        <button type="button" className="gdj-details-toggle">+ add details</button>
      </section>

      <section className="gdj-feed">
        <h2 className="gdj-feed-heading">dreams in Lucid Circle</h2>
        {MOCK_DREAMS.map((d) => (
          <DreamCard key={d.id} dream={d} />
        ))}
      </section>
    </div>
  );
};

export default GroupDreamJournalPreview;
