// GroupDreamJournal — shared dream-journal feed for a group.
//
// Designed for the just-woke-up moment: the hero is ONE big capture field with a
// mic for live voice-to-text. Everything optional (title, symbols, mood, lucid)
// hides behind "add details" so a bleary-eyed user can dump the dream and go.
//
// Data layer: useAuth, useGroups, useGroupDreams. Voice: useSpeechRecognition.

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { Mic, Square } from 'lucide-react';
import useAuth from '../../hooks/useAuth';
import { useGroups } from '../../hooks/useGroups';
import { useGroupDreams } from '../../hooks/useGroupDreams';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { DREAM_EMOTIONS } from '../../utils/dreamSchema';
import { functions } from '../../firebase';
import DreamCard from './DreamCard';
import './GroupDreamJournal.css';

// Callable that draws a dream via Replicate and writes the image URL back onto
// the entry. The live onSnapshot then delivers the illustration to the feed.
const illustrateDreamFn = httpsCallable(functions, 'illustrateDream');

const appendChunk = (prev, chunk) => {
  const clean = chunk.trim();
  if (!clean) return prev;
  if (!prev) return clean;
  return `${prev}${/\s$/.test(prev) ? '' : ' '}${clean}`;
};

const GroupDreamJournal = () => {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid || null;

  const { groups, loading: groupsLoading, error: groupsError, createGroup } = useGroups(
    userId,
    authLoading
  );
  const [activeGroupId, setActiveGroupId] = useState(null);

  // Default to the first group once groups load (or after creating one).
  useEffect(() => {
    if (!activeGroupId && groups.length > 0) {
      setActiveGroupId(groups[0].id);
    }
    if (activeGroupId && !groups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id || null);
    }
  }, [groups, activeGroupId]);

  const { dreams, loading: dreamsLoading, addDream } = useGroupDreams(
    activeGroupId,
    userId,
    authLoading
  );

  // --- capture (the hero) ---
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const textareaRef = useRef(null);

  const { supported, listening, interim, error: speechError, toggle, stop } =
    useSpeechRecognition({
      onFinal: (text) => setContent((prev) => appendChunk(prev, text)),
    });

  // Keep the newest dictated words in view as they stream in.
  useEffect(() => {
    const el = textareaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [content, interim]);

  // --- optional details ---
  const [showDetails, setShowDetails] = useState(false);
  const [title, setTitle] = useState('');
  const [symbolsText, setSymbolsText] = useState('');
  const [emotions, setEmotions] = useState([]);
  const [lucid, setLucid] = useState(false);

  const toggleEmotion = (emotion) =>
    setEmotions((prev) =>
      prev.includes(emotion) ? prev.filter((e) => e !== emotion) : [...prev, emotion]
    );

  // --- illustration (draw a dream on demand) ---
  const [illustratingIds, setIllustratingIds] = useState(() => new Set());

  const handleIllustrate = async (dream) => {
    if (!activeGroupId || illustratingIds.has(dream.id)) return;
    setIllustratingIds((prev) => new Set(prev).add(dream.id));
    try {
      await illustrateDreamFn({ groupId: activeGroupId, entryId: dream.id });
      // The new illustration arrives via the live feed subscription.
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not illustrate this dream');
    } finally {
      setIllustratingIds((prev) => {
        const next = new Set(prev);
        next.delete(dream.id);
        return next;
      });
    }
  };

  // --- new group (kept out of the way) ---
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const id = await createGroup(name);
      setNewGroupName('');
      setShowNewGroup(false);
      setActiveGroupId(id);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not create group');
    }
  };

  const handleSave = async () => {
    if (!content.trim() || groupsLoading) return;
    if (listening) stop();
    setPosting(true);
    try {
      // A solo user shouldn't have to create a group before writing — make a
      // personal "My dreams" group on the first save if they have none yet.
      let targetGroupId = activeGroupId || groups[0]?.id || null;
      if (!targetGroupId) {
        targetGroupId = await createGroup('My dreams');
        setActiveGroupId(targetGroupId);
      }
      await addDream(
        {
          title: title.trim(),
          content: content.trim(),
          authorName: user?.displayName || user?.email || 'Anonymous',
          dream: { symbols: symbolsText.split(','), emotions, lucid },
        },
        targetGroupId
      );
      setContent('');
      setTitle('');
      setSymbolsText('');
      setEmotions([]);
      setLucid(false);
      setShowDetails(false);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not save dream');
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
        <div className="gdj-signin">
          <p>Please sign in to use the dream journal.</p>
          <Link to="/login" className="gdj-signin-btn">sign in</Link>
        </div>
      </div>
    );
  }

  // Show committed text plus the live interim words while dictating.
  const fieldValue =
    listening && interim ? appendChunk(content, interim) : content;
  const activeGroup = groups.find((g) => g.id === activeGroupId);

  return (
    <div className="gdj-root">
      <header className="gdj-header gdj-header-compact">
        <h1 className="gdj-title gdj-title-compact">Dream Journal</h1>
      </header>

      {/* THE HERO: one field, a mic, a save button. */}
      <section className="gdj-capture">
        <h2 className="gdj-prompt">What did you dream?</h2>

        <div className="gdj-field-wrap">
          <textarea
            ref={textareaRef}
            className="gdj-capture-field"
            placeholder="Let it spill out…"
            value={fieldValue}
            onChange={(e) => {
              if (!listening) setContent(e.target.value);
            }}
            rows={5}
            autoFocus
          />
          {supported && (
            <button
              type="button"
              className={`gdj-mic${listening ? ' is-listening' : ''}`}
              onClick={toggle}
              aria-label={listening ? 'Stop recording' : 'Speak your dream'}
              title={listening ? 'Stop' : 'Speak your dream'}
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
        {speechError === 'not-allowed' && (
          <div className="gdj-mic-note">
            Microphone blocked — enable mic access to speak your dream.
          </div>
        )}

        <button
          type="button"
          className="gdj-btn gdj-btn-primary gdj-save"
          onClick={handleSave}
          disabled={posting || !content.trim() || groupsLoading}
        >
          {posting ? 'saving…' : 'save dream'}
        </button>

        {/* sharing context — small, defaults to first group */}
        <div className="gdj-sharing">
          {groupsLoading ? (
            <span className="gdj-muted">…</span>
          ) : groups.length === 0 ? (
            <span className="gdj-muted">create a group below to start sharing</span>
          ) : (
            <>
              <span className="gdj-sharing-label">sharing with</span>
              <span className="gdj-group-tabs gdj-group-tabs-inline">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    className={`gdj-group-tab${g.id === activeGroupId ? ' is-active' : ''}`}
                    onClick={() => setActiveGroupId(g.id)}
                  >
                    {g.name}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>

        {groupsError && (
          <div className="gdj-mic-note">Couldn’t load your groups: {groupsError}</div>
        )}

        {/* optional details, collapsed by default */}
        <button
          type="button"
          className="gdj-details-toggle"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? '– hide details' : '+ add details'}
        </button>

        {showDetails && (
          <div className="gdj-details">
            <input
              className="gdj-input"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
          </div>
        )}
      </section>

      {/* new group — tucked under a small link */}
      <div className="gdj-newgroup">
        {showNewGroup ? (
          <form className="gdj-create" onSubmit={handleCreateGroup}>
            <input
              className="gdj-input"
              placeholder="New group name…"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              autoFocus
            />
            <button className="gdj-btn" type="submit" disabled={!newGroupName.trim()}>
              create
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="gdj-details-toggle"
            onClick={() => setShowNewGroup(true)}
          >
            + new group
          </button>
        )}
      </div>

      {/* Feed: what others dreamed */}
      {activeGroupId && (
        <section className="gdj-feed">
          <h2 className="gdj-feed-heading">
            {activeGroup ? `dreams in ${activeGroup.name}` : 'dreams'}
          </h2>
          {dreamsLoading ? (
            <div className="gdj-muted">loading…</div>
          ) : dreams.length === 0 ? (
            <div className="gdj-muted">No dreams yet. Be the first to share one.</div>
          ) : (
            dreams.map((d) => (
              <DreamCard
                key={d.id}
                dream={d}
                onIllustrate={() => handleIllustrate(d)}
                illustrating={illustratingIds.has(d.id)}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
};

export default GroupDreamJournal;
