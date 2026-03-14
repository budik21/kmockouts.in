/**
 * Renders a country flag using the flag-icons CSS library.
 * Handles ISO 3166-1 alpha-2 codes (e.g. "MX") and
 * ISO 3166-2 subdivision codes (e.g. "GB-SCT", "GB-ENG").
 */

interface TeamFlagProps {
  countryCode: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function TeamFlag({ countryCode, size = 'sm', className = '' }: TeamFlagProps) {
  if (!countryCode) {
    return <span className={`team-flag team-flag-${size} team-flag-placeholder ${className}`}>?</span>;
  }

  // flag-icons uses lowercase codes; subdivisions like "GB-SCT" become "gb-sct"
  const code = countryCode.toLowerCase();

  const sizeClass = size === 'lg' ? 'team-flag-lg' : size === 'md' ? 'team-flag-md' : 'team-flag-sm';

  return (
    <span className={`fi fi-${code} team-flag ${sizeClass} ${className}`} title={countryCode} />
  );
}
