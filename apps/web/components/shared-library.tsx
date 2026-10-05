'use client';

import { useEffect, useRef } from 'react';
import { mountLibrary, libraryTemplate } from '@refer/capture/library';
import type { LibraryViewState } from '@refer/capture/library/types';
import { webLibraryAdapter } from '@/lib/library-adapter';
import { demoLibraryAdapter } from '@/lib/demo-library-adapter';

const markup = libraryTemplate.replace('href="./index.html"', 'href="/library"');
// Keep this prop's identity stable: React otherwise rewrites innerHTML on a
// rerender, detaching the DOM, listeners and animations owned by mountLibrary.
const initialHTML = { __html: markup };

export function LibraryLoading() {
  return <div className="glance-library" dangerouslySetInnerHTML={initialHTML} />;
}

export function SharedLibrary({ initialReferenceId, demo = false }: { initialReferenceId?: string; demo?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  // React preserves refs during Fast Refresh, unlike effect-local renderer state.
  const viewState = useRef<LibraryViewState>({});
  useEffect(() => {
    if (!root.current) return;
    const adapter = (demo ? demoLibraryAdapter : webLibraryAdapter)(initialReferenceId);
    adapter.viewState = viewState.current;
    return mountLibrary(root.current, adapter);
  }, [initialReferenceId, demo]);
  return <div ref={root} className="glance-library" dangerouslySetInnerHTML={initialHTML} />;
}
