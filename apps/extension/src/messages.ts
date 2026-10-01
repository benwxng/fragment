import type { Reference } from '@refer/capture';
import type { CloudState } from './cloud/types';

export type ExtensionMessage =
  | { type: 'capture-visible-tab' }
  | { type: 'save-reference'; reference: Reference; expectedUserId?: string }
  | { type: 'delete-reference'; id: string; expectedUserId?: string }
  | { type: 'open-library' }
  | { type: 'get-cloud-state' }
  | { type: 'cloud-sign-in' }
  | { type: 'cloud-sign-out' }
  | { type: 'list-references' }
  | { type: 'import-legacy' };

export type ExtensionResponse =
  | { ok: true; imageDataUrl?: string; cloudState?: CloudState; references?: Reference[]; userId?: string; imported?: number }
  | { ok: false; error: string };
