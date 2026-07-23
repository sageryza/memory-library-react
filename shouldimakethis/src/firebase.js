import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Same Firebase project as the games (membry-df528); this site is its own
// hosting site inside it, and its collections are namespaced simt*.
// authDomain is this site's own domain so the Google sign-in popup stays
// first-party (Safari blocks third-party auth storage).
const firebaseConfig = {
  apiKey: "AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s",
  authDomain: "shouldimakethis.web.app",
  projectId: "membry-df528",
  storageBucket: "membry-df528.firebasestorage.app",
  messagingSenderId: "513384339473",
  appId: "1:513384339473:web:8f46c5915a949c93a8b9b0",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
