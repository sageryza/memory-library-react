import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { ensureStringId } from '../utils/generateId';

export const useConstellations = (userId) => {
  const [constellations, setConstellations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setConstellations([]);
      setLoading(false);
      return;
    }

    const constellationsRef = collection(db, 'users', userId, 'constellations');
    const q = query(constellationsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const constellationsList = snapshot.docs.map(doc => {
          const data = doc.data();
          // Ensure IDs in connections are strings
          const connections = (data.connections || []).map(conn => ({
            ...conn,
            from: ensureStringId(conn.from),
            to: ensureStringId(conn.to)
          }));

          // Ensure memory IDs are strings
          const memories = (data.memories || []).map(mem => ({
            ...mem,
            id: ensureStringId(mem.id)
          }));

          // Ensure pin IDs are strings
          const pins = (data.pins || []).map(pin => ({
            ...pin,
            id: ensureStringId(pin.id)
          }));

          return {
            id: ensureStringId(doc.id),
            ...data,
            connections,
            memories,
            pins
          };
        });
        setConstellations(constellationsList);
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error fetching constellations:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Save a constellation
  const saveConstellation = async (name, constellationData) => {
    if (!userId) return;

    try {
      // Use auto-generated ID instead of name as document ID
      const constellationsRef = collection(db, 'users', userId, 'constellations');
      const constellationRef = doc(constellationsRef);
      await setDoc(constellationRef, {
        name: name?.trim() || '', // Name is optional, default to empty string
        memories: constellationData.memories || [],
        connections: constellationData.connections || [],
        pins: constellationData.pins || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error saving constellation:', error);
      throw error;
    }
  };

  // Load a constellation
  const loadConstellation = (constellationId) => {
    const normalizedId = ensureStringId(constellationId);
    const constellation = constellations.find(c => c.id === normalizedId);
    if (constellation) {
      return {
        memories: constellation.memories || [],
        connections: constellation.connections || [],
        pins: constellation.pins || []
      };
    }
    return null;
  };

  // Delete a constellation
  const deleteConstellation = async (constellationId) => {
    if (!userId || !constellationId) return;

    try {
      const normalizedId = ensureStringId(constellationId);
      const constellationRef = doc(db, 'users', userId, 'constellations', normalizedId);
      await deleteDoc(constellationRef);
    } catch (error) {
      console.error('Error deleting constellation:', error);
      throw error;
    }
  };

  return {
    constellations,
    loading,
    error,
    saveConstellation,
    loadConstellation,
    deleteConstellation
  };
};

export default useConstellations;
