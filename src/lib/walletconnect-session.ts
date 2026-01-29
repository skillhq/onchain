// WalletConnect session persistence

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { WalletConnectSession } from './walletconnect-types.js';

const SESSION_FILE = join(homedir(), '.config', 'onchain', 'walletconnect-session.json');

export function loadSession(): WalletConnectSession | null {
  if (!existsSync(SESSION_FILE)) {
    return null;
  }

  try {
    const raw = readFileSync(SESSION_FILE, 'utf8');
    const session = JSON.parse(raw) as WalletConnectSession;

    // Check if session has expired
    if (session.expiry && Date.now() > session.expiry * 1000) {
      // Session expired, clean up
      deleteSession();
      return null;
    }

    return session;
  } catch {
    // Invalid session file, remove it
    deleteSession();
    return null;
  }
}

export function saveSession(session: WalletConnectSession): void {
  const dir = dirname(SESSION_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
}

export function deleteSession(): void {
  if (existsSync(SESSION_FILE)) {
    try {
      unlinkSync(SESSION_FILE);
    } catch {
      // Ignore errors during cleanup
    }
  }
}

export function getSessionPath(): string {
  return SESSION_FILE;
}
