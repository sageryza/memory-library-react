import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s",
  authDomain: "membry-df528.firebaseapp.com",
  projectId: "membry-df528",
  storageBucket: "membry-df528.firebasestorage.app",
  messagingSenderId: "513384339473",
  appId: "1:513384339473:web:8f46c5915a949c93a8b9b0",
  measurementId: "G-M75CDQ819E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Firestore and get a reference to the service
export const db = getFirestore(app);

// Callable Cloud Functions (us-central1, matching the deployed functions).
export const functions = getFunctions(app);

// Enable offline persistence with multi-tab support
// All tabs share the same IndexedDB cache and can queue writes when offline
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence unavailable');
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support IndexedDB
    console.warn('Firestore persistence unavailable: browser not supported');
  }
});

export default app;