import React, { useState } from 'react';
import { pairingSentence, memoriesForPairing } from '../../xi/xiMemory';

// Shared writing surface for a locked pairing (event × twist).
// Renders the pairing sentence, existing memories for the pairing, a textarea
// to add a new memory, and an optional "I got nothing" miss action.
export default function XiWritingPanel({
  event,
  twist,
  memories,
  onSave,
  onNothing,
  busy,
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const existing = memoriesForPairing(memories, event, twist);
  const sentence = pairingSentence(event, twist);

  const handleSave = async () => {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await onSave(value);
      setText('');
    } catch (e) {
      console.error('[XI] Failed to save memory:', e);
      alert('Could not save your memory. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="xi-writing-panel">
      <p className="xi-pairing-sentence">{sentence}.</p>

      <textarea
        className="xi-memory-input"
        placeholder="a memory that's both…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
        }}
      />

      <div className="xi-writing-actions">
        {onNothing && (
          <button
            type="button"
            className="xi-btn xi-btn-ghost"
            onClick={onNothing}
            disabled={busy || saving}
          >
            I got nothing
          </button>
        )}
        <button
          type="button"
          className="xi-btn xi-btn-primary"
          onClick={handleSave}
          disabled={!text.trim() || saving || busy}
        >
          {saving ? 'Saving…' : 'Save memory'}
        </button>
      </div>

      {existing.length > 0 && (
        <div className="xi-existing-memories">
          <h4 className="xi-existing-title">
            {existing.length} {existing.length === 1 ? 'memory' : 'memories'} here
          </h4>
          <ul className="xi-memory-list">
            {existing.map((m) => (
              <li key={m.id} className="xi-memory-list-item">
                {m.content}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
