'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Keep the account library current when another surface saves or deletes a reference. */
export function LibraryRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (!document.hidden && navigator.onLine) router.refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);
  return null;
}
