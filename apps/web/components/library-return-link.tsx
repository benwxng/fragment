'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function LibraryReturnLink({ className }: { className: string }) {
  const searchParams = useSearchParams();
  const href = searchParams.get('demo') === '1' ? '/library?demo=1' : '/library';

  return <Link className={className} href={href}>Return to the library</Link>;
}
