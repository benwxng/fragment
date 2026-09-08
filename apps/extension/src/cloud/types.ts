export type CloudAuthStatus = 'unavailable' | 'signed-out' | 'signed-in';

export interface CloudState {
  configured: boolean;
  authStatus: CloudAuthStatus;
  email: string | null;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

