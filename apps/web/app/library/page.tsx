import type { Metadata } from 'next';
import { ConfigurationScreen } from '@/components/configuration';
import { SharedLibrary } from '@/components/shared-library';
import { isNeonConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reference library' };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const demo = !isNeonConfigured() && (await searchParams).demo === '1';
  if (!isNeonConfigured() && !demo) return <ConfigurationScreen />;
  return <SharedLibrary demo={demo} />;
}
