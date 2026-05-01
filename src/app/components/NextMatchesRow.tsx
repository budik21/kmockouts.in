export interface NextMatchDisplay {
  id: number;
  homeShort: string;
  homeCc: string;
  awayShort: string;
  awayCc: string;
  venue: string;
  dateTimeText: string;
  countdownText: string;
}

interface Props {
  matches: NextMatchDisplay[];
  /** When true, render with larger fonts so the widget can stand on its own
   *  alongside a standings table without an article above it. */
  large?: boolean;
}

function FlagIcon({ code }: { code: string }) {
  if (!code) return null;
  const cls = code.length > 2
    ? `fi fi-${code.slice(0, 2).toLowerCase()} fis fi-${code.toLowerCase()}`
    : `fi fi-${code.toLowerCase()}`;
  return <span className={cls} style={{ width: '1em', height: '0.75em', display: 'inline-block', verticalAlign: 'middle' }} />;
}

export default function NextMatchesRow({ matches, large = false }: Props) {
  if (matches.length === 0) return null;
  return (
    <div className={`next-match-block${large ? ' next-match-block-large' : ''}`}>
      {matches.map((m) => (
        <div key={m.id} className="next-match-item">
          <div className="next-match-teams">
            <FlagIcon code={m.homeCc} />
            <span>{m.homeShort}</span>
            <span className="next-match-vs">vs</span>
            <span>{m.awayShort}</span>
            <FlagIcon code={m.awayCc} />
          </div>
          <div className="next-match-meta">
            {m.venue && <span>{m.venue}</span>}
            <span>{m.dateTimeText}</span>
            {m.countdownText && <span className="next-match-countdown">{m.countdownText}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
