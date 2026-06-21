// GroupDreamJournal — shared dream-journal feed for a group.
//
// Self-contained scaffold built on the data layer:
//   useAuth        → current user
//   useGroups      → groups the user belongs to (+ create)
//   useGroupDreams → the selected group's real-time dream feed (+ post)
//
// NOT yet wired into routing (kept out of App.jsx to avoid colliding with other
// in-flight work). To enable, add a route in src/App.jsx, e.g.:
//     import GroupDreamJournal from './components/dream-journal/GroupDreamJournal';
//     <Route path="/dream-journal" element={<GroupDreamJournal />} />
//
// Styling is intentionally minimal and scoped under `.gdj-*` so it does not touch
// global styles. Restyle to match the app's design system when wiring it in.

import { useState, useEffect } from 'react';
import useAuth from '../../hooks/useAuth';
import { useGroups } from '../../hooks/useGroups';
import { useGroupDreams } from '../../hooks/useGroupDreams';
import { DREAM_EMOTIONS } from '../../utils/dreamSchema';
import DreamCard from './DreamCard';
import './GroupDreamJournal.css';

const GroupDreamJournal = () => {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid || null;

  const { groups, loading: groupsLoading, createGroup } = useGroups(userId, authLoading);

  const [activeGroupId, setActiveGroupId] = useState(null);

  // Default to the first group once groups load (or after creating one).
  useEffect(() => {
    if (!activeGroupId && groups.length > 0) {
      setActiveGroupId(groups[0].id);
    }
    // If the active group disappears (deleted/left), fall back to the first.
    if (activeGroupId && !groups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id || null);
    }
  }, [groups, activeGroupId]);

  const {
    dreams,
    loading: dreamsLoading,
    addDream,
  } = useGroupDreams(activeGroupId, userId, authLoading);

  // --- new group form ---
  const [newGroupName, setNewGroupName] = useState('');
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const id = await createGroup(name);
      setNewGroupName('');
      setActiveGroupId(id);
    } catch (err) {
      // Surface minimally; a real UI would show a toast.
      console.error(err);
      alert(err.message || 'Could not create group');
    }
  };

  // --- post dream form ---
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [symbolsText, setSymbolsText] = useState('');
  const [emotions, setEmotions] = useState([]);
  const [lucid, setLucid] = useState(false);
  const [posting, setPosting] = useState(false);

  const toggleEmotion = (emotion) => {
    setEmotions((prev) =>
      prev.includes(emotion) ? prev.filter((e) => e !== emotion) : [...prev, emotion]
    );
  };

  const handlePostDream = async (e) => {
    e.preventDefault();
    if (!content.trim() || !activeGroupId) return;
    setPosting(true);
    try {
      await addDream({
        title: title.trim(),
        content: content.trim(),
        authorName: user?.displayName || user?.email || 'Anonymous',
        // symbols entered as a comma-separated list; the schema normalizes them.
        dream: {
          symbols: symbolsText.split(','),
          emotions,
          lucid,
        },
      });
      setTitle('');
      setContent('');
      setSymbolsText('');
      setEmotions([]);
      setLucid(false);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not post dream');
    } finally {
      setPosting(false);
    }
  };

  if (authLoading) {
    return <div className="gdj-root gdj-state">Loading…</div>;
  }

  if (!userId) {
    return (
      <div className="gdj-root gdj-state">
        Please sign in to use the group dream journal.
      </div>
    );
  }

  return (
    <div className="gdj-root">
      <header className="gdj-header">
        <h1 className="gdj-title">Group Dream Journal</h1>
      </header>

      {/* Group selector + create */}
      <section className="gdj-groups">
        {groupsLoading ? (
          <span className="gdj-muted">Loading groups…</span>
        ) : (
          <div className="gdj-group-tabs">
            {groups.map((g) => (
              <button
                key={g.id}
                className={`gdj-group-tab${g.id === activeGroupId ? ' is-active' : ''}`}
                onClick={() => setActiveGroupId(g.id)}
              >
                {g.name}
                <span className="gdj-group-count">{g.memberIds?.length || 1}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <span className="gdj-muted">No groups yet — create one to start.</span>
            )}
          </div>
        )}

        <form className="gdj-create" onSubmit={handleCreateGroup}>
          <input
            className="gdj-input"
            placeholder="New group name…"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <button className="gdj-btn" type="submit" disabled={!newGroupName.trim()}>
            Create group
          </button>
        </form>
      </section>

      {activeGroupId && (
        <>
          {/* Post a dream */}
          <section className="gdj-compose">
            <form onSubmit={handlePostDream}>
              <input
                className="gdj-input"
                placeholder="Dream title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                className="gdj-textarea"
                placeholder="Describe your dream…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
              />
              <input
                className="gdj-input"
                placeholder="Symbols, comma separated (e.g. water, flying)"
                value={symbolsText}
                onChange={(e) => setSymbolsText(e.target.value)}
              />
              <div className="gdj-emotions">
                {DREAM_EMOTIONS.map((emotion) => (
                  <button
                    type="button"
                    key={emotion}
                    className={`gdj-chip${emotions.includes(emotion) ? ' is-on' : ''}`}
                    onClick={() => toggleEmotion(emotion)}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
              <label className="gdj-lucid">
                <input
                  type="checkbox"
                  checked={lucid}
                  onChange={(e) => setLucid(e.target.checked)}
                />
                Lucid dream
              </label>
              <button
                className="gdj-btn gdj-btn-primary"
                type="submit"
                disabled={posting || !content.trim()}
              >
                {posting ? 'Posting…' : 'Post dream'}
              </button>
            </form>
          </section>

          {/* Feed */}
          <section className="gdj-feed">
            {dreamsLoading ? (
              <div className="gdj-muted">Loading dreams…</div>
            ) : dreams.length === 0 ? (
              <div className="gdj-muted">No dreams yet. Be the first to share one.</div>
            ) : (
              dreams.map((d) => <DreamCard key={d.id} dream={d} />)
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default GroupDreamJournal;
