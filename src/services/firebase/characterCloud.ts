import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { get, onValue, ref, remove, set, type DataSnapshot } from 'firebase/database';
import type { Character } from '../../types/dnd';
import { normalizeCharacter } from '../../utils/normalizeCharacter';
import { IndexedDbAdapter } from '../storage/IndexedDbAdapter';
import { getFirebase } from './client';
import { CHARACTERS_CHANGED } from './events';
import { GOOGLE_AUTH_CHANNEL } from './googleChannel';

export interface CloudAccount {
  uid: string;
  email: string;
  providers: string[];
}

export interface CloudStatus {
  configured: boolean;
  /** The first auth callback has settled. */
  ready: boolean;
  account: CloudAccount | null;
  syncing: boolean;
  /** This account's characters have been read from Firebase once. */
  synced: boolean;
  lastError: string | null;
  lastMessage: string | null;
}

const listeners = new Set<() => void>();
let status: CloudStatus = {
  configured: false,
  ready: false,
  account: null,
  syncing: false,
  synced: false,
  lastError: null,
  lastMessage: null,
};
let authStarted = false;

const emit = () => listeners.forEach(listener => listener());

const patch = (next: Partial<CloudStatus>) => {
  status = { ...status, ...next };
  emit();
};

export function getCloudStatus(): CloudStatus {
  return status;
}

export function subscribeCloudStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const accountOf = (user: User | null): CloudAccount | null =>
  user ? {
    uid: user.uid,
    email: user.email ?? user.uid,
    providers: user.providerData.map(provider => provider.providerId),
  } : null;

const messageFor = (error: unknown): string => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Email or password did not match.';
  }
  if (code === 'auth/email-already-in-use') return 'An account with that email already exists. Sign in instead.';
  if (code === 'auth/weak-password') return 'Use a password of at least 6 characters.';
  if (code === 'auth/invalid-email') return 'That email address is not valid.';
  if (code === 'PERMISSION_DENIED' || code.includes('permission-denied')) {
    return 'The database refused the request. Publish rules that allow a signed-in user to read and write only users/{their uid}.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'That sign-in method is turned off in the Firebase console.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This site is not an authorized domain in Firebase Authentication settings.';
  }
  if (code === 'auth/account-exists-with-different-credential' || code === 'auth/credential-already-in-use') {
    return 'That Google email already belongs to a password account. Sign in with email, then connect Google from the Account menu.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in was cancelled.';
  }
  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the Google window. Allow popups for this site and try again.';
  }
  return error instanceof Error ? error.message : 'Cloud save failed.';
};

/** Realtime Database rejects undefined. Drop those fields before writing. */
export function jsonReady(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonReady);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, jsonReady(entry)]),
    );
  }
  return value;
}

const requireAccount = () => {
  const firebase = getFirebase();
  const uid = firebase?.auth.currentUser?.uid;
  if (!firebase || !uid) throw new Error('Sign in before using characters.');
  return { firebase, uid };
};

const characterPath = (uid: string, id?: string) =>
  id ? `users/${uid}/characters/${id}` : `users/${uid}/characters`;

let watchedUid: string | null = null;
let unsubscribeCharacters: (() => void) | null = null;
let characterCache: Character[] | null = null;
const writeQueue = new Map<string, Promise<void>>();
/** Writes the listener has not confirmed yet. A stale snapshot must not drop them. */
const heldWrites = new Map<string, Character>();
const heldDeletes = new Set<string>();

const signature = (characters: Character[]) =>
  characters.map(character => `${character.id}:${character.updatedAt ?? ''}`).sort().join('|');

const readList = (value: unknown): Character[] => {
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, Character>)
    .filter(character => Boolean(character?.id))
    .map(character => normalizeCharacter(character));
};

const publishCharacters = (next: Character[]) => {
  const changed = signature(characterCache ?? []) !== signature(next);
  characterCache = next;
  if (changed) window.dispatchEvent(new Event(CHARACTERS_CHANGED));
};

