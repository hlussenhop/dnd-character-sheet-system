import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Database;
}

let client: FirebaseClient | null | undefined;

/** The signed-in Firebase app, or null when the web config is incomplete. */
export function getFirebase(): FirebaseClient | null {
  if (client !== undefined) return client;
  const env = import.meta.env;
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  if (Object.values(config).some(value => !value)) {
    client = null;
    return client;
  }
  const app = initializeApp(config);
  client = { app, auth: getAuth(app), db: getDatabase(app) };
  return client;
}
