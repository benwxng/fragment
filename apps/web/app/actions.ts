'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuth } from '@/lib/auth/server';
import { api } from '@/lib/api';
import { safeReturnTo } from '@/lib/config';
import type { FormState } from '@/lib/form-state';
function credentials(formData: FormData) {
  return { email: String(formData.get('email') ?? '').trim(), password: String(formData.get('password') ?? '') };
}
export async function signIn(_state: FormState, formData: FormData): Promise<FormState> {
  const { error } = await getAuth().signIn.email(credentials(formData));
  if (error) return { status: 'error', message: 'Unable to sign in. Check your email and password, or continue with Google.' };
  redirect(safeReturnTo(formData.get('returnTo')));
}
export async function signUp(_state: FormState, formData: FormData): Promise<FormState> {
  const values = credentials(formData);
  if (!/^\S+@\S+\.\S+$/.test(values.email) || values.password.length < 8) return { status:'error', message:'Enter a valid email and a password with at least 8 characters.' };
  const { error } = await getAuth().signUp.email({ ...values, name: values.email.split('@')[0] || 'Glace user' });
  if (error) return { status: 'error', message: error.message ?? 'Unable to create your account.' };
  redirect(`/verify-email?returnTo=${encodeURIComponent(safeReturnTo(formData.get('returnTo')))}`);
}
export async function signOut(): Promise<void> {
  await getAuth().signOut();
  redirect('/login');
}
export async function deleteCapture(captureId: string, _state: FormState, _formData: FormData): Promise<FormState> {
  await api(`/captures/${encodeURIComponent(captureId)}`, { method: 'DELETE' });
  revalidatePath('/library');
  redirect('/library?deleted=1');
}
