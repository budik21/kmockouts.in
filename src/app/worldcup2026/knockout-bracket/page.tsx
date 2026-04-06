import { Metadata } from 'next';
import KnockoutBracket from '@/app/components/KnockoutBracket';

export const metadata: Metadata = {
  title: 'Knockout Bracket — FIFA World Cup 2026',
  description:
    'Interactive knockout bracket for the FIFA World Cup 2026. Track the Round of 32, Round of 16, Quarterfinals, Semifinals, and Final.',
};

export default function KnockoutBracketPage() {
  return (
    <main className="container py-4">
      <h1 className="page-title mb-1">Knockout Bracket</h1>
      <p className="text-muted mb-4">
        FIFA World Cup 2026 &mdash; Round of 32 to Final
      </p>
      <KnockoutBracket />
    </main>
  );
}
