import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Same Firebase project as the games (membry-df528); this site is its own
// hosting site inside it, and its collections are namespaced simt*.
// authDomain must stay membry-df528.firebaseapp.com: that's the redirect URI
// registered on the project's Google OAuth client (shouldimakethis.web.app is
// in Auth's authorized domains, but the OAuth client only accepts the
// firebaseapp.com helper — same setup incaseofamnesia.com uses). To move the
// popup first-party later, add https://shouldimakethis.web.app/__/auth/handler
// to the OAuth client's redirect URIs in Google Cloud console, then flip this.
const firebaseConfig = {
  apiKey: "AIzaSyCA04ReaTAoNDUgUCuBS-ti0Jkfl-16h_s",
  authDomain: "membry-df528.firebaseapp.com",
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
