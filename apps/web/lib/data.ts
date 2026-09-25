import type { CaptureRow } from '@refer/database';
import { normalizeCapture, type CaptureView } from '@/lib/captures';
import { api, ApiError } from '@/lib/api';
type RemoteCapture = CaptureRow & { screenshot_url: string | null };
export async function listCaptures(): Promise<{ captures: CaptureView[]; email: string }> {
  const [{ captures }, { user }] = await Promise.all([
    api<{ captures: RemoteCapture[] }>('/captures'), api<{ user: { email: string } }>('/me'),
  ]);
  return { captures: captures.map(row => normalizeCapture(row, row.screenshot_url)), email: user.email };
}
export async function getCapture(id: string): Promise<{ capture: CaptureView | null; email: string }> {
  const { user } = await api<{ user: { email: string } }>('/me');
  try {
    const { capture } = await api<{ capture: RemoteCapture }>(`/captures/${encodeURIComponent(id)}`);
    return { capture: normalizeCapture(capture, capture.screenshot_url), email: user.email };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return { capture: null, email: user.email };
    throw error;
  }
}
