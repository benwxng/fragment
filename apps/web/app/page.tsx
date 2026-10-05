import { redirect } from 'next/navigation';

import { ConfigurationScreen } from '@/components/configuration';
import { isNeonConfigured } from '@/lib/config';
import { pageSession } from '@/lib/auth/page-session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (!isNeonConfigured()) return <ConfigurationScreen />;
  await pageSession();
  redirect('/library');
}
