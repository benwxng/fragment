import type { Reference } from '../types';

export interface LibraryAccount {
  configured: boolean;
  authStatus: 'unavailable' | 'signed-out' | 'signed-in';
  email: string | null;
  image?: string | null;
  userId: string | null;
  legacyCount: number;
  legacyBlocked: boolean;
}
export type LibraryRequest =
  | { type: 'get-cloud-state' | 'cloud-sign-in' | 'cloud-sign-out' | 'list-references' | 'import-legacy' }
  | { type: 'save-reference'; reference: Reference; expectedUserId?: string }
  | { type: 'delete-reference'; id: string; expectedUserId?: string };
export type LibraryResponse =
  | { ok: true; redirecting?: boolean; cloudState?: LibraryAccount; references?: Reference[]; userId?: string; imported?: number }
  | { ok: false; error: string; resetLibrary?: boolean };
/** In-memory view state owned by a mounted app, never persisted to disk. */
export interface LibraryViewState {
  account?: LibraryAccount;
  references?: Reference[];
}
export interface LibraryAdapter {
  homeUrl: string;
  initialReferenceId?: string;
  viewState?: LibraryViewState;
  request(message: LibraryRequest): Promise<LibraryResponse>;
  subscribe?(refresh: (accountChanged: boolean) => void): () => void;
}
