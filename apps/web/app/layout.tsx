import type { Metadata } from 'next';
import { InterfaceMotion } from '@/components/interface-motion';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Glance — Design reference library', template: '%s — Glance' },
  description: 'A private visual library for typography, components, color, and layout references.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <InterfaceMotion />
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
