// useGroups — data layer for Group Dream Journals.
//
// A group is a bounded set of members who share dream entries with each other.
// Unlike memories/boards, groups are inherently cloud + multi-user, so there is
// NO localStorage fallback: an unauthenticated user simply has no groups.
//
// Storage (see firestore.rules):
//   /groups/{groupId}                 → { name, ownerId, memberIds[], createdAt, updatedAt }
//   /groups/{groupId}/entries/{id}    → dream entries (see useGroupDreams.js)
//
// Membership query uses `array-contains` on memberIds, which is a native, indexed
// Firestore query — it scales with the number of groups a user is in, not the
// total user base.

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
  where,
  orderBy,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ensureStringId } from '../utils/generateId';

export const useGroups = (userId, authLoading = false) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Wait for auth to resolve before deciding there are no groups.
    if (authLoading) {
      return;
    }

    if (!userId) {
      // Groups require authentication — no localStorage fallback.
      setGroups([]);
      setLoading(false);
      return;
    }

    const groupsRef = collection(db, 'groups');
    // Only groups this user belongs to. Needs a composite index on
    // (memberIds array-contains, createdAt) — see firestore.indexes.json.
    const q = query(
      groupsRef,
      where('memberIds', 'array-contains', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => {
          const { id: _ignored, ...rest } = d.data();
          return { id: ensureStringId(d.id), ...rest };
        });
        setGroups(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching groups:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, authLoading]);

  // Create a new group. The creator is always the owner and a member — the
  // security rules require ownerId == auth.uid and uid ∈ memberIds at creation.
  const createGroup = useCallback(
    async (name, { description = '', initialMemberIds = [] } = {}) => {
      if (!userId) {
        throw new Error('Must be signed in to create a group');
      }
      const trimmed = (name || '').trim();
      if (!trimmed) {
        throw new Error('Group name is required');
      }

      // Always include the creator; de-duplicate.
      const memberIds = Array.from(
        new Set([ensureStringId(userId), ...initialMemberIds.map(ensureStringId)])
      );

      try {
        const groupsRef = collection(db, 'groups');
        const docRef = await addDoc(groupsRef, {
          name: trimmed,
          description,
          ownerId: ensureStringId(userId),
          memberIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return docRef.id;
      } catch (err) {
        console.error('Error creating group:', err);
        throw err;
      }
    },
    [userId]
  );

  // Update group metadata (owner only — enforced by rules).
  const updateGroup = useCallback(
    async (groupId, updates) => {
      if (!userId || !groupId) return;
      try {
        const groupRef = doc(db, 'groups', groupId);
        await updateDoc(groupRef, { ...updates, updatedAt: serverTimestamp() });
      } catch (err) {
        console.error('Error updating group:', err);
        throw err;
      }
    },
    [userId]
  );

  // Add a member (owner only in v1). When a self-service "join via invite"
  // flow is built, that will need either a constrained self-add rule or a
  // Cloud Function (see firestore.rules note).
  const addMember = useCallback(
    async (groupId, memberId) => {
      if (!userId || !groupId || !memberId) return;
      try {
        const groupRef = doc(db, 'groups', groupId);
        await updateDoc(groupRef, {
          memberIds: arrayUnion(ensureStringId(memberId)),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Error adding member:', err);
        throw err;
      }
    },
    [userId]
  );

  // Remove a member (owner only).
  const removeMember = useCallback(
    async (groupId, memberId) => {
      if (!userId || !groupId || !memberId) return;
      try {
        const groupRef = doc(db, 'groups', groupId);
        await updateDoc(groupRef, {
          memberIds: arrayRemove(ensureStringId(memberId)),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Error removing member:', err);
        throw err;
      }
    },
    [userId]
  );

  // Delete a group entirely (owner only). Note: Firestore does not cascade —
  // entries under /groups/{id}/entries must be cleaned up separately (a Cloud
  // Function or a client-side batch) if you need them gone.
  const deleteGroup = useCallback(
    async (groupId) => {
      if (!userId || !groupId) return;
      try {
        await deleteDoc(doc(db, 'groups', groupId));
      } catch (err) {
        console.error('Error deleting group:', err);
        throw err;
      }
    },
    [userId]
  );

  return {
    groups,
    loading,
    error,
    createGroup,
    updateGroup,
    addMember,
    removeMember,
    deleteGroup,
  };
};

export default useGroups;
