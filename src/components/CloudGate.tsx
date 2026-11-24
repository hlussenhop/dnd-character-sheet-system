import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  createAccount,
  getCloudStatus,
  pullCharacters,
  sendPasswordReset,
  signIn,
  signInWithGoogle,
  startCloudAuth,
  subscribeCloudStatus,
} from '../services/firebase/characterCloud';

/** Blocks the app until the signed-in account's characters have been read from Firebase. */
export const CloudGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useSyncExternalStore(subscribeCloudStatus, getCloudStatus, getCloudStatus);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    startCloudAuth();
  }, []);

  const submit = async (mode: 'sign-in' | 'create') => {
    const action = mode === 'sign-in' ? signIn : createAccount;
    try {
      await action(email, password);
      setPassword('');
    } catch {
      // The status store already holds the message.
    }
  };

  if (!status.ready) {
    return (
      <div className="min-h-screen bg-theme-primary text-white flex items-center justify-center">
        <p className="text-theme-tertiary">Checking your account…</p>
      </div>
    );
  }

  if (status.account && status.synced) return <>{children}</>;

  return (
    <div className="min-h-screen bg-theme-primary text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-theme-secondary border border-theme-primary rounded-xl p-6 shadow-xl space-y-4">
        <h1 className="text-2xl font-bold">dnd character system</h1>
        {!status.configured && (
          <p className="text-sm text-theme-tertiary">Cloud save is not configured in this build.</p>
        )}
        {status.configured && !status.account && (
          <>
            <p className="text-sm text-theme-tertiary">
              Sign in to open your characters. This account is where they are stored.
            </p>
            <button
              type="button"
              disabled={status.syncing}
              onClick={() => {
                signInWithGoogle().catch(() => {
                  // The status store already holds the message.
                });
              }}
              className="w-full px-3 py-2 bg-white text-black rounded-lg text-sm font-bold disabled:opacity-50"
            >
              Continue with Google
            </button>
            <p className="text-center text-xs text-theme-muted">or use email</p>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="Email"
              className="w-full p-2 bg-theme-tertiary text-white rounded-lg border border-theme-primary"
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Password"
              className="w-full p-2 bg-theme-tertiary text-white rounded-lg border border-theme-primary"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={status.syncing || !email || !password}
                onClick={() => submit('sign-in')}
                className="flex-1 px-3 py-2 bg-accent-red hover:bg-accent-red-light rounded-lg text-white text-sm disabled:bg-theme-quaternary"
              >
                Sign in
              </button>
              <button
                type="button"
                disabled={status.syncing || !email || !password}
                onClick={() => submit('create')}
                className="flex-1 px-3 py-2 bg-theme-quaternary hover:bg-theme-hover rounded-lg text-white text-sm disabled:opacity-50"
              >
                Create account
              </button>
            </div>
            <button
              type="button"
              disabled={status.syncing || !email}
              onClick={() => {
                sendPasswordReset(email).catch(() => {
                  // The status store already holds the message.
                });
              }}
              className="w-full text-sm text-theme-tertiary hover:text-white disabled:opacity-50"
            >
              Forgot password
            </button>
          </>
        )}
        {status.account && !status.synced && !status.lastError && (
          <p className="text-sm text-theme-tertiary">Loading characters from your account…</p>
        )}
        {status.account && !status.synced && status.lastError && (
          <button
            type="button"
            disabled={status.syncing}
            onClick={() => pullCharacters()}
            className="w-full px-3 py-2 bg-accent-red hover:bg-accent-red-light rounded-lg text-white text-sm disabled:bg-theme-quaternary"
          >
            Try again
          </button>
        )}
        {status.syncing && <p className="text-xs text-theme-muted">Working…</p>}
        {status.lastError && <p className="text-xs text-accent-yellow-light">{status.lastError}</p>}
        {!status.lastError && status.lastMessage && <p className="text-xs text-theme-muted">{status.lastMessage}</p>}
      </div>
    </div>
  );
};
