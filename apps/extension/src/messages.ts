import type { Reference } from '@refer/capture';
import type { CloudState } from './cloud/types';

export type ExtensionMessage =
  | { type: 'capture-visible-tab' }
  | { type: 'save-reference'; reference: Reference }
  | { type: 'delete-reference'; id: string }
  | { type: 'open-library' }
  | { type: 'get-cloud-state' }
  | { type: 'cloud-sign-in'; email: string; password: string }
  | { type: 'cloud-sign-out' }
  | { type: 'sync-now' };

export type ExtensionResponse =
  | { ok: true; imageDataUrl?: string; cloudState?: CloudState }
  | { ok: false; error: string };
