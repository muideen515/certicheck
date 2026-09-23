import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Certicheck Reference Architecture',
  description: 'Reference architecture for public application, admin review, and issuer certificate issuance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
