'use client';

import { useState } from 'react';
import TeamFlag from './TeamFlag';

interface TeamSummary {
  teamId: number;
  teamName: string;
  teamShort: string;
  countryCode: string;
  groupId: string;
  qualProbability: number;
  summaryHtml: string;
}

interface BestThirdSummariesProps {
  teams: TeamSummary[];
}

/** 5-shade green scale: low probability = light, high = dark */
function probStyle(prob: number): { background: string; color: string } {
  if (prob >= 80) return { background: '#0a5c2f', color: '#ffffff' };
  if (prob >= 60) return { background: '#1a7a3a', color: '#ffffff' };
  if (prob >= 40) return { background: '#2e9e4e', color: '#ffffff' };
  if (prob >= 20) return { background: '#4db86a', color: '#1a3a1a' };
  return { background: '#7ed69a', color: '#1a3a1a' };
}

export default function BestThirdSummaries({ teams }: BestThirdSummariesProps) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (teams.length === 0) return null;

  const toggle = (id: number) => {
    setOpenId(prev => prev === id ? null : id);
  };

  return (
    <div className="group-card mb-4">
      <div className="group-card-header">
        <span>Qualification Outlook</span>
      </div>
      <div className="group-card-body p-0">
        <div className="b3-accordion">
          {teams.map((t) => {
            const isOpen = openId === t.teamId;
            return (
              <div key={t.teamId} className={`b3-accordion-item${isOpen ? ' b3-open' : ''}`}>
                <button
                  className="b3-accordion-header"
                  onClick={() => toggle(t.teamId)}
                  aria-expanded={isOpen}
                >
                  <TeamFlag countryCode={t.countryCode} />
                  <span className="b3-accordion-name">{t.teamName}</span>
                  <span className="b3-accordion-group">Group {t.groupId}</span>
                  <span
                    className="badge ms-auto"
                    style={{ ...probStyle(t.qualProbability), fontSize: '0.8rem', minWidth: '48px' }}
                  >
                    {t.qualProbability.toFixed(1)}%
                  </span>
                  <span className={`b3-accordion-chevron${isOpen ? ' b3-chevron-open' : ''}`}>&#9662;</span>
                </button>
                {isOpen && (
                  <div
                    className="b3-accordion-body"
                    dangerouslySetInnerHTML={{ __html: t.summaryHtml }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
