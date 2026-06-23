import { useState } from 'react';
import { aiGenerateCards } from '../../utils/aiAssist';
import './XiGenerator.css';

// Card generator: distil the user's memories into candidate card phrases (via
// the AI function), let them keep the good ones, and add those to their deck.
export default function XiGenerator({ open, onClose, memories = [], onAdd }) {
  const [phase, setPhase] = useState('idle'); // idle | loading | review | saving | error
  const [error, setError] = useState('');
  const [cands, setCands] = useState([]); // { cap, keep }

  if (!open) return null;

  const sample = () => (memories || [])
    .map((m) => (m && m.content ? String(m.content) : ''))
    .map((s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 4)
    .slice(0, 80);

  const generate = async () => {
    const mems = sample();
    if (mems.length < 3) { setError('Add a few more memories first — the generator needs some to learn from.'); setPhase('error'); return; }
    setPhase('loading'); setError('');
    try {
      const cards = await aiGenerateCards(mems, 24);
      if (!cards.length) { setError('No cards came back. Try again in a moment.'); setPhase('error'); return; }
      setCands(cards.map((cap) => ({ cap, keep: true })));
      setPhase('review');
    } catch (e) {
      const msg = (e && e.message) || '';
      setError(/failed-precondition|not configured/i.test(msg)
        ? 'AI isn’t connected yet — add your key (config/anthropic) and try again.'
        : 'Couldn’t reach the generator. Try again.');
      setPhase('error');
    }
  };

  const toggle = (i) => setCands((cs) => cs.map((c, k) => (k === i ? { ...c, keep: !c.keep } : c)));

  const save = async () => {
    const kept = cands.filter((c) => c.keep).map((c) => c.cap);
    if (!kept.length) { onClose(); return; }
    setPhase('saving');
    try { await onAdd(kept); } catch { /* surfaced by hook */ }
    onClose();
  };

  const keptCount = cands.filter((c) => c.keep).length;

  return (
    <div className="xigen-backdrop" onClick={onClose}>
      <div className="xigen" onClick={(e) => e.stopPropagation()}>
        <div className="xigen-head">
          <div className="xigen-title">Generate cards from your memories</div>
          <button className="xigen-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {phase === 'idle' && (
          <div className="xigen-body">
            <p className="xigen-lead">
              I’ll read your memories and propose new prompt cards in your voice —
              broad enough to spark many memories, specific enough to feel like yours.
              You keep the ones you like.
            </p>
            <button className="xigen-go" onClick={generate}>✨ Generate</button>
          </div>
        )}

        {phase === 'loading' && (
          <div className="xigen-body xigen-center">
            <div className="xigen-spinner" />
            <p>Reading your memories…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="xigen-body xigen-center">
            <p className="xigen-err">{error}</p>
            <button className="xigen-go" onClick={generate}>Try again</button>
          </div>
        )}

        {phase === 'review' && (
          <div className="xigen-body">
            <p className="xigen-lead">Tap to drop the ones that don’t land. Keep the rest.</p>
            <div className="xigen-grid">
              {cands.map((c, i) => (
                <button
                  key={i}
                  className={`xigen-card ${c.keep ? 'keep' : 'drop'}`}
                  onClick={() => toggle(i)}
                >
                  <span>{c.cap}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="xigen-foot">
            <button className="xigen-ghost" onClick={onClose}>Cancel</button>
            <button className="xigen-go" disabled={phase === 'saving'} onClick={save}>
              {phase === 'saving' ? 'Adding…' : `Add ${keptCount} to my deck`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
