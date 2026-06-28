'use client';

import { useState } from 'react';
import SliderToggle from '@/app/admin/components/SliderToggle';
import FixturesCalendar, { type FixtureItem } from './FixturesCalendar';
import PlayoffFixturesCalendar from './PlayoffFixturesCalendar';
import type { PlayoffFixture } from '@/lib/playoff-data';

type Stage = 'groups' | 'playoff';

interface Props {
  groupFixtures: FixtureItem[];
  playoffFixtures: PlayoffFixture[];
}

/** Fixtures page body: a Groups/Play-Off slider above the matching calendar.
 *  Defaults to Play-Off. */
export default function FixturesView({ groupFixtures, playoffFixtures }: Props) {
  const [stage, setStage] = useState<Stage>('playoff');

  return (
    <div>
      <div className="d-flex justify-content-center mb-4">
        <SliderToggle<Stage>
          ariaLabel="Fixtures stage"
          value={stage}
          onChange={setStage}
          options={[
            { key: 'groups', label: 'Groups' },
            { key: 'playoff', label: 'Play-Off' },
          ]}
        />
      </div>

      {stage === 'groups' ? (
        <FixturesCalendar fixtures={groupFixtures} />
      ) : (
        <PlayoffFixturesCalendar fixtures={playoffFixtures} />
      )}
    </div>
  );
}
