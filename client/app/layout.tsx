import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NextDesk — AI Support for Next.js Developers',
  description:
    'Instant, AI-powered answers to all your Next.js questions, backed by the official documentation with real-time citations.',
  keywords: ['Next.js', 'AI support', 'developer support', 'RAG', 'documentation'],
  openGraph: {
    title: 'NextDesk — AI Support for Next.js Developers',
    description: 'Instant AI-powered Next.js support with documentation citations.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        {children}
      </body>
    </html>
  );
}
