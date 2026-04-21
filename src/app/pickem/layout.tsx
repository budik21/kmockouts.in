import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Pick'em — World Cup 2026",
  description: 'Predict exact match scores for the FIFA World Cup 2026 group stage and compete with others.',
};

export default function PickemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