/** Fold a server snapshot together with saves and deletes it does not show yet. */
const applyRemoteCharacters = (remote: Character[]) => {
  const merged = new Map(remote.map(character => [character.id, character]));
  for (const id of heldDeletes) {
    if (remote.some(character => character.id === id)) merged.delete(id);
    else heldDeletes.delete(id);
  }
  for (const [id, local] of heldWrites) {
    const incoming = merged.get(id);
    if (incoming && (incoming.updatedAt ?? '') >= (local.updatedAt ?? '')) heldWrites.delete(id);
    else merged.set(id, local);
  }
  publishCharacters([...merged.values()]);
};

const enqueueWrite = (id: string, task: () => Promise<void>): Promise<void> => {
  const previous = writeQueue.get(id) ?? Promise.resolve();
  const next = previous.then(task, task);
  writeQueue.set(id, next);
  return next.finally(() => {
    if (writeQueue.get(id) === next) writeQueue.delete(id);
  });
};

const stopCharacterWatch = () => {
  unsubscribeCharacters?.();
  unsubscribeCharacters = null;
  watchedUid = null;
  characterCache = null;
  heldWrites.clear();
  heldDeletes.clear();
};

const fetchCharacters = async (uid: string): Promise<Character[]> => {
  const firebase = getFirebase();
  if (!firebase) return [];
  const snapshot = await get(ref(firebase.db, characterPath(uid)));
  return readList(snapshot.val());
};

/** Keep the signed-in account's characters live. Edits and deletions arrive on their own. */
const watchCharacters = (uid: string) => {
  if (watchedUid === uid && unsubscribeCharacters) return;
  stopCharacterWatch();
  const firebase = getFirebase();
  if (!firebase) return;
  watchedUid = uid;
  unsubscribeCharacters = onValue(
    ref(firebase.db, characterPath(uid)),
    (snapshot: DataSnapshot) => {
      applyRemoteCharacters(readList(snapshot.val()));
      if (!status.synced) {
        const count = characterCache?.length ?? 0;
        patch({
          syncing: false,
          synced: true,
          lastError: null,
          lastMessage: count > 0
            ? `Loaded ${count} saved character${count === 1 ? '' : 's'}.`
            : 'No characters saved to this account yet.',
        });
      }
    },
    (error) => {
      unsubscribeCharacters = null;
      watchedUid = null;
      patch({ syncing: false, synced: false, lastError: messageFor(error) });
    },
  );
};

/** Move browser-only characters into the account once, without touching records already stored there. */
const migrateLocalCharacters = async (remoteIds: Set<string>) => {
  let local: Character[] = [];
  try {
    local = await new IndexedDbAdapter().getAllCharacters();
  } catch {
    return;
  }
  const localDb = new IndexedDbAdapter();
  for (const character of local) {
    if (!remoteIds.has(character.id)) {
      const { firebase, uid } = requireAccount();
      await set(ref(firebase.db, characterPath(uid, character.id)), jsonReady(character));
    }
    await localDb.deleteCharacter(character.id);
  }
};

/** Characters saved on this account. Empty when nobody is signed in. */
export async function listCharacters(): Promise<Character[]> {
  const firebase = getFirebase();
  const uid = firebase?.auth.currentUser?.uid;
  if (!firebase || !uid) return [];
  if (characterCache && watchedUid === uid) return characterCache;
  return fetchCharacters(uid);
}

/** Write one character immediately. Later edits for the same character wait their turn. */
export async function saveCharacter(character: Character): Promise<void> {
  await enqueueWrite(character.id, async () => {
    const { firebase, uid } = requireAccount();
    await set(ref(firebase.db, characterPath(uid, character.id)), jsonReady(character));
  });
  heldDeletes.delete(character.id);
  heldWrites.set(character.id, character);
  if (!characterCache) return;
  const exists = characterCache.some(item => item.id === character.id);
  publishCharacters(exists
    ? characterCache.map(item => item.id === character.id ? character : item)
    : [...characterCache, character]);
}

