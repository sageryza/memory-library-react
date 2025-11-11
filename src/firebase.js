import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

export default app;