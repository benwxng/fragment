import Link from 'next/link';

import { MarkIcon } from '@/components/icons';

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Glance home">
      <MarkIcon className="brand-mark" />
    </Link>
  );
}