/** Remove one character from the account as soon as it is deleted. */
export async function removeCharacter(id: string): Promise<void> {
  await enqueueWrite(id, async () => {
    const { firebase, uid } = requireAccount();
    await remove(ref(firebase.db, characterPath(uid, id)));
  });
  heldWrites.delete(id);
  heldDeletes.add(id);
  if (!characterCache) return;
  publishCharacters(characterCache.filter(character => character.id !== id));
}

/** Subscribe to this account and load its characters. */
export async function pullCharacters(): Promise<number> {
  const firebase = getFirebase();
  const uid = firebase?.auth.currentUser?.uid;
  if (!firebase || !uid) return 0;
  patch({ syncing: true, lastError: null });
  try {
    const existing = await fetchCharacters(uid);
    await migrateLocalCharacters(new Set(existing.map(character => character.id)));
    watchCharacters(uid);
    return existing.length;
  } catch (error) {
    patch({ syncing: false, synced: false, lastError: messageFor(error) });
    return 0;
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const firebase = getFirebase();
  if (!firebase) throw new Error('Cloud save is not configured.');
  patch({ syncing: true, lastError: null });
  try {
    await signInWithEmailAndPassword(firebase.auth, email.trim(), password);
    patch({ syncing: false });
  } catch (error) {
    patch({ syncing: false, lastError: messageFor(error) });
    throw error;
  }
}

export async function createAccount(email: string, password: string): Promise<void> {
  const firebase = getFirebase();
  if (!firebase) throw new Error('Cloud save is not configured.');
  patch({ syncing: true, lastError: null });
  try {
    await createUserWithEmailAndPassword(firebase.auth, email.trim(), password);
    patch({ syncing: false });
  } catch (error) {
    patch({ syncing: false, lastError: messageFor(error) });
    throw error;
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  const firebase = getFirebase();
  if (!firebase) throw new Error('Cloud save is not configured.');
  patch({ syncing: true, lastError: null, lastMessage: null });
  try {
    await sendPasswordResetEmail(firebase.auth, email.trim());
    patch({
      syncing: false,
      lastError: null,
      lastMessage: 'Password reset email sent. Open the link in that message, then sign in here.',
    });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    const message = code === 'auth/user-not-found' ? 'No account uses that email.' : messageFor(error);
    patch({ syncing: false, lastError: message });
    throw error;
  }
}

/**
 * Google has to run in a separate window. This page's dice headers keep SharedArrayBuffer working
 * and also stop a Google popup opened here from sending the result back.
 */
const finishGoogleInWindow = (mode: 'link' | 'signin') => new Promise<void>((resolve, reject) => {
  const attempt = String(Date.now());
  const popup = window.open(
    `/auth.html?mode=${mode}&attempt=${attempt}`,
    'dnd-character-sheet-system-google',
    'popup,width=420,height=640',
  );
  if (!popup) {
    reject(new Error('The browser blocked the Google window. Allow popups for this site and try again.'));
    return;
  }
  try {
    popup.focus();
  } catch {
    // The opener link can drop once the other window loads. It is still open.
  }
  const channel = new BroadcastChannel(GOOGLE_AUTH_CHANNEL);
  const timeout = window.setTimeout(() => {
    cleanup();
    reject(new Error('Google sign-in was cancelled.'));
  }, 3 * 60 * 1000);
  const cleanup = () => {
    window.clearTimeout(timeout);
    channel.close();
  };
  channel.onmessage = (event: MessageEvent<{ ok?: boolean; message?: string; attempt?: string }>) => {
    if (!event.data || event.data.attempt !== attempt || typeof event.data.ok !== 'boolean') return;
    cleanup();
    if (event.data.ok) resolve();
    else reject(new Error(event.data.message || 'Google sign-in was cancelled.'));
  };
});

const waitForSignedInUser = async (auth: Auth): Promise<User | null> => {
  if (auth.currentUser) return auth.currentUser;
  return new Promise(resolve => {
    const timeout = window.setTimeout(() => {
      stop();
      resolve(auth.currentUser);
    }, 8000);
    const stop = onAuthStateChanged(auth, next => {
      if (!next) return;
      window.clearTimeout(timeout);
      stop();
      resolve(next);
    });
  });
};

/** Continue with Google, or connect Google to the account that is already signed in. */
export async function signInWithGoogle(): Promise<void> {
  const firebase = getFirebase();
  if (!firebase) throw new Error('Cloud save is not configured.');
  const linking = Boolean(firebase.auth.currentUser);
  patch({
    syncing: true,
    lastError: null,
    lastMessage: 'Continue in the Google window.',
  });
  try {
    await finishGoogleInWindow(linking ? 'link' : 'signin');
    if (linking) {
      await firebase.auth.currentUser?.reload().catch(() => undefined);
      const current = firebase.auth.currentUser;
      if (!current?.providerData.some(entry => entry.providerId === 'google.com')) {
        throw new Error('Google did not connect to this account.');
      }
      patch({
        syncing: false,
        account: accountOf(current),
        lastError: null,
        lastMessage: 'Google is connected to this account.',
      });
      return;
    }
    const signedIn = await waitForSignedInUser(firebase.auth);
    patch({
      syncing: false,
      account: accountOf(signedIn),
      lastError: signedIn ? null : 'Google finished, but this page did not pick up the sign-in. Refresh and try again.',
    });
  } catch (error) {
    patch({ syncing: false, lastError: messageFor(error) });
    throw error;
  }
}

export async function signOutAccount(): Promise<void> {
  const firebase = getFirebase();
  if (!firebase) return;
  await signOut(firebase.auth);
}

/** Restore the signed-in account and pull that account's characters once. */
export { CHARACTERS_CHANGED } from './events';

export function startCloudAuth(): void {
  if (authStarted) return;
  authStarted = true;
  const firebase = getFirebase();
  if (!firebase) {
    patch({ configured: false, ready: true });
    return;
  }
  patch({ configured: true });
  const applyUser = (user: User | null) => {
    const next = accountOf(user);
    const sameUser = status.account?.uid === next?.uid;
    const alreadySynced = sameUser && status.synced;
    const switchedAccount = status.account !== null && status.account.uid !== next?.uid;
    patch({
      account: next,
      configured: true,
      ready: true,
      synced: switchedAccount ? false : alreadySynced,
      ...(switchedAccount ? { lastError: null, lastMessage: null } : {}),
    });
    if (!next || switchedAccount) stopCharacterWatch();
    if (next && !(switchedAccount ? false : alreadySynced)) void pullCharacters();
  };
  onAuthStateChanged(firebase.auth, user => {
    applyUser(user);
    if (!user) return;
    void user.reload().then(() => {
      const current = firebase.auth.currentUser;
      if (current?.uid === user.uid) patch({ account: accountOf(current) });
    }).catch(() => undefined);
  });
  // A Google redirect that never reports back must not keep the signed-in account off the screen.
  const pendingRedirect = getRedirectResult(firebase.auth);
  const timeout = new Promise<'timeout'>(resolve => {
    setTimeout(() => resolve('timeout'), 8000);
  });
  void Promise.race([
    pendingRedirect.then(() => 'done' as const, () => 'error' as const),
    timeout,
  ]).then(outcome => {
    if (outcome === 'timeout' && !status.ready) {
      const user = firebase.auth.currentUser;
      patch({
        ready: true,
        configured: true,
        account: accountOf(user),
        syncing: false,
        lastError: user
          ? 'Google did not finish connecting. You are still signed in.'
          : 'Google sign-in did not finish. Use email, or try Google again.',
      });
      if (user && !status.synced) void pullCharacters();
    }
  });
  void pendingRedirect.then(
    result => {
      patch({
        syncing: false,
        ...(result ? { lastError: null, account: accountOf(result.user) } : {}),
      });
    },
    (error: unknown) => {
      patch({ syncing: false, ready: true, lastError: messageFor(error) });
    },
  );
}
