import type { Metadata } from 'next';
import { SharedLibrary } from '@/components/shared-library';
import { ConfigurationScreen } from '@/components/configuration';
import { isNeonConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reference detail' };

export default async function ReferencePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const demo = !isNeonConfigured() && (await searchParams).demo === '1';
  if (!isNeonConfigured() && !demo) return <ConfigurationScreen />;
  return <SharedLibrary initialReferenceId={(await params).id} demo={demo} />;
}
