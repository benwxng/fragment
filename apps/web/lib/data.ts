import { redirect } from 'next/navigation';

import { REFERENCE_SCREENSHOTS_BUCKET, type CaptureRow } from '@refer/database';

import { normalizeCapture, type CaptureView } from '@/lib/captures';
import { createClient } from '@/lib/supabase/server';

export async function authenticatedLibrary() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) redirect('/login');
  return { supabase, claims: claimsData.claims };
}

async function signedScreenshotUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await supabase.storage.from(REFERENCE_SCREENSHOTS_BUCKET).createSignedUrls(paths, 60 * 60);
  return new Map(
    (data ?? []).flatMap((item) => item.signedUrl && item.path ? [[item.path, item.signedUrl] as const] : []),
  );
}

export async function listCaptures(): Promise<{ captures: CaptureView[]; email: string }> {
  const { supabase, claims } = await authenticatedLibrary();
  const { data, error } = await supabase
    .from('captures')
    .select('id, user_id, facets, source_url, source_origin, page_title, element_label, primary_font_family, text_color, background_color, screenshot_path, snapshot_version, snapshot, note, favorite, collection_id, captured_at, created_at, updated_at, search_document')
    .order('captured_at', { ascending: false })
    .limit(500);

  if (error) throw new Error('Unable to load references. Check the captures table and its access policies.');
  const rows = (data ?? []) as CaptureRow[];
  const paths = rows.flatMap((row) => row.screenshot_path ? [row.screenshot_path] : []);
  const signedUrls = await signedScreenshotUrls(supabase, paths);
  const captures = rows.map((row) => normalizeCapture(row, row.screenshot_path ? signedUrls.get(row.screenshot_path) ?? null : null));
  const email = typeof claims.email === 'string' ? claims.email : 'Signed in';
  return { captures, email };
}

export async function getCapture(id: string): Promise<{ capture: CaptureView | null; email: string }> {
  const { supabase, claims } = await authenticatedLibrary();
  const { data, error } = await supabase
    .from('captures')
    .select('id, user_id, facets, source_url, source_origin, page_title, element_label, primary_font_family, text_color, background_color, screenshot_path, snapshot_version, snapshot, note, favorite, collection_id, captured_at, created_at, updated_at, search_document')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error('Unable to load this reference. Check your connection and try again.');
  if (!data) return { capture: null, email: typeof claims.email === 'string' ? claims.email : 'Signed in' };

  const row = data as CaptureRow;
  const signedUrls = await signedScreenshotUrls(supabase, row.screenshot_path ? [row.screenshot_path] : []);
  return {
    capture: normalizeCapture(row, row.screenshot_path ? signedUrls.get(row.screenshot_path) ?? null : null),
    email: typeof claims.email === 'string' ? claims.email : 'Signed in',
  };
}
