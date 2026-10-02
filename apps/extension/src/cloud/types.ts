export type CloudAuthStatus = 'unavailable' | 'signed-out' | 'signed-in';

export interface CloudState {
  configured: boolean;
  authStatus: CloudAuthStatus;
  email: string | null;
  image?: string | null;
  userId: string | null;
  legacyCount: number;
  legacyBlocked: boolean;
}
