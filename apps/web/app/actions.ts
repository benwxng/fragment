'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { REFERENCE_SCREENSHOTS_BUCKET } from '@refer/database';

import { isSupabaseConfigured } from '@/lib/config';
import type { FormState } from '@/lib/form-state';
import { createClient } from '@/lib/supabase/server';

function credentials(formData: FormData): { email: string; password: string } | FormState {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!/^\S+@\S+\.\S+$/u.test(email)) {
    return { message: 'Enter a valid email address.', status: 'error' };
  }
  if (password.length < 8) {
    return { message: 'Use a password with at least 8 characters.', status: 'error' };
  }
  return { email, password };
}

export async function signIn(_state: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { message: 'Add the Supabase environment variables, then try again.', status: 'error' };
  }
  const values = credentials(formData);
  if ('status' in values) return values;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(values);
  if (error) {
    return { message: 'Unable to sign in. Check your email and password.', status: 'error' };
  }

  redirect('/library');
}

export async function signUp(_state: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { message: 'Add the Supabase environment variables, then try again.', status: 'error' };
  }
  const values = credentials(formData);
  if ('status' in values) return values;

  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || (host ? `${protocol}://${host}` : 'http://localhost:3000');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...values,
    options: { emailRedirectTo: new URL('/auth/callback', origin).toString() },
  });

  if (error) {
    return { message: error.message || 'Unable to create the account. Try again.', status: 'error' };
  }
  if (!data.session) {
    return { message: 'Check your email to confirm your account, then sign in.', status: 'success' };
  }

  redirect('/library');
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect('/login');
}

export async function deleteCapture(
  captureId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  if (!isSupabaseConfigured()) {
    return { message: 'Supabase is not configured, so this reference cannot be deleted.', status: 'error' };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return { message: 'Your session expired. Sign in again before deleting.', status: 'error' };
  }

  const { data: capture, error: readError } = await supabase
    .from('captures')
    .select('screenshot_path')
    .eq('id', captureId)
    .maybeSingle();
  if (readError) return { message: 'Unable to check this reference. Try again.', status: 'error' };

  const screenshotPath = typeof capture?.screenshot_path === 'string' ? capture.screenshot_path : null;
  if (screenshotPath) {
    const { error: storageError } = await supabase.storage
      .from(REFERENCE_SCREENSHOTS_BUCKET)
      .remove([screenshotPath]);
    if (storageError) {
      return { message: 'Unable to delete the captured preview. Try again.', status: 'error' };
    }
  }

  const { error } = await supabase.from('captures').delete().eq('id', captureId);
  if (error) return { message: 'Unable to delete this reference. Try again.', status: 'error' };

  revalidatePath('/library');
  redirect('/library?deleted=1');
}
