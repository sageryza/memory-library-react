import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import useAuth from '../../hooks/useAuth';
import './XiStories.css';

// "stories i tell" — the mandatory public library every account has: stories
// told in Versus (public by default) and memories their owners shared. Your
// own entries can be made private here (they leave the public library; your
// archive copy stays private). Others' entries can be reported.
export default function XiStories() {
  const { user } = useAuth();
  const [stories, setStories] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    getDocs(query(collection(db, 'publicMemories'), orderBy('ts', 'desc'), limit(100)))
      .then((snap) => setStories(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.content)))
      .catch(() => setStories([]));
  }, []);

  const makePrivate = async (s) => {
    // Public docs are keyed "<uid>_<memoryId>" by the publish function —
    // unpublishing goes back through it so the archive copy flips too.
    if (!user || !s.id.startsWith(`${user.uid}_`)) return;
    setBusyId(s.id);
    try {
      await httpsCallable(functions, 'publishMemory')({
        memoryId: s.id.slice(user.uid.length + 1), visibility: 'private',
      });
      setStories((cur) => cur.filter((x) => x.id !== s.id));
    } catch (e) { /* leave it visible */ }
    setBusyId(null);
  };

  const report = async (s) => {
    const reason = window.prompt('What is wrong with this story?');
    if (!reason || !user) return;
    try {
      await addDoc(collection(db, 'xiReports'), {
        reporterUid: user.uid, subject: 'publicMemory', subjectId: s.id,
        reason: reason.slice(0, 500), ts: Date.now(),
      });
      window.alert('Thank you — we will review it.');
    } catch (e) { window.alert('Could not send the report.'); }
  };

  return (
    <div className="xis">
      <h1 className="xis-title">stories i tell</h1>
      <p className="xis-sub">
        Stories people tell — from Versus games and memories shared to the world.
        Your own can be made private anytime.
      </p>
      {stories === null && <p className="xis-sub">loading…</p>}
      {stories !== null && stories.length === 0 && <p className="xis-sub">No public stories yet.</p>}
      {(stories || []).map((s) => {
        const mine = user && s.byUid === user.uid;
        return (
          <div key={s.id} className="xis-card">
            <div className="xis-head">
              <span className="xis-by">{mine ? 'you' : (s.byName || 'anonymous')}</span>
              {mine ? (
                <button className="xis-act" disabled={busyId !== null} onClick={() => makePrivate(s)}>
                  {busyId === s.id ? '…' : 'make private'}
                </button>
              ) : (
                <button className="xis-act" onClick={() => report(s)} aria-label="Report">report</button>
              )}
            </div>
            <div className="xis-text">{s.content}</div>
          </div>
        );
      })}
    </div>
  );
}
