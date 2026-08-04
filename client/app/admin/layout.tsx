import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Dashboard — NextDesk Escalations',
  description:
    'Review and resolve escalated Next.js support tickets that require human intervention.',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
