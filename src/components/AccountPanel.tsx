import React, { useState, useSyncExternalStore } from 'react';
import { Cloud, LogOut } from 'lucide-react';
import {
  getCloudStatus,
  signInWithGoogle,
  signOutAccount,
  subscribeCloudStatus,
} from '../services/firebase/characterCloud';

/** Signed-in account menu. Sign-in itself happens on the CloudGate screen. */
export const AccountPanel: React.FC = () => {
  const status = useSyncExternalStore(subscribeCloudStatus, getCloudStatus, getCloudStatus);
  const [open, setOpen] = useState(false);

  if (!status.account) return null;

  return (
    <div className="relative w-full md:w-auto">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="w-full md:w-auto px-4 py-3 bg-theme-quaternary hover:bg-theme-hover rounded-xl text-white font-bold shadow-theme-lg shadow-lg transition-all flex items-center justify-center"
        title="Cloud account"
      >
        <Cloud className="w-5 h-5 mr-2" />
        Account
      </button>
      {open && (
        <div className="mt-2 md:absolute md:right-0 md:mt-2 md:w-80 z-50 bg-theme-secondary border border-theme-primary rounded-xl p-4 shadow-xl space-y-3">
          <p className="text-sm text-theme-tertiary break-all">{status.account.email}</p>
          <p className="text-xs text-theme-muted">Edits and deletions on a character sheet are saved to this account as they happen.</p>
          {!status.account.providers.includes('google.com') && (
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
              Connect Google
            </button>
          )}
          <button
            type="button"
            onClick={() => signOutAccount()}
            className="w-full px-3 py-2 bg-theme-quaternary hover:bg-theme-hover rounded-lg text-white text-sm flex items-center justify-center"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </button>
          {status.syncing && <p className="text-xs text-theme-muted">Working…</p>}
          {status.lastError && <p className="text-xs text-accent-yellow-light">{status.lastError}</p>}
          {!status.lastError && status.lastMessage && <p className="text-xs text-theme-muted">{status.lastMessage}</p>}
        </div>
      )}
    </div>
  );
};
