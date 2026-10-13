import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";

// Firebase project config (client-side, NOT secret — safe to ship publicly;
// security is enforced by firestore.rules). To run your own instance, copy
// .env.example to .env and set VITE_FIREBASE_*. The values below are the
// reference deployment's and are used only when no env var is provided.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyAca__YTy_Y6tlX62jJ6aK_qHhJgUD4V0w",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "fistball-arena.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "fistball-arena",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "fistball-arena.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "261226374717",
  appId: env.VITE_FIREBASE_APP_ID || "1:261226374717:web:d267cc2b02175e85bf2c54",
};

export const app = initializeApp(firebaseConfig);
// Offline-tolerant cache: reads keep working and writes queue through short wifi
// drops (venue tablets), syncing on reconnect. Falls back to memory cache if
// IndexedDB is unavailable (e.g. private browsing).
let _db;
try {
  _db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  console.warn("Persistent cache unavailable, using memory cache:", e?.message || e);
  _db = initializeFirestore(app, {});
}
export const db = _db;
export const auth = getAuth(app);

// Local test environment (`vite --mode emulator`, see .env.emulator and
// compose.yaml): talk to the Firebase Emulator Suite instead of the real
// project. The emulator host defaults to the host serving the app, so a tablet
// on the LAN opening http://<dev-machine>:5173 reaches the emulators too.
export const USE_EMULATOR = env.VITE_USE_EMULATOR === "true";
export const EMULATOR_HOST = env.VITE_EMULATOR_HOST || (typeof location !== "undefined" ? location.hostname : "localhost");
export const FIRESTORE_EMULATOR_PORT = Number(env.VITE_FIRESTORE_EMULATOR_PORT) || 8080;
if (USE_EMULATOR) {
  // Never let the test environment reach a real project: Firebase treats
  // "demo-*" ids as offline-only, so a misconfigured env fails loudly instead.
  if (!firebaseConfig.projectId.startsWith("demo-")) {
    throw new Error(`Emulator mode requires a "demo-*" project id, got "${firebaseConfig.projectId}".`);
  }
  connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${Number(env.VITE_AUTH_EMULATOR_PORT) || 9099}`, { disableWarnings: true });
}
export const googleProvider = new GoogleAuthProvider();
// Always show Google's account chooser instead of silently reusing the one
// signed-in account — organizers/officials often have several accounts.
googleProvider.setCustomParameters({ prompt: "select_account" });
