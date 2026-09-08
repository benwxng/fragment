import { redirect } from 'next/navigation';

import { ConfigurationScreen } from '@/components/configuration';
import { isSupabaseConfigured } from '@/lib/config';

export default function HomePage() {
  if (!isSupabaseConfigured()) return <ConfigurationScreen />;
  redirect('/library');
}
