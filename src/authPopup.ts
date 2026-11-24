import { GoogleAuthProvider, linkWithPopup, signInWithPopup } from 'firebase/auth';
import { getFirebase } from './services/firebase/client';
import { GOOGLE_AUTH_CHANNEL } from './services/firebase/googleChannel';

const status = document.querySelector<HTMLParagraphElement>('#status');
const button = document.querySelector<HTMLButtonElement>('#continue');
const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'link' ? 'link' : 'signin';
let finished = false;

const say = (text: string) => {
  if (status) status.textContent = text;
};

const messageFor = (error: unknown): string => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in was cancelled.';
  }
  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the Google window. Allow popups for this site and try again.';
  }
  if (code === 'auth/account-exists-with-different-credential' || code === 'auth/credential-already-in-use') {
    return 'That Google email already belongs to a password account. Sign in with email, then connect Google from the Account menu.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This site is not an authorized domain in Firebase Authentication settings.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'That sign-in method is turned off in the Firebase console.';
  }
  return error instanceof Error ? error.message : 'Google sign-in failed.';
};

const attempt = params.get('attempt') ?? '';

const report = (payload: { ok: boolean; message?: string }) => {
  const channel = new BroadcastChannel(GOOGLE_AUTH_CHANNEL);
  channel.postMessage({ ...payload, attempt });
  channel.close();
};

say(mode === 'link'
  ? 'Connect Google to the account you are already using.'
  : 'Sign in to dnd character system with Google.');

window.addEventListener('pagehide', () => {
  if (!finished) report({ ok: false, message: 'Google sign-in was cancelled.' });
});

button?.addEventListener('click', () => {
  button.disabled = true;
  say('Opening Google…');
  void (async () => {
    const firebase = getFirebase();
    if (!firebase) {
      const message = 'Cloud save is not configured.';
      say(message);
      finished = true;
      report({ ok: false, message });
      button.disabled = false;
      return;
    }
    try {
      await firebase.auth.authStateReady();
      const provider = new GoogleAuthProvider();
      if (mode === 'link') {
        const user = firebase.auth.currentUser;
        if (!user) throw new Error('Sign in before connecting Google.');
        await linkWithPopup(user, provider);
      } else {
        await signInWithPopup(firebase.auth, provider);
      }
      finished = true;
      report({ ok: true });
      say('Google is connected. You can close this window.');
      window.setTimeout(() => window.close(), 300);
    } catch (error) {
      const message = messageFor(error);
      say(message);
      finished = true;
      report({ ok: false, message });
      button.disabled = false;
    }
  })();
});
