import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Polymarket Smart Traders',
  description:
    'Track high-conviction trades from Polymarket smart money wallets curated by Nansen.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-polymarket-sky font-sans text-slate-900">
        {children}
      </body>
    </html>
  );
}
