import { redirect } from 'next/navigation';

import { ConfigurationScreen } from '@/components/configuration';
import { isNeonConfigured } from '@/lib/config';

export default function HomePage() {
  if (!isNeonConfigured()) return <ConfigurationScreen />;
  redirect('/library');
}
