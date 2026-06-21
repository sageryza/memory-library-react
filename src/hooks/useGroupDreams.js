// useGroupDreams — real-time dream entries for a single group.
//
// This is the data layer the shared feed sits on: subscribe to a group's
// entries, post your own dream, edit/delete your own. The security rules
// (firestore.rules → /groups/{groupId}/entries) enforce membership and that a
// member can only create/edit entries authored by themselves.
//
// Storage:
//   /groups/{groupId}/entries/{entryId} → dream entries (shape: utils/dreamSchema.js)

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ensureStringId } from '../utils/generateId';
import { createDreamEntry } from '../utils/dreamSchema';

export const useGroupDreams = (groupId, userId, authLoading = false) => {
  const [dreams, setDreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    // Need both a signed-in user and a selected group to read entries.
    if (!userId || !groupId) {
      setDreams([]);
      setLoading(false);
      return;
    }

    const entriesRef = collection(db, 'groups', groupId, 'entries');
    const q = query(entriesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => {
          const { id: _ignored, ...rest } = d.data();
          return { id: ensureStringId(d.id), ...rest };
        });
        setDreams(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching group dreams:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId, userId, authLoading]);

  // Post a dream to the group. `entryInput` matches createDreamEntry's input
  // (title, content, tags, date, dream: { symbols, emotions, ... }). The author
  // is forced to the current user to satisfy the security rules.
  const addDream = useCallback(
    async (entryInput = {}) => {
      if (!userId || !groupId) {
        throw new Error('Must be signed in and in a group to post a dream');
      }
      try {
        const body = createDreamEntry({ ...entryInput, authorId: userId });
        const entriesRef = collection(db, 'groups', groupId, 'entries');
        const docRef = await addDoc(entriesRef, {
          ...body,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return docRef.id;
      } catch (err) {
        console.error('Error posting dream:', err);
        throw err;
      }
    },
    [userId, groupId]
  );

  // Edit one of your own dreams. `authorId` is intentionally not updatable
  // (the rules reject author reassignment).
  const updateDream = useCallback(
    async (entryId, updates) => {
      if (!userId || !groupId || !entryId) return;
      try {
        // Strip fields that must not change: the rules reject author reassignment,
        // and id/type/createdAt are immutable for an entry.
        const safeUpdates = { ...(updates || {}) };
        delete safeUpdates.id;
        delete safeUpdates.authorId;
        delete safeUpdates.type;
        delete safeUpdates.createdAt;
        const entryRef = doc(db, 'groups', groupId, 'entries', entryId);
        await updateDoc(entryRef, {
          ...safeUpdates,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Error updating dream:', err);
        throw err;
      }
    },
    [userId, groupId]
  );

  // Delete a dream. The rules allow this only for the author or the group owner.
  const deleteDream = useCallback(
    async (entryId) => {
      if (!userId || !groupId || !entryId) return;
      try {
        await deleteDoc(doc(db, 'groups', groupId, 'entries', entryId));
      } catch (err) {
        console.error('Error deleting dream:', err);
        throw err;
      }
    },
    [userId, groupId]
  );

  return {
    dreams,
    loading,
    error,
    addDream,
    updateDream,
    deleteDream,
  };
};

export default useGroupDreams;
